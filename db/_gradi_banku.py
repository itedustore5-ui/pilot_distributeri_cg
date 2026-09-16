# -*- coding: utf-8 -*-
"""
Gradi db/banka_distributeri_cg.json.

Kompaktan zapis: u svakoj varijanti prva opcija je TAČNA, ostale su distraktori.
Skripta ih meša u fiksni redosled i postavlja zastavicu "tacna".
Ne pokreće se u produkciji — samo pri izmeni sadržaja banke.

    python3 db/_gradi_banku.py
"""
import json, io

def st(tekst, opcije, potvrda=False):
    """varijanta: tekst + [tačna, distraktor, distraktor, distraktor]"""
    return {"zahteva_potvrdu": potvrda, "tekst": tekst,
            "opcije": [{"tekst": o, "tacna": i == 0} for i, o in enumerate(opcije)]}

def por(oznaka, tema, konstrukt, nivo, varijante, sidro=False):
    return {"oznaka": oznaka, "tema": tema, "kognitivni_nivo": nivo,
            "je_sidro": sidro, "konstrukt": konstrukt,
            "stavke": [dict(v, varijanta=i + 1) for i, v in enumerate(varijante)]}

P = []  # porodice

# =====================================================================
#  D1 — PRIJEM ROBE I HLADNI LANAC   (KKT 1)
# =====================================================================

P.append(por("F1.1", "D1", "Postupanje kad je temperatura na prijemu iznad kritične granice", "primena", [
 st("Kamion sa rashlađenim mliječnim proizvodima stiže na rampu. Mjeriš temperaturu i dobijaš vrijednost iznad kritične granice iz vašeg plana, i to za više nego što tolerancija dozvoljava. Šta radiš?",
    ["Ne primam pošiljku, upisujem odstupanje u Prilog 5 i odmah obavještavam odgovorno lice",
     "Primam i odmah guram u komoru da se rashladi",
     "Primam jer je dobavljač stalan i do sada nije bilo problema",
     "Primam i skraćujem rok upotrebe na pola"], True),
 st("Isporuka svježeg mesa stiže toplija od granice, iznad dozvoljene tolerancije. Šta radiš?",
    ["Ne primam, upisujem odstupanje i obavještavam odgovorno lice",
     "Primam i odmah šaljem kupcu da se ne zadržava",
     "Primam jer meso na izgled i miris djeluje ispravno",
     "Primam i upisujem napomenu na otpremnicu"], True),
 st("Smrznuti program stiže na −12 °C umjesto na −18 °C. Šta radiš?",
    ["Ne primam, upisujem odstupanje i obavještavam odgovorno lice",
     "Primam i hitno stavljam u zamrzivač da se vrati na −18 °C",
     "Primam jer su paketi još uvijek tvrdi na dodir",
     "Primam i odmah izdajem kupcu koji ionako ima svoj zamrzivač"], True),
 st("Svježa riba stiže na ledu, ali izmjerena temperatura je iznad granice, preko tolerancije. Šta radiš?",
    ["Ne primam, upisujem odstupanje i obavještavam odgovorno lice",
     "Primam i dodajem led u gajbu",
     "Primam jer riba miriše svježe i oči su bistre",
     "Primam i smanjujem cijenu kupcu"], True),
]))

P.append(por("F1.2", "D1", "Šta se provjerava na prijemu osim temperature", "razumevanje", [
 st("Osim temperature, šta se obavezno provjerava pri prijemu svake pošiljke?",
    ["Broj serije ili lota, rok trajanja, stanje ambalaže i prateća dokumentacija",
     "Samo količina, jer ostalo stoji na fakturi",
     "Samo rok trajanja, ostalo je stvar dobavljača",
     "Samo da li se roba slaže sa narudžbinom"]),
 st("Zašto se broj serije upisuje već na prijemu, a ne kasnije?",
    ["Jer bez lota nema sledljivosti — ne može se utvrditi kome je roba otišla",
     "Jer se tako lakše slaže roba u komori",
     "Jer to traži knjigovodstvo zbog PDV-a",
     "Jer se po lotu određuje cijena"]),
 st("Roba stiže sa ispravnom temperaturom, ali je jedan karton pokisao i ambalaža je oštećena. Šta radiš?",
    ["Odvajam oštećeni dio, ne primam ga i upisujem odstupanje; ostatak primam",
     "Primam sve, oštećeno ću izdvojiti kasnije u komori",
     "Primam sve jer je temperatura ispravna",
     "Vraćam cijelu pošiljku jer je dio oštećen"]),
 st("Na prijemu vidiš da proizvod ima rok trajanja koji ističe za tri dana, a vaš kupac naručuje jednom sedmično. Šta radiš?",
    ["Ne primam bez odobrenja odgovornog lica i bilježim razlog",
     "Primam, pa ću ga staviti naprijed u komori da se brže proda",
     "Primam jer rok još nije istekao",
     "Primam i sam produžavam rok jer je roba dobro čuvana"]),
]))

