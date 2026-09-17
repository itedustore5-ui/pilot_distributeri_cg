/**
 * alati/nalog.mjs — otvori ili resetuj nalog na bazi iz .env
 *
 *     node alati\nalog.mjs <email> <uloga> "Ime Prezime" [--lozinka XXX] [--lice N]
 *
 * Primjeri:
 *     node alati\nalog.mjs odg@firma.me bzr "Marko Marković"
 *     node alati\nalog.mjs vozac@firma.me vozac "Dragan Šćepanović" --lozinka Vozac2026xx
 *
 * Uloge: izvodjac · bzr · uprava · operater · vozac
 *
 * Postoji zato što se PRVI nalog odgovornog lica ne može otvoriti iz same
 * aplikacije — nema ko da ga otvori. Sve ostale naloge odgovorno lice otvara
 * samo, na strani „Ljudi" → „Nalozi za prijavu"; ovaj alat je za prvi nalog,
 * za reset zaboravljene lozinke i za brzo postavljanje demo naloga.
 *
 * Ako nalog već postoji — NE pravi drugi, nego mu postavlja novu lozinku
 * i vraća ga u rad. Uloga i ime se osvježe.
 *
 * `--lozinka` postavlja lozinku bez obaveze da je korisnik mijenja pri prvoj
 * prijavi. Bez nje se pravi nasumična i korisnik je mijenja odmah.
 * Za demo koristi `--lozinka`; za pravog klijenta NE koristi.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import { pool, upit } from '../server/db.js';
import { hesirajLozinku } from '../server/auth.js';

const ULOGE = ['izvodjac', 'bzr', 'uprava', 'operater', 'vozac'];
const OPIS = {
  izvodjac: 'konsultant — sve, uključujući komandnu tablu',
  bzr:      'odgovorno lice za bezbjednost hrane — sve o hrani',
  uprava:   'direktor — samo zbirni izvještaj, bez unosa',
  operater: 'magacin — prijem i dnevni zapisi, posljednja dva dana',
  vozac:    'vozač — samo isporuka i kontrola vozila, posljednja dva dana',
};

const argv = process.argv.slice(2);
const uzmi = zastava => {
  const i = argv.indexOf(zastava);
  if (i === -1) return null;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const zadataLozinka = uzmi('--lozinka');
const liceId = uzmi('--lice');
const [email, uloga, ime] = argv;

if (!email || !ULOGE.includes(uloga) || !ime) {
  console.error('\n  Upotreba:');
  console.error('    node alati\\nalog.mjs <email> <uloga> "Ime Prezime" [--lozinka XXX] [--lice N]\n');
  console.error('  Uloge:');
  for (const u of ULOGE) console.error(`    ${u.padEnd(9)} ${OPIS[u]}`);
  console.error('');
  process.exit(1);
}

const lozinka = zadataLozinka || crypto.randomBytes(9).toString('base64url');
if (lozinka.length < 10) {
  console.error('Lozinka mora imati bar 10 znakova.');
  process.exit(1);
}
const moraMijenjati = !zadataLozinka;

try {
  // Firma: izvođač nije vezan ni za jednu, ostali idu u jedinu firmu u bazi.
  let firmaId = null;
  if (uloga !== 'izvodjac') {
    const f = await upit('SELECT id FROM firma ORDER BY id LIMIT 1');
    if (!f.rows.length) {
      console.error('U bazi nema nijedne firme — prvo pokreni SQL iz db/.');
      process.exit(1);
    }
    firmaId = f.rows[0].id;
  }

  // Veza na lice sa spiska zaposlenih, ako postoji i ako je tražena.
  let lice = null;
  if (liceId) {
    const l = await upit('SELECT id, ime_prezime FROM lice WHERE id = $1', [Number(liceId)])
      .catch(() => ({ rows: [] }));
    if (!l.rows.length) console.warn(`  (upozorenje: lice ${liceId} ne postoji — nalog ostaje nevezan)`);
    else lice = l.rows[0];
  }

  const imaLiceId = (await upit(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema='public' AND table_name='korisnik'
                       AND column_name='lice_id') AS ima`)).rows[0].ima;

  const kolone = imaLiceId
    ? `(firma_id, email, ime, uloga, lozinka_hash, mora_promeniti, lice_id)`
    : `(firma_id, email, ime, uloga, lozinka_hash, mora_promeniti)`;
  const vrijednosti = imaLiceId ? '($1, lower($2), $3, $4::uloga_t, $5, $6, $7)'
                                : '($1, lower($2), $3, $4::uloga_t, $5, $6)';
  const dopuna = imaLiceId ? ', lice_id = COALESCE(EXCLUDED.lice_id, korisnik.lice_id)' : '';
  const parametri = [firmaId, email, lice?.ime_prezime || ime, uloga,
                     hesirajLozinku(lozinka), moraMijenjati];
  if (imaLiceId) parametri.push(lice?.id || null);

  const r = await upit(
    `INSERT INTO korisnik ${kolone} VALUES ${vrijednosti}
     ON CONFLICT (email) DO UPDATE SET
       ime = EXCLUDED.ime, uloga = EXCLUDED.uloga,
       lozinka_hash = EXCLUDED.lozinka_hash,
       mora_promeniti = EXCLUDED.mora_promeniti,
       aktivan = TRUE${dopuna}
     RETURNING id, (xmax = 0) AS novi`, parametri);

  const { novi } = r.rows[0];
  console.log(`\n  ${novi ? 'Otvoren nalog' : 'Nalog je već postojao — postavljena nova lozinka'}`);
  console.log(`  E-mail:   ${email}`);
  console.log(`  Ime:      ${lice?.ime_prezime || ime}`);
  console.log(`  Uloga:    ${uloga} — ${OPIS[uloga]}`);
  console.log(`  Lozinka:  ${lozinka}`);
  console.log(moraMijenjati
    ? '\n  Korisnik je mijenja pri prvoj prijavi.\n'
    : '\n  Lozinka je postavljena kako si tražila — bez obavezne promjene.\n');
} catch (e) {
  console.error('GREŠKA:', e.message);
  if (/uloga_t/.test(e.message))
    console.error('Ako je uloga „vozac", pokreni prvo: node alati\\dopune.mjs');
  process.exit(1);
} finally { await pool.end(); }
