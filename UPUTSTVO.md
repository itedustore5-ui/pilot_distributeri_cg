# Uputstvo — jedan klijent, od početka do kraja

Sve što treba da uradiš. Bez teorije. README je detaljna verzija ovoga.

---

## Šta prodaješ, u jednoj rečenici

**Sprovodim i dokumentujem proveru osposobljenosti zaposlenih i predajem vam popunjen
Obrazac 6, spreman za potpis.**

Ne prodaješ obuku. Ne izdaješ sertifikat. Ne zamenjuješ ničiju evidenciju — popunjavaš je.

---

## Pravni osnov — pet činjenica koje znaš napamet

| Šta zakon traži | Odakle | Ko to radi |
|---|---|---|
| Osposobljavanje **teorijski i praktično**, uz **proveru osposobljenosti** | Zakon o BZR, čl. 33 („Sl. glasnik RS" 35/2023) | obuku drži poslodavac; **teorijsku proveru radi tvoj sistem** |
| Periodična provera: povećan rizik **1 godina**, ostalo **3 godine** | isto | poslodavac planira, ti sprovodiš |
| **Obrazac 6 se vodi u štampanom obliku** i **potpisuje ga i zaposleni** | Pravilnik, čl. 2 („Sl. glasnik RS" 5/2025 sa izmenama; primena od 1.1.2027) | **sistem ga popunjava, poslodavac štampa i potpisuje** |
| Obrazac 6 se čuva **40 godina** | isti Pravilnik, čl. 14 | **poslodavac**, na papiru |
| Obrada podataka o ličnosti traži **pisani ugovor** rukovalac–obrađivač | ZZPL | poslodavac je rukovalac, **ti si obrađivač** |

**Praktični deo obuke i praktičnu proveru sistem ne radi i ne sme da tvrdi da radi.**
Ta dva polja u Obrascu 6 ostaju prazna i popunjava ih savetnik za BZR rukom.

---

## Pre prvog klijenta — četiri stvari

1. **Ugovor o obradi podataka**, kod pravnika. Jedini trošak koji stvarno moraš.
2. **Registracija** paušalnog preduzetništva kao dopunske delatnosti.
3. **Rečenica o licenci** u ugovoru:
   > *Naručilac stiče pravo korišćenja za period ugovora. Izvorni kod, baza pitanja i
   > metodologija ostaju svojina izvođača.*
4. **Rok čuvanja** dogovoren: Obrazac 6 kod njih 40 godina; podaci u sistemu 12 meseci,
   pa anonimizacija.

---

## Postavljanje za jednog klijenta — jednom, oko 2 sata

**1. Podaci klijenta u `db/banka.json`** (jedino mesto gde se nešto menja):

```json
"firma":  { "naziv": "Naziv klijenta d.o.o." },
"grupa":  { "prefiks_sifre": "P", "paket": "provera" },
"radna_mesta": [ ... prepisano iz njegovog Akta o proceni rizika ... ]
```

**2. Baza i prvi korisnik:**

```bash
npm run seed:svez
node alati/prvi-korisnik.mjs tvoj@mejl.rs "Tvoje ime"
npm start
```

**3. Potvrda brojki.** Trinaest pitanja sadrži granične temperature iz njegovog HACCP plana.
Pošalji mu spisak sa `/admin.html`. Tražiš samo jedno:
*„označite isključivo ono što je činjenično netačno kod vas."*
Ispraviš u `banka.json`, `seed:svez`, pa potvrdiš na tabli.

> Dok nisu potvrđene, sistem ih **neće servirati**. Bolje da pukne kod tebe nego da radnik
> dobije tuđu graničnu vrednost.

---

## Dan obuke — redosled

Sve sa `/admin.html`. Tabla sama pokazuje dokle si stigla.

| | Šta | Gde |
|---|---|---|
| 1 | Napravi šifre (radno mesto, smena, broj ljudi) | Korak 1 |
| 2 | Odštampaj ceduljice, predaj nadzorniku | dugme na Koraku 1 |
| 3 | Poveži zaposlene sa radnim mestima | Korak 5 |
| 4 | **Posle obuke** upiši obuku: naziv, razlog **09**, datum, sati, izvođač, materijal, teme | Korak 2 |
| 5 | Označi prisutne, pa odsutne sa razlogom | Korak 2 |
| 6 | Otvori termin **T1** | Korak 4 |
| 7 | Ljudi rade proveru na tabletu — 8 minuta po čoveku | adresa `/` |
| 8 | Zatvori termin | Korak 4 |

Jedan tablet na ulazu opslužuje smenu od 25 ljudi.

---

## Isporuka — isti dan ili sutradan

| Dokument | Odakle | Kome |
|---|---|---|
| **Obrazac 6**, po jedan po zaposlenom | `/obrazac6.html` → štampa | savetniku za BZR, na potpis |
| **Evidencija o osposobljavanju** | `/evidencija.html` → štampa | u dokumentaciju poslodavca |
| **Izveštaj za upravu**, jedna strana bez imena | `/uprava.html` → štampa ili PDF | direktoru |
| **Pun izvoz** u CSV | `/evidencija.html` → „Izvezi sve" | poslodavcu, uz mejl |

Posle štampe savetnik rukom popunjava praktičnu obuku i praktičnu proveru, pa potpisuju
on, poslodavac i zaposleni.

**Time je posao završen.** Papir u njihovoj arhivi važi 40 godina i ne zavisi od tvog sistema.

---

## Ko šta vidi

| Uloga | Vidi imena | Šta radi |
|---|---|---|
| ti (izvođač) | da | sve + pravi korisnike |
| lice za BZR / kvalitet | da | merenje, evidencija, Obrazac 6 |
| uprava | **ne** | samo zbirni izveštaj |

Korisnike praviš na `/admin.html`. Sistem generiše lozinku i **pokaže je jednom** —
prepišeš je i pošalješ toj osobi; ona je menja pri prvoj prijavi.

Zaposleni koji radi proveru **nije korisnik** — ima samo šifru sa ceduljice.

---

## Posle 12 meseci

```bash
curl -X POST .../api/admin/anonimizuj/1 -H "x-admin-token: $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{"potvrda": true, "izvrsio": "Tvoje ime"}'
```

Šifre postaju `ANON-0001…`, imena i radna mesta se brišu, **merenja ostaju** za tvoju
metodologiju. Pre toga obavezno predaj sve odštampano.

---

## Šta prodaješ drugu godinu

Prva godina je `provera` — jedan termin, 400–700 €.

Kad ti klijent kaže *„a ne znam šta oni stvarno pamte posle tri meseca"* — to je trenutak
za `prosireno`: dodaješ termine na 30 i 90 dana, dobijaš krivulju zaboravljanja, i cena
ide na 1.000–1.600 €.

```bash
curl -X POST .../api/admin/paket -H "x-admin-token: $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{"grupa_id":1,"paket":"prosireno"}'
```

Ista aplikacija, ista pitanja. **To je jedino po čemu se razlikuješ od svake BZR agencije** —
zato ostaje u sistemu i kad ga ne prodaješ.

---

## Sledeći klijent

Novi `banka.json` sa njegovim podacima, `seed:svez`, novi Render servis sa njegovim
`DATABASE_URL`. **Jedan klijent = jedna baza.** Kod se ne dira.
