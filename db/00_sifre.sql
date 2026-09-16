-- =====================================================================
--  ŠIFRE IZ PRAVILNIKA — stalni podaci, isti za sve klijente
--  Pravilnik o načinu vođenja i rokovima čuvanja evidencija u oblasti
--  bezbednosti i zdravlja na radu ("Sl. glasnik RS", br. 5/2025, 38/2025,
--  118/2025 i 57/2026), član 8 — Obrazac 6.
-- =====================================================================

-- Slučaj, odnosno razlog izvršene obuke
INSERT INTO sifra_razloga (sifra, opis) VALUES
 ('01','prilikom zasnivanja radnog odnosa, odnosno drugog radnog angažovanja'),
 ('02','usled premeštaja na druge poslove'),
 ('03','prilikom uvođenja nove tehnologije ili novih sredstava za rad ili promene opreme za rad'),
 ('04','prilikom promene radnog procesa'),
 ('05','ako poslodavac odredi zaposlenom da obavlja poslove na dva ili više radnih mesta'),
 ('06','ako kod poslodavca rad obavljaju zaposleni drugog poslodavca'),
 ('07','dodatna obuka kada to zahteva radni proces'),
 ('08','dodatna obuka u slučaju teške, smrtne ili kolektivne povrede na radu'),
 ('09','periodična obuka zaposlenih'),
 ('10','obuka neposrednih rukovodilaca')
ON CONFLICT (sifra) DO UPDATE SET opis = EXCLUDED.opis;

-- Opasnosti i štetnosti na osnovu kojih je izvršena procena rizika
INSERT INTO sifra_opasnosti (sifra, opis, grupa) VALUES
 ('01','nedovoljno zaštićeni rotirajući i/ili pokretni delovi koji mogu zdrobiti, odseći, ubosti, udariti, zahvatiti ili povući zaposlenog','mehaničke'),
 ('02','slobodno kretanje delova ili materijala koji mogu naneti povredu zaposlenom','mehaničke'),
 ('03','unutrašnji transport i kretanje mašina ili vozila','mehaničke'),
 ('04','opasnost od eksplozije i požara','mehaničke'),
 ('05','nemogućnost pravovremenog napuštanja mesta rada, izloženost zatvaranju, mehaničkom udaru, poklapanju','mehaničke'),
 ('06','drugi faktori koji mogu da se pojave kao izvori mehaničkih opasnosti','mehaničke'),
 ('07','opasne površine — oštre ivice, šiljci, grube i izbočene površine','radno mesto'),
 ('08','rad na visini ili rad u dubini','radno mesto'),
 ('09','rad u skučenom, ograničenom ili opasnom prostoru','radno mesto'),
 ('10','mogućnost klizanja ili spoticanja — mokre i klizave površine','radno mesto'),
 ('11','fizička nestabilnost radnog mesta','radno mesto'),
 ('12','moguće posledice ili smetnje usled obaveznog korišćenja lične zaštitne opreme','radno mesto'),
 ('13','uticaji usled obavljanja procesa rada neodgovarajućim ili neprilagođenim metodama rada','radno mesto'),
 ('14','druge opasnosti u vezi sa karakteristikama radnog mesta i načinom rada','radno mesto'),
 ('15','opasnosti od električnog udara u normalnim uslovima rada','električne'),
 ('16','opasnosti od električnog udara u slučaju nastanka kvara','električne'),
 ('17','opasnosti od toplotnog dejstva električne opreme i instalacija','električne'),
 ('18','opasnosti usled udara groma i posledica atmosferskog pražnjenja','električne'),
 ('19','opasnosti od štetnog uticaja elektrostatičkog naelektrisanja','električne'),
 ('20','druge opasnosti u vezi sa korišćenjem električne energije','električne'),
 ('21','opasnosti od fizičkih i hemijskih svojstava hemijskih materija — eksplozivnost, zapaljivost, samoreaktivnost','hemijske'),
 ('22','druge opasnosti u radnom procesu koje mogu biti uzrok povrede ili oboljenja','ostale opasnosti'),
 ('23','hemijske štetnosti — toksičnost, karcinogenost, mutagenost, nedostatak kiseonika','štetnosti'),
 ('24','azbest','štetnosti'),
 ('25','fizičke štetnosti — buka i vibracije','štetnosti'),
 ('26','biološke štetnosti — mikroorganizmi, ćelijske kulture, ljudski endoparaziti','štetnosti'),
 ('27','štetni uticaji mikroklime — temperatura, vlažnost, brzina strujanja vazduha','štetnosti'),
 ('28','neodgovarajuća, nedovoljna osvetljenost','štetnosti'),
 ('29','štetni uticaji jonizujućeg ili nejonizujućeg zračenja','štetnosti'),
 ('30','štetni klimatski uticaji pri radu na otvorenom','štetnosti'),
 ('31','druge štetnosti u radnom procesu','štetnosti'),
 ('32','napori ili telesna naprezanja — ručno prenošenje, guranje ili vučenje tereta','organizacija rada'),
 ('33','nefiziološki položaj tela — dugotrajno stajanje, sedenje, čučanje, klečanje','organizacija rada'),
 ('34','napori koji prouzrokuju psihološka opterećenja — stres, monotonija','organizacija rada'),
 ('35','odgovornost u primanju i prenošenju informacija, intenzitet rada, konfliktne situacije','organizacija rada'),
 ('36','štetnosti vezane za organizaciju rada — prekovremeni rad, rad u smenama, rad noću','organizacija rada'),
 ('37','štetnosti koje prouzrokuju druga lica — nasilje prema zaposlenima','organizacija rada'),
 ('38','rad sa životinjama','organizacija rada'),
 ('39','rad u atmosferi sa visokim ili niskim pritiskom','organizacija rada'),
 ('40','rad u blizini vode ili ispod površine vode','organizacija rada')
ON CONFLICT (sifra) DO UPDATE SET opis = EXCLUDED.opis, grupa = EXCLUDED.grupa;
