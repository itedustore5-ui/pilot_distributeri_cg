-- =====================================================================
--  ISPRAVKE ZAPISA — dopuna uz 04_zapisi_cg.sql
--
--  Pokreće se POSLIJE 04, na postojećoj bazi. Ne dira podatke:
--  mijenja samo poglede i dodaje indekse.
--
--      Get-Content db\06_ispravke_cg.sql -Raw -Encoding UTF8 | Set-Clipboard
--      Supabase → SQL Editor → New query → Ctrl+V → Run
--
--  ---------------------------------------------------------------------
--  ŠTA SE ISPRAVLJA
--
--  Pravilo je: zapis se NE MIJENJA i NE BRIŠE. Ispravka je NOV zapis
--  koji pokazuje na stari preko `ispravlja_id`.
--
--  Prva verzija pogleda filtrirala je `ispravlja_id IS NULL`, a to je
--  naopako — tako se zadržavao stari, pogrešan zapis, a ispravka se
--  skrivala. Ispravno je: prikazuje se zapis koji NIJE ISPRAVLJEN,
--  odnosno onaj na koji niko drugi ne pokazuje.
--
--  Stari zapis ostaje u bazi zauvijek. To je i smisao — inspektoru se
--  pokazuje da je greška uočena i ispravljena, a ne da je nestala.
-- =====================================================================

-- Osigurač: ako uloga „operater“ iz nekog razloga nije ušla sa 04,
-- bez nje magacioner ne može dobiti nalog. Ovo je bezopasno ako već postoji.
ALTER TYPE uloga_t ADD VALUE IF NOT EXISTS 'operater';

CREATE INDEX IF NOT EXISTS idx_zapis_ispravlja    ON zapis(ispravlja_id)    WHERE ispravlja_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prijem_ispravlja   ON prijem(ispravlja_id)   WHERE ispravlja_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_isporuka_ispravlja ON isporuka(ispravlja_id) WHERE ispravlja_id IS NOT NULL;

-- ---------------------------------------------------------------------
--  Korak nazad — od lota do dobavljača
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_sledljivost_nazad AS
SELECT
  p.firma_id,
  p.id                AS prijem_id,
  p.lot,
  a.naziv             AS artikal,
  a.grupa,
  p.datum             AS datum_prijema,
  p.rok_trajanja,
  p.kolicina          AS primljeno,
  p.broj_otpremnice,
  p.temperatura,
  p.ishod,
  d.naziv             AS dobavljac,
  d.telefon           AS dobavljac_telefon,
  d.broj_objekta      AS dobavljac_broj_objekta,
  p.izvrsilac,
  p.ispravlja_id IS NOT NULL AS je_ispravka
FROM prijem p
JOIN dobavljac d ON d.id = p.dobavljac_id
JOIN artikal   a ON a.id = p.artikal_id
WHERE NOT EXISTS (SELECT 1 FROM prijem n WHERE n.ispravlja_id = p.id);

-- ---------------------------------------------------------------------
--  Korak naprijed — od lota do svih kupaca
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_sledljivost_napred AS
SELECT
  p.firma_id,
  p.lot,
  a.naziv             AS artikal,
  p.datum             AS datum_prijema,
  d.naziv             AS dobavljac,
  i.id                AS isporuka_id,
  i.datum             AS datum_isporuke,
  k.naziv             AS kupac,
  k.telefon           AS kupac_telefon,
  k.adresa            AS kupac_adresa,
  i.kolicina          AS isporuceno,
  i.broj_otpremnice,
  i.vozac,
  v.registracija      AS vozilo
FROM prijem p
JOIN artikal   a ON a.id = p.artikal_id
JOIN dobavljac d ON d.id = p.dobavljac_id
JOIN isporuka  i ON i.prijem_id = p.id
                AND NOT EXISTS (SELECT 1 FROM isporuka n WHERE n.ispravlja_id = i.id)
JOIN kupac     k ON k.id = i.kupac_id
LEFT JOIN vozilo v ON v.id = i.vozilo_id
WHERE NOT EXISTS (SELECT 1 FROM prijem n WHERE n.ispravlja_id = p.id);

-- ---------------------------------------------------------------------
--  Sva odstupanja — prvo što odgovorno lice gleda pri verifikaciji
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_odstupanja AS
SELECT firma_id, datum, 'KKT1 prijem'::text AS izvor,
       ('lot ' || lot || ', ' || COALESCE(temperatura::text,'—') || ' °C, granica '
        || COALESCE(granica_primjenjena::text,'—') || ' °C')::text AS opis,
       korektivna_mjera, izvrsilac, NULL::text AS kontrolor
  FROM prijem p
 WHERE ishod <> 'prihvaceno'
   AND NOT EXISTS (SELECT 1 FROM prijem n WHERE n.ispravlja_id = p.id)
