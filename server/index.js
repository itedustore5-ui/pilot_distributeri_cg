import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { pool, upit } from './db.js';
import { zapisiRuter } from './zapisi.js';
import { proveriPriPokretanju } from './licenca.js';
import { hesirajLozinku, proveriLozinku, napraviSesiju, nadjiSesiju,
         obrisiSesiju, dozvoli, kolacicSesije } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(zapisiRuter);
app.use(express.static(path.join(__dirname, '..', 'public')));

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
if (!ADMIN_TOKEN || ADMIN_TOKEN.length < 16) {
  console.error('ADMIN_TOKEN mora biti postavljen i imati bar 16 znakova.');
  process.exit(1);
}

// samoAdmin = izvođač ili lice za BZR (vide imena, štampaju, vode merenje)
const samoAdmin = dozvoli('izvodjac', 'bzr');
// zbirni izveštaji — vidi ih i uprava, ali oni ne sadrže imena ni šifre
const iUprava   = dozvoli('izvodjac', 'bzr', 'uprava');
// upravljanje korisnicima i licencom — samo izvođač
const samoIzvodjac = dozvoli('izvodjac');
// Banka pitanja i analiza stavki: samo izvođač. Odgovorno lice vodi obuku i vidi
// rezultate, ali ne i same stavke — ko zna pitanja, ne mjeri više znanje nego
// pamćenje pitanja. Ista granica čuva i vrijednost banke kao autorskog rada.
const bankaPitanja = dozvoli('izvodjac');

const uhvati = fn => (req, res) =>
  fn(req, res).catch(e => {
    console.error(e);
    res.status(500).json({ greska: e.message });
  });

// =====================================================================
//  DEO ZA UČESNIKA
// =====================================================================

app.get('/api/talasi', uhvati(async (_req, res) => {
  const { rows } = await upit(
    `SELECT w.id, w.oznaka, w.opis, k.naziv AS grupa,
            f.naziv AS firma, pr.naziv AS program, pr.godina
       FROM talas w
       JOIN grupa k  ON k.id  = w.grupa_id
       JOIN firma f    ON f.id  = k.firma_id
       JOIN nacrt n    ON n.id  = k.nacrt_id
       JOIN program pr ON pr.id = n.program_id
      WHERE w.otvoren ORDER BY w.redni`
  );
  res.json(rows);
}));

/**
 * Početak sesije. Vraća formu BEZ tačnih odgovora.
 * Ako je učesnik već predao taj talas — odbija se.
 */
app.post('/api/sesija', uhvati(async (req, res) => {
  const sifra = String(req.body.sifra || '').trim().toUpperCase();
  const talasId = Number(req.body.talas_id);
  if (!sifra || !talasId) return res.status(400).json({ greska: 'Nedostaje šifra ili talas.' });

  const k = await pool.connect();
  try {
    await k.query('BEGIN');

    const { rows: [talas] } = await k.query(
      `SELECT w.id, w.redni, w.otvoren, k.id AS grupa_id, k.nacrt_id
         FROM talas w JOIN grupa k ON k.id = w.grupa_id
        WHERE w.id = $1`, [talasId]
    );
    if (!talas) { await k.query('ROLLBACK'); return res.status(404).json({ greska: 'Talas ne postoji.' }); }
    if (!talas.otvoren) { await k.query('ROLLBACK'); return res.status(403).json({ greska: 'Ovaj termin merenja nije otvoren.' }); }

    const { rows: [ucesnik] } = await k.query(
      `SELECT id FROM ucesnik WHERE grupa_id = $1 AND sifra = $2`,
      [talas.grupa_id, sifra]
    );
    if (!ucesnik) { await k.query('ROLLBACK'); return res.status(404).json({ greska: 'Šifra nije prepoznata. Proveri sa nadzornikom.' }); }

    const { rows: [postoji] } = await k.query(
      `SELECT id, predata FROM sesija WHERE talas_id = $1 AND ucesnik_id = $2`,
      [talasId, ucesnik.id]
    );
    if (postoji?.predata) {
      await k.query('ROLLBACK');
      return res.status(409).json({ greska: 'Ovaj termin si već završio.' });
    }

    let sesijaId = postoji?.id;
    if (!sesijaId) {
      const { rows: [s] } = await k.query(
        `INSERT INTO sesija (talas_id, ucesnik_id) VALUES ($1,$2) RETURNING id`,
        [talasId, ucesnik.id]
      );
      sesijaId = s.id;
      const forma = await generisiFormu(k, talas.nacrt_id, talas.redni, sifra);
      for (const st of forma) {
        await k.query(
          `INSERT INTO sesija_stavka (sesija_id, redni_broj, stavka_id, pozicija_id, redosled_opcija)
           VALUES ($1,$2,$3,$4,$5)`,
          [sesijaId, st.redni_broj, st.stavka_id, st.pozicija_id, st.opcije.map(o => o.id)]
        );
      }
    }

    // Uvek čitamo iz baze — forma se ne generiše dvaput.
    const { rows: stavke } = await k.query(
      `SELECT ss.id AS sesija_stavka_id, ss.redni_broj, s.tekst, ss.redosled_opcija
         FROM sesija_stavka ss JOIN stavka s ON s.id = ss.stavka_id
        WHERE ss.sesija_id = $1 ORDER BY ss.redni_broj`, [sesijaId]
    );

    const pitanja = [];
    for (const st of stavke) {
      const { rows: opcije } = await k.query(
        `SELECT id, tekst FROM opcija WHERE id = ANY($1::int[])`, [st.redosled_opcija]
      );
      const poId = new Map(opcije.map(o => [o.id, o]));
      pitanja.push({
        sesija_stavka_id: st.sesija_stavka_id,
        redni_broj: st.redni_broj,
        tekst: st.tekst,
        opcije: st.redosled_opcija.map(id => poId.get(id)), // bez `tacna`
      });
    }

    await k.query('COMMIT');
    res.json({ sesija_id: sesijaId, ukupno: pitanja.length, pitanja });
  } catch (e) {
    await k.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    k.release();
  }
}));

/** Snimanje odgovora. Bez povratne informacije o tačnosti. */
app.post('/api/odgovor', uhvati(async (req, res) => {
  const { sesija_stavka_id, opcija_id } = req.body;
  const { rows: [provera] } = await upit(
    `SELECT s.predata FROM sesija_stavka ss JOIN sesija s ON s.id = ss.sesija_id
      WHERE ss.id = $1`, [sesija_stavka_id]
  );
  if (!provera) return res.status(404).json({ greska: 'Stavka ne postoji.' });
  if (provera.predata) return res.status(409).json({ greska: 'Sesija je već predata.' });

  await upit(
    `INSERT INTO odgovor (sesija_stavka_id, opcija_id) VALUES ($1,$2)
     ON CONFLICT (sesija_stavka_id) DO UPDATE SET opcija_id = $2, odgovoreno = now()`,
    [sesija_stavka_id, opcija_id]
  );
  res.json({ ok: true });
}));

/**
 * PREDAJA. Ocenjivanje se dešava OVDE i nigde drugde.
 * Učesniku se vraća samo poruka — ne procenat, ne tačni odgovori.
 */
