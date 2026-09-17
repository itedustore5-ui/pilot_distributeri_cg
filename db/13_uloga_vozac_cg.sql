-- 13_uloga_vozac_cg.sql — vozač kao zasebna uloga
--
-- Do sada je `operater` pokrivao i magacin i prevoz. Kod firme sa tri čovjeka
-- to je u redu. Kod firme sa deset vozača nije: svako od njih može upisati
-- isporuku za tuđu turu, a zapis prestaje da kaže ko je stvarno vozio.
--
-- `operater` se NE mijenja i ostaje kako jeste — magacin koji prima robu,
-- vodi dnevne zapise i po potrebi utovara. `vozac` je UŽA uloga: samo
-- isporuka i kontrola vozila prije utovara.
--
-- Firma u kojoj isti čovjek i prima i vozi i dalje koristi `operater` —
-- podjela se uvodi tek kad zatreba, ne po pravilu.
--
-- ALTER TYPE ... ADD VALUE mora biti SAMOSTALNA naredba (ne unutar
-- transakcije sa drugim naredbama) — inače PostgreSQL odbija.

ALTER TYPE uloga_t ADD VALUE IF NOT EXISTS 'vozac';
