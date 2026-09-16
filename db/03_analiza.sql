-- =====================================================================
--  POGLEDI ZA ANALIZU KVALITETA I ODLUČIVANJE
--  Dopuna na 02_pogledi.sql. Pokreće se posle njega.
-- =====================================================================

DROP VIEW IF EXISTS v_sesije_ucesnika, v_kvalitet_podataka, v_ponovna_obuka, v_po_smeni,
  v_po_radnom_mestu, v_distraktori, v_analiza_stavki CASCADE;

-- ---------------------------------------------------------------------
-- 1) ANALIZA STAVKI
--    Pre nego što izjaviš „alergeni su na 41%", proveri da pitanja o
--    alergenima nisu pokvarena. Ovo je zaštita tvog nalaza.
--
--    tezina        = procenat tačnih odgovora (klasična p-vrednost)
--    diskriminacija = point-biserial korelacija između tačnosti na stavci
--                     i ukupnog rezultata sesije. Meri da li stavka razdvaja
--                     one koji znaju od onih koji ne znaju.
--
--    PAŽNJA NA UZORAK: pri n oko 25 standardna greška korelacije je ~0.21,
--    pa je svaka vrednost između −0.2 i +0.2 statistički šum. Zato se ključ
--    prijavljuje kao sumnjiv tek ispod −0.20, i to samo kad je n >= 20.
--    Ovi nalazi su signal za ručnu proveru, ne dokaz.
-- ---------------------------------------------------------------------
CREATE VIEW v_analiza_stavki AS
WITH odg AS (
  SELECT
    st.id            AS stavka_id,
    k.id             AS grupa_id,
    t.oznaka         AS tema,
    p.oznaka         AS porodica,
    p.je_sidro,
    st.varijanta,
    st.tekst,
    o.tacan::int     AS tacan,
    s.procenat       AS ukupno_sesija
  FROM odgovor o
  JOIN sesija_stavka ss ON ss.id = o.sesija_stavka_id
  JOIN sesija        s  ON s.id  = ss.sesija_id AND s.predata IS NOT NULL
  JOIN talas         w  ON w.id  = s.talas_id
  JOIN grupa       k  ON k.id  = w.grupa_id
  JOIN stavka        st ON st.id = ss.stavka_id
  JOIN porodica      p  ON p.id  = st.porodica_id
  JOIN tema          t  ON t.id  = p.tema_id
)
SELECT
  grupa_id, stavka_id, tema, porodica, varijanta, je_sidro, tekst,
  COUNT(*)                                              AS n,
  ROUND(100.0 * SUM(tacan) / COUNT(*), 1)               AS tezina,
  ROUND(corr(tacan::float8, ukupno_sesija::float8)::numeric, 2) AS diskriminacija,
  CASE
    WHEN COUNT(*) < 20                                             THEN 'premali uzorak'
    WHEN corr(tacan::float8, ukupno_sesija::float8) < -0.20        THEN 'PROVERI KLJUČ'
    WHEN 100.0 * SUM(tacan) / COUNT(*) < 25                        THEN 'pretežak ili nejasan'
    WHEN 100.0 * SUM(tacan) / COUNT(*) > 95                        THEN 'prelak — ne meri ništa'
    WHEN corr(tacan::float8, ukupno_sesija::float8) < 0.10         THEN 'slabo razdvaja'
    ELSE 'u redu'
  END                                                   AS nalaz
FROM odg
GROUP BY grupa_id, stavka_id, tema, porodica, varijanta, je_sidro, tekst;