app.post('/api/predaja', uhvati(async (req, res) => {
  const sesijaId = Number(req.body.sesija_id);
  const k = await pool.connect();
  try {
    await k.query('BEGIN');

    const { rows: [s] } = await k.query(
      `SELECT id, predata FROM sesija WHERE id = $1 FOR UPDATE`, [sesijaId]
    );
    if (!s) { await k.query('ROLLBACK'); return res.status(404).json({ greska: 'Sesija ne postoji.' }); }
    if (s.predata) {
      await k.query('ROLLBACK');
      return res.status(409).json({ greska: 'Već predato.' });
    }

    // Ocenjivanje poređenjem sa opcija.tacna — isključivo na serveru.
    // (Ciljna tabela `o` ne sme da se referencira iz FROM ... JOIN ON,
    //  zato tačnost stiže podupitom.)
    await k.query(
      `UPDATE odgovor o
          SET tacan = COALESCE(
                (SELECT op.tacna FROM opcija op WHERE op.id = o.opcija_id), FALSE)
         FROM sesija_stavka ss
        WHERE ss.id = o.sesija_stavka_id AND ss.sesija_id = $1`,
      [sesijaId]
    );

    const { rows: [rez] } = await k.query(
      `SELECT
         (SELECT COUNT(*)::int FROM sesija_stavka WHERE sesija_id = $1) AS maks,
         (SELECT COUNT(*)::int FROM odgovor o JOIN sesija_stavka ss ON ss.id = o.sesija_stavka_id
           WHERE ss.sesija_id = $1 AND o.tacan) AS tacnih`,
      [sesijaId]
    );

    await k.query(
      `UPDATE sesija
          SET predata = now(),
              bodovi = $2::int,
              max_bodovi = $3::int,
              procenat = ROUND(100.0 * $2::numeric / NULLIF($3::numeric, 0), 2)
        WHERE id = $1`,
      [sesijaId, rez.tacnih, rez.maks]
    );

    await k.query('COMMIT');
    res.json({ ok: true, poruka: 'Provera je zabeležena. Hvala.' });
  } catch (e) {
    await k.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    k.release();
  }
}));

// =====================================================================
//  IZVEŠTAJI  (samo sa tokenom)
// =====================================================================

app.get('/api/izvestaj/:grupaId/teme', iUprava, uhvati(async (req, res) => {
  const { rows } = await upit(
    `SELECT * FROM v_tema_talas WHERE grupa_id = $1 ORDER BY tema, talas_redni`,
    [req.params.grupaId]);
  res.json(rows);
}));

app.get('/api/izvestaj/:grupaId/zaboravljanje', iUprava, uhvati(async (req, res) => {
  const { rows } = await upit(
    `SELECT * FROM v_zaboravljanje WHERE grupa_id = $1 ORDER BY tema`,
    [req.params.grupaId]);
  res.json(rows);
}));

app.get('/api/izvestaj/:grupaId/sidra', iUprava, uhvati(async (req, res) => {
  const { rows } = await upit(
    `SELECT * FROM v_sidra WHERE grupa_id = $1 ORDER BY talas_redni`,
    [req.params.grupaId]);
  res.json(rows);
}));

app.get('/api/izvestaj/:grupaId/ucesce', iUprava, uhvati(async (req, res) => {
  const { rows } = await upit(
    `SELECT * FROM v_ucesce WHERE grupa_id = $1 ORDER BY talas_redni`,
    [req.params.grupaId]);
  res.json(rows);
}));

/** Evidencija za auditora — jedino mesto gde se vidi šifra zaposlenog. */
app.get('/api/izvestaj/:grupaId/evidencija', samoAdmin, uhvati(async (req, res) => {
  const { rows } = await upit(
    `SELECT e.* FROM v_evidencija e
       JOIN grupa k ON k.naziv = e.grupa
      WHERE k.id = $1 ORDER BY sifra_zaposlenog, talas`,
    [req.params.grupaId]);
  res.json(rows);
}));

// -------------------------------------------------- administracija grupe
app.post('/api/admin/ucesnici', samoAdmin, uhvati(async (req, res) => {
  const { grupa_id, ucesnici } = req.body;   // [{sifra, radno_mesto, smena}]
  let dodato = 0;
  for (const u of ucesnici) {
    const r = await upit(
      `INSERT INTO ucesnik (grupa_id, sifra, radno_mesto, smena) VALUES ($1,$2,$3,$4)
       ON CONFLICT (grupa_id, sifra) DO NOTHING`,
      [grupa_id, String(u.sifra).toUpperCase(), u.radno_mesto || null, u.smena || null]
    );
    dodato += r.rowCount;
  }
  res.json({ dodato });
}));

/**
 * Grupno pravljenje šifri. Prefiks se uzima iz grupe
 * (P proizvodnja · H hotelijerstvo · K konsalting), pa se numeriše
 * od prve slobodne pozicije — ponovni poziv dodaje, ne prepisuje.
 *
 * telo: { grupa_id, raspodela: [{ radno_mesto, smena, broj }] }
 */
app.post('/api/admin/generisi-ucesnike', samoAdmin, uhvati(async (req, res) => {
  const grupaId = Number(req.body.grupa_id);
  const raspodela = req.body.raspodela;
  if (!grupaId || !Array.isArray(raspodela) || raspodela.length === 0)
    return res.status(400).json({ greska: 'Potrebni su grupa_id i raspodela.' });

  const { rows: [koh] } = await upit(
    `SELECT prefiks_sifre FROM grupa WHERE id = $1`, [grupaId]);
  if (!koh) return res.status(404).json({ greska: 'Grupa ne postoji.' });

  const prefiks = (req.body.prefiks || koh.prefiks_sifre).toUpperCase();

  // nastavi numeraciju od poslednje postojeće šifre sa istim prefiksom
  const { rows: [zadnji] } = await upit(
    `SELECT COALESCE(MAX(NULLIF(regexp_replace(sifra, '^[A-ZŠĐČĆŽ]+-', ''), '')::int), 0) AS n
       FROM ucesnik WHERE grupa_id = $1 AND sifra LIKE $2`,
    [grupaId, prefiks + '-%']);

  let broj = Number(zadnji.n);
  const napravljene = [];
  for (const g of raspodela) {
    for (let i = 0; i < Number(g.broj || 0); i++) {
      broj++;
      const sifra = `${prefiks}-${String(broj).padStart(3, '0')}`;
      const r = await upit(
        `INSERT INTO ucesnik (grupa_id, sifra, radno_mesto, smena) VALUES ($1,$2,$3,$4)
         ON CONFLICT (grupa_id, sifra) DO NOTHING`,
        [grupaId, sifra, g.radno_mesto || null, g.smena || null]);
      if (r.rowCount) napravljene.push({ sifra, radno_mesto: g.radno_mesto || null, smena: g.smena || null });
    }
  }
  res.json({ prefiks, dodato: napravljene.length, ucesnici: napravljene });
}));

/**
 * Prelazak između paketa.
 *   osnovno   → prosireno : dodaju se termini T30 i T90
 *   prosireno → osnovno   : uklanjaju se, ali SAMO ako na njima nema merenja
 *
 * Ista aplikacija i ista banka pitanja u oba slučaja — razlika je broj termina.
 */
