-- =====================================================================
--  DEMO PODACI — za prikaz klijentu, NE za pravi rad
--
--  Puni šifarnike, prijeme, isporuke i dnevne zapise izmišljenim, ali
--  realističnim podacima, tako da aplikacija odmah ima šta da pokaže.
--
--  Pokreće se POSLIJE 04_zapisi_cg.sql:
--      psql "$DATABASE_URL" -f db/05_demo_cg.sql
--
--  ⚠ SVI NAZIVI NOSE OZNAKU „DEMO“. Nikada ne pokreći ovo na bazi
--    pravog klijenta — jedan klijent, jedna baza, bez izuzetka.
-- =====================================================================

BEGIN;

DELETE FROM isporuka;
DELETE FROM prijem;
DELETE FROM zapis;
DELETE FROM artikal;
DELETE FROM vozilo;
DELETE FROM kupac;
DELETE FROM dobavljac;

-- ------------------------------------------------------------ dobavljači
INSERT INTO dobavljac (firma_id, naziv, adresa, kontakt_osoba, telefon, email,
                       vrsta_hrane, broj_objekta, odobren, datum_odobrenja, odobrio) VALUES
 (1,'Mljekara Sjever — DEMO','Nikšić','J. Vuković','+382 20 000 111','nabavka@demo.me',
  'mliječni proizvodi','ME-1042',TRUE, CURRENT_DATE - 300,'M. Vuković'),
 (1,'Ribarnica Jadran — DEMO','Bar','P. Ivanović','+382 30 000 222','ribarnica@demo.me',
  'svježa riba','ME-2088',TRUE, CURRENT_DATE - 280,'M. Vuković'),
 (1,'Mesna industrija Lovćen — DEMO','Danilovgrad','S. Marković','+382 20 000 333','prodaja@demo.me',
  'svježe i prerađeno meso','ME-3015',TRUE, CURRENT_DATE - 260,'M. Vuković'),
 (1,'Veletrgovina Suha Roba — DEMO','Podgorica','A. Perović','+382 20 000 444','info@demo.me',
  'brašno, tjestenina, konzerve','ME-4001',TRUE, CURRENT_DATE - 240,'M. Vuković'),
 -- namjerno NEODOBREN: ekran spremnosti ga prijavljuje kao nalaz
 (1,'Novi dobavljač bez provjere — DEMO','Ulcinj',NULL,'+382 30 000 555',NULL,
  'smrznuto povrće',NULL,FALSE,NULL,NULL);

-- ---------------------------------------------------------------- kupci
INSERT INTO kupac (firma_id, naziv, adresa, kontakt_osoba, telefon, email) VALUES
 (1,'Hotel Primorje — DEMO','Budva','recepcija','+382 33 000 201','nabavka@demo.me'),
 (1,'Restoran Galeb — DEMO','Kotor','šef kuhinje','+382 32 000 318','galeb@demo.me'),
 (1,'Market Jadran — DEMO','Bar','poslovođa','+382 30 000 442','market@demo.me'),
 (1,'Hotel Lovćen — DEMO','Cetinje','ekonomat','+382 41 000 155','ekonomat@demo.me'),
 (1,'Konoba Riva — DEMO','Petrovac','vlasnik','+382 33 000 277',NULL),
 (1,'Pekara Zrno — DEMO','Tivat','nabavka','+382 32 000 690',NULL);

-- --------------------------------------------------------------- vozila
INSERT INTO vozilo (firma_id, registracija, opis, ima_rashladu, rezim_min, rezim_max,
                    poslednji_servis) VALUES
 (1,'PG CX-421','Dostavno vozilo 3,5 t sa rashladnom komorom',TRUE,-20,4, CURRENT_DATE - 120),
 (1,'PG CX-508','Dostavno vozilo 3,5 t sa rashladnom komorom',TRUE,-20,4, CURRENT_DATE - 60),
 (1,'PG CX-733','Kombi za ambijentalnu robu',FALSE,NULL,NULL, CURRENT_DATE - 200);

