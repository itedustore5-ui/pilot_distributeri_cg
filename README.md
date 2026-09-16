# Merenje osposobljenosti zaposlenih

> **Za praktičan rad koristi ** — jedna stranica, od postavljanja do isporuke.
> Ovaj dokument je detaljna referenca.

Sistem koji sprovodi i **dokumentuje proveru osposobljenosti** posle obuke, i priprema
popunjen **Obrazac 6** za štampu i potpis.

Konfigurisan za: **Hotel d.o.o.** — obuka „Higijena i HACCP na liniji prerade mesa"
Forma: 22 pitanja · 6 tema · banka od 70 stavki

---

## Šta ovo jeste, a šta nije

| | |
|---|---|
| **Jeste** | alat kojim poslodavac sprovodi i dokumentuje proveru osposobljenosti |
| **Jeste** | zapis koji firma ulaže u **svoju** dokumentaciju i sama overava |
| **Nije** | sertifikat — izdaju ih isključivo akreditovana sertifikaciona tela |
| **Nije** | zamena za obuku — nju i dalje drži firma ili njen konsultant |
| **Nije** | zamena za Obrazac 6 — taj se vodi u štampanom obliku; sistem ga **popunjava** |

Odgovornost za obuku i evidenciju po zakonu ostaje na poslodavcu.

## Zakonski osnov

