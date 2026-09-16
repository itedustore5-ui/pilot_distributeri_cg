/**
 * Provera prikaza spiska za dopunsku obuku:
 * kolona „Broj tema" se prikazuje samo kad NIJE filtrirana jedna tema.
 */
const T = 'test-token-za-proveru-1234567890';
const uzmi = p => fetch('http://localhost:3000' + p, { headers: { 'x-admin-token': T } })
  .then(r => r.json());
const greske = [];
const proveri = (u, o) => { console.log(`  ${u ? '✓' : '✗'} ${o}`); if (!u) greske.push(o); };

// ista logika kao na stranici
function crtaj(pon, filterTeme){
  const red = pon.filter(r => !filterTeme || `${r.tema} ${r.tema_naziv}` === filterTeme);
  const g = {};
  red.forEach(r => { (g[r.sifra] ??= { mesto:r.radno_mesto, smena:r.smena, teme:[] }).teme.push(r); });
  const jednaTema = !!filterTeme;
  const zaglavlja = ['Šifra','Radno mesto','Smena',
    ...(jednaTema ? [] : ['Broj tema']), 'Teme za dopunu i rezultat'];
  const redovi = Object.entries(g)
    .sort((a,b) => b[1].teme.length - a[1].teme.length
                || Number(a[1].teme[0].procenat) - Number(b[1].teme[0].procenat))
    .map(([sf,v]) => ({
      sifra: sf,
      broj: jednaTema ? null : v.teme.length,
      teme: v.teme.slice().sort((a,b) => Number(a.procenat) - Number(b.procenat))
             .map(t => `${t.tema} ${Number(t.procenat).toFixed(1)}%`),
    }));
  return { zaglavlja, redovi, ljudi: new Set(red.map(r => r.sifra)).size, stavki: red.length };
}

async function main(){
  const pon = await uzmi('/api/izvestaj/1/ponovna-obuka');

  console.log('\n── BEZ FILTERA ──────────────────────────────────────');
  const a = crtaj(pon, null);
  console.log('  kolone:', a.zaglavlja.join(' | '));
  console.log(`  ${a.ljudi} zaposlenih · ${a.stavki} stavki`);
  a.redovi.slice(0, 4).forEach(r =>
    console.log(`   ${r.sifra}  broj:${r.broj}  ${r.teme.join(', ')}`));
  proveri(a.zaglavlja.includes('Broj tema'), 'bez filtera se prikazuje kolona „Broj tema"');
  proveri(a.redovi.some(r => r.broj > 1), 'bez filtera postoje ljudi sa više od jedne teme');
  proveri(a.redovi[0].broj >= a.redovi[a.redovi.length-1].broj,
    'sortirano po broju tema opadajuće');

  const teme = [...new Set(pon.map(r => `${r.tema} ${r.tema_naziv}`))];
  console.log('\n── SA FILTEROM NA JEDNU TEMU ────────────────────────');
  const b = crtaj(pon, teme[0]);
  console.log('  filter:', teme[0]);
  console.log('  kolone:', b.zaglavlja.join(' | '));
  console.log(`  ${b.ljudi} zaposlenih · ${b.stavki} stavki`);
  b.redovi.slice(0, 4).forEach(r =>
    console.log(`   ${r.sifra}  ${r.teme.join(', ')}`));
  proveri(!b.zaglavlja.includes('Broj tema'), 'sa filterom kolona „Broj tema" nestaje');
  proveri(b.redovi.every(r => r.broj === null), 'sa filterom se broj ne prikazuje');
  proveri(b.ljudi === b.stavki, 'sa filterom je broj ljudi jednak broju stavki');
  const broj = t => parseFloat(String(t).split(' ').pop());   // "T1 20.0%" -> 20
  const p0 = broj(b.redovi[0].teme[0]);
  const pz = broj(b.redovi[b.redovi.length-1].teme[0]);
  proveri(p0 <= pz, `sortirano po rezultatu rastuće — najgori prvi (${p0}% … ${pz}%)`);

  console.log('\n── VIŠE TEMA KOD JEDNOG ČOVEKA ──────────────────────');
  const viseTema = a.redovi.find(r => r.broj > 1);
  if (viseTema) {
    console.log(`   ${viseTema.sifra} (${viseTema.broj} teme): ${viseTema.teme.join(' · ')}`);
    const proc = viseTema.teme.map(t => parseFloat(String(t).split(' ').pop()));
    proveri(proc.every((v,i) => i === 0 || proc[i-1] <= v),
      'kod jednog čoveka teme su sortirane po rezultatu, najgora prva');
  }

  console.log('\n─────────────────────────────────────────────────────');
  console.log(greske.length === 0 ? '  PRIKAZ ISPRAVAN\n' : `  PALO: ${greske.join(', ')}\n`);
  process.exit(greske.length ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
