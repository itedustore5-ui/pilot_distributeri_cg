// Provjera pravila odstupanja iz public/obrasci-cg.json.
//
// Ocjenjivač `oceni` se izvlači iz public/zapisi.html i testira nad
// stvarnim pravilima, da se ne desi da obrazac tiho nikad ne prijavi
// odstupanje zbog pogrešnog imena polja.
//
//     node test_pravila.mjs

import fs from 'node:fs';

const html = fs.readFileSync('public/zapisi.html', 'utf8');
const izvor = html.match(/function oceni\(izraz, v\) \{[\s\S]*?\n\}/)[0];
const oceni = new Function(`${izvor}; return oceni;`)();

const def = JSON.parse(fs.readFileSync('public/obrasci-cg.json', 'utf8'));

let greske = 0, provjereno = 0;
const pao = (poruka) => { console.error('  ✗ ' + poruka); greske++; };

for (const o of def.obrasci) {
  if (o.generisan) continue;
  console.log(`\nPrilog ${o.oznaka} — ${o.naziv}`);

  const imena = new Set((o.polja || []).map(p => p.id));

  if (!o.polja?.length) { pao('nema definisanih polja'); continue; }
  if (!(o.polja || []).some(p => p.kljucno))
    pao('nijedno polje nije označeno kao ključno — štampa i pregled ostaju prazni');

  if (!o.odstupanje_kad) {
    console.log('  · bez pravila odstupanja (program/plan, ne mjerenje)');
    continue;
  }

  // Svako ime polja u pravilu mora postojati u obrascu.
  // Niske u navodnicima se prvo uklanjaju — one su vrijednosti, ne polja.
  const bezNiski = o.odstupanje_kad.replace(/'[^']*'/g, "''");
  for (const ime of bezNiski.match(/\b[a-z_][a-z0-9_]*\b/g) || []) {
    if (['true', 'false'].includes(ime)) continue;
    if (!imena.has(ime)) pao(`pravilo koristi nepostojeće polje „${ime}"`);
  }

  // Prazan zapis ne smije da bude odstupanje — inače se ništa ne može snimiti.
  const prazno = Object.fromEntries([...imena].map(k => [k, null]));
  if (o.odstupanje_kad.trim() !== 'true' && oceni(o.odstupanje_kad, prazno))
    pao('prazan obrazac se ocjenjuje kao odstupanje');

  provjereno++;
  console.log(`  · pravilo: ${o.odstupanje_kad}`);
}

// --------------------------------------------------- ciljani slučajevi
console.log('\nCiljani slučajevi');
const slucaj = (naziv, izraz, v, ocekivano) => {
  const dobijeno = oceni(izraz, v);
  if (dobijeno !== ocekivano)
    pao(`${naziv}: očekivano ${ocekivano}, dobijeno ${dobijeno}`);
  else console.log(`  ✓ ${naziv}`);
};

slucaj('P7 temperatura iznad granice',
  'temperatura < granica_min || temperatura > granica_max',
  { temperatura: 9, granica_min: 0, granica_max: 4 }, true);
slucaj('P7 temperatura u granicama',
  'temperatura < granica_min || temperatura > granica_max',
  { temperatura: 3.5, granica_min: 0, granica_max: 4 }, false);
slucaj('P7 temperatura ispod donje granice',
  'temperatura < granica_min || temperatura > granica_max',
  { temperatura: -2, granica_min: 0, granica_max: 4 }, true);
slucaj('P8 zamrzivač na -15 je odstupanje',
  'temperatura > granica_max', { temperatura: -15, granica_max: -18 }, true);
slucaj('P8 zamrzivač na -20 je u redu',
  'temperatura > granica_max', { temperatura: -20, granica_max: -18 }, false);
slucaj('D1 prljava komora',
  'cistoca == false || rashlada_radi == false || predrashladeno == false',
  { cistoca: false, rashlada_radi: true, predrashladeno: true }, true);
slucaj('D1 sve u redu',
  'cistoca == false || rashlada_radi == false || predrashladeno == false',
  { cistoca: true, rashlada_radi: true, predrashladeno: true }, false);
slucaj('D1 nepopunjeno nije odstupanje',
  'cistoca == false || rashlada_radi == false || predrashladeno == false',
  { cistoca: null, rashlada_radi: null, predrashladeno: null }, false);
slucaj('P3 nalaz ne zadovoljava',
  "nalaz == 'ne zadovoljava'", { nalaz: 'ne zadovoljava' }, true);
slucaj('D3 vježba nije odstupanje',
  "vrsta != 'vježba'", { vrsta: 'vježba' }, false);
slucaj('D3 stvarno povlačenje jeste odstupanje',
  "vrsta != 'vježba'", { vrsta: 'povlačenje' }, true);
slucaj('D4 uvijek odstupanje', 'true', {}, true);

console.log(`\n${greske ? '✗' : '✓'} obrazaca sa pravilom: ${provjereno} · grešaka: ${greske}`);
process.exit(greske ? 1 : 0);
