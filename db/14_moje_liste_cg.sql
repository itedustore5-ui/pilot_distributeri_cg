-- 14_moje_liste_cg.sql — pogledi nose nalog koji je unio zapis
--
-- Zašto: vozač i magacioner treba da u listama vide SAMO SVOJE unose, a
-- odgovorno lice sve. Filter ide po `uneo_korisnik_id`, ali ga pogledi
-- `v_sledljivost_nazad` i `v_sledljivost_napred` nisu prenosili — nastali su
-- prije te kolone.
--
-- Dodaje se i `odstupanje` na pogled isporuka, da vozač u svojoj listi odmah
-- vidi koja mu je tura imala problem.
--
-- Ne dira podatke. Bezbjedno na živoj bazi. Pokreće se poslije 13.
-- (CREATE OR REPLACE VIEW ne može da doda kolonu u sredinu ni da promijeni
--  tip, zato DROP pa CREATE. Zavisni pogledi se prave ispod.)

DROP VIEW IF EXISTS v_izvoz_sledljivost;
DROP VIEW IF EXISTS v_sledljivost_napred;
DROP VIEW IF EXISTS v_sledljivost_nazad;

CREATE VIEW v_sledljivost_nazad AS
SELECT p.firma_id,
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
       p.izvrsilac,
       p.uneo_korisnik_id,
       p.ispravlja_id IS NOT NULL        AS je_ispravka,
       p.datum < p.kreirano::date        AS naknadno,
       (p.kreirano::date - p.datum)::int AS dana_kasnije,
       d.naziv             AS dobavljac,
       d.telefon           AS dobavljac_telefon,
       d.broj_objekta      AS dobavljac_broj_objekta
  FROM prijem p
  JOIN artikal a   ON a.id = p.artikal_id
  JOIN dobavljac d ON d.id = p.dobavljac_id
 WHERE NOT EXISTS (SELECT 1 FROM prijem n WHERE n.ispravlja_id = p.id);

CREATE VIEW v_sledljivost_napred AS
SELECT p.firma_id,
       p.lot,
       a.naziv            AS artikal,
       p.datum            AS datum_prijema,
       d.naziv            AS dobavljac,
       i.id               AS isporuka_id,
       i.datum            AS datum_isporuke,
       k.naziv            AS kupac,
       k.telefon          AS kupac_telefon,
       k.adresa           AS kupac_adresa,
       i.kolicina         AS isporuceno,
       i.broj_otpremnice,
       i.vozac,
       i.uneo_korisnik_id,
       i.odstupanje,
       i.temp_utovar,
       i.temp_isporuka,
       v.registracija     AS vozilo
  FROM prijem p
  JOIN artikal a   ON a.id = p.artikal_id
  JOIN dobavljac d ON d.id = p.dobavljac_id
  JOIN isporuka i  ON i.prijem_id = p.id
                  AND NOT EXISTS (SELECT 1 FROM isporuka n WHERE n.ispravlja_id = i.id)
  JOIN kupac k     ON k.id = i.kupac_id
  LEFT JOIN vozilo v ON v.id = i.vozilo_id
 WHERE NOT EXISTS (SELECT 1 FROM prijem n WHERE n.ispravlja_id = p.id);

-- Pogled za izvoz NE MIJENJA nijednu kolonu — vraća se tačno kakav je bio,
-- jer su njegovi nazivi kolona zaglavlja u CSV-u koji ide klijentu.
CREATE VIEW v_izvoz_sledljivost AS
SELECT p.firma_id,
       p.lot                AS serija,
       a.naziv              AS artikal,
       a.grupa,
       p.datum              AS datum_prijema,
       d.naziv              AS dobavljac,
       d.telefon            AS telefon_dobavljaca,
       p.broj_otpremnice    AS otpremnica_prijema,
       p.kolicina           AS primljeno,
       p.rok_trajanja,
       p.temperatura        AS temperatura_prijema,
       p.ishod              AS ishod_prijema,
       i.datum              AS datum_isporuke,
       k.naziv              AS kupac,
       k.telefon            AS telefon_kupca,
       k.adresa             AS mjesto_kupca,
       i.kolicina           AS isporuceno,
       i.broj_otpremnice    AS otpremnica_isporuke,
       v.registracija       AS vozilo,
       i.vozac,
       i.temp_utovar,
       i.temp_isporuka,
       i.odstupanje         AS odstupanje_isporuke
  FROM prijem p
  JOIN artikal a   ON a.id = p.artikal_id
  JOIN dobavljac d ON d.id = p.dobavljac_id
  LEFT JOIN isporuka i ON i.prijem_id = p.id
                      AND NOT EXISTS (SELECT 1 FROM isporuka n WHERE n.ispravlja_id = i.id)
  LEFT JOIN kupac k    ON k.id = i.kupac_id
  LEFT JOIN vozilo v   ON v.id = i.vozilo_id
 WHERE NOT EXISTS (SELECT 1 FROM prijem n WHERE n.ispravlja_id = p.id);