P.append(por("F1.3", "D1", "Dobavljač koji nije na listi odobrenih", "primena", [
 st("Stiže pošiljka od dobavljača koji nije na listi odobrenih dobavljača. Šta je ispravno?",
    ["Zaustavljam prijem i tražim odluku odgovornog lica prije istovara",
     "Primam, pa ću dobavljača dodati na listu poslije",
     "Primam jer je nabavka već naručila robu",
     "Primam ako roba ima ispravnu deklaraciju"]),
 st("Zašto uopšte postoji lista odobrenih dobavljača?",
    ["Jer subjekt odgovara za bezbjednost hrane koju stavlja u promet, pa dobavljača provjerava unaprijed",
     "Jer to traži poreska uprava",
     "Da bi se dobili bolji uslovi plaćanja",
     "Da bi se smanjio broj faktura"]),
 st("Dobavljač je odobren, ali je promijenio objekat iz kojeg isporučuje. Šta to znači?",
    ["Provjerava se podatak o novom objektu prije nastavka isporuka",
     "Ništa, firma je ista",
     "Automatski se briše sa liste",
     "To se rješava tek na godišnjoj provjeri"]),
 st("Vozač dobavljača nema otpremnicu, kaže da će je poslati mejlom sutra. Šta radiš?",
    ["Ne primam robu bez prateće dokumentacije i bilježim razlog",
     "Primam i čekam mejl",
     "Primam i sam pišem internu otpremnicu",
     "Primam jer je važno da roba stigne na vrijeme"]),
]))

P.append(por("A1", "D1", "SIDRO — pojam kritične kontrolne tačke", "prisecanje", [
 st("Šta je kritična kontrolna tačka?",
    ["Korak u procesu na kojem se kontrolom sprečava ili svodi na prihvatljiv nivo opasnost po bezbjednost hrane",
     "Mjesto u skladištu na kojem se najčešće kvari oprema",
     "Tačka na kojoj se mjeri utrošak robe",
     "Trenutak kada inspektor ulazi u objekat"]),
], sidro=True))

# =====================================================================
#  D2 — SKLADIŠTENJE, FIFO/FEFO I ODVAJANJE   (KKT 2)
# =====================================================================

P.append(por("F2.1", "D2", "Redoslijed izdavanja robe iz skladišta", "primena", [
 st("U komori imaš dvije palete istog artikla: jedna je primljena ranije sa rokom do 30. maja, druga kasnije sa rokom do 10. maja. Koju izdaješ prvu?",
    ["Onu sa rokom do 10. maja — prvo ističe, prvo izlazi",
     "Onu koja je ranije primljena, jer je prvo ušla",
     "Onu koja je bliže vratima, da se ne pretovaruje",
     "Svejedno, obje su u roku"]),
 st("Šta znači pravilo FEFO?",
    ["Prvo izlazi ono čiji rok trajanja prvi ističe",
     "Prvo izlazi ono što je prvo ušlo, bez obzira na rok",
     "Prvo izlazi ono što je najskuplje",
     "Prvo izlazi ono što zauzima najviše mjesta"]),
 st("Zašto se roba u skladištu drži odignuta od poda?",
    ["Zbog čišćenja, cirkulacije vazduha i kontrole štetočina",
     "Da se ne bi oštetila ambalaža pri pomjeranju",
     "Zato što to traži protivpožarni propis",
     "Da bi se lakše brojala pri popisu"]),
 st("Primljena je nova paleta istog artikla, a u komori je još pola stare. Kako se slaže?",
    ["Nova se stavlja iza stare, tako da se stara izdaje prva",
     "Nova se stavlja ispred, jer je svježija",
     "Miješa se, jer je isti artikal",
     "Stara se odvaja i vraća dobavljaču"]),
]))

P.append(por("F2.2", "D2", "Odvajanje i unakrsna kontaminacija u skladištu", "primena", [
 st("U istoj rashladnoj komori treba da stoje sirovo meso u zatvorenim kutijama i pakovani sirevi. Kako se slaže?",
    ["Odvojeno, sa sirovim mesom na nižim policama tako da ništa ne može da kaplje na ostalu robu",
     "Svejedno, sve je u zatvorenoj ambalaži",
     "Sirevi dolje jer su teži",
     "Naizmjenično, da se komora ravnomjerno puni"]),
 st("Gdje se drže sredstva za čišćenje i dezinfekciju?",
    ["U odvojenom, označenom prostoru, u originalnoj ambalaži, izvan prostora sa hranom",
     "U uglu komore, da budu pri ruci",
     "Na polici iznad robe, jer tamo ne smeta",
     "Bilo gdje, ako su dobro zatvorena"]),
 st("Nađeš robu bez deklaracije i bez oznake serije u uglu skladišta. Šta radiš?",
    ["Izdvajam je i označavam kao zadržanu, pa tražim odluku odgovornog lica",
     "Vraćam je na policu, neko će se sjetiti šta je",
     "Izdajem je prvom kupcu da se ne pokvari",
     "Bacam je odmah, bez zapisa"]),
 st("Zašto se transportna ambalaža sa spoljnim palete-folijama uklanja pri ulasku u skladište kad god je moguće?",
    ["Jer nosi prljavštinu i štetočine sa transporta u prostor sa hranom",
     "Jer zauzima mjesto na paleti",
     "Jer se folija reciklira",
     "Jer se tako lakše čita deklaracija"]),
]))

