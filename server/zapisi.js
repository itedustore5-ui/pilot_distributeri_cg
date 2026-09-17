// =====================================================================
//  DHP / HACCP ZAPISI — API  (Crna Gora, distribucija hrane)
//
//  Montira se u server/index.js sa:
//      import { zapisiRuter } from './zapisi.js';
//      app.use(zapisiRuter);
//
//  Uloge:
//    operater — magacioner, vozač, kontrolor prijema: UNOSI zapise,
//               vidi samo današnji i jučerašnji dan, NE MOŽE da mijenja
//    bzr      — odgovorno lice: sve zapise, kontrola, štampa
//    izvodjac — konsultant: sve
//
//  ZAPIS SE NE BRIŠE i NE MIJENJA. Ispravka je NOV zapis koji preko
//  `ispravlja_id` pokazuje na stari. Zato se svuda traži zapis na koji
//  NIKO NE POKAZUJE — to je važeća verzija. Stari ostaje u bazi i vidi
//  se u pregledu `v_trag_ispravki`.
// =====================================================================

import express from 'express';
import { upit } from './db.js';
import { dozvoli } from './auth.js';

export const zapisiRuter = express.Router();

// Ko šta smije. `operater` je magacin — prima robu, vodi dnevne zapise i
// po potrebi utovara. `vozac` je uža uloga: samo isporuka i kontrola vozila.
// Firma u kojoj isti čovjek radi oboje koristi `operater` i podjela je ne dira.
const unosi   = dozvoli('izvodjac', 'bzr', 'operater', 'vozac');
const prima   = dozvoli('izvodjac', 'bzr', 'operater');            // KKT 1 prijem
const vozi    = dozvoli('izvodjac', 'bzr', 'operater', 'vozac');   // KKT 3 isporuka
const vodi    = dozvoli('izvodjac', 'bzr');

// Uloge koje rade na terenu — vide samo posljednja dva dana, potpisuju se same
// i u listama vide SAMO SVOJE unose. Odgovorno lice i konsultant vide sve.
const NA_TERENU = ['operater', 'vozac'];

