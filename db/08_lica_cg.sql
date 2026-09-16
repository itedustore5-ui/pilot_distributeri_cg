-- 08_lica_cg.sql — spisak lica koja rukuju hranom i važenje sanitarnih knjižica
--
-- Zašto postoji: sanitarna knjižica je jedina tvrda obaveza u ovoj oblasti sa
-- izričitom kaznom — Zakon o zaštiti stanovništva od zaraznih bolesti
-- („Sl. list CG" 12/2018, 64/2020), čl. 31; kazna 2.500–20.000 €.
-- Tabela `ucesnik` je iz dijela za mjerenje znanja i nema rok važenja knjižice.
--
-- Ne dira podatke. Bezbjedno na živoj bazi. Pokreće se poslije 07.

CREATE TABLE IF NOT EXISTS lice (
  id              SERIAL PRIMARY KEY,
  firma_id        INT NOT NULL REFERENCES firma(id) ON DELETE CASCADE,
  ime_prezime     TEXT NOT NULL,
  radno_mjesto    TEXT,                       -- magacioner, vozač, komercijalista…
  posao_sa_hranom TEXT,                       -- šta konkretno radi sa hranom
  knjizica_broj   TEXT,
  knjizica_izdata DATE,
  knjizica_vazi_do DATE,
  sifra           TEXT,                       -- veza sa ceduljicom i poljem `izvrsilac`
  napomena        TEXT,
  aktivan         BOOLEAN NOT NULL DEFAULT TRUE,
  kreirano        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (firma_id, ime_prezime)
);

CREATE INDEX IF NOT EXISTS lice_firma_vazi ON lice (firma_id, knjizica_vazi_do);

-- Pogled koji odmah kaže stanje, da se isti račun ne piše na tri mjesta.
DROP VIEW IF EXISTS v_lica;
CREATE VIEW v_lica AS
SELECT l.*,
       (l.knjizica_vazi_do - CURRENT_DATE)      AS dana_do_isteka,
       CASE
         WHEN l.knjizica_vazi_do IS NULL                       THEN 'nema podatka'
         WHEN l.knjizica_vazi_do <  CURRENT_DATE               THEN 'istekla'
         WHEN l.knjizica_vazi_do <= CURRENT_DATE + 30          THEN 'ističe'
         ELSE 'važi'
       END                                       AS stanje_knjizice
FROM lice l
WHERE l.aktivan;

COMMENT ON TABLE lice IS
  'Lica koja rukuju hranom. Sanitarna knjižica: Zakon o zaštiti stanovništva '
  'od zaraznih bolesti, čl. 31. Ne upisuje se nalaz pregleda — samo broj i rok.';