P.append(por("F2.3", "D2", "Odstupanje temperature komore", "primena", [
 st("Ujutru očitavaš komoru i vidiš +9 °C umjesto propisanog režima do +4 °C. Ne znaš koliko dugo je tako. Šta radiš?",
    ["Prebacujem robu u ispravnu komoru, zovem servis, zapisujem odstupanje i tražim odluku odgovornog lica o upotrebljivosti robe",
     "Spuštam termostat i nastavljam rad",
     "Čekam sat vremena da vidim hoće li se vratiti pa tek onda zapisujem",
     "Izdajem robu odmah kupcima da se ne kvari dalje"], True),
 st("Ko odlučuje da li je roba nakon temperaturnog odstupanja upotrebljiva?",
    ["Odgovorno lice za bezbjednost hrane, na osnovu trajanja i visine odstupanja",
     "Magacioner koji je odstupanje primijetio",
     "Vozač koji tu robu treba da nosi",
     "Kupac kojem roba ide"]),
 st("Koliko se najmanje puta dnevno očitava temperatura rashladne komore?",
    ["Najmanje jednom dnevno po komori, uz zapis",
     "Jednom sedmično je dovoljno ako uređaj ima alarm",
     "Samo kada se primijeti da nešto nije u redu",
     "Jednom mjesečno, pri verifikaciji"]),
 st("Zamrznuta roba se djelimično odmrzla u komori koja je otkazala. Smije li se ponovo zamrznuti?",
    ["Ne — jednom odmrznuta hrana ne smije se ponovo zamrzavati",
     "Smije ako se odmah vrati na −18 °C",
     "Smije ako nije bila odmrznuta duže od dva sata",
     "Smije ako se rok trajanja skrati"]),
]))

P.append(por("A2", "D2", "SIDRO — svrha zapisa o temperaturi", "prisecanje", [
 st("Čemu služi dnevni zapis o temperaturi komore?",
    ["Da se dokaže da je hladni lanac držan i da se odstupanje vidi na vrijeme",
     "Da se prati potrošnja struje",
     "Da se zna kada treba servis uređaja",
     "Da se opravda cijena robe prema kupcu"]),
], sidro=True))

# =====================================================================
#  D3 — VOZILA, UTOVAR I ISPORUKA   (KKT 3)
# =====================================================================

P.append(por("F3.1", "D3", "Priprema vozila prije utovara", "primena", [
 st("Prije utovara rashlađene robe otvaraš komoru vozila i ona je na temperaturi spoljašnjeg vazduha. Šta radiš?",
    ["Ne utovarujem dok se komora ne predrashladi na režim robe, i to bilježim",
     "Utovarujem i palim rashladu, ohladiće se u vožnji",
     "Utovarujem jer je vožnja kratka",
     "Utovarujem i pokrivam robu ćebadima"]),
 st("U komori vozila osjeća se jak strani miris od prethodne ture. Šta radiš?",
    ["Ne utovarujem dok se komora ne opere i provjeri, i to bilježim",
     "Utovarujem jer je roba u zatvorenoj ambalaži",
     "Utovarujem i ostavljam vrata otvorena da se provjetri u vožnji",
     "Utovarujem i prskam osvježivač"]),
 st("Šta sve ulazi u kontrolu vozila prije utovara?",
    ["Čistoća komore, ispravnost rashladnog uređaja, predrashlađenost, mogućnost odvajanja robe i ispravan termometar",
     "Samo da li rashlada radi",
     "Samo nivo goriva i pritisak u gumama",
     "Samo da li je komora prazna"]),
 st("Rashladni uređaj na vozilu pokazuje grešku, ali još uvijek hladi. Šta radiš?",
    ["Prijavljujem i ne utovarujem rashlađenu robu dok se kvar ne otkloni",
     "Utovarujem jer uređaj još radi",
     "Utovarujem i pratim temperaturu češće",
     "Utovarujem samo robu sa dužim rokom"]),
]))

P.append(por("F3.2", "D3", "Hladni lanac tokom vožnje i isporuke", "primena", [
 st("Na trećoj adresi u turi mjeriš temperaturu rashlađene robe i ona je iznad granice. Šta radiš?",
    ["Ne predajem robu kupcu, bilježim odstupanje i zovem odgovorno lice",
     "Predajem je jer kupac ima svoju komoru",
     "Predajem je uz usmenu napomenu kupcu",
     "Vraćam je u skladište bez zapisa"], True),
 st("Zašto se izbjegava dugo držanje vrata komore otvorenim na svakoj adresi?",
    ["Jer pri svakom otvaranju temperatura u komori raste i hladni lanac se približava granici",
     "Jer se troši više goriva",
     "Jer se time gubi vrijeme na turi",
     "Jer to smeta kupcu"]),
 st("Kako se slaže roba u komori vozila za turu sa više adresa?",
    ["Redoslijedom isporuke i odvojeno po grupama, tako da se komora što manje preslaguje",
     "Po težini, teže dolje",
     "Kako stigne, jer se ionako sve vadi",
     "Po vrijednosti, skuplje bliže vratima"]),
 st("Ko upisuje temperaturu pri isporuci?",
    ["Vozač, na licu mjesta, u zapis o isporuci",
     "Magacioner, kad se vozilo vrati",
     "Kupac, na svojoj dokumentaciji",
     "Odgovorno lice, na kraju sedmice"]),
]))