UNION ALL
SELECT firma_id, datum, 'KKT3 isporuka'::text,
       ('utovar ' || COALESCE(temp_utovar::text,'—') || ' °C, isporuka '
        || COALESCE(temp_isporuka::text,'—') || ' °C')::text,
       korektivna_mjera, vozac, preuzeo
  FROM isporuka i
 WHERE odstupanje
   AND NOT EXISTS (SELECT 1 FROM isporuka n WHERE n.ispravlja_id = i.id)
UNION ALL
-- Čitljiv opis umjesto sirovog JSON-a: „komora: Komora 1 · temperatura: 8.6“.
SELECT firma_id, datum, ('obrazac ' || obrazac)::text,
       COALESCE(podaci->>'opis',
                (SELECT string_agg(replace(e.k,'_',' ') || ': ' || e.v, ' · ')
                   FROM jsonb_each_text(podaci) AS e(k, v))),
       korektivna_mjera, izvrsilac, kontrolor
  FROM zapis z
 WHERE odstupanje
   AND NOT EXISTS (SELECT 1 FROM zapis n WHERE n.ispravlja_id = z.id);

-- ---------------------------------------------------------------------
--  Pokrivenost dana
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_zapisi_dan AS
SELECT firma_id, datum, obrazac, COUNT(*) AS broj,
       SUM(CASE WHEN odstupanje THEN 1 ELSE 0 END) AS odstupanja
  FROM zapis z
 WHERE NOT EXISTS (SELECT 1 FROM zapis n WHERE n.ispravlja_id = z.id)
 GROUP BY firma_id, datum, obrazac;

-- ---------------------------------------------------------------------
--  NOVO: trag ispravki — za inspektora i za internu provjeru.
--  Pokazuje šta je bilo upisano, šta je ispravljeno i ko je ispravio.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_trag_ispravki AS
SELECT n.firma_id, 'zapis'::text AS vrsta, ('Prilog ' || n.obrazac) AS oznaka,
       s.datum AS datum_izvornog, n.datum AS datum_ispravke,
       s.kreirano AS uneseno, n.kreirano AS ispravljeno,
       s.izvrsilac AS unio, n.izvrsilac AS ispravio,
       (SELECT string_agg(replace(e.k,'_',' ') || ': ' || e.v, ' · ')
          FROM jsonb_each_text(s.podaci) AS e(k, v)) AS bilo,
       (SELECT string_agg(replace(e.k,'_',' ') || ': ' || e.v, ' · ')
          FROM jsonb_each_text(n.podaci) AS e(k, v)) AS ispravljeno_na
  FROM zapis n JOIN zapis s ON s.id = n.ispravlja_id
UNION ALL
SELECT n.firma_id, 'prijem', ('serija ' || n.lot),
       s.datum, n.datum, s.kreirano, n.kreirano, s.izvrsilac, n.izvrsilac,
       ('temperatura: ' || COALESCE(s.temperatura::text,'—') || ' °C · količina: ' || s.kolicina),
       ('temperatura: ' || COALESCE(n.temperatura::text,'—') || ' °C · količina: ' || n.kolicina)
  FROM prijem n JOIN prijem s ON s.id = n.ispravlja_id
UNION ALL
SELECT n.firma_id, 'isporuka', ('otpremnica ' || COALESCE(n.broj_otpremnice,'—')),
       s.datum, n.datum, s.kreirano, n.kreirano, s.vozac, n.vozac,
       ('utovar: ' || COALESCE(s.temp_utovar::text,'—') || ' °C · isporuka: '
        || COALESCE(s.temp_isporuka::text,'—') || ' °C · količina: ' || s.kolicina),
       ('utovar: ' || COALESCE(n.temp_utovar::text,'—') || ' °C · isporuka: '
        || COALESCE(n.temp_isporuka::text,'—') || ' °C · količina: ' || n.kolicina)
  FROM isporuka n JOIN isporuka s ON s.id = n.ispravlja_id;

-- ---------------------------------------------------------------- kontrola
SELECT 'pogledi osvježeni' AS stanje,
       (SELECT string_agg(enumlabel, ', ' ORDER BY enumsortorder)
          FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'uloga_t')                AS uloge,
       (SELECT count(*) FROM v_sledljivost_nazad) AS prijema,
       (SELECT count(*) FROM v_odstupanja)        AS odstupanja,
       (SELECT count(*) FROM v_trag_ispravki)     AS ispravki;
