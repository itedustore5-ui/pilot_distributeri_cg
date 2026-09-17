/**
 * alati/dopune.mjs — primjenjuje SQL dopune na bazu iz .env (DATABASE_URL).
 *
 *     node alati\dopune.mjs
 *
 * Radi i u običnom Command Promptu (cmd) i u PowerShellu — nema kopiranja
 * u Supabase, nema `Get-Content`, nema clipboarda.
 *
 * Primjenjuje SAMO dopune koje ne diraju podatke:
 *     07_dopune_cg.sql       pogledi za izvoz i dnevni pregled, naknadan unos
 *     08_lica_cg.sql         lica koja rukuju hranom i sanitarne knjižice
 *     09_nalog_lice_cg.sql   nalog vezan za lice, šifra uz nalog
 *     10_plan_obuke_cg.sql   godišnji plan obuke (Prilog 13)
 *     11_zaposleni_cg.sql    spisak svih zaposlenih (lice.rukuje_hranom)
 *     12_ko_je_unio_cg.sql   nalog koji je unio zapis (uneo_korisnik_id)
 *     13_uloga_vozac_cg.sql  vozač kao zasebna uloga
 *     14_moje_liste_cg.sql   pogledi nose uneo_korisnik_id („vidim samo svoje")
 *
 * NIKAD ne pokreće 04_zapisi_cg.sql (počinje sa DROP TABLE) ni 05_demo_cg.sql
 * (demo podaci). Te dvije se pokreću ručno i samo kad znaš zašto.
 *
 * Već primijenjena dopuna se preskače — provjera ide po objektu koji pravi,
 * ne po nekoj evidenciji migracija.
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const koren = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const DOPUNE = [
  { fajl: '07_dopune_cg.sql', objekat: 'v_dnevni_pregled',
    sta: 'pogledi za izvoz i dnevni pregled' },
  { fajl: '08_lica_cg.sql',   objekat: 'lice',
    sta: 'lica koja rukuju hranom i sanitarne knjižice' },
  { fajl: '09_nalog_lice_cg.sql', objekat: 'v_nalozi',
    sta: 'nalog za prijavu vezan za lice sa spiska' },
  { fajl: '10_plan_obuke_cg.sql', objekat: 'plan_obuke',
    sta: 'godišnji plan obuke kao plan, a ne kao dnevni zapis' },
  { fajl: '11_zaposleni_cg.sql', kolona: ['lice', 'rukuje_hranom'],
    sta: 'spisak svih zaposlenih, ne samo onih koji rukuju hranom' },
  { fajl: '12_ko_je_unio_cg.sql', kolona: ['zapis', 'uneo_korisnik_id'],
    sta: 'ko je zapis stvarno unio — nalog, ne otkucano ime' },
  { fajl: '13_uloga_vozac_cg.sql', enumVrijednost: ['uloga_t', 'vozac'],
    sta: 'vozač kao zasebna uloga' },
  { fajl: '14_moje_liste_cg.sql', kolona: ['v_sledljivost_napred', 'uneo_korisnik_id'],
    sta: 'pogledi nose nalog koji je unio — „vidim samo svoje"' },
];

const veza = process.env.DATABASE_URL;
if (!veza) {
  console.error('Nema DATABASE_URL u .env — ne znam na koju bazu da se povežem.');
  process.exit(2);
}

const k = new pg.Client({
  connectionString: veza,
  ssl: /supabase|render|amazonaws/i.test(veza) ? { rejectUnauthorized: false } : false,
});

try {
  await k.connect();
} catch (e) {
  console.error('Ne mogu da se povežem na bazu: ' + e.message);
  console.error('Najčešće: pogrešna lozinka u DATABASE_URL, ili je Supabase projekat pauziran.');
  process.exit(2);
}

let primijenjeno = 0, preskoceno = 0;
try {
  for (const d of DOPUNE) {
    // Dopuna koja samo dodaje kolonu se prepoznaje po koloni, ne po tabeli.
    const { rows: [r] } = d.enumVrijednost
      ? await k.query(
          `SELECT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                           WHERE t.typname = $1 AND e.enumlabel = $2) AS ima`,
          d.enumVrijednost)
      : d.kolona
      ? await k.query(
          `SELECT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_schema='public' AND table_name=$1
                             AND column_name=$2) AS ima`, d.kolona)
      : await k.query(
          'SELECT to_regclass($1) IS NOT NULL AS ima', ['public.' + d.objekat]);
    if (r.ima) {
      console.log(`  preskačem  ${d.fajl} — već primijenjeno (${d.sta})`);
      preskoceno++;
      continue;
    }
    const sql = await readFile(path.join(koren, 'db', d.fajl), 'utf8');
    process.stdout.write(`  primjenjujem ${d.fajl} … `);
    await k.query(sql);
    console.log('urađeno');
    primijenjeno++;
  }
} catch (e) {
  console.error('\nDopuna nije prošla: ' + e.message);
  console.error('Baza je ostala kakva je bila. Pošalji ovu poruku i ne pokrećaj ponovo naslijepo.');
  await k.end().catch(() => {});
  process.exit(1);
} finally {
  await k.end().catch(() => {});
}

console.log(primijenjeno
  ? `\nGotovo — primijenjeno ${primijenjeno}, preskočeno ${preskoceno}. Restartuj server.`
  : '\nBaza je već bila u redu — ništa nije mijenjano.');
