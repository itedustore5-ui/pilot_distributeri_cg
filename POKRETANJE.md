# Pokretanje — korak po korak

Od praznog foldera do žive aplikacije na internetu. Svaki korak ima **provjeru**: ako
vidiš ono što piše, idi dalje; ako ne vidiš, ispod je uzrok.

Sve komande su isprobane na Postgresu 16 i Node 22.

---

# Svakodnevno: jedna komanda

Kad je sve jednom podešeno, pokretanje je ovo i ništa više:

```powershell
cd C:\masaze\pilot_distributeri_cg
.\POKRENI.ps1
```

Skripta prije pokretanja provjeri sve što je ikad zapelo — node, pakete, `.env`,
vezu sa bazom, da li su SQL dopune primijenjene i postoji li ijedan nalog — pa
**kaže tačno šta fali ako nešto fali.** Zatim pokrene server i sama otvori
pregledač.

Ako Windows odbije da pokrene skriptu, jednom:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

**Da bekap i dnevna provjera rade sami**, jednom:

```powershell
.\alati\zakazi.ps1
```

Upisuje dva posla u Task Scheduler — dnevnu provjeru u 08:00 i sedmični bekap
ponedjeljkom u 07:30. Skidanje: `.\alati\zakazi.ps1 -Ukloni`.

Ostatak ovog uputstva je za **prvo postavljanje** i za novog klijenta.

---

# Prvo — jedna stvar koja mora biti jasna

**Praviš DVIJE instalacije, ne jednu.**

| | DEMO | KLIJENT |
|---|---|---|
| Čemu služi | prodaji — pokazuješ je svima | pravom radu jedne firme |
| Podaci | izmišljeni, označeni sa „DEMO" | pravi podaci te firme |
| Baza | jedna, zauvijek ista | **posebna baza po klijentu** |
| Ko ima nalog | samo ti | ti + odgovorno lice + magacioneri |
| Kad se briše | nikad | po isteku ugovora, po dogovoru |

Ako pokažeš sljedećem kupcu aplikaciju u kojoj su podaci prethodnog klijenta, gotova si —
i poslovno i pravno. **Zato prvo napravi demo, i nikad ga ne koristi za pravi rad.**

Pravilo se ne krši ni „samo ovaj put za probu".

---

# DIO 1 — Demo instalacija

Ovo radiš jednom. Poslije toga je uvijek živa i uvijek spremna za sastanak.

## Korak 1.1 — Napravi folder

Na svom računaru, u `C:\masaze`:

```powershell
Copy-Item -Recurse hoteli-pilot pilot_distributeri_cg
```

Pa prekopiraj **preko** te kopije sve fajlove iz paketa `pilot_distributeri_cg`
(db, server, public, dokumenti, seo…), zadržavajući strukturu foldera.

**Provjera:** u folderu postoje i `db/01_schema.sql` i `db/04_zapisi_cg.sql`.
Ako nema `01_schema.sql`, kopirao se samo novi paket — vrati se na `Copy-Item`.

## Korak 1.2 — Dodaj dvije linije u kod

Otvori `server/index.js`. Na vrhu, među ostalim `import` linijama, dodaj:

```js
import { zapisiRuter } from './zapisi.js';
```

Malo niže, **odmah ispod** linije `app.use(express.json());`, dodaj:

```js
app.use(zapisiRuter);
```

To je jedina izmjena postojećeg koda. Ništa drugo ne diraš.

**Provjera:** u fajlu se riječ `zapisiRuter` pojavljuje tačno dva puta.

## Korak 1.3 — Instaliraj zavisnosti

U folderu, otvori terminal (u Exploreru: Shift + desni klik → *Otvori PowerShell ovdje*):

```bash
npm install
```

**Provjera:** pojavio se folder `node_modules` i nema crvenog `ERR!`.
Ako nema `npm` — instaliraj Node.js 20 ili noviji sa nodejs.org, pa ponovo.

## Korak 1.4 — Napravi bazu na Supabase

