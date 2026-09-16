/**
 * Učitava banku pitanja iz db/banka.json u bazu.
 * Pokretanje:  npm run seed
 * Idempotentno: briše i ponovo upisuje sadržaj programa, ne dira merenja.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../server/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function ucitajSql(naziv, klijent) {
  const sql = fs.readFileSync(path.join(__dirname, naziv), 'utf8');
  await klijent.query(sql);
  console.log(`  ✓ ${naziv}`);
}

async function main() {
  const svez = process.argv.includes('--svez');
  // Za drugog klijenta: zameni sadržaj db/banka.json, kod se ne dira.
  // Ili pokreni sa drugim fajlom:  node db/seed.js --svez banka_hotel.json
  const nazivBanke = process.argv.find(a => a.endsWith('.json')) || 'banka.json';
  const putanjaBanke = path.join(__dirname, nazivBanke);
  if (!fs.existsSync(putanjaBanke)) {
    console.error(`Nema fajla ${nazivBanke} u fascikli db/.`);
    process.exit(1);
  }
  const banka = JSON.parse(fs.readFileSync(putanjaBanke, 'utf8'));
  const k = await pool.connect();

  try {
    if (svez) {
      console.log('Kreiram šemu (--svez briše postojeće podatke):');
      await ucitajSql('01_schema.sql', k);
      await ucitajSql('00_sifre.sql', k);
      await ucitajSql('02_pogledi.sql', k);
      await ucitajSql('03_analiza.sql', k);
    }

    await k.query('BEGIN');

    // -------------------------------------------------------- firma
    const { rows: [firma] } = await k.query(
      `INSERT INTO firma (naziv, delatnost, standardi) VALUES ($1,$2,$3) RETURNING id`,
      [banka.firma.naziv, banka.firma.delatnost, banka.firma.standardi]
    );

    // -------------------------------------------------------- program
    const { rows: [program] } = await k.query(
      `INSERT INTO program (firma_id, naziv, godina, pravni_osnov)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [firma.id, banka.program.naziv, banka.program.godina, banka.program.pravni_osnov]
    );

    // -------------------------------------------------------- teme
    const teme = {};
    for (const t of banka.teme) {
      const { rows: [r] } = await k.query(
        `INSERT INTO tema (program_id, oznaka, naziv, nivo_rizika, izvor)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [program.id, t.oznaka, t.naziv, t.nivo_rizika, t.izvor]
      );
      teme[t.oznaka] = r.id;
    }

    // -------------------------------------------------------- nacrt
    const { rows: [nacrt] } = await k.query(
      `INSERT INTO nacrt (program_id, verzija, ukupno_stavki, prag_teme)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [program.id, banka.nacrt.verzija, banka.nacrt.ukupno_stavki, banka.nacrt.prag_teme]
    );

    // -------------------------------------------------------- porodice i stavke
    const porodice = {};
    let brojStavki = 0;
    for (const p of banka.porodice) {
      const { rows: [r] } = await k.query(
        `INSERT INTO porodica (tema_id, oznaka, konstrukt, kognitivni_nivo, je_sidro)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [teme[p.tema], p.oznaka, p.konstrukt, p.kognitivni_nivo, p.je_sidro]
      );
      porodice[p.oznaka] = r.id;

      for (const s of p.stavke) {
        const { rows: [st] } = await k.query(
          `INSERT INTO stavka (porodica_id, varijanta, tekst, zahteva_potvrdu)
           VALUES ($1,$2,$3,$4) RETURNING id`,
          [r.id, s.varijanta, s.tekst, s.zahteva_potvrdu]
        );
        brojStavki++;
        let i = 1;
        for (const o of s.opcije) {
          await k.query(
            `INSERT INTO opcija (stavka_id, redosled, tekst, tacna) VALUES ($1,$2,$3,$4)`,
            [st.id, i++, o.tekst, o.tacna]
          );
        }
      }
    }

    // -------------------------------------------------------- pozicije u nacrtu
    let redni = 1;
    for (const oznaka of banka.raspored_forme) {
      const p = banka.porodice.find(x => x.oznaka === oznaka);
      if (!p) throw new Error(`Raspored forme traži porodicu ${oznaka} koja ne postoji u banci`);
      await k.query(
        `INSERT INTO nacrt_pozicija (nacrt_id, redni_broj, porodica_id, tip)
         VALUES ($1,$2,$3,$4)`,
        [nacrt.id, redni++, porodice[oznaka], p.je_sidro ? 'sidro' : 'rotaciona']
      );
    }

    // -------------------------------------------------------- grupa i talasi
    // Prefiks šifre po sektoru: P proizvodnja · H hotelijerstvo · K konsalting
    const prefiks = banka.grupa?.prefiks_sifre || 'P';
    const paket = ['provera','osnovno','prosireno'].includes(banka.grupa?.paket)
      ? banka.grupa.paket : 'provera';
    const { rows: [grupa] } = await k.query(
      `INSERT INTO grupa (firma_id, nacrt_id, naziv, lokacija, prefiks_sifre, paket, broj_planiranih)
       VALUES ($1,$2,$3,$4,$5,$6::paket_t,$7) RETURNING id`,
      [firma.id, nacrt.id,
       banka.grupa?.naziv || 'Proizvodnja — godišnja obuka 2026',
       banka.grupa?.lokacija || 'Pogon',
       prefiks, paket,
       banka.grupa?.broj_planiranih || 40]
    );

    // T1 je uvek prisutan — on je provera osposobljenosti.
    const opisT1 = paket === 'provera'
      ? 'Provera osposobljenosti nakon obuke'
      : 'Izlazna provera — odmah nakon obuke';
    const sviTalasi = [
      ['T0',  1, 'Ulazna provera — pre obuke',          0],
      ['T1',  2, opisT1,                                0],
      ['T30', 3, 'Provera zadržavanja — 30 dana',      30],
      ['T90', 4, 'Provera zadržavanja — 90 dana',      90],
    ];
    const talasi = paket === 'provera'   ? [sviTalasi[1]]
                 : paket === 'osnovno'   ? sviTalasi.slice(0, 2)
                 : sviTalasi;
    for (const [oznaka, red, opis, pomak] of talasi) {
      await k.query(
        `INSERT INTO talas (grupa_id, oznaka, redni, opis, planiran_datum, otvoren)
         VALUES ($1,$2,$3,$4, CURRENT_DATE + $5::int, $6)`,
        [grupa.id, oznaka, red, opis, pomak, red <= 2]
      );
    }

    await k.query('COMMIT');

    // radna mesta iz Akta o proceni rizika (ako su navedena u banci)
    if (Array.isArray(banka.radna_mesta) && banka.radna_mesta.length) {
      for (const rm of banka.radna_mesta) {
        const { rows: [r] } = await k.query(
          `INSERT INTO radno_mesto (firma_id, naziv, opis_poslova, povecan_rizik,
                                    sifre_opasnosti, mere, lzo, obavestenja, rukovodilac_prati)
           VALUES ($1,$2,$3,COALESCE($4,FALSE),$5,$6,$7,$8,$9)
           ON CONFLICT (firma_id, naziv) DO UPDATE SET naziv = EXCLUDED.naziv
           RETURNING id`,
          [firma.id, rm.naziv, rm.opis_poslova || null, rm.povecan_rizik,
           rm.sifre_opasnosti || null, rm.mere || null, rm.lzo || null,
           rm.obavestenja || null, rm.rukovodilac_prati || null]);
      }
      console.log(`  Radna mesta: ${banka.radna_mesta.length} (iz Akta o proceni rizika)`);
    }

    const { rows: [{ count: nepotvrdjene }] } = await k.query(
      `SELECT COUNT(*)::int AS count FROM stavka WHERE zahteva_potvrdu AND potvrdio IS NULL`
    );

    console.log(`\n  Banka:     ${nazivBanke}`);
    console.log(`  Firma:     ${banka.firma.naziv}`);
    console.log(`  Program:   ${banka.program.naziv}`);
    console.log(`  Teme:      ${banka.teme.length}`);
    console.log(`  Porodice:  ${banka.porodice.length}`);
    console.log(`  Stavke:    ${brojStavki}`);
    console.log(`  Forma:     ${banka.raspored_forme.length} stavki`);
    console.log(`  Paket:     ${
      paket === 'provera'  ? 'provera — obuka, provjera osposobljenosti i prilozi'
    : paket === 'osnovno'  ? 'osnovno — + ulazna provera, vidi se efekat obuke'
    :                        'prošireno — + zadržavanje znanja na 30 i 90 dana'}`);
    console.log(`  Grupa:     #${grupa.id} · ${talasi.length} ${
      talasi.length === 1 ? 'termin' : 'termina'}: ${talasi.map(t => t[0]).join(', ')}`);
    console.log(`  Šifre:     ${prefiks}-001, ${prefiks}-002, …\n`);
    if (nepotvrdjene > 0) {
      console.log(`  ⚠  ${nepotvrdjene} stavki čeka potvrdu klijenta (brojke iz HACCP plana).`);
      console.log(`     Dok nisu potvrđene, NE serviraju se. Vidi README, korak 6.\n`);
    }
  } catch (e) {
    await k.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    k.release();
    await pool.end();
  }
}

main().catch(e => { console.error('GREŠKA:', e.message); process.exit(1); });
