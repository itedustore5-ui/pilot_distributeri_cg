-- =====================================================================
--  MERENJE RETENCIJE ZNANJA — šema baze
--  Naziv firme i programa se NE upisuju u kod — dolaze iz db/banka.json.
--
--  ZLATNA PRAVILA (ne krše se):
--   1. opcija.tacna NIKADA ne napušta server pre predaje sesije.
--   2. Ocenjivanje je isključivo serversko.
--   3. Učesnik se vodi pod šifrom. Ime i prezime NE ulaze u ovu bazu.
--   4. Sastav svake forme se pamti (sesija_stavka) da bi merenje
--      bilo proverljivo i ponovljivo pred auditorom.
-- =====================================================================

DROP TABLE IF EXISTS sesija_korisnika, korisnik, odgovor, sesija_stavka, sesija, prisustvo, obuka_tema, obuka,
  ucesnik, talas, grupa, radno_mesto, sifra_opasnosti, sifra_razloga,
  nacrt_pozicija, nacrt, opcija, stavka, porodica, tema, program, firma CASCADE;

DROP TYPE IF EXISTS uloga_t, paket_t, oblik_obuke_t, nivo_rizika_t, kognitivni_nivo_t, tip_pozicije_t, tip_stavke_t CASCADE;

CREATE TYPE nivo_rizika_t     AS ENUM ('kritican', 'visok', 'srednji', 'nizak');
CREATE TYPE kognitivni_nivo_t AS ENUM ('prisecanje', 'razumevanje', 'primena');
CREATE TYPE tip_pozicije_t    AS ENUM ('rotaciona', 'sidro');
CREATE TYPE tip_stavke_t      AS ENUM ('jedan_izbor', 'vise_izbora', 'redosled');
CREATE TYPE oblik_obuke_t     AS ENUM ('teorijska', 'prakticna', 'kombinovana');

-- Obim usluge — ista aplikacija i ista banka pitanja, razlika je broj termina:
--   provera   — jedan termin: obuka, provera osposobljenosti, Obrazac 6, evidencija
--   osnovno   — + ulazna provera pre obuke, pa se vidi koliko je obuka podigla znanje
--   prosireno — + provere na 30 i 90 dana: zadržavanje znanja i krivulja zaboravljanja
CREATE TYPE paket_t           AS ENUM ('provera', 'osnovno', 'prosireno');

-- Uloge:
--   izvodjac — izvođač usluge: sve, uključujući korisnike i licencu
--   bzr      — lice za BZR / menadžer kvaliteta: vidi imena, štampa,
--              vodi merenje i evidenciju
--   uprava   — direktor: SAMO zbirni izveštaj, bez imena i bez šifara
CREATE TYPE uloga_t           AS ENUM ('izvodjac', 'bzr', 'uprava');