P.append(por("F3.3", "D3", "Vozač kao lice koje rukuje hranom", "razumevanje", [
 st("Da li se vozač koji razvozi hranu smatra licem koje rukuje hranom?",
    ["Da — zakon obuhvata sve faze prometa i distribucije, pa vozaču trebaju obuka i sanitarna knjižica",
     "Ne, jer ne otvara ambalažu",
     "Ne, jer je zaposlen u transportu, a ne u skladištu",
     "Samo ako prenosi neupakovanu hranu"]),
 st("Gdje se čuva sanitarna knjižica zaposlenog?",
    ["Kod poslodavca, u poslovnim prostorijama objekta",
     "Kod samog zaposlenog, u vozilu",
     "U ambulanti koja je obavila pregled",
     "U knjigovodstvu, uz radnu dokumentaciju"]),
 st("Ko snosi trošak obaveznog zdravstvenog pregleda zaposlenog koji rukuje hranom?",
    ["Poslodavac",
     "Zaposleni",
     "Dijeli se pola-pola",
     "Fond zdravstva u cijelosti"]),
 st("Vozač se tokom ture osjeti loše i ima simptome stomačne infekcije. Šta je ispravno?",
    ["Prijavljuje odmah odgovornom licu i ne nastavlja rad sa hranom dok se stanje ne razjasni",
     "Završava turu jer su kupci već naručili",
     "Nastavlja rad uz rukavice i masku",
     "Prijavljuje tek kada se vrati u firmu"]),
]))

P.append(por("A3", "D3", "SIDRO — gdje se hladni lanac najčešće prekida", "prisecanje", [
 st("Na kom koraku se u distribuciji hladni lanac najčešće prekida?",
    ["U vozilu — pri utovaru i tokom ture, jer tamo nema stalnog nadzora",
     "U rashladnoj komori skladišta, jer se stalno otvara",
     "Kod dobavljača, prije nego što roba krene",
     "Kod kupca, poslije isporuke"]),
], sidro=True))

# =====================================================================
#  D4 — SLEDLJIVOST, LOT I POVLAČENJE
# =====================================================================

P.append(por("F4.1", "D4", "Korak nazad i korak naprijed", "razumevanje", [
 st("Šta znači „korak naprijed“ u sledljivosti?",
    ["Znati kojim je kupcima otišla svaka serija robe",
     "Znati koji je sljedeći proizvod na redu za izdavanje",
     "Znati koliko robe ostaje na zalihama",
     "Znati kada stiže sljedeća isporuka dobavljača"]),
 st("Šta znači „korak nazad“ u sledljivosti?",
    ["Znati od kog dobavljača i pod kojom serijom je roba primljena",
     "Znati koliko je robe vraćeno kao reklamacija",
     "Znati koja je prethodna cijena bila",
     "Znati koji je radnik robu primio"]),
 st("Koji je podatak neophodan da bi sledljivost uopšte radila?",
    ["Broj serije ili lota, upisan i na prijemu i na isporuci",
     "Broj fakture dobavljača",
     "Ime vozača koji je robu dovezao",
     "Registracija vozila"]),
 st("Kupac je fizičko lice koje kupuje u vašoj veleprodaji za sopstvenu upotrebu. Da li je i za njega potreban korak naprijed?",
    ["Prema krajnjem potrošaču korak naprijed se ne zahtijeva, ali se prema pravnim licima zahtijeva u punom obimu",
     "Zahtijeva se jednako za sve kupce",
     "Ne zahtijeva se ni za koga jer ste vi samo posrednik",
     "Zahtijeva se samo za robu koja ide u inostranstvo"]),
]))