// Filter „samo moje". Dva uslova, jer stari zapisi nemaju `uneo_korisnik_id`:
//   · nalog kojim je poslat, ili
//   · potpis (ime) kad naloga nema — inače bi čovjeku nestala istorija.
// `id` dolazi iz sesije i provlači se kroz Number(), pa se ne ubacuje tekst.
function samoMoje(req, potpis) {
  if (!NA_TERENU.includes(req.korisnik?.uloga)) return '';
  const id = Number(req.korisnik?.id);
  if (!Number.isInteger(id)) return '';
  const ime = String(potpis || '').replace(/'/g, "''");
  return `AND (uneo_korisnik_id = ${id}`
       + ` OR (uneo_korisnik_id IS NULL AND izvrsilac = '${ime}'))`;
}

// Isporuka nema `izvrsilac` nego `vozac` — isti račun, druga kolona.
function samoMojeIsporuke(req, potpis) {
  return samoMoje(req, potpis).replace('izvrsilac =', 'vozac =');
}

const uhvati = fn => (req, res) =>
  fn(req, res).catch(e => {
    // Greška sa postavljenim `status` je očekivana (npr. duplirana šifra) —
    // korisniku ide njena poruka, a ne 500 koji izgleda kao kvar.
    if (e.status) return res.status(e.status).json({ greska: e.message });
    console.error(e);
    res.status(500).json({ greska: e.message });
  });

const ko = req => req.korisnik?.ime || 'nepoznato';

// Ko je zapis unio — nalog iz sesije. Pregledač na ovo ne utiče.
const unioId = req => req.korisnik?.id || null;

// Čime se taj nalog potpisuje: ime sa spiska zaposlenih, inače ime naloga.
// Traži se jednom po zahtjevu i pamti, da se ne pita baza po svakom polju.
async function potpisNaloga(req) {
  if (req._potpis !== undefined) return req._potpis;
  const id = unioId(req);
  if (!id) { req._potpis = ko(req); return req._potpis; }
  try {
    const r = await upit(
      `SELECT COALESCE(l.ime_prezime, k.ime) p FROM korisnik k
         LEFT JOIN lice l ON l.id = k.lice_id WHERE k.id = $1`, [id]);
    req._potpis = r.rows[0]?.p || ko(req);
  } catch { req._potpis = ko(req); }
  return req._potpis;
}

// Operater potpisuje sam sebe i ne može upisati tuđe ime — inače zapis
// prestaje biti dokaz ko je radio. Odgovorno lice i konsultant smiju upisati
// drugo lice, jer unose i za one koji nemaju nalog.
async function izvrsilacZa(req, trazeno) {
  const moj = await potpisNaloga(req);
  if (NA_TERENU.includes(req.korisnik?.uloga)) return moj;
  return (trazeno && String(trazeno).trim()) || moj;
}

// Operater ne smije da vidi istoriju — samo današnji i jučerašnji dan.
// Ne zbog tajnosti, nego da se zapis ne „usklađuje“ unazad.
// Kolona se prosljeđuje jer se ne zove svuda isto: `zapis.datum`,
// ali `v_sledljivost_nazad.datum_prijema`. Ranije je bilo zakucano „datum“
// pa je operateru lista prijema pucala sa greškom 500.
const ogranicenje = (req, kolona = 'datum') =>
  NA_TERENU.includes(req.korisnik?.uloga) ? `AND ${kolona} >= CURRENT_DATE - 1` : '';

const broj = v => (v === '' || v === null || v === undefined ? null : Number(v));

// Srpski/crnogorski padež uz broj: 1 dan · 2 dana · 5 dana.
// Sitnica, ali „1 artikala“ u izvještaju klijentu kvari cio utisak.
const pade = (n, jedan, dva, pet) => {
  const d = n % 10, dd = n % 100;
  if (dd >= 11 && dd <= 14) return `${n} ${pet}`;
  if (d === 1) return `${n} ${jedan}`;
  if (d >= 2 && d <= 4) return `${n} ${dva}`;
  return `${n} ${pet}`;
};

// =====================================================================
//  KOJOJ FIRMI KORISNIK PRIPADA
//  `firma` je dolazila iz URL-a i nigdje se nije poredila sa korisnikom.
//  Dok je jedna baza po klijentu to nije problem — ali pravilo mora da
//  stoji u kodu, ne samo u uputstvu.
// =====================================================================
const firmaZa = req => {
  const k = req.korisnik;
  // Korisnik vezan za firmu vidi SAMO svoju, bez obzira šta piše u adresi.
  if (k && k.firma_id) return k.firma_id;
  // Ako u bazi postoji tačno jedna firma — a po pravilu „jedan klijent,
  // jedna baza“ uvijek je tako — `?firma=` se ignoriše. Rupa time nestaje
  // u stvarnoj postavci, a ne samo u uputstvu.
  if (req.jedinaFirma) return req.jedinaFirma;
  // Više firmi u istoj bazi: izvođač i glavni ključ smiju da biraju.
  return Number(req.query.firma) || Number(req.body?.firma_id) || 1;
};

// Koliko firmi ima u bazi — pita se jednom, pa se pamti.
let _jedina;                       // undefined = još nije provjereno
async function jedinaFirma() {
  if (_jedina !== undefined) return _jedina;
  const r = await upit('SELECT id FROM firma ORDER BY id LIMIT 2');
  _jedina = r.rows.length === 1 ? r.rows[0].id : null;
  return _jedina;
}

zapisiRuter.use('/api/cg', async (req, _res, next) => {
  try { req.jedinaFirma = await jedinaFirma(); } catch { req.jedinaFirma = null; }
  next();
});

// =====================================================================
//  PROZOR ZA UNOS — koliko dana unazad se smije upisati zapis
//
//  Ovo je ono što zapis čini vjerodostojnim. Bez ograničenja na SERVERU,
//  tvrdnja „zapis nastaje tada“ stoji samo na tome što niko neće dirati
//  polje datuma u formi.
//
//  operater  — danas i juče. Zaboravio je juče? Upiše danas, sa datumom juče.
//  bzr       — sedam dana; odgovorno lice sređuje zaostatak, ali ne mjesec unazad.
//  izvodjac  — trideset dana; prvo postavljanje i prenos starih zapisa.
//
//  Zapis unesen kasnije od svog datuma i dalje se PREPOZNAJE:
//  `datum < kreirano::date`. Ne krije se — vidi se u pregledu.
// =====================================================================
const PROZOR = { operater: 1, vozac: 1, bzr: 7, izvodjac: 30 };

// Server na Renderu radi po UTC-u, a magacin po podgoričkom vremenu.
// Razlika je sat ili dva, ali oko ponoći to je CIJEL DAN: zapis unesen
// u 00:30 u Podgorici po UTC-u još pripada jučerašnjem danu, pa bi ga
// provjera odbila kao „datum u budućnosti". Zato se dan računa za
// Crnu Goru, ne za server.
const danasCG = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Podgorica', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

function greskaDatuma(req, datum) {
  if (!datum) return null;
  const d = String(datum).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return `Neispravan datum: ${d}`;
  const danas = danasCG();
  const razlika = Math.round((Date.parse(danas) - Date.parse(d)) / 86400000);
  if (razlika < 0)
    return `Datum ${d} je u budućnosti. Zapis se ne može unijeti unaprijed.`;
  const unazad = PROZOR[req.korisnik?.uloga] ?? 1;
  if (razlika > unazad)
    return `Datum ${d} je ${pade(razlika, 'dan', 'dana', 'dana')} unazad, `
         + `a tvoja uloga smije najviše ${pade(unazad, 'dan', 'dana', 'dana')}. `
         + 'Ograničenje postoji zato što zapis koji se može upisati mjesec unazad ne vrijedi '
         + 'pred inspektorom. Ako zaista treba stariji zapis, neka ga unese odgovorno lice.';
  return null;
}

// Neradni dani se ne traže u zapisima. Podrazumijevano nedjelja (0).
// Klijent koji radi sedam dana šalje ?neradni= (prazno).
const neradniDani = req => {
  const q = req.query.neradni;
  if (q === '') return [];
  return String(q ?? '0').split(',').filter(x => x !== '').map(Number);
};

// =====================================================================
//  ŠIFARNICI
// =====================================================================

for (const [put, tabela, red] of [
  ['dobavljaci', 'dobavljac', 'naziv'],
  ['kupci',      'kupac',     'naziv'],
  ['vozila',     'vozilo',    'registracija'],
  ['artikli',    'artikal',   'naziv'],
]) {
  zapisiRuter.get(`/api/cg/${put}`, unosi, uhvati(async (req, res) => {
    const samoAktivni = req.query.svi ? '' :
      (tabela === 'vozilo' ? 'AND aktivno' : 'AND aktivan');
    const r = await upit(
      `SELECT * FROM ${tabela} WHERE firma_id = $1 ${samoAktivni} ORDER BY ${red}`,
      [firmaZa(req)]);
    res.json(r.rows);
  }));
}

zapisiRuter.post('/api/cg/dobavljaci', vodi, uhvati(async (req, res) => {
  const b = req.body;
  const r = await upit(
    `INSERT INTO dobavljac (firma_id, naziv, adresa, kontakt_osoba, telefon, email,
       vrsta_hrane, broj_objekta, odobren, datum_odobrenja, odobrio, napomena)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (firma_id, naziv) DO UPDATE SET
       adresa = COALESCE(EXCLUDED.adresa, dobavljac.adresa),
       telefon = COALESCE(EXCLUDED.telefon, dobavljac.telefon),
       email = COALESCE(EXCLUDED.email, dobavljac.email),
       vrsta_hrane = COALESCE(EXCLUDED.vrsta_hrane, dobavljac.vrsta_hrane),
       broj_objekta = COALESCE(EXCLUDED.broj_objekta, dobavljac.broj_objekta),
       odobren = EXCLUDED.odobren,
       datum_odobrenja = COALESCE(EXCLUDED.datum_odobrenja, dobavljac.datum_odobrenja),
       odobrio = COALESCE(EXCLUDED.odobrio, dobavljac.odobrio)
     RETURNING *`,
    [firmaZa(req), b.naziv, b.adresa, b.kontakt_osoba, b.telefon, b.email,
     b.vrsta_hrane, b.broj_objekta, !!b.odobren,
     b.datum_odobrenja || null, b.odobrio || ko(req), b.napomena]);
  res.json(r.rows[0]);
}));

// ---------------------------------------------------------------- lica
// Spisak lica koja rukuju hranom. Upisuje se broj i rok važenja sanitarne
// knjižice — NIKAD nalaz ljekarskog pregleda. Rok je podatak o dokumentu,
// nalaz je podatak o zdravlju i u ovoj bazi nema šta da traži.
zapisiRuter.get('/api/cg/lica', vodi, uhvati(async (req, res) => {
  const r = await upit(
    `SELECT * FROM v_lica WHERE firma_id = $1
      ORDER BY knjizica_vazi_do NULLS FIRST, ime_prezime`, [firmaZa(req)]);
  res.json(r.rows);
}));

zapisiRuter.post('/api/cg/lica', vodi, uhvati(async (req, res) => {
  const b = req.body;
  if (!b.ime_prezime || !String(b.ime_prezime).trim())
    return res.status(400).json({ greska: 'Ime i prezime su obavezni.' });
  if (b.knjizica_vazi_do && b.knjizica_izdata && b.knjizica_vazi_do < b.knjizica_izdata)
    return res.status(400).json({ greska: 'Rok važenja je prije datuma izdavanja.' });
  const dataSifra = Object.prototype.hasOwnProperty.call(b, 'sifra');
  const sifra = dataSifra ? (String(b.sifra ?? '').trim() || null) : null;
  const r = await upit(
    `INSERT INTO lice (firma_id, ime_prezime, radno_mjesto, posao_sa_hranom,
       knjizica_broj, knjizica_izdata, knjizica_vazi_do, sifra, napomena, aktivan,
       rukuje_hranom)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     -- $12 govori da li je šifra izričito poslata (vidi CASE ispod)
     ON CONFLICT (firma_id, ime_prezime) DO UPDATE SET
       radno_mjesto     = COALESCE(EXCLUDED.radno_mjesto, lice.radno_mjesto),
       posao_sa_hranom  = COALESCE(EXCLUDED.posao_sa_hranom, lice.posao_sa_hranom),
       knjizica_broj    = COALESCE(EXCLUDED.knjizica_broj, lice.knjizica_broj),
       knjizica_izdata  = COALESCE(EXCLUDED.knjizica_izdata, lice.knjizica_izdata),
       knjizica_vazi_do = COALESCE(EXCLUDED.knjizica_vazi_do, lice.knjizica_vazi_do),
       -- Šifra se mijenja samo kad je pregledač stvarno pošalje. Prazno
       -- poslato namjerno znači BRISANJE, a izostavljeno polje ne dira staru.
       sifra            = CASE WHEN $12::bool THEN EXCLUDED.sifra
                               ELSE COALESCE(EXCLUDED.sifra, lice.sifra) END,
       napomena         = COALESCE(EXCLUDED.napomena, lice.napomena),
       aktivan          = EXCLUDED.aktivan,
       rukuje_hranom    = EXCLUDED.rukuje_hranom
     RETURNING *`,
    [firmaZa(req), String(b.ime_prezime).trim(), b.radno_mjesto || null,
     b.posao_sa_hranom || null, b.knjizica_broj || null, b.knjizica_izdata || null,
     b.knjizica_vazi_do || null, sifra, b.napomena || null,
     b.aktivan !== false, b.rukuje_hranom !== false, dataSifra])
    .catch(e => {
      if (e.code === '23505' && /sifra/.test(e.constraint || ''))
        { const g = new Error('Ta šifra već pripada drugom zaposlenom.'); g.status = 409; throw g; }
      throw e;
    });
  res.json(r.rows[0]);
}));

// ------------------------------------------------------- moja tabla
// Svako ko ima nalog vidi svoje: šta je danas unio, dokad mu važi knjižica,
// i šta se od njega očekuje. Magacioner do sada nije imao nijedan ekran sa
// svojim imenom — samo obrasce.
zapisiRuter.get('/api/cg/moje', unosi, uhvati(async (req, res) => {
  const f = firmaZa(req);
  const k = req.korisnik || {};
  let lice = null;
  if (k.id) {
    const r = await upit(
      `SELECT l.* FROM v_lica l JOIN korisnik u ON u.lice_id = l.id
        WHERE u.id = $1`, [k.id]).catch(() => ({ rows: [] }));
    lice = r.rows[0] || null;
  }
  const potpis = lice?.sifra || k.ime || null;

  // Broji se po NALOGU (`uneo_korisnik_id`), ne po otkucanom imenu — to je
  // jedino pouzdano. Stari zapisi nemaju nalog, pa se za njih i dalje gleda
  // potpis (šifra ili ime), inače bi čovjeku nestala istorija.
  const kljucevi = [lice?.sifra, k.ime].filter(Boolean);
  const moji = await upit(
    `SELECT obrazac, datum, vrijeme FROM zapis
      WHERE firma_id = $1
        AND (uneo_korisnik_id = $2
             OR (uneo_korisnik_id IS NULL AND izvrsilac = ANY($3::text[])))
        AND datum >= CURRENT_DATE - 7
        AND NOT EXISTS (SELECT 1 FROM zapis n WHERE n.ispravlja_id = zapis.id)
      ORDER BY datum DESC, vrijeme DESC NULLS LAST LIMIT 40`,
    [f, k.id || null, kljucevi.length ? kljucevi : ['']]).catch(() => ({ rows: [] }));

  const danas = danasCG();
  // `datum` iz pg-a je Date, a String(Date) daje „Thu Sep 17 2026…" — poređenje
  // sa „2026-09-17" nikad ne bi prošlo i tabla bi uvijek pisala nula za danas.
  const uDan = d => (d instanceof Date
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Podgorica',
        year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
    : String(d).slice(0, 10));
  const danasnji = moji.rows.filter(z => uDan(z.datum) === danas);

  // Šta se danas još ne vidi ni od koga — magacioneru je to radni spisak.
  const fali = await upit(
    `SELECT o FROM unnest(ARRAY['P3','P7','P8']) o
      WHERE NOT EXISTS (SELECT 1 FROM zapis z
                         WHERE z.firma_id = $1 AND z.datum = $2::date AND z.obrazac = o
                           AND NOT EXISTS (SELECT 1 FROM zapis n WHERE n.ispravlja_id = z.id))`,
    [f, danas]);

  res.json({
    ime: k.ime || null,
    uloga: k.uloga || null,
    lice,
    potpis,
    danas: danasnji.length,
    sedam_dana: moji.rows.length,
    posljednji: moji.rows.slice(0, 8),
    fali_danas: fali.rows.map(x => x.o),
  });
}));

// ------------------------------------------------- godišnji plan obuke
// Plan, ne zapis: pravi se unaprijed, ima stanje i ostaje u evidenciji i kad
// se ne ostvari. Prilog 13 Vodiča UBH; nije zakonom propisan obrazac.
zapisiRuter.get('/api/cg/plan-obuke', vodi, uhvati(async (req, res) => {
  const godina = Number(req.query.godina) || new Date().getFullYear();
  const r = await upit(
    `SELECT * FROM v_plan_obuke WHERE firma_id = $1 AND godina = $2
      ORDER BY planirani_termin NULLS LAST, ciljna_grupa`, [firmaZa(req), godina]);
  const godine = await upit(
    `SELECT DISTINCT godina FROM plan_obuke WHERE firma_id = $1 ORDER BY godina DESC`,
    [firmaZa(req)]);
  res.json({ godina, stavke: r.rows, godine: godine.rows.map(x => x.godina) });
}));

zapisiRuter.post('/api/cg/plan-obuke', vodi, uhvati(async (req, res) => {
  const b = req.body;
  if (!b.ciljna_grupa || !String(b.ciljna_grupa).trim())
    return res.status(400).json({ greska: 'Ciljna grupa je obavezna — ko ide na obuku.' });
  if (!b.tema || !String(b.tema).trim())
    return res.status(400).json({ greska: 'Tema je obavezna.' });
  const godina = Number(b.godina) || new Date().getFullYear();
  if (b.id) {
    const r = await upit(
      `UPDATE plan_obuke SET ciljna_grupa=$2, tema=$3, oblik=$4, planirani_termin=$5,
              trajanje_sati=$6, izvodjac=$7, odgovoran=$8, napomena=$9
        WHERE id=$1 AND firma_id=$10 RETURNING *`,
      [b.id, b.ciljna_grupa.trim(), b.tema.trim(), b.oblik || null,
       b.planirani_termin || null, b.trajanje_sati || null, b.izvodjac || null,
       b.odgovoran || null, b.napomena || null, firmaZa(req)]);
    if (!r.rowCount) return res.status(404).json({ greska: 'Stavka plana ne postoji.' });
    return res.json(r.rows[0]);
  }
  const r = await upit(
    `INSERT INTO plan_obuke (firma_id, godina, ciljna_grupa, tema, oblik,
       planirani_termin, trajanje_sati, izvodjac, odgovoran, napomena)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [firmaZa(req), godina, b.ciljna_grupa.trim(), b.tema.trim(), b.oblik || null,
     b.planirani_termin || null, b.trajanje_sati || null, b.izvodjac || null,
     b.odgovoran || null, b.napomena || null]);
  res.json(r.rows[0]);
}));

// Obuka održana — stavka se ne briše, nego dobija datum izvršenja.
zapisiRuter.post('/api/cg/plan-obuke/:id/izvrseno', vodi, uhvati(async (req, res) => {
  const d = req.body.izvrseno || null;
  if (d && d > danasCG())
    return res.status(400).json({ greska: 'Datum održavanja ne može biti u budućnosti.' });
  const r = await upit(
    `UPDATE plan_obuke SET izvrseno = $2 WHERE id = $1 AND firma_id = $3 RETURNING *`,
    [req.params.id, d, firmaZa(req)]);
  if (!r.rowCount) return res.status(404).json({ greska: 'Stavka plana ne postoji.' });
  res.json(r.rows[0]);
}));

zapisiRuter.post('/api/cg/kupci', vodi, uhvati(async (req, res) => {
  const b = req.body;
  // Telefon je obavezan: bez njega povlačenje po čl. 28 ne može da se izvede.
  if (!b.telefon) return res.status(400).json({
    greska: 'Telefon kupca je obavezan — bez njega povlačenje robe nije izvodljivo.' });
  const r = await upit(
    `INSERT INTO kupac (firma_id, naziv, adresa, kontakt_osoba, telefon, email)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (firma_id, naziv) DO UPDATE SET
       adresa = COALESCE(EXCLUDED.adresa, kupac.adresa),
       kontakt_osoba = COALESCE(EXCLUDED.kontakt_osoba, kupac.kontakt_osoba),
       telefon = EXCLUDED.telefon,
       email = COALESCE(EXCLUDED.email, kupac.email)
     RETURNING *`,
    [firmaZa(req), b.naziv, b.adresa, b.kontakt_osoba, b.telefon, b.email]);
  res.json(r.rows[0]);
}));

zapisiRuter.post('/api/cg/vozila', vodi, uhvati(async (req, res) => {
  const b = req.body;
  const r = await upit(
    `INSERT INTO vozilo (firma_id, registracija, opis, ima_rashladu, rezim_min,
       rezim_max, poslednji_servis)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (firma_id, registracija) DO UPDATE SET
       opis = COALESCE(EXCLUDED.opis, vozilo.opis),
       ima_rashladu = EXCLUDED.ima_rashladu,
       rezim_min = COALESCE(EXCLUDED.rezim_min, vozilo.rezim_min),
       rezim_max = COALESCE(EXCLUDED.rezim_max, vozilo.rezim_max),
       poslednji_servis = COALESCE(EXCLUDED.poslednji_servis, vozilo.poslednji_servis)
     RETURNING *`,
    [firmaZa(req), b.registracija, b.opis, !!b.ima_rashladu,
     broj(b.rezim_min), broj(b.rezim_max), b.poslednji_servis || null]);
  res.json(r.rows[0]);
}));

zapisiRuter.post('/api/cg/artikli', vodi, uhvati(async (req, res) => {
  const b = req.body;
  const r = await upit(
    `INSERT INTO artikal (firma_id, naziv, grupa, jedinica, granica_min, granica_max,
       tolerancija, granica_izvor, granica_potvrdio, granica_potvrdjeno)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (firma_id, naziv) DO UPDATE SET
       grupa = EXCLUDED.grupa,
       jedinica = EXCLUDED.jedinica,
       granica_min = EXCLUDED.granica_min,
       granica_max = EXCLUDED.granica_max,
       tolerancija = EXCLUDED.tolerancija,
       granica_izvor = COALESCE(EXCLUDED.granica_izvor, artikal.granica_izvor),
       granica_potvrdio = EXCLUDED.granica_potvrdio,
       granica_potvrdjeno = EXCLUDED.granica_potvrdjeno
     RETURNING *`,
    [firmaZa(req), b.naziv, b.grupa || 'G1', b.jedinica || 'kg',
     broj(b.granica_min), broj(b.granica_max), broj(b.tolerancija) ?? 4,
     b.granica_izvor, b.granica_potvrdio || null, b.granica_potvrdjeno || null]);
  res.json(r.rows[0]);
}));

// Artikli kojima granica nije potvrđena. Dok su ovdje, automatska
// ocjena odstupanja im se ne vjeruje.
zapisiRuter.get('/api/cg/nepotvrdjene-granice', vodi, uhvati(async (req, res) => {
  const r = await upit(
    `SELECT id, naziv, grupa, granica_min, granica_max, granica_izvor
       FROM artikal
      WHERE firma_id = $1 AND aktivan AND grupa IN ('G2','G3')
        AND granica_potvrdio IS NULL
      ORDER BY naziv`, [firmaZa(req)]);
  res.json(r.rows);
}));

// =====================================================================
//  KKT 1 — PRIJEM  (ujedno korak nazad, čl. 27)
// =====================================================================

zapisiRuter.post('/api/cg/prijem', prima, uhvati(async (req, res) => {
  const b = req.body;
  const lozDatum = greskaDatuma(req, b.datum);
  if (lozDatum) return res.status(400).json({ greska: lozDatum });
  if (!b.lot) return res.status(400).json({
    greska: 'Broj serije/lota je obavezan — bez njega sledljivost ne postoji (čl. 27).' });

  const a = (await upit('SELECT * FROM artikal WHERE id = $1', [b.artikal_id])).rows[0];
  if (!a) return res.status(400).json({ greska: 'Nepoznat artikal.' });

  const d = (await upit('SELECT odobren, naziv FROM dobavljac WHERE id = $1',
    [b.dobavljac_id])).rows[0];
  if (!d) return res.status(400).json({ greska: 'Nepoznat dobavljač.' });

  const t = broj(b.temperatura);
  let ishod = b.ishod;
  let granica = null;

  // Automatska ocjena SAMO ako je granica potvrđena od strane klijenta.
  if (a.granica_max !== null && a.granica_potvrdio) {
    granica = Number(a.granica_max);
    if (t !== null) {
      const preko = t - granica;
      if (preko > Number(a.tolerancija)) ishod = 'odbijeno';
      else if (preko > 0)                ishod = 'prihvaceno_uz_mjeru';
      else if (!ishod)                   ishod = 'prihvaceno';
    }
  }
  ishod = ishod || 'prihvaceno';

  if (ishod !== 'prihvaceno' && !b.korektivna_mjera)
    return res.status(400).json({
      greska: 'Odstupanje mora imati korektivnu mjeru. Zapis bez nje je nalaz protiv firme.' });

  const upozorenja = [];
  if (!d.odobren) upozorenja.push(
    `Dobavljač „${d.naziv}" nije na listi odobrenih (PRP-9). Prijem je zabilježen, ali odobri ga ili obrazloži.`);
  if (a.granica_max !== null && !a.granica_potvrdio) upozorenja.push(
    `Kritična granica za „${a.naziv}" nije potvrđena iz deklaracije — ocjena odstupanja nije izvedena automatski.`);
  if (b.rok_trajanja && new Date(b.rok_trajanja) < new Date())
    upozorenja.push('Rok trajanja je istekao.');

  const r = await upit(
    `INSERT INTO prijem (firma_id, datum, vrijeme, dobavljac_id, artikal_id, lot,
       kolicina, rok_trajanja, broj_otpremnice, temperatura, granica_primjenjena,
       ishod, korektivna_mjera, vozilo_dobavljaca, izvrsilac, napomena, ispravlja_id,
       uneo_korisnik_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     RETURNING *`,
    [firmaZa(req), b.datum || new Date(), b.vrijeme || null, b.dobavljac_id,
     b.artikal_id, b.lot.trim(), broj(b.kolicina), b.rok_trajanja || null,
     b.broj_otpremnice, t, granica, ishod, b.korektivna_mjera || null,
     b.vozilo_dobavljaca, await izvrsilacZa(req, b.izvrsilac), b.napomena,
     b.ispravlja_id || null, unioId(req)]);

  res.json({ prijem: r.rows[0], upozorenja });
}));

zapisiRuter.get('/api/cg/prijem', unosi, uhvati(async (req, res) => {
  const r = await upit(
    `SELECT * FROM v_sledljivost_nazad
      WHERE firma_id = $1 ${ogranicenje(req, 'datum_prijema')}
        ${samoMoje(req, await potpisNaloga(req))}
      ORDER BY datum_prijema DESC, prijem_id DESC LIMIT $2`,
    [firmaZa(req), Number(req.query.limit) || 200]);
  res.json(r.rows);
}));

// Spisak isporuka. Vozač vidi svoje ture, odgovorno lice sve.
zapisiRuter.get('/api/cg/isporuka', unosi, uhvati(async (req, res) => {
  const r = await upit(
    `SELECT * FROM v_sledljivost_napred
      WHERE firma_id = $1 ${ogranicenje(req, 'datum_isporuke')}
        ${samoMojeIsporuke(req, await potpisNaloga(req))}
      ORDER BY datum_isporuke DESC, isporuka_id DESC LIMIT $2`,
    [firmaZa(req), Number(req.query.limit) || 200]);
  res.json(r.rows);
}));

// =====================================================================
//  KKT 3 — ISPORUKA  (korak naprijed, čl. 27)
// =====================================================================

zapisiRuter.post('/api/cg/isporuka', vozi, uhvati(async (req, res) => {
  const b = req.body;
  const lozDatum = greskaDatuma(req, b.datum);
  if (lozDatum) return res.status(400).json({ greska: lozDatum });
  const p = (await upit(
    `SELECT p.*, a.granica_max, a.granica_potvrdio, a.naziv AS artikal
       FROM prijem p JOIN artikal a ON a.id = p.artikal_id WHERE p.id = $1`,
    [b.prijem_id])).rows[0];
  if (!p) return res.status(400).json({ greska: 'Nepoznata prijemna stavka (lot).' });

  const tu = broj(b.temp_utovar), ti = broj(b.temp_isporuka);
  let odstupanje = !!b.odstupanje;
  if (p.granica_max !== null && p.granica_potvrdio) {
    const g = Number(p.granica_max);
    if ((tu !== null && tu > g) || (ti !== null && ti > g)) odstupanje = true;
  }
  if (b.vozilo_provjereno === false) odstupanje = true;

  if (odstupanje && !b.korektivna_mjera)
    return res.status(400).json({
      greska: 'Odstupanje pri isporuci mora imati korektivnu mjeru.' });

  const upozorenja = [];
  if (!b.vozilo_provjereno) upozorenja.push(
    'Kontrola vozila (Prilog D1) nije potvrđena za ovu turu.');
  if (p.rok_trajanja && new Date(p.rok_trajanja) < new Date())
    upozorenja.push('Isporučuje se lot kojem je rok trajanja istekao.');

  const r = await upit(
    `INSERT INTO isporuka (firma_id, datum, kupac_id, prijem_id, kolicina,
       broj_otpremnice, vozilo_id, vozac, temp_utovar, temp_isporuka,
       vozilo_provjereno, odstupanje, korektivna_mjera, preuzeo, ispravlja_id,
       uneo_korisnik_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING *`,
    [firmaZa(req), b.datum || new Date(), b.kupac_id, b.prijem_id,
     broj(b.kolicina), b.broj_otpremnice, b.vozilo_id || null,
     await izvrsilacZa(req, b.vozac),
     tu, ti, !!b.vozilo_provjereno, odstupanje, b.korektivna_mjera || null,
     b.preuzeo, b.ispravlja_id || null, unioId(req)]);

  res.json({ isporuka: r.rows[0], upozorenja });
}));


// Zalihe po seriji — koliko je od kog lota još ostalo.
// Treba ekranu isporuke: bira se lot, ne artikal, jer sledljivost ide po lotu.
zapisiRuter.get('/api/cg/zalihe', unosi, uhvati(async (req, res) => {
  const r = await upit(
    `SELECT p.id AS prijem_id, p.lot, a.naziv AS artikal, a.jedinica, a.grupa,
            a.granica_max, a.granica_potvrdio IS NOT NULL AS granica_potvrdjena,
            d.naziv AS dobavljac, p.datum AS datum_prijema, p.rok_trajanja,
            p.kolicina AS primljeno,
            COALESCE((SELECT SUM(i.kolicina) FROM isporuka i
                       WHERE i.prijem_id = p.id
                         AND NOT EXISTS (SELECT 1 FROM isporuka n WHERE n.ispravlja_id = i.id)), 0) AS isporuceno,
            p.kolicina - COALESCE((SELECT SUM(i.kolicina) FROM isporuka i
                       WHERE i.prijem_id = p.id
                         AND NOT EXISTS (SELECT 1 FROM isporuka n WHERE n.ispravlja_id = i.id)), 0) AS ostalo
       FROM prijem p
       JOIN artikal a   ON a.id = p.artikal_id
       JOIN dobavljac d ON d.id = p.dobavljac_id
      WHERE p.firma_id = $1 AND p.ishod <> 'odbijeno'
        AND NOT EXISTS (SELECT 1 FROM prijem n WHERE n.ispravlja_id = p.id)
      ORDER BY (p.rok_trajanja IS NULL), p.rok_trajanja, p.datum`,
    [firmaZa(req)]);
  // FEFO: prvo ističe, prvo izlazi — zato je ovaj redoslijed, a ne po datumu prijema.
  res.json(req.query.sve ? r.rows : r.rows.filter(x => Number(x.ostalo) > 0));
}));

// =====================================================================
//  SLEDLJIVOST — upit koji mora da odgovori na vježbi povlačenja
// =====================================================================

zapisiRuter.get('/api/cg/sledljivost/:lot', vodi, uhvati(async (req, res) => {
  const firma = firmaZa(req);
  const lot = req.params.lot;
  const [nazad, napred] = await Promise.all([
    upit(`SELECT * FROM v_sledljivost_nazad
           WHERE firma_id = $1 AND lower(lot) = lower($2)`, [firma, lot]),
    upit(`SELECT * FROM v_sledljivost_napred
           WHERE firma_id = $1 AND lower(lot) = lower($2)
           ORDER BY datum_isporuke`, [firma, lot]),
  ]);
  const primljeno  = nazad.rows.reduce((s, r) => s + Number(r.primljeno || 0), 0);
  const isporuceno = napred.rows.reduce((s, r) => s + Number(r.isporuceno || 0), 0);
  res.json({
    lot,
    nazad: nazad.rows,
    napred: napred.rows,
    zbir: {
      primljeno, isporuceno,
      na_zalihama: +(primljeno - isporuceno).toFixed(3),
      broj_kupaca: new Set(napred.rows.map(r => r.kupac)).size,
    },
    // Lista telefona je ono što se stvarno koristi u povlačenju.
    kontakti: [...new Map(napred.rows.map(r =>
      [r.kupac, { kupac: r.kupac, telefon: r.kupac_telefon, adresa: r.kupac_adresa }]
    )).values()],
  });
}));

// =====================================================================
//  OPŠTI ZAPISI  (Prilozi P1, P2, P3, P6, P7, P8, P11, P12, P13, D1, D3, D4)
// =====================================================================

zapisiRuter.post('/api/cg/zapis', unosi, uhvati(async (req, res) => {
  const b = req.body;
  if (!b.obrazac) return res.status(400).json({ greska: 'Nedostaje oznaka obrasca.' });
  const lozDatum = greskaDatuma(req, b.datum);
  if (lozDatum) return res.status(400).json({ greska: lozDatum });
  if (b.odstupanje && !b.korektivna_mjera)
    return res.status(400).json({
      greska: 'Odstupanje mora imati korektivnu mjeru.' });

  const r = await upit(
    `INSERT INTO zapis (firma_id, obrazac, datum, vrijeme, podaci, odstupanje,
       korektivna_mjera, izvrsilac, ispravlja_id, uneo_korisnik_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [firmaZa(req), b.obrazac, b.datum || new Date(), b.vrijeme || null,
     JSON.stringify(b.podaci || {}), !!b.odstupanje, b.korektivna_mjera || null,
     await izvrsilacZa(req, b.izvrsilac), b.ispravlja_id || null, unioId(req)]);
  res.json(r.rows[0]);
}));

zapisiRuter.get('/api/cg/zapis/:obrazac', unosi, uhvati(async (req, res) => {
  const r = await upit(
    `SELECT zapis.*,
            zapis.ispravlja_id IS NOT NULL     AS je_ispravka,
            zapis.datum < zapis.kreirano::date AS naknadno,
            (zapis.kreirano::date - zapis.datum)::int AS dana_kasnije
       FROM zapis
      WHERE firma_id = $1 AND obrazac = $2
        AND NOT EXISTS (SELECT 1 FROM zapis n WHERE n.ispravlja_id = zapis.id)
        ${ogranicenje(req)}
        ${samoMoje(req, await potpisNaloga(req))}
        ${req.query.od ? 'AND datum >= $4' : ''}
        ${req.query.do ? `AND datum <= $${req.query.od ? 5 : 4}` : ''}
      ORDER BY datum DESC, id DESC LIMIT $3`,
    [firmaZa(req), req.params.obrazac, Number(req.query.limit) || 400,
     ...(req.query.od ? [req.query.od] : []), ...(req.query.do ? [req.query.do] : [])]);
  res.json(r.rows);
}));

// Kontrola zapisa od strane odgovornog lica — mjesečna verifikacija.
zapisiRuter.post('/api/cg/zapis/:id/kontrola', vodi, uhvati(async (req, res) => {
  const r = await upit(
    `UPDATE zapis SET kontrolor = $2, kontrolisano = CURRENT_DATE
      WHERE id = $1 RETURNING *`, [req.params.id, req.body.kontrolor || ko(req)]);
  res.json(r.rows[0]);
}));

// =====================================================================
//  NADZOR — šta odgovorno lice gleda mjesečno, i šta auditor traži
// =====================================================================

// Trag ispravki — šta je bilo upisano i na šta je ispravljeno.
// Ovo se pokazuje inspektoru: greška je uočena i ispravljena, nije nestala.
zapisiRuter.get('/api/cg/ispravke', vodi, uhvati(async (req, res) => {
  const r = await upit(
    `SELECT * FROM v_trag_ispravki WHERE firma_id = $1
      ORDER BY ispravljeno DESC LIMIT $2`,
    [firmaZa(req), Number(req.query.limit) || 200]);
  res.json(r.rows);
}));

zapisiRuter.get('/api/cg/odstupanja', vodi, uhvati(async (req, res) => {
  const r = await upit(
    `SELECT * FROM v_odstupanja
      WHERE firma_id = $1 AND datum >= COALESCE($2::date, CURRENT_DATE - 90)
      ORDER BY datum DESC`, [firmaZa(req), req.query.od || null]);
  res.json(r.rows);
}));

// Rupe u dnevnim zapisima. Najčešći nalaz na inspekciji je dan koji
// nedostaje, a ne pogrešna vrijednost.
zapisiRuter.get('/api/cg/rupe', vodi, uhvati(async (req, res) => {
  const obrasci = (req.query.obrasci || 'P3,P7,P8').split(',');
  const dana = Number(req.query.dana) || 30;
  const neradni = neradniDani(req);
  const r = await upit(
    `WITH dani AS (
       SELECT generate_series(CURRENT_DATE - $2::int, CURRENT_DATE - 1, '1 day')::date AS d
     ), trazeni AS (
       SELECT d, o FROM dani, unnest($3::text[]) AS o
     )
     SELECT t.d AS datum, t.o AS obrazac
       FROM trazeni t
       LEFT JOIN zapis z ON z.firma_id = $1 AND z.datum = t.d
                        AND z.obrazac = t.o
                        AND NOT EXISTS (SELECT 1 FROM zapis n WHERE n.ispravlja_id = z.id)
      WHERE z.id IS NULL
        AND NOT (extract(dow FROM t.d)::int = ANY($4::int[]))
      ORDER BY t.d DESC, t.o`,
    [firmaZa(req), dana, obrasci, neradni]);
  res.json(r.rows);
}));

// Spremnost za inspekciju — jedan ekran, jedan odgovor.
zapisiRuter.get('/api/cg/spremnost', vodi, uhvati(async (req, res) => {
  const f = firmaZa(req);
  const neradni = neradniDani(req);
  const [rupe, odst, granice, dob, kup, vjezba, knj] = await Promise.all([
    upit(`SELECT COUNT(*)::int n FROM (
            SELECT generate_series(CURRENT_DATE - 30, CURRENT_DATE - 1, '1 day')::date d
          ) g CROSS JOIN unnest(ARRAY['P3','P7','P8']) o
          LEFT JOIN zapis z ON z.firma_id=$1 AND z.datum=g.d AND z.obrazac=o
                           AND NOT EXISTS (SELECT 1 FROM zapis n WHERE n.ispravlja_id = z.id)
          WHERE z.id IS NULL
            AND NOT (extract(dow FROM g.d)::int = ANY($2::int[]))`, [f, neradni]),
    upit(`SELECT COUNT(*)::int n FROM v_odstupanja
           WHERE firma_id=$1 AND datum >= CURRENT_DATE - 90
             AND (korektivna_mjera IS NULL OR korektivna_mjera = '')`, [f]),
    upit(`SELECT COUNT(*)::int n FROM artikal
           WHERE firma_id=$1 AND aktivan AND grupa IN ('G2','G3')
             AND granica_potvrdio IS NULL`, [f]),
    upit(`SELECT COUNT(*)::int n FROM dobavljac
           WHERE firma_id=$1 AND aktivan AND NOT odobren`, [f]),
    upit(`SELECT COUNT(*)::int n FROM kupac
           WHERE firma_id=$1 AND aktivan AND (telefon IS NULL OR telefon='')`, [f]),
    upit(`SELECT MAX(datum) d FROM zapis
           WHERE firma_id=$1 AND obrazac='D3'`, [f]),
    // Sanitarne knjižice — jedina obaveza ovdje sa izričitom kaznom.
    upit(`SELECT
            COUNT(*) FILTER (WHERE stanje_knjizice = 'istekla')::int      istekle,
            COUNT(*) FILTER (WHERE stanje_knjizice = 'ističe')::int       isticu,
            COUNT(*) FILTER (WHERE stanje_knjizice = 'nema podatka')::int prazne
          FROM v_lica WHERE firma_id=$1`, [f]).catch(() => ({
      rows: [{ istekle: 0, isticu: 0, prazne: 0 }] })),
  ]);

  const nalazi = [];
  const dodaj = (t, n, p, r) => { if (n > 0) nalazi.push({ tezina: t, broj: n, poruka: p, rjesenje: r }); };

  dodaj('visoka', rupe.rows[0].n,
    `${pade(rupe.rows[0].n, 'dan', 'dana', 'dana')} bez obaveznog zapisa u posljednjih 30 dana`,
    'Popuni unazad samo ono što je stvarno mjereno. Izmišljen zapis je teži prekršaj od praznog.');
  dodaj('visoka', odst.rows[0].n,
    `${pade(odst.rows[0].n, 'odstupanje', 'odstupanja', 'odstupanja')} bez korektivne mjere`,
    'Svako odstupanje mora imati zapisanu mjeru i ko ju je izveo.');
  dodaj('srednja', granice.rows[0].n,
    `${pade(granice.rows[0].n, 'artikal', 'artikla', 'artikala')} bez potvrđene kritične granice`,
    'Potvrdi granice iz deklaracije proizvođača. Do tada ocjena odstupanja nije automatska.');
  dodaj('srednja', dob.rows[0].n,
    `${pade(dob.rows[0].n, 'dobavljač', 'dobavljača', 'dobavljača')} nije na listi odobrenih`,
    'PRP-9: dobavljač se odobrava prije prve isporuke.');
  dodaj('visoka', kup.rows[0].n,
    `${pade(kup.rows[0].n, 'kupac', 'kupca', 'kupaca')} bez telefona`,
    'Bez telefona povlačenje po čl. 28 nije izvodljivo.');

  const k = knj.rows[0];
  dodaj('visoka', k.istekle,
    `${pade(k.istekle, 'lice', 'lica', 'lica')} sa isteklom sanitarnom knjižicom`,
    'Čl. 31 Zakona o zaštiti stanovništva od zaraznih bolesti. Kazna 2.500–20.000 €. '
    + 'Dok knjižica ne važi, to lice ne smije da rukuje hranom.');
  dodaj('srednja', k.isticu,
    `${pade(k.isticu, 'knjižica ističe', 'knjižice ističu', 'knjižica ističe')} u narednih 30 dana`,
    'Zakaži pregled sada — poslije isteka je prekršaj, ne propust.');
  dodaj('srednja', k.prazne,
    `${pade(k.prazne, 'lice', 'lica', 'lica')} bez upisanog roka knjižice`,
    'Upiši broj i rok važenja. Nepoznat rok se na kontroli računa kao da je nema.');

  const vd = vjezba.rows[0].d;
  const starost = vd ? Math.floor((Date.now() - new Date(vd)) / 86400000) : null;
  if (!vd) nalazi.push({ tezina: 'visoka', broj: 1,
    poruka: 'Vježba povlačenja nikad nije izvedena',
    rjesenje: 'Godišnja vježba je dio verifikacije i traže je auditori kupaca.' });
  else if (starost > 365) nalazi.push({ tezina: 'srednja', broj: 1,
    poruka: `Posljednja vježba povlačenja prije ${starost} dana`,
    rjesenje: 'Vježba se izvodi najmanje jednom godišnje.' });

  res.json({
    spreman: nalazi.filter(n => n.tezina === 'visoka').length === 0,
    nalazi,
    poslednja_vjezba: vd,
  });
}));

// =====================================================================
//  IZVOZ PODATAKA  (član 7 ugovora)
//
//  Klijent ima pravo da svoje podatke dobije u otvorenom formatu.
//  Ako to ne može, nije kupio alat nego je ušao u zavisnost — i to je
//  prvo pitanje koje postavi svaki ozbiljan kupac i svaki auditor.
//
//  Format: CSV, tačka-zarez kao razdvojnik, UTF-8 sa BOM.
//  Tačka-zarez i BOM su zbog Excela na našim podešavanjima — bez njih
//  se ćirilica/dijakritika raspadne i sve upadne u jednu kolonu.
// =====================================================================

const IZVOZI = {
  sledljivost: { izvor: 'v_izvoz_sledljivost', red: 'datum_prijema, serija',
                 opis: 'Prijem i isporuka povezani serijom — korak nazad i korak naprijed' },
  prijem:      { izvor: 'v_sledljivost_nazad', red: 'datum_prijema DESC',
                 opis: 'Kontrola prijema (KKT 1)' },
  isporuka:    { izvor: 'v_sledljivost_napred', red: 'datum_isporuke DESC',
                 opis: 'Utovar i prevoz (KKT 3)' },
  odstupanja:  { izvor: 'v_odstupanja', red: 'datum DESC',
                 opis: 'Sva odstupanja i korektivne mjere' },
  ispravke:    { izvor: 'v_trag_ispravki', red: 'ispravljeno DESC',
                 opis: 'Trag ispravki — šta je pisalo i na šta je ispravljeno' },
  dobavljaci:  { izvor: 'dobavljac', red: 'naziv', opis: 'Lista dobavljača' },
  kupci:       { izvor: 'kupac',     red: 'naziv', opis: 'Lista kupaca' },
  artikli:     { izvor: 'artikal',   red: 'naziv', opis: 'Artikli i kritične granice' },
  vozila:      { izvor: 'vozilo',    red: 'registracija', opis: 'Vozila' },
  lica:        { izvor: 'v_lica',    red: 'ime_prezime',
                 opis: 'Lica koja rukuju hranom i važenje sanitarnih knjižica' },
  plan_obuke:  { izvor: 'v_plan_obuke', red: 'godina DESC, planirani_termin',
                 opis: 'Godišnji plan obuke — planirano, održano, propušteno' },
};

// Dnevni zapisi se izvoze posebno: `podaci` je JSONB, pa se svaki obrazac
// razlikuje po kolonama. Sve se spaja u jedno čitljivo polje.
const UPIT_ZAPISI = `
  SELECT z.obrazac, z.datum, z.vrijeme, z.izvrsilac,
         z.odstupanje, z.korektivna_mjera,
         z.datum < z.kreirano::date AS naknadno,
         z.kreirano,
         (SELECT string_agg(replace(e.k,'_',' ') || ': ' || e.v, ' · ' ORDER BY e.k)
            FROM jsonb_each_text(z.podaci) AS e(k,v))  AS vrijednosti
    FROM zapis z
   WHERE z.firma_id = $1
     AND NOT EXISTS (SELECT 1 FROM zapis n WHERE n.ispravlja_id = z.id)
   ORDER BY z.datum DESC, z.obrazac`;

function uCsv(v) {
  if (v === null || v === undefined) return '';
  if (v === true)  return 'DA';
  if (v === false) return 'NE';
  if (v instanceof Date) {
    // Čist datum (ponoć po UTC-u) ide bez vremena. Trenutak unosa —
    // `kreirano` — ide sa vremenom, i to po podgoričkom, jer ga čita
    // klijent i inspektor, a ne server.
    const ponoc = v.getUTCHours() === 0 && v.getUTCMinutes() === 0
               && v.getUTCSeconds() === 0 && v.getUTCMilliseconds() === 0;
    if (ponoc) return v.toISOString().slice(0, 10);
    const f = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Podgorica', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false }).format(v);
    return f.replace(',', '');
  }
  const s = String(v);
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// „Distributer d.o.o." → „Distributer-d-o-o". Bez ovoga ime fajla dobije
// dvostruke crtice i završi crticom.
const cistoIme = s => String(s).replace(/[^\p{L}\p{N}]+/gu, '-')
  .replace(/-+/g, '-').replace(/^-|-$/g, '') || 'firma';

function csv(redovi) {
  if (!redovi.length) return '﻿(nema podataka)\r\n';
  const kolone = Object.keys(redovi[0]);
  const linije = [kolone.join(';')];
  for (const r of redovi) linije.push(kolone.map(k => uCsv(r[k])).join(';'));
  return '﻿' + linije.join('\r\n') + '\r\n';
}

zapisiRuter.get('/api/cg/izvoz', vodi, uhvati(async (req, res) => {
  const f = firmaZa(req);
  const spisak = [];
  for (const [k, def] of Object.entries(IZVOZI)) {
    const n = (await upit(
      `SELECT count(*)::int n FROM ${def.izvor} WHERE firma_id = $1`, [f])).rows[0].n;
    spisak.push({ sta: k, opis: def.opis, redova: n });
  }
  const nz = (await upit(
    `SELECT count(*)::int n FROM zapis z WHERE z.firma_id = $1
       AND NOT EXISTS (SELECT 1 FROM zapis n WHERE n.ispravlja_id = z.id)`, [f])).rows[0].n;
  spisak.push({ sta: 'zapisi', redova: nz,
    opis: 'Dnevni zapisi P1–D4 (obrasci iz Vodiča)' });
  res.json(spisak);
}));

// Sve odjednom, u jednom fajlu. Ovo se daje kad klijent odlazi ili kad
// traži kompletnu kopiju — jedan fajl, ništa se ne zaboravi.
// MORA stajati iznad `/:sta`, inače bi ga `:sta` progutao.
zapisiRuter.get('/api/cg/izvoz/sve.json', vodi, uhvati(async (req, res) => {
  const f = firmaZa(req);
  const sve = { izvezeno: new Date().toISOString(), firma: null, podaci: {} };
  sve.firma = (await upit('SELECT * FROM firma WHERE id = $1', [f])).rows[0] || null;
  for (const [k, def] of Object.entries(IZVOZI)) {
    sve.podaci[k] = (await upit(
      `SELECT * FROM ${def.izvor} WHERE firma_id = $1 ORDER BY ${def.red}`, [f])).rows;
  }
  sve.podaci.zapisi = (await upit(UPIT_ZAPISI, [f])).rows;
  const ime = `${cistoIme(sve.firma?.naziv || 'firma')}-sve-${danasCG()}.json`;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${ime}"`);
  res.send(JSON.stringify(sve, null, 2));
}));

zapisiRuter.get('/api/cg/izvoz/:sta', vodi, uhvati(async (req, res) => {
  const sta = req.params.sta.replace(/\.csv$/i, '');
  const f = firmaZa(req);
  let redovi;
  if (sta === 'zapisi') {
    redovi = (await upit(UPIT_ZAPISI, [f])).rows;
  } else {
    const def = IZVOZI[sta];
    if (!def) return res.status(404).json({ greska: `Nepoznat izvoz: ${sta}` });
    // Ime izvora je iz našeg spiska, nikad iz adrese — bez toga bi ovo bila rupa.
    redovi = (await upit(
      `SELECT * FROM ${def.izvor} WHERE firma_id = $1 ORDER BY ${def.red}`, [f])).rows;
  }
  const naziv = (await upit('SELECT naziv FROM firma WHERE id = $1', [f]))
    .rows[0]?.naziv || 'firma';
  const ime = `${cistoIme(naziv)}-${sta}-${danasCG()}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${ime}"`);
  res.send(csv(redovi));
}));

// =====================================================================
//  DNEVNI PREGLED — da li sistem uopšte živi
//
//  Najgori scenario nije pogrešan zapis. Najgori je tišina: firma
//  prestane da unosi, niko ne primijeti, i tri mjeseca kasnije dođe
//  inspekcija na praznu evidenciju. Ovo je jedan poziv koji to hvata.
// =====================================================================

zapisiRuter.get('/api/cg/dnevni-pregled', vodi, uhvati(async (req, res) => {
  const r = (await upit('SELECT * FROM v_dnevni_pregled WHERE firma_id = $1',
    [firmaZa(req)])).rows[0];
  if (!r) return res.status(404).json({ greska: 'Firma ne postoji' });
  res.json(ocijeniPregled(r));
}));

// Ista ocjena se koristi i iz alata alati/dnevni-pregled.mjs.
export function ocijeniPregled(r) {
  const dana = d => d === null || d === undefined
    ? null : Math.floor((Date.now() - new Date(d)) / 86400000);
  const tisina = dana(r.zadnji_zapis);
  const upozorenja = [];

  if (tisina === null)
    upozorenja.push({ tezina: 'visoka', poruka: 'Nijedan zapis nikad nije unesen' });
  else if (tisina > 7)
    upozorenja.push({ tezina: 'visoka',
      poruka: `${pade(tisina, 'dan', 'dana', 'dana')} bez ijednog zapisa` });
  else if (tisina > 2)
    upozorenja.push({ tezina: 'srednja',
      poruka: `${pade(tisina, 'dan', 'dana', 'dana')} bez zapisa` });

  if (Number(r.odstupanja_bez_mjere) > 0)
    upozorenja.push({ tezina: 'visoka',
      poruka: `${pade(Number(r.odstupanja_bez_mjere), 'odstupanje', 'odstupanja',
        'odstupanja')} bez korektivne mjere` });

  if (Number(r.naknadnih_30_dana) > 0)
    upozorenja.push({ tezina: 'srednja',
      poruka: `${pade(Number(r.naknadnih_30_dana), 'zapis', 'zapisa', 'zapisa')} `
        + 'unesen naknadno, ne istog dana' });

  const vj = dana(r.zadnja_vjezba_povlacenja);
  if (vj === null)
    upozorenja.push({ tezina: 'visoka', poruka: 'Vježba povlačenja nikad nije izvedena' });
  else if (vj > 365)
    upozorenja.push({ tezina: 'srednja', poruka: `Vježba povlačenja prije ${vj} dana` });

  return { ...r, dana_tisine: tisina, upozorenja,
    mirno: upozorenja.filter(u => u.tezina === 'visoka').length === 0 };
}

export default zapisiRuter;
