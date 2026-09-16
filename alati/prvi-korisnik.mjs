/**
 * Pravi prvog korisnika — izvođača. Pokreće se jednom, posle seed-a.
 *   node alati/prvi-korisnik.mjs marija@primer.rs "Marija Kontić"
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import { pool, upit } from '../server/db.js';
import { hesirajLozinku } from '../server/auth.js';

const [email, ime] = process.argv.slice(2);
if (!email || !ime) {
  console.error('Upotreba: node alati/prvi-korisnik.mjs <email> "Ime Prezime"');
  process.exit(1);
}
const lozinka = crypto.randomBytes(9).toString('base64url');
try {
  await upit(
    `INSERT INTO korisnik (firma_id, email, ime, uloga, lozinka_hash, mora_promeniti)
     VALUES (NULL, lower($1), $2, 'izvodjac', $3, TRUE)
     ON CONFLICT (email) DO UPDATE SET lozinka_hash = EXCLUDED.lozinka_hash,
       mora_promeniti = TRUE, aktivan = TRUE`,
    [email, ime, hesirajLozinku(lozinka)]);
  console.log(`\n  Korisnik:  ${email}`);
  console.log(`  Uloga:     izvođač (sve dozvole)`);
  console.log(`  Lozinka:   ${lozinka}\n`);
  console.log('  Prijavi se na /prijava.html i odmah postavi svoju lozinku.\n');
} catch (e) { console.error('GREŠKA:', e.message); process.exit(1); }
finally { await pool.end(); }
