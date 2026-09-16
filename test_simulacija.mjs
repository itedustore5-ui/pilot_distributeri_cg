/**
 * Simulacija punog ciklusa merenja + provere ispravnosti.
 * Pokretanje:  node test_simulacija.mjs
 */
import { pool } from './server/db.js';

const OSN = 'http://localhost:3000';
const T = process.env.ADMIN_TOKEN || 'test-token-za-proveru-1234567890';
const admin = { 'x-admin-token': T, 'Content-Type': 'application/json' };
const posalji = (p, telo, h = { 'Content-Type': 'application/json' }) =>
  fetch(OSN + p, { method: 'POST', headers: h, body: JSON.stringify(telo) }).then(r => r.json());
const uzmi = p => fetch(OSN + p, { headers: admin }).then(r => r.json());

// Verovatnoća tačnog odgovora po temi i talasu — realistična krivulja zaboravljanja.
// T5 (alergeni) namerno propada, da se vidi da izveštaj to hvata.
// Verovatnoće tačnog odgovora po temi i terminu — prave se iz tema koje
// stvarno postoje u banci, pa simulacija radi sa bilo kojim skupom oznaka.
const KRIVE = [
  { T0: .50, T1: .90, T30: .80, T90: .74 },
  { T0: .58, T1: .92, T30: .85, T90: .80 },
  { T0: .45, T1: .88, T30: .74, T90: .66 },
  { T0: .40, T1: .86, T30: .70, T90: .60 },
  { T0: .30, T1: .82, T30: .52, T90: .38 },   // namerno propada
  { T0: .55, T1: .90, T30: .82, T90: .78 },
];
let VER = {};

const greske = [];
const proveri = (uslov, opis) => {
  console.log(`  ${uslov ? '✓' : '✗'} ${opis}`);
  if (!uslov) greske.push(opis);
};

