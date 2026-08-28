# Användarfeedback: Thor Olof Philogène, 2026-08-26 (brief till Renofine-agenten)

*Källa: Calles egna anteckningar samma kväll (inspelningen blev 0 byte), 30 min video.
Vem: medgrundare/VD Stravito (Comcast, Electrolux, Danone som kunder), tidigare CRO på iZettle
där han byggde growth-organisationen från 1 till 200 personer. Kommersiell ledare som blev
grundare-VD, alltså exakt den typ av person som avgör om ett bygge kan bli ett bolag.
Referat, inte citat. Ordnat efter hur hårt han tryckte.*

## Vad han sa (gäller båda produkterna)

1. **Sluta koda. Inte en rad till.** Ersättningen är samtal med användare, tio i veckan.
   "Det ger guld." Religionen ska vara användare, inte features.
2. **Välj EN produkt.** Renofine och Produlog samtidigt går inte.
3. **Välj EN kund inom den.** För Renofine: hemägare eller proffs? Måste väljas. Prislappen är
   inte hela kalkylen: 1000 hemägare à 100 kr slår 100 byggare à 500 kr i intäkt, men hemägare
   churnar lättare. Volym mot uthållighet.
4. **Vitamin eller smärtstillande?** Det ena är nödvändigt, det andra trevligt. Vet vilket du bygger.
5. **Testet för nödvändighet:** vad är alternativet till appen? Hur lätt byter kunden om appen
   försvinner i morgon? Hur ont gör det? Litet svar = vitamin.
6. **Vem på kundbolaget säljer jag TILL?** Salesforce säljs inte till säljare utan till
   sales managers. Skillnaden styr hela produkten.
7. **PMF är inte ett par betalande kunder.** PMF är när förfrågningarna inte går att hinna med.
8. **Konkret idé: överväg att klona Bygglet** om det är den sektorn Renofine vill åt.
   (Se `docs/vinn-bygglet-kunder-2026-08.md`, som oberoende landade i samma riktning.)
9. Y Combinator, starkt rekommenderat.
10. Kapital förutsätter svar på allt ovan.

Han var genuint imponerad av byggena, och tyckte det var rätt att båda produkterna föddes ur
egna pain points. Men: **egen smärta duger för att hitta problemet, inte som bevis för vem som
betalar.** Ett urval på en person, som dessutom är byggaren, är inte validering.

## Calles egen slutsats (viktigast)

"Han dyrkar användare och det gör jag med, men jag har inte vågat eller orkat jobba för det.
Bekvämare att bygga features och rätta buggar med Claude Code." Råden är kända sanningar;
erkännandet är nytt. Det är det som ska ändra hur den här agenten jobbar.

## Vad det betyder för Renofine-agenten, konkret

- **Inga nya feature-kort ur den här briefen.** Det Thor bad om är motsatsen till fler features.
  Allt agenten föreslår härifrån går som BACKLOG-kort taggade `user-research`, aldrig som tysta byggen.
- **Hemägare eller proffs är ett öppet val som ska STÄNGAS med data, inte med känsla.**
  Sprint-briefen pekar på entreprenörer (flerspråkiga bygglag, Bygglet-kunder). Behandla det
  som huvudhypotes, och bygg underlaget som gör att Calle kan välja: vilka tio personer ska
  han prata med, vilka fem frågor avgör (alternativlösning, bytesbenägenhet, vem betalar,
  vem beslutar, vad gör ont i dag), och var i appen mätningen syns.
- **Vitamin/smärtstillande-testet per flöde.** Gå igenom offert-tolkningen, röstrapporten,
  fältvyn och månadsskiftet (timmar→faktura, moms, SIE4) och sätt en ärlig etikett på var och
  en: skulle en firma få ont om just det försvann i morgon? Skriv ner det, med skälet.
- **Vem köper.** Firmaägaren betalar, platschefen använder, revisorn ser resultatet. Avgör
  vilken av dem produkten säljs TILL och låt det styra prioriteringen. Personorna
  `firmaagare.md` och `platschef.md` finns redan; använd dem för den här frågan.
- **Intervjukit.** Ett dokument agenten kan producera utan att röra kod: manus för ett
  20-minuters användarsamtal, lista på var kandidater finns (Bygglet-forum, Facebook-grupper i
  `.claude/briefs/fb-launch-kit.md`, befintliga betaanvändare i databasen), och en mall för
  att logga varje samtal så att hypoteserna kan uppdateras. Lägg det i `docs/`.
- **Siffrorna som ramar allt** (PostHog 2026-08-23): 1075 unika besökare sedan mars, 11 konton,
  5 personer som använt Renaida på riktigt, augusti i praktiken bara Calle. Det är utgångsläget
  och ska stå i varje resonemang om prioritering.

## Öppet, för Calle att besluta (inte agenten)

- Löftet att inte koda gavs aldrig i rummet. Beslut krävs.
- Vilken produkt som väljs. Den här briefen ligger i båda repona av det skälet.