| Zahtev | Odakle | Kako se pokriva |
|---|---|---|
| Osposobljavanje teorijski i praktično, uz **proveru osposobljenosti** | Zakon o BZR („Sl. glasnik RS" 35/2023), čl. 33 | teorijska provera + zapis o rezultatu |
| Periodična provera: povećan rizik 1 god., ostalo 3 god. | isto | dodatni termini po potrebi |
| Obrazac 6 — **štampano**, potpisuje i zaposleni, čuva se **40 godina** | Pravilnik („Sl. glasnik RS" 5/2025, 38/2025, 118/2025, 57/2026), čl. 2 i 14 | sistem popunjava, firma štampa i potpisuje |
| Obuka na jeziku koji zaposleni razume | Zakon o BZR | polje `jezik` na grupi |
| Obučenost zaposlenih, evidencije dostupne za verifikaciju | HACCP · IFS Food | zapis po zaposlenom, temi i datumu |

> Za crnogorske klijente osnov je Zakon o zaštiti i zdravlju na radu Crne Gore — tekst je
> gotovo istovetan, jer oba prenose istu evropsku direktivu.

---

## Tri obima usluge

Ista aplikacija, ista banka pitanja, isti kod. Razlika je **samo broj termina**.

| | provera *(podrazumevano)* | osnovno | prošireno |
|---|---|---|---|
| Termini | T1 | T0, T1 | T0, T1, T30, T90 |
| Kada | na dan obuke | oba na dan obuke | + posle 30 i 90 dana |
| Isporuka | Obrazac 6, evidencija | + koliko je obuka podigla znanje | + zadržavanje znanja, krivulja zaboravljanja, analiza pitanja |
| Orijentaciona cena | 400–700 € | 600–900 € | 1.000–1.600 € |

Postavlja se u `db/banka.json` → `grupa.paket`, ili se menja u hodu:

```bash
curl -X POST .../api/admin/paket -H "x-admin-token: $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{"grupa_id":1,"paket":"prosireno"}'
```

Nadogradnja dodaje termine. Vraćanje na manji paket ih uklanja, **ali samo ako na njima
nema završenih provera** — merenja se ne brišu prećutno.

Stranice se same prilagođavaju: nema kolona za termine kojih nema.

> **Analiza pitanja traži prošireni paket ili veliku grupu.** Pri jednom ili dva termina
> svaka varijanta bude poslužena svega desetak puta, što je premalo za pouzdan zaključak.
> Sistem to sam prijavljuje umesto da prikaže nalaz kojem se ne može verovati.

---

## Postavljanje

### 1. Lokalno

```bash
npm install
cp .env.example .env          # popuni DATABASE_URL i ADMIN_TOKEN
npm run seed:svez             # kreira šemu i učitava banku pitanja
node alati/prvi-korisnik.mjs tvoj@mejl.rs "Ime Prezime"
npm start
```

`ADMIN_TOKEN` generiši sa:
```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Otvori `/prijava.html`, prijavi se privremenom lozinkom, postavi svoju.

### 2. Baza na Supabase

Novi projekat → **Connect** → **Session pooler**, port `5432`.

Obavezno Session pooler, ne Direct connection — Direct je samo IPv6 i Render ga ne dohvata.
Prepoznaje se po `pooler.supabase.com` u domenu i korisniku oblika `postgres.nekiid`.

Bazu puniš sa svog računara, jednom: `npm run seed:svez`.

### 3. Objava na Render

New → Web Service → tvoj repozitorijum.

| Polje | Vrednost |
|---|---|
| Region | Frankfurt |
| Build Command | `npm ci` |
| Start Command | `npm start` |
| Health Check Path | `/api/zdravlje` |

Pod **Environment**: `DATABASE_URL` i `ADMIN_TOKEN`. `PORT` ne dodaješ.

Besplatni plan se gasi posle 15 minuta nekorišćenja i prvi zahtev čeka ~50 s. Za dan
merenja postavi UptimeRobot na `/api/zdravlje`, na 10 minuta.

---

## Stranice

| Adresa | Za koga | Vidi imena |
|---|---|---|
| `/` | **zaposleni** — jedina adresa koja ide van kuće | — |
| `/prijava.html` | svi ostali | — |
| `/admin.html` | **komandna tabla** — odavde se sve vodi | da |
| `/ceduljice.html` | nadzornik — šifre za štampu i sečenje | da |
| `/obrazac6.html` | lice za BZR — Obrazac 6 za potpis | da |
| `/evidencija.html` | lice za BZR — evidencija, dopunska obuka, rok čuvanja | da |
| `/izvestaj.html` | menadžer kvaliteta — teme, analiza pitanja, zablude | ne |
| `/uprava.html` | direktor — jedna strana, mesto za potpis | **ne** |

Uloge i dozvole: vidi `ULOGE.md`.

---

## Redosled rada

Sve preko `/admin.html`. Tabla sama pokazuje dokle si stigla.

**1. Šifre.** Radno mesto, smena, broj ljudi. Numeracija se nastavlja, pa možeš dodavati
u više navrata. Prefiks se postavlja u `banka.json` (`P` proizvodnja, `H` hotelijerstvo,
`K` konsalting). Odštampaj ceduljice i predaj nadzorniku.

> Zaposleni nema nalog ni lozinku — ima samo šifru. Spisak šifra→ime drži poslodavac na
> papiru. Zato merenje ostaje anonimno prema upravi.

**2. Održana obuka.** Naziv, razlog (šifra 01–10; za godišnju je 09), oblik, datumi,
trajanje, mesto, izvođač, materijal, teme. Pa prisustvo — svi prisutni, pa odsutni
pojedinačno sa razlogom.

> **To je prvi dokument koji inspektor traži.** Provera znanja je tek druga kolona.

**3. Potvrda pitanja sa brojkama.** Trinaest stavki sadrži granične temperature i vremena
iz HACCP plana klijenta. **Sistem ih neće servirati dok ih klijent ne potvrdi.** Pošalji
mu spisak, on označi šta se ne slaže, ti ispraviš u `banka.json`, `seed:svez`, pa potvrdiš.

**4. Termini.** Otvori samo onaj koji je na redu i zatvori ga posle. Zatvoren termin
zaposleni ne vidi.

**5. Radna mesta.** Povezivanje sa zaposlenima. Bez toga Obrazac 6 izlazi sa prazninama.

---

## Radna mesta iz Akta o proceni rizika

Opis poslova, šifre opasnosti, mere, zaštitna oprema — ne zavise od čoveka nego od radnog
mesta. Unose se **jednom** u `db/banka.json`, blok `radna_mesta`, pa se automatski uparuju
sa svakim zaposlenim na tom mestu.

Za deset radnih mesta to je oko sat vremena unosa — i to je posao koji naplaćuješ.

Izostavljeno polje pri izmeni **zadržava staru vrednost**. Nepostojeća šifra opasnosti se
odbija (dozvoljene su 01–40, spisak na `/api/sifre`).

---

## Obrazac 6

Stranica `/obrazac6.html` izbacuje po jedan popunjen obrazac po zaposlenom, A4, sa
prelomom strane između njih i tri mesta za potpis: savetnik za BZR, poslodavac, zaposleni.

**Polja praktične obuke i praktične provere ostaju prazna, namerno.** Praktični deo se
izvodi na radnom mestu; sistem ga ne meri i ne sme da tvrdi da jeste. Popunjava ih
savetnik rukom, pre potpisivanja.

Pre štampe stranica javlja šta nedostaje: imena, podaci o radnim mestima, šifra razloga,
nezavršena provera.

> **Obrazac 6 traži ime i prezime — šifra nije dovoljna.** Za štampu se uključuje
> `cuva_imena`. Redosled: **prvo ugovor o obradi podataka, pa imena, pa štampa.**

### Imena — dve mogućnosti

| | Kako radi | Kada |
|---|---|---|
| **A — samo šifre** *(podrazumevano)* | u bazi su šifre; spisak šifra→ime drži poslodavac | najmanja izloženost |
| **B — imena u bazi** | `grupa.cuva_imena = TRUE` | traži ugovor o obradi i rok čuvanja |

```bash
curl -X POST .../api/admin/imena -H "x-admin-token: $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"grupa_id":1,"cuva_imena":true,"imena":[{"sifra":"P-001","ime_prezime":"Ime Prezime"}]}'
```

Kreni sa A. Ako klijent traži imena — prvo ugovor, pa B.

---

## Rok čuvanja i anonimizacija

Dva odvojena sata koja se često mešaju:

| | Rok | Čija obaveza |
|---|---|---|
| Obrazac 6 kod poslodavca | **40 godina**, štampano | poslodavca, po Pravilniku |
| Radni podaci u sistemu | **koliko ugovorite**, podrazumevano 12 meseci | tvoja, po ugovoru |

Po isteku se podaci **anonimizuju, ne brišu**: šifre postaju `ANON-0001…`, brišu se ime,
radno mesto i smena. Merenja ostaju upotrebljiva, a podaci prestaju da budu podaci o
ličnosti.

**Anonimizaciju upiši u ugovor unapred.** Naknadno ćeš dobiti ne.

```bash
curl -X POST .../api/admin/anonimizuj/1 -H "x-admin-token: $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{"potvrda": true, "izvrsio": "Ime Prezime"}'
```

Nepovratno. **Pre toga odštampaj i predaj evidenciju i Obrazac 6** — posle se ne mogu izdati.

---

## Čitanje izveštaja

**Analiza pitanja pre nalaza.** Pitanje koje svi promaše može biti loše napisano, a ne rupa
u znanju. Negativno razdvajanje skoro uvek znači pogrešno označen tačan odgovor.

**Sidra.** Pet pitanja je identično u svim terminima. Ne gleda se sidro samo po sebi — ono
i samo prati učenje. Gleda se **razmak** između sidra i rotacionih pitanja. Stabilan razmak
znači da su forme podjednako teške i da je pad stvaran pad znanja.

**Prag je na temi, ne na čoveku.** Tema ispod 70% ide na ponovnu obuku za celu smenu. Za
sud o pojedincu tema mora imati bar **tri pitanja** — kod jednog pitanja rezultat može biti
samo 0% ili 100%.

**Raširene zablude** su najkorisniji nalaz za samu obuku: kad četvrtina grupe izabere isti
netačan odgovor, to je zajedničko pogrešno uverenje.

**Kvalitet podataka.** Ispod pet sekundi po pitanju znači da tekst nije čitan. Takve sesije
se navode u izveštaju, ne brišu se tiho.

**Odziv ispod 80%** oslabljuje nalaz i mora biti naveden.

---

## Struktura

```
db/00_sifre.sql       šifre razloga (01–10) i opasnosti (01–40) iz Pravilnika
db/01_schema.sql      tabele
db/02_pogledi.sql     osnovni izveštajni pogledi
db/03_analiza.sql     analiza pitanja, Obrazac 6, rok čuvanja
db/banka.json         pitanja, radna mesta, firma, paket ← ovde se menja sve po klijentu
db/seed.js            učitavanje
server/db.js          veza sa bazom
server/forma.js       generisanje paralelnih formi i sidara
server/auth.js        uloge, lozinke, sesije
server/licenca.js     provera prava korišćenja
server/index.js       API + serversko ocenjivanje
public/               prijava · admin · ceduljice · index (test) · obrazac6
                      evidencija · izvestaj · uprava
alati/                prvi-korisnik.mjs · napravi-licencu.mjs
lokalno/              Docker za instalaciju kod klijenta + zaštita koda
test_*.mjs            simulacija · stranice · izvoz · spisak · tabla · uloge
ULOGE.md              ko sme šta
```

### Kako se prave paralelne forme

Rotaciona pozicija bira varijantu po `(redni_termina − 1 + heš(šifra)) % broj_varijanti`.
Uz 4 varijante i 4 termina svaki učesnik vidi svaku varijantu **tačno jednom**. Redosled
ponuđenih odgovora se meša determinističkim seedom, pa položaj tačnog odgovora ne postaje
trag, a forma ostaje ponovljiva pred auditorom.

**Ovo nije nasumičan izbor.** Nasumičnost bi razbila uporedivost merenja.

### Provera pre isporuke

```bash
node test_simulacija.mjs    # 24 učesnika kroz sve termine + provere ispravnosti
node test_uloge.mjs         # ko šta sme da vidi
node test_tabla.mjs         # ceo tok sa komandne table
node test_stranice.mjs      # da API i stranice govore istim jezikom
node test_izvoz.mjs         # CSV izvozi
```

Posle simulacije obavezno `npm run seed:svez` — ostavlja probne zapise.

### Gotove banke pitanja

| Fajl | Za koga | Teme | Forma |
|---|---|---|---|
| `banka.json` | proizvodnja, mesna industrija | 6 (T1–T6) | 20 pitanja |
| `banka_hotel.json` | **hoteli i ugostiteljstvo** | 6 (H1–H6) | 22 pitanja |

Hotelska banka: prijem i hladan lanac · lična higijena · unakrsna kontaminacija ·
odstupanja i korektivne mere · alergeni i informisanje gosta · čišćenje i održavanje.
Radna mesta: kuhinja (priprema i hladna), restoran i šank, prijem i magacin, pranje posuđa.

**Svaka tema ima najmanje tri pitanja i svoje sidro**, pa je sud o pojedincu valjan za sve
teme — za razliku od proizvodne banke, gde jedna tema ima samo jedno pitanje.

```bash
node db/seed.js --svez banka_hotel.json
```

### Za sledećeg klijenta

Menjaš **samo `db/banka.json`**: firma, program, teme, pitanja, radna mesta, prefiks šifre,
paket. Pa `npm run seed:svez`. **Kod se ne dira.**

Za više banaka odjednom: `node db/seed.js --svez banka_hotel.json`

---

## Pre prvog plaćenog klijenta

1. **Ugovor o obradi podataka.** Rezultati su podaci o ličnosti; firma je rukovalac, ti
   obrađivač. Podobrađivači (Supabase, Render) se navode poimenično, sa regionom.
   Nacrt neka pogleda pravnik — to je jedina stavka gde stvarno plaćaš.
2. **Razdvajanje klijenata.** Jedan klijent = jedna baza. Nikad više klijenata u istoj.
3. **Rotacija tokena.** `ADMIN_TOKEN` je glavni ključ — ne deli ga nikome.
4. **Bekap** uključen na Supabase.
5. **Rok čuvanja** dogovoren i upisan u ugovor.
6. **Kiosk režim** na tabletu, da radnik ne može izaći iz aplikacije.
7. **Licenca, ne prodaja koda:**
   > *Naručilac stiče pravo korišćenja za period ugovora. Izvorni kod, baza pitanja i
   > metodologija ostaju svojina izvođača.*
