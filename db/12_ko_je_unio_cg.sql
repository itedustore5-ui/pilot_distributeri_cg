-- 12_ko_je_unio_cg.sql — ko je zapis STVARNO unio, nezavisno od otkucanog imena
--
-- Problem: `izvrsilac` je slobodan tekst. Isti čovjek jednom upiše „M-01",
-- drugi put „Nikola", treći put „N.P." — pa mu „Moja tabla" pokazuje manje
-- nego što je radio, a odgovorno lice ne može pouzdano reći ko stoji iza zapisa.
--
-- Rješenje: `izvrsilac` ostaje ono što jeste — KO JE OBAVIO radnju (može biti
-- i neko ko nema nalog). Uz njega ide `uneo_korisnik_id` — nalog sa kojeg je
-- zapis poslat. To upisuje server iz sesije i pregledač na to ne utiče.
--
-- Stari zapisi ostaju sa NULL — ne izmišlja se ko ih je unio.
--
-- Ne dira podatke. Bezbjedno na živoj bazi. Pokreće se poslije 11.

ALTER TABLE zapis
  ADD COLUMN IF NOT EXISTS uneo_korisnik_id INT REFERENCES korisnik(id) ON DELETE SET NULL;
ALTER TABLE prijem
  ADD COLUMN IF NOT EXISTS uneo_korisnik_id INT REFERENCES korisnik(id) ON DELETE SET NULL;
ALTER TABLE isporuka
  ADD COLUMN IF NOT EXISTS uneo_korisnik_id INT REFERENCES korisnik(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS zapis_uneo    ON zapis    (uneo_korisnik_id, datum);
CREATE INDEX IF NOT EXISTS prijem_uneo   ON prijem   (uneo_korisnik_id, datum);
CREATE INDEX IF NOT EXISTS isporuka_uneo ON isporuka (uneo_korisnik_id, datum);

COMMENT ON COLUMN zapis.uneo_korisnik_id IS
  'Nalog sa kojeg je zapis poslat. Upisuje server iz sesije — pregledač ne može '
  'da ga postavi. `izvrsilac` je ko je radnju obavio i to može biti drugo lice.';