app.post('/api/admin/paket', bankaPitanja, uhvati(async (req, res) => {
  const id = Number(req.body.grupa_id);
  const paket = req.body.paket;
  if (!['provera', 'osnovno', 'prosireno'].includes(paket))
    return res.status(400).json({
      greska: 'paket mora biti "provera", "osnovno" ili "prosireno".' });

  const { rows: [k] } = await upit(`SELECT paket FROM grupa WHERE id = $1`, [id]);
  if (!k) return res.status(404).json({ greska: 'Grupa ne postoji.' });
  if (k.paket === paket) return res.json({ ok: true, paket, poruka: 'Već je taj paket.' });

  const kl = await pool.connect();
  try {
    await kl.query('BEGIN');

    if (paket !== 'provera') {
      // T0 postoji u osnovnom i proširenom
      await kl.query(
        `INSERT INTO talas (grupa_id, oznaka, redni, opis, planiran_datum, otvoren)
         VALUES ($1,'T0',1,'Ulazna provera — pre obuke',
           COALESCE((SELECT MAX(datum_od) FROM obuka WHERE grupa_id = $1), CURRENT_DATE), FALSE)
         ON CONFLICT (grupa_id, oznaka) DO NOTHING`, [id]);
    }
    if (paket === 'prosireno') {
      const { rows: [o] } = await kl.query(
        `SELECT id FROM obuka WHERE grupa_id = $1 ORDER BY datum_od DESC LIMIT 1`, [id]);
      for (const [oznaka, redni, opis, pomak] of [
        ['T30', 3, 'Provera zadržavanja — 30 dana', 30],
        ['T90', 4, 'Provera zadržavanja — 90 dana', 90],
      ]) {
        await kl.query(
          `INSERT INTO talas (grupa_id, oznaka, redni, opis, planiran_datum, otvoren, obuka_id)
           VALUES ($1,$2,$3,$4, COALESCE(
             (SELECT MAX(datum_od) FROM obuka WHERE grupa_id = $1), CURRENT_DATE) + $5::int,
             FALSE, $6)
           ON CONFLICT (grupa_id, oznaka) DO NOTHING`,
          [id, oznaka, redni, opis, pomak, o?.id ?? null]);
      }
    }
    if (paket !== 'prosireno') {
      const uklanja = paket === 'provera' ? ['T0','T30','T90'] : ['T30','T90'];
      const { rows: [z] } = await kl.query(
        `SELECT COUNT(*)::int AS n FROM sesija s JOIN talas w ON w.id = s.talas_id
          WHERE w.grupa_id = $1 AND w.oznaka = ANY($2::text[]) AND s.predata IS NOT NULL`,
        [id, uklanja]);
      if (z.n > 0) {
        await kl.query('ROLLBACK');
        return res.status(409).json({
          greska: `Na terminima ${uklanja.join(', ')} već postoji ${z.n} završenih provera. ` +
                  `Ne mogu se ukloniti bez gubitka merenja.` });
      }
      await kl.query(
        `DELETE FROM talas WHERE grupa_id = $1 AND oznaka = ANY($2::text[])`, [id, uklanja]);
    }

    await kl.query(`UPDATE grupa SET paket = $2::paket_t WHERE id = $1`, [id, paket]);
    await kl.query('COMMIT');
    res.json({ ok: true, paket });
  } catch (e) {
    await kl.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { kl.release(); }
}));

app.post('/api/admin/talas/:id/otvori', samoAdmin, uhvati(async (req, res) => {
  const otvoren = req.body.otvoren !== false;
  await upit(`UPDATE talas SET otvoren = $2 WHERE id = $1`, [req.params.id, otvoren]);
  res.json({ ok: true, otvoren });
}));

/** Potvrda stavki koje sadrže brojke iz HACCP plana klijenta. */
app.post('/api/admin/potvrdi', samoAdmin, uhvati(async (req, res) => {
  const { oznake_porodica, potvrdio } = req.body;
  const r = await upit(
    `UPDATE stavka s SET potvrdio = $2, potvrdjeno_dana = CURRENT_DATE
       FROM porodica p
      WHERE p.id = s.porodica_id
        AND ($1::text[] IS NULL OR p.oznaka = ANY($1::text[]))
        AND s.zahteva_potvrdu AND s.potvrdio IS NULL`,
    [oznake_porodica || null, potvrdio || 'menadžer kvaliteta']
  );
  res.json({ potvrdjeno: r.rowCount });
}));

app.get('/api/admin/nepotvrdjene', samoAdmin, uhvati(async (_req, res) => {
  const { rows } = await upit(
    `SELECT p.oznaka AS porodica, t.oznaka AS tema, s.varijanta, s.tekst
       FROM stavka s JOIN porodica p ON p.id = s.porodica_id JOIN tema t ON t.id = p.tema_id
      WHERE s.zahteva_potvrdu AND s.potvrdio IS NULL
      ORDER BY p.oznaka, s.varijanta`);
  res.json(rows);
}));

// -------------------------------------------------- analiza i pojedinačni uvid
app.get('/api/izvestaj/:grupaId/zaglavlje', iUprava, uhvati(async (req, res) => {
  const { rows: [r] } = await upit(
    `SELECT f.naziv AS firma, pr.naziv AS program, pr.godina, pr.pravni_osnov,
            k.naziv AS grupa, k.lokacija, k.paket, n.prag_teme, n.verzija AS verzija_nacrta,
            (SELECT COUNT(*) FROM ucesnik u WHERE u.grupa_id = k.id) AS upisanih
       FROM grupa k
       JOIN firma f   ON f.id  = k.firma_id
       JOIN nacrt n   ON n.id  = k.nacrt_id
       JOIN program pr ON pr.id = n.program_id
      WHERE k.id = $1`, [req.params.grupaId]);
  if (!r) return res.status(404).json({ greska: 'Grupa ne postoji.' });
  res.json(r);
}));

app.get('/api/izvestaj/:grupaId/stavke', bankaPitanja, uhvati(async (req, res) => {
  const { rows } = await upit(
    `SELECT * FROM v_analiza_stavki WHERE grupa_id = $1
      ORDER BY (nalaz <> 'u redu') DESC, diskriminacija NULLS FIRST, tema, porodica, varijanta`,
    [req.params.grupaId]);
  res.json(rows);
}));

app.get('/api/izvestaj/:grupaId/distraktori', bankaPitanja, uhvati(async (req, res) => {
  const { rows } = await upit(
    `SELECT * FROM v_distraktori
      WHERE grupa_id = $1 AND NOT tacna AND procenat >= COALESCE($2::numeric, 20)
      ORDER BY procenat DESC LIMIT 25`,
    [req.params.grupaId, req.query.prag || null]);
  res.json(rows);
}));

app.get('/api/izvestaj/:grupaId/smene', iUprava, uhvati(async (req, res) => {
  const { rows } = await upit(
    `SELECT * FROM v_po_smeni WHERE grupa_id = $1 ORDER BY smena, talas_redni`,
    [req.params.grupaId]);
  res.json(rows);
}));

app.get('/api/izvestaj/:grupaId/radna-mesta', samoAdmin, uhvati(async (req, res) => {
  const { rows } = await upit(
    `SELECT * FROM v_po_radnom_mestu WHERE grupa_id = $1 ORDER BY radno_mesto, tema`,
    [req.params.grupaId]);
  res.json(rows);
}));

app.get('/api/izvestaj/:grupaId/ponovna-obuka', samoAdmin, uhvati(async (req, res) => {
  const { rows } = await upit(
    `SELECT * FROM v_ponovna_obuka WHERE grupa_id = $1
      ORDER BY nivo_rizika, tema, sifra`, [req.params.grupaId]);
  res.json(rows);
}));

app.get('/api/izvestaj/:grupaId/kvalitet', bankaPitanja, uhvati(async (req, res) => {
  const { rows } = await upit(
    `SELECT * FROM v_kvalitet_podataka WHERE grupa_id = $1
      ORDER BY (nalaz <> 'u redu') DESC, sek_po_pitanju`, [req.params.grupaId]);
  res.json(rows);
}));

app.get('/api/izvestaj/:grupaId/zbirno', samoAdmin, uhvati(async (req, res) => {
  const { rows } = await upit(
    `SELECT * FROM v_zbirno_ucesnik WHERE grupa_id = $1 ORDER BY sifra`,
    [req.params.grupaId]);
  res.json(rows);
}));

app.get('/api/izvestaj/:grupaId/ucesnici', samoAdmin, uhvati(async (req, res) => {
  const { rows } = await upit(
    `SELECT * FROM v_sesije_ucesnika
      WHERE grupa_id = $1 AND ($2::text IS NULL OR sifra = UPPER($2))
      ORDER BY sifra, talas_redni`,
    [req.params.grupaId, req.query.sifra || null]);
  res.json(rows);
}));

/**
 * POJEDINAČNI PREGLED SESIJE — pitanje po pitanje.
 * Ovde se VIDE tačni odgovori. Ne otvara se pred učesnicima dok svi
 * talasi nisu završeni. Služi za razjašnjenje spora i pripremu ponovne obuke.
 */
app.get('/api/sesija/:id/pregled', bankaPitanja, uhvati(async (req, res) => {
  const { rows: [zag] } = await upit(
    `SELECT s.id, u.sifra, u.radno_mesto, u.smena, w.oznaka AS talas, w.opis,
            s.predata::date AS datum, s.bodovi, s.max_bodovi, s.procenat,
            EXTRACT(EPOCH FROM (s.predata - s.poceta))::int AS trajanje_sek
       FROM sesija s
       JOIN ucesnik u ON u.id = s.ucesnik_id
       JOIN talas   w ON w.id = s.talas_id
      WHERE s.id = $1 AND s.predata IS NOT NULL`, [req.params.id]);
  if (!zag) return res.status(404).json({ greska: 'Sesija ne postoji ili nije predata.' });

  const { rows: stavke } = await upit(
    `SELECT ss.redni_broj, t.oznaka AS tema, p.oznaka AS porodica, st.varijanta,
            st.tekst AS pitanje, o.tacan,
            (SELECT tekst FROM opcija WHERE id = o.opcija_id)            AS izabrao,
            (SELECT tekst FROM opcija WHERE stavka_id = st.id AND tacna) AS tacan_odgovor
       FROM sesija_stavka ss
       JOIN stavka   st ON st.id = ss.stavka_id
       JOIN porodica p  ON p.id  = st.porodica_id
       JOIN tema     t  ON t.id  = p.tema_id
       LEFT JOIN odgovor o ON o.sesija_stavka_id = ss.id
      WHERE ss.sesija_id = $1 ORDER BY ss.redni_broj`, [req.params.id]);

  res.json({ ...zag, stavke });
}));

// =====================================================================
//  ODRŽANA OBUKA — zapis o tome da je obuka izvedena i ko je prisustvovao.
//  Ovo je prvi dokument koji inspektor traži; provera znanja je druga kolona.
// =====================================================================

/** Upis održane obuke. teme = niz oznaka ('T1','T2'...). */
app.post('/api/admin/obuka', samoAdmin, uhvati(async (req, res) => {
  const b = req.body;
  if (!b.grupa_id || !b.naziv || !b.datum_od)
    return res.status(400).json({ greska: 'Potrebni su grupa_id, naziv i datum_od.' });

  const k = await pool.connect();
  try {
    await k.query('BEGIN');
    const { rows: [o] } = await k.query(
      `INSERT INTO obuka (grupa_id, naziv, oblik, sifra_razloga, datum_od, datum_do,
                          datum_teorijske, datum_prakticne, datum_obuke_lzo,
                          trajanje_sati, mesto, izvodjac, izvodjac_svojstvo, materijal, napomena)
       VALUES ($1,$2,COALESCE($3,'kombinovana')::oblik_obuke_t,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id`,
      [b.grupa_id, b.naziv, b.oblik || null, b.sifra_razloga || null,
       b.datum_od, b.datum_do || null,
       b.datum_teorijske || b.datum_od, b.datum_prakticne || null, b.datum_obuke_lzo || null,
       b.trajanje_sati || null, b.mesto || null, b.izvodjac || null,
       b.izvodjac_svojstvo || null, b.materijal || null, b.napomena || null]);

    if (Array.isArray(b.teme) && b.teme.length) {
      const r = await k.query(
        `INSERT INTO obuka_tema (obuka_id, tema_id)
         SELECT $1, t.id FROM tema t
           JOIN nacrt n ON n.program_id = t.program_id
           JOIN grupa ko ON ko.nacrt_id = n.id
          WHERE ko.id = $2 AND t.oznaka = ANY($3::text[])
         ON CONFLICT DO NOTHING`,
        [o.id, b.grupa_id, b.teme]);
      if (r.rowCount !== b.teme.length) {
        await k.query('ROLLBACK');
        return res.status(400).json({
          greska: `Od ${b.teme.length} navedenih tema pronađeno je ${r.rowCount}. Proveri oznake.` });
      }
    }

    // T0 je pre obuke i ostaje nevezan; ostali termini proveravaju ovu obuku
    await k.query(
      `UPDATE talas SET obuka_id = $1 WHERE grupa_id = $2 AND oznaka <> 'T0'`,
      [o.id, b.grupa_id]);

    await k.query('COMMIT');
    res.json({ obuka_id: o.id });
  } catch (e) {
    await k.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { k.release(); }
}));

/**
 * Upis prisustva. Bez `sifre` upisuje sve učesnike grupe kao prisutne —
 * pa se odsutni naknadno označe pojedinačno.
 */
app.post('/api/admin/obuka/:id/prisustvo', samoAdmin, uhvati(async (req, res) => {
  const obukaId = Number(req.params.id);
  const { rows: [o] } = await upit(`SELECT grupa_id FROM obuka WHERE id = $1`, [obukaId]);
  if (!o) return res.status(404).json({ greska: 'Obuka ne postoji.' });

  const prisustvovao = req.body.prisustvovao !== false;
  const sifre = Array.isArray(req.body.sifre) && req.body.sifre.length
    ? req.body.sifre.map(s => String(s).toUpperCase()) : null;

  const r = await upit(
    `INSERT INTO prisustvo (obuka_id, ucesnik_id, prisustvovao, napomena)
     SELECT $1, u.id, $3, $4 FROM ucesnik u
      WHERE u.grupa_id = $2 AND ($5::text[] IS NULL OR u.sifra = ANY($5::text[]))
     ON CONFLICT (obuka_id, ucesnik_id)
       DO UPDATE SET prisustvovao = EXCLUDED.prisustvovao, napomena = EXCLUDED.napomena`,
    [obukaId, o.grupa_id, prisustvovao, req.body.napomena || null, sifre]);

  res.json({ obradjeno: r.rowCount, prisustvovao });
}));

app.get('/api/izvestaj/:grupaId/obuke', samoAdmin, uhvati(async (req, res) => {
  const { rows } = await upit(
    `SELECT * FROM v_obuke WHERE grupa_id = $1 ORDER BY datum_od DESC`,
    [req.params.grupaId]);
  res.json(rows);
}));

/** Evidencija o osposobljavanju i proveri — zapis koji ide inspektoru. */
app.get('/api/izvestaj/:grupaId/osposobljavanje', samoAdmin, uhvati(async (req, res) => {
  const { rows } = await upit(
    `SELECT * FROM v_evidencija_osposobljavanja
      WHERE grupa_id = $1 AND ($2::int IS NULL OR obuka_id = $2::int)
      ORDER BY obuka_od DESC, sifra`,
    [req.params.grupaId, req.query.obuka_id || null]);
  res.json(rows);
}));

/** Uključivanje čuvanja imena i upis imena uz šifre. */
app.post('/api/admin/imena', samoAdmin, uhvati(async (req, res) => {
  const { grupa_id, cuva_imena, imena } = req.body;
  if (typeof cuva_imena === 'boolean')
    await upit(`UPDATE grupa SET cuva_imena = $2 WHERE id = $1`, [grupa_id, cuva_imena]);

  let upisano = 0;
  for (const x of (imena || [])) {
    const r = await upit(
      `UPDATE ucesnik SET ime_prezime = $3 WHERE grupa_id = $1 AND sifra = UPPER($2)`,
      [grupa_id, x.sifra, x.ime_prezime || null]);
    upisano += r.rowCount;
  }
  res.json({ upisano, cuva_imena });
}));

// =====================================================================
//  RADNA MESTA — podaci prepisani iz Akta o proceni rizika.
//  Unose se jednom po firmi; posle se automatski uparuju sa svakim
//  zaposlenim na tom radnom mestu prilikom štampe Obrasca 6.
// =====================================================================
app.get('/api/sifre', bankaPitanja, uhvati(async (_req, res) => {
  const [{ rows: razlozi }, { rows: opasnosti }] = await Promise.all([
    upit(`SELECT * FROM sifra_razloga ORDER BY sifra`),
    upit(`SELECT * FROM sifra_opasnosti ORDER BY sifra`),
  ]);
  res.json({ razlozi, opasnosti });
}));

app.get('/api/izvestaj/:grupaId/radna-mesta-akt', samoAdmin, uhvati(async (req, res) => {
  const { rows } = await upit(
    `SELECT rm.*,
            (SELECT COUNT(*) FROM ucesnik u WHERE u.radno_mesto_id = rm.id) AS zaposlenih
       FROM radno_mesto rm
       JOIN grupa k ON k.firma_id = rm.firma_id
      WHERE k.id = $1 ORDER BY rm.naziv`, [req.params.grupaId]);
  res.json(rows);
}));

/** Upis radnih mesta i automatsko povezivanje sa učesnicima po nazivu. */
app.post('/api/admin/radna-mesta', samoAdmin, uhvati(async (req, res) => {
  const { grupa_id, radna_mesta } = req.body;
  const { rows: [k] } = await upit(`SELECT firma_id FROM grupa WHERE id = $1`, [grupa_id]);
  if (!k) return res.status(404).json({ greska: 'Grupa ne postoji.' });

  let upisano = 0, povezano = 0;
  for (const rm of (radna_mesta || [])) {
    if (Array.isArray(rm.sifre_opasnosti) && rm.sifre_opasnosti.length) {
      const { rows: [p] } = await upit(
        `SELECT COUNT(*)::int AS n FROM sifra_opasnosti WHERE sifra = ANY($1::text[])`,
        [rm.sifre_opasnosti]);
      if (p.n !== rm.sifre_opasnosti.length)
        return res.status(400).json({
          greska: `Radno mesto "${rm.naziv}": od ${rm.sifre_opasnosti.length} šifara opasnosti ` +
                  `prepoznato je ${p.n}. Dozvoljene su 01–40.` });
    }
    const { rows: [r] } = await upit(
      `INSERT INTO radno_mesto (firma_id, naziv, opis_poslova, povecan_rizik,
                                sifre_opasnosti, mere, lzo, obavestenja, rukovodilac_prati)
       -- ako polje nije poslato, zadrži postojeću vrednost; ako reda nema, FALSE
       VALUES ($1,$2,$3,
               COALESCE($4, (SELECT povecan_rizik FROM radno_mesto
                              WHERE firma_id = $1 AND naziv = $2), FALSE),
               $5,$6,$7,$8,$9)
       -- COALESCE: izostavljeno polje zadržava staru vrednost.
       -- Da bi se polje obrisalo, šalje se prazan string.
       ON CONFLICT (firma_id, naziv) DO UPDATE SET
         opis_poslova      = COALESCE(EXCLUDED.opis_poslova, radno_mesto.opis_poslova),
         povecan_rizik     = COALESCE(EXCLUDED.povecan_rizik, radno_mesto.povecan_rizik),
         sifre_opasnosti   = COALESCE(EXCLUDED.sifre_opasnosti, radno_mesto.sifre_opasnosti),
         mere              = COALESCE(EXCLUDED.mere, radno_mesto.mere),
         lzo               = COALESCE(EXCLUDED.lzo, radno_mesto.lzo),
         obavestenja       = COALESCE(EXCLUDED.obavestenja, radno_mesto.obavestenja),
         rukovodilac_prati = COALESCE(EXCLUDED.rukovodilac_prati, radno_mesto.rukovodilac_prati)
       RETURNING id`,
      [k.firma_id, rm.naziv, rm.opis_poslova ?? null, rm.povecan_rizik ?? null,
       rm.sifre_opasnosti ?? null, rm.mere ?? null, rm.lzo ?? null,
       rm.obavestenja ?? null, rm.rukovodilac_prati ?? null]);
    upisano++;

    const v = await upit(
      `UPDATE ucesnik SET radno_mesto_id = $1
        WHERE grupa_id = $2 AND radno_mesto = $3 AND radno_mesto_id IS DISTINCT FROM $1`,
      [r.id, grupa_id, rm.naziv]);
    povezano += v.rowCount;
  }
  res.json({ upisano, povezano_zaposlenih: povezano });
}));

/** Podaci za štampu Obrasca 6. Praktična kolona ostaje prazna namerno. */
app.get('/api/izvestaj/:grupaId/obrazac6', samoAdmin, uhvati(async (req, res) => {
  const { rows } = await upit(
    `SELECT * FROM v_obrazac6
      WHERE grupa_id = $1 AND ($2::int IS NULL OR obuka_id = $2::int)
        AND prisustvovao ORDER BY sifra`,
    [req.params.grupaId, req.query.obuka_id || null]);
  res.json(rows);
}));

// =====================================================================
//  ROK ČUVANJA I ANONIMIZACIJA
// =====================================================================
app.get('/api/izvestaj/:grupaId/rok-cuvanja', samoAdmin, uhvati(async (req, res) => {
  const { rows: [r] } = await upit(
    `SELECT * FROM v_rok_cuvanja WHERE grupa_id = $1`, [req.params.grupaId]);
  if (!r) return res.status(404).json({ greska: 'Grupa ne postoji.' });
  res.json(r);
}));

app.post('/api/admin/rok-cuvanja', samoAdmin, uhvati(async (req, res) => {
  const { grupa_id, rok_cuvanja_meseci } = req.body;
  const m = Number(rok_cuvanja_meseci);
  if (!Number.isInteger(m) || m < 1 || m > 120)
    return res.status(400).json({ greska: 'Rok mora biti ceo broj meseci između 1 i 120.' });
  await upit(`UPDATE grupa SET rok_cuvanja_meseci = $2 WHERE id = $1`, [grupa_id, m]);
  res.json({ ok: true, rok_cuvanja_meseci: m });
}));

/**
 * ANONIMIZACIJA — uklanja vezu prema osobi, zadržava merenja.
 * Šifra se zamenjuje slučajnom oznakom, brišu se ime, radno mesto i smena.
 * Posle ovoga podaci prestaju da budu podaci o ličnosti, a krivulje
 * zaboravljanja i analiza pitanja ostaju upotrebljivi.
 *
 * Nepovratno je. Traži potvrdu = TRUE.
 */
app.post('/api/admin/anonimizuj/:grupaId', samoAdmin, uhvati(async (req, res) => {
  const id = Number(req.params.grupaId);
  if (req.body.potvrda !== true)
    return res.status(400).json({
      greska: 'Nepovratna radnja. Pošalji {"potvrda": true, "izvrsio": "Ime Prezime"}.' });

  const { rows: [k] } = await upit(
    `SELECT anonimizovano FROM grupa WHERE id = $1`, [id]);
  if (!k) return res.status(404).json({ greska: 'Grupa ne postoji.' });
  if (k.anonimizovano)
    return res.status(409).json({ greska: 'Grupa je već anonimizovana.' });

  const kl = await pool.connect();
  try {
    await kl.query('BEGIN');
    // Prozorska funkcija se ne sme koristiti u SET, pa numeracija ide podupitom.
    const r = await kl.query(
      `UPDATE ucesnik u SET
          sifra = 'ANON-' || lpad(x.n::text, 4, '0'),
          ime_prezime = NULL, radno_mesto = NULL, radno_mesto_id = NULL, smena = NULL
         FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS n
                 FROM ucesnik WHERE grupa_id = $1) x
        WHERE u.id = x.id`, [id]);

    await kl.query(
      `UPDATE grupa SET anonimizovano = now(), anonimizovao = $2, cuva_imena = FALSE
        WHERE id = $1`, [id, req.body.izvrsio || 'nije navedeno']);
    await kl.query('COMMIT');
    res.json({
      ok: true, anonimizovano: r.rowCount,
      poruka: 'Veza prema osobama je uklonjena. Merenja su zadržana za analizu.' });
  } catch (e) {
    await kl.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { kl.release(); }
}));

// =====================================================================
//  PODACI ZA KOMANDNU TABLU
// =====================================================================

/** Spisak svih grupa — da ne moraš pamtiti broj grupe. */
/** Teme iz nacrta — postoje i pre nego što ijedno merenje počne. */
app.get('/api/izvestaj/:grupaId/teme-programa', samoAdmin, uhvati(async (req, res) => {
  const { rows } = await upit(
    `SELECT t.id, t.oznaka, t.naziv, t.nivo_rizika, t.izvor,
            (SELECT COUNT(*) FROM nacrt_pozicija np
               JOIN porodica p ON p.id = np.porodica_id
              WHERE p.tema_id = t.id AND np.nacrt_id = k.nacrt_id) AS pitanja_u_formi
       FROM tema t
       JOIN nacrt n   ON n.program_id = t.program_id
       JOIN grupa k ON k.nacrt_id = n.id
      WHERE k.id = $1 ORDER BY t.oznaka`,
    [req.params.grupaId]);
  res.json(rows);
}));

app.get('/api/grupe', samoAdmin, uhvati(async (_req, res) => {
  const { rows } = await upit(
    `SELECT k.id, k.naziv, k.paket, k.prefiks_sifre, k.cuva_imena, k.anonimizovano,
            f.naziv AS firma, pr.naziv AS program, pr.godina,
            (SELECT COUNT(*) FROM ucesnik u WHERE u.grupa_id = k.id)            AS ucesnika,
            (SELECT COUNT(*) FROM obuka o WHERE o.grupa_id = k.id)              AS obuka,
            (SELECT COUNT(*) FROM talas w WHERE w.grupa_id = k.id)              AS termina,
            (SELECT COUNT(*) FROM talas w WHERE w.grupa_id = k.id AND w.otvoren) AS otvorenih,
            (SELECT COUNT(*) FROM sesija s JOIN talas w ON w.id = s.talas_id
              WHERE w.grupa_id = k.id AND s.predata IS NOT NULL)                AS provera
       FROM grupa k
       JOIN firma f    ON f.id  = k.firma_id
       JOIN nacrt n    ON n.id  = k.nacrt_id
       JOIN program pr ON pr.id = n.program_id
      ORDER BY k.id`);
  res.json(rows);
}));

/** Termini sa stanjem otvorenosti i odzivom. */
app.get('/api/izvestaj/:grupaId/termini', samoAdmin, uhvati(async (req, res) => {
  const { rows } = await upit(
    `SELECT w.id, w.oznaka, w.redni, w.opis, w.planiran_datum, w.otvoren,
            (SELECT COUNT(*) FROM ucesnik u WHERE u.grupa_id = w.grupa_id) AS upisanih,
            (SELECT COUNT(*) FROM sesija s
              WHERE s.talas_id = w.id AND s.predata IS NOT NULL)               AS predatih
       FROM talas w WHERE w.grupa_id = $1 ORDER BY w.redni`,
    [req.params.grupaId]);
  res.json(rows);
}));

/** Prost spisak učesnika — za štampu ceduljica i pregled. */
app.get('/api/izvestaj/:grupaId/spisak-ucesnika', samoAdmin, uhvati(async (req, res) => {
  const { rows } = await upit(
    `SELECT u.id, u.sifra, u.ime_prezime, u.radno_mesto, u.smena,
            (u.radno_mesto_id IS NOT NULL) AS povezano_radno_mesto,
            (SELECT COUNT(*) FROM sesija s
              WHERE s.ucesnik_id = u.id AND s.predata IS NOT NULL) AS uradjenih
       FROM ucesnik u WHERE u.grupa_id = $1 ORDER BY u.sifra`,
    [req.params.grupaId]);
  res.json(rows);
}));

/** Brisanje učesnika koji još nije radio nijedan test. */
app.delete('/api/admin/ucesnik/:id', samoAdmin, uhvati(async (req, res) => {
  const { rows: [u] } = await upit(
    `SELECT (SELECT COUNT(*) FROM sesija s WHERE s.ucesnik_id = $1) AS n FROM ucesnik WHERE id = $1`,
    [req.params.id]);
  if (!u) return res.status(404).json({ greska: 'Učesnik ne postoji.' });
  if (Number(u.n) > 0)
    return res.status(409).json({ greska: 'Učesnik je već radio test — ne može se obrisati.' });
  await upit(`DELETE FROM ucesnik WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
}));


// =====================================================================
//  PRIJAVA I KORISNICI
// =====================================================================
app.post('/api/prijava', uhvati(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const { rows: [k] } = await upit(
    `SELECT * FROM korisnik WHERE lower(email) = $1 AND aktivan`, [email]);
  if (!k || !proveriLozinku(String(req.body.lozinka || ''), k.lozinka_hash))
    return res.status(401).json({ greska: 'Pogrešan e-mail ili lozinka.' });

  const token = await napraviSesiju(k.id);
  await upit(`UPDATE korisnik SET poslednja_prijava = now() WHERE id = $1`, [k.id]);
  res.setHeader('Set-Cookie', kolacicSesije(token, req.secure || req.get('x-forwarded-proto') === 'https'));
  res.json({ ime: k.ime, uloga: k.uloga, mora_promeniti: k.mora_promeniti });
}));

app.post('/api/odjava', uhvati(async (req, res) => {
  const c = (req.headers.cookie || '').match(/(?:^|; )sesija=([^;]*)/);
  if (c) await obrisiSesiju(decodeURIComponent(c[1]));
  res.setHeader('Set-Cookie', 'sesija=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
}));

/** Ko sam ja — stranice ovim proveravaju prijavu i prilagođavaju prikaz. */
app.get('/api/ja', uhvati(async (req, res) => {
  const glavni = req.get('x-admin-token');
  if (glavni && glavni === process.env.ADMIN_TOKEN)
    return res.json({ ime: 'izvođač', uloga: 'izvodjac', glavniKljuc: true });
  const c = (req.headers.cookie || '').match(/(?:^|; )sesija=([^;]*)/);
  const k = c ? await nadjiSesiju(decodeURIComponent(c[1])) : null;
  if (!k) return res.status(401).json({ greska: 'Niste prijavljeni.' });
  // `potpis` je ono čime se ovaj nalog potpisuje na zapisu. Uzima se ime sa
  // spiska zaposlenih ako je nalog vezan — ime, ne šifra, jer zapis čita
  // inspektor, a njemu „M-01" ne znači ništa. Server pri upisu radi isti
  // račun, pa se prikazano i upisano ne mogu razići.
  let potpis = k.ime;
  try {
    const r = await upit(
      `SELECT COALESCE(l.ime_prezime, u.ime) p FROM korisnik u
         LEFT JOIN lice l ON l.id = u.lice_id WHERE u.id = $1`, [k.id]);
    if (r.rows[0]?.p) potpis = r.rows[0].p;
  } catch { /* stara baza bez lice_id — ostaje ime */ }
  res.json({ ime: k.ime, uloga: k.uloga, potpis,
    mora_promeniti: k.mora_promeniti });
}));

// Operater MORA biti ovdje: svaki nov nalog ima mora_promeniti = TRUE,
// pa bez ovoga magacioner zaglavi na prvoj prijavi i ne može ući.
app.post('/api/lozinka', dozvoli('izvodjac','bzr','uprava','operater','vozac'), uhvati(async (req, res) => {
  const nova = String(req.body.nova || '');
  if (nova.length < 10)
    return res.status(400).json({ greska: 'Lozinka mora imati bar 10 znakova.' });
  if (!req.korisnik.id) return res.status(400).json({ greska: 'Glavni ključ nema lozinku.' });
  await upit(`UPDATE korisnik SET lozinka_hash = $2, mora_promeniti = FALSE WHERE id = $1`,
    [req.korisnik.id, hesirajLozinku(nova)]);
  res.json({ ok: true });
}));

/* ---------------------------------------------------------------- korisnici
   Izvođač radi sve. Odgovorno lice (`bzr`) smije samo jedno: da otvori i
   zatvori nalog magacionera ili vozača u SVOJOJ firmi. Nikad nalog sebi
   ravan ni iznad sebe, nikad u tuđoj firmi.

   Zašto uopšte: bez toga nov radnik u ponedjeljak nema nalog dok se
   konsultant ne javi, pa upisuje pod tuđom šifrom — a lažan trag je gori
   od praznog dana. */
const jeIzvodjac = req => req.korisnik?.uloga === 'izvodjac';

/** Vraća null ako smije, ili poruku o odbijanju. */
// Odgovorno lice otvara naloge ISPOD sebe: magacin i vozače. Nikad sebi ravan.
const NALOZI_ISPOD = ['operater', 'vozac'];

// Kojoj firmi korisnik pripada. Nalog napravljen ranije (ili ručno u Supabase)
// često ima `firma_id = NULL`. Po pravilu „jedan klijent = jedna baza" tada
// postoji tačno jedna firma i to je ta — pa se nalog ne odbija zbog nečega
// što je greška u postavci, a ne ovlašćenje. Kad firmi ima više, NULL ostaje
// NULL i odbijanje je opravdano.
let _jedinaFirma;                       // undefined = još nije provjereno
async function jedinaFirmaId() {
  if (_jedinaFirma !== undefined) return _jedinaFirma;
  try {
    const r = await upit('SELECT id FROM firma ORDER BY id LIMIT 2');
    _jedinaFirma = r.rows.length === 1 ? r.rows[0].id : null;
  } catch { _jedinaFirma = null; }
  return _jedinaFirma;
}

async function firmaKorisnika(req) {
  if (req.korisnik?.firma_id) return req.korisnik.firma_id;
  return await jedinaFirmaId();
}

async function smijeNadUlogom(req, uloga) {
  if (jeIzvodjac(req)) return null;
  if (!NALOZI_ISPOD.includes(uloga))
    return 'Odgovorno lice smije da otvori samo nalog za magacin ili za vozača.';
  if (!(await firmaKorisnika(req)))
    return 'Tvoj nalog nije vezan za firmu, a u bazi ih ima više od jedne — '
         + 'konsultant mora da veže nalog za firmu.';
  return null;
}

/** Učitava ciljanog korisnika i provjerava smije li podnosilac nad njim. */
async function ciljKorisnik(req) {
  const { rows: [c] } = await upit(
    `SELECT id, uloga, firma_id FROM korisnik WHERE id = $1`, [req.params.id]);
  if (!c) return { greska: 'Korisnik ne postoji.', status: 404 };
  if (jeIzvodjac(req)) return { cilj: c };
  const moja = await firmaKorisnika(req);
  if (!NALOZI_ISPOD.includes(c.uloga) || (c.firma_id || moja) !== moja)
    return { greska: 'Nad tim nalogom nemaš ovlašćenje.', status: 403 };
  return { cilj: c };
}

app.get('/api/korisnici', dozvoli('izvodjac', 'bzr'), uhvati(async (req, res) => {
  const samoMoji = !jeIzvodjac(req);
  // `v_nalozi` spaja nalog sa licem sa spiska — odatle ime, šifra i radno
  // mjesto. Ako pogleda još nema (09 nije primijenjen), pada se na `korisnik`.
  const izvor = (await upit("SELECT to_regclass('public.v_nalozi') IS NOT NULL AS ima"))
    .rows[0].ima
    ? `SELECT id, email, ime, uloga, aktivan, mora_promeniti, poslednja_prijava,
              sifra, radno_mjesto, lice_id, firma, firma_id FROM v_nalozi`
    : `SELECT k.id, k.email, k.ime, k.uloga, k.aktivan, k.mora_promeniti,
              k.poslednja_prijava, NULL::text AS sifra, NULL::text AS radno_mjesto,
              NULL::int AS lice_id, f.naziv AS firma, k.firma_id
         FROM korisnik k LEFT JOIN firma f ON f.id = k.firma_id`;
  const { rows } = await upit(
    `SELECT * FROM (${izvor}) v
      WHERE NOT $1::bool OR (v.uloga IN ('operater','vozac') AND v.firma_id = $2)
      ORDER BY v.uloga, v.ime`,
    [samoMoji, await firmaKorisnika(req)]);
  rows.forEach(r => { delete r.firma_id; });
  res.json(rows);
}));

/** Novi korisnik. Lozinku pravi sistem i pokazuje je JEDNOM. */
app.post('/api/korisnici', dozvoli('izvodjac', 'bzr'), uhvati(async (req, res) => {
  const { email, uloga } = req.body;
  let ime = req.body.ime;
  if (!email || !['izvodjac','bzr','uprava','operater','vozac'].includes(uloga))
    return res.status(400).json({ greska: 'Potrebni su email i ispravna uloga.' });
  const ne = await smijeNadUlogom(req, uloga);
  if (ne) return res.status(403).json({ greska: ne });
  // Odgovorno lice ne bira firmu — nalog nastaje u njegovoj.
  const firma_id = jeIzvodjac(req)
    ? (req.body.firma_id || null)
    : await firmaKorisnika(req);

  // Nalog se po pravilu veže za lice sa spiska: odatle ime i šifra kojom
  // potpisuje zapise. Bez toga se u bazi ne vidi ko je vlasnik naloga.
  let lice_id = req.body.lice_id ? Number(req.body.lice_id) : null;
  let sifra = null;
  if (lice_id) {
    const { rows: [l] } = await upit(
      'SELECT id, firma_id, ime_prezime, sifra FROM lice WHERE id = $1', [lice_id]);
    if (!l) return res.status(400).json({ greska: 'To lice ne postoji na spisku.' });
    if (!jeIzvodjac(req) && l.firma_id !== await firmaKorisnika(req))
      return res.status(403).json({ greska: 'To lice nije iz tvoje firme.' });
    ime = l.ime_prezime;
    sifra = l.sifra;
  }
  if (!ime) return res.status(400).json({
    greska: 'Izaberi lice sa spiska ili upiši ime i prezime.' });

  const lozinka = crypto.randomBytes(9).toString('base64url');
  try {
    const { rows: [k] } = await upit(
      `INSERT INTO korisnik (firma_id, email, ime, uloga, lozinka_hash, lice_id)
       VALUES ($1, lower($2), $3, $4::uloga_t, $5, $6) RETURNING id`,
      [firma_id, String(email).trim(), ime, uloga, hesirajLozinku(lozinka), lice_id]);
    res.json({ id: k.id, email, ime, uloga, sifra, lozinka,
      poruka: 'Zapiši lozinku — prikazuje se samo sada. Korisnik je menja pri prvoj prijavi.' });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({
      greska: /lice/.test(e.constraint || '')
        ? 'To lice već ima nalog.' : 'Taj e-mail već postoji.' });
    if (e.code === '42703') return res.status(500).json({
      greska: 'Baza nema kolonu lice_id — pokreni: node alati\\dopune.mjs' });
    throw e;
  }
}));

app.post('/api/korisnici/:id/stanje', dozvoli('izvodjac', 'bzr'), uhvati(async (req, res) => {
  const { greska, status } = await ciljKorisnik(req);
  if (greska) return res.status(status).json({ greska });
  await upit(`UPDATE korisnik SET aktivan = $2 WHERE id = $1`,
    [req.params.id, req.body.aktivan !== false]);
  await upit(`DELETE FROM sesija_korisnika WHERE korisnik_id = $1`, [req.params.id]);
  res.json({ ok: true });
}));

/**
 * Mijenja ulogu postojećeg naloga. Uloga odlučuje KOJU TABLU čovjek vidi —
 * ne radno mjesto sa spiska. Magacioner kome je greškom dodijeljena uloga
 * `vozac` vidi vozačku tablu dok se ovo ne ispravi. Ranije je jedini izlaz
 * bio zatvoriti nalog i otvoriti nov sa drugim e-mailom.
 */
app.post('/api/korisnici/:id/uloga', dozvoli('izvodjac', 'bzr'), uhvati(async (req, res) => {
  const { greska, status } = await ciljKorisnik(req);
  if (greska) return res.status(status).json({ greska });
  const uloga = String(req.body?.uloga || '');
  if (!['izvodjac','bzr','uprava','operater','vozac'].includes(uloga))
    return res.status(400).json({ greska: 'Nepoznata uloga.' });
  const ne = await smijeNadUlogom(req, uloga);   // bzr smije samo operater/vozac
  if (ne) return res.status(403).json({ greska: ne });
  if (Number(req.params.id) === Number(req.korisnik.id))
    return res.status(400).json({ greska: 'Svoju ulogu ne možeš da mijenjaš.' });
  await upit(`UPDATE korisnik SET uloga = $2 WHERE id = $1`, [req.params.id, uloga]);
  // Stara sesija nosi staru ulogu — dok se ne odjavi, vidio bi staru tablu.
  await upit(`DELETE FROM sesija_korisnika WHERE korisnik_id = $1`, [req.params.id]);
  res.json({ ok: true, uloga });
}));

/** Veže postojeći nalog za lice sa spiska — za naloge otvorene prije spiska. */
app.post('/api/korisnici/:id/lice', dozvoli('izvodjac', 'bzr'), uhvati(async (req, res) => {
  const { greska, status } = await ciljKorisnik(req);
  if (greska) return res.status(status).json({ greska });
  const lice_id = req.body.lice_id ? Number(req.body.lice_id) : null;
  if (lice_id) {
    const { rows: [l] } = await upit(
      'SELECT id, firma_id, ime_prezime, sifra FROM lice WHERE id = $1', [lice_id]);
    if (!l) return res.status(400).json({ greska: 'To lice ne postoji na spisku.' });
    if (!jeIzvodjac(req) && l.firma_id !== await firmaKorisnika(req))
      return res.status(403).json({ greska: 'To lice nije iz tvoje firme.' });
    try {
      await upit('UPDATE korisnik SET lice_id = $2, ime = $3 WHERE id = $1',
        [req.params.id, lice_id, l.ime_prezime]);
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ greska: 'To lice već ima nalog.' });
      throw e;
    }
    return res.json({ ok: true, ime: l.ime_prezime, sifra: l.sifra });
  }
  await upit('UPDATE korisnik SET lice_id = NULL WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

app.post('/api/korisnici/:id/nova-lozinka', dozvoli('izvodjac', 'bzr'), uhvati(async (req, res) => {
  const { greska, status } = await ciljKorisnik(req);
  if (greska) return res.status(status).json({ greska });
  // Postojeća lozinka se NE može pročitati — u bazi stoji samo heš i to je
  // namjerno. Može se postaviti nova: ili zadata (`nova`), ili nasumična.
  // Zadata se ne traži da se mijenja pri prvoj prijavi — magacioner koji je
  // dobio ceduljicu ne treba da izmišlja novu lozinku na telefonu u hladnjači.
  const zadata = String(req.body?.nova || '').trim();
  if (zadata && zadata.length < 10)
    return res.status(400).json({ greska: 'Lozinka mora imati bar 10 znakova.' });
  const lozinka = zadata || crypto.randomBytes(9).toString('base64url');
  const r = await upit(
    `UPDATE korisnik SET lozinka_hash = $2, mora_promeniti = $3 WHERE id = $1`,
    [req.params.id, hesirajLozinku(lozinka), !zadata]);
  if (!r.rowCount) return res.status(404).json({ greska: 'Korisnik ne postoji.' });
  await upit(`DELETE FROM sesija_korisnika WHERE korisnik_id = $1`, [req.params.id]);
  res.json({ lozinka, zadata: !!zadata,
    poruka: 'Nova lozinka. Prikazuje se samo sada.' });
}));

/** Zbirna dopunska obuka — bez šifara, da je uprava sme videti. */
app.get('/api/izvestaj/:grupaId/dopuna-zbirno', iUprava, uhvati(async (req, res) => {
  const { rows } = await upit(
    `SELECT tema, tema_naziv, nivo_rizika, COUNT(*)::int AS zaposlenih,
            ROUND(AVG(procenat), 1) AS prosek
       FROM v_ponovna_obuka WHERE grupa_id = $1
      GROUP BY tema, tema_naziv, nivo_rizika ORDER BY tema`,
    [req.params.grupaId]);
  res.json(rows);
}));

// Oznaka izdanja. Mijenja se kad se doda nešto što traži restart ili SQL
// dopunu — po njoj `alati/provjeri.mjs` vidi vrti li se stari kod.
const IZDANJE = '2026-09-19-uloge';

app.get('/api/zdravlje', uhvati(async (_req, res) => {
  await upit('SELECT 1');
  const { rows: [t] } = await upit(
    "SELECT to_regclass('public.lice') IS NOT NULL AS ima_lice");
  res.json({ ok: true, izdanje: IZDANJE, ima_lice: t.ima_lice,
    vreme: new Date().toISOString() });
}));

proveriPriPokretanju();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sluša na portu ${PORT}`));
