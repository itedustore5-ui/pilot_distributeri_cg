/**
 * DNEVNI PREGLED — jedna komanda, stanje svih klijenata.
 *
 *     node alati/dnevni-pregled.mjs
 *
 * ZAŠTO POSTOJI
 * Najgori scenario nije pogrešan zapis. Najgori je tišina: firma prestane
 * da unosi, niko ne primijeti, i tri mjeseca kasnije dođe inspekcija na
 * praznu evidenciju. Tada je kriv i klijent i ti — jer si ti prodala
 * sistem koji je trebalo da to spriječi.
 *
 * Ovo je pet sekundi posla ujutru umjesto tog razgovora.
 *
 * KOJE BAZE GLEDA
 * Ako postoji alati/klijenti.txt, gleda sve iz njega, po jedan red:
 *
 *     Mljekara Nikšić = postgresql://postgres.xxx:lozinka@...pooler...:5432/postgres
 *     Voće Bar        = postgresql://postgres.yyy:lozinka@...pooler...:5432/postgres
 *
 * Ako tog fajla nema, gleda samo DATABASE_URL iz .env.
 *
 * alati/klijenti.txt je u .gitignore — u njemu su lozinke. Ne šalji ga
 * nikom i ne drži ga u istom folderu sa nečim što dijeliš.
 *
 * IZLAZ
 * Izlazni kod je 1 ako bilo koji klijent ima crveni nalaz. To znači da
 * ovo možeš zakačiti na Task Scheduler i dobiti poruku samo kad ne valja.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ovdje = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------
//  Koje baze gledamo
// ---------------------------------------------------------------------
function klijenti() {
  const fajl = path.join(ovdje, 'klijenti.txt');
  if (fs.existsSync(fajl)) {
    const redovi = fs.readFileSync(fajl, 'utf8').split(/\r?\n/)
      .map(r => r.trim())
      .filter(r => r && !r.startsWith('#'))
      .map(r => {
        const i = r.indexOf('=');
        if (i < 0) return null;
        return { naziv: r.slice(0, i).trim(), url: r.slice(i + 1).trim() };
      })
      .filter(Boolean);
    if (redovi.length) return redovi;
  }
  if (process.env.DATABASE_URL)
    return [{ naziv: '(iz .env)', url: process.env.DATABASE_URL }];
  console.error('\n  Nema ni alati/klijenti.txt ni DATABASE_URL u .env.\n');
  process.exit(2);
}

// ---------------------------------------------------------------------
//  Ocjena — isto pravilo kao /api/cg/dnevni-pregled u aplikaciji.
//  Namjerno prepisano ovdje: ovaj alat mora da radi i kad aplikacija ne radi.
// ---------------------------------------------------------------------
const dana = d => d === null || d === undefined
  ? null : Math.floor((Date.now() - new Date(d)) / 86400000);

function ocijeni(r) {
  const n = [];
  const tisina = dana(r.zadnji_zapis);
  if (tisina === null)          n.push(['!', 'nijedan zapis nikad nije unesen']);
  else if (tisina > 7)          n.push(['!', `${tisina} dana bez ijednog zapisa`]);
  else if (tisina > 2)          n.push(['·', `${tisina} dana bez zapisa`]);
  if (+r.odstupanja_bez_mjere)  n.push(['!', `${r.odstupanja_bez_mjere} odstupanja bez korektivne mjere`]);
  if (+r.naknadnih_30_dana > 3) n.push(['·', `${r.naknadnih_30_dana} zapisa uneseno naknadno`]);
  const vj = dana(r.zadnja_vjezba_povlacenja);
  if (vj === null)              n.push(['!', 'vježba povlačenja nikad nije izvedena']);
  else if (vj > 365)            n.push(['·', `vježba povlačenja prije ${vj} dana`]);
  if (+r.zapisa_7_dana === 0 && tisina !== null)
                                n.push(['!', 'nijedan zapis u posljednjih 7 dana']);
  return n;
}

const UPIT = 'SELECT * FROM v_dnevni_pregled ORDER BY firma';

// ---------------------------------------------------------------------
const datum = d => d ? new Date(d).toISOString().slice(0, 10) : '—';
let crvenih = 0, zutih = 0;

// Isti tekst ide i na ekran i u mejl — da se ne pišu dvije verzije istine.
const izvjestaj = [];
const ispisi = red => { console.log(red); izvjestaj.push(red.trimEnd()); };

console.log(`\n  DNEVNI PREGLED — ${new Date().toLocaleString('sr-Latn-ME')}\n`);

for (const k of klijenti()) {
  const klijent = new pg.Client({
    connectionString: k.url,
    ssl: /supabase|render|amazonaws/.test(k.url) ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 15000,
  });
  try {
    await klijent.connect();
    const { rows } = await klijent.query(UPIT);
    if (!rows.length) { console.log(`  ${k.naziv.padEnd(24)}  baza je prazna`); continue; }
    for (const r of rows) {
      const nalazi = ocijeni(r);
      const crveno = nalazi.some(([t]) => t === '!');
      if (crveno) crvenih++; else if (nalazi.length) zutih++;
      const oznaka = crveno ? 'ZASTOJ ' : nalazi.length ? 'pazi   ' : 'uredno ';
      ispisi(`  ${oznaka} ${(r.firma || k.naziv).padEnd(24)} `
        + `zadnji zapis ${datum(r.zadnji_zapis)}  `
        + `${String(r.zapisa_7_dana).padStart(3)} zapisa/7 dana`);
      for (const [t, p] of nalazi) ispisi(`            ${t} ${p}`);
    }
  } catch (e) {
    crvenih++;
    ispisi(`  GREŠKA  ${k.naziv.padEnd(24)} ${e.message}`);
  } finally {
    await klijent.end().catch(() => {});
  }
}

console.log('');
if (crvenih) console.log(`  ${crvenih} sa oznakom ZASTOJ — te zovi danas.`);
if (zutih)   console.log(`  ${zutih} sa oznakom „pazi" — to nije hitno, ali se ne zaboravlja.`);
if (!crvenih && !zutih) console.log('  Sve uredno.');
console.log('');

// ---------------------------------------------------------------------
//  MEJL — samo kad ima crvenog, i samo ako je podešen.
//
//  Kad ovo radi iz Task Schedulera u 8 ujutru, prozor bljesne i nestane.
//  Ispis u praznu sobu nije obavještenje. Zato mejl.
//
//  Podešava se u .env, i to je pet minuta posla:
//    1. myaccount.google.com → Bezbjednost → Potvrda u dva koraka (uključi)
//    2. isti ekran → Lozinke za aplikacije → napravi jednu, prepiši 16 znakova
//    3. u .env:
//         MEJL_OD=tvoj@gmail.com
//         MEJL_LOZINKA=šesnaest znakova bez razmaka
//         MEJL_ZA=tvoj@gmail.com
//
//  Ako ovoga nema u .env, alat i dalje radi — samo ćuti.
// ---------------------------------------------------------------------
if (crvenih && process.env.MEJL_ZA && process.env.MEJL_OD && process.env.MEJL_LOZINKA) {
  try {
    const { default: nodemailer } = await import('nodemailer');
    const posta = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.MEJL_OD, pass: process.env.MEJL_LOZINKA },
    });
    await posta.sendMail({
      from: process.env.MEJL_OD,
      to: process.env.MEJL_ZA,
      subject: `HACCP — ${crvenih} klijent(a) u zastoju`,
      text: izvjestaj.join('\n') + '\n\nOvo je automatska poruka iz alati/dnevni-pregled.mjs.',
    });
    console.log(`  Mejl poslat na ${process.env.MEJL_ZA}.\n`);
  } catch (e) {
    console.log(`  Mejl NIJE poslat: ${e.message}`);
    console.log('  (Ako piše da nodemailer nedostaje: npm install nodemailer)\n');
  }
}

process.exit(crvenih ? 1 : 0);