-- -------------------------------------------------------------- artikli
-- Granice POTVRĐENE = aplikacija automatski ocjenjuje odstupanje.
INSERT INTO artikal (firma_id, naziv, grupa, jedinica, granica_min, granica_max,
                     tolerancija, granica_izvor, granica_potvrdio, granica_potvrdjeno) VALUES
 (1,'Pavlaka 20% 180 g','G2','kom',0,4,4,'deklaracija proizvođača','M. Vuković', CURRENT_DATE - 30),
 (1,'Sir polutvrdi 1 kg','G2','kom',0,4,4,'deklaracija proizvođača','M. Vuković', CURRENT_DATE - 30),
 (1,'Svježe meso — junetina','G2','kg',0,3,4,'Uredba o higijeni hrane','M. Vuković', CURRENT_DATE - 30),
 (1,'Mljeveno meso','G2','kg',0,2,4,'Uredba o higijeni hrane','M. Vuković', CURRENT_DATE - 30),
 (1,'Smrznuto povrće 2,5 kg','G3','kom',NULL,-18,3,'deklaracija proizvođača','M. Vuković', CURRENT_DATE - 30),
 (1,'Brašno T-500 25 kg','G1','kom',NULL,NULL,4,'ambijentalno','M. Vuković', CURRENT_DATE - 30),
 -- namjerno NEPOTVRĐENA granica: ekran spremnosti je prijavljuje
 (1,'Svježa riba — orada','G2','kg',0,2,2,'Uredba o higijeni hrane',NULL,NULL);

-- ================================================================ PRIJEMI
-- Sporna serija MLJ-2609-A je ona koju pokazuješ na demonstraciji.
INSERT INTO prijem (firma_id, datum, vrijeme, dobavljac_id, artikal_id, lot, kolicina,
                    rok_trajanja, broj_otpremnice, temperatura, granica_primjenjena,
                    ishod, korektivna_mjera, izvrsilac)
SELECT 1, CURRENT_DATE - 7, '07:40', d.id, a.id, 'MLJ-2609-A', 240,
       CURRENT_DATE + 13, 'OT-4471', 3.2, 4, 'prihvaceno', NULL, 'N. Popović'
  FROM dobavljac d, artikal a
 WHERE d.naziv LIKE 'Mljekara Sjever%' AND a.naziv = 'Pavlaka 20% 180 g';

INSERT INTO prijem (firma_id, datum, vrijeme, dobavljac_id, artikal_id, lot, kolicina,
                    rok_trajanja, broj_otpremnice, temperatura, granica_primjenjena,
                    ishod, korektivna_mjera, izvrsilac)
SELECT 1, CURRENT_DATE - 6, '08:05', d.id, a.id, 'SIR-2610-B', 80,
       CURRENT_DATE + 45, 'OT-4488', 2.8, 4, 'prihvaceno', NULL, 'N. Popović'
  FROM dobavljac d, artikal a
 WHERE d.naziv LIKE 'Mljekara Sjever%' AND a.naziv = 'Sir polutvrdi 1 kg';

INSERT INTO prijem (firma_id, datum, vrijeme, dobavljac_id, artikal_id, lot, kolicina,
                    rok_trajanja, broj_otpremnice, temperatura, granica_primjenjena,
                    ishod, korektivna_mjera, izvrsilac)
SELECT 1, CURRENT_DATE - 5, '06:50', d.id, a.id, 'MES-2611-C', 150,
       CURRENT_DATE + 6, 'OT-5120', 2.1, 3, 'prihvaceno', NULL, 'N. Popović'
  FROM dobavljac d, artikal a
 WHERE d.naziv LIKE 'Mesna industrija%' AND a.naziv = 'Svježe meso — junetina';

-- ODBIJENA pošiljka — pokazuje da sistem bilježi i ono što nije prošlo.
INSERT INTO prijem (firma_id, datum, vrijeme, dobavljac_id, artikal_id, lot, kolicina,
                    rok_trajanja, broj_otpremnice, temperatura, granica_primjenjena,
                    ishod, korektivna_mjera, izvrsilac)
