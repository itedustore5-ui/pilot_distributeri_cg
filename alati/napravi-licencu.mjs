/**
 * Pravljenje licencnog ključa. Pokreće SAMO izvođač, na svom računaru.
 *
 *   LICENCA_TAJNA=<tajna> node alati/napravi-licencu.mjs "Firma d.o.o." 2027-08-31
 *
 * Tajnu generisati jednom i čuvati van repozitorijuma:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
import { napraviKljuc, proveriKljuc } from '../server/licenca.js';

const [klijent, vaziDo, ...ost] = process.argv.slice(2);
if (!klijent || !/^\d{4}-\d{2}-\d{2}$/.test(vaziDo || '')) {
  console.error('Upotreba: LICENCA_TAJNA=<tajna> node alati/napravi-licencu.mjs "Naziv firme" GGGG-MM-DD [napomena]');
  process.exit(1);
}

const kljuc = napraviKljuc({ klijent, vaziDo, napomena: ost.join(' ') });
const p = proveriKljuc(kljuc);

console.log(`\n  Klijent:  ${klijent}`);
console.log(`  Važi do:  ${vaziDo} (${p.danaDoIsteka} dana)\n`);
console.log('  U .env kod klijenta upisati:\n');
console.log(`LICENCA=${kljuc}\n`);
console.log('  Uz to i LICENCA_TAJNA — ista vrednost koja je korišćena ovde.\n');
