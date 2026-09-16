/**
 * Provera izvoza u CSV: izvršava istu logiku koju stranica koristi,
 * i proverava da fajl ima BOM, tačka-zarez, i sve očekivane odeljke.
 */
const OSN = 'http://localhost:3000';
const T = 'test-token-za-proveru-1234567890';
const uzmi = p => fetch(OSN + p, { headers: { 'x-admin-token': T } }).then(r => r.json());
const greske = [];
const proveri = (u, o) => { console.log(`  ${u ? '✓' : '✗'} ${o}`); if (!u) greske.push(o); };

// ista funkcija kao na stranici
function csv(redovi){
  const t = redovi.map(r => r.map(c => {
    const s = (c === null || c === undefined) ? '' : String(c);
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(';')).join('\r\n');
  return '\uFEFF' + t;
}

async function main(){
  const K = 1;
  const [zag, zb, ev, pon, kv, osp, obuke, rok] = await Promise.all([
    uzmi(`/api/izvestaj/${K}/zaglavlje`), uzmi(`/api/izvestaj/${K}/zbirno`),
    uzmi(`/api/izvestaj/${K}/ucesnici`), uzmi(`/api/izvestaj/${K}/ponovna-obuka`),
    uzmi(`/api/izvestaj/${K}/kvalitet`), uzmi(`/api/izvestaj/${K}/osposobljavanje`),
    uzmi(`/api/izvestaj/${K}/obuke`), uzmi(`/api/izvestaj/${K}/rok-cuvanja`),
  ]);
  const test = await uzmi(`/api/sesija/${ev[0].sesija_id}/pregled`);
  const o = obuke[0] || {};

  console.log('\n── IZVOZI ───────────────────────────────────────────');

  const fajlovi = {
    'zbirno': csv([['Šifra','Radno mesto','T0','T1','T30','T90','Status'],
      ...zb.map(r => [r.sifra, r.radno_mesto ?? '', r.t0, r.t1, r.t30, r.t90, r.status])]),
    'pojedinacno': csv([['Šifra','Termin','Datum','Bodovi','Rezultat %'],
      ...ev.map(r => [r.sifra, r.talas, r.datum ?? '', r.bodovi, r.procenat])]),
    'dopunska obuka': csv([['Šifra','Tema','Rizik','Rezultat %'],
      ...pon.map(r => [r.sifra, r.tema, r.nivo_rizika, r.procenat])]),
    'kvalitet': csv([['Šifra','Termin','Sek/pitanju','Nalaz'],
      ...kv.map(r => [r.sifra, r.talas, r.sek_po_pitanju, r.nalaz])]),
    'osposobljavanje': csv([['Šifra','Prisustvovao','Datum provere','Status'],
      ...osp.map(r => [r.sifra, r.prisustvovao ? 'da':'ne', r.datum_provere ?? '', r.status])]),
    'jedan test': csv([['Br.','Tema','Pitanje','Izabrao','Tačan odgovor','Ocena'],
      ...test.stavke.map(x => [x.redni_broj, x.tema, x.pitanje,
        x.izabrao ?? '', x.tacan_odgovor, x.tacan ? 'tačno' : 'netačno'])]),
  };

  for (const [naziv, sadrzaj] of Object.entries(fajlovi)) {
    const redova = sadrzaj.split('\r\n').length;
    const bom = sadrzaj.charCodeAt(0) === 0xFEFF;
    const tz = sadrzaj.includes(';');
    console.log(`  ${bom && tz && redova > 1 ? '✓' : '✗'} ${naziv.padEnd(18)} ${
      String(redova).padStart(4)} redova  BOM:${bom ? 'da' : 'NE'}  tačka-zarez:${tz ? 'da' : 'NE'}`);
    if (!bom || !tz || redova < 2) greske.push(naziv);
  }

  console.log('\n── KOMPLETAN IZVOZ ──────────────────────────────────');
  const sve = csv([
    ['Kompletan izvoz'], ['Firma', zag.firma], [],
    ['ODRŽANA OBUKA'], ['Naziv', o.naziv ?? ''], ['Izvođač', o.izvodjac ?? ''], [],
    ['EVIDENCIJA O OSPOSOBLJAVANJU I PROVERI'],
    ...osp.map(r => [r.sifra, r.status]), [],
    ['REZULTATI PO ZAPOSLENOM'], ...zb.map(r => [r.sifra, r.t0, r.t90]), [],
    ['POJEDINAČNI ZAPISI'], ...ev.map(r => [r.sifra, r.talas, r.procenat]), [],
    ['SPISAK ZA DOPUNSKU OBUKU'], ...pon.map(r => [r.sifra, r.tema]), [],
    ['KONTROLA KVALITETA PODATAKA'], ...kv.map(r => [r.sifra, r.nalaz]), [],
    ['ROK ČUVANJA'], ['Ističe', rok.dospeva], ['Status', rok.status],
  ]);
  const odeljci = ['ODRŽANA OBUKA','EVIDENCIJA O OSPOSOBLJAVANJU','REZULTATI PO ZAPOSLENOM',
                   'POJEDINAČNI ZAPISI','SPISAK ZA DOPUNSKU OBUKU','KONTROLA KVALITETA','ROK ČUVANJA'];
  odeljci.forEach(o2 => proveri(sve.includes(o2), `odeljak: ${o2}`));
  console.log(`  ukupno ${sve.split('\r\n').length} redova, ${(sve.length/1024).toFixed(1)} KB`);

  console.log('\n── NAVODNICI I PRELOMI ──────────────────────────────');
  const sTacka = csv([['a;b', 'c"d', 'e\nf']]);
  proveri(sTacka.includes('"a;b"'), 'tačka-zarez u tekstu se navodi');
  proveri(sTacka.includes('"c""d"'), 'navodnik se udvaja');
  proveri(sTacka.includes('"e\nf"'), 'prelom reda se navodi');

  console.log('\n─────────────────────────────────────────────────────');
  console.log(greske.length === 0 ? '  SVI IZVOZI ISPRAVNI\n'
    : `  PALO: ${greske.length} — ${greske.join(', ')}\n`);
  process.exit(greske.length ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