1. Idi na `supabase.com`, napravi besplatan nalog.
2. **New project.** Ime: `demo-distributeri-cg`. Region: **Frankfurt (eu-central-1)**.
3. Lozinku baze **zapiši odmah** — kasnije se ne može vidjeti, samo resetovati.
4. Sačekaj 2–3 minuta da se projekat napravi.
5. Gore desno **Connect** → kartica **Session pooler** → kopiraj cio niz.

> **Obavezno Session pooler, port 5432.** Ne Direct connection.
> Prepoznaješ ga po `pooler.supabase.com` u adresi i po korisniku oblika
> `postgres.nekislucajniniz`. Direct connection radi samo preko IPv6 i Render ga ne
> dohvata — to je najčešća greška pri prvom postavljanju.

6. U kopiranom nizu zamijeni `[YOUR-PASSWORD]` lozinkom iz tačke 3.

## Korak 1.5 — Napravi `.env`

U folderu napravi fajl `.env` (tačno tako, sa tačkom na početku) i upiši:

```
DATABASE_URL=ovdje-nalijepi-niz-iz-koraka-1.4
ADMIN_TOKEN=ovdje-nalijepi-nasumican-niz
PORT=3000
```

Nasumičan niz za `ADMIN_TOKEN` napravi ovako:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

**Provjera:** `ADMIN_TOKEN` ima najmanje 32 znaka. Ako je kraći, aplikacija se neće ni
pokrenuti — namjerno.

> `.env` **nikada** ne ide na GitHub. U `.gitignore` već stoji.

## Korak 1.6 — Napravi tabele

Pet fajlova, **tačno ovim redom**.

> **Pazi — lijepi SADRŽAJ fajla, ne njegovo ime.** Ako u Supabase nalijepiš `db/01_schema.sql`,
> dobićeš `ERROR: syntax error at or near "db"`. Supabase ne zna gdje ti je fajl na disku;
> mora dobiti tekst iz njega.
>
> Najbrže, u PowerShellu u folderu aplikacije:
>
> ```powershell
> Get-Content db\01_schema.sql -Raw -Encoding UTF8 | Set-Clipboard
> ```
>
> Time je cio fajl u klipbordu. Pa u Supabase: **SQL Editor** → **New query** → **Ctrl+V** → **Run**.
> Isto ponovi za svaki sljedeći fajl, mijenjajući samo ime.
>
> **Provjera prije Run:** prvi red u editoru počinje sa `-- ====`, nikad sa `db/`.

| Red | Fajl | Šta pravi |
|:-:|---|---|
| 1 | `db/01_schema.sql` | osnovne tabele — firma, obuke, provjere znanja |
| 2 | `db/00_sifre.sql` | šifarnici |
| 3 | `db/02_pogledi.sql` | osnovni izvještaji |
| 4 | `db/03_analiza.sql` | analiza pitanja i evidencije |
| 5 | `db/04_zapisi_cg.sql` | **crnogorski dio** — zapisi, sledljivost, prijem, isporuka |
| 6 | `db/06_ispravke_cg.sql` | ispravke zapisa, trag ispravki, uloga `operater` |
| 7 | `db/07_dopune_cg.sql` | oznaka naknadnog unosa, pogledi za izvoz, dnevni pregled |


### Šta koji fajl pravi — i zašto se nijedan ne može preskočiti

Redoslijed nije proizvoljan. Svaki sljedeći fajl se oslanja na prethodni.

