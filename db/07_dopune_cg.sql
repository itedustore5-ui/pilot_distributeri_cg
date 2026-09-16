-- =====================================================================
--  DOPUNE — pokreće se POSLIJE 06_ispravke_cg.sql
--
--      Get-Content db\07_dopune_cg.sql -Raw -Encoding UTF8 | Set-Clipboard
--      Supabase → SQL Editor → New query → Ctrl+V → Run
--
--  Ne dira podatke. Mijenja dva pogleda i dodaje dva nova.
--
--  ---------------------------------------------------------------------
--  ZAPIS UNESEN NAKNADNO
--
--  `datum` je dan na koji se zapis odnosi, `kreirano` je trenutak unosa.
--  Ako je datum stariji od dana unosa, zapis je unesen naknadno.
--
--  To nije zabranjeno — zaboravi se, pa se upiše sjutradan. Ali se NE KRIJE.
--  Inspektoru je razlika između „upisano istog dana“ i „upisano deset dana
--  kasnije“ ono što odlučuje koliko evidencija vrijedi.
--
--  Ograničenje koliko unazad se smije upisati stoji na serveru:
--  operater 1 dan · odgovorno lice 7 · konsultant 30.
--
--  ---------------------------------------------------------------------
--  PAŽNJA — REDOSLJED
--  Ako ikada ponovo pokreneš 06_ispravke_cg.sql, ODMAH poslije pokreni i
--  ovu skriptu. 06 pravi stariju verziju pogleda `v_sledljivost_nazad`,
--  bez kolone `naknadno` — a aplikacija tu kolonu traži.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Korak nazad + oznaka naknadnog unosa
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
  p.ispravlja_id IS NOT NULL   AS je_ispravka,
  p.datum < p.kreirano::date   AS naknadno,
  (p.kreirano::date - p.datum)::int AS dana_kasnije
FROM prijem p
JOIN dobavljac d ON d.id = p.dobavljac_id
JOIN artikal   a ON a.id = p.artikal_id
WHERE NOT EXISTS (SELECT 1 FROM prijem n WHERE n.ispravlja_id = p.id);

-- ---------------------------------------------------------------------
--  IZVOZ — ravna tabela sledljivosti, jedan red po isporuci.
--  Član 7 ugovora: izvoz podataka u otvorenom formatu na zahtjev.
-- ---------------------------------------------------------------------
-- Pogled se prvo briše pa pravi: CREATE OR REPLACE ne umije da promijeni
-- tip ni redosljed kolona, pa bi drugo pokretanje ove skripte puklo.
DROP VIEW IF EXISTS v_izvoz_sledljivost;
CREATE VIEW v_izvoz_sledljivost AS
SELECT
  p.firma_id,
  p.lot                        AS serija,
  a.naziv                      AS artikal,
  a.grupa,
  p.datum                      AS datum_prijema,
  d.naziv                      AS dobavljac,
  d.telefon                    AS telefon_dobavljaca,
  p.broj_otpremnice            AS otpremnica_prijema,
  p.kolicina                   AS primljeno,
  p.rok_trajanja,
  p.temperatura                AS temperatura_prijema,
  p.ishod                      AS ishod_prijema,
  i.datum                      AS datum_isporuke,
  k.naziv                      AS kupac,
  k.telefon                    AS telefon_kupca,
  k.adresa                     AS mjesto_kupca,
  i.kolicina                   AS isporuceno,
  i.broj_otpremnice            AS otpremnica_isporuke,
  v.registracija               AS vozilo,
  i.vozac,
  i.temp_utovar,
  i.temp_isporuka,
  i.odstupanje                 AS odstupanje_isporuke
FROM prijem p
JOIN artikal   a ON a.id = p.artikal_id
JOIN dobavljac d ON d.id = p.dobavljac_id
LEFT JOIN isporuka i ON i.prijem_id = p.id
                    AND NOT EXISTS (SELECT 1 FROM isporuka n WHERE n.ispravlja_id = i.id)
