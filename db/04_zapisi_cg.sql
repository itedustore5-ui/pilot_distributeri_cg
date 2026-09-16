-- =====================================================================
--  DHP / HACCP ZAPISI — DISTRIBUCIJA HRANE, CRNA GORA
--
--  Nadogradnja na 01_schema.sql. Pokreće se POSLE njega.
--  Osnov: Zakon o bezbjednosti hrane ("Sl. list CG" 59/2026)
--         čl. 27 sledljivost · 28 povlačenje · 35 higijena · 36 HACCP
--         Pravilnik o sledljivosti ("Sl. list CG" 48/16)
--         Vodič za dobru higijensku praksu (UBH, v1.0, 03.05.2023)
--
--  ZLATNA PRAVILA:
--   1. Zapis se NE BRIŠE. Ispravka je nova verzija sa vezom na prethodnu.
--      Brisan zapis pred inspektorom znači da sistem nije vjerodostojan.
--   2. Svaki zapis nosi ko ga je unio i kada. Bez izuzetka.
--   3. Odstupanje bez korektivne mjere je nepotpun zapis i tako se i prikazuje.
--   4. Sledljivost mora dati odgovor "gdje je otišla serija X" jednim upitom.
-- =====================================================================

DROP VIEW IF EXISTS v_sledljivost_napred, v_sledljivost_nazad, v_odstupanja,
  v_zapisi_dan, v_obuka_plan CASCADE;

DROP TABLE IF EXISTS isporuka, prijem, zapis, artikal, vozilo, kupac, dobavljac CASCADE;

DROP TYPE IF EXISTS grupa_hrane_t, ishod_prijema_t CASCADE;

-- G1 ambijentalno · G2 rashlađeno · G3 zamrznuto · G4 nehrana u istom skladištu
CREATE TYPE grupa_hrane_t   AS ENUM ('G1','G2','G3','G4');
CREATE TYPE ishod_prijema_t AS ENUM ('prihvaceno','prihvaceno_uz_mjeru','odbijeno');

-- ---------------------------------------------------------------- šifarnici

-- Prilog 4 — Lista dobavljača. PRP-9: samo odobreni dobavljač.
CREATE TABLE dobavljac (
  id              SERIAL PRIMARY KEY,
  firma_id        INT NOT NULL REFERENCES firma(id) ON DELETE CASCADE,
  naziv           TEXT NOT NULL,
  adresa          TEXT,
  kontakt_osoba   TEXT,
  telefon         TEXT,
  email           TEXT,
  vrsta_hrane     TEXT,                       -- šta isporučuje
  broj_objekta    TEXT,                       -- kontrolni broj objekta dobavljača
  odobren         BOOLEAN NOT NULL DEFAULT FALSE,
  datum_odobrenja DATE,
  odobrio         TEXT,
  napomena        TEXT,
  aktivan         BOOLEAN NOT NULL DEFAULT TRUE,
  kreirano        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (firma_id, naziv)
);

CREATE TABLE kupac (
  id              SERIAL PRIMARY KEY,
  firma_id        INT NOT NULL REFERENCES firma(id) ON DELETE CASCADE,
  naziv           TEXT NOT NULL,
  adresa          TEXT,
  kontakt_osoba   TEXT,
  -- Telefon je OBAVEZAN. Bez njega povlačenje ne može da se izvede
  -- u roku koji traži čl. 28 Zakona.
  telefon         TEXT NOT NULL,
  email           TEXT,
  aktivan         BOOLEAN NOT NULL DEFAULT TRUE,
  kreirano        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (firma_id, naziv)
);

CREATE TABLE vozilo (
  id              SERIAL PRIMARY KEY,
  firma_id        INT NOT NULL REFERENCES firma(id) ON DELETE CASCADE,
  registracija    TEXT NOT NULL,
  opis            TEXT,
  ima_rashladu    BOOLEAN NOT NULL DEFAULT FALSE,
  rezim_min       NUMERIC(5,2),               -- na koji režim uređaj može
  rezim_max       NUMERIC(5,2),
  poslednji_servis DATE,
  aktivno         BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (firma_id, registracija)
);

