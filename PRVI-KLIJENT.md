# Prvi distributer — korak po korak

Od potpisa ugovora do dana kad magacioner sam upisuje temperaturu.
Podijeljeno na **ono što ti radiš** i **ono što klijent vidi i radi**.

---

## Prvo — dvije stvari koje odlučuju hoće li sistem preživjeti

**1. Ne podešavaj iz kancelarije.** Dobavljači, artikli i granice se ne mogu izmisliti
za stolom. Sve to postoji na papirima u njihovom skladištu — u otpremnicama i na
deklaracijama. Ako podesiš „otprilike", magacioner će prvog dana naići na artikal kojeg
nema u spisku, slegnuće ramenima i vratiti se na svesku. **Tada si izgubila klijenta,
a nećeš saznati zašto.**

**2. Ne puštaj sve odjednom.** Prvo prijem i temperature. Isporuka i ostali prilozi tek
kad prijem uđe u naviku — obično druga sedmica. Sistem koji traži deset novih radnji
odjednom se odbacuje u cjelini.

---

# DIO 1 — Šta prikupljaš PRIJE nego što dodirneš aplikaciju

Jedan obilazak skladišta, oko dva sata. Ponesi svesku, ne laptop.

| Šta | Odakle | Zašto ti treba |
|---|---|---|
| Tačan naziv firme, adresa, PIB | rješenje o registraciji | ide u zaglavlje svakog priloga |
| Kontrolni broj objekta | rješenje UBH | dokaz da je objekat registrovan |
| **Spisak dobavljača** | otpremnice iz posljednja tri mjeseca | lista odobrenih (Prilog 4) |
| **Spisak kupaca sa telefonima** | njihovo knjigovodstvo ili komercijala | bez telefona nema povlačenja |
| **Spisak artikala po grupama** | njihov cjenovnik ili WMS | G1 ambijentalno · G2 rashlađeno · G3 zamrznuto |
| **Deklaracije za rashlađenu i zamrznutu robu** | slikaj telefonom u magacinu | odatle izlaze kritične granice |
| Registracije vozila, koja imaju rashladu | vozni park | Prilog D1 |
| Broj i oznake komora | obilazak | dnevni zapisi P7 i P8 |
| Ime odgovornog lica za bezbjednost hrane | odluka direktora | potpisuje sve priloge |
| Imena magacionera i vozača | kadrovska | nalozi u aplikaciji |

> **Deklaracije slikaj, nemoj prepisivati.** Kad kasnije upisuješ granicu od +4 °C, moraš
> moći da pokažeš odakle ti. To je ono što tražiš od klijenta da potvrdi pisano.

---

# DIO 2 — Ti praviš instalaciju

Po koracima 1.4 do 1.11 iz `POKRETANJE.md`, sa četiri razlike:

1. **Nov Supabase projekat**, ime po klijentu — npr. `jadran-trade`.
2. **Ne pokrećeš `05_demo_cg.sql`.** Nikakvi demo podaci u bazi klijenta.
3. Prije `seed.js` otvori `db/banka_distributeri_cg.json` i izmijeni blok `firma`:
   ```json
   "firma": {
     "naziv": "Jadran Trade d.o.o.",
     "delatnost": "Skladištenje i distribucija hrane — veleprodaja",
     "standardi": ["HACCP", "Dobra higijenska praksa"]
   }
   ```
   Taj naziv se pojavljuje u zaglavlju **svakog** odštampanog priloga.
4. **Nov Render servis**, svoj `DATABASE_URL`.

**Provjera:** otvori `/prilozi.html` → „Pregled odstupanja" → Pripremi. U zaglavlju mora
pisati naziv klijenta, a ne `{{NAZIV SUBJEKTA}}`.

---

# DIO 3 — Ti podešavaš — stranica `/podesavanje.html`

Četiri kartice, **ovim redom**. Redoslijed nije proizvoljan: prijem traži i dobavljača i
artikal, isporuka traži kupca.

### 3.1 Dobavljači

Za svakog: naziv, telefon, šta isporučuje. **Kvačicu „odobren" stavljaš tek kad si
vidjela njegovu dokumentaciju** — rješenje o registraciji ili bar broj objekta.

