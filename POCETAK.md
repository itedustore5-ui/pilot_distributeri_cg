# Brzi start — hoteli

Sve komande kucaš u CMD, u folderu ovog projekta.
Otvori folder u Exploreru → klikni u adresnu traku → otkucaj `cmd` → Enter.

---

## Prvi put — postavljanje (jednom)

**1. Instaliraj**
```
npm install
```

**2. Napravi .env**
Kopiraj `.env.example` u `.env` i upiši svoje podatke:
```
copy .env.example .env
notepad .env
```
U `DATABASE_URL` ide Session pooler niz sa Supabase (port 5432).
`ADMIN_TOKEN` generiši sa:
```
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

**3. Proveri vezu**
```
node -e "import('dotenv/config').then(()=>import('pg')).then(async({default:pg})=>{const c=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});await c.connect();console.log('VEZA RADI');await c.end()})"
```
Mora pisati VEZA RADI.

**4. Napuni bazu**
```
npm run seed:svez
```
Učitava hotelsku banku: 6 tema, 70 pitanja, forma 22, prefiks H.

**5. Napravi sebe kao korisnika**
```
node alati/prvi-korisnik.mjs tvoj@mejl.rs "Ime Prezime"
```
Prepiši privremenu lozinku.

**6. Pokreni**
```
npm start
```
Otvori http://localhost:3000/prijava.html, prijavi se, postavi svoju lozinku.

---

## Za novog klijenta

1. Izmeni `db/banka.json` — naziv hotela, njegova radna mesta, pitanja iz
   njegovog HACCP plana. Prefiks ostavi H.
2. `npm run seed:svez`
3. `node alati/prvi-korisnik.mjs ...` za sebe, pa napravi njihovo lice za BZR
   na komandnoj tabli.

**Jedan klijent = jedna baza.** Za drugog hotela napravi nov Supabase projekat
i nov `.env`, ili nov folder sa svojim `.env`.

---

## Šta je gde

| Adresa | Za koga |
|--------|---------|
| `/` | zaposleni — test na telefonu |
| `/admin.html` | ti — komandna tabla, odavde sve vodiš |
| `/ceduljice.html` | šifre za štampu, nadzorniku |
| `/obrazac6.html` | evidencija za štampu i potpis |
| `/evidencija.html` | ko je proveren, kome treba dopuna |
| `/uprava.html` | direktor — zbirno, bez imena |

Detaljno u README.md.