| Fajl | Šta pravi | Ako ga preskočiš |
|---|---|---|
| `01_schema.sql` | **22 tabele.** Tri grupe: (1) `firma` i `korisnik` — firma i nalozi za prijavu; (2) `obuka`, `prisustvo`, `ucesnik` — održane obuke i ko je bio; (3) `program`, `tema`, `stavka`, `sesija`, `odgovor` — pitanja i provjera znanja | **ništa dalje ne radi.** `04` ima vezu na tabelu `firma` i neće se ni instalirati. Bez `korisnik` se ne možeš ni prijaviti |
| `00_sifre.sql` | Popunjava dvije tabele koje je `01` napravio: šifre razloga obuke (01–10) i šifre opasnosti na radnom mjestu (01–40) | učitavanje banke pitanja pukne — radna mjesta u `banka_distributeri_cg.json` koriste šifre opasnosti `01, 03, 05, 15, 20, 25, 30` |
| `02_pogledi.sql` | Osnovni izvještaji o rezultatima provjere znanja | izvještaji o obuci su prazni |
| `03_analiza.sql` | Detaljni izvještaji — **među njima `v_evidencija_osposobljavanja`** | **Prilog 14 i potvrde o osposobljenosti ne rade.** To je pola onoga što prodaješ |
| `04_zapisi_cg.sql` | Crnogorski dio: `zapis`, `prijem`, `isporuka`, `dobavljac`, `kupac`, `vozilo`, `artikal` + sledljivost | nema dnevnih zapisa, nema pretrage serije, nema ekrana spremnosti |
| `06_ispravke_cg.sql` | Ispravka pogrešnog unosa i trag ispravki. Ne dira podatke — samo poglede | pogrešan unos se ne može ispraviti kroz aplikaciju, a **uloga `operater` možda ne postoji**, pa magacioner ne može dobiti nalog |
| `07_dopune_cg.sql` | Oznaka zapisa unesenog naknadno, pogledi za izvoz podataka i za dnevni pregled, zabrana prazne korektivne mjere. Ne dira podatke | ekran **Izvoz** javlja grešku, a `alati/dnevni-pregled.mjs` ne radi. **Ako ikada ponovo pokreneš 06, odmah poslije pokreni i 07** — 06 vraća stariju verziju pogleda `v_sledljivost_nazad` |

### „Šta će mi retencija?"

To je treća grupa tabela iz `01_schema.sql` — pitanja, forme, sesije, odgovori. To **nije
višak.** To je mašinerija koja proizvodi:

- **Prilog 13** — godišnji plan obuke
- **Prilog 14** — evidencija prisutnih sa potpisima
- **potvrdu o osposobljenosti** po zaposlenom, sa rezultatom provjere

Bez nje ostaje ti samo temperatura i sledljivost, a **obuka je zakonska obaveza iz člana 35
Zakona o bezbjednosti hrane** i stavka koju naplaćuješ svake godine. Riječ „retencija“ u
komentarima koda znači samo da sistem može da mjeri i **zadržavanje** znanja poslije 30 i
90 dana — to koristiš kod većih klijenata, a kod manjih ne moraš.

### Šifarnici — jedini srpski ostatak

`00_sifre.sql` puni šifre iz **srpskog** Pravilnika o evidencijama BZR. Tehnički su
potrebne (radna mjesta u banci se na njih pozivaju), ali **crnogorskom klijentu se ne
pokazuju i ne štampaju.** One postoje samo da bi opis radnog mjesta imao strukturu.

Ako te klijent ikad pita šta su te šifre — reci da je to interna klasifikacija opasnosti
po radnom mjestu i da nije dio crnogorske dokumentacije. To je tačno.

### Praktično, u Supabase SQL Editoru

- **Jedan fajl = jedan upit.** Otvori `New query`, nalijepi cio sadržaj fajla, `Run`. Pa
  `New query` za sljedeći. Ne lijepi dva fajla u isti prozor.
- Poslije svakog: **`Success. No rows returned`** — to je ispravno. SQL koji pravi tabele
  ne vraća redove.
- Žute poruke tipa `NOTICE: table "..." does not exist, skipping` su **normalne** pri
  prvom pokretanju. Fajlovi prvo pokušaju da obrišu staro, a starog nema.
- **Crvena poruka `ERROR` znači stani.** Ne prelazi na sljedeći fajl dok je ne riješiš —
  sve dalje će pucati zbog nje.
- Zatvori prozor tek kad vidiš rezultat. Supabase ponekad prikaže rezultat sa zakašnjenjem.

