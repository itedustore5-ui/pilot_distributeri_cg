-- 06b_uloga_operater_cg.sql — vrijednost `operater` u tipu uloga_t
--
-- Ovo je dio `06_ispravke_cg.sql` koji najčešće NE prođe kad se 06 lijepi
-- odjednom u Supabase SQL Editor: `ALTER TYPE ... ADD VALUE` mora biti
-- SAMOSTALNA naredba. Ostatak fajla (kolone `ispravlja_id` i ostalo) prođe,
-- enum vrijednost ne, pa poslije puca:
--
--     invalid input value for enum uloga_t: "operater"
--
-- Zato stoji kao zaseban fajl — da ga `alati/dopune.mjs` pokrene sam.
-- Isti razlog kao kod 13 (`vozac`).

ALTER TYPE uloga_t ADD VALUE IF NOT EXISTS 'operater';