SELECT 1, CURRENT_DATE - 9, '07:15', d.id, a.id, 'RIB-0409-C', 40,
       CURRENT_DATE + 2, 'OT-3301', 6.8, 2, 'odbijeno',
       'Pošiljka nije primljena. Dobavljač pisano obaviješten istog dana, traženo objašnjenje prekida hladnog lanca.',
       'N. Popović'
  FROM dobavljac d, artikal a
 WHERE d.naziv LIKE 'Ribarnica Jadran%' AND a.naziv = 'Svježa riba — orada';

-- PRIMLJENO UZ MJERU — granično odstupanje unutar tolerancije.
INSERT INTO prijem (firma_id, datum, vrijeme, dobavljac_id, artikal_id, lot, kolicina,
                    rok_trajanja, broj_otpremnice, temperatura, granica_primjenjena,
                    ishod, korektivna_mjera, izvrsilac)
SELECT 1, CURRENT_DATE - 3, '07:05', d.id, a.id, 'MLJ-2614-D', 120,
       CURRENT_DATE + 17, 'OT-4502', 5.4, 4, 'prihvaceno_uz_mjeru',
       'Primljeno uz odmah hlađenje u Komori 1. Dobavljaču upućeno pisano upozorenje.',
       'S. Đukanović'
  FROM dobavljac d, artikal a
 WHERE d.naziv LIKE 'Mljekara Sjever%' AND a.naziv = 'Pavlaka 20% 180 g';

INSERT INTO prijem (firma_id, datum, vrijeme, dobavljac_id, artikal_id, lot, kolicina,
                    rok_trajanja, broj_otpremnice, temperatura, granica_primjenjena,
                    ishod, korektivna_mjera, izvrsilac)
SELECT 1, CURRENT_DATE - 4, '09:30', d.id, a.id, 'BRA-2612-A', 400,
       CURRENT_DATE + 180, 'OT-7700', NULL, NULL, 'prihvaceno', NULL, 'S. Đukanović'
  FROM dobavljac d, artikal a
 WHERE d.naziv LIKE 'Veletrgovina%' AND a.naziv = 'Brašno T-500 25 kg';

-- =============================================================== ISPORUKE
-- Serija MLJ-2609-A ide na pet adresa: to je „korak naprijed“ iz čl. 27.
INSERT INTO isporuka (firma_id, datum, kupac_id, prijem_id, kolicina, broj_otpremnice,
                      vozilo_id, vozac, temp_utovar, temp_isporuka, vozilo_provjereno,
                      odstupanje, korektivna_mjera, preuzeo)
SELECT 1, CURRENT_DATE - v.dana, k.id, p.id, v.kol, v.ot, vo.id, v.vozac,
       v.tu, v.ti, TRUE, FALSE, NULL, v.preuzeo
  FROM (VALUES
        ('Hotel Primorje — DEMO', 6, 48, 'OT-9012','PG CX-421','B. Radulović',2.6,3.4,'M. Jovanović'),
        ('Restoran Galeb — DEMO',  5, 24, 'OT-9027','PG CX-421','B. Radulović',2.4,3.1,'D. Kovačević'),
        ('Market Jadran — DEMO',   4, 60, 'OT-9044','PG CX-508','S. Đukanović',2.2,3.6,'V. Nikolić'),
        ('Hotel Lovćen — DEMO',    3, 36, 'OT-9061','PG CX-508','S. Đukanović',2.5,3.2,'R. Lakić'),
        ('Konoba Riva — DEMO',     2, 18, 'OT-9078','PG CX-421','B. Radulović',2.7,3.8,'Ž. Božović')
       ) AS v(kupac, dana, kol, ot, reg, vozac, tu, ti, preuzeo)
  JOIN kupac  k  ON k.naziv = v.kupac
  JOIN vozilo vo ON vo.registracija = v.reg
  JOIN prijem p  ON p.lot = 'MLJ-2609-A';

-- Isporuka sa ODSTUPANJEM — temperatura pri isporuci iznad granice.
INSERT INTO isporuka (firma_id, datum, kupac_id, prijem_id, kolicina, broj_otpremnice,
                      vozilo_id, vozac, temp_utovar, temp_isporuka, vozilo_provjereno,
                      odstupanje, korektivna_mjera, preuzeo)
