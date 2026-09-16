/**
 * LICENCA — provera prava korišćenja.
 *
 * Ne štiti kod od kopiranja; to nijedan tehnički postupak ne može.
 * Radi jednu stvar koja ima smisla: nastavak korišćenja posle isteka
 * ugovora traži NAMERNU izmenu koda. Ta izmena je dokaz u sporu,
 * i razlika između nesporazuma i svesnog kršenja ugovora.
 *
 * Ključ potpisuje izvođač tajnom koju klijent nema (LICENCA_TAJNA).
 * Bez promenljive LICENCA aplikacija radi normalno — tako radi kod
 * izvođača, gde provera nema svrhe.
 */
import crypto from 'node:crypto';

const TAJNA = process.env.LICENCA_TAJNA || '';

/** Pravi ključ. Pokreće se SAMO kod izvođača. */
export function napraviKljuc({ klijent, vaziDo, napomena = '' }) {
  if (!TAJNA) throw new Error('Nedostaje LICENCA_TAJNA.');
  const telo = { klijent, vaziDo, napomena };
  const podaci = Buffer.from(JSON.stringify(telo)).toString('base64url');
  const potpis = crypto.createHmac('sha256', TAJNA).update(podaci).digest('base64url');
  return `${podaci}.${potpis}`;
}

/** @returns {{vazi:boolean, klijent?:string, vaziDo?:string, razlog?:string, danaDoIsteka?:number}} */
export function proveriKljuc(kljuc) {
  if (!kljuc) return { vazi: false, razlog: 'Licencni ključ nije postavljen.' };
  if (!TAJNA)  return { vazi: false, razlog: 'Nedostaje LICENCA_TAJNA na serveru.' };

  const [podaci, potpis] = String(kljuc).split('.');
  if (!podaci || !potpis) return { vazi: false, razlog: 'Ključ je neispravnog oblika.' };

  const ocekivan = crypto.createHmac('sha256', TAJNA).update(podaci).digest('base64url');
  const a = Buffer.from(potpis), b = Buffer.from(ocekivan);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
    return { vazi: false, razlog: 'Potpis ključa se ne slaže. Ključ je izmenjen ili nije izdat za ovu instalaciju.' };

  let telo;
  try { telo = JSON.parse(Buffer.from(podaci, 'base64url').toString('utf8')); }
  catch { return { vazi: false, razlog: 'Sadržaj ključa se ne može pročitati.' }; }

  const danas = new Date().toISOString().slice(0, 10);
  const dana = Math.round((new Date(telo.vaziDo) - new Date(danas)) / 864e5);
  if (telo.vaziDo < danas)
    return { vazi: false, klijent: telo.klijent, vaziDo: telo.vaziDo,
             razlog: `Licenca je istekla ${telo.vaziDo}.` };

  return { vazi: true, klijent: telo.klijent, vaziDo: telo.vaziDo, danaDoIsteka: dana };
}

/**
 * Provera pri pokretanju.
 * Bez LICENCA — radi normalno (instalacija izvođača).
 * Sa LICENCA — mora biti ispravna, inače se ne pokreće.
 */
export function proveriPriPokretanju() {
  const kljuc = process.env.LICENCA;
  if (!kljuc) return { vazi: true, sopstvena: true };

  const r = proveriKljuc(kljuc);
  if (!r.vazi) {
    console.error('\n  LICENCA NIJE VAŽEĆA');
    console.error(`  ${r.razlog}`);
    console.error('  Aplikacija se ne pokreće. Obratite se izvođaču.\n');
    process.exit(1);
  }
  console.log(`  Licenca: ${r.klijent} · važi do ${r.vaziDo} (još ${r.danaDoIsteka} dana)`);
  if (r.danaDoIsteka <= 30)
    console.warn(`  UPOZORENJE: licenca ističe za ${r.danaDoIsteka} dana.`);
  return r;
}
