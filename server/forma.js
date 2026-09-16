/**
 * GENERISANJE FORME
 *
 * Ovo NIJE nasumičan izbor. Nasumičnost bi razbila uporedivost merenja.
 *
 * Pravila:
 *  1. Forma prati redosled pozicija iz nacrta — svaka pozicija je ista tema
 *     i isti kognitivni nivo u svim talasima. Zato su forme paralelne.
 *  2. Sidrena pozicija servira uvek istu stavku, u sva četiri talasa.
 *     Bez sidra ne možeš da razlikuješ pad znanja od razlike u težini forme.
 *  3. Rotaciona pozicija bira varijantu po formuli
 *        (talas.redni - 1 + pomak(sifra)) % broj_varijanti
 *     Uz 4 varijante i 4 talasa, svaki učesnik vidi svaku varijantu tačno
 *     jednom — nikada isto pitanje dvaput.
 *  4. Redosled opcija se meša determinističkim seedom, da položaj tačnog
 *     odgovora ne postane trag, a da forma i dalje bude ponovljiva.
 */

// Mali deterministički heš (FNV-1a). Isti ulaz -> uvek isti izlaz.
function hes(tekst) {
  let h = 0x811c9dc5;
  for (let i = 0; i < tekst.length; i++) {
    h ^= tekst.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// Deterministički generator pseudoslučajnih brojeva (mulberry32).
function generator(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function promesaj(niz, seed) {
  const kopija = [...niz];
  const rnd = generator(seed);
  for (let i = kopija.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [kopija[i], kopija[j]] = [kopija[j], kopija[i]];
  }
  return kopija;
}

/**
 * @param {object} k        aktivni klijent iz pool-a (unutar transakcije)
 * @param {number} nacrtId
 * @param {number} talasRedni  1..4
 * @param {string} sifra       šifra učesnika
 * @returns {Array} lista {redni_broj, pozicija_id, stavka_id, tekst, opcije[]}
 *                  BEZ podatka o tome koja je opcija tačna.
 */
export async function generisiFormu(k, nacrtId, talasRedni, sifra) {
  const { rows: pozicije } = await k.query(
    `SELECT np.id AS pozicija_id, np.redni_broj, np.tip, np.porodica_id
       FROM nacrt_pozicija np
      WHERE np.nacrt_id = $1
      ORDER BY np.redni_broj`,
    [nacrtId]
  );

  if (pozicije.length === 0) throw new Error('Nacrt nema nijednu poziciju.');

  const pomak = hes(sifra);
  const forma = [];

  for (const p of pozicije) {
    // Aktivne stavke te porodice. Stavka koja čeka potvrdu klijenta se NE servira.
    const { rows: stavke } = await k.query(
      `SELECT id, varijanta, tekst
         FROM stavka
        WHERE porodica_id = $1
          AND aktivna
          AND (NOT zahteva_potvrdu OR potvrdio IS NOT NULL)
        ORDER BY varijanta`,
      [p.porodica_id]
    );

    if (stavke.length === 0) {
      throw new Error(
        `Porodica #${p.porodica_id} nema nijednu upotrebljivu stavku. ` +
        `Najverovatnije čeka potvrdu klijenta (zahteva_potvrdu = true).`
      );
    }

    const indeks = p.tip === 'sidro'
      ? 0
      : (talasRedni - 1 + pomak) % stavke.length;
    const stavka = stavke[indeks];

    const { rows: opcije } = await k.query(
      `SELECT id, tekst FROM opcija WHERE stavka_id = $1 ORDER BY redosled`,
      [stavka.id]
    );

    const promesane = promesaj(opcije, hes(`${sifra}|${stavka.id}|${talasRedni}`));

    forma.push({
      redni_broj: p.redni_broj,
      pozicija_id: p.pozicija_id,
      stavka_id: stavka.id,
      tekst: stavka.tekst,
      opcije: promesane.map(o => ({ id: o.id, tekst: o.tekst })), // bez `tacna`
    });
  }

  return forma;
}