P.append(por("F4.2", "D4", "Postupanje pri saznanju o nebezbjednoj robi", "primena", [
 st("Dobavljač te obavijesti da je serija koju si primio prije pet dana nebezbjedna. Koji je prvi korak?",
    ["Fizički izdvajam svu robu te serije sa zaliha i označavam je kao zadržanu, pa obavještavam odgovorno lice",
     "Prvo zovem sve kupce, roba na zalihama može da čeka",
     "Prvo pišem izvještaj za inspekciju",
     "Prvo tražim od dobavljača pisanu potvrdu prije bilo kakve radnje"]),
 st("Kada se obavještava nadležni organ o povlačenju robe?",
    ["Bez odlaganja, čim se utvrdi da hrana ne ispunjava zahtjeve bezbjednosti",
     "Tek ako kupci vrate robu",
     "Na kraju mjeseca, zajedno sa ostalim izvještajima",
     "Samo ako je neko obolio"]),
 st("Roba koja je povučena od kupaca vraća se u vaše skladište. Gdje ide?",
    ["U odvojen, označen prostor — karantin, nikako u redovne zalihe",
     "Nazad na svoje mjesto u komori, dok se ne odluči šta dalje",
     "Odmah u kontejner",
     "Kod dobavljača na rampu, bez zapisa"]),
 st("Kupac prijavljuje da je u proizvodu našao strano tijelo. Šta je prvo?",
    ["Bilježim reklamaciju sa serijom i artiklom, izdvajam tu seriju sa zaliha i obavještavam odgovorno lice",
     "Šaljem mu zamjenski proizvod i time je stvar riješena",
     "Tražim da vrati proizvod pa ćemo vidjeti",
     "Upućujem ga na proizvođača"]),
]))

P.append(por("F4.3", "D4", "Dokumentacija i rokovi u sledljivosti", "primena", [
 st("Koliko dugo se čuvaju zapisi o sledljivosti?",
    ["Najmanje dok traje rok trajanja proizvoda, i neko vrijeme nakon toga",
     "Do kraja kalendarske godine",
     "Mjesec dana od isporuke",
     "Dok se roba ne naplati"]),
 st("Zašto telefon kupca mora biti upisan u sistemu, a ne samo mejl?",
    ["Jer se pri povlačenju kupci obavještavaju odmah, telefonom, a tek onda pisano",
     "Zbog knjigovodstva i naplate",
     "Da bi se dogovarale isporuke",
     "Zbog marketinga"]),
 st("U kom roku bi odgovorno lice trebalo da ima kompletnu listu kupaca kojima je sporna serija otišla?",
    ["U roku od nekoliko sati — to se provjerava godišnjom vježbom povlačenja",
     "U roku od sedam dana",
     "Do kraja tekućeg mjeseca",
     "Onoliko koliko treba, rok nije bitan"]),
 st("Šta je vježba povlačenja?",
    ["Provjera sistema na nasumično izabranoj seriji, bez stvarnog problema, da se izmjeri koliko brzo se dolazi do liste kupaca",
     "Obuka za rukovanje viljuškarom",
     "Godišnji popis zaliha",
     "Test rashladnih uređaja"]),
]))

P.append(por("A4", "D4", "SIDRO — šta je serija (lot)", "prisecanje", [
 st("Šta je serija (lot) robe?",
    ["Količina proizvoda proizvedena ili pakovana pod praktično istim uslovima, označena zajedničkom oznakom",
     "Količina robe koja stane na jednu paletu",
     "Količina koju jedan kupac naruči odjednom",
     "Količina koja se isporučuje jednim vozilom"]),
], sidro=True))

# =====================================================================
#  D5 — LIČNA HIGIJENA I ZDRAVSTVENA SPOSOBNOST
# =====================================================================

P.append(por("F5.1", "D5", "Pranje ruku i lična higijena u prometu hrane", "primena", [
 st("Kada se obavezno peru ruke u radu sa hranom?",
    ["Prije početka rada, poslije toaleta, poslije rukovanja otpadom ili prljavom ambalažom i poslije svake prekinute radnje",
     "Samo prije početka smjene",
     "Samo kada su ruke vidno prljave",
     "Na kraju smjene, prije odlaska kući"]),
 st("Radnik nosi rukavice cijelu smjenu bez mijenjanja. Da li je to ispravno?",
    ["Nije — rukavice se mijenjaju i ruke peru kao i bez njih; rukavice nisu zamjena za pranje ruku",
     "Jeste, rukavice su čistije od ruku",
     "Jeste, ako su rukavice jednokratne",
     "Jeste, ako se rukavice povremeno operu"]),
 st("Šta se radi sa radnom odjećom?",
    ["Drži se odvojeno od civilne, čista je i mijenja se redovno",
     "Nosi se od kuće da se uštedi vrijeme",
     "Pere se jednom mjesečno",
     "Koristi se i za druge poslove u firmi"]),
 st("Radnik ima posjekotinu na ruci. Šta je ispravno?",
    ["Rana se pokrije vodootpornim zavojem i, gdje je potrebno, rukavicom; prijavljuje se nadređenom",
     "Nastavlja rad, rana je mala",
     "Stavlja običan flaster i nastavlja",
     "Odlazi kući do zarastanja, bez izuzetka"]),
]))