Dobavljač bez kvačice nije greška — aplikacija ga prima, ali ga na prijemu označi
`⚠ nije odobren` i prijavi na ekranu spremnosti. To je tvoj podsjetnik, ne kazna.

### 3.2 Kupci

Naziv i **telefon — obavezno**. Aplikacija neće primiti kupca bez telefona i to je
namjerno: povlačenje po članu 28 počinje telefonskim pozivom, a ne mejlom.

> Ako komercijala kaže „imamo to u sistemu", traži izvoz. Prepisivanje 60 kupaca ručno je
> sat vremena — i to je sat koji naplaćuješ.

### 3.3 Vozila

Registracija i da li ima ispravan rashladni uređaj. Vozilo bez rashlade smije nositi samo
ambijentalnu robu.

### 3.4 Artikli — **ovdje se najviše griješi**

Za svaki artikal: naziv, grupa, i za G2 i G3 **kritične granice**.

| Polje | Šta upisuješ |
|---|---|
| Grupa | G1 ambijentalno · G2 rashlađeno · G3 zamrznuto |
| Donja / gornja granica | sa deklaracije proizvođača, ne iz glave |
| Tolerancija | koliko °C preko granice se roba još prima uz mjeru; preko toga se ne prima |
| Odakle granica | „deklaracija proizvođača" ili naziv propisa |
| **Ko je potvrdio** | ime odgovornog lica kod klijenta |
| Datum potvrde | kad je potvrdio |

**Posljednja dva polja ostavljaš PRAZNA dok klijent ne potvrdi pisano.** Dok su prazna,
aplikacija po toj granici ne ocjenjuje odstupanje automatski i na prijemu piše
*„Granica nije potvrđena iz deklaracije"*.

To izgleda kao nedostatak, a zapravo te štiti: ako po tvojoj pretpostavci odbiju robu i
dobavljač se pobuni, braniš tuđi podatak koji niko nije potvrdio. **Potvrdu traži mejlom
i sačuvaj taj mejl.**

Kad sve unese — pošalji klijentu spisak granica u jednoj tabeli i traži rečenicu:
*„Potvrđujemo navedene kritične granice."* Tek onda upisuješ ime i datum.

**Provjera na kraju Dijela 3:** na svakoj kartici pogledaj kolonu „Stanje". Dok ima
narandžastih redova, podešavanje nije gotovo.

---

# DIO 4 — Ti praviš naloge

Kroz `/admin.html`. Tri uloge, i razlika među njima je cijela poenta.

| Uloga | Ko je dobija | Šta vidi i može |
|---|---|---|
| `izvodjac` | **ti** | sve — podešavanje, zapisi, sledljivost, štampa, korisnici |
| `bzr` | **odgovorno lice za bezbjednost hrane** | sve zapise i cijelu istoriju, sledljivost, štampu priloga, kontrolu zapisa |
| `operater` | **magacioneri i vozači** | samo unos — i vidi **samo današnji i jučerašnji dan** |

**Zašto operater ne vidi stariju istoriju.** Ne zbog nepovjerenja. Zapis koji se može
„uskladiti" tri sedmice unazad ne vrijedi ništa pred inspektorom — a upravo mogućnost
da se to uradi je ono što fasciklu čini bezvrijednom. Ovo objasni direktoru **prije**
nego što primijeti sam; tada to zvuči kao snaga sistema, a ne kao ograničenje.

> Vozačima napravi zaseban nalog, ne zajednički. Zapis mora nositi ime osobe.

---

# DIO 5 — Šta klijent vidi kad se prijavi

Svako vidi istu adresu, ali **različite stranice u navigaciji** — prema ulozi.

### Magacioner i vozač (`operater`) — na telefonu

| Stranica | Kad je otvara | Šta tačno radi |
|---|---|---|
| **Prijem i isporuka** → Prijem robe | na rampi, prije istovara | bira dobavljača i artikal, upisuje **broj serije**, količinu, rok i temperaturu |
| **Prijem i isporuka** → Isporuka kupcu | pri utovaru i kod kupca | bira **seriju sa zaliha**, kupca, vozilo, temperature |
| **Dnevni zapisi** → Prilog P7 / P8 | ujutru, prije 8 h | temperatura svake komore |
| **Dnevni zapisi** → Prilog D1 | prije svakog utovara | pet pitanja o vozilu |
| **Dnevni zapisi** → Prilog P3 | po čišćenju | šta je očišćeno i čime |

