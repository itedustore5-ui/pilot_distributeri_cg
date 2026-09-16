-- =====================================================================
--  IZVEŠTAJNI POGLEDI
--  Rezultat se okreće po TEMI, ne po čoveku. To je cela poenta proizvoda.
-- =====================================================================

DROP VIEW IF EXISTS v_evidencija, v_zaboravljanje, v_sidra, v_tema_talas, v_ucesce CASCADE;

-- ---------------------------------------------------------------------
-- 1) GLAVNI IZVEŠTAJ: tema × talas
--    Ovo je tabela koju menadžer kvaliteta gleda i po kojoj odlučuje
--    koju obuku ponavlja.
-- ---------------------------------------------------------------------
CREATE VIEW v_tema_talas AS
SELECT
  k.id                                  AS grupa_id,
  k.naziv                               AS grupa,
  t.oznaka                              AS tema,
  t.naziv                               AS tema_naziv,
  t.nivo_rizika,
  w.oznaka                              AS talas,
  w.redni                               AS talas_redni,
  COUNT(*)                              AS broj_odgovora,
  COUNT(*) FILTER (WHERE o.tacan)       AS tacnih,
  ROUND(100.0 * COUNT(*) FILTER (WHERE o.tacan) / NULLIF(COUNT(*), 0), 1) AS procenat,
  n.prag_teme,
  CASE
    WHEN 100.0 * COUNT(*) FILTER (WHERE o.tacan) / NULLIF(COUNT(*), 0) < n.prag_teme
    THEN 'ISPOD PRAGA' ELSE 'u redu'
  END                                   AS status
FROM odgovor o
JOIN sesija_stavka ss ON ss.id = o.sesija_stavka_id
JOIN sesija        s  ON s.id  = ss.sesija_id AND s.predata IS NOT NULL
JOIN talas         w  ON w.id  = s.talas_id
JOIN grupa       k  ON k.id  = w.grupa_id
JOIN nacrt         n  ON n.id  = k.nacrt_id
JOIN stavka        st ON st.id = ss.stavka_id
JOIN porodica      p  ON p.id  = st.porodica_id
JOIN tema          t  ON t.id  = p.tema_id
GROUP BY k.id, k.naziv, t.oznaka, t.naziv, t.nivo_rizika, w.oznaka, w.redni, n.prag_teme;

-- ---------------------------------------------------------------------
-- 2) SIDRA: kontrola uporedivosti formi
--    Sidro je identično u sva četiri talasa, pa i ono prati učenje. Zato se
--    sidro NE gleda samo; gleda se RAZMAK između sidra i rotacionih stavki.
--    Ako razmak ostaje stabilan kroz talase, forme su podjednako teške i pad
--    rezultata je stvaran pad znanja. Ako razmak skače, razlika potiče od
--    težine forme i merenje se ne tumači dok se to ne razjasni.
-- ---------------------------------------------------------------------
CREATE VIEW v_sidra AS
SELECT
  k.id                            AS grupa_id,
  w.oznaka                        AS talas,
  w.redni                         AS talas_redni,
  COUNT(*) FILTER (WHERE p.je_sidro)      AS odgovora_sidra,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.je_sidro AND o.tacan)
        / NULLIF(COUNT(*) FILTER (WHERE p.je_sidro), 0), 1)        AS procenat_sidra,
  ROUND(100.0 * COUNT(*) FILTER (WHERE NOT p.je_sidro AND o.tacan)
        / NULLIF(COUNT(*) FILTER (WHERE NOT p.je_sidro), 0), 1)    AS procenat_rotacione,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE p.je_sidro AND o.tacan)
      / NULLIF(COUNT(*) FILTER (WHERE p.je_sidro), 0)
    - 100.0 * COUNT(*) FILTER (WHERE NOT p.je_sidro AND o.tacan)
      / NULLIF(COUNT(*) FILTER (WHERE NOT p.je_sidro), 0), 1)      AS razmak