-- ---------------------------------------------------------------- klijent
CREATE TABLE firma (
  id            SERIAL PRIMARY KEY,
  naziv         TEXT NOT NULL,
  pib           TEXT,
  delatnost     TEXT,
  standardi     TEXT[],                       -- {HACCP, IFS, HALAL, EAC}
  kreirano      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
--  REFERENTNE ŠIFRE IZ PRAVILNIKA
--  Pravilnik o načinu vođenja i rokovima čuvanja evidencija u oblasti
--  bezbednosti i zdravlja na radu ("Sl. glasnik RS", 5/2025 sa izmenama).
--  Vrednosti su propisane — ne menjaju se po klijentu.
-- =====================================================================
CREATE TABLE sifra_razloga (
  sifra   TEXT PRIMARY KEY,          -- '01'..'10'
  opis    TEXT NOT NULL
);

CREATE TABLE sifra_opasnosti (
  sifra   TEXT PRIMARY KEY,          -- '01'..'40'
  opis    TEXT NOT NULL,
  grupa   TEXT                       -- mehaničke, električne, hemijske...
);

-- Podaci po radnom mestu, prepisani iz Akta o proceni rizika.
-- Unose se jednom po firmi i posle se automatski uparuju sa svakim
-- zaposlenim na tom radnom mestu prilikom štampe Obrasca 6.
CREATE TABLE radno_mesto (
  id                SERIAL PRIMARY KEY,
  firma_id          INT NOT NULL REFERENCES firma(id) ON DELETE CASCADE,
  naziv             TEXT NOT NULL,
  opis_poslova      TEXT,
  povecan_rizik     BOOLEAN NOT NULL DEFAULT FALSE,
  sifre_opasnosti   TEXT[],          -- {'01','15','25'}
  mere              TEXT,            -- konkretne mere za bezbedan i zdrav rad
  lzo               TEXT,            -- naziv lične zaštitne opreme
  obavestenja       TEXT,            -- obaveštenja, uputstva, instrukcije
  rukovodilac_prati TEXT,            -- radna mesta koja rukovodilac prati
  UNIQUE (firma_id, naziv)
);

CREATE TABLE program (
  id            SERIAL PRIMARY KEY,
  firma_id      INT NOT NULL REFERENCES firma(id) ON DELETE CASCADE,
  naziv         TEXT NOT NULL,
  godina        INT  NOT NULL,
  pravni_osnov  TEXT,                         -- na šta se obuka oslanja
  UNIQUE (firma_id, naziv, godina)
);

-- ---------------------------------------------------------------- sadržaj
CREATE TABLE tema (
  id            SERIAL PRIMARY KEY,
  program_id    INT NOT NULL REFERENCES program(id) ON DELETE CASCADE,
  oznaka        TEXT NOT NULL,                -- T1, T2...
  naziv         TEXT NOT NULL,
  nivo_rizika   nivo_rizika_t NOT NULL,
  izvor         TEXT,                         -- iz kog dokumenta klijenta je izvedena
  UNIQUE (program_id, oznaka)
);

-- Nacrt = jedna stranica koju klijent odobrava PRE pisanja pitanja.
CREATE TABLE nacrt (
  id            SERIAL PRIMARY KEY,
  program_id    INT NOT NULL REFERENCES program(id) ON DELETE CASCADE,
  verzija       TEXT NOT NULL,
  ukupno_stavki INT  NOT NULL,
  prag_teme     NUMERIC(5,2) NOT NULL DEFAULT 70.00,   -- prag je na TEMI, ne na čoveku
  odobrio       TEXT,
  odobreno_dana DATE,
  UNIQUE (program_id, verzija)
);

CREATE TABLE porodica (
  id                SERIAL PRIMARY KEY,
  tema_id           INT NOT NULL REFERENCES tema(id) ON DELETE CASCADE,
  oznaka            TEXT NOT NULL UNIQUE,     -- F1.1 ... ili A1 za sidra
  konstrukt         TEXT NOT NULL,            -- šta tačno meri (ista stvar u svim varijantama)
  kognitivni_nivo   kognitivni_nivo_t NOT NULL,
  je_sidro          BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE stavka (
  id                SERIAL PRIMARY KEY,
  porodica_id       INT NOT NULL REFERENCES porodica(id) ON DELETE CASCADE,
  varijanta         INT NOT NULL,             -- 1..4 ; sidro ima samo 1
  tip               tip_stavke_t NOT NULL DEFAULT 'jedan_izbor',
  tekst             TEXT NOT NULL,
  obrazlozenje      TEXT,                     -- vidi se TEK u izveštaju, nikad učesniku
  zahteva_potvrdu   BOOLEAN NOT NULL DEFAULT FALSE,  -- sadrži brojku iz HACCP plana klijenta
  potvrdio          TEXT,
  potvrdjeno_dana   DATE,
  aktivna           BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (porodica_id, varijanta)
);

CREATE TABLE opcija (
  id            SERIAL PRIMARY KEY,
  stavka_id     INT NOT NULL REFERENCES stavka(id) ON DELETE CASCADE,
  redosled      INT NOT NULL,
  tekst         TEXT NOT NULL,
  tacna         BOOLEAN NOT NULL DEFAULT FALSE   -- <<< NIKADA ne ide klijentu pre predaje
);

CREATE TABLE nacrt_pozicija (
  id            SERIAL PRIMARY KEY,
  nacrt_id      INT NOT NULL REFERENCES nacrt(id) ON DELETE CASCADE,
  redni_broj    INT NOT NULL,
  porodica_id   INT NOT NULL REFERENCES porodica(id),
  tip           tip_pozicije_t NOT NULL,
  UNIQUE (nacrt_id, redni_broj)
);

-- ---------------------------------------------------------------- merenje
CREATE TABLE grupa (
  id              SERIAL PRIMARY KEY,
  firma_id        INT NOT NULL REFERENCES firma(id) ON DELETE CASCADE,
  nacrt_id        INT NOT NULL REFERENCES nacrt(id),
  naziv           TEXT NOT NULL,
  lokacija        TEXT,
  jezik           TEXT NOT NULL DEFAULT 'sr',
  -- Prefiks šifre po sektoru: P proizvodnja · H hotelijerstvo · K konsalting
  prefiks_sifre   TEXT NOT NULL DEFAULT 'P',
  paket           paket_t NOT NULL DEFAULT 'provera',
  -- FALSE: u bazi su samo šifre, spisak šifra→ime drži poslodavac
  cuva_imena      BOOLEAN NOT NULL DEFAULT FALSE,
  -- Rok čuvanja radnih podataka merenja, od poslednjeg talasa.
  -- Zakonsku evidenciju (Obrazac 6, 40 godina) čuva poslodavac na papiru;
  -- ovo je ugovoreni rok za podatke u sistemu.
  rok_cuvanja_meseci INT NOT NULL DEFAULT 12,
  anonimizovano   TIMESTAMPTZ,      -- kada je veza prema osobi uklonjena
  anonimizovao    TEXT,
  broj_planiranih INT,
  kreirano        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
--  ODRŽANA OBUKA
--  Ovo je prvi dokument koji inspektor traži. Provera znanja je tek
--  druga kolona u evidenciji — bez zapisa o samoj obuci ona ne stoji.
-- =====================================================================
CREATE TABLE obuka (
  id              SERIAL PRIMARY KEY,
  grupa_id      INT NOT NULL REFERENCES grupa(id) ON DELETE CASCADE,
  naziv           TEXT NOT NULL,
  oblik           oblik_obuke_t NOT NULL DEFAULT 'kombinovana',
  -- Šifra razloga obuke iz Pravilnika (01–10). 09 = periodična obuka.
  sifra_razloga   TEXT REFERENCES sifra_razloga(sifra),
  datum_od        DATE NOT NULL,
  datum_do        DATE,
  -- Obrazac 6 traži razdvojene datume. Teorijski deo pokriva sistem;
  -- praktični se izvodi na radnom mestu i unosi ručno.
  datum_teorijske   DATE,
  datum_prakticne   DATE,
  datum_obuke_lzo   DATE,
  trajanje_sati   NUMERIC(5,2),
  mesto           TEXT,                     -- sala, pogon, linija
  izvodjac        TEXT,                     -- ko je držao obuku
  izvodjac_svojstvo TEXT,                   -- npr. lice za BZR, spoljni konsultant
  materijal       TEXT,                     -- na osnovu kog dokumenta je držana
  napomena        TEXT,
  kreirano        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (datum_do IS NULL OR datum_do >= datum_od)
);

-- Koje teme je obuka pokrila. Bez ovoga se ne može reći da li merenje
-- proverava ono što je stvarno predavano.
CREATE TABLE obuka_tema (
  obuka_id      INT NOT NULL REFERENCES obuka(id) ON DELETE CASCADE,
  tema_id       INT NOT NULL REFERENCES tema(id) ON DELETE CASCADE,
  PRIMARY KEY (obuka_id, tema_id)
);

CREATE TABLE talas (
  id              SERIAL PRIMARY KEY,
  grupa_id      INT NOT NULL REFERENCES grupa(id) ON DELETE CASCADE,
  oznaka          TEXT NOT NULL,              -- T0, T1, T30, T90
  redni           INT  NOT NULL,              -- 1..4  (određuje koju varijantu učesnik dobija)
  opis            TEXT,
  planiran_datum  DATE,
  otvoren         BOOLEAN NOT NULL DEFAULT FALSE,
  -- koju održanu obuku ovaj termin proverava (T0 je pre obuke, pa ostaje prazan)
  obuka_id        INT REFERENCES obuka(id) ON DELETE SET NULL,
  UNIQUE (grupa_id, oznaka),
  UNIQUE (grupa_id, redni)
);

-- Šifra je osnovni identifikator.
--
-- ime_prezime je OPCIONO i puni se samo ako grupa.cuva_imena = TRUE.
-- Zakonska evidencija o osposobljavanju mora da identifikuje zaposlenog, pa
-- poslodavac bira jedan od dva načina:
--   A) cuva_imena = FALSE (podrazumevano) — u bazi su samo šifre, a spisak
--      šifra→ime drži poslodavac kod sebe. Najmanja izloženost podataka.
--   B) cuva_imena = TRUE — imena se čuvaju ovde. Traži ugovor o obradi
--      podataka i dogovoren rok čuvanja.
CREATE TABLE ucesnik (
  id            SERIAL PRIMARY KEY,
  grupa_id    INT NOT NULL REFERENCES grupa(id) ON DELETE CASCADE,
  sifra         TEXT NOT NULL,
  ime_prezime   TEXT,
  radno_mesto   TEXT,                -- naziv, radi prikaza
  radno_mesto_id INT REFERENCES radno_mesto(id) ON DELETE SET NULL,
  smena         TEXT,
  UNIQUE (grupa_id, sifra)
);

CREATE TABLE prisustvo (
  id            SERIAL PRIMARY KEY,
  obuka_id      INT NOT NULL REFERENCES obuka(id) ON DELETE CASCADE,
  ucesnik_id    INT NOT NULL REFERENCES ucesnik(id) ON DELETE CASCADE,
  prisustvovao  BOOLEAN NOT NULL DEFAULT TRUE,
  napomena      TEXT,
  UNIQUE (obuka_id, ucesnik_id)
);


CREATE TABLE sesija (
  id            SERIAL PRIMARY KEY,
  talas_id      INT NOT NULL REFERENCES talas(id) ON DELETE CASCADE,
  ucesnik_id    INT NOT NULL REFERENCES ucesnik(id) ON DELETE CASCADE,
  poceta        TIMESTAMPTZ NOT NULL DEFAULT now(),
  predata       TIMESTAMPTZ,
  bodovi        INT,
  max_bodovi    INT,
  procenat      NUMERIC(5,2),
  UNIQUE (talas_id, ucesnik_id)               -- jedan pokušaj po talasu
);

-- Tačan sastav forme koja je poslužena. Ovo je dokaz pred auditorom.
CREATE TABLE sesija_stavka (
  id            SERIAL PRIMARY KEY,
  sesija_id     INT NOT NULL REFERENCES sesija(id) ON DELETE CASCADE,
  redni_broj    INT NOT NULL,
  stavka_id     INT NOT NULL REFERENCES stavka(id),
  pozicija_id   INT NOT NULL REFERENCES nacrt_pozicija(id),
  redosled_opcija INT[] NOT NULL,             -- kojim redom su opcije prikazane
  UNIQUE (sesija_id, redni_broj)
);

CREATE TABLE odgovor (
  id                SERIAL PRIMARY KEY,
  sesija_stavka_id  INT NOT NULL REFERENCES sesija_stavka(id) ON DELETE CASCADE,
  opcija_id         INT REFERENCES opcija(id),
  tacan             BOOLEAN,                  -- popunjava SERVER pri predaji
  odgovoreno        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sesija_stavka_id)
);

