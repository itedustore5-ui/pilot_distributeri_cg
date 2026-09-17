/**
 * alati/provjeri.mjs — zašto nešto ne radi.
 *
 *     node alati\provjeri.mjs
 *
 * Radi u cmd-u i u PowerShellu. Ne mijenja ništa — samo gleda i kaže.
 *
 * Provjerava tri stvari koje su, kad nešto „ne može da se upiše", uzrok u
 * devet od deset slučajeva:
 *   1. je li baza dohvatljiva i jesu li SQL dopune primijenjene
 *   2. vrti li se server uopšte, i vrti li STARI kod (nije restartovan)
 *   3. jesu li fajlovi na disku noviji od onoga što server servira
 */
import 'dotenv/config';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const koren = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const IZDANJE_OCEKIVANO = '2026-09-17-moje';

const zelen = t => console.log('\x1b[32m  OK  \x1b[0m ' + t);
const crven = t => console.log('\x1b[31m FALI \x1b[0m ' + t);
const zuti  = t => console.log('\x1b[33m PAZI \x1b[0m ' + t);
const sivo  = t => console.log('       \x1b[90m' + t + '\x1b[0m');

const problemi = [];

console.log('\n--- BAZA ---------------------------------------------------');

const veza = process.env.DATABASE_URL;
if (!veza) {
  crven('Nema DATABASE_URL u .env');
  problemi.push('Dopuni .env — bez adrese baze ništa ne radi.');
} else {
  const k = new pg.Client({
    connectionString: veza,
    ssl: /supabase|render|amazonaws/i.test(veza) ? { rejectUnauthorized: false } : false,
  });
  try {
    await k.connect();
    zelen('Baza je dohvatljiva');
    const { rows: [t] } = await k.query(`
      SELECT to_regclass('public.v_dnevni_pregled') IS NOT NULL AS ima07,
             to_regclass('public.lice')             IS NOT NULL AS ima08,
             to_regclass('public.v_nalozi')         IS NOT NULL AS ima09,
             to_regclass('public.plan_obuke')       IS NOT NULL AS ima10`);
    if (t.ima07) zelen('07_dopune_cg.sql primijenjen');
    else { crven('07_dopune_cg.sql NIJE primijenjen'); problemi.push('node alati\\dopune.mjs'); }
    if (t.ima08) {
      const { rows: [n] } = await k.query('SELECT count(*)::int n FROM lice');
      zelen(`08_lica_cg.sql primijenjen — ${n.n} lica na spisku`);
    } else {
      crven('08_lica_cg.sql NIJE primijenjen — zato ne možeš upisati lica');
      problemi.push('node alati\\dopune.mjs');
    }
    if (t.ima09) zelen('09_nalog_lice_cg.sql primijenjen — nalog nosi šifru lica');
    else { crven('09_nalog_lice_cg.sql NIJE primijenjen — nalozi nemaju šifru');
           problemi.push('node alati\\dopune.mjs'); }
    const { rows: [c] } = await k.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema='public' AND table_name='lice'
                         AND column_name='rukuje_hranom') AS ima11`);
    const { rows: [c14] } = await k.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema='public' AND table_name='v_sledljivost_napred'
                         AND column_name='uneo_korisnik_id') AS ima14`);
    if (c14.ima14) zelen('14_moje_liste_cg.sql primijenjen — svako vidi svoje unose');
    else { crven('14_moje_liste_cg.sql NIJE primijenjen — vozač vidi tuđe isporuke');
           problemi.push('node alati\\dopune.mjs'); }
    const { rows: [e13] } = await k.query(
      `SELECT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                       WHERE t.typname = 'uloga_t' AND e.enumlabel = 'vozac') AS ima13`);
    if (e13.ima13) zelen('13_uloga_vozac_cg.sql primijenjen — vozač je zasebna uloga');
    else { crven('13_uloga_vozac_cg.sql NIJE primijenjen — nalog vozača se ne može otvoriti');
           problemi.push('node alati\\dopune.mjs'); }
    const { rows: [c2] } = await k.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema='public' AND table_name='zapis'
                         AND column_name='uneo_korisnik_id') AS ima12`);
    if (c2.ima12) zelen('12_ko_je_unio_cg.sql primijenjen — zapis nosi nalog koji ga je unio');
    else { crven('12_ko_je_unio_cg.sql NIJE primijenjen — „Moja tabla" broji po otkucanom imenu');
           problemi.push('node alati\\dopune.mjs'); }
    if (c.ima11) zelen('11_zaposleni_cg.sql primijenjen — spisak svih zaposlenih');
    else { crven('11_zaposleni_cg.sql NIJE primijenjen — spisak prima samo lica koja rukuju hranom');
           problemi.push('node alati\\dopune.mjs'); }
    if (t.ima10) zelen('10_plan_obuke_cg.sql primijenjen — godišnji plan obuke');
    else { crven('10_plan_obuke_cg.sql NIJE primijenjen — Prilog 13 nema odakle da se puni');
           problemi.push('node alati\\dopune.mjs'); }
    const { rows: u } = await k.query(
      `SELECT uloga, count(*)::int n FROM korisnik WHERE aktivan GROUP BY uloga ORDER BY uloga`);
    if (!u.length) { crven('Nema nijednog aktivnog naloga'); problemi.push('node alati\\prvi-korisnik.mjs ...'); }
    else zelen('Nalozi: ' + u.map(x => `${x.uloga} ${x.n}`).join(' · '));
    const bez = u.find(x => x.uloga === 'bzr');
    if (!bez) zuti('Nema naloga sa ulogom `bzr` — odgovorno lice ne postoji, pa nema ko ni da otvara naloge.');
  } catch (e) {
    crven('Ne mogu na bazu: ' + e.message);
    problemi.push('Provjeri DATABASE_URL u .env, ili je Supabase projekat pauziran.');
  } finally { await k.end().catch(() => {}); }
}

console.log('\n--- FAJLOVI ------------------------------------------------');

const mora = [
  ['public/ljudi.html',    'spisak lica koja rukuju hranom'],
  ['public/tabla.html',    'tabla odgovornog lica'],
  ['db/08_lica_cg.sql',    'SQL za sanitarne knjižice'],
];
for (const [f, sta] of mora) {
  try { await stat(path.join(koren, f)); zelen(`${f} — ${sta}`); }
  catch { crven(`${f} ne postoji`); problemi.push(`Nedostaje fajl ${f}.`); }
}
try {
  const ix = await readFile(path.join(koren, 'server/index.js'), 'utf8');
  if (ix.includes('smijeNadUlogom')) zelen('server/index.js sadrži pravilo o otvaranju naloga');
  else { crven('server/index.js je STARA verzija — odgovorno lice ne može otvarati naloge');
         problemi.push('Fajl server/index.js nije ažuriran.'); }
} catch { crven('server/index.js se ne može pročitati'); }

console.log('\n--- SERVER -------------------------------------------------');

let port = 3000;
try {
  const env = await readFile(path.join(koren, '.env'), 'utf8');
  const m = env.match(/^\s*PORT\s*=\s*(\d+)/m);
  if (m) port = Number(m[1]);
} catch { /* .env se već javio gore */ }

try {
  const r = await fetch(`http://localhost:${port}/api/zdravlje`, { signal: AbortSignal.timeout(4000) });
  const z = await r.json();
  if (z.izdanje === IZDANJE_OCEKIVANO) {
    zelen(`Server radi na portu ${port}, izdanje ${z.izdanje}`);
    if (z.ima_lice === false) zuti('Server vidi bazu bez tabele `lice` — primijeni dopunu pa restartuj.');
  } else {
    crven(`Server radi, ali vrti STARI kod (izdanje: ${z.izdanje || 'bez oznake'})`);
    sivo(`Očekivano: ${IZDANJE_OCEKIVANO}`);
    problemi.push('Zaustavi server (Ctrl+C ili taskkill /f /im node.exe) i pokreni ga ponovo.');
  }
} catch {
  zuti(`Server ne odgovara na portu ${port} — ili je ugašen, ili je na drugom portu.`);
  sivo('Ako testiraš na Renderu, ovaj dio se ne odnosi na tebe — tamo treba git push i novi deploy.');
}

console.log('\n--- ŠTA DA URADIŠ ------------------------------------------\n');
if (!problemi.length) {
  console.log('  Ništa. Sve troje je u redu.\n');
  console.log('  Ako i dalje ne ide, prijavi se nalogom odgovornog lica (`bzr`),');
  console.log('  otvori Ljudi, pokušaj upis i pošalji mi tačan tekst greške.\n');
} else {
  [...new Set(problemi)].forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  console.log('');
}
