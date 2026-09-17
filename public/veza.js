/* =====================================================================
   veza.js — zajednički sloj za sve ekrane
   Uključuje se PRIJE ostalog koda:  <script src="/veza.js"></script>

   ZAŠTO POSTOJI
   Ranije je svaka stranica imala svoju kopiju `api()` i svaka je radila
   ovo:

       try { JA = await api('/api/ja'); }
       catch { location.href = '/prijava.html'; }

   To znači: čim mreža zatreperi — a u hladnjači i magacinu treperi —
   magacioner završi na ekranu za prijavu. Ukuca lozinku, ne prođe,
   i zaključi da mu je nalog pokvaren. Aplikacija je za njega mrtva.

   Ovdje se razdvaja troje, jer to nije ista stvar:
     · pao je signal        → traka dolje, podaci ostaju, samo se čeka
     · istekla je sesija    → tek TADA ide prijava
     · uloga nema pristup   → poruka, bez prijave

   Kad se veza vrati, stranica se sama osvježi. Čovjek ne mora ništa.
   ===================================================================== */

/* ---------------------------------------------------------------- datum
   toISOString() daje UTC. Poslije 22h (ljeti 23h) po našem vremenu to je
   već sjutrašnji dan — magacioner koji utovara u 22:30 dobio bi datum
   sjutra, a server bi ga odbio kao „datum u budućnosti". Zato lokalno. */
function lokalniDatum(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
       + `-${String(d.getDate()).padStart(2, '0')}`;
}
function danas() { return lokalniDatum(new Date()); }

/* Padež uz broj: 1 dan · 2 dana · 5 dana. */
function pade(n, jedan, dva, pet) {
  const d = n % 10, dd = n % 100;
  if (dd >= 11 && dd <= 14) return `${n} ${pet}`;
  if (d === 1) return `${n} ${jedan}`;
  if (d >= 2 && d <= 4) return `${n} ${dva}`;
  return `${n} ${pet}`;
}

/* ------------------------------------------------------------ traka veze */
let _traka = null, _cekanje = null;

function _napraviTraku() {
  if (_traka) return _traka;
  const t = document.createElement('div');
  t.id = 'trakaVeze';
  t.setAttribute('role', 'status');
  t.style.cssText = [
    'position:fixed', 'left:0', 'right:0', 'bottom:0', 'z-index:9999',
    'background:#96161B', 'color:#fff', 'padding:13px 16px',
    'font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif',
    'font-size:14px', 'line-height:1.45', 'display:none',
    'box-shadow:0 -2px 12px rgba(0,0,0,.25)',
  ].join(';');
  document.body.appendChild(t);
  _traka = t;
  return t;
}

/**
 * Prikaži ili sakrij traku „nema veze".
 * Dok je prikazana, na svakih 5 sekundi se tiho provjerava server;
 * čim odgovori, stranica se sama osvježi.
 */
function bezVeze(nema, poruka) {
  const t = _napraviTraku();
  if (!nema) {
    t.style.display = 'none';
    if (_cekanje) { clearInterval(_cekanje); _cekanje = null; }
    return;
  }
  t.textContent = poruka
    || 'Nema veze sa serverom. Ništa nije izgubljeno — ono što si upisao ostaje na ekranu. '
     + 'Čim se veza vrati, stranica se sama osvježava.';
  t.style.display = 'block';
  if (_cekanje) return;
  _cekanje = setInterval(async () => {
    try {
      const r = await fetch('/api/ja', { credentials: 'same-origin', cache: 'no-store' });
      if (r.ok || r.status === 401) location.reload();
    } catch { /* još nema veze, čekamo dalje */ }
  }, 5000);
}

window.addEventListener('offline', () => bezVeze(true,
  'Uređaj je bez mreže. Zapis se ne može poslati dok se veza ne vrati.'));
window.addEventListener('online', () => bezVeze(false));

/* ------------------------------------------------------------------ api */
/**
 * Poziv serveru. Greške su razvrstane:
 *   e.veza    — nije bilo moguće doći do servera (mreža)
 *   e.prijava — 401, sesija je istekla ili nije uspostavljena
 *   e.uloga   — 403, uloga nema pristup
 * Sve ostalo je obična greška sa porukom sa servera.
 */
