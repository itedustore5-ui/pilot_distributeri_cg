-- =====================================================================
--  15_trag_ispravki_cg.sql — pogled `v_trag_ispravki`
--
--  Zašto postoji zasebno: cio 06_ispravke_cg.sql počinje sa
--  `ALTER TYPE uloga_t ADD VALUE`, koja ne prolazi kad se fajl pusti kao
--  jedna naredba. Kod ručnog lijepljenja u Supabase to obori cio fajl, pa
--  se poslije vidi samo da je uloga `operater` ušla (06b), a pogledi nisu.
--  Posljedica: izvoz padne sa `relation "v_trag_ispravki" does not exist`.
--
--  Ovdje je izvučen SAMO taj pogled, nepromijenjen. Ostale poglede iz 06
--  su odavno pregazili 07 i 14 i njih NE diramo — ponovno pokretanje 06
--  bi ih vratilo na stariju verziju.
--
--  Ne dira podatke. Bezbjedno na živoj bazi.
-- =====================================================================

DROP VIEW IF EXISTS v_trag_ispravki;
CREATE VIEW v_trag_ispravki AS
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


COMMENT ON VIEW v_trag_ispravki IS
  'Trag ispravki: šta je pisalo i na šta je ispravljeno. Stari zapis ostaje '
  'u bazi zauvijek — inspektoru se pokazuje da je greška uočena, ne da je nestala.';