**Provjera:** u SQL Editoru pokreni

```sql
SELECT count(*) FROM information_schema.tables
 WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
```

Treba da piše **29**. Ako je manje, jedan od fajlova nije prošao — vrati se i pogledaj
poruku o grešci.

Poslije `06` dobijaš i spisak uloga. U njemu **mora** pisati `operater` — bez te uloge
magacioner ne može dobiti nalog.

> **Već si pustila 01–05 na Supabase?** Onda pokreni samo `06`. On ne dira podatke,
> samo zamjenjuje poglede i dodaje ulogu ako fali. `04` **nemoj ponovo pokretati** —
> on na početku briše tabele.

## Korak 1.7 — Učitaj pitanja za obuku

U terminalu, u folderu:

```bash
node db/seed.js --svez banka_distributeri_cg.json
```

**Provjera:** ispisuje se

```
Teme:      6
Porodice:  22
Stavke:    70
⚠  6 stavki čeka potvrdu klijenta (brojke iz HACCP plana).
```

To upozorenje je **normalno i namjerno**. Šest pitanja sadrži temperature koje zavise od
konkretnog klijenta; dok ih klijent ne potvrdi, aplikacija ih ne postavlja.

> **Sitnica koju ispravi:** `db/seed.js` na kraju ispisuje riječi „Obrazac 6". To je
> srpski ostatak. Otvori `db/seed.js`, nađi taj tekst i zamijeni ga sa
> „provjera osposobljenosti i prilozi". Klijent to ne vidi, ali ti gledaš svaki put.

## Korak 1.8 — Ubaci demo podatke

**Samo za demo instalaciju.** Nikada na bazi klijenta.

Isto kao u koraku 1.6 — **sadržaj fajla**, ne ime:

```powershell
Get-Content db\05_demo_cg.sql -Raw -Encoding UTF8 | Set-Clipboard
```

Pa u Supabase: **New query** → **Ctrl+V** → **Run**.

**Provjera:** na dnu se ispisuje tabela:

```
dobavljači  5
kupci       6
vozila      3
artikli     7
prijemi     6
isporuke    6
zapisi    131
```

U tim podacima je **namjerno** ugrađeno nekoliko nalaza: jedan neodobren dobavljač, jedan
artikal bez potvrđene granice, tri dana bez zapisa o čišćenju i prošlogodišnja vježba
povlačenja. To nije greška — to je ono što pokazuješ na ekranu spremnosti.

## Korak 1.9 — Napravi svoj nalog

```bash
node alati/prvi-korisnik.mjs tvoj@mejl.com "Ime Prezime"
```

**Provjera:** ispisuje se privremena lozinka. **Prepiši je odmah** — vidi se samo jednom.

## Korak 1.10 — Probaj lokalno, prije interneta

```bash
npm start
```

Otvori u pregledaču `http://localhost:3000/prijava.html`, prijavi se, postavi svoju
lozinku. Pa redom:

| Otvori | Treba da vidiš |
|---|---|
| `/sledljivost.html` → upiši `MLJ-2609-A` → Pronađi | 240 primljeno · 186 isporučeno · 54 na zalihama · **5 kupaca sa telefonima** |
| `/zapisi.html` → Prilog P7 → temperatura `8.6`, granica `4` | crvenu traku **„Odstupanje"** i da se ne da snimiti bez korektivne mjere |
| `/prilozi.html` → „Pregled odstupanja" → Pripremi | tabelu sa 6 odstupanja, svako sa korektivnom mjerom |

**Ako sve troje radi, aplikacija je ispravna.** Tek sad je stavljaš na internet.

Ako `/sledljivost.html` kaže da serija nije pronađena — korak 1.8 nije prošao.
Ako se tražilo ponovno prijavljivanje — istekla je sesija, prijavi se opet.

## Korak 1.11 — Objavi na Render

1. Stavi folder na GitHub kao **privatan** repozitorijum.
2. `render.com` → **New** → **Web Service** → poveži taj repozitorijum.

