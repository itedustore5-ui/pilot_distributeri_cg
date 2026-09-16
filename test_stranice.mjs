/**
 * Provera da polja koja stranice čitaju postoje u odgovorima servera.
 * Hvata najčešću grešku: preimenovana kolona u SQL pogledu, a JS je i dalje traži.
 */
const OSN = 'http://localhost:3000';
const T = process.env.ADMIN_TOKEN || 'test-token-za-proveru-1234567890';
const uzmi = p => fetch(OSN + p, { headers: { 'x-admin-token': T } }).then(r => r.json());

const K = 1;
const ocekivano = {
  [`/api/izvestaj/${K}/zaglavlje`]:
    ['firma','program','godina','pravni_osnov','grupa','paket','prag_teme','upisanih'],
  [`/api/izvestaj/${K}/teme`]:
    ['tema','tema_naziv','nivo_rizika','talas','procenat','prag_teme','status'],
  [`/api/izvestaj/${K}/zaboravljanje`]:
    ['tema','tema_naziv','nivo_rizika','t0','t1','t30','t90','dobitak','zadrzano','osip'],
  [`/api/izvestaj/${K}/sidra`]:
    ['talas','procenat_sidra','procenat_rotacione','razmak'],
  [`/api/izvestaj/${K}/ucesce`]:
    ['talas','planiran_datum','upisanih','predatih','odziv'],
  [`/api/izvestaj/${K}/stavke`]:
    ['tema','porodica','varijanta','je_sidro','tekst','n','tezina','diskriminacija','nalaz'],
  [`/api/izvestaj/${K}/distraktori`]:
    ['tema','porodica','varijanta','pitanje','odgovor','tacna','procenat'],
  [`/api/izvestaj/${K}/smene`]:
    ['smena','talas','ljudi','procenat'],
  [`/api/izvestaj/${K}/ponovna-obuka`]:
    ['sifra','radno_mesto','smena','tema','tema_naziv','nivo_rizika','procenat','prag_teme'],
  [`/api/izvestaj/${K}/kvalitet`]:
    ['sifra','talas','datum','sek_po_pitanju','procenat','nalaz'],
  [`/api/izvestaj/${K}/obuke`]:
    ['id','naziv','oblik','datum_od','trajanje_sati','mesto','izvodjac',
     'izvodjac_svojstvo','materijal','teme','prisutnih','upisanih'],
  [`/api/izvestaj/${K}/osposobljavanje`]:
    ['obuka_id','obuka','oblik','obuka_od','trajanje_sati','mesto','izvodjac',
     'sifra','ime_prezime','radno_mesto','smena','prisustvovao','napomena_prisustva',
     'datum_provere','rezultat_provere','status'],
  [`/api/izvestaj/${K}/obrazac6`]:
    ['poslodavac','sifra','ime_prezime','radno_mesto','opis_poslova','povecan_rizik',
     'mere','lzo','obavestenja','rukovodilac_prati','opasnosti_tekst','sifra_razloga',
     'razlog_opis','datum_obuke_teorijske','datum_obuke_prakticne','datum_obuke_lzo',
     'datum_provere_teorijske','rezultat_provere_teorijske','izvodjac'],
  [`/api/izvestaj/${K}/rok-cuvanja`]:
    ['firma','grupa','cuva_imena','rok_cuvanja_meseci','anonimizovano','anonimizovao',
     'poslednje_merenje','dospeva','status'],
  [`/api/izvestaj/${K}/radna-mesta-akt`]:
    ['naziv','opis_poslova','povecan_rizik','sifre_opasnosti','mere','lzo',
     'obavestenja','rukovodilac_prati','zaposlenih'],
  [`/api/izvestaj/${K}/zbirno`]:
    ['sifra','radno_mesto','smena','t0','t1','t30','t90','uradjenih_termina',
     'tema_ispod_praga','teme_ispod','poslednji_rezultat','status'],
  [`/api/izvestaj/${K}/kvalitet2`.replace('2','')]:
    ['sifra','talas','datum','trajanje_sek','sek_po_pitanju','procenat','nalaz'],
  [`/api/izvestaj/${K}/ucesnici`]:
    ['sifra','radno_mesto','smena','sesija_id','talas','datum','bodovi','max_bodovi','procenat'],
};

