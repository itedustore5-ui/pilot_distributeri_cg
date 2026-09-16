# Zaštita koda

## Neprijatna istina

**Kod koji radi na tuđoj mašini ne može se tehnički zaštititi.** Node je čist tekst.
Obfuskacija, `pkg`, `bytenode`, V8 snapshot — sve se vraća uz malo truda. Ko tvrdi
suprotno, prodaje nešto.

Zaštita je slojevita, a tehnički sloj je **najslabiji**:

| Sloj | Šta stvarno štiti |
|---|---|
| **Pravni** | ugovor, licenca, autorsko pravo — *ovo je prava zaštita* |
| **Poslovni** | banka pitanja, ažuriranja, metodologija, tvoje učešće |
| **Tehnički** | podiže trud, odvraća od uzgrednog kopiranja |

---

## Najvažniji potez: banka pitanja ne odlazi kod klijenta

Vrednost nije u Express rutama — njih danas svako sklopi. Vrednost je u **banci pitanja**
(65 stavki, četiri varijante, sidra, nacrt po riziku) i u sposobnosti da se napiše nova
banka za novog klijenta.

Zato `Dockerfile` **namerno ne kopira `db/banka.json`**. Baza se puni sa računara izvođača,
jednom, pri instalaciji:

```bash
DATABASE_URL=<baza klijenta> node db/seed.js --svez
```

Posle toga pitanja postoje samo kao redovi u bazi — nema fajla koji se prekopira i odnese
konkurenciji. Čak i da neko uzme ceo kod, bez banke i bez tebe ne može da opsluži hotel
ni mlekaru.

---

## Licencni ključ

`server/licenca.js` proverava HMAC-potpisan ključ sa nazivom klijenta i rokom važenja.

**Šta radi:** posle isteka ugovora aplikacija se ne pokreće. Nastavak korišćenja traži
**namernu izmenu koda** — a to je u sporu dokaz, i razlika između nesporazuma i svesnog
kršenja ugovora.

**Šta ne radi:** ne sprečava odlučnog čoveka. Nije ni namenjeno tome.

### Priprema, jednom

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" > licenca-tajna.txt
```

Tajna se čuva **van repozitorijuma**. Ista tajna se koristi za sve klijente.

### Ključ po klijentu

```bash
LICENCA_TAJNA=<tajna> node alati/napravi-licencu.mjs "Firma d.o.o." 2027-08-31
```

Ispisuje red koji ide u `.env` kod klijenta, zajedno sa `LICENCA_TAJNA`.

**Bez promenljive `LICENCA` aplikacija radi normalno** — tako radi kod izvođača, gde
provera nema svrhe.

Pri pokretanju ispisuje do kada važi, a trideset dana pre isteka upozorava. To je i
podsetnik tebi da je vreme za produženje.

---

## Isporuka gotove slike umesto izvornog koda

Umesto foldera sa fajlovima, klijentu se daje **gotova Docker slika** iz privatnog
registra:

```bash
docker build -t registar.example.com/merenje:1.0 .
docker push registar.example.com/merenje:1.0
```

Kod klijenta se u `docker-compose.yml` umesto `build: ..` upiše `image: ...`.

Sadržaj slike se i dalje može izvući, ali to više nije „otvori folder i kopiraj" nego
namerna radnja. Uz to nema `README`, testova, `alati/` ni banke — sve je isključeno u
`.dockerignore`.

---

## Šta ide u ugovor

Bez ovoga ništa od gornjeg ne vredi:

> Naručilac stiče **pravo korišćenja** za period ugovora. Izvorni kod, baza pitanja i
> metodologija ostaju svojina izvođača. Naručilac ih neće umnožavati, menjati, ustupati
> trećim licima niti koristiti van ugovorenog obima.

Dodati i:

- zabranu obrnutog inženjeringa i uklanjanja licencne provere
- ugovornu kaznu za kršenje
- šta se dešava po isteku: pristup prestaje, podaci se izvoze ili brišu po izboru naručioca

---

## Ako klijent kaže „a šta ako vas nema"

To je opravdana briga i **ne rešava se predajom koda.** Rešenje je **escrow**: izvorni kod
se deponuje kod treće strane (advokatska kancelarija ili notar) i predaje naručiocu samo
pod tačno određenim uslovima — prestanak poslovanja izvođača, ili neotklonjen kvar u
ugovorenom roku.

Time klijent dobija sigurnost, a ti ne gubiš ništa dok posluješ.

Jeftinija verzija istog: obaveza da mu na svaki zahtev, a najmanje jednom godišnje,
isporučiš **pun izvoz podataka** i **odštampanu evidenciju**. Podaci su ono što mu stvarno
treba četrdeset godina — ne tvoj kod.
