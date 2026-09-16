/**
 * Provera uloga: ko šta sme da vidi.
 * Najvažnije: uprava NE SME dobiti nijedno ime ni šifru zaposlenog.
 */
const OSN = 'http://localhost:3000';
const GLAVNI = 'test-token-za-proveru-1234567890';
const greske = [];
const proveri = (u, o) => { console.log(`  ${u ? '✓' : '✗'} ${o}`); if (!u) greske.push(o); };

async function prijava(email, lozinka){
  const o = await fetch(OSN + '/api/prijava', { method:'POST',
    headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, lozinka }) });
  const d = await o.json();
  if (!o.ok) throw new Error(d.greska);
  const c = (o.headers.get('set-cookie') || '').match(/sesija=([^;]*)/);
  return { ...d, kolacic: c ? 'sesija=' + c[1] : null };
}
const kao = (s, p, opcije = {}) => fetch(OSN + p,
  { ...opcije, headers: { ...(opcije.headers||{}), Cookie: s.kolacic } });
const glavni = (p, opcije = {}) => fetch(OSN + p,
  { ...opcije, headers: { ...(opcije.headers||{}), 'x-admin-token': GLAVNI } });

async function main(){
  console.log('\n── PRIJAVA ──────────────────────────────────────────');
  const kriva = await fetch(OSN + '/api/prijava', { method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ email:'marija@primer.rs', lozinka:'pogresno' }) });
  proveri(kriva.status === 401, 'pogrešna lozinka odbijena');

  const izv = await prijava('marija@primer.rs', process.env.LOZ);
  proveri(izv.uloga === 'izvodjac', `prijavljen kao ${izv.uloga}`);
  proveri(izv.mora_promeniti === true, 'prva prijava traži novu lozinku');

  const nova = 'nova-lozinka-2027';
  const pl = await kao(izv, '/api/lozinka', { method:'POST',
    headers:{'Content-Type':'application/json'}, body: JSON.stringify({ nova }) });
  proveri(pl.ok, 'lozinka promenjena');
  const izv2 = await prijava('marija@primer.rs', nova);
  proveri(izv2.mora_promeniti === false, 'druga prijava ne traži promenu');

  console.log('\n── PRAVLJENJE KORISNIKA ─────────────────────────────');
  const { rows: firme } = { rows: await (await glavni('/api/grupe')).json() };
  const firmaId = 1;
  async function napravi(email, ime, uloga){
    const o = await kao(izv2, '/api/korisnici', { method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email, ime, uloga, firma_id: firmaId }) });
    const d = await o.json();
    if (!o.ok) throw new Error(d.greska);
    return d;
  }
  const bzrK = await napravi('bzr@firma.rs', 'Lice za BZR', 'bzr');
  const upK  = await napravi('direktor@firma.rs', 'Direktor', 'uprava');
  proveri(!!bzrK.lozinka && !!upK.lozinka, 'lozinke generisane i prikazane jednom');

  const dup = await kao(izv2, '/api/korisnici', { method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ email:'bzr@firma.rs', ime:'X', uloga:'bzr' }) });
  proveri(dup.status === 409, 'isti e-mail se ne može dvaput');

  const bzr = await prijava('bzr@firma.rs', bzrK.lozinka);
  const upr = await prijava('direktor@firma.rs', upK.lozinka);
  proveri(bzr.uloga === 'bzr' && upr.uloga === 'uprava', 'obe uloge se prijavljuju');

  console.log('\n── ŠTA SME LICE ZA BZR ──────────────────────────────');
  for (const [p, o] of [
    ['/api/izvestaj/1/zaglavlje','zaglavlje'],
    ['/api/izvestaj/1/spisak-ucesnika','spisak zaposlenih'],
    ['/api/izvestaj/1/obrazac6','Obrazac 6'],
    ['/api/izvestaj/1/ponovna-obuka','spisak za dopunu'],
    ['/api/izvestaj/1/zaboravljanje','zadržavanje znanja'],
  ]) proveri((await kao(bzr, p)).ok, `BZR: ${o}`);
  proveri((await kao(bzr, '/api/korisnici')).status === 403,
    'BZR NE sme da upravlja korisnicima');

  console.log('\n── ŠTA SME UPRAVA ───────────────────────────────────');
  for (const [p, o] of [
    ['/api/izvestaj/1/zaglavlje','zaglavlje'],
    ['/api/izvestaj/1/zaboravljanje','zadržavanje znanja'],
    ['/api/izvestaj/1/teme','rezultat po temama'],
    ['/api/izvestaj/1/ucesce','odziv'],
    ['/api/izvestaj/1/dopuna-zbirno','zbirna dopuna, bez šifara'],
  ]) proveri((await kao(upr, p)).ok, `uprava: ${o}`);

  console.log('\n── ŠTA UPRAVA NE SME (najvažnije) ───────────────────');
  for (const [p, o] of [
    ['/api/izvestaj/1/spisak-ucesnika','spisak zaposlenih'],
    ['/api/izvestaj/1/obrazac6','Obrazac 6 sa imenima'],
    ['/api/izvestaj/1/ponovna-obuka','poimeničan spisak za dopunu'],
    ['/api/izvestaj/1/ucesnici','pojedinačni zapisi'],
    ['/api/izvestaj/1/kvalitet','kvalitet po zaposlenom'],
    ['/api/izvestaj/1/evidencija','evidencija'],
    ['/api/korisnici','korisnici'],
  ]) proveri((await kao(upr, p)).status === 403, `uprava NE sme: ${o}`);

  const zb = await (await kao(upr, '/api/izvestaj/1/dopuna-zbirno')).json();
  proveri(!JSON.stringify(zb).match(/P-\d|sifra/i),
    'zbirna dopuna ne sadrži nijednu šifru');

  console.log('\n── BEZ PRIJAVE ──────────────────────────────────────');
  proveri((await fetch(OSN + '/api/izvestaj/1/zaglavlje')).status === 401,
    'neprijavljen ne vidi ništa');
  proveri((await fetch(OSN + '/api/talasi')).ok, 'test za zaposlene ostaje otvoren');

  console.log('\n── GAŠENJE KORISNIKA ────────────────────────────────');
  const spisak = await (await kao(izv2, '/api/korisnici')).json();
  const meta = spisak.find(x => x.email === 'direktor@firma.rs');
  await kao(izv2, `/api/korisnici/${meta.id}/stanje`, { method:'POST',
    headers:{'Content-Type':'application/json'}, body: JSON.stringify({ aktivan:false }) });
  proveri((await kao(upr, '/api/izvestaj/1/zaglavlje')).status === 401,
    'gašenje korisnika odmah prekida njegovu sesiju');

  console.log('\n── GLAVNI KLJUČ IZVOĐAČA ────────────────────────────');
  proveri((await glavni('/api/korisnici')).ok, 'ADMIN_TOKEN i dalje otvara sve');

  console.log('\n─────────────────────────────────────────────────────');
  console.log(greske.length === 0 ? '  ULOGE RADE\n' : `  PALO: ${greske.join(', ')}\n`);
  process.exit(greske.length ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