### Odgovorno lice (`bzr`) — na računaru

| Stranica | Kad | Šta radi |
|---|---|---|
| **Sledljivost** | kad stigne reklamacija | upiše seriju, dobije spisak kupaca sa telefonima |
| **Štampa priloga** → Pregled odstupanja | mjesečno | pregleda i potpisuje |
| **Štampa priloga** → Prilog 13, 14, potvrde | poslije obuke | štampa za potpis |
| **Dnevni zapisi** | svakodnevno | vidi šta je uneseno i gdje fali |
| **Izvoz** | kad traži auditor ili kupac | preuzme svoje podatke u CSV-u ili JSON-u |

### Ti (`izvodjac`)

Sve gore, plus **Podešavanje** i ekran spremnosti — spisak nalaza koji bi inspektor našao.
Sa svog računara, jednom sedmično: `node alati\dnevni-pregled.mjs` (stižu li zapisi kod
svih klijenata) i `.\alati\bekap.ps1`.

### Šta operater NE vidi

Magacioner i vozač u meniju nemaju Podešavanje, Sledljivost ni Izvoz — te stranice se
njima ne prikazuju, a i da upišu adresu ručno, server ih odbija. Nije zbog tajnosti nego
zato da zapis ne može da se „usklađuje" unazad: **operater smije da upiše samo današnji i
jučerašnji datum.** Stariji zapis unosi odgovorno lice (do 7 dana) ili ti (do 30).

---

# DIO 6 — Kako zaposleni zna šta je šta

Ovo je pitanje koje odlučuje da li sistem zaživi. Odgovor je: **aplikacija mu kaže sama,
u trenutku kad radi.** Ništa ne mora da pamti.

### Svaki ekran na vrhu piše ko ga popunjava i kada

> *„Popunjava kontrolor prijema, na rampi, PRIJE istovara. Ovo je ujedno Prilog 5 i
> početak sledljivosti."*

### Temperatura dobija presudu odmah, u boji

Čim upiše broj, ispod polja se pojavi:

| Boja | Tekst | Šta radi |
|---|---|---|
| 🟢 zeleno | `4 °C` · **U granicama** | prima robu, gotov je |
| 🟠 narandžasto | `5.4 °C — 1.4 °C preko granice` · **Prima se uz mjeru** | prima, odmah u komoru, piše mjeru |
| 🔴 crveno | `15 °C — 7.0 °C preko granice` · **ROBA SE NE PRIMA** | ne prima, piše mjeru, zove odgovorno lice |

**Ne mora da zna nijedan broj napamet.** Granica je u sistemu, on samo mjeri.

### Aplikacija ne da da se snimi nepotpun zapis

- odstupanje bez korektivne mjere → **neće se snimiti**
- prijem bez broja serije → **neće se snimiti**
- isporuka veće količine nego što je na zalihama → **neće se snimiti**
- kupac bez telefona → **neće se upisati**

Radnik ne mora da zna pravilo. Dovoljno je da pokuša — aplikacija ga zaustavi i kaže
zašto, na njegovom jeziku.

### Serije su poredane po FEFO

Na isporuci lista serija počinje onom kojoj **rok prvi ističe**. Uzima odozgo i pravilo
je ispoštovano bez razmišljanja.

### Kad pogriješi — ispravlja sam, ne zove tebe

Ukuca `31` umjesto `3.1`. U spisku ispod forme, na tom redu, klikne **ispravi**.
Forma se popuni starim vrijednostima, on promijeni broj i snimi.

Šta se zapravo desilo:

- stari zapis **ostaje u bazi zauvijek**, sa vremenom unosa i imenom
- novi zapis postaje važeći i nosi oznaku `ispravka`
- oba se vide na `/prilozi.html` → **Trag ispravki zapisa**