SELECT 1, CURRENT_DATE - 2, k.id, p.id, 30, 'OT-9090', vo.id, 'B. Radulović',
       2.8, 7.9, TRUE, TRUE,
       'Roba nije predata kupcu. Vraćena u skladište i izdvojena. Odgovorno lice utvrdilo kvar na rashladnom uređaju vozila, vozilo povučeno iz upotrebe do servisa.',
       NULL
  FROM kupac k, vozilo vo, prijem p
 WHERE k.naziv = 'Pekara Zrno — DEMO' AND vo.registracija = 'PG CX-421'
   AND p.lot = 'MES-2611-C';

-- ========================================================== DNEVNI ZAPISI
-- Temperature komora za 30 dana, sa dva namjerna odstupanja.
INSERT INTO zapis (firma_id, obrazac, datum, vrijeme, podaci, odstupanje,
                   korektivna_mjera, izvrsilac, kontrolor, kontrolisano)
SELECT 1, 'P7', d::date, '07:10',
       jsonb_build_object('komora', kom,
                          'temperatura', temp,
                          'granica_min', 0, 'granica_max', 4),
       temp > 4,
       CASE WHEN temp > 4 THEN
         'Roba prebačena u ispravnu komoru. Pozvan servis, otklonjeno istog dana. Odgovorno lice ocijenilo robu upotrebljivom — odstupanje kraće od dva sata.'
       END,
       CASE WHEN extract(dow FROM d) < 3 THEN 'N. Popović' ELSE 'S. Đukanović' END,
       'M. Vuković', d::date + 5
  FROM generate_series(CURRENT_DATE - 30, CURRENT_DATE - 1, '1 day') AS d,
       LATERAL (VALUES ('Komora 1 — mliječni'), ('Komora 2 — delikatese')) AS k(kom),
       LATERAL (SELECT CASE
                  WHEN d::date = CURRENT_DATE - 2  AND kom = 'Komora 1 — mliječni' THEN 8.6
                  WHEN d::date = CURRENT_DATE - 18 AND kom = 'Komora 2 — delikatese' THEN 6.2
                  ELSE round((1.8 + random() * 1.9)::numeric, 1)
                END AS temp) t
 WHERE extract(dow FROM d) <> 0;          -- nedjeljom se ne radi

-- Zamrzivač — 30 dana bez odstupanja.
INSERT INTO zapis (firma_id, obrazac, datum, vrijeme, podaci, odstupanje,
                   izvrsilac, kontrolor, kontrolisano)
SELECT 1, 'P8', d::date, '07:14',
       jsonb_build_object('komora','Komora 3 — zamrznuto',
                          'temperatura', round((-21 + random() * 2)::numeric, 1),
                          'granica_max', -18),
       FALSE, 'N. Popović', 'M. Vuković', d::date + 5
  FROM generate_series(CURRENT_DATE - 30, CURRENT_DATE - 1, '1 day') AS d
 WHERE extract(dow FROM d) <> 0;

-- Čišćenje — namjerno nedostaju tri dana, da ekran spremnosti ima šta da nađe.
INSERT INTO zapis (firma_id, obrazac, datum, podaci, odstupanje, izvrsilac, kontrolor, kontrolisano)
SELECT 1, 'P3', d::date,
       jsonb_build_object('prostor','Skladište i rampa',
                          'sredstvo','alkalno sredstvo 2%',
                          'nalaz','zadovoljava'),
       FALSE, 'M. Đurović', 'M. Vuković', d::date + 5
  FROM generate_series(CURRENT_DATE - 30, CURRENT_DATE - 1, '1 day') AS d
 WHERE extract(dow FROM d) <> 0
   AND d::date NOT IN (CURRENT_DATE - 4, CURRENT_DATE - 5, CURRENT_DATE - 11);

-- Kontrola vozila prije utovara.
INSERT INTO zapis (firma_id, obrazac, datum, vrijeme, podaci, odstupanje,
                   korektivna_mjera, izvrsilac, kontrolor, kontrolisano)
