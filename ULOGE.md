# Ko sme šta

## Tri uloge

| Uloga | Vidi imena i šifre | Šta radi |
|---|---|---|
| **izvođač** (ti) | da | sve + pravi korisnike + licenca |
| **BZR / kvalitet** | da | merenje, evidencija, Obrazac 6, štampa, dopunska obuka |
| **uprava** | **ne** | isključivo zbirni izveštaj |

Uprava fizički ne može doći do imena — server odbija te pozive sa 403, bez obzira na to
šta neko upiše u adresu. To nije sakriveno dugme, nego pravilo na serveru.

Zaposleni koji rade proveru **nisu korisnici** — oni imaju samo šifru sa ceduljice i ne
prijavljuju se.

## Postavljanje, jednom

```bash
npm run seed:svez
node alati/prvi-korisnik.mjs tvoj@mejl.rs "Ime Prezime"
```

Ispisuje privremenu lozinku. Otvori `/prijava.html`, prijavi se, sistem odmah traži da
postaviš svoju.

## Dodavanje ljudi kod klijenta

Na `/admin.html` → **Ko sme šta** (vidi se samo izvođaču). Upišeš e-mail, ime i ulogu.

Sistem generiše lozinku i **prikazuje je jednom** — prepišeš je i pošalješ toj osobi.
Ona je pri prvoj prijavi menja u svoju; ti je posle ne znaš.

Ako neko zaboravi lozinku — dugme **nova lozinka**. Stara odmah prestaje da važi.
Kad neko ode iz firme — **ugasi**. Sesija mu se prekida u istoj sekundi.

## Kako se prijavljuju

Svi na `/prijava.html`. Uprava se posle prijave automatski vodi na svoj izveštaj, ostali
na komandnu tablu.

Sesija traje 12 sati, čuva se u kolačiću koji JavaScript ne može pročitati. U bazi stoji
samo heš tokena, pa ni pristup bazi ne daje tuđu sesiju. Lozinke su scrypt heš.

## Glavni ključ

`ADMIN_TOKEN` iz `.env` i dalje otvara sve, preko zaglavlja `x-admin-token`. To je tvoja
rezerva ako se nešto zaglavi sa korisnicima — **ne deli ga nikome.**

## Pri isporuci klijentu

1. `node alati/prvi-korisnik.mjs` za sebe
2. Na `/admin.html` napravi lice za BZR i po potrebi upravu
3. Lozinke pošalji svakome posebno, ne u zajedničkom mejlu
4. Reci im da ih menjaju pri prvoj prijavi — sistem ih ionako tera
5. Kad ugovor istekne, ugasi sve korisnike te firme