-- ---------------------------------------------------------------------
-- 2) DISTRAKTORI
--    Koji je netačan odgovor privukao najviše ljudi. Ako 60% bira istu
--    grešku, to nije neznanje nego RAŠIRENO POGREŠNO UVERENJE — i to je
--    najkorisniji podatak koji menadžer kvaliteta može da dobije, jer mu
--    kaže šta tačno da ispravi na sledećoj obuci.
-- ---------------------------------------------------------------------
CREATE VIEW v_distraktori AS
WITH ukupno AS (
  SELECT ss.stavka_id, w.grupa_id, COUNT(*) AS n
  FROM odgovor o
  JOIN sesija_stavka ss ON ss.id = o.sesija_stavka_id
  JOIN sesija s ON s.id = ss.sesija_id AND s.predata IS NOT NULL
  JOIN talas  w ON w.id = s.talas_id
  GROUP BY ss.stavka_id, w.grupa_id
)
SELECT
  u.grupa_id,
  st.id            AS stavka_id,
  t.oznaka         AS tema,
  p.oznaka         AS porodica,
  st.varijanta,
  st.tekst         AS pitanje,
  op.tekst         AS odgovor,
  op.tacna,
  COUNT(o.id)      AS izabralo,
  u.n              AS ukupno_odgovora,
  ROUND(100.0 * COUNT(o.id) / NULLIF(u.n, 0), 1) AS procenat
FROM stavka st
JOIN porodica p  ON p.id  = st.porodica_id
JOIN tema     t  ON t.id  = p.tema_id
JOIN opcija   op ON op.stavka_id = st.id
JOIN ukupno   u  ON u.stavka_id  = st.id
LEFT JOIN odgovor o ON o.opcija_id = op.id
LEFT JOIN sesija_stavka ss ON ss.id = o.sesija_stavka_id
LEFT JOIN sesija sx ON sx.id = ss.sesija_id AND sx.predata IS NOT NULL
GROUP BY u.grupa_id, st.id, t.oznaka, p.oznaka, st.varijanta, st.tekst,
         op.id, op.tekst, op.tacna, u.n;

-- ---------------------------------------------------------------------
-- 3) PRESEK PO SMENI
--    Ako noćna smena stalno zaostaje 20 poena, to nije problem znanja
--    nego organizacije obuke — i to je odluka za upravu.
-- ---------------------------------------------------------------------
CREATE VIEW v_po_smeni AS
SELECT
  k.id AS grupa_id,
  COALESCE(u.smena, 'nije navedeno') AS smena,
  w.oznaka AS talas, w.redni AS talas_redni,
  COUNT(DISTINCT u.id)                    AS ljudi,
  ROUND(100.0 * COUNT(*) FILTER (WHERE o.tacan) / NULLIF(COUNT(*), 0), 1) AS procenat
FROM odgovor o
JOIN sesija_stavka ss ON ss.id = o.sesija_stavka_id
JOIN sesija  s ON s.id = ss.sesija_id AND s.predata IS NOT NULL
JOIN talas   w ON w.id = s.talas_id
JOIN grupa k ON k.id = w.grupa_id
JOIN ucesnik u ON u.id = s.ucesnik_id
GROUP BY k.id, COALESCE(u.smena, 'nije navedeno'), w.oznaka, w.redni;

CREATE VIEW v_po_radnom_mestu AS
SELECT
  k.id AS grupa_id,
  COALESCE(u.radno_mesto, 'nije navedeno') AS radno_mesto,
  t.oznaka AS tema, t.naziv AS tema_naziv,
  COUNT(DISTINCT u.id) AS ljudi,
  ROUND(100.0 * COUNT(*) FILTER (WHERE o.tacan) / NULLIF(COUNT(*), 0), 1) AS procenat,
  n.prag_teme
FROM odgovor o
JOIN sesija_stavka ss ON ss.id = o.sesija_stavka_id
JOIN sesija  s ON s.id = ss.sesija_id AND s.predata IS NOT NULL
JOIN talas   w ON w.id = s.talas_id
JOIN grupa k ON k.id = w.grupa_id
JOIN nacrt   n ON n.id = k.nacrt_id
JOIN ucesnik u ON u.id = s.ucesnik_id
JOIN stavka st ON st.id = ss.stavka_id
JOIN porodica p ON p.id = st.porodica_id
JOIN tema     t ON t.id = p.tema_id
GROUP BY k.id, COALESCE(u.radno_mesto, 'nije navedeno'), t.oznaka, t.naziv, n.prag_teme;