async function main() {
  console.log('\n── PRIPREMA ─────────────────────────────────────────');

  const nep = await uzmi('/api/admin/nepotvrdjene');
  console.log(`  Stavki koje čekaju potvrdu klijenta: ${nep.length}`);
  const p = await posalji('/api/admin/potvrdi',
    { oznake_porodica: null, potvrdio: 'Menadžer kvaliteta (simulacija)' }, admin);
  console.log(`  Potvrđeno: ${p.potvrdjeno}`);

  const { rows: talasi } = await pool.query(
    `SELECT id, oznaka, redni FROM talas WHERE grupa_id = 1 ORDER BY redni`);
  for (const t of talasi) await posalji(`/api/admin/talas/${t.id}/otvori`, { otvoren: true }, admin);

  const { rows: [koh] } = await pool.query(
    `SELECT prefiks_sifre, paket FROM grupa WHERE id = 1`);
  const PX = koh.prefiks_sifre;
  const PAKET = koh.paket;
  const { rows: tal } = await pool.query(
    `SELECT oznaka FROM talas WHERE grupa_id = 1 ORDER BY redni`);
  console.log(`  Paket: ${PAKET} — ${tal.length} ${
    tal.length === 1 ? 'termin' : 'termina'} (${tal.map(t => t.oznaka).join(', ')})`);
  // radna mesta se čitaju iz banke, pa simulacija radi za bilo koju delatnost
  const rmLista = await uzmi('/api/izvestaj/1/radna-mesta-akt');
  const RM = rmLista.length ? rmLista.map(r => r.naziv)
                            : ['Radno mesto 1', 'Radno mesto 2'];

  const ucesnici = Array.from({ length: 24 }, (_, i) => ({
    sifra: `${PX}-${String(i + 1).padStart(3, '0')}`,
    radno_mesto: RM[i % RM.length],
    smena: i % 2 ? 'B' : 'A',
  }));
  const d = await posalji('/api/admin/ucesnici', { grupa_id: 1, ucesnici }, admin);
  console.log(`  Učesnika u grupi: ${d.dodato} (šifre ${PX}-001 … ${PX}-024)`);

  // Zapis o održanoj obuci — bez njega provera znanja nema uz šta da stoji.
  const danas = new Date();
  const dat = x => new Date(danas.getTime() + x * 864e5).toISOString().slice(0, 10);
  const temeNacrta = await uzmi('/api/izvestaj/1/teme-programa');
  VER = Object.fromEntries(temeNacrta.map((t, i) => [t.oznaka, KRIVE[i % KRIVE.length]]));

  const ob = await posalji('/api/admin/obuka', {
    grupa_id: 1,
    naziv: 'Godišnja obuka — higijena i HACCP',
    oblik: 'kombinovana',
    sifra_razloga: '09',                 // periodična obuka zaposlenih
    datum_prakticne: dat(0),
    datum_od: dat(0), datum_do: dat(0), trajanje_sati: 4,
    mesto: 'Sala za obuku, pogon',
    izvodjac: 'Lice za bezbednost i zdravlje na radu',
    izvodjac_svojstvo: 'interni izvođač',
    materijal: 'HACCP plan, Dobra higijenska praksa, Akt o proceni rizika',
    teme: temeNacrta.map(t => t.oznaka),
  }, admin);
  await posalji(`/api/admin/obuka/${ob.obuka_id}/prisustvo`, {}, admin);
  await posalji(`/api/admin/obuka/${ob.obuka_id}/prisustvo`,
    { sifre: [`${PX}-007`], prisustvovao: false, napomena: 'Bolovanje' }, admin);
  if (!ob.obuka_id) throw new Error('Upis obuke nije uspeo: ' + (ob.greska || 'nepoznato'));
  console.log(`  Obuka #${ob.obuka_id} upisana, prisustvo evidentirano (1 odsutan)`);

  // mapa opcija -> tačna (samo za simulaciju; server ovo nikad ne šalje klijentu)
  const { rows: opcije } = await pool.query(`SELECT id, stavka_id, tacna FROM opcija`);
  const tacnaZa = new Map();
  const opcijeZa = new Map();
  for (const o of opcije) {
    if (o.tacna) tacnaZa.set(o.stavka_id, o.id);
    if (!opcijeZa.has(o.stavka_id)) opcijeZa.set(o.stavka_id, []);
    opcijeZa.get(o.stavka_id).push(o.id);
  }
  const { rows: temaZa } = await pool.query(
    `SELECT s.id AS stavka_id, t.oznaka AS tema, p.je_sidro
       FROM stavka s JOIN porodica p ON p.id = s.porodica_id JOIN tema t ON t.id = p.tema_id`);
  const meta = new Map(temaZa.map(r => [r.stavka_id, r]));

  console.log('\n── SIMULACIJA MERENJA ───────────────────────────────');
  let curilo = false;
  const vidjene = new Map();   // sifra -> [stavka_id po talasu]

  for (const t of talasi) {
    let predato = 0;
    for (const u of ucesnici) {
      const s = await posalji('/api/sesija', { sifra: u.sifra, talas_id: t.id });
      if (s.greska) { console.log('  greška:', s.greska); continue; }

      // curi li tačan odgovor ka klijentu?
      if (JSON.stringify(s).includes('"tacna"')) curilo = true;

      const kljuc = u.sifra;
      if (!vidjene.has(kljuc)) vidjene.set(kljuc, {});

      for (const q of s.pitanja) {
        const { rows: [ss] } = await pool.query(
          `SELECT stavka_id FROM sesija_stavka WHERE id = $1`, [q.sesija_stavka_id]);
        const m = meta.get(ss.stavka_id);
        (vidjene.get(kljuc)[t.oznaka] ??= []).push({ stavka: ss.stavka_id, sidro: m.je_sidro });

        const verovatnoca = VER[m.tema][t.oznaka];
        const tacna = tacnaZa.get(ss.stavka_id);
        const sve = opcijeZa.get(ss.stavka_id);
        const netacne = sve.filter(x => x !== tacna);
        const izbor = Math.random() < verovatnoca
          ? tacna : netacne[Math.floor(Math.random() * netacne.length)];
        await posalji('/api/odgovor', { sesija_stavka_id: q.sesija_stavka_id, opcija_id: izbor });
      }
      await posalji('/api/predaja', { sesija_id: s.sesija_id });
      predato++;
    }
    console.log(`  ${t.oznaka}: predato ${predato}/${ucesnici.length}`);
  }

  // Simulacija odgovara trenutno, pa bi svaka sesija bila označena kao
  // „PREBRZO". Zato se trajanja naknadno postavljaju na realne vrednosti:
  // većina 6–13 min, dve namerno prebrze i jedna sa dugim prekidom —
  // da se vidi da kontrola kvaliteta radi.
  await pool.query(`
    WITH poredak AS (
      SELECT s.id, ROW_NUMBER() OVER (ORDER BY s.id) AS n
        FROM sesija s WHERE s.predata IS NOT NULL
    )
    UPDATE sesija s SET poceta = s.predata - (
      CASE
        WHEN p.n % 23 = 0 THEN 70                    -- prebrzo: ~3.5 s/pitanju
        WHEN p.n % 29 = 0 THEN 150                   -- brzo: ~7.5 s/pitanju
        WHEN p.n % 31 = 0 THEN 4200                  -- prekid u radu
        ELSE 360 + (p.n * 37) % 420                  -- 6–13 min
      END || ' seconds')::interval
      FROM poredak p WHERE p.id = s.id`);
  console.log('  (trajanja sesija postavljena na realne vrednosti)');

  console.log('\n── PROVERE ISPRAVNOSTI ──────────────────────────────');
  proveri(!curilo, 'Tačan odgovor nikada ne izlazi u API odgovoru za učesnika');

  // dvostruka predaja
  const pon = await posalji('/api/sesija', { sifra: `${PX}-001`, talas_id: talasi[0].id });
  proveri(!!pon.greska, 'Drugi pokušaj u istom terminu je odbijen');

  // sidra ista, rotacione različite
  let sidraOk = true, rotacijeOk = true;
  for (const [, po] of vidjene) {
    const sidra = {}, rot = {};
    for (const [tal, lista] of Object.entries(po)) {
      lista.forEach((x, idx) => {
        (x.sidro ? sidra : rot)[idx] ??= [];
        (x.sidro ? sidra : rot)[idx].push(x.stavka);
      });
    }
    for (const v of Object.values(sidra)) if (new Set(v).size !== 1) sidraOk = false;
    for (const v of Object.values(rot))   if (new Set(v).size !== v.length) rotacijeOk = false;
  }
  proveri(sidraOk, 'Sidrena pitanja su identična u sva 4 termina');
  proveri(rotacijeOk, 'Rotaciona pitanja se učesniku nikada ne ponavljaju');

  // ocenjivanje
  const { rows: [ocena] } = await pool.query(
    `SELECT COUNT(*)::int AS lose FROM sesija s
       WHERE s.predata IS NOT NULL AND (
         s.bodovi <> (SELECT COUNT(*) FROM odgovor o JOIN sesija_stavka ss ON ss.id=o.sesija_stavka_id
                       WHERE ss.sesija_id=s.id AND o.tacan)
         OR s.max_bodovi <> (SELECT COUNT(*) FROM sesija_stavka WHERE sesija_id=s.id))`);
  proveri(ocena.lose === 0, 'Bodovi se slažu sa brojem tačnih odgovora u bazi');

  const { rows: [nula] } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM odgovor WHERE tacan IS NULL`);
  proveri(nula.n === 0, 'Svaki odgovor je serverski ocenjen');

  console.log('\n── IZVEŠTAJ: sidra ──────────────────────────────────');
  const sid = await uzmi('/api/izvestaj/1/sidra');
  console.log('  TERMIN  SIDRO  ROTACIONA  RAZMAK');
  sid.forEach(s => console.log(
    `  ${s.talas.padEnd(7)}${String(s.procenat_sidra).padStart(5)}  ` +
    `${String(s.procenat_rotacione).padStart(9)}  ${String(s.razmak).padStart(6)}`));
  const r = sid.map(x => Number(x.razmak)).filter(n => !Number.isNaN(n));
  const koleb = Math.max(...r) - Math.min(...r);
  console.log(`  kolebanje razmaka: ${koleb.toFixed(1)} p.p.`);
  proveri(koleb <= 25, `Razmak sidro/rotaciona je stabilan (${koleb.toFixed(1)} p.p.)`);

  console.log('\n── IZVEŠTAJ: tema × termin ──────────────────────────');
  const zab = await uzmi('/api/izvestaj/1/zaboravljanje');
  if (PAKET === 'osnovno') {
    console.log('  TEMA   T0     T1     DOBITAK');
    zab.forEach(r => console.log(
      `  ${r.tema.padEnd(6)}${String(r.t0).padStart(5)}  ${String(r.t1).padStart(5)}  ` +
      `${String(r.dobitak).padStart(6)}`));
  } else {
    console.log('  TEMA   T0     T1     T30    T90    DOBITAK  OSIP');
    zab.forEach(r => console.log(
      `  ${r.tema.padEnd(6)}${String(r.t0).padStart(5)}  ${String(r.t1).padStart(5)}  ` +
      `${String(r.t30).padStart(5)}  ${String(r.t90).padStart(5)}  ` +
      `${String(r.dobitak).padStart(6)}  ${String(r.osip).padStart(5)}`));
  }

  const teme = await uzmi('/api/izvestaj/1/teme');
  const zadnjiT = PAKET === 'prosireno' ? 'T90' : 'T1';
  const ispod = teme.filter(t => t.talas === zadnjiT && t.status === 'ISPOD PRAGA');
  console.log(`\n  Ispod praga na ${zadnjiT}: ${ispod.map(t => t.tema).join(', ') || 'nijedna'}`);
  const pada = temeNacrta[4]?.oznaka;
  if (PAKET === 'prosireno') {
    proveri(ispod.some(t => t.tema === pada),
      `Izveštaj hvata temu koja je pala ispod praga (${pada})`);
  } else {
    proveri(ispod.length === 0,
      'Odmah posle obuke nijedna tema nije ispod praga');
  }

  const uc = await uzmi('/api/izvestaj/1/ucesce');
  console.log('\n── ODZIV ────────────────────────────────────────────');
  uc.forEach(r => console.log(`  ${r.talas.padEnd(4)} ${r.predatih}/${r.upisanih}  ${r.odziv}%`));

  const kv = await uzmi('/api/izvestaj/1/kvalitet');
  const uredu = kv.filter(x => x.nalaz === 'u redu').length;
  console.log('\n── KVALITET PODATAKA ────────────────────────────────');
  const poNalazu = {};
  kv.forEach(x => { poNalazu[x.nalaz] = (poNalazu[x.nalaz] || 0) + 1; });
  Object.entries(poNalazu).forEach(([n, c]) => console.log(`  ${String(c).padStart(3)}  ${n}`));
  proveri(uredu >= kv.length * 0.8,
    `Većina sesija ima realno trajanje (${uredu}/${kv.length} u redu)`);
  proveri(kv.some(x => x.nalaz !== 'u redu'),
    'Kontrola kvaliteta i dalje hvata sumnjive sesije');

  const zb = await uzmi('/api/izvestaj/1/zbirno');
  proveri(zb.length === 24, `Zbirni pregled ima jedan red po zaposlenom (${zb.length})`);
  proveri(zb.every(r => r.sifra.startsWith(PX + '-')), `Šifre nose prefiks ${PX}`);

  const osp = await uzmi('/api/izvestaj/1/osposobljavanje');
  const obuke = await uzmi('/api/izvestaj/1/obuke');
  console.log('\n── EVIDENCIJA O OSPOSOBLJAVANJU ─────────────────────');
  obuke.forEach(o => console.log(
    `  ${o.naziv} · ${String(o.datum_od).slice(0,10)} · ${o.trajanje_sati} h · ` +
    `prisutnih ${o.prisutnih}/${o.upisanih}`));
  const poStatusu = {};
  osp.forEach(r => { poStatusu[r.status] = (poStatusu[r.status] || 0) + 1; });
  Object.entries(poStatusu).forEach(([k2, c]) => console.log(`  ${String(c).padStart(3)}  ${k2}`));
  proveri(osp.length === 24, `Evidencija o osposobljavanju ima red po zaposlenom (${osp.length})`);
  proveri(osp.some(r => !r.prisustvovao), 'Odsustvo sa obuke je zabeleženo');
  proveri(osp.every(r => r.obuka && r.izvodjac && r.obuka_od),
    'Svaki red nosi podatke o održanoj obuci (naziv, izvođač, datum)');
  proveri(osp.filter(r => r.prisustvovao).every(r => r.datum_provere),
    'Svako ko je prisustvovao ima i datum izvršene provere');

  const ev = await uzmi('/api/izvestaj/1/evidencija');
  const ocek = 24 * talasi.length;
  proveri(ev.length === ocek,
    `Evidencija za auditora ima ${ev.length} zapisa (očekivano ${ocek})`);
  proveri(!JSON.stringify(ev).match(/ime|prezime/i), 'Evidencija ne sadrži ime ni prezime');

  console.log('\n─────────────────────────────────────────────────────');
  console.log(greske.length === 0
    ? '  SVE PROVERE PROŠLE\n'
    : `  PALO: ${greske.length}\n${greske.map(g => '   - ' + g).join('\n')}\n`);
  await pool.end();
  process.exit(greske.length ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