async function api(put, opcije = {}) {
  let r;
  try {
    r = await fetch(put, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      ...opcije,
    });
  } catch {
    bezVeze(true);
    const e = new Error('Nema veze sa serverom. Ništa nije poslato — '
      + 'ono što si upisao ostaje na ekranu, pokušaj ponovo kad se veza vrati.');
    e.veza = true;
    throw e;
  }
  bezVeze(false);
  const t = await r.json().catch(() => ({}));
  if (r.ok) return t;

  if (r.status === 401) {
    const e = new Error('Sesija je istekla. Prijavi se ponovo.');
    e.prijava = true; throw e;
  }
  if (r.status === 403) {
    const e = new Error(t.greska || 'Tvoja uloga nema pristup ovom dijelu.');
    e.uloga = true; throw e;
  }
  if (r.status >= 500) {
    const e = new Error('Server je javio grešku. Ako se ponovi, javi konsultantu. '
      + (t.greska ? `(${t.greska})` : ''));
    e.server = true; throw e;
  }
  throw new Error(t.greska || `Greška ${r.status}`);
}

/* ------------------------------------------------------- ko je prijavljen
   Vraća korisnika, ili null ako se ne može nastaviti.
   Na 401 vodi na prijavu. Na pad mreže OSTAJE na stranici i čeka. */
/* Kako se uloga zove čovjeku, a ne bazi. */
const IME_ULOGE = {
  izvodjac: 'konsultant',
  bzr: 'odgovorno lice za bezbjednost hrane',
  uprava: 'direktor',
  operater: 'magacin i prevoz',
};

async function ucitajJa() {
  try {
    const ja = await api('/api/ja');
    const e = document.querySelector('#koSam');
    if (e) e.textContent = ja.ime
      ? `${ja.ime} · ${IME_ULOGE[ja.uloga] || ja.uloga}` : '';
    dodajOdjavu();
    return ja;
  } catch (e) {
    if (e.prijava) { location.href = '/prijava.html'; return null; }
    bezVeze(true);
    return null;
  }
}

/* --------------------------------------------------------------- odjava
   Svaka uloga mora moći da se odjavi — magacioner najviše od svih, jer
   telefon u magacinu dijeli smjena. Dodaje se ovdje, na jednom mjestu,
   da se ne zaboravi ni na jednoj stranici. */
function dodajOdjavu() {
  const nav = document.querySelector('.nav');
  if (!nav || nav.querySelector('.odjava')) return;
  nav.append(
    el_('a', 'lozinka', 'promijeni lozinku', promijeniLozinku),
    el_('a', 'odjava', 'odjava', odjava));
}

function el_(tag, klasa, tekst, radnja) {
  const a = document.createElement(tag);
  a.className = klasa;
  a.href = '#';
  a.textContent = tekst;
  a.style.marginLeft = klasa === 'lozinka' ? 'auto' : '';
  a.addEventListener('click', ev => { ev.preventDefault(); radnja(); });
  return a;
}

async function odjava() {
  try { await fetch('/api/odjava', { method: 'POST', credentials: 'same-origin' }); }
  catch { /* i ako server ne odgovori, vodi na prijavu */ }
  location.href = '/prijava.html';
}

async function promijeniLozinku() {
  const nova = prompt('Nova lozinka — najmanje 10 znakova:');
  if (nova === null) return;
  if (String(nova).length < 10) { alert('Lozinka mora imati bar 10 znakova.'); return; }
  try {
    await api('/api/lozinka', { method: 'POST', body: JSON.stringify({ nova }) });
    alert('Lozinka je promijenjena. Sljedeći put se prijavljuješ novom.');
  } catch (e) { alert('Nije promijenjeno: ' + e.message); }
}

/* Operater ne otvara podešavanje, sledljivost ni izvoz — te krajnje tačke
   su za odgovorno lice i konsultanta. Bez ovoga bi kliknuo, dobio 403 i
   mislio da je aplikacija pokvarena. */
function sakrijNedozvoljeno(ja) {
  // Konsultantska komandna tabla — nikom osim izvođaču. Odgovorno lice tamo
  // vidi banku pitanja i podešavanja koja nisu njegov posao.
  // `data-samo="konsultant"` stoji i na vezama u meniju i na napomenama koje su
  // pisane tebi, a ne klijentu — zato se gleda cio dokument, ne samo meni.
  if (ja?.uloga !== 'izvodjac')
    document.querySelectorAll('[data-samo="konsultant"]').forEach(a => a.remove());
  if (ja?.uloga !== 'operater') return;
  document.querySelectorAll('.nav a[data-samo="vodi"]').forEach(a => a.remove());
}