| Polje | Vrijednost |
|---|---|
| Region | **Frankfurt** |
| Build Command | `npm ci` |
| Start Command | `npm start` |
| Health Check Path | `/api/zdravlje` |

3. Pod **Environment** dodaj `DATABASE_URL` i `ADMIN_TOKEN` — iste vrijednosti kao u
   `.env`. **`PORT` ne dodaješ**, Render ga sam postavlja.
4. Create Web Service i sačekaj da build završi.

**Provjera:** otvori `https://tvoja-adresa.onrender.com/api/zdravlje`.
Treba da piše `{"ok":true, ...}`.

Ako piše „Nedostaje DATABASE_URL" — promjenljiva nije sačuvana ili ima razmak na kraju.
Ako se dugo vrti pa pukne — vjerovatno si uzela Direct connection umjesto Session poolera
(korak 1.4).

## Korak 1.12 — Da se demo ne uspava

**Besplatni Render plan gasi aplikaciju poslije 15 minuta nekorišćenja.** Prvi zahtjev
poslije toga čeka oko **50 sekundi**. Pedeset sekundi bijelog ekrana pred direktorom je
gore nego da nisi ni pokazala.

Dvije mogućnosti:

- **Besplatno:** napravi nalog na `uptimerobot.com`, dodaj HTTP monitor na
  `https://tvoja-adresa.onrender.com/api/zdravlje`, interval **5 minuta**.
- **Sigurno:** plati Render Starter plan (oko 7 $ mjesečno). Ne spava uopšte.

> Za demo koji vodi ka poslu od 1.600 € — plati. UptimeRobot povremeno propusti ciklus.
>
> **Bez obzira na sve: dan prije sastanka otvori demo i provjeri da radi.** Jednom.

---

# DIO 2 — Instalacija za klijenta

Ponavljaš dijelove 1.4 do 1.11, sa **četiri razlike**:

| Korak | Razlika |
|---|---|
| 1.4 | **nov Supabase projekat**, ime po klijentu — `kliniti-naziv-firme` |
| 1.8 | **PRESKAČEŠ.** Nikakvi demo podaci. |
| 1.7 | prije pokretanja u `db/banka_distributeri_cg.json` upiši pravi naziv firme, djelatnost i radna mjesta |
| 1.11 | **nov Web Service** na Renderu, svoj `DATABASE_URL` |

Jedan klijent = jedan Supabase projekat + jedan Render servis. Bez izuzetka.

## Korak 2.1 — Podesi klijenta u aplikaciji

Prije prvog dana rada, kroz `/zapisi.html` i komandnu tablu unesi:

1. **Dobavljači** — svi sa kojih prima robu, sa telefonom. Označi ih kao **odobrene**
   kad provjeriš dokumentaciju.
2. **Kupci** — svi, i **telefon je obavezan**. Aplikacija neće primiti kupca bez
   telefona, jer bez telefona povlačenje nije izvodljivo.
3. **Vozila** — registracije, da li imaju rashladu.
4. **Artikli** — sa **kritičnim granicama iz deklaracija proizvođača**.

> **Korak 4 je onaj koji se preskoči, pa se plati.** Dok granica nije potvrđena, aplikacija
> **ne** ocjenjuje odstupanje automatski — namjerno, da ne braniš svoju pretpostavku umjesto
> njegovog podatka. Pošalji klijentu spisak granica, on ih pisano potvrdi, ti upišeš ko je
> potvrdio i kad.

**Provjera:** otvori komandnu tablu i pogledaj ekran spremnosti. Dok ima crvenih nalaza,
podešavanje nije završeno.

## Korak 2.2 — Napravi naloge

| Uloga | Ko | Šta može |
|---|---|---|
| `izvodjac` | ti | sve |
| `bzr` | odgovorno lice u firmi | sve zapise, kontrola, štampa |
| `operater` | magacioneri, vozači | **samo unos**, vidi posljednja dva dana |

