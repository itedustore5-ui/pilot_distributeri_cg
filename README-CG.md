# pilot_distributeri_cg — HACCP za distributere hrane, Crna Gora

Nadogradnja na postojeću aplikaciju (`hoteli-pilot` / `pilot_firme` / `pilot_hoteli`).
**Kod postojeće aplikacije se ne prepisuje** — dodaju se novi fajlovi i dvije linije u
`server/index.js`.

---

## Šta je ovdje drugačije nego u srpskoj verziji

| | Srbija | Crna Gora |
|---|---|---|
| Nosivi propis | Zakon o BZR, Pravilnik o evidencijama | **Zakon o bezbjednosti hrane, „Sl. list CG" 59/2026** |
| Izlazni dokument | Obrazac 6 | **Prilog 13, Prilog 14, potvrda o osposobljenosti** |
| Ko nadzire | inspekcija rada | **UBH i sanitarna inspekcija** |
| Šta se prodaje | mjerenje znanja poslije obuke | **cio DHP/HACCP sistem, obuka je jedan dio** |
| Jezik | ekavica | **ijekavica** |

**Obrazac 6 se u Crnoj Gori ne koristi.** Detalji u `PRAVNI-OSNOV-CG.md`.

---

## Instalacija

### 1. Napravi kopiju postojeće aplikacije

```powershell
# Windows PowerShell, iz C:\masaze
Copy-Item -Recurse hoteli-pilot pilot_distributeri_cg
```

Zatim prekopiraj fajlove iz ovog paketa **preko** kopije, zadržavajući strukturu foldera.

### 2. Šta se dodaje

```
db/04_zapisi_cg.sql             tabele i pogledi za DHP/HACCP zapise      NOVO
db/banka_distributeri_cg.json   banka pitanja za distribuciju             NOVO
db/_gradi_banku.py              generator banke (ne ide u produkciju)     NOVO
server/zapisi.js                API za zapise, sledljivost i spremnost    NOVO
public/obrasci-cg.json          definicije obrazaca — ovdje se mijenja    NOVO
public/zapisi.html              dnevni unos (telefon/tablet)              NOVO
public/sledljivost.html         pretraga lota i povlačenje                NOVO
public/prilozi.html             štampa priloga i potvrda                  NOVO
dokumenti/                      HACCP plan, ponuda, cjenovnik             NOVO
seo/                            landing strana i plan vidljivosti         NOVO
test_pravila.mjs                provjera pravila odstupanja               NOVO
PRAVNI-OSNOV-CG.md              referentni propisi sa brojevima           NOVO
```

`public/obrazac6.html` **ostaje na disku ali se ne koristi** za crnogorske klijente.
Ne briši ga — isti kod opslužuje i srpske klijente.

### 3. Dvije linije u `server/index.js`

Uz ostale `import` naredbe na vrhu:

```js
import { zapisiRuter } from './zapisi.js';
```

Odmah poslije `app.use(express.json());`:

```js
app.use(zapisiRuter);
```

To je sve. Nijedna postojeća ruta se ne dira.

### 4. Baza

```bash
psql "$DATABASE_URL" -f db/01_schema.sql      # postojeće, ako je svježa baza
psql "$DATABASE_URL" -f db/00_sifre.sql
psql "$DATABASE_URL" -f db/02_pogledi.sql
psql "$DATABASE_URL" -f db/03_analiza.sql
psql "$DATABASE_URL" -f db/04_zapisi_cg.sql   # NOVO — mora poslije 01_schema.sql
```

Pa banka pitanja:

```bash
node db/seed.js --svez banka_distributeri_cg.json
```

> `04_zapisi_cg.sql` na početku radi `DROP TABLE` nad svojim tabelama. Na bazi koja već
> ima zapise **to briše zapise** — pokreni ga samo pri prvom postavljanju ili ručno
> izdvoji `ALTER`/`CREATE` dio.

### 5. Uloga `operater`

Nova uloga za magacionere i vozače: unosi zapise, ne mijenja ih, vidi samo današnji i
jučerašnji dan, ne vidi izvještaje. Dodaje se kroz `04_zapisi_cg.sql`, korisnik se pravi
postojećim putem (`/api/korisnici`, uloga `operater`).

---

## Stranice