-- ---------------------------------------------------------------------
-- 4) SPISAK ZA PONOVNU OBUKU
--    Jedini izlaz u kome se pojedinac spaja sa temom. Ide ISKLJUČIVO licu
--    za BZR / menadžeru kvaliteta, radi organizovanja ponovne obuke.
--    Ne ide upravi i ne ide šefu smene.
--
--    NAJMANJE 3 PITANJA PO TEMI. Ako tema u formi ima jedno ili dva pitanja,
--    rezultat pojedinca na njoj može biti samo 0% ili 100% — jedan promašaj
--    ga obara ispod praga i spisak postaje besmislen. Zbirni rezultat po temi
--    (v_tema_talas) i dalje je valjan, jer se računa preko cele grupe;
--    nevaljan je samo zaključak o pojedincu.
-- ---------------------------------------------------------------------
CREATE VIEW v_ponovna_obuka AS
WITH poslednji AS (
  SELECT k.id AS grupa_id, MAX(w.redni) AS redni
  FROM talas w JOIN grupa k ON k.id = w.grupa_id
  JOIN sesija s ON s.talas_id = w.id AND s.predata IS NOT NULL
  GROUP BY k.id
)
SELECT
  k.id AS grupa_id,
  u.sifra, u.radno_mesto, u.smena,
  w.oznaka AS talas,
  t.oznaka AS tema, t.naziv AS tema_naziv, t.nivo_rizika,
  COUNT(*) AS pitanja,
  COUNT(*) FILTER (WHERE o.tacan) AS tacnih,
  ROUND(100.0 * COUNT(*) FILTER (WHERE o.tacan) / NULLIF(COUNT(*), 0), 1) AS procenat,
  n.prag_teme
FROM odgovor o
JOIN sesija_stavka ss ON ss.id = o.sesija_stavka_id
JOIN sesija  s ON s.id = ss.sesija_id AND s.predata IS NOT NULL
JOIN talas   w ON w.id = s.talas_id
JOIN grupa k ON k.id = w.grupa_id
JOIN nacrt   n ON n.id = k.nacrt_id
JOIN ucesnik u ON u.id = s.ucesnik_id
JOIN stavka st ON st.id = ss.stavka_id
JOIN porodica p ON p.id = st.porodica_id
JOIN tema     t ON t.id = p.tema_id
JOIN poslednji pz ON pz.grupa_id = k.id AND pz.redni = w.redni
GROUP BY k.id, u.sifra, u.radno_mesto, u.smena, w.oznaka,
         t.oznaka, t.naziv, t.nivo_rizika, n.prag_teme
HAVING COUNT(*) >= 3
   AND 100.0 * COUNT(*) FILTER (WHERE o.tacan) / NULLIF(COUNT(*), 0) < n.prag_teme;

-- ---------------------------------------------------------------------
-- 5) KVALITET PODATAKA
--    Ko je „uradio" test za 90 sekundi taj nije čitao pitanja. Takve
--    sesije ne izbacuješ tiho — navodiš ih u izveštaju, jer inače tvoj
--    nalaz stoji na podacima koji ne mere ništa.
-- ---------------------------------------------------------------------
CREATE VIEW v_kvalitet_podataka AS
SELECT
  k.id AS grupa_id,
  u.sifra, w.oznaka AS talas,
  s.predata::date AS datum,
  EXTRACT(EPOCH FROM (s.predata - s.poceta))::int AS trajanje_sek,
  ROUND((EXTRACT(EPOCH FROM (s.predata - s.poceta)) / NULLIF(s.max_bodovi,0))::numeric, 1)
    AS sek_po_pitanju,
  s.procenat,
  CASE
    WHEN EXTRACT(EPOCH FROM (s.predata - s.poceta)) / NULLIF(s.max_bodovi,0) < 5
      THEN 'PREBRZO — nije čitao'
    WHEN EXTRACT(EPOCH FROM (s.predata - s.poceta)) / NULLIF(s.max_bodovi,0) < 10
      THEN 'brzo — proveriti'
    WHEN EXTRACT(EPOCH FROM (s.predata - s.poceta)) > 3600
      THEN 'prekid u radu'
    ELSE 'u redu'
  END AS nalaz
FROM sesija s
JOIN talas   w ON w.id = s.talas_id
JOIN grupa k ON k.id = w.grupa_id
JOIN ucesnik u ON u.id = s.ucesnik_id
WHERE s.predata IS NOT NULL;

