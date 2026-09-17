-- 09_nalog_lice_cg.sql — nalog za prijavu vezan za lice sa spiska
--
-- Zašto: do sada su nalog i čovjek bile dvije nepovezane stvari. U tabeli
-- `korisnik` je stajao e-mail, a ko je to zapravo i kojom šifrom potpisuje
-- zapise nije se nigdje vidjelo. Sada nalog pokazuje na red u `lice`, pa se
-- ime, radno mjesto i šifra čitaju sa jednog mjesta i ne mogu se razići.
--
-- `lice_id` je NULL kod konsultanta (nije zaposlen kod klijenta) i kod starih
-- naloga dok se ne povežu ručno.
--
-- Ne dira podatke. Bezbjedno na živoj bazi. Pokreće se poslije 08.

ALTER TABLE korisnik
  ADD COLUMN IF NOT EXISTS lice_id INT REFERENCES lice(id) ON DELETE SET NULL;

-- Šifra mora biti jedinstvena u firmi — inače dva čovjeka potpisuju isto.
CREATE UNIQUE INDEX IF NOT EXISTS lice_sifra_jedinstvena
  ON lice (firma_id, sifra) WHERE sifra IS NOT NULL;

-- Jedno lice = najviše jedan nalog.
CREATE UNIQUE INDEX IF NOT EXISTS korisnik_lice_jedan
  ON korisnik (lice_id) WHERE lice_id IS NOT NULL;

-- Spisak naloga onako kako se prikazuje: ko, čime potpisuje, šta smije.
DROP VIEW IF EXISTS v_nalozi;
CREATE VIEW v_nalozi AS
SELECT k.id, k.firma_id, k.email, k.uloga, k.aktivan, k.mora_promeniti,
       k.poslednja_prijava, k.lice_id,
       COALESCE(l.ime_prezime, k.ime)      AS ime,
       l.sifra                              AS sifra,
       l.radno_mjesto                       AS radno_mjesto,
       l.knjizica_vazi_do                   AS knjizica_vazi_do,
       f.naziv                              AS firma
  FROM korisnik k
  LEFT JOIN lice  l ON l.id = k.lice_id
  LEFT JOIN firma f ON f.id = k.firma_id;

COMMENT ON COLUMN korisnik.lice_id IS
  'Red u `lice` — ko je vlasnik naloga. NULL za konsultanta i za stare naloge.';