LEFT JOIN kupac  k ON k.id = i.kupac_id
LEFT JOIN vozilo v ON v.id = i.vozilo_id
WHERE NOT EXISTS (SELECT 1 FROM prijem n WHERE n.ispravlja_id = p.id);

-- ---------------------------------------------------------------------
--  DNEVNI PREGLED — jedan red po firmi, za provjeru da li sistem živi.
--  Odgovara na pitanje „stižu li zapisi uopšte“, bez otvaranja aplikacije.
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS v_dnevni_pregled;
CREATE VIEW v_dnevni_pregled AS
SELECT
  f.id   AS firma_id,
  f.naziv AS firma,
  (SELECT max(datum) FROM zapis    WHERE firma_id = f.id) AS zadnji_zapis,
  (SELECT max(datum) FROM prijem   WHERE firma_id = f.id) AS zadnji_prijem,
  (SELECT max(datum) FROM isporuka WHERE firma_id = f.id) AS zadnja_isporuka,
  (SELECT count(*) FROM zapis
    WHERE firma_id = f.id AND datum >= CURRENT_DATE - 7)::int AS zapisa_7_dana,
  (SELECT count(*) FROM v_odstupanja
    WHERE firma_id = f.id AND datum >= CURRENT_DATE - 30
      AND COALESCE(btrim(korektivna_mjera), '') = '')::int     AS odstupanja_bez_mjere,
  (SELECT count(*) FROM zapis z
    WHERE z.firma_id = f.id AND z.datum >= CURRENT_DATE - 30
      AND z.datum < z.kreirano::date)::int                AS naknadnih_30_dana,
  (SELECT max(datum) FROM zapis
    WHERE firma_id = f.id AND obrazac = 'D3')             AS zadnja_vjezba_povlacenja
FROM firma f;

-- ---------------------------------------------------------------------
--  KOREKTIVNA MJERA NE SMIJE BITI PRAZAN TEKST
--
--  Postojeće pravilo traži da mjera „nije NULL". Prazan string ('') ili
--  jedan razmak to pravilo zadovoljava, a u evidenciji ne znači ništa.
--  Inspektor to čita kao odstupanje bez mjere — a to je čl. 82.
--
--  NOT VALID: pravilo važi za sve NOVE zapise odmah, a stari redovi se ne
--  provjeravaju (da ovo ne padne na bazi koja već radi). Šta je od starog
--  ostalo prazno vidi se u dnevnom pregledu, kolona odstupanja_bez_mjere.
-- ---------------------------------------------------------------------
ALTER TABLE zapis    DROP CONSTRAINT IF EXISTS zapis_mjera_nije_prazna;
ALTER TABLE zapis    ADD  CONSTRAINT zapis_mjera_nije_prazna
  CHECK (NOT odstupanje OR COALESCE(btrim(korektivna_mjera), '') <> '') NOT VALID;

ALTER TABLE isporuka DROP CONSTRAINT IF EXISTS isporuka_mjera_nije_prazna;
ALTER TABLE isporuka ADD  CONSTRAINT isporuka_mjera_nije_prazna
  CHECK (NOT odstupanje OR COALESCE(btrim(korektivna_mjera), '') <> '') NOT VALID;

ALTER TABLE prijem   DROP CONSTRAINT IF EXISTS prijem_mjera_nije_prazna;
ALTER TABLE prijem   ADD  CONSTRAINT prijem_mjera_nije_prazna
  CHECK (ishod = 'prihvaceno' OR COALESCE(btrim(korektivna_mjera), '') <> '') NOT VALID;

-- ---------------------------------------------------------------- kontrola
SELECT 'dopune primijenjene' AS stanje,
       (SELECT count(*) FROM v_izvoz_sledljivost) AS redova_za_izvoz,
       (SELECT count(*) FROM v_sledljivost_nazad WHERE naknadno) AS naknadnih_prijema,
       (SELECT count(*) FROM v_dnevni_pregled)    AS firmi;
