/**
 * PRIJAVA I ULOGE
 *
 * Lozinke se čuvaju kao scrypt heš — ugrađen u Node, bez dodatnih paketa.
 * Sesija je nasumičan token u httpOnly kolačiću; u bazi stoji samo njegov heš,
 * pa ni pristup bazi ne daje tuđu sesiju.
 *
 * ADMIN_TOKEN i dalje radi kao glavni ključ izvođača — da se ne zaključaš
 * napolje ako nešto pođe naopako sa korisnicima.
 */
import crypto from 'node:crypto';
import { upit } from './db.js';

const TRAJANJE_SATI = 12;

/* ------------------------------------------------------------ lozinke */
export function hesirajLozinku(lozinka) {
  const so = crypto.randomBytes(16);
  const kljuc = crypto.scryptSync(lozinka, so, 64);
  return `scrypt$${so.toString('base64')}$${kljuc.toString('base64')}`;
}

export function proveriLozinku(lozinka, hash) {
  try {
    const [alg, soB64, kljucB64] = String(hash).split('$');
    if (alg !== 'scrypt') return false;
    const kljuc = Buffer.from(kljucB64, 'base64');
    const nov = crypto.scryptSync(lozinka, Buffer.from(soB64, 'base64'), kljuc.length);
    return crypto.timingSafeEqual(kljuc, nov);
  } catch { return false; }
}

/* ------------------------------------------------------------ sesije */
const hesTokena = t => crypto.createHash('sha256').update(t).digest('hex');

export async function napraviSesiju(korisnikId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await upit(
    `INSERT INTO sesija_korisnika (korisnik_id, token_hash, istice)
     VALUES ($1, $2, now() + ($3 || ' hours')::interval)`,
    [korisnikId, hesTokena(token), TRAJANJE_SATI]);
  await upit(`DELETE FROM sesija_korisnika WHERE istice < now()`);
  return token;
}

export async function nadjiSesiju(token) {
  if (!token) return null;
  const { rows: [r] } = await upit(
    `SELECT k.id, k.email, k.ime, k.uloga, k.firma_id, k.mora_promeniti
       FROM sesija_korisnika s JOIN korisnik k ON k.id = s.korisnik_id
      WHERE s.token_hash = $1 AND s.istice > now() AND k.aktivan`,
    [hesTokena(token)]);
  return r || null;
}

export const obrisiSesiju = token =>
  upit(`DELETE FROM sesija_korisnika WHERE token_hash = $1`, [hesTokena(token)]);

/* ------------------------------------------------------------ čuvar */
function citajKolacic(req, ime) {
  const c = req.headers.cookie || '';
  const m = c.match(new RegExp('(?:^|; )' + ime + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * dozvoli('izvodjac','bzr') — propušta samo te uloge.
 * Glavni ključ izvođača (ADMIN_TOKEN) uvek prolazi.
 */
export function dozvoli(...uloge) {
  return async (req, res, next) => {
    try {
      // Token SAMO iz zaglavlja. Ranije se primao i kao ?token= u adresi,
      // pa je završavao u istoriji pregledača i u logovima Rendera i proxyja.
      // Ko ga tamo pročita, ima pun pristup kao izvođač.
      const glavni = req.get('x-admin-token');
      if (glavni && process.env.ADMIN_TOKEN &&
          glavni.length === process.env.ADMIN_TOKEN.length &&
          crypto.timingSafeEqual(Buffer.from(glavni), Buffer.from(process.env.ADMIN_TOKEN))) {
        req.korisnik = { ime: 'izvođač', uloga: 'izvodjac', glavniKljuc: true };
        return next();
      }
      const k = await nadjiSesiju(citajKolacic(req, 'sesija'));
      if (!k) return res.status(401).json({ greska: 'Niste prijavljeni.' });
      if (!uloge.includes(k.uloga))
        return res.status(403).json({
          greska: `Vaša uloga (${k.uloga}) nema pristup ovom delu.` });
      req.korisnik = k;
      next();
    } catch (e) { res.status(500).json({ greska: e.message }); }
  };
}

export const kolacicSesije = (token, sigurno) =>
  `sesija=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${TRAJANJE_SATI * 3600}` +
  (sigurno ? '; Secure' : '');