CREATE INDEX idx_sesija_talas    ON sesija(talas_id);
CREATE INDEX idx_ss_sesija       ON sesija_stavka(sesija_id);
CREATE INDEX idx_odgovor_ss      ON odgovor(sesija_stavka_id);
CREATE INDEX idx_stavka_porodica ON stavka(porodica_id);
CREATE INDEX idx_opcija_stavka   ON opcija(stavka_id);
CREATE INDEX idx_obuka_grupa   ON obuka(grupa_id);
CREATE INDEX idx_prisustvo_obuka ON prisustvo(obuka_id);
CREATE INDEX idx_radno_mesto_firma ON radno_mesto(firma_id);

-- =====================================================================
--  KORISNICI SISTEMA (nisu zaposleni koji rade test — oni imaju šifru)
-- =====================================================================
CREATE TABLE korisnik (
  id            SERIAL PRIMARY KEY,
  firma_id      INT REFERENCES firma(id) ON DELETE CASCADE,  -- NULL = izvođač
  email         TEXT NOT NULL UNIQUE,
  ime           TEXT NOT NULL,
  uloga         uloga_t NOT NULL,
  lozinka_hash  TEXT NOT NULL,
  aktivan       BOOLEAN NOT NULL DEFAULT TRUE,
  mora_promeniti BOOLEAN NOT NULL DEFAULT TRUE,   -- prva prijava traži novu lozinku
  poslednja_prijava TIMESTAMPTZ,
  kreirano      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sesija_korisnika (
  id            SERIAL PRIMARY KEY,
  korisnik_id   INT NOT NULL REFERENCES korisnik(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,     -- čuva se heš, ne sam token
  istice        TIMESTAMPTZ NOT NULL,
  kreirano      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sesija_kor_token ON sesija_korisnika(token_hash);
CREATE INDEX idx_korisnik_email   ON korisnik(lower(email));