P.append(por("F5.2", "D5", "Zdravstvena sposobnost i prijava simptoma", "razumevanje", [
 st("Zaposleni ima proliv i povraćanje. Šta propis traži?",
    ["Da odmah prijavi stanje i da ne radi sa hranom dok se stanje ne razjasni",
     "Da radi uz pojačanu higijenu ruku",
     "Da radi samo na pakovanoj robi",
     "Da sam odluči da li je sposoban za rad"]),
 st("Koji dokument potvrđuje da je zaposleni prošao obavezni zdravstveni pregled za rad sa hranom?",
    ["Sanitarna knjižica",
     "Ljekarsko uvjerenje za vozačku dozvolu",
     "Uvjerenje o bezbjednosti na radu",
     "Ugovor o radu"]),
 st("Na koga se odnosi obaveza zdravstvenog pregleda u distribuciji hrane?",
    ["Na sve koji rukuju hranom u fazama proizvodnje, prometa i distribucije, uključujući magacionere i vozače",
     "Samo na one koji rade sa neupakovanom hranom",
     "Samo na rukovodioce",
     "Samo na zaposlene u proizvodnji"]),
 st("Inspektor traži sanitarne knjižice zaposlenih. Gdje treba da budu?",
    ["U poslovnim prostorijama objekta, kod poslodavca",
     "Kod svakog zaposlenog lično",
     "U arhivi u drugom gradu",
     "U elektronskoj formi na mejlu"]),
]))

P.append(por("A5", "D5", "SIDRO — zašto je lična higijena mjera bezbjednosti hrane", "prisecanje", [
 st("Zašto je lična higijena zaposlenog mjera bezbjednosti hrane, a ne samo pitanje urednosti?",
    ["Jer čovjek može prenijeti mikroorganizme na hranu i tako je učiniti nebezbjednom",
     "Jer tako izgleda bolje pred kupcem",
     "Jer to traži kolektivni ugovor",
     "Jer se tako čuva radna odjeća"]),
], sidro=True))

# =====================================================================
#  D6 — ČIŠĆENJE, DEZINFEKCIJA I KONTROLA ŠTETOČINA
# =====================================================================

P.append(por("F6.1", "D6", "Program i evidencija čišćenja", "primena", [
 st("Šta mora da sadrži pisani program čišćenja?",
    ["Šta se čisti, čime, kojom koncentracijom, koliko često, ko to radi i kako se provjerava",
     "Samo spisak sredstava koja se koriste",
     "Samo raspored smjena",
     "Samo ime firme koja održava higijenu"]),
 st("Očistio si komoru, ali evidenciju nisi popunio. Da li je posao završen?",
    ["Nije — neevidentirano čišćenje se pred inspekcijom tretira kao da nije ni urađeno",
     "Jeste, važno je da je očišćeno",
     "Jeste, evidencija se popunjava zbirno na kraju sedmice",
     "Jeste, ako je nadređeni vidio da je očišćeno"]),
 st("Zašto se koriste krpe različitih boja za različite zone?",
    ["Da se spriječi prenošenje prljavštine i mikroorganizama iz jedne zone u drugu",
     "Da se lakše prati potrošnja",
     "Zbog izgleda objekta",
     "Da svaki radnik ima svoju"]),
 st("Sredstvo za dezinfekciju je preliveno u neobilježenu plastičnu flašu jer je original potrošen. Šta je ispravno?",
    ["Sredstvo se drži isključivo u originalnoj ili jasno označenoj ambalaži, nikada u neobilježenoj",
     "U redu je ako svi znaju šta je unutra",
     "U redu je ako flaša nije bila za hranu",
     "U redu je dok se ne nabavi nova originalna ambalaža"]),
]))

P.append(por("F6.2", "D6", "Kontrola štetočina", "primena", [
 st("Primijetiš izmet glodara iza palete u suvom skladištu. Šta radiš?",
    ["Prijavljujem odmah, bilježim nalaz i tražim vanrednu intervenciju ovlašćene organizacije",
     "Čistim i ne pravim pitanje, dešava se",
     "Čekam redovnu deratizaciju",
     "Sam postavljam mamce koje imam kod kuće"]),
 st("Ko smije da postavlja mamce za glodare u objektu?",
    ["Registrovana, ovlašćena organizacija, po tlocrtu sa označenim mjestima",
     "Bilo koji zaposleni, ako zna gdje su rupe",
     "Vlasnik objekta lično",
     "Firma koja čisti objekat"]),
 st("Zašto se vodi tlocrt objekta sa numerisanim mamcima?",
    ["Da se svaki mamac može provjeriti, a nalaz upisati uz tačno mjesto",
     "Zbog osiguranja objekta",
     "Zbog protivpožarne zaštite",
     "Da se zna koliko je mamaca kupljeno"]),
 st("Šta je prvi korak kontrole štetočina, prije bilo kakvog sredstva?",
    ["Sprečavanje ulaska — zatvaranje otvora, mreže, redovno uklanjanje otpada i održavanje reda",
     "Postavljanje što više mamaca",
     "Prskanje cijelog skladišta",
     "Zamjena rasvjete"]),
]))

P.append(por("A6", "D6", "SIDRO — svrha preduslovnih programa", "prisecanje", [
 st("Čemu služe preduslovni programi kao što su čišćenje i kontrola štetočina?",
    ["Da stvore uslove u kojima HACCP uopšte može da radi — bez njih kritične kontrolne tačke ne drže",
     "Da se ispuni formalnost pred inspekciju",
     "Da se smanje troškovi održavanja",
     "Da se produži rok trajanja robe"]),
], sidro=True))