FROM odgovor o
JOIN sesija_stavka ss ON ss.id = o.sesija_stavka_id
JOIN sesija        s  ON s.id  = ss.sesija_id AND s.predata IS NOT NULL
JOIN talas         w  ON w.id  = s.talas_id
JOIN grupa       k  ON k.id  = w.grupa_id
JOIN stavka        st ON st.id = ss.stavka_id
JOIN porodica      p  ON p.id  = st.porodica_id
GROUP BY k.id, w.oznaka, w.redni;

-- ---------------------------------------------------------------------
-- 3) ZABORAVLJANJE: koliko se od efekta obuke zadržalo
--    dobitak  = T1 - T0   (šta je obuka podigla)
--    zadrzano = T90 - T0  (šta je preživelo tri meseca)
--    osip     = T1 - T90  (koliko se izgubilo)
-- ---------------------------------------------------------------------
CREATE VIEW v_zaboravljanje AS
SELECT
  grupa_id, grupa, tema, tema_naziv, nivo_rizika,
  MAX(procenat) FILTER (WHERE talas = 'T0')  AS t0,
  MAX(procenat) FILTER (WHERE talas = 'T1')  AS t1,
  MAX(procenat) FILTER (WHERE talas = 'T30') AS t30,
  MAX(procenat) FILTER (WHERE talas = 'T90') AS t90,
  MAX(procenat) FILTER (WHERE talas = 'T1')
    - MAX(procenat) FILTER (WHERE talas = 'T0')  AS dobitak,
  MAX(procenat) FILTER (WHERE talas = 'T90')
    - MAX(procenat) FILTER (WHERE talas = 'T0')  AS zadrzano,
  MAX(procenat) FILTER (WHERE talas = 'T1')
    - MAX(procenat) FILTER (WHERE talas = 'T90') AS osip
FROM v_tema_talas
GROUP BY grupa_id, grupa, tema, tema_naziv, nivo_rizika;

-- ---------------------------------------------------------------------
-- 4) ODZIV po talasu — koliko ljudi je stvarno uradilo merenje
-- ---------------------------------------------------------------------
CREATE VIEW v_ucesce AS
SELECT
  k.id AS grupa_id, k.naziv AS grupa, w.oznaka AS talas, w.redni AS talas_redni,
  w.planiran_datum,
  (SELECT COUNT(*) FROM ucesnik u WHERE u.grupa_id = k.id)          AS upisanih,
  COUNT(s.id) FILTER (WHERE s.predata IS NOT NULL)                    AS predatih,
  ROUND(100.0 * COUNT(s.id) FILTER (WHERE s.predata IS NOT NULL)
        / NULLIF((SELECT COUNT(*) FROM ucesnik u WHERE u.grupa_id = k.id), 0), 1) AS odziv
FROM talas w
JOIN grupa k ON k.id = w.grupa_id
LEFT JOIN sesija s ON s.talas_id = w.id
GROUP BY k.id, k.naziv, w.oznaka, w.redni, w.planiran_datum;

-- ---------------------------------------------------------------------
-- 5) EVIDENCIJA ZA AUDITORA
--    Poimenično ide SAMO ovde i samo licu za BZR / menadžeru kvaliteta.
--    Firma ovo štampa, potpisuje i ulaže u svoju dokumentaciju.
--    Ovo NIJE sertifikat — ovo je zapis o izvršenoj proveri osposobljenosti.
-- ---------------------------------------------------------------------
CREATE VIEW v_evidencija AS
SELECT
  f.naziv                    AS firma,
  pr.naziv                   AS program,
  pr.godina,
  k.naziv                    AS grupa,
  u.sifra                    AS sifra_zaposlenog,
  u.radno_mesto,
  u.smena,
  w.oznaka                   AS talas,
  w.opis                     AS vrsta_provere,
  s.predata::date            AS datum_provere,
  s.bodovi,
  s.max_bodovi,
  s.procenat
FROM sesija s
JOIN talas    w  ON w.id  = s.talas_id
JOIN grupa  k  ON k.id  = w.grupa_id
JOIN nacrt    n  ON n.id  = k.nacrt_id
JOIN program  pr ON pr.id = n.program_id
JOIN firma    f  ON f.id  = k.firma_id
JOIN ucesnik  u  ON u.id  = s.ucesnik_id
WHERE s.predata IS NOT NULL;
