# Git — postavljanje, korak po korak

Git ti treba iz dva razloga: **Render objavljuje aplikaciju iz GitHub repozitorijuma**, i
svaka izmjena dobija tačku povratka. Treće, `CLAUDE.md` u repozitorijumu je kontekst koji
svaka nova sesija pročita umjesto da se prekopava po prepisci.

---

## Prvo — praviš DVA repozitorijuma, ne jedan

| Repozitorijum | Šta je unutra | Gdje ide |
|---|---|---|
| **`haccp-distributeri-cg`** | aplikacija: `server/`, `public/`, `db/`, `CLAUDE.md`, uputstva | GitHub **privatno** → Render |
| **`haccp-cg-poslovno`** | `prezentacija/` i `dokumenti/` | GitHub **privatno**, nikad nigdje drugo |

**Zašto razdvojeno.** Prvi repozitorijum ide na Render i jednog dana može dobiti saradnika,
programera ili klijenta koji traži izvorni kod. U `prezentacija/UPUTSTVO-ZA-PREZENTACIJU.md`
piše tvoj prodajni scenario i tvoje slijepe tačke — *„nemaš nijednu referencu"*,
*„nisi tehnolog"*. U `dokumenti/` je cjenovnik sa marginama i nacrt ugovora.

**To ne smije biti u repozitorijumu koji nekad nekome pokažeš.** `.gitignore` ih već
isključuje, pa ih git neće ni ponuditi.

---

## Korak 1 — provjeri da li imaš git

```powershell
git --version
```

Ako javi da komanda ne postoji, instaliraj sa `git-scm.com` (Windows instalacija, sve
podrazumijevano), pa zatvori i otvori PowerShell ponovo.

Prvi put podesi ko si — to ide u svaku izmjenu:

```powershell
git config --global user.name "Ime Prezime"
git config --global user.email "tvoj@mejl.com"
```

---

## Korak 2 — repozitorijum aplikacije

```powershell
cd C:\masaze\pilot_distributeri_cg

git init
git add .
git status
```

**Stani i pogledaj šta je `git status` ispisao.** Prije prve izmjene provjeri tri stvari:

| Traži | Smije li biti u spisku |
|---|---|
| `.env` | **NE.** Ako se vidi — stani, provjeri `.gitignore` |
| `node_modules/` | **NE.** Hiljade fajlova, ako se vide `.gitignore` nije primijenjen |
| `prezentacija/` ili `dokumenti/` | **NE.** Ako se vide, `.gitignore` nije osvježen |

Ako je nešto od toga u spisku:

```powershell
git rm -r --cached .env node_modules prezentacija dokumenti
git add .
git status
```

Kad je spisak čist:

```powershell
git commit -m "Prva verzija — HACCP za distributere, Crna Gora"
```

---

## Korak 3 — na GitHub

1. `github.com` → **New repository**
2. Ime: `haccp-distributeri-cg`
3. **Private** — obavezno. Banka pitanja i metodologija su tvoje.
4. **Ne** štikliraj „Add a README" ni „Add .gitignore" — već ih imaš.
5. Create repository.

GitHub ti onda pokaže komande. Koristi ove:

```powershell
git branch -M main
git remote add origin https://github.com/TVOJ-NALOG/haccp-distributeri-cg.git
git push -u origin main
```

Prvi put će tražiti prijavu — otvoriće se prozor pregledača, potvrdiš i to je to.

**Provjera:** osvježi stranicu repozitorijuma. Mora se vidjeti `server/`, `public/`, `db/`
i `CLAUDE.md`, a **ne smije** se vidjeti `.env`, `node_modules`, `prezentacija` ni
`dokumenti`.

---

## Korak 4 — repozitorijum za poslovni materijal

```powershell
cd C:\masaze
mkdir haccp-cg-poslovno
Move-Item pilot_distributeri_cg\prezentacija haccp-cg-poslovno\
Move-Item pilot_distributeri_cg\dokumenti   haccp-cg-poslovno\

cd haccp-cg-poslovno
git init
git add .
git commit -m "Prezentacija, ponuda, cjenovnik, nacrt ugovora"
```

Pa na GitHub isto kao u koraku 3, ime `haccp-cg-poslovno`, **Private**.

---

## Korak 5 — Render objavljuje iz gita

Na Renderu, pri pravljenju Web Service-a, biraš repozitorijum `haccp-distributeri-cg`.
Od tog trenutka **svaki `git push` na `main` objavljuje novu verziju automatski.**

Zato od sad ne mijenjaj kod direktno na serveru — mijenjaš lokalno, pošalješ, Render
objavi.

---

## Svakodnevni rad — četiri komande

Poslije svake izmjene:

```powershell
git status                        # šta se promijenilo
git add .                         # pripremi sve
git commit -m "Šta si uradila"    # zapamti, sa objašnjenjem
git push                          # pošalji na GitHub i na Render
```

**Poruka izmjene neka kaže ŠTA i ZAŠTO**, ne „izmjene". Za šest mjeseci ti je to jedini
trag zašto je nešto tako.

Dobro: `Operater može da promijeni lozinku — bez toga ne može da se prijavi`
Loše: `fix`

---

## Kad nešto pokvariš

```powershell
git diff                          # šta sam tačno promijenila, red po red
git checkout -- server/index.js   # vrati JEDAN fajl na posljednju sačuvanu verziju
git log --oneline -10             # posljednjih deset izmjena
```

Vraćanje cijelog projekta na stariju izmjenu:

```powershell
git log --oneline -20             # nađi oznaku, npr. a1b2c3d
git checkout a1b2c3d              # pogledaj to stanje
git checkout main                 # vrati se na najnovije
```

> `git checkout -- fajl` **nepovratno baca** tvoje nesačuvane izmjene u tom fajlu.
> Prije toga pogledaj `git diff`.

---

## Šta git NE rješava

- **Ne čuva bazu.** Podaci klijenata su na Supabase, git čuva samo kod. Bekap je
  poseban posao — `.\alati\bekap.ps1`, najmanje jednom sedmično i obavezno prije
  svake izmjene baze. Vidi `POKRETANJE.md`, Dio 3.
- **Bekapi i spisak klijenata ne idu u git.** `bekap/`, `*.dump` i
  `alati/klijenti.txt` su u `.gitignore`: prvo su podaci klijenata, drugo su
  lozinke. Ako ih ikad vidiš u `git status`, stani.
- **Ne čuva `.env`.** Ako izgubiš računar, `DATABASE_URL` i `ADMIN_TOKEN` moraš imati
  zapisane negdje drugdje — u menadžeru lozinki, ne u fajlu na desktopu.

---

## CLAUDE.md — zašto je bitan

`CLAUDE.md` u korijenu repozitorijuma je kontekst projekta: pravni okvir sa brojevima
propisa, pravila koja se ne smiju pokvariti, greške na kojima se već izgubilo vrijeme, i
spisak otvorenih stavki.

Kad otvoriš novu sesiju, taj fajl zamjenjuje prepričavanje. Ako nešto naučiš na teži
način — dopuni ga i pošalji izmjenu. To je jedina dokumentacija koja se stvarno isplati
održavati.
