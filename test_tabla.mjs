/**
 * Prolazi ceo tok koji komandna tabla vodi — od prazne baze do spremnog merenja.
 * Svaki poziv je tačno ono što stranica šalje kad klikneš dugme.
 */
const OSN = 'http://localhost:3000';
const T = 'test-token-za-proveru-1234567890';
const uzmi = p => fetch(OSN + p, { headers: { 'x-admin-token': T } }).then(r => r.json());
const posalji = async (p, telo, metod='POST') => {
  const o = await fetch(OSN + p, { method: metod,
    headers: { 'x-admin-token': T, 'Content-Type': 'application/json' },
    body: telo ? JSON.stringify(telo) : undefined });
  const d = await o.json().catch(() => ({}));
  if (!o.ok) throw new Error(d.greska || 'greška');
  return d;
};
const greske = [];
const proveri = (u, o) => { console.log(`  ${u ? '✓' : '✗'} ${o}`); if (!u) greske.push(o); };

async function main() {
  console.log('\n── SPISAK GRUPA ─────────────────────────────────────');
  const grupe = await uzmi('/api/grupe');
  proveri(grupe.length > 0, `nađeno ${grupe.length} grupa`);
  const K = grupe[0].id;
  console.log(`  ${grupe[0].firma} — ${grupe[0].naziv} (paket: ${grupe[0].paket})`);

  console.log('\n── KORAK 1: ŠIFRE ───────────────────────────────────');
  let u = await uzmi(`/api/izvestaj/${K}/spisak-ucesnika`);
  proveri(u.length === 0, `polazi se od prazno (${u.length})`);

  const a = await posalji('/api/admin/generisi-ucesnike',
    { grupa_id: K, raspodela: [{ radno_mesto: 'Rasecanje', smena: 'A', broj: 5 }] });
  const b = await posalji('/api/admin/generisi-ucesnike',
    { grupa_id: K, raspodela: [{ radno_mesto: 'Pakovanje', smena: 'B', broj: 4 }] });
  u = await uzmi(`/api/izvestaj/${K}/spisak-ucesnika`);
  proveri(u.length === 9, `napravljeno ${u.length} šifri u dva poteza`);
  proveri(u[0].sifra === 'P-001' && u[8].sifra === 'P-009',
    `numeracija se nastavlja: ${u[0].sifra} … ${u[8].sifra}`);

  const zaBrisanje = u[8];
  await posalji(`/api/admin/ucesnik/${zaBrisanje.id}`, null, 'DELETE');
  u = await uzmi(`/api/izvestaj/${K}/spisak-ucesnika`);
  proveri(u.length === 8, `brisanje neiskorišćene šifre radi (${zaBrisanje.sifra})`);

  console.log('\n── KORAK 2: OBUKA ───────────────────────────────────');
  let ob = await uzmi(`/api/izvestaj/${K}/obuke`);
  proveri(ob.length === 0, 'polazi se bez obuke');

  const danas = new Date().toISOString().slice(0, 10);
  const temeP = await uzmi(`/api/izvestaj/${K}/teme-programa`);
  proveri(temeP.length > 0, `teme iz nacrta vidljive pre merenja (${temeP.length})`);
  proveri(temeP.every(t => Number(t.pitanja_u_formi) > 0), 'svaka tema ima pitanja u formi');
  const teme = temeP.map(t => t.oznaka);
  const nova = await posalji('/api/admin/obuka', {
    grupa_id: K, naziv: 'Godišnja obuka — higijena i HACCP',
    sifra_razloga: '09', oblik: 'kombinovana',
    datum_od: danas, datum_do: danas, datum_prakticne: danas,
    trajanje_sati: 4, mesto: 'Sala za obuku',
    izvodjac: 'Ime Prezime', izvodjac_svojstvo: 'lice za BZR',
    materijal: 'HACCP plan; Dobra higijenska praksa', teme,
  });
  proveri(!!nova.obuka_id && teme.length > 0,
    `obuka upisana (#${nova.obuka_id}) sa ${teme.length} tema`);
  const ob0 = (await uzmi(`/api/izvestaj/${K}/obuke`))[0];
  proveri(!!ob0.teme, `teme zapisane uz obuku: ${(ob0.teme||'').slice(0,52)}…`);

  const svi = await posalji(`/api/admin/obuka/${nova.obuka_id}/prisustvo`, {});
  proveri(svi.obradjeno === 8, `svi označeni kao prisutni (${svi.obradjeno})`);

  const ods = await posalji(`/api/admin/obuka/${nova.obuka_id}/prisustvo`,
    { sifre: ['P-003'], prisustvovao: false, napomena: 'Bolovanje' });
  proveri(ods.obradjeno === 1, 'odsutan označen pojedinačno');

  ob = await uzmi(`/api/izvestaj/${K}/obuke`);
  proveri(Number(ob[0].prisutnih) === 7, `prisutnih ${ob[0].prisutnih} od ${ob[0].upisanih}`);

  console.log('\n── KORAK 3: POTVRDA PITANJA ─────────────────────────');
  let nep = await uzmi('/api/admin/nepotvrdjene');
  proveri(nep.length > 0, `${nep.length} pitanja čeka potvrdu`);
  const pot = await posalji('/api/admin/potvrdi',
    { oznake_porodica: null, potvrdio: 'Ime Prezime, menadžer kvaliteta' });
  nep = await uzmi('/api/admin/nepotvrdjene');
  proveri(nep.length === 0, `potvrđeno ${pot.potvrdjeno}, ostalo ${nep.length}`);

  console.log('\n── KORAK 4: TERMINI ─────────────────────────────────');
  let t = await uzmi(`/api/izvestaj/${K}/termini`);
  console.log('  ' + t.map(x => `${x.oznaka}:${x.otvoren ? 'otvoren' : 'zatvoren'}`).join('  '));
  proveri(t.every(x => 'otvoren' in x && 'predatih' in x), 'termini nose stanje i odziv');

  const prvi = t[0];
  await posalji(`/api/admin/talas/${prvi.id}/otvori`, { otvoren: false });
  t = await uzmi(`/api/izvestaj/${K}/termini`);
  proveri(!t.find(x => x.id === prvi.id).otvoren, `zatvaranje termina radi (${prvi.oznaka})`);
  await posalji(`/api/admin/talas/${prvi.id}/otvori`, { otvoren: true });
  t = await uzmi(`/api/izvestaj/${K}/termini`);
  proveri(t.find(x => x.id === prvi.id).otvoren, `otvaranje termina radi (${prvi.oznaka})`);

  const javni = await (await fetch(OSN + '/api/talasi')).json();
  proveri(javni.length === t.filter(x => x.otvoren).length,
    `zaposleni vidi samo otvorene termine (${javni.length})`);

  console.log('\n── KORAK 5: RADNA MESTA ─────────────────────────────');
  let rm = await uzmi(`/api/izvestaj/${K}/radna-mesta-akt`);
  proveri(rm.length > 0, `${rm.length} radnih mesta u banci`);
  const pov = await posalji('/api/admin/radna-mesta',
    { grupa_id: K, radna_mesta: rm.map(r => ({ naziv: r.naziv })) });
  u = await uzmi(`/api/izvestaj/${K}/spisak-ucesnika`);
  const povezanih = u.filter(x => x.povezano_radno_mesto).length;
  proveri(povezanih === u.length, `povezano ${povezanih} od ${u.length} zaposlenih`);

  console.log('\n── PROBA JEDNOG TESTA ───────────────────────────────');
  const sifra = u[0].sifra;
  const otvoreni = (await (await fetch(OSN + '/api/talasi')).json())[0];
  const s = await (await fetch(OSN + '/api/sesija', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sifra, talas_id: otvoreni.id }) })).json();
  proveri(Array.isArray(s.pitanja) && s.pitanja.length === 20,
    `${sifra} dobio ${s.pitanja?.length} pitanja u terminu ${otvoreni.oznaka}`);
  proveri(!JSON.stringify(s).includes('"tacna"'), 'tačan odgovor ne izlazi ka zaposlenom');

  console.log('\n── STANJE ZA KOMANDNU TABLU ─────────────────────────');
  const k2 = (await uzmi('/api/grupe')).find(x => x.id === K);
  console.log(`  zaposlenih ${k2.ucesnika} · obuka ${k2.obuka} · termina ${k2.termina}` +
              ` (otvorenih ${k2.otvorenih}) · provera ${k2.provera}`);
  proveri(Number(k2.ucesnika) === 8 && Number(k2.obuka) === 1,
    'brojevi na tabli se slažu sa stanjem');

  console.log('\n─────────────────────────────────────────────────────');
  console.log(greske.length === 0 ? '  CEO TOK RADI\n' : `  PALO: ${greske.join(', ')}\n`);
  process.exit(greske.length ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