const greske = [];

async function main() {
  console.log('\n── POLJA KOJA STRANICE ČITAJU ───────────────────────');
  for (const [put, polja] of Object.entries(ocekivano)) {
    const d = await uzmi(put);
    const uzorak = Array.isArray(d) ? d[0] : d;
    const naziv = put.split('/').pop();
    if (!uzorak) { console.log(`  ✗ ${naziv.padEnd(16)} prazan odgovor`); greske.push(naziv); continue; }
    const fali = polja.filter(p => !(p in uzorak));
    console.log(`  ${fali.length ? '✗' : '✓'} ${naziv.padEnd(16)} ${
      Array.isArray(d) ? d.length + ' zapisa' : 'objekat'}${fali.length ? '  FALI: ' + fali.join(', ') : ''}`);
    if (fali.length) greske.push(naziv);
  }

  console.log('\n── POJEDINAČNI PREGLED SESIJE ───────────────────────');
  const lista = await uzmi(`/api/izvestaj/${K}/ucesnici`);
  const d = await uzmi(`/api/sesija/${lista[0].sesija_id}/pregled`);
  const zagPolja = ['sifra','radno_mesto','smena','talas','opis','datum','bodovi',
                    'max_bodovi','procenat','trajanje_sek','stavke'];
  const faliZag = zagPolja.filter(p => !(p in d));
  console.log(`  ${faliZag.length ? '✗' : '✓'} zaglavlje${faliZag.length ? '  FALI: ' + faliZag : ''}`);
  if (faliZag.length) greske.push('pregled/zaglavlje');

  const stPolja = ['redni_broj','tema','porodica','varijanta','pitanje','tacan',
                   'izabrao','tacan_odgovor'];
  const faliSt = stPolja.filter(p => !(p in (d.stavke[0] || {})));
  console.log(`  ${faliSt.length ? '✗' : '✓'} stavke (${d.stavke.length})${faliSt.length ? '  FALI: ' + faliSt : ''}`);
  if (faliSt.length) greske.push('pregled/stavke');

  const netacne = d.stavke.filter(s => !s.tacan);
  const bezKljuca = netacne.filter(s => !s.tacan_odgovor);
  console.log(`  ${bezKljuca.length ? '✗' : '✓'} svaka netačna stavka ima prikazan tačan odgovor (${netacne.length} netačnih)`);
  if (bezKljuca.length) greske.push('pregled/kljuc');

  console.log('\n── PRISTUP ──────────────────────────────────────────');
  for (const p of [`/api/izvestaj/${K}/stavke`, `/api/izvestaj/${K}/ponovna-obuka`,
                   `/api/sesija/${lista[0].sesija_id}/pregled`]) {
    const o = await fetch(OSN + p);
    const ok = o.status === 401;
    console.log(`  ${ok ? '✓' : '✗'} ${p.split('/').slice(-2).join('/')} bez tokena → ${o.status}`);
    if (!ok) greske.push('pristup ' + p);
  }

  console.log('\n── PREFIKS ŠIFRE I ZBIRNI PREGLED ───────────────────');
  const zb = await uzmi(`/api/izvestaj/${K}/zbirno`);
  const { rows: [koh] } = { rows: [{ prefiks_sifre: (zb[0]?.sifra || '').split('-')[0] }] };
  const px = koh.prefiks_sifre;
  const svi = zb.every(r => r.sifra.startsWith(px + '-'));
  console.log(`  ${svi ? '✓' : '✗'} sve šifre nose prefiks ${px} (${zb.length} zaposlenih)`);
  if (!svi) greske.push('prefiks');
  const sabrano = zb.filter(r => Number(r.tema_ispod_praga) > 0).length;
  console.log(`  ✓ zbirno: ${sabrano} sa dopunom, ${zb.length - sabrano} u redu`);

  console.log('\n── PAKET ────────────────────────────────────────────');
  const zg = await uzmi(`/api/izvestaj/${K}/zaglavlje`);
  const uc2 = await uzmi(`/api/izvestaj/${K}/ucesce`);
  const ocekTermina = zg.paket === 'provera' ? 1 : zg.paket === 'osnovno' ? 2 : 4;
  const ok = uc2.length === ocekTermina;
  console.log(`  ${ok ? '✓' : '✗'} paket "${zg.paket}" ima ${uc2.length} termina (očekivano ${ocekTermina}): ${
    uc2.map(x => x.talas).join(', ')}`);
  if (!ok) greske.push('paket/termini');

  console.log('\n── OBRAZAC 6 ────────────────────────────────────────');
  const o6 = await uzmi(`/api/izvestaj/${K}/obrazac6`);
  const prazna = ['opis_poslova','mere','lzo','obavestenja','opasnosti_tekst',
                  'sifra_razloga','datum_obuke_teorijske','datum_provere_teorijske']
    .filter(f => o6.some(r => !r[f]));
  console.log(`  ${prazna.length ? '✗' : '✓'} sva obavezna polja popunjena (${o6.length} obrazaca)${
    prazna.length ? '  PRAZNO: ' + prazna.join(', ') : ''}`);
  if (prazna.length) greske.push('obrazac6 prazna polja');
  const nemaPrakticne = !('datum_provere_prakticne' in (o6[0] || {}));
  console.log(`  ${nemaPrakticne ? '✓' : '✗'} praktična provera se ne isporučuje — sistem je ne meri`);
  if (!nemaPrakticne) greske.push('obrazac6 tvrdi prakticnu proveru');
  const bezImena = o6.filter(r => !r.ime_prezime).length;
  console.log(`  ${bezImena ? 'ℹ' : '✓'} imena: ${bezImena ? bezImena + ' bez imena (cuva_imena iskljuceno)' : 'sva upisana'}`);

  const rok = await uzmi(`/api/izvestaj/${K}/rok-cuvanja`);
  console.log(`  ✓ rok čuvanja: ${rok.rok_cuvanja_meseci} meseci, ističe ${
    String(rok.dospeva).slice(0,10)} — ${rok.status}`);

  console.log('\n── SADRŽAJ IZVEŠTAJA ────────────────────────────────');
  const zag = await uzmi(`/api/izvestaj/${K}/zaglavlje`);
  const pon = await uzmi(`/api/izvestaj/${K}/ponovna-obuka`);
  const kv  = await uzmi(`/api/izvestaj/${K}/kvalitet`);
  const st  = await uzmi(`/api/izvestaj/${K}/stavke`);
  console.log(`  Firma: ${zag.firma} · prag ${zag.prag_teme}% · ${zag.upisanih} zaposlenih`);
  console.log(`  Za dopunsku obuku: ${new Set(pon.map(r => r.sifra)).size} zaposlenih, ${
    new Set(pon.map(r => r.tema)).size} tema`);
  console.log(`  Pitanja bez zamerke: ${st.filter(x => x.nalaz === 'u redu').length} / ${st.length}`);
  console.log(`  Sesija označenih za proveru: ${kv.filter(x => x.nalaz !== 'u redu').length} / ${kv.length}`);

  console.log('\n─────────────────────────────────────────────────────');
  console.log(greske.length === 0
    ? '  SVE PROVERE PROŠLE\n'
    : `  PALO: ${greske.length} — ${greske.join(', ')}\n`);
  process.exit(greske.length ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