-- Kritične granice po artiklu ili grupi artikala.
-- POTVRDA: granica_potvrdio ostaje NULL dok klijent ne potvrdi vrijednost
-- iz deklaracije proizvođača. Dok je NULL, aplikacija granicu prikazuje
-- kao nepotvrđenu i ne koristi je za automatsku ocjenu odstupanja.
CREATE TABLE artikal (
  id              SERIAL PRIMARY KEY,
  firma_id        INT NOT NULL REFERENCES firma(id) ON DELETE CASCADE,
  naziv           TEXT NOT NULL,
  grupa           grupa_hrane_t NOT NULL,
  jedinica        TEXT NOT NULL DEFAULT 'kg',
  granica_min     NUMERIC(5,2),               -- °C, NULL za G1
  granica_max     NUMERIC(5,2),
  tolerancija     NUMERIC(5,2) NOT NULL DEFAULT 4.00,  -- iznad ove razlike roba se ne prima
  granica_izvor   TEXT,                       -- deklaracija, propis, HACCP plan
  granica_potvrdio TEXT,
  granica_potvrdjeno DATE,
  aktivan         BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (firma_id, naziv)
);

-- ---------------------------------------------------------------- sledljivost

-- KKT 1 — PRIJEM. Ujedno "korak nazad" iz čl. 27.
CREATE TABLE prijem (
  id              SERIAL PRIMARY KEY,
  firma_id        INT NOT NULL REFERENCES firma(id) ON DELETE CASCADE,
  datum           DATE NOT NULL DEFAULT CURRENT_DATE,
  vrijeme         TIME,
  dobavljac_id    INT NOT NULL REFERENCES dobavljac(id),
  artikal_id      INT NOT NULL REFERENCES artikal(id),
  -- Lot je srce sledljivosti. Bez njega povlačenje je nemoguće.
  lot             TEXT NOT NULL,
  kolicina        NUMERIC(12,3) NOT NULL,
  rok_trajanja    DATE,
  broj_otpremnice TEXT,
  temperatura     NUMERIC(5,2),               -- izmjerena na prijemu
  granica_primjenjena NUMERIC(5,2),           -- koja je granica važila u tom trenutku
  ishod           ishod_prijema_t NOT NULL DEFAULT 'prihvaceno',
  korektivna_mjera TEXT,
  vozilo_dobavljaca TEXT,
  izvrsilac       TEXT NOT NULL,
  napomena        TEXT,
  -- Ispravka se ne radi prepravkom. Novi zapis pokazuje na stari.
  ispravlja_id    INT REFERENCES prijem(id),
  kreirano        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ishod = 'prihvaceno' OR korektivna_mjera IS NOT NULL)
);

-- KKT 3 — ISPORUKA. Ujedno "korak naprijed" iz čl. 27.
CREATE TABLE isporuka (
  id              SERIAL PRIMARY KEY,
  firma_id        INT NOT NULL REFERENCES firma(id) ON DELETE CASCADE,
  datum           DATE NOT NULL DEFAULT CURRENT_DATE,
  kupac_id        INT NOT NULL REFERENCES kupac(id),
  -- Veza na konkretan prijem daje lot bez prepisivanja i bez greške.
  prijem_id       INT NOT NULL REFERENCES prijem(id),
  kolicina        NUMERIC(12,3) NOT NULL,
  broj_otpremnice TEXT,
  vozilo_id       INT REFERENCES vozilo(id),
  vozac           TEXT,
  temp_utovar     NUMERIC(5,2),
  temp_isporuka   NUMERIC(5,2),
  vozilo_provjereno BOOLEAN NOT NULL DEFAULT FALSE,   -- Prilog D1 urađen
  odstupanje      BOOLEAN NOT NULL DEFAULT FALSE,
  korektivna_mjera TEXT,
  preuzeo         TEXT,
  ispravlja_id    INT REFERENCES isporuka(id),
  kreirano        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (NOT odstupanje OR korektivna_mjera IS NOT NULL)
);

-- ---------------------------------------------------------------- opšti zapisi
--
-- Jedan motor za sve obrasce koji nemaju relacionu logiku:
-- Prilog 1, 2, 3, 6, 7, 8, 11, 12, 13, 14, D1, D3, D4.
-- Kolone svakog obrasca definiše public/obrasci-cg.json, ne baza.
-- Tako se novi obrazac dodaje bez migracije.
CREATE TABLE zapis (
  id              SERIAL PRIMARY KEY,
  firma_id        INT NOT NULL REFERENCES firma(id) ON DELETE CASCADE,
  obrazac         TEXT NOT NULL,              -- 'P3','P7','P8','D1','D3'...
  datum           DATE NOT NULL DEFAULT CURRENT_DATE,
  vrijeme         TIME,
  podaci          JSONB NOT NULL DEFAULT '{}'::jsonb,
  odstupanje      BOOLEAN NOT NULL DEFAULT FALSE,
  korektivna_mjera TEXT,
  izvrsilac       TEXT NOT NULL,
  kontrolor       TEXT,
  kontrolisano    DATE,
  ispravlja_id    INT REFERENCES zapis(id),
  kreirano        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Odstupanje bez korektivne mjere nije zapis nego nalaz protiv firme.
  CHECK (NOT odstupanje OR korektivna_mjera IS NOT NULL)
);