SELECT 1, 'D1', d::date, '05:40',
       jsonb_build_object('vozilo', reg,
                          'cistoca', ok, 'ostecenja', TRUE,
                          'rashlada_radi', TRUE, 'predrashladeno', ok,
                          'temp_komore', CASE WHEN ok THEN 2.0 ELSE 14.2 END,
                          'odvajanje', TRUE, 'termometar', TRUE),
       NOT ok,
       CASE WHEN NOT ok THEN
         'Utovar zaustavljen. Komora oprana i predrashlađena na +2 °C. Tura krenula 45 minuta kasnije, kupci obaviješteni.'
       END,
       'B. Radulović', 'M. Vuković', d::date + 5
  FROM generate_series(CURRENT_DATE - 14, CURRENT_DATE - 1, '1 day') AS d,
       LATERAL (VALUES ('PG CX-421'), ('PG CX-508')) AS v(reg),
       LATERAL (SELECT NOT (d::date = CURRENT_DATE - 2 AND reg = 'PG CX-421') AS ok) o
 WHERE extract(dow FROM d) <> 0;

-- Provjera termometra.
INSERT INTO zapis (firma_id, obrazac, datum, podaci, odstupanje, izvrsilac, kontrolor, kontrolisano)
VALUES (1,'P6', CURRENT_DATE - 40,
        '{"termometar":"REF-01","metod":"ledena kupka 0 °C","ocitano":0.2,"referentno":0,"odstupanje_c":0.2,"prihvatljivo":true}'::jsonb,
        FALSE,'M. Vuković','M. Vuković', CURRENT_DATE - 40);

-- Deratizacija i dezinsekcija.
INSERT INTO zapis (firma_id, obrazac, datum, podaci, odstupanje, izvrsilac, kontrolor, kontrolisano)
VALUES
 (1,'P12', CURRENT_DATE - 25,
  '{"mamac_br":"M-01","lokacija":"Ulaz u skladište","organizacija":"DDD Servis — DEMO","nalaz":"negativan","broj_potvrde":"P-2211"}'::jsonb,
  FALSE,'DDD Servis — DEMO','M. Vuković', CURRENT_DATE - 20),
 (1,'P11', CURRENT_DATE - 25,
  '{"prostorija":"Rampa","organizacija":"DDD Servis — DEMO","sredstvo":"po ugovoru","nalaz":"bez prisustva","broj_potvrde":"P-2212"}'::jsonb,
  FALSE,'DDD Servis — DEMO','M. Vuković', CURRENT_DATE - 20);

-- Godišnji plan obuke.
INSERT INTO zapis (firma_id, obrazac, datum, podaci, odstupanje, izvrsilac) VALUES
 (1,'P13', CURRENT_DATE - 60,
  '{"ciljna_grupa":"Skladište i vozni park","tema":"Prijem robe i hladni lanac","oblik":"teorijska + praktična","trajanje":3,"izvodjac":"vanjski konsultant","odgovoran":"M. Vuković"}'::jsonb,
  FALSE,'M. Vuković'),
 (1,'P13', CURRENT_DATE - 60,
  '{"ciljna_grupa":"Vozači","tema":"Vozila, utovar i isporuka","oblik":"teorijska + praktična","trajanje":2,"izvodjac":"vanjski konsultant","odgovoran":"M. Vuković"}'::jsonb,
  FALSE,'M. Vuković');

-- Vježba povlačenja — prošlogodišnja, da ekran spremnosti pokaže da je vrijeme za novu.
INSERT INTO zapis (firma_id, obrazac, datum, podaci, odstupanje, izvrsilac, kontrolor, kontrolisano)
VALUES (1,'D3', CURRENT_DATE - 400,
  jsonb_build_object('vrsta','vježba','lot','MLJ-2508-X','artikal','Pavlaka 20% 180 g',
    'razlog','godišnja provjera sistema','saznanje_izvor','vježba',
    'vrijeme_saznanja','09:00','vrijeme_liste','11:20','broj_kupaca',4,
    'ubh_obavijesten',false,'postupanje','u karantinu',
    'uzrok','vježba — bez stvarnog uzroka'),
  FALSE,'M. Vuković','M. Vuković', CURRENT_DATE - 398);