| Adresa | Za koga | Uređaj |
|---|---|---|
| `/zapisi.html` | magacioner, vozač, kontrolor prijema | **telefon** |
| `/sledljivost.html` | odgovorno lice, konsultant | računar |
| `/prilozi.html` | odgovorno lice, konsultant | računar + štampač |
| `/admin.html` | konsultant | računar |
| `/` | zaposleni koji radi provjeru znanja | tablet |

---

## Kako se dodaje novi obrazac

Nema migracije baze. Otvori `public/obrasci-cg.json` i dodaj blok:

```json
{
  "oznaka": "D6",
  "naziv": "Kontrola prijema povrata",
  "osnov": "PRP-9",
  "ucestalost": "po događaju",
  "ko": "magacioner",
  "polja": [
    { "id": "kupac", "naziv": "Kupac", "tip": "tekst", "kljucno": true },
    { "id": "stanje", "naziv": "Stanje robe", "tip": "izbor",
      "opcije": ["ispravno", "neispravno"], "kljucno": true }
  ],
  "odstupanje_kad": "stanje == 'neispravno'"
}
```

Obrazac se odmah pojavi u `/zapisi.html` i u padajućem meniju na `/prilozi.html`.

**Tipovi polja:** `tekst · broj · temp · datum · vrijeme · izbor · da_ne`
**Operatori u pravilu:** `== != < <= > >=`, veznici `||` i `&&`. Desna strana može biti
broj, niska u jednostrukim navodnicima, `true`/`false`, ili **ime drugog polja**.

Poslije izmjene:

```bash
node test_pravila.mjs
```

Test hvata pravilo koje koristi nepostojeće polje — to je greška koja se inače ne primijeti
mjesecima, jer se obrazac tiho nikad ne prijavi kao odstupanje.

---

## Pravila koja kod sprovodi, a ne samo preporučuje

| Pravilo | Gdje |
|---|---|
| Odstupanje bez korektivne mjere se **ne može snimiti** | `CHECK` u bazi + provjera u API-ju + provjera u pregledaču |
| Zapis se **ne briše** — ispravka je novi zapis sa `ispravlja_id` | nema `DELETE` rute |
| Prijem **bez broja serije** se odbija | `zapisi.js`, `/api/cg/prijem` |
| Kupac **bez telefona** se ne upisuje | `zapisi.js`, `/api/cg/kupci` |
| Automatska ocjena odstupanja **samo za potvrđene granice** | `artikal.granica_potvrdio` |
| Operater vidi samo posljednja dva dana | `ogranicenje()` u `zapisi.js` |

Posljednje dvoje je namjerno neugodno. Granica koju klijent nije potvrdio iz deklaracije
je tvoja pretpostavka, a ne njegov podatak — i ako po njoj automatski proglasiš odstupanje,
branićeš tuđu grešku. Operater koji može da „uskladi" zapis od prije tri sedmice pravi
dokumentaciju koja ne vrijedi ništa.

---

## Ekran spremnosti

`GET /api/cg/spremnost` vraća listu nalaza prije nego što ih nađe inspektor:

- dani bez obaveznog zapisa u posljednjih 30 dana
- odstupanja bez korektivne mjere
- artikli bez potvrđene kritične granice
- dobavljači van liste odobrenih
- kupci bez telefona
- vježba povlačenja starija od godinu dana ili nikad izvedena

Ovo je ekran koji se pokazuje klijentu na mjesečnom pregledu. **To je ono za šta plaća
pretplatu.**

---

## Provjera prije isporuke

```bash
node test_pravila.mjs        # pravila odstupanja po obrascima
python3 db/_gradi_banku.py   # banka: 22 porodice, 70 pitanja, 6 tema
node test_simulacija.mjs     # postojeći test mjerenja znanja
node test_uloge.mjs          # ko šta smije da vidi
```

---

## Za sljedećeg klijenta

Mijenjaju se **dva fajla**:

1. `db/banka_distributeri_cg.json` — naziv firme, radna mjesta, brojke iz HACCP plana
2. `public/obrasci-cg.json` — samo ako klijent ima obrazac koji ovdje ne postoji

Pa `node db/seed.js --svez banka_distributeri_cg.json`. **Kod se ne dira.**

Prije prvog mjerenja: pošalji klijentu spisak stavki sa `"zahteva_potvrdu": true` i traži
da označi ono što se kod njega ne slaže. Dok ne potvrdi, te stavke se ne serviraju.