**Ovo je odgovor na pitanje koje ti auditor sigurno postavi:** *„a šta ako neko pogriješi
pa prepravi?"* Ne može da prepravi. Može da ispravi, a i greška i ispravka ostaju vidljive,
sa imenima i vremenima. To je jače od papira, gdje se pogrešan broj precrta i niko ne zna
ko je to uradio ni kada.

Ti ovo **nikad ne radi umjesto njih kroz bazu.** Prvi put kad sama uđeš u SQL da nešto
„središ", prekršila si pravilo koje si im prodala — i to pred njima.

### Papir na zidu — odštampaj i zalijepi

Na vrata komore i u vozila:

```
┌──────────────────────────────────────────────────────────┐
│  SVAKO JUTRO PRIJE 8 h                                   │
│  Telefon → Dnevni zapisi → Prilog P7                     │
│  Upiši temperaturu svake komore.                         │
│                                                          │
│  SVAKI PRIJEM ROBE                                       │
│  Telefon → Prijem i isporuka → Prijem robe               │
│  Izmjeri PRIJE istovara. Upiši BROJ SERIJE sa kutije.    │
│                                                          │
│  AKO APLIKACIJA POKAŽE CRVENO                            │
│  Roba se NE PRIMA. Napiši šta si uradio i zovi:          │
│  ______________________  (odgovorno lice)                │
│                                                          │
│  GREŠKA U KUCANJU                                        │
│  U spisku ispod forme klikni „ispravi“ na tom redu.      │
│  Ne zovi nikoga. Ispravka se bilježi, ne krije.          │
│                                                          │
│  Zapis se ne može obrisati. Zato ga piši odmah i tačno.  │
└──────────────────────────────────────────────────────────┘
```

---

# DIO 7 — Prvi dan rada

**Budi tamo ujutru, na prijemu.** Ne u kancelariji, ne poslijepodne.

1. Prođi sa magacionerom prvi unos temperature — **na njegovom telefonu, ne na tvom.**
2. Namjerno upiši temperaturu iznad granice i pokaži mu crvenu presudu i to da
   aplikacija neće snimiti bez mjere. Pa obriši i upiši pravu vrijednost.
3. Sačekaj prvu pravu dostavu i pusti **njega** da unese prijem. Ti ćuti.
4. Sa vozačem prođi kontrolu vozila prije stvarnog utovara.
5. Zalijepi papir na vrata komore i u vozila.
6. Sa odgovornim licem otvori Sledljivost i pretraži seriju koju su tog jutra primili.

> Šesta tačka je najvažnija za direktora. Tog trenutka vidi zašto je platio.

---

# DIO 8 — Provjera poslije prve sedmice

Otvori ekran spremnosti i pogledaj:

| Nalaz | Šta znači | Šta radiš |
|---|---|---|
| nema dana bez zapisa | sistem je zaživio | pohvali ih, pisano |
| fali jedan do dva dana | normalno na početku | podsjetnik, bez drame |
| fali pola sedmice | **niko ne unosi** | idi tamo ODMAH, ne čekaj mjesečni pregled |
| odstupanja bez mjere | unose, ali ne shvataju zašto | ponovi obuku za taj dio |
| **nula odstupanja** | ili su savršeni, ili prepisuju istu vrijednost | provjeri termometrom na licu mjesta |

Posljednji red je najvažniji. **Trideset dana identične temperature nije dobra vijest nego
znak da neko puni zapis napamet.** To je gore od praznog zapisa, jer je namjerno.

---

## Kratka lista

```
PRIJE:      obilazak skladišta, spiskovi, slikane deklaracije
INSTALACIJA: nova baza, nov servis, BEZ demo podataka, naziv firme u banka json
PODEŠAVANJE: dobavljači → kupci → vozila → artikli (granice NEPOTVRĐENE)
POTVRDA:    spisak granica klijentu mejlom, čekaš pisanu potvrdu
NALOZI:     ti izvodjac · odgovorno lice bzr · magacioneri i vozači operater
PRVI DAN:   ujutru na rampi, njihov telefon, njihova ruka
SEDMICA 1:  ekran spremnosti — ako fali pola sedmice, idi tamo odmah
SEDMIČNO:   alati\dnevni-pregled.mjs  →  alati\bekap.ps1
```