-- ---------------------------------------------------------------------
-- 6) POJEDINAČNI PREGLED — zaglavlje sesije
-- ---------------------------------------------------------------------
CREATE VIEW v_sesije_ucesnika AS
SELECT
  k.id AS grupa_id, u.sifra, u.radno_mesto, u.smena,
  s.id AS sesija_id, w.oznaka AS talas, w.redni AS talas_redni,
  s.predata::date AS datum, s.bodovi, s.max_bodovi, s.procenat
FROM sesija s
JOIN talas   w ON w.id = s.talas_id
JOIN grupa k ON k.id = w.grupa_id
JOIN ucesnik u ON u.id = s.ucesnik_id
WHERE s.predata IS NOT NULL;

-- ---------------------------------------------------------------------
-- 7) ZBIRNI PREGLED PO ZAPOSLENOM
--    Jedan red po čoveku, kolone su termini. Uz to broj tema ispod praga
--    na poslednjem merenju — to je jedini broj po kome se odlučuje o
--    dopunskoj obuci.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_zbirno_ucesnik AS
WITH po_talasu AS (
  SELECT
    k.id AS grupa_id, u.id AS ucesnik_id, u.sifra, u.radno_mesto, u.smena,
    MAX(s.procenat) FILTER (WHERE w.oznaka = 'T0')  AS t0,
    MAX(s.procenat) FILTER (WHERE w.oznaka = 'T1')  AS t1,
    MAX(s.procenat) FILTER (WHERE w.oznaka = 'T30') AS t30,
    MAX(s.procenat) FILTER (WHERE w.oznaka = 'T90') AS t90,
    COUNT(s.id)                                     AS uradjenih_termina
  FROM ucesnik u
  JOIN grupa k ON k.id = u.grupa_id
  LEFT JOIN sesija s ON s.ucesnik_id = u.id AND s.predata IS NOT NULL
  LEFT JOIN talas  w ON w.id = s.talas_id
  GROUP BY k.id, u.id, u.sifra, u.radno_mesto, u.smena
),
slabe AS (
  SELECT grupa_id, sifra,
         COUNT(*) AS tema_ispod_praga,
         string_agg(tema, ', ' ORDER BY tema) AS teme_ispod
  FROM v_ponovna_obuka GROUP BY grupa_id, sifra
)
SELECT
  p.*,
  COALESCE(sl.tema_ispod_praga, 0) AS tema_ispod_praga,
  sl.teme_ispod,
  COALESCE(p.t90, p.t30, p.t1, p.t0) AS poslednji_rezultat,
  CASE
    WHEN p.uradjenih_termina = 0            THEN 'nije pristupio'
    WHEN COALESCE(sl.tema_ispod_praga,0) = 0 THEN 'u redu'
    WHEN sl.tema_ispod_praga = 1             THEN 'dopuna — 1 tema'
    ELSE 'dopuna — ' || sl.tema_ispod_praga || ' teme'
  END AS status
FROM po_talasu p
LEFT JOIN slabe sl ON sl.grupa_id = p.grupa_id AND sl.sifra = p.sifra;

