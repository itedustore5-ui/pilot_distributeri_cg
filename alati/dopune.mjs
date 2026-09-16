/**
 * alati/dopune.mjs — primjenjuje SQL dopune na bazu iz .env (DATABASE_URL).
 *
 *     node alati\dopune.mjs
 *
 * Radi i u običnom Command Promptu (cmd) i u PowerShellu — nema kopiranja
 * u Supabase, nema `Get-Content`, nema clipboarda.
 *
 * Primjenjuje SAMO dopune koje ne diraju podatke:
 *     07_dopune_cg.sql   pogledi za izvoz i dnevni pregled, naknadan unos
 *     08_lica_cg.sql     lica koja rukuju hranom i sanitarne knjižice
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
    const { rows: [r] } = await k.query(
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