Naloge praviš kroz `/admin.html`. Operater namjerno ne vidi stariju istoriju — da se zapis
ne „usklađuje" unazad. To klijentu objasni odmah, prije nego što primijeti sam: **to je
ono što zapis čini vjerodostojnim.**

## Korak 2.3 — Prvi dan rada

Dan koji odlučuje hoće li sistem preživjeti.

- Budi na licu mjesta **ujutru, na prijemu robe.** Ne u kancelariji.
- Prođi sa magacionerom prvi unos temperature, na **njegovom** telefonu.
- Namjerno napravi odstupanje na probnom zapisu i pokaži mu da mora da upiše mjeru.
- Pokaži vozaču kontrolu vozila, prije stvarnog utovara.
- Ostavi papir na vratima komore: *„Temperatura se upisuje u aplikaciju, svaki dan,
  prije 8 h."*

**Provjera poslije prve sedmice:** otvori ekran spremnosti. Ako nema dana bez zapisa,
sistem je zaživio. Ako ima — zovi odmah, ne čekaj mjesečni pregled.

---

# DIO 3 — Da aplikacija ostane živa

## Svakog mjeseca, po klijentu — 1 do 2 sata

1. Otvori **ekran spremnosti**. Zapiši nalaze.
2. `/prilozi.html` → **„Pregled odstupanja"** → Pripremi → Štampaj.
3. Prođi odstupanja: ima li svako korektivnu mjeru i ima li smisla.
4. Pošalji odgovornom licu pisano: šta je nađeno, šta treba uraditi, do kada.
5. Kad on potpiše pregled, upiši ga kao kontrolora.

**To je usluga za koju plaća pretplatu.** Ako je preskočiš dva mjeseca, otkazaće — i biće
u pravu.

## Bekap

Supabase besplatni plan drži dnevni bekap **7 dana**. To nije dovoljno za dokumentaciju
koja se po zakonu čuva godinama.

**Najmanje jednom sedmično, i OBAVEZNO prije svake izmjene baze:**

```powershell
.\alati\bekap.ps1
```