-- ---------------------------------------------------------------------
-- 8) EVIDENCIJA O OSPOSOBLJAVANJU I PROVERI — jedan red po zaposlenom
--
--    Ovo je dokument koji inspektor i auditor traže. Spaja dve stvari
--    koje se u praksi vode odvojeno i zato se često ne poklapaju:
--      a) da je obuka ODRŽANA i da je zaposleni PRISUSTVOVAO
--      b) da je znanje PROVERENO i sa kojim rezultatom
--    Bez prve polovine druga ne stoji.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_evidencija_osposobljavanja AS
WITH provere AS (
  SELECT
    u.id AS ucesnik_id,
    MIN(s.predata) FILTER (WHERE w.oznaka = 'T1')  AS datum_provere,
    MAX(s.procenat) FILTER (WHERE w.oznaka = 'T1') AS rezultat_provere,
    MAX(s.predata)                                  AS poslednja_provera,
    (ARRAY_AGG(s.procenat ORDER BY w.redni DESC))[1] AS poslednji_rezultat,
    COUNT(s.id)                                     AS broj_provera
  FROM ucesnik u
  LEFT JOIN sesija s ON s.ucesnik_id = u.id AND s.predata IS NOT NULL
  LEFT JOIN talas  w ON w.id = s.talas_id
  GROUP BY u.id
)
SELECT
  k.id                        AS grupa_id,
  f.naziv                     AS firma,
  pr.naziv                    AS program,
  pr.godina,
  k.naziv                     AS grupa,
  o.id                        AS obuka_id,
  o.naziv                     AS obuka,
  o.oblik,
  o.datum_od                  AS obuka_od,
  o.datum_do                  AS obuka_do,
  o.trajanje_sati,
  o.mesto,
  o.izvodjac,
  o.izvodjac_svojstvo,
  o.materijal,
  u.sifra,
  CASE WHEN k.cuva_imena THEN u.ime_prezime ELSE NULL END AS ime_prezime,
  u.radno_mesto,
  u.smena,
  COALESCE(p.prisustvovao, FALSE) AS prisustvovao,
  p.napomena                  AS napomena_prisustva,
  pv.datum_provere::date      AS datum_provere,
  pv.rezultat_provere,
  pv.poslednja_provera::date  AS poslednja_provera,
  pv.poslednji_rezultat,
  pv.broj_provera,
  n.prag_teme,
  CASE
    WHEN NOT COALESCE(p.prisustvovao, FALSE) THEN 'nije prisustvovao obuci'
    WHEN pv.broj_provera = 0                 THEN 'obuka održana, provera nije izvršena'
    WHEN pv.rezultat_provere IS NULL         THEN 'obuka održana, izlazna provera nije izvršena'
    ELSE 'obuka održana, provera izvršena'
  END AS status
FROM obuka o
JOIN grupa k  ON k.id = o.grupa_id
JOIN firma   f  ON f.id = k.firma_id
JOIN nacrt   n  ON n.id = k.nacrt_id
JOIN program pr ON pr.id = n.program_id
JOIN ucesnik u  ON u.grupa_id = k.id
LEFT JOIN prisustvo p ON p.obuka_id = o.id AND p.ucesnik_id = u.id
LEFT JOIN provere   pv ON pv.ucesnik_id = u.id;

-- Zaglavlje održane obuke, sa temama i odzivom.
CREATE OR REPLACE VIEW v_obuke AS
SELECT
  o.id, o.grupa_id, o.naziv, o.oblik, o.datum_od, o.datum_do,
  o.trajanje_sati, o.mesto, o.izvodjac, o.izvodjac_svojstvo, o.materijal, o.napomena,
  (SELECT string_agg(t.oznaka || ' ' || t.naziv, '; ' ORDER BY t.oznaka)
     FROM obuka_tema ot JOIN tema t ON t.id = ot.tema_id
    WHERE ot.obuka_id = o.id)                                   AS teme,
  (SELECT COUNT(*) FROM prisustvo p WHERE p.obuka_id = o.id AND p.prisustvovao) AS prisutnih,
  (SELECT COUNT(*) FROM ucesnik u WHERE u.grupa_id = o.grupa_id)            AS upisanih
FROM obuka o;

