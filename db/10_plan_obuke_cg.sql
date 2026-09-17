-- 10_plan_obuke_cg.sql — godišnji plan obuke kao plan, a ne kao dnevni zapis
--
-- Zašto: Prilog 13 je do sada bio običan red u tabeli `zapis`, isto kao mjerenje
-- temperature. To je pogrešno po dvije stvari: plan se pravi unaprijed za cijelu
-- godinu (zapis se pravi za dan koji je prošao), i plan ima stanje — planirano,
-- urađeno, kasni — koje dnevni zapis nema.
--
-- Stavka plana se NE briše kad prođe. Kad se obuka održi, upiše se `izvrseno`
-- i eventualno veza na red u `obuka`. Tako se na kraju godine vidi šta je
-- planirano a nije održano — a to je tačno ono što inspektor ili auditor gleda.
--
-- Ne dira postojeće podatke. Bezbjedno na živoj bazi. Pokreće se poslije 09.

CREATE TABLE IF NOT EXISTS plan_obuke (
  id             SERIAL PRIMARY KEY,
  firma_id       INT NOT NULL REFERENCES firma(id) ON DELETE CASCADE,
  godina         INT NOT NULL,
  ciljna_grupa   TEXT NOT NULL,              -- magacin · vozači · svi koji rukuju hranom
  tema           TEXT NOT NULL,
  oblik          TEXT,                       -- teorijska · praktična · teorijska + praktična
  planirani_termin DATE,
  trajanje_sati  NUMERIC(4,1),
  izvodjac       TEXT,                       -- ko drži obuku
  odgovoran      TEXT,                       -- ko u firmi odgovara da se održi
  izvrseno       DATE,                       -- kad je stvarno održana
  obuka_id       INT REFERENCES obuka(id) ON DELETE SET NULL,
  napomena       TEXT,
  kreirano       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plan_obuke_firma_godina ON plan_obuke (firma_id, godina);

-- Stanje se računa ovdje, da se isti račun ne piše u API-ju i u pregledaču.
DROP VIEW IF EXISTS v_plan_obuke;
CREATE VIEW v_plan_obuke AS
SELECT p.*,
       CASE
         WHEN p.izvrseno IS NOT NULL                          THEN 'urađeno'
         WHEN p.planirani_termin IS NULL                      THEN 'bez termina'
         WHEN p.planirani_termin < CURRENT_DATE               THEN 'kasni'
         WHEN p.planirani_termin <= CURRENT_DATE + 30         THEN 'uskoro'
         ELSE 'planirano'
       END                                                     AS stanje,
       (p.planirani_termin - CURRENT_DATE)                     AS dana_do_termina
FROM plan_obuke p;

COMMENT ON TABLE plan_obuke IS
  'Godišnji plan obuke — Vodič UBH, Prilog 13. Nije zakonom propisan obrazac; '
  'služi kao dokaz da se HACCP postupci primjenjuju i održavaju (čl. 36).';