# =====================================================================
#  Raspored forme — sidra su raspoređena, ne na kraju
# =====================================================================
RASPORED = [
 "F1.1","F1.2","A1","F1.3",
 "F2.1","A2","F2.2","F2.3",
 "F3.1","F3.2","A3","F3.3",
 "F4.1","F4.2","A4","F4.3",
 "F5.1","A5","F5.2",
 "F6.1","A6","F6.2",
]

BANKA = {
 "_uputstvo": [
  "Banka pitanja za DISTRIBUCIJU HRANE — Crna Gora.",
  "Pravni osnov: Zakon o bezbjednosti hrane („Sl. list CG“ 57/15), Uredba o higijeni hrane,",
  "Zakon o zaštiti stanovništva od zaraznih bolesti („Sl. list CG“ 12/18, 64/20), Vodič UBH v1.0.",
  "Jezik je ijekavica — ne mijenjati u ekavicu za crnogorske klijente.",
  "Stavke sa \"zahteva_potvrdu\": true sadrže pravilo koje zavisi od HACCP plana klijenta.",
  "Dok je zahteva_potvrdu = true i potvrdio = null, stavka se NE servira.",
  "Klijent ne ocjenjuje pedagogiju — označava samo ono što je činjenično netačno kod njega.",
 ],
 "firma": {
  "naziv": "Distributer d.o.o.",
  "delatnost": "Skladištenje i distribucija hrane — veleprodaja",
  "standardi": ["HACCP", "Dobra higijenska praksa"],
  "_napomena": "Zamijeniti nazivom stvarnog klijenta prije prvog mjerenja.",
 },
 "program": {
  "naziv": "Bezbjednost hrane u distribuciji — godišnja obuka",
  "godina": 2026,
  "pravni_osnov": "Zakon o bezbjednosti hrane („Sl. list CG“ 57/15), čl. 44 i 46 · Uredba o higijeni hrane · Vodič za dobru higijensku praksu (UBH, v1.0, 03.05.2023)",
 },
 "nacrt": {
  "verzija": "1.0",
  "ukupno_stavki": len(RASPORED),
  "prag_teme": 70,
  "napomena": "Svaka tema ima najmanje dvije porodice i svoje sidro. Težina teme određena je nivoom rizika iz analize opasnosti, ne vremenom na obuci.",
 },
 "grupa": {
  "naziv": "Skladište i vozni park — godišnja obuka",
  "lokacija": "Skladište",
  "prefiks_sifre": "D",
  "broj_planiranih": 30,
  "_napomena": "prefiks: P proizvodnja · H hotelijerstvo · K konsalting · D distribucija",
 },
 "teme": [
  {"oznaka":"D1","naziv":"Prijem robe i hladni lanac","nivo_rizika":"kritican",
   "izvor":"HACCP plan — KKT 1 prijem"},
  {"oznaka":"D2","naziv":"Skladištenje, FIFO/FEFO i odvajanje","nivo_rizika":"kritican",
   "izvor":"HACCP plan — KKT 2 skladištenje"},
  {"oznaka":"D3","naziv":"Vozila, utovar i isporuka","nivo_rizika":"kritican",
   "izvor":"HACCP plan — KKT 3 utovar i prevoz"},
  {"oznaka":"D4","naziv":"Sledljivost, lot i povlačenje","nivo_rizika":"kritican",
   "izvor":"čl. 41 i 42 Zakona o bezbjednosti hrane; Pravilnik o sledljivosti 48/16"},
  {"oznaka":"D5","naziv":"Lična higijena i zdravstvena sposobnost","nivo_rizika":"visok",
   "izvor":"PRP-6; Zakon o zaštiti stanovništva od zaraznih bolesti, čl. 31"},
  {"oznaka":"D6","naziv":"Čišćenje, dezinfekcija i kontrola štetočina","nivo_rizika":"srednji",
   "izvor":"PRP-4 i PRP-5; Vodič UBH, Prilozi 2, 3, 11, 12"},
 ],
 "radna_mesta": [
  {"naziv":"Kontrolor prijema","povecan_rizik":True,
   "opis_poslova":"Prijem robe, mjerenje temperature, provjera dokumentacije, roka i ambalaže, odluka o prijemu ili odbijanju pošiljke",
   "sifre_opasnosti":["01","05","15","25"],
   "mere":"Mjerenje temperature svake pošiljke rizične robe ubodnim ili infracrvenim termometrom prije istovara; odbijanje pošiljke izvan tolerancije; upis odstupanja i korektivne mjere u Prilog 5",
   "lzo":"Radna odjeća, kapa, zaštitna obuća sa neklizajućim đonom, rukavice za rad na hladnom",
   "obavestenja":"HACCP plan — KKT 1; lista odobrenih dobavljača; tabela kritičnih granica po artiklu",
   "rukovodilac_prati":"Kontrolor prijema, Magacioner"},
  {"naziv":"Magacioner","povecan_rizik":True,
   "opis_poslova":"Smještaj robe po zonama i režimima, FIFO/FEFO, dnevno očitavanje temperatura komora, komisioniranje narudžbina, održavanje reda i higijene skladišta",
   "sifre_opasnosti":["01","03","15","25","30"],
   "mere":"Dnevno očitavanje i upis temperatura svake komore; odvajanje grupa robe; roba odignuta od poda; prijava odstupanja odmah po uočavanju",
   "lzo":"Radna odjeća, zaštitna obuća sa kapom, rukavice, jakna za rad u rashladnoj komori",
   "obavestenja":"HACCP plan — KKT 2; program čišćenja; tlocrt sa mjestima mamaca",
   "rukovodilac_prati":"Magacioner, Komisionar"},
  {"naziv":"Vozač — dostavljač","povecan_rizik":True,
   "opis_poslova":"Kontrola i priprema vozila, utovar, prevoz i isporuka hrane kupcima, mjerenje temperature pri utovaru i isporuci, predaja dokumentacije kupcu",
   "sifre_opasnosti":["01","05","15","20","25"],
   "mere":"Kontrola vozila prije svakog utovara (Prilog D1); predrashlađivanje komore; mjerenje temperature pri utovaru i isporuci (Prilog D2); zabrana predaje robe izvan granice",
   "lzo":"Radna odjeća, zaštitna obuća, rukavice, jakna za rad na hladnom",
   "obavestenja":"HACCP plan — KKT 3; uputstvo za slaganje robe u komori; redoslijed ture",
   "rukovodilac_prati":"Vozač — dostavljač"},
  {"naziv":"Komisionar","povecan_rizik":False,
   "opis_poslova":"Priprema narudžbina po nalogu, provjera roka i oznake serije pri komisioniranju, priprema robe za utovar",
   "sifre_opasnosti":["01","15","25"],
   "mere":"Provjera roka trajanja i oznake serije pri svakom uzimanju robe; primjena pravila FEFO; izdvajanje robe sa oštećenom ambalažom",
   "lzo":"Radna odjeća, zaštitna obuća, rukavice",
   "obavestenja":"Pravilo FEFO; uputstvo za komisioniranje; lista artikala sa temperaturnim režimom",
   "rukovodilac_prati":"Komisionar"},
  {"naziv":"Odgovorno lice za bezbjednost hrane","povecan_rizik":False,
   "opis_poslova":"Održavanje HACCP sistema, verifikacija zapisa, odluka o upotrebljivosti robe nakon odstupanja, vođenje postupka povlačenja, komunikacija sa nadležnim organom",
   "sifre_opasnosti":["25"],
   "mere":"Mjesečni pregled zapisa i potpis; godišnja interna provjera; godišnja vježba povlačenja; preispitivanje plana pri svakoj izmjeni procesa",
   "lzo":"Radna odjeća i obuća pri obilasku objekta",
   "obavestenja":"Cjelokupan HACCP plan; rješenje o registraciji objekta; kontakt nadležnog organa",
   "rukovodilac_prati":"Sva radna mjesta"},
 ],
 "porodice": P,
 "raspored_forme": RASPORED,
}