Skripta pravi po jedan `.dump` fajl za svakog klijenta u folder `bekap\`, sa datumom u
imenu, i briše one starije od 90 dana. Objašnjenje šta joj treba (pg_dump) i kako se
bekap vraća stoji u zaglavlju same skripte — otvori je u Notepadu i pročitaj prvih
trideset redova.

**Koje baze gleda:** `alati\klijenti.txt`, po jedan red:

```
Mljekara Nikšić = postgresql://postgres.xxx:lozinka@...pooler...:5432/postgres
Voće Bar        = postgresql://postgres.yyy:lozinka@...pooler...:5432/postgres
```

Taj fajl sadrži lozinke. Nije u gitu i ne smije nikome da se pošalje.

> **Bekap koji nikad nisi vratila nije bekap, nego nada.** Jednom, na praznoj bazi,
> isprobaj `pg_restore` da vidiš da radi. Ne prvi put u panici.

## Dnevni pregled — da vidiš da li sistem živi

Najgori scenario nije pogrešan zapis nego **tišina**: firma prestane da unosi, niko ne
primijeti, i tri mjeseca kasnije dođe inspekcija na praznu evidenciju.

```powershell
node alati\dnevni-pregled.mjs
```

Ispiše po jedan red za svakog klijenta iz `alati\klijenti.txt`: kad je stigao posljednji
zapis, koliko ih je u posljednjih sedam dana, ima li odstupanja bez mjere, kad je bila
posljednja vježba povlačenja. Pet sekundi ujutru.

Isto se vidi i u aplikaciji na `/api/cg/dnevni-pregled`, za jednog klijenta.

## Izvoz podataka klijentu

Član 7 ugovora: klijent ima pravo da svoje podatke dobije u otvorenom formatu u roku od
15 dana. Ekran **Izvoz** to radi u jednom kliku — CSV po tabeli (otvara se u Excelu) ili
sve u jednom JSON fajlu.

Kad klijent to zatraži, ne odlaži: to je najbrži način da izgubiš sljedeću preporuku.
**Izvoz nije bekap** — iz CSV-a se sistem ne vraća u rad.

## Jednom godišnje, po klijentu

- Obuka sa provjerom znanja → nove potvrde
- Interna provjera sistema → zapisnik
- **Vježba povlačenja** — nasumična serija, mjeriš vrijeme do kompletne liste kupaca
- Preispitivanje plana: ima li novih artikala, vozila, izmjena propisa

---

# DIO 4 — Kad nešto pukne

| Šta vidiš | Uzrok | Rješenje |
|---|---|---|
| `Nedostaje DATABASE_URL` | promjenljiva nije postavljena, ili ima razmak | provjeri Environment na Renderu |
| `ADMIN_TOKEN mora imati bar 16 znakova` | prekratak token | napravi nov, korak 1.5 |
| Stranica se vrti pa pukne | Direct connection umjesto Session poolera | korak 1.4, uzmi pooler |
| Prvi zahtjev čeka ~50 s | besplatni Render se uspavao | UptimeRobot ili plaćeni plan |
| „Serija nije pronađena" | lot nije unesen ili je drugačije napisan | provjeri kroz `/zapisi.html` |
| Ne mogu snimiti zapis | odstupanje bez korektivne mjere | upiši mjeru — tako je zamišljeno |
| „Telefon kupca je obavezan" | kupac bez telefona | upiši telefon — bez njega nema povlačenja |
| `syntax error at or near "db"` | nalijepljeno ime fajla umjesto sadržaja | `Get-Content ... \| Set-Clipboard`, pa Ctrl+V |
| Kvačice se prikazuju kao `Ä‡` ili `?` | kopirano bez `-Encoding UTF8` | ponovi kopiranje sa tim dodatkom |
| Prazan spisak obrazaca | `obrasci-cg.json` nije prekopiran u `public/` | vrati se na korak 1.1 |
| Pitanja sa temperaturama se ne pojavljuju | granice nisu potvrđene | korak 2.1, tačka 4 |
| Prijavljuje dane bez zapisa iako se ne radi | vikend se računa | dodaj `?neradni=0,6` za nedjelju i subotu |

---

# Kratka lista, za podsjetnik

**Demo — jednom:**

```
1. kopiraj folder i prekopiraj paket preko njega
2. dvije linije u server/index.js
3. npm install
4. Supabase projekat → Session pooler → niz za vezu
5. .env sa DATABASE_URL i ADMIN_TOKEN
6. sedam SQL fajlova, tim redom: 01, 00, 02, 03, 04, 06, 07  →  provjeri: 29 tabela
7. node db/seed.js --svez banka_distributeri_cg.json
8. db/05_demo_cg.sql  →  provjeri: 131 zapis
9. node alati/prvi-korisnik.mjs
10. npm start  →  provjeri tri stranice lokalno
11. GitHub privatno → Render → /api/zdravlje
12. UptimeRobot ili plaćeni plan
```

**Klijent — po firmi:** isto, bez koraka 8, sa novom bazom i novim servisom.

**Sedmično:** `node alati\dnevni-pregled.mjs` → `.\alati\bekap.ps1`

**Mjesečno:** ekran spremnosti → štampa odstupanja → pisani nalaz → bekap.

---

## Šta je provjereno, a šta nije

**Provjereno na stvarnoj bazi:** svih pet SQL fajlova prolazi na Postgresu 16 bez greške
(29 tabela, 21 pogled); učitavanje banke daje 22 porodice i 70 pitanja; demo podaci daju
131 zapis; prijava, sledljivost, ekran spremnosti, unos zapisa i štampa priloga rade
kroz živi server.

**Nije provjereno:** ponašanje na Supabase pooleru pod opterećenjem i na Render
besplatnom planu poslije buđenja. Prvi put to prođi **sama, bez klijenta** — dan ranije.
