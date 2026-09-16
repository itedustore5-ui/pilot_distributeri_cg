# Instalacija na serveru poslodavca

Koristi se **samo** kad poslodavac izričito traži da podaci ne izlaze iz njegove mreže.
Za sve ostale slučajeve je jednostavnije i sigurnije da baza bude u njegovom Supabase
nalogu, a aplikacija kod izvođača — vidi „Tri načina" na kraju.

---

## Šta treba na serveru

- Linux ili Windows Server sa **Docker Desktop** ili **Docker Engine**
- 2 GB RAM, 10 GB prostora
- Ako se pristupa sa tableta u pogonu: server mora biti dostupan u lokalnoj mreži

## Postavljanje

```bash
cd lokalno
cp env.primer .env
# popuni LOZINKA_BAZE i ADMIN_TOKEN
docker compose up -d
```

Prvi put traje 2–3 minuta (gradi se slika). Provera:

```bash
curl http://localhost:3000/api/zdravlje
```

## Punjenje baze — jednom, pri instalaciji

Banka pitanja **nije u slici** (vidi `ZASTITA-KODA.md`). Baza se puni sa računara izvođača:

```bash
DATABASE_URL=postgresql://merenje:<lozinka>@<adresa-servera>:5432/merenje \
  node db/seed.js --svez
```

Za to je potrebno privremeno izložiti bazu — odkomentariši `ports` u `docker-compose.yml`,
napuni bazu, pa vrati kako je bilo.

> `--svez` briše sve. Posle prvog puta se **nikada** ne pokreće sa tom zastavicom.

Zatim se otvara `http://<adresa-servera>:3000/admin.html` i radi se kao i inače.

## Bekap

Baza živi u Docker volumenu `merenje-podaci`. Dnevni bekap:

```bash
docker compose exec baza pg_dump -U merenje merenje | gzip > bekap/merenje-$(date +%F).sql.gz
```

Vraćanje:

```bash
gunzip -c bekap/merenje-2027-03-14.sql.gz | docker compose exec -T baza psql -U merenje merenje
```

**Bekap je obaveza poslodavca** i to se izričito piše u ugovoru. Ako baza stoji kod njega,
kod njega je i odgovornost za njeno čuvanje.

## Nova verzija

```bash
docker compose down
# zameni fajlove novom verzijom
docker compose up -d --build
docker compose exec aplikacija node db/seed.js     # BEZ --svez
```

## Zaštita

- Baza nije izložena mreži — pristupa joj samo aplikacija unutar Dockera
- Aplikacija ne radi kao root
- Port 3000 ograničiti zaštitnim zidom na lokalnu mrežu
- Za pristup spolja obavezno HTTPS preko obrnutog posrednika (Caddy, nginx)

---

## Tri načina, i kada koji

| | Gde je aplikacija | Gde je baza | Kome |
|---|---|---|---|
| **1. Sve kod izvođača** | Render | Supabase izvođača | mali klijenti, najbrže |
| **2. Baza kod klijenta u oblaku** | Render | **Supabase nalog klijenta** | **podrazumevano** |
| **3. Sve kod klijenta** | njegov server | njegov server | samo kad se izričito traži |

### Zašto je 2. podrazumevano

Poslodavac otvara svoj Supabase projekat (besplatno), i daje izvođaču samo niz za
povezivanje. Time:

- podaci fizički leže u **njegovom** nalogu, on ih vidi i može oduzeti pristup u svakom trenutku
- bekapi su njegovi i automatski
- ako izvođač nestane, podaci ostaju
- izvorni kod nikada ne napušta infrastrukturu izvođača

Za izvođača se ništa ne menja u kodu: `DATABASE_URL` je promenljiva okruženja. Jedan
Render servis po klijentu, svaki sa svojim `DATABASE_URL` i svojim `ADMIN_TOKEN`.

**Jedan klijent = jedna baza.** Ne mešati više klijenata u istu bazu — razdvajanje na
nivou baze je jedina zaštita koja ne zavisi od toga da li je negde u kodu zaboravljen
uslov.

### Šta se u svakom slučaju piše u ugovor

Bez obzira gde podaci leže:

- poslodavac je **rukovalac**, izvođač je **obrađivač**
- izvorni kod, banka pitanja i metodologija su svojina izvođača; naručilac stiče pravo
  korišćenja za period ugovora
- podobrađivači se navode poimenično (Supabase, Render) uz region
- na kraju obrade: brisanje ili vraćanje podataka, po izboru poslodavca
- rok čuvanja radnih podataka i anonimizacija po isteku

Kod na klijentovom serveru **ne** znači da je kod njegov. To rešava ugovor, ne arhitektura.