CREATE INDEX idx_prijem_firma_datum   ON prijem(firma_id, datum DESC);
CREATE INDEX idx_prijem_lot           ON prijem(firma_id, lower(lot));
CREATE INDEX idx_isporuka_prijem      ON isporuka(prijem_id);
CREATE INDEX idx_isporuka_firma_datum ON isporuka(firma_id, datum DESC);
CREATE INDEX idx_zapis_firma_obrazac  ON zapis(firma_id, obrazac, datum DESC);
CREATE INDEX idx_zapis_odstupanje     ON zapis(firma_id, odstupanje) WHERE odstupanje;

-- =====================================================================
--  POGLEDI
-- =====================================================================

-- Korak nazad: od lota do dobavljača.
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
  p.izvrsilac
FROM prijem p
JOIN dobavljac d ON d.id = p.dobavljac_id
JOIN artikal   a ON a.id = p.artikal_id
WHERE p.ispravlja_id IS NULL;

-- Korak naprijed: od lota do svih kupaca. Ovo je upit koji mora
-- da odgovori u roku od 4 sata na vježbi povlačenja.
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
JOIN isporuka  i ON i.prijem_id = p.id AND i.ispravlja_id IS NULL
JOIN kupac     k ON k.id = i.kupac_id
LEFT JOIN vozilo v ON v.id = i.vozilo_id
WHERE p.ispravlja_id IS NULL;

-- Sva odstupanja na jednom mjestu. Prvo što odgovorno lice gleda
-- pri mjesečnoj verifikaciji, i prvo što auditor traži.
CREATE OR REPLACE VIEW v_odstupanja AS
SELECT firma_id, datum, 'KKT1 prijem'::text AS izvor,
       ('lot ' || lot || ', ' || COALESCE(temperatura::text,'—') || ' °C, granica '
        || COALESCE(granica_primjenjena::text,'—') || ' °C')::text AS opis,
       korektivna_mjera, izvrsilac, NULL::text AS kontrolor
  FROM prijem
 WHERE ishod <> 'prihvaceno' AND ispravlja_id IS NULL
UNION ALL
SELECT firma_id, datum, 'KKT3 isporuka'::text,
       ('utovar ' || COALESCE(temp_utovar::text,'—') || ' °C, isporuka '
        || COALESCE(temp_isporuka::text,'—') || ' °C')::text,
       korektivna_mjera, vozac, preuzeo
  FROM isporuka
 WHERE odstupanje AND ispravlja_id IS NULL
UNION ALL
-- Čitljiv opis umjesto sirovog JSON-a: „komora: Komora 1 · temperatura: 8.6“.
-- Ovo se štampa i predaje inspektoru, pa mora da se čita bez objašnjenja.
SELECT firma_id, datum, ('obrazac ' || obrazac)::text,
       COALESCE(podaci->>'opis',
                (SELECT string_agg(replace(e.k,'_',' ') || ': ' || e.v, ' · ')
                   FROM jsonb_each_text(podaci) AS e(k, v))),
       korektivna_mjera, izvrsilac, kontrolor
  FROM zapis
 WHERE odstupanje AND ispravlja_id IS NULL;

-- Da li je dan pokriven obaveznim zapisima. Rupa u nizu dana je
-- najčešći nalaz na inspekciji — bolje da je firma vidi prije inspektora.
CREATE OR REPLACE VIEW v_zapisi_dan AS
SELECT firma_id, datum, obrazac, COUNT(*) AS broj,
       SUM(CASE WHEN odstupanje THEN 1 ELSE 0 END) AS odstupanja
  FROM zapis
 WHERE ispravlja_id IS NULL
 GROUP BY firma_id, datum, obrazac;

-- =====================================================================
--  NOVA ULOGA: operater
--  Magacioner, vozač, kontrolor prijema. Unosi zapise, ne mijenja ih,
--  ne vidi izvještaje ni imena. Postoji zato što se dnevni zapisi
--  popunjavaju na telefonu u magacinu, a ne u kancelariji.
-- =====================================================================
-- ALTER TYPE mora biti samostalna naredba, ne unutar DO bloka.
ALTER TYPE uloga_t ADD VALUE IF NOT EXISTS 'operater';