-- ---------------------------------------------------------------------
--  VRIJEME UNOSA U DEMOU
--
--  `datum` je dan na koji se zapis odnosi, `kreirano` je trenutak unosa.
--  Ako je datum stariji od dana unosa, aplikacija zapis označi kao
--  „unesen naknadno“ — to inspektor gleda i to je poenta.
--
--  Ali u demou je `kreirano` = trenutak kad si pokrenula ovu skriptu, pa
--  bi SVAKI red nosio tu oznaku. Kupcu bi izgledalo da ništa nije rađeno
--  na vrijeme. Zato se ovdje vrijeme unosa poravnava sa danom zapisa.
--
--  Ovo je JEDINO mjesto gdje se `kreirano` dira, i to samo u demo bazi.
--  U radu se ne dira nikad — to je trag koji sistem sam pravi.
-- ---------------------------------------------------------------------
UPDATE prijem   SET kreirano = datum + COALESCE(vrijeme, TIME '07:40');
UPDATE isporuka SET kreirano = datum + TIME '15:10';
UPDATE zapis    SET kreirano = datum + COALESCE(vrijeme, TIME '08:20');

--  Jedan zapis NAMJERNO ostaje naknadan: 12. avgusta se zaboravilo, pa je
--  upisano tri dana kasnije. Tako se na demou vidi kako aplikacija to
--  označi — a ne da sve izgleda savršeno, što nijedan kupac ne vjeruje.
UPDATE zapis SET kreirano = datum + 3 + TIME '09:15'
 WHERE id = (SELECT id FROM zapis WHERE obrazac = 'P3' AND datum < CURRENT_DATE - 10
              ORDER BY datum DESC LIMIT 1);

-- ------------------------------------------------- lica i sanitarne knjižice
--  Traži tabelu iz 08_lica_cg.sql. Ako 08 nije pokrenut, ovaj blok se
--  preskače umjesto da obori cio demo.
DO $$
BEGIN
  IF to_regclass('public.lice') IS NULL THEN
    RAISE NOTICE 'Tabela lice ne postoji — pokreni db/08_lica_cg.sql pa ponovo ovaj blok.';
    RETURN;
  END IF;
  INSERT INTO lice (firma_id, ime_prezime, radno_mjesto, posao_sa_hranom,
                    knjizica_broj, knjizica_izdata, knjizica_vazi_do, sifra)
  VALUES
    (1,'Nikola Popović','magacioner','prijem, slaganje u hladnjaču, utovar',
       'SK-2431', CURRENT_DATE - 300, CURRENT_DATE + 65,  'M-01'),
    (1,'Vesna Radulović','magacioner','prijem i kontrola temperature',
       'SK-2477', CURRENT_DATE - 340, CURRENT_DATE + 25,  'M-02'),
    (1,'Dragan Šćepanović','vozač','utovar i prevoz',
       'SK-2502', CURRENT_DATE - 366, CURRENT_DATE - 1,   'V-01'),
    (1,'Milica Jovanović','komercijalista','prijem reklamacija, kontakt sa kupcima',
       NULL, NULL, NULL, 'K-01')
  ON CONFLICT (firma_id, ime_prezime) DO NOTHING;
END $$;

--  Namjerno: jedna knjižica istekla juče, jedna ističe za 25 dana, jedno lice
--  bez upisanog roka. Na demou se odmah vidi šta tabla javlja i zašto.

COMMIT;

-- ------------------------------------------------------------ kontrola
SELECT 'dobavljači' AS sta, count(*) FROM dobavljac
UNION ALL SELECT 'kupci',     count(*) FROM kupac
UNION ALL SELECT 'vozila',    count(*) FROM vozilo
UNION ALL SELECT 'artikli',   count(*) FROM artikal
UNION ALL SELECT 'prijemi',   count(*) FROM prijem
UNION ALL SELECT 'isporuke',  count(*) FROM isporuka
UNION ALL SELECT 'zapisi',    count(*) FROM zapis;