-- ---------------------------------------------------------------------
-- 9) OBRAZAC 6 — podaci za popunjavanje propisanog obrasca
--
--    Sistem NE zamenjuje Obrazac 6. Obrazac 6 se po Pravilniku vodi u
--    štampanom obliku i potpisuju ga savetnik za BZR, poslodavac i sam
--    zaposleni. Sistem ga POPUNJAVA i priprema za štampu.
--
--    Kolona za PRAKTIČNU obuku i praktičnu proveru ostaje prazna:
--    praktični deo se izvodi na radnom mestu, sistem ga ne meri i ne sme
--    da tvrdi da jeste.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_obrazac6 AS
SELECT
  k.id                      AS grupa_id,
  o.id                      AS obuka_id,
  f.naziv                   AS poslodavac,
  f.pib,
  u.sifra,
  CASE WHEN k.cuva_imena THEN u.ime_prezime ELSE NULL END AS ime_prezime,
  COALESCE(rm.naziv, u.radno_mesto)  AS radno_mesto,
  rm.opis_poslova,
  rm.povecan_rizik,
  rm.mere,
  rm.lzo,
  rm.obavestenja,
  rm.rukovodilac_prati,
  rm.sifre_opasnosti,
  (SELECT string_agg(so.sifra || ' — ' || so.opis, E'\n' ORDER BY so.sifra)
     FROM sifra_opasnosti so WHERE so.sifra = ANY(rm.sifre_opasnosti)) AS opasnosti_tekst,
  o.sifra_razloga,
  sr.opis                   AS razlog_opis,
  COALESCE(o.datum_teorijske, o.datum_od) AS datum_obuke_teorijske,
  o.datum_prakticne         AS datum_obuke_prakticne,
  o.datum_obuke_lzo,
  -- teorijska provera = izlazno merenje T1; praktična se popunjava rukom
  (SELECT MAX(s.predata)::date FROM sesija s
     JOIN talas w ON w.id = s.talas_id
    WHERE s.ucesnik_id = u.id AND s.predata IS NOT NULL AND w.oznaka = 'T1')
                            AS datum_provere_teorijske,
  (SELECT MAX(s.procenat) FROM sesija s
     JOIN talas w ON w.id = s.talas_id
    WHERE s.ucesnik_id = u.id AND s.predata IS NOT NULL AND w.oznaka = 'T1')
                            AS rezultat_provere_teorijske,
  COALESCE(p.prisustvovao, FALSE) AS prisustvovao,
  o.izvodjac,
  o.izvodjac_svojstvo
FROM obuka o
JOIN grupa k   ON k.id = o.grupa_id
JOIN firma f     ON f.id = k.firma_id
JOIN ucesnik u   ON u.grupa_id = k.id
LEFT JOIN radno_mesto rm ON rm.id = u.radno_mesto_id
LEFT JOIN sifra_razloga sr ON sr.sifra = o.sifra_razloga
LEFT JOIN prisustvo p ON p.obuka_id = o.id AND p.ucesnik_id = u.id;

-- ---------------------------------------------------------------------
-- 10) ROK ČUVANJA
--     Rok teče od poslednjeg merenja. Ovo je ugovoreni rok za radne
--     podatke u sistemu — nema veze sa rokom od 40 godina koji se odnosi
--     na Obrazac 6 kod poslodavca.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_rok_cuvanja AS
SELECT
  k.id                      AS grupa_id,
  f.naziv                   AS firma,
  k.naziv                   AS grupa,
  k.cuva_imena,
  k.rok_cuvanja_meseci,
  k.anonimizovano,
  k.anonimizovao,
  (SELECT MAX(s.predata)::date FROM sesija s
     JOIN talas w ON w.id = s.talas_id
    WHERE w.grupa_id = k.id AND s.predata IS NOT NULL) AS poslednje_merenje,
  ((SELECT MAX(s.predata)::date FROM sesija s
      JOIN talas w ON w.id = s.talas_id
     WHERE w.grupa_id = k.id AND s.predata IS NOT NULL)
   + (k.rok_cuvanja_meseci || ' months')::interval)::date  AS dospeva,
  CASE
    WHEN k.anonimizovano IS NOT NULL THEN 'anonimizovano'
    WHEN (SELECT MAX(s.predata) FROM sesija s
            JOIN talas w ON w.id = s.talas_id
           WHERE w.grupa_id = k.id AND s.predata IS NOT NULL) IS NULL
      THEN 'nema merenja'
    WHEN CURRENT_DATE >= ((SELECT MAX(s.predata)::date FROM sesija s
            JOIN talas w ON w.id = s.talas_id
           WHERE w.grupa_id = k.id AND s.predata IS NOT NULL)
          + (k.rok_cuvanja_meseci || ' months')::interval)::date
      THEN 'DOSPELO ZA ANONIMIZACIJU'
    ELSE 'u roku'
  END AS status
FROM grupa k JOIN firma f ON f.id = k.firma_id;
