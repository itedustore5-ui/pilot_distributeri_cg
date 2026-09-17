-- 11_zaposleni_cg.sql — spisak lica postaje spisak SVIH zaposlenih
--
-- Zašto nije napravljena druga tabela: dvije liste ljudi u istoj bazi se
-- razilaze prvim preimenovanjem. Isti problem smo već imali sa nalogom i
-- licem, pa ga ne pravimo ponovo. Umjesto toga jedna lista i zastavica
-- `rukuje_hranom` — ko je nema, i dalje je zaposlen, ali za njega ne važe
-- sanitarna knjižica ni Prilog 13/14.
--
-- Postojeća lica dobijaju TRUE, jer su do sada na spisak i unošena samo
-- lica koja rukuju hranom.
--
-- Ne dira podatke. Bezbjedno na živoj bazi. Pokreće se poslije 10.

ALTER TABLE lice
  ADD COLUMN IF NOT EXISTS rukuje_hranom BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN lice.rukuje_hranom IS
  'TRUE = za njega važe sanitarna knjižica (čl. 31 Zakona o zaštiti stanovništva '
  'od zaraznih bolesti) i evidencija obuke. FALSE = zaposlen, ali ne dodiruje hranu.';

DROP VIEW IF EXISTS v_lica;
CREATE VIEW v_lica AS
SELECT l.*,
       (l.knjizica_vazi_do - CURRENT_DATE)      AS dana_do_isteka,
       CASE
         WHEN NOT l.rukuje_hranom                              THEN 'ne rukuje hranom'
         WHEN l.knjizica_vazi_do IS NULL                       THEN 'nema podatka'
         WHEN l.knjizica_vazi_do <  CURRENT_DATE               THEN 'istekla'
         WHEN l.knjizica_vazi_do <= CURRENT_DATE + 30          THEN 'ističe'
         ELSE 'važi'
       END                                       AS stanje_knjizice,
       EXISTS (SELECT 1 FROM korisnik k WHERE k.lice_id = l.id AND k.aktivan)
                                                 AS ima_nalog
FROM lice l
WHERE l.aktivan;