# --------------------------------------------------------------- provjere
oznake = [p["oznaka"] for p in P]
assert len(oznake) == len(set(oznake)), "duple oznake porodica"
for o in RASPORED:
    assert o in oznake, f"raspored traži nepostojeću porodicu {o}"
assert len(RASPORED) == len(set(RASPORED)), "duple stavke u rasporedu"
for p in P:
    n = len(p["stavke"])
    assert n == (1 if p["je_sidro"] else 4), f"{p['oznaka']}: {n} varijanti"
    for s in p["stavke"]:
        t = [o for o in s["opcije"] if o["tacna"]]
        assert len(t) == 1, f"{p['oznaka']} v{s['varijanta']}: {len(t)} tačnih"
        assert len(s["opcije"]) == 4, f"{p['oznaka']} v{s['varijanta']}: nije 4 opcije"
teme_u_por = {p["tema"] for p in P}
for t in BANKA["teme"]:
    assert t["oznaka"] in teme_u_por, f"tema {t['oznaka']} nema nijednu porodicu"
    n = len([p for p in P if p["tema"] == t["oznaka"] and not p["je_sidro"]])
    assert n >= 2, f"tema {t['oznaka']} ima samo {n} porodica — sud o pojedincu ne stoji"
    assert any(p["tema"] == t["oznaka"] and p["je_sidro"] for p in P), \
        f"tema {t['oznaka']} nema sidro"

with io.open("db/banka_distributeri_cg.json", "w", encoding="utf-8") as f:
    json.dump(BANKA, f, ensure_ascii=False, indent=1)

print(f"OK · porodica: {len(P)} · stavki u formi: {len(RASPORED)} · "
      f"ukupno pitanja: {sum(len(p['stavke']) for p in P)} · tema: {len(BANKA['teme'])}")
