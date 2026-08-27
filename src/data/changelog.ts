export interface ChangelogEntry {
  date: string;
  title: string;
  description: string;
  tags?: string[];
  demoPath?: string; // Path to demo project section, e.g. "/projects/DEMO_ID#arbeten"
}

/** Demo project ID for public links */
export const DEMO_PROJECT_PATH = "/projects/demo";

export const changelog: ChangelogEntry[] = [
  // ── 2026-08-26 ──
  {
    date: "2026-08-26",
    title: "\"Från fältet\" — hantverkaren berättar om dagen, du får den på svenska",
    description: "Din hantverkare öppnar sin länk och berättar vad som hänt under dagen — med egna ord, på sitt eget språk, gärna med ett foto. Du får det översatt i en egen inkorg på Översikt: vad som blev klart, vad som behöver köpas och vad hen undrar över. Hantverkaren behöver inte välja meddelandetyp eller fylla i något formulär, och en enda rapport kan bli flera rader hos dig.",
    tags: ["Fältet", "Arbeten", "Nyhet"],
  },
  {
    date: "2026-08-26",
    title: "Den som hellre pratar än skriver kan göra det",
    description: "Håll in mikrofonen och berätta i stället för att skriva. Inspelningen skrivs ut till text åt dig, så rapporten går att läsa och söka i som vilken annan som helst — du behöver aldrig lyssna igenom ett röstmeddelande för att veta vad som hände på bygget.",
    tags: ["Fältet", "Renaida", "Förbättring"],
  },
  {
    date: "2026-08-26",
    title: "Timmarna kommer med rapporten — du godkänner eller nekar",
    description: "Hantverkaren kan lägga till hur många timmar dagen tog i samma rapport som allt annat. Du ser dem som ett kort att godkänna eller neka, och ingenting hamnar i projektet förrän du sagt ja. Slut på att samla ihop tider via sms i efterhand.",
    tags: ["Fältet", "Budget", "Nyhet"],
  },
  {
    date: "2026-08-26",
    title: "Du ser när hantverkaren har läst jobbet",
    description: "När hantverkaren öppnat sitt arbete och tryckt \"Jag har läst jobbet\" syns det på teamet. Du slipper ringa och fråga om instruktionerna gått fram.",
    tags: ["Fältet", "Arbeten", "Förbättring"],
  },
  {
    date: "2026-08-26",
    title: "Tio språk i arbetarvyn",
    description: "Arbetarvyn finns på svenska, engelska, tyska, franska, spanska, polska, ukrainska, rumänska, litauiska och estniska. Byter hantverkaren språk översätts arbetena, rummen och instruktionerna med — första gången ett nytt språk väljs tar det någon sekund extra, sedan ligger det sparat.",
    tags: ["Fältet", "Förbättring"],
  },
  {
    date: "2026-08-26",
    title: "Din renoveringsplan på under en minut — utan konto",
    description: "Skriv vad du ska renovera på startsidan så får du en riktig plan tillbaka: kostnadsspann per rum, vad ROT-avdraget kan dra av, i vilken ordning yrkena behöver komma in och vad som brukar glömmas bort. Ingen inloggning och inget kort — och vill du jobba vidare på planen tar du den med dig in i ett projekt.",
    tags: ["Planering", "ROT", "Nyhet"],
  },
  {
    date: "2026-08-26",
    title: "Kalibrera skalan — bakgrundsbilden blir en ritning att bygga efter",
    description: "Lägg in en ritning eller en handskiss som lager och peka ut ett mått du redan känner till, till exempel en dörrbredd eller en vägg. Då vet planritaren hur många millimeter en bildpunkt är, och allt du ritar ovanpå får riktiga mått i stället för att vara en gissning.",
    tags: ["Canvas", "Planering", "Nyhet"],
  },
  {
    date: "2026-08-26",
    title: "Ritningen kan komma ur projektets filer — även som PDF",
    description: "Du behöver inte leta upp filen på datorn en gång till. Välj en ritning som redan ligger bland projektets filer, och är det en PDF med flera sidor väljer du själv vilken sida som ska bli lagret.",
    tags: ["Canvas", "Filer", "Förbättring"],
  },
  {
    date: "2026-08-26",
    title: "Låt Renaida rita av planen steg för steg",
    description: "Renaida ritar av ditt inlagda lager i tre omgångar — först rummen, sedan väggarna, sedan detaljerna — och du godkänner varje steg innan nästa börjar. Blir något fel ångrar du bara det steget i stället för hela avritningen.",
    tags: ["Canvas", "Renaida", "Nyhet"],
  },
  {
    date: "2026-08-26",
    title: "Bilderna sorterade: Före, Pågående, Färdigt och Inspiration",
    description: "Projektets bilder har fått en egen sortering med antal per kategori. Moodboarden visar bara inspirationsbilder, kvitton hamnar inte längre bland dem, och före/efter-jämförelsen dyker upp när du faktiskt har både en före- och en efterbild.",
    tags: ["Filer", "Projektvy", "Förbättring"],
  },

  // ── 2026-08-25 ──
  {
    date: "2026-08-25",
    title: "Släpp en hel mapp — och stäm av innan något sparas",
    description: "Dra in en mapp med offerter, ritningar och kvitton så läser Renaida igenom den och visar ett förslag: vilka rum, arbeten och inköp hon hittat, med originalet bredvid så du kan kontrollera varje sak. Du bockar av det som stämmer innan något läggs till i projektet — och rum som redan finns känns igen i stället för att skapas som dubbletter.",
    tags: ["Filer", "Renaida", "Nyhet"],
  },
  {
    date: "2026-08-25",
    title: "Se var filerna hamnar, och flytta dem innan du godkänner",
    description: "När du släpper en mapp visar vi nu hur många filer som hamnar i varje mapp, och du kan byta mapp på varje enskild fil. Flytten sker först när du godkänner — inte medan du fortfarande funderar.",
    tags: ["Filer", "Förbättring"],
  },
  {
    date: "2026-08-25",
    title: "Arbeten och Inköp syns direkt i rumslistan",
    description: "Rumslistan har fått två nya kolumner, så du ser hur mycket som är planerat i varje rum utan att behöva öppna det.",
    tags: ["Arbeten", "Inköp", "Projektvy", "Förbättring"],
  },

  // ── 2026-08-24 ──
  {
    date: "2026-08-24",
    title: "Spara bostadens papper på adressen — inte i ett projekt",
    description: "Köpekontrakt, energideklaration, föreningsstadgar och besiktningsprotokoll hör till bostaden, inte till en enskild renovering. Nu sparar du dem på adressen i stället, så ligger de kvar när projektet är avslutat och finns där nästa gång du ska göra något.",
    tags: ["Filer", "Nyhet"],
  },
  {
    date: "2026-08-24",
    title: "Adressen föreslås ur dina egna dokument",
    description: "Laddar du upp ett dokument som innehåller bostadens adress föreslår Renaida den åt dig — du behöver bara bekräfta att den stämmer. Avsändarens adress föreslås aldrig, så en mäklares eller en byggfirmas kontorsadress hamnar inte på din bostad av misstag.",
    tags: ["Renaida", "Nyhet"],
  },
  {
    date: "2026-08-24",
    title: "ROT-avdraget fungerar nu även för dig som bor i bostadsrätt",
    description: "ROT-beräkningen krävde tidigare en fastighetsbeteckning — något du som bor i bostadsrätt aldrig kan fylla i, vilket gjorde att avdraget inte gick att räkna med. Nu väljer du upplåtelseform och fyller i det som gäller just dig: fastighetsbeteckning för småhus, föreningens organisationsnummer och lägenhetsnummer för bostadsrätt.",
    tags: ["ROT", "Budget", "Förbättring"],
  },

  // ── 2026-08-17 ──
  {
    date: "2026-08-17",
    title: "Fota ett kvitto — Renaida matchar det mot din inköpslista",
    description: "När du fotar eller laddar upp ett kvitto eller en faktura till Renaida känner hon nu igen vad du köpt och matchar det automatiskt mot de material du redan planerat. Du ser matchningen innan något sparas (\"Kakel Carrara → Kakel badrum\") och kan bekräfta, byta eller boka posten som en ÄTA utanför budgeten. Beloppet hamnar på rätt planerad rad istället för att dubbelräknas — så din materialbudget stämmer utan handpåläggning.",
    tags: ["Renaida", "Inköp", "Budget", "Nyhet"],
  },
  {
    date: "2026-08-17",
    title: "Renaida är nu vägen in när du skapar ett projekt",
    description: "Vi har samlat allt skapande under en enda knapp. Istället för flera olika guider möter du nu Renaida direkt — hon ställer frågorna, bygger upp rummen och arbetena åt dig och känns som att prata med någon som kan renovering. Enklare att komma igång, svårare att gå vilse.",
    tags: ["Renaida", "Planering", "Förbättring"],
  },
  {
    date: "2026-08-17",
    title: "Ditt utkast finns kvar om du stänger mitt i",
    description: "Blev du avbruten när du höll på att skapa ett projekt med Renaida? Nu sparas utkastet automatiskt. Öppnar du henne igen fortsätter du precis där du var — inga förlorade svar, inget om-från-början. När projektet väl skapas rensas utkastet.",
    tags: ["Renaida", "Planering", "Förbättring"],
  },
  {
    date: "2026-08-17",
    title: "Renaida föreslår vilket material du kan behöva köpa",
    description: "När du planerar ett projekt frågar Renaida numera \"Ska vi planera några materialinköp?\" och föreslår poster utifrån arbetena du valt — kakel, spackel, färg och så vidare. Du redigerar fritt och behöver inte skriva några belopp. Det blir en färdig inköpslista som senare fylls i automatiskt när du fotar kvittona.",
    tags: ["Renaida", "Inköp", "Planering", "Nyhet"],
  },
  {
    date: "2026-08-17",
    title: "En försiktig uppskattning av tid och mängder — helt frivilligt",
    description: "Berättar du ytan och takhöjden för ett rum kan Renaida ge en försiktig uppskattning av hur mycket arbetstid och material det kan handla om. Inga kronor och ören, bara en känsla för omfattningen så du vet ungefär vad som väntar. Vill du hoppa över det går det lika bra.",
    tags: ["Renaida", "Hemägare", "Planering", "Nyhet"],
  },
  {
    date: "2026-08-17",
    title: "Välj själv: fortsätt planera eller sätt igång direkt",
    description: "När Renaida är klar med ditt projekt får du välja på plats — vill du finslipa planeringen först, eller aktivera projektet och köra igång direkt? Ett steg mindre för dig som redan vet vad du vill.",
    tags: ["Renaida", "Planering", "Förbättring"],
  },

  // ── 2026-08-15 ──
  {
    date: "2026-08-15",
    title: "Radera en rumsritning utan att tappa rummet",
    description: "När du raderar en rumsform på ritningen frågar vi nu vad du menar: ta bort både ritningen och rummet, eller bara ritningen och behålla rummet med alla dess detaljer. Inga rum försvinner längre av misstag, och inga \"spökrum\" blir kvar i listan.",
    tags: ["Canvas", "Planering", "Förbättring"],
  },
  {
    date: "2026-08-15",
    title: "Se exakt vad din kund ser",
    description: "I Team-fliken kan du nu öppna \"Se exakt vad {namn} ser\" på en inbjuden kund och få upp den riktiga, maskade kundvyn. Ingen gissning om vad som delas — du ser precis samma sida som kunden, utan interna priser eller marginaler. Skönt att kunna dubbelkolla innan du bjuder in.",
    tags: ["Team", "Delning", "Förbättring"],
  },

  // ── 2026-08-14 ──
  {
    date: "2026-08-14",
    title: "Samlad aktivitet per arbetare i Team",
    description: "Fäll ut en teammedlem för att se allt hen bidragit med på ett ställe: frågor, meddelanden, statusuppdateringar och uppladdade foton (med förhandsvisning i lightbox). Perfekt när du delegerar och vill följa vad som händer utan att jaga runt i projektet.",
    tags: ["Team", "Förbättring"],
  },
  {
    date: "2026-08-14",
    title: "Öppnad eller inte — se om arbetaren tagit del av jobbet",
    description: "En \"Öppnad / Ej öppnad\"-markering visas nu per arbetare i Team-fliken, så du vet om personen du skickat ett jobb till faktiskt har öppnat sin länk.",
    tags: ["Team", "Förbättring"],
  },
  {
    date: "2026-08-14",
    title: "Rätta rum och arbeten direkt i granska-läget",
    description: "När du granskar ett förslag från Renaida (eller en importerad mapp) kan du nu redigera rumsnamn, ytor och arbetstitlar på plats — utan att lämna granskningen. Döper du om ett rum följer arbetena med automatiskt.",
    tags: ["Renaida", "Planering", "Förbättring"],
  },
  {
    date: "2026-08-14",
    title: "Loggad tid syns på arbetskortet",
    description: "Som hemägare ser du nu hur mycket tid som lagts på ett arbete direkt på kortets översikt (\"X h av ~Y h\"), utan att öppna Tid-fliken.",
    tags: ["Tid", "Hemägare", "Förbättring"],
  },
  {
    date: "2026-08-14",
    title: "Fota direkt från arbetskortet på mobilen",
    description: "En \"Fota\"-knapp högst upp på arbetskortet öppnar kameran med ett tryck — smidigt när du står på plats och vill dokumentera.",
    tags: ["Mobil", "Filer", "Förbättring"],
  },

  // ── 2026-08-13 ──
  {
    date: "2026-08-13",
    title: "Renaida mitt i mobilmenyn — fånga allt på språng",
    description: "På mobilen har Renaida flyttat till en upphöjd knapp mitt i nedre menyn. Öppna henne och välj direkt: fota kvitto, logga tid, snabbanteckning eller statusuppdatering. Ett handgrepp från var du än är i appen — gjord för dig som är ute på bygget.",
    tags: ["Renaida", "Mobil", "Ny funktion"],
  },
  {
    date: "2026-08-13",
    title: "Installera Renofine som app — dela foton rakt in i Renaida",
    description: "Lägg till Renofine på hemskärmen och kör den som en app. Du kan nu också dela ett foto eller en PDF från valfri app rakt in i Renaida, som direkt föreslår vad det ska bli — till exempel en inköpsorder från ett kvitto.",
    tags: ["Mobil", "Renaida", "Ny funktion"],
  },
  {
    date: "2026-08-13",
    title: "Renaida säger till om något viktigt saknas",
    description: "När Renaida hjälper dig skapa ett projekt gör hon en sista koll och flaggar kritiska arbeten som är lätta att glömma — som tätskikt, rivning eller ventilation — med förslag på vilket rum de hör till och varför. Du väljer själv vad som läggs till.",
    tags: ["Renaida", "AI", "Förbättring"],
  },
  {
    date: "2026-08-13",
    title: "Arbetarens frågor och foton når din notisklocka",
    description: "Nu får du en notis när en inbjuden arbetare ställer en fråga, laddar upp ett foto eller uppdaterar status — och klicket tar dig rakt till rätt uppgift eller ritning. Tidigare kunde arbetarens aktivitet passera obemärkt; nu missar du inget.",
    tags: ["Team", "Notiser", "Förbättring"],
  },
  {
    date: "2026-08-13",
    title: "Se exakt vad din arbetare ser — på hens språk eller ditt",
    description: "Öppna en förhandsvisning av precis den vy din inbjudna hantverkare får: väggvyer, objekt, noteringar och ytskikt, fullt översatt till hens språk. Växla med en knapp mellan att visa på arbetarens språk och att visa på svenska, så du förstår vad som faktiskt gått fram. Även texten på dina instruktionsbilder översätts nu.",
    tags: ["Team", "i18n", "Förbättring"],
  },

  // ── 2026-08-12 ──
  {
    date: "2026-08-12",
    title: "Snabboffert för byggare — från idé till offert på minuter",
    description: "Som byggare kan du nu skapa en offert blixtsnabbt: beskriv jobbet för Renaida (skriv, prata eller fota), så föreslår hon rum, arbeten och en kalkyl med dina egna timpriser och påslag. Välj \"direkt till offert\" eller \"granska & justera kalkylen\" först. När kunden accepterar aktiveras projektet automatiskt.",
    tags: ["Offert", "Renaida", "Ny funktion"],
  },
  {
    date: "2026-08-12",
    title: "Säg ditt timpris en gång — appen minns det",
    description: "Säg eller skriv \"mitt timpris är 640\" så sparas det i din profil och används i alla kalkyler och offerter framåt (med Ångra om du ändrar dig). Kalkylens timcell visar dessutom en liten formel-tagg så du ser hur siffran räknades fram.",
    tags: ["Offert", "Budget", "Förbättring"],
  },
  {
    date: "2026-08-12",
    title: "Planera med Renaida eller guiden — på nya och befintliga projekt",
    description: "Du väljer själv verktyg: den snabba guiden eller ett samtal med Renaida. Båda fungerar nu både för att skapa ett helt nytt projekt och för att fylla på ett du redan har. Inget är låst till det ena eller andra.",
    tags: ["Planering", "Renaida", "Förbättring"],
  },
  {
    date: "2026-08-12",
    title: "Renaida visar vägen till faktura och ÄTA",
    description: "Be Renaida om en ny faktura eller en ÄTA så tar hon dig direkt till rätt ställe, förifyllt — i stället för att du ska leta i menyerna.",
    tags: ["Renaida", "ÄTA", "Faktura"],
  },

  // ── 2026-08-11 ──
  {
    date: "2026-08-11",
    title: "Släpp en hel mapp — Renaida bygger projektet",
    description: "Har du redan foton, ritningar, offerter och kvitton i en mapp? Dra in hela mappen så sorterar Renaida innehållet automatiskt: foton och dokument läses, rum och arbeten föreslås, kvitton blir inköpsordrar. Hon frågar bara om det som saknas (\"vilket rum?\") och du bekräftar varje rad innan projektet föds.",
    tags: ["Renaida", "Planering", "Ny funktion"],
  },
  {
    date: "2026-08-11",
    title: "Fota en planritning — få rum och en grovskiss",
    description: "Ligger det en planritning bland dina filer känner Renaida igen den, läser ut rumsnamnen och lägger in en grovskiss i planritningen åt dig. Ett försprång i stället för en tom canvas.",
    tags: ["Renaida", "Canvas", "AI"],
  },
  {
    date: "2026-08-11",
    title: "Renaida anpassar sig efter dig som byggare",
    description: "Skapar du som proffs frågar Renaida om kunden (så offerten adresseras rätt) och om overhead — etablering, rivning & bortforsling, ställning, byggstädning och en ÄTA-buffert. När projektet är klart erbjuder hon sig att förbereda en offert till din kund direkt.",
    tags: ["Renaida", "Offert", "Förbättring"],
  },

  // ── 2026-08-10 ──
  {
    date: "2026-08-10",
    title: "Skapa projekt genom att prata med Renaida",
    description: "Ett helt nytt sätt att starta: i stället för en tom sida för du ett kort samtal med Renaida och projektet växer fram framför dig, bit för bit. Hon frågar om rum och arbeten, föreslår tillval du kanske glömt (golvvärme, handdukstork, nisch) och fyller på budget — på svenska, engelska, tyska, franska eller spanska. Finns för både hemägare och proffs.",
    tags: ["Renaida", "Onboarding", "Ny funktion"],
  },
  {
    date: "2026-08-10",
    title: "Prata, fota eller skriv — allt blir samma utkast",
    description: "Renaida tar emot på det sätt som passar dig: prata in en beskrivning med rösten, fota ett rum eller en anteckning, eller skriv. Allt landar i samma utkast som du sedan finjusterar. Varje rad visar var den kom ifrån (röst, foto, text) och kan tas bort eller läggas tillbaka med ett klick.",
    tags: ["Renaida", "AI", "Ny funktion"],
  },

  // ── 2026-08-09 ──
  {
    date: "2026-08-09",
    title: "Ny ritningseditor — snabbare och mjukare, som Figma",
    description: "Planritningen på desktop körs nu i en helt omarbetad editor: smidigare markering, dra-handtag för att skala former, lager och stil (fyllnad, kontur, text), väggtjocklek och -höjd med färdiga väggtyper, och en kalkerbild du kan lägga under och kalibrera för att rita av en befintlig planritning. Mobilen är oförändrad tills vidare, och du kan alltid växla tillbaka till den gamla vyn.",
    tags: ["Canvas", "Design", "Ny funktion"],
  },
  {
    date: "2026-08-09",
    title: "Korrekt enhetskonvertering för ytor och volymer",
    description: "För projekt som använder brittiska eller amerikanska enheter räknas ytor och volymer nu om på riktigt — inte bara etiketten. Tidigare kunde en yta visa \"sq ft\" på ett tal som egentligen fortfarande var i kvadratmeter; nu stämmer siffran med enheten i rumslistor och sammanställningar.",
    tags: ["Internationellt", "Enheter", "Buggfix"],
  },

  // ── 2026-08-04 ──
  {
    date: "2026-08-04",
    title: "Objekt på ritningen färgkodas och kopplas till arbeten",
    description: "El, VVS, kök och ventilation får nu en tydlig färgton på ritningen — allt el syns i en blick. Placerar du ett objekt kan det kopplas automatiskt till rätt arbete, och du kan filtrera vad som visas per kategori. Arbetaren ser i sin tur bara det som rör hens uppgift.",
    tags: ["Canvas", "Planering", "Förbättring"],
  },
  {
    date: "2026-08-04",
    title: "Fria former och gruppering på ritningen",
    description: "Rita linjer, rektanglar och cirklar direkt på planritningen, och gruppera flera former till en enhet med eget namn och uppmätta mått — markera en så följer hela gruppen med, precis som i Figma.",
    tags: ["Canvas", "Design", "Förbättring"],
  },
  {
    date: "2026-08-04",
    title: "Dina noteringar når arbetaren på hens språk",
    description: "Väggnoteringar och objektens finish och kulör översätts nu automatiskt till arbetarens språk i samma steg som meddelanden — och NCS-färgkoder bevaras exakt.",
    tags: ["i18n", "Team", "Förbättring"],
  },

  // ── 2026-07-10 ──
  {
    date: "2026-07-10",
    title: "Skicka PDF:er till Renaida — offerter öppnar granskningen åt dig",
    description: "Gem-knappen i Renaida-panelen tar nu även PDF:er. En faktura eller ett kvitto som PDF blir samma bekräfta-först-förslag som ett foto, med underlaget sparat på ordern. Och laddar du upp en offert eller en arbetsbeskrivning känner Renaida igen den och öppnar rätt granskningsyta åt dig — förifylld med rum, arbeten och belopp — i stället för att du ska leta upp importen själv. Efteråt kvitterar hon i panelen vad som lades in.",
    tags: ["Renaida", "Inköp", "Planering", "Ny funktion"],
  },
  {
    date: "2026-07-10",
    title: "Renaida ångrar på uppmaning och tappar aldrig tråden",
    description: "Skriv \"ångra\" så backar Renaida sin senaste ändring — utan omvägar. Konversationen (och Ångra-knappen) överlever nu också flikbyten och navigering, så du kan kolla resultatet och ångra efteråt. Dessutom: förslagskorten visar årtal på äldre kvitton, varnar när radbeloppen inte summerar till totalen, och en bild som inte är ett kvitto får ett ärligt \"kunde inte läsa\" i stället för ett gissat förslag. Ber du om en budgetändring på ett arbete vars kostnad är nedbruten i delar säger Renaida ifrån redan innan du bekräftar — och genomför resten av ändringen som vanligt.",
    tags: ["Renaida", "Förbättring"],
  },
  {
    date: "2026-07-10",
    title: "Fota kvittot — Renaida bokför det",
    description: "Renaida-panelen har fått en kamera/gem-knapp: fota eller ladda upp ett kvitto eller en faktura, så läser Renaida ut leverantör, belopp, datum och varje rad — och föreslår en färdig inköpsorder som du bekräftar med ett tryck. Ordern hamnar i Inköp med underlaget bifogat och alla rader som material, och allt går att ångra. Belopp visas alltid innan något genomförs, och dokumentimporter körs aldrig automatiskt ens i Autopilot-läget. Offerter känns igen och guidas till den fulla granskningen under Filer.",
    tags: ["Renaida", "Inköp", "Ny funktion"],
  },
  // ── 2026-07-08 ──
  {
    date: "2026-07-08",
    title: "Arbetskortet fick flikar — som rumskortet",
    description: "Arbetsdialogen är omstrukturerad med samma upplägg som rumsdetaljerna: Översikt, Ekonomi och Relaterat. Översikt samlar det centrala — beskrivning (med växel till nya Interna anteckningar, som aldrig delas med inbjudna arbetare), checklistor med ny AI-generering direkt från beskrivningen, status, datum, framsteg, foton och kommentarer, plus en kompakt inforad där kopplade köpordrar och beroenden visas som klickbara antal. Relaterat listar arbetets köpordrar, beroenden, rumsdetaljer och filer. Rumsnamnet i dialogen är dessutom klickbart och tar dig direkt in i rummets detaljer.",
    tags: ["Arbeten", "Förbättring"],
  },
  {
    date: "2026-07-08",
    title: "Renaida kvitterar exakt vad hon gjorde",
    description: "När Renaida genomför en ändring listar hon nu punkt för punkt vad som utfördes med konkreta värden (t.ex. \"Framsteg: 50 %\") i stället för bara \"genomförde 1 ändring\". Bredvid Ångra finns nu också en knapp som öppnar det som ändrades eller skapades — direkt till rätt arbete eller köporder.",
    tags: ["Renaida", "Förbättring"],
  },
  // ── 2026-05-18 ──
  {
    date: "2026-05-18",
    title: "Dela en materialrad på flera uppgifter",
    description: "I redigeringsvyn för en materialrad finns nu \"Dela raden\" — dela upp beloppet på flera delar där varje del kan kopplas till olika uppgift (t.ex. 70 % kök, 30 % badrum). Totalsumman bevaras exakt. Nås från Budget-fliken och den samlade tabellen.",
    tags: ["Budget", "Förbättring"],
  },
  {
    date: "2026-05-18",
    title: "Jobb-inbjudan visar laddningsläge",
    description: "När du öppnar \"Skicka jobb\" visas nu \"Laddar uppgifter…\" medan listan hämtas, i stället för att kort blinka till \"Inga uppgifter i projektet ännu\" innan uppgifterna dyker upp.",
    tags: ["Team", "Buggfix"],
  },
  {
    date: "2026-05-18",
    title: "Toppmenyn stannar kvar när du scrollar",
    description: "Tidigare kunde projektets toppmeny glida iväg uppåt vid scroll på grund av två krockande rullningslager. Nu sitter den stabilt kvar och göms/visas mjukt när du scrollar ner respektive upp — på både desktop och mobil.",
    tags: ["Navigation", "Buggfix"],
  },
  {
    date: "2026-05-18",
    title: "Välj bort enskilda före-bilder per jobb-inbjudan",
    description: "Före-bilder för uppgiftens egna foton och rum visas automatiskt för den du bjuder in — men nu kan du enkelt klicka bort vilka enskilda bilder som helst direkt i förhandsvisningen om något inte ska delas. Gäller per inbjudan; ändrar inget för andra.",
    tags: ["Team", "Förbättring"],
  },
  {
    date: "2026-05-18",
    title: "Granskare ser nu Kontroll-fliken",
    description: "Personer du bjuder in som \"Granskare\" (t.ex. besiktningsman eller kontrollansvarig) kommer direkt in i en avskalad vy: Översikt, Filer och Kontroll — inget av det ekonomiska eller övriga arbetsflödet. Tidigare kunde en inbjuden granskare inte se Kontroll-fliken de bjudits in för.",
    tags: ["Team", "Förbättring"],
  },
  {
    date: "2026-05-18",
    title: "Tydligare instruktionsbilder vid jobb-inbjudan",
    description: "När du skickar ut ett jobb syns nu \"Instruktionsbilder\" direkt under uppgiftens titel i förhandsvisningen — inte gömt längst ner. Du kan välja befintliga projektbilder (uppgiftens egna visas först) eller ladda upp nya med förklarande text. Extra användbart för inbjudna hantverkare som målare och elektriker.",
    tags: ["Team", "Förbättring"],
  },
  {
    date: "2026-05-18",
    title: "Teamlistan funkar på mobil",
    description: "Teamlistan visas nu som kort på telefon i stället för en bred tabell som åkte utanför skärmen. Varje medlem är ett kort med namn, roll och status — tryck för att se åtkomstdetaljer. Knapparna \"Skicka jobb\" och \"Lägg till medlem\" radbryts snyggt i stället för att kapas.",
    tags: ["Team", "Mobil", "Förbättring"],
  },
  {
    date: "2026-05-18",
    title: "Läsbar tidslinje på mobil",
    description: "Tidslinjen på mobil öppnar nu i ett rimligt tidsfönster i stället för att pressa in hela projektet på en liten skärm. Månads- och veckorubriker krockar inte längre — de förkortas eller hoppas över när utrymmet är litet. Zooma ut för hela projektöversikten som vanligt.",
    tags: ["Tidslinje", "Mobil", "Förbättring"],
  },
  {
    date: "2026-05-18",
    title: "Renare projektmeny",
    description: "Toppmenyn är uppstädad. \"Delning\" ligger nu som ett val under \"Team\" istället för en egen flik — och inne i Team- och Delningsvyerna finns en tydlig väljare så du enkelt växlar mellan dem. \"Planering\" ligger kvar högst upp medan projektet planeras, men flyttas in under \"Översikt\" när projektet blivit pågående — ett klick bort, men mindre rörigt. Menyn glider dessutom undan när du scrollar ner och kommer tillbaka direkt när du scrollar upp, så du får mer läsyta. Kundvyn för dina kunder är oförändrad.",
    tags: ["Navigation", "Förbättring"],
  },
  {
    date: "2026-05-18",
    title: "Namn och tydligare åtkomst i teamlistan",
    description: "Namnet du skriver in när du bjuder in någon visas nu i teamlistan i stället för bara e-postadressen — lättare att se vem som är vem. E-posten visas som underrad. Du kan också sätta eller ändra visningsnamn på befintliga medlemmar via \"Redigera medlem\". När du fäller ut en rad ser du dessutom omfattningen (om personen ser alla arbeten/ordrar eller bara sina egna/tilldelade) och om åtkomsten är tidsbegränsad.",
    tags: ["Team", "Förbättring"],
  },
  // ── 2026-04-29 ──
  {
    date: "2026-04-29",
    title: "Egenkontroller (KMA)",
    description: "Ny \"Kontroll\"-flik i projektet. Skapa kvalitetskontroller med branschspecifika checklistor (fuktkontroll, el, VVS, brand, bygg, målning, plattsättning). Bocka av punkter direkt — status uppdateras automatiskt.",
    tags: ["KMA", "Kvalitet", "Nytt"],
  },
  {
    date: "2026-04-29",
    title: "Löneexport (PAXml)",
    description: "Exportera godkända timmar till PAXml-fil direkt från Tid-fliken. Kompatibel med Fortnox Lön, Hogia, Visma och andra svenska lönesystem. Grupperat per person med personnummer.",
    tags: ["Tid", "Lön", "Export"],
  },
  {
    date: "2026-04-29",
    title: "Personalliggare med QR-kod",
    description: "Arbetare skannar en QR-kod för att checka in och ut på arbetsplatsen. Ingen inloggning krävs. Projektledaren ser vilka som är på plats.",
    tags: ["Team", "Nytt"],
  },
  {
    date: "2026-04-29",
    title: "ROT-avdrag från fakturaskanning",
    description: "När du skannar en faktura extraheras nu ROT-belopp och personnummer automatiskt. Nya ROT-personer skapas direkt — ingen manuell inmatning.",
    tags: ["ROT", "AI", "Faktura"],
  },

  // ── 2026-04-28 ──
  {
    date: "2026-04-28",
    title: "Offert till faktura med ett klick",
    description: "Godkänd offert? Klicka \"Skapa faktura\" — alla rader kopieras automatiskt. Ingen dubbelinmatning.",
    tags: ["Faktura", "Offert", "Produktivitet"],
  },
  {
    date: "2026-04-28",
    title: "Tidrapportering med ekonomi",
    description: "Ny Tid-flik i projektet. Logga timmar per uppgift, timkostnad beräknas automatiskt. Godkännandeflöde för projektledare. Hemägare ser timmar men inte kostnader.",
    tags: ["Tid", "Nytt"],
  },
  {
    date: "2026-04-28",
    title: "ÄTA-godkännande utan inloggning",
    description: "Skicka en godkännandenlänk till kunden — de godkänner eller avböjer ÄTA direkt i mobilen utan att behöva logga in.",
    tags: ["ÄTA", "UX"],
  },
  {
    date: "2026-04-28",
    title: "Resursplanering — vem jobbar var?",
    description: "Ny vy på startsidan: se alla teammedlemmars scheman över alla projekt. Vilka veckor är lediga? Vem är dubbelbokad? Perfekt för företag med flera anställda.",
    tags: ["Resursplanering", "Nytt"],
  },
  {
    date: "2026-04-28",
    title: "SIE4-export för bokföring",
    description: "Ladda ner SIE4-fil från fakturalistan. Importera direkt i Fortnox, Visma eller valfritt bokföringsprogram. Svensk kontoplan (BAS) med moms och ROT.",
    tags: ["Bokföring", "Export"],
  },
  {
    date: "2026-04-28",
    title: "Arbetsinstruktioner med chatt",
    description: "Arbetare kan nu se meddelanden från projektledaren direkt i sin instruktionsvy — och svara tillbaka med text eller röstmeddelande. Översätts automatiskt om arbetaren har ett annat språk.",
    tags: ["WorkerView", "Chatt", "i18n"],
  },
  {
    date: "2026-04-28",
    title: "Snabb-attestering av inköp",
    description: "Godkänn eller markera inköp som betalda med ett klick direkt i inköpstabellen. Nya ikoner i åtgärdskolumnen.",
    tags: ["Inköp", "Produktivitet"],
  },
  {
    date: "2026-04-28",
    title: "Hemägarens startsida",
    description: "Hemägare med flera projekt ser nu en enkel lista med progress och kostnadssummering. Har du bara ett projekt? Du landar direkt i det — inget extra klick.",
    tags: ["Hemägare", "UX"],
  },

  // ── 2026-04-27 ──
  {
    date: "2026-04-27",
    title: "Ny dashboard (A/B-test)",
    description: "Experimentell dashboard med redaktionell design. Aktivera via Admin-knappen på startsidan för att testa.",
    tags: ["Dashboard", "Design"],
  },

  // ── 2026-04-25 ──
  {
    date: "2026-04-25",
    title: "Klickbar portfolio-tidslinje",
    description: "Klicka på en uppgift i portfolio-tidslinjen för att öppna den direkt i en sidopanel — utan att lämna startsidan.",
    tags: ["UX", "Produktivitet"],
  },

  // ── 2026-04-17 ──
  {
    date: "2026-04-17",
    title: "Leverantörsregister",
    description: "Spara leverantörer en gång, återanvänd överallt. Autocomplete i budget, inköp och uppgifter. Slipper skriva samma namn flera gånger.",
    tags: ["Inköp", "Produktivitet"],
  },
  {
    date: "2026-04-17",
    title: "Budget med P&L och hierarki",
    description: "Budgettabellen visar nu vinst per post, hierarkisk uppdelning med inköp under uppgifter, och inline-redigering av alla kolumner.",
    tags: ["Budget", "Design"],
  },

  // ── 2026-04-16 ──
  {
    date: "2026-04-16",
    title: "Aktivera projekt utan offert",
    description: "Starta arbete direkt från planering — materialbudget konverteras automatiskt till inköpsposter.",
    tags: ["Arbetsflöde", "UX"],
  },

  // ── 2026-04-15 ──
  {
    date: "2026-04-15",
    title: "Fotokategorisering vid uppladdning",
    description: "När du laddar upp bilder får du nu välja kategori (före, under, efter) direkt. Smarta standardval baserat på var du laddar upp.",
    tags: ["Filer", "UX"],
  },

  // ── 2026-04-14 ──
  {
    date: "2026-04-14",
    title: "Planeringsguide i 4 steg",
    description: "Ny guided setup: beskriv ditt projekt med fritext → AI extraherar rum och arbeten → du finjusterar. Från tom sida till strukturerat projekt på 2 minuter.",
    tags: ["Onboarding", "AI", "Nytt"],
  },

  // ── 2026-04-13 ──
  {
    date: "2026-04-13",
    title: "Momshantering + ROT-compliance",
    description: "Rensat och förenklat momskategorier (15 → 12). Finansiell analys omdesignad med tydligare vinst/kostnad-separation.",
    tags: ["Budget", "ROT"],
  },

  // ── 2026-04-12 ──
  {
    date: "2026-04-12",
    title: "ROT per person i deklarationstabellen",
    description: "Se ROT-avdrag per person direkt i budgetöversikten. Årsgruppering med subtotaler och progress-bar mot taket.",
    tags: ["ROT", "Budget"],
  },

  // ── 2026-04-01 ──
  {
    date: "2026-04-01",
    title: "Timeline: assignee avatars, room names, faster hover",
    description: "Task bars now show the assigned person's initial and room name directly on the bar. Hover details appear twice as fast. Dependencies scoped to project only.",
    tags: ["Arbeten", "UX", "Design"],
  },
  {
    date: "2026-04-01",
    title: "Inspiration board on project overview",
    description: "Drop photos, paste Pinterest links, or snap a picture — directly on the overview page. Tag rooms later. Visual inspiration lives alongside your planning data, not buried in menus.",
    tags: ["UX", "Design", "Planering"],
  },
  {
    date: "2026-04-01",
    title: "Group tasks by assignee",
    description: "New grouping option for tasks: see all work per person at a glance. Perfect for coordinating multiple contractors on the same project.",
    tags: ["Arbeten", "UX"],
  },
  {
    date: "2026-04-01",
    title: "Planned vs. actual margin in budget table",
    description: "Margin column now shows both actual margin % and the planned markup from the planning phase. Spot deviations early when actuals drift from your pricing assumptions.",
    tags: ["Budget", "Produktivitet"],
  },

  // ── 2026-03-31 ──
  {
    date: "2026-03-31",
    title: "Group any table by room, cost center, status, or vendor",
    description: "New grouping button (layers icon) in Budget, Tasks, and Purchases tables. Collapsible groups with item counts and subtotals. Like Excel grouping but prettier. Preference saved per project.",
    tags: ["Budget", "Arbeten", "Inköp", "UX"],
  },
  {
    date: "2026-03-31",
    title: "Richer project cards in grid view",
    description: "Project cards now show task progress bar, overdue count, recent comments, budget, and a visual placeholder when no cover image is set. Much more at-a-glance info without opening the project.",
    tags: ["UX", "Design"],
  },
  {
    date: "2026-03-31",
    title: "Dashboard overview across all projects",
    description: "Start page now shows aggregated stats when you have multiple projects: overdue tasks, recent comments, pending purchases, and total budget — all clickable to navigate directly.",
    tags: ["UX", "Produktivitet"],
  },
  {
    date: "2026-03-31",
    title: "Full i18n for onboarding & intake forms",
    description: "Room names, work types, builder dialogs, and form preview — all translated. No more Swedish strings leaking into English UI.",
    tags: ["i18n", "Onboarding"],
  },
  {
    date: "2026-03-31",
    title: "Onboarding starts with rooms, not paperwork",
    description: "New wizard order: pick rooms first, then work types and task mapping. Project name comes last with a smart auto-suggestion based on address + rooms.",
    tags: ["Onboarding", "UX"],
  },
  {
    date: "2026-03-31",
    title: "Smart ROT visibility per project country",
    description: "ROT tax deduction features now resolve per-project based on country field. Swedish projects show ROT, international projects don't. Users with mixed projects see ROT only where it applies.",
    tags: ["i18n", "ROT"],
  },

  // ── 2026-03-30 ──
  {
    date: "2026-03-30",
    title: "Omslagsbilder med zoom och repositionering",
    description: "Dubbelklicka projektets omslagsbild för att dra och zooma till perfekt fokuspunkt. Första projektbilden visas automatiskt som cover.",
    tags: ["UX", "Projektvy"],
  },
  {
    date: "2026-03-30",
    title: "Smartare filkategorier",
    description: "Kategori-kolumnen i Filer visar nu Offert, Faktura, Kvitto istället för generiskt \"Bild\" eller \"Dokument\". AI-klassificering används automatiskt.",
    tags: ["Filer", "AI"],
  },
  {
    date: "2026-03-30",
    title: "Budget-belopp låsta som standard",
    description: "Arbetskostnad och materialbudget visas som läsbar text — dubbelklicka för att redigera. Totalen beräknas automatiskt.",
    tags: ["Budget", "UX"],
  },
  {
    date: "2026-03-30",
    title: "Publik changelog-sida",
    description: "Ny /changelog-sida visar alla produktuppdateringar i en snygg tidslinje. Delbar på sociala medier utan inloggning.",
    tags: ["UX"],
  },

  // ── 2026-03-29 ──
  {
    date: "2026-03-29",
    title: "Bulk-markering av arbeten",
    description: "Markera flera arbeten i tabellvyn med checkboxar. Bulk-ändra status, prioritet, tilldelning, rum, datum och mer. Select all med ett klick.",
    tags: ["Arbeten", "Produktivitet"],
  },
  {
    date: "2026-03-29",
    title: "Nytt inköpsflöde mot materialbudget",
    description: "Tre val vid nytt inköp: Registrera kvitto, Registrera inköp, eller Inköpsförfrågan. Budgetposten behålls intakt — inköp aggregerar mot den.",
    tags: ["Inköp", "Budget"],
  },
  {
    date: "2026-03-29",
    title: "Vy-inställningar sparas mellan enheter",
    description: "Kanban/tabell-vy, kolumnval och sortering synkas nu till ditt konto. Byt dator — alla inställningar följer med.",
    tags: ["UX", "Synk"],
  },
  {
    date: "2026-03-29",
    title: "Design-lyft i hela appen",
    description: "Rundare kort, mjuka hover-animationer, tydligare typografi-hierarki och mer luft mellan sektioner.",
    tags: ["Design"],
  },
  {
    date: "2026-03-29",
    title: "ROT och ÄTA överförs automatiskt från offert",
    description: "Vid offertaktivering överförs ROT-belopp och ÄTA-flagga automatiskt till arbeten. Tilläggsofferter skapar ÄTA-märkta arbeten.",
    tags: ["Offert", "ROT"],
  },

  // ── 2026-03-27 ──
  {
    date: "2026-03-27",
    title: "Materialindikator i arbetslistvy",
    description: "Kundvagnsikon visas bredvid arbeten med materialbudget — hovra för att se beloppet utan att öppna kortet.",
    tags: ["Arbeten", "UX"],
  },
  {
    date: "2026-03-27",
    title: "Budgetsammanfattning i planeringsvy",
    description: "Sammanfattningsrutor för total budget, materialkostnader och ROT-avdrag visas i hemägarens planeringsvy.",
    tags: ["Budget", "Planering"],
  },
  {
    date: "2026-03-27",
    title: "Gruppering av arbeten per kostnadstyp",
    description: "Organisera arbeten efter kostnadscenter (rivning, el, målning, etc.) med expanderbara grupper och budgetsummor per grupp.",
    tags: ["Planering", "UX"],
  },

  // ── 2026-03-25 ──
  {
    date: "2026-03-25",
    title: "Omdesignad högerklicksmeny på ritning",
    description: "Menyn organiserad i undermenyer: Lagerordning, Ritverktyg, Lägg till. Kompaktare och lättare att navigera.",
    tags: ["Canvas", "Design"],
  },
  {
    date: "2026-03-25",
    title: "Filnavigering med piltangenter",
    description: "I filförhandsgranskningen kan du bläddra mellan filer med tangentbordets pilar utan att stänga.",
    tags: ["Filer", "UX"],
  },
  {
    date: "2026-03-25",
    title: "4x snabbare filklassificering",
    description: "Smart tolk hämtar nu filer server-side istället för via webbläsaren — klassificering går fyra gånger snabbare.",
    tags: ["Filer", "AI"],
  },
  {
    date: "2026-03-25",
    title: "Offertförhandsgranskning i importmodal",
    description: "Se det importerade dokumentet direkt i modalen innan du länkar priser och material till arbeten.",
    tags: ["Offert", "UX"],
  },
  {
    date: "2026-03-25",
    title: "Alla kolumner i expanderade mappar",
    description: "När du expanderar en mapp i filtabellen visas nu alla kolumner (leverantör, datum, belopp) även för filerna inuti.",
    tags: ["Filer", "UX"],
  },

  // ── 2026-03-23 ──
  {
    date: "2026-03-23",
    title: "Arbetarvy utan inloggning",
    description: "Skicka en unik länk till hantverkare. De ser arbetsinstruktioner, ritning och checklista direkt i mobilen — ingen registrering krävs.",
    tags: ["Team", "Mobil"],
  },
  {
    date: "2026-03-23",
    title: "Automatisk översättning av instruktioner",
    description: "Arbetsinstruktioner översätts automatiskt till engelska, arabiska och andra språk via AI.",
    tags: ["AI", "Team"],
  },
  {
    date: "2026-03-23",
    title: "AI-genererade arbetschecklister",
    description: "System skapar automatiskt checklister baserat på rumstyp och arbetstyp. Bocka av steg direkt i arbetarvyn.",
    tags: ["AI", "Planering"],
  },
  {
    date: "2026-03-23",
    title: "Smart tolk — batchklassificering",
    description: "Markera flera filer och låt AI klassificera alla på en gång som fakturor, kvitton, ritningar eller specifikationer.",
    tags: ["Filer", "AI"],
  },
  {
    date: "2026-03-23",
    title: "AI-driven offertimport",
    description: "Importera offertfiler. AI extraherar priser, material och ROT-info automatiskt och föreslår länkning till arbeten.",
    tags: ["Offert", "AI"],
  },
  {
    date: "2026-03-23",
    title: "Filförhandsgranskning inline",
    description: "Klicka på ett filnamn för att se PDF eller bild direkt i en popup utan att ladda ned filen.",
    tags: ["Filer", "UX"],
  },
  {
    date: "2026-03-23",
    title: "Fotouppladdning från arbetarvy",
    description: "Hantverkare kan ta bilder direkt från mobilen via arbetarvyn och ladda upp dem till projektets filer.",
    tags: ["Filer", "Mobil"],
  },

  // ── 2026-03-20 ──
  {
    date: "2026-03-20",
    title: "Anslutningsverktyg på ritningen",
    description: "Rita pilar och kopplingar mellan former — som Miro. Automatisk fästning vid närliggande former.",
    tags: ["Canvas", "Design"],
  },
  {
    date: "2026-03-20",
    title: "Textformatering direkt på ritningen",
    description: "Lägg till och formatera text (fet, kursiv, storlek) direkt på former med live-förhandsgranskning.",
    tags: ["Canvas", "Design"],
  },
  {
    date: "2026-03-20",
    title: "Intelligent batchöverföring av filer",
    description: "Dra och släpp mappar från skrivbordet. AI klassificerar varje fil automatiskt och föreslår rätt kategori.",
    tags: ["Filer", "AI"],
  },
  {
    date: "2026-03-20",
    title: "Automatisk fakturadata-extraktion",
    description: "AI läser fakturor och kvitton för att automatiskt fylla i datum, belopp och leverantörsinfo.",
    tags: ["AI", "Inköp"],
  },
  {
    date: "2026-03-20",
    title: "ROT-avdrag beräknat från fakturor",
    description: "Systemet beräknar ROT-avdrag automatiskt baserat på uppladdade fakturor enligt Skatteverkets regler.",
    tags: ["ROT", "Budget"],
  },
  {
    date: "2026-03-20",
    title: "Anpassningsbar filtabell",
    description: "Slå på och av kolumner i filtabellen: kategori, arbete, inköp, rum, fakturadatum, belopp och ROT.",
    tags: ["Filer", "UX"],
  },
  {
    date: "2026-03-20",
    title: "Mobil ritning med touch-verktyg",
    description: "Touch-optimerat verktygsfält för ritning på mobila enheter. Rita, zooma och panorera med fingrar.",
    tags: ["Mobil", "Canvas"],
  },

  // ── 2026-03-16 ──
  {
    date: "2026-03-16",
    title: "Renofine Junior — AI-assistent",
    description: "Chatbot med personlig avatar som ger projektreminders, svarar på frågor och hjälper dig navigera i appen.",
    tags: ["AI", "Produktivitet"],
  },
  {
    date: "2026-03-16",
    title: "Global sökning med Cmd+K",
    description: "Snabbsökning genom alla projekt, arbeten, material och rum. Grupperade resultat med tangentbordsnavigering.",
    tags: ["Sök", "Produktivitet"],
  },
  {
    date: "2026-03-16",
    title: "Emoji-reaktioner på kommentarer",
    description: "Reagera med emoji (👍, ❤️, 🔥) på projektkommentarer för snabb feedback utan att skriva ett svar.",
    tags: ["Team", "UX"],
  },
  {
    date: "2026-03-16",
    title: "Interaktiv tidslinje",
    description: "Visuell tidslinje med drag-och-släpp för arbeten. Se projektets hela tidplan i en responsiv vy.",
    tags: ["Tidslinje", "Planering"],
  },
  {
    date: "2026-03-16",
    title: "Arbetsberoenden",
    description: "Länka arbeten med beroenden — systemet förhindrar start av beroende uppgifter och hanterar kaskadändringar.",
    tags: ["Planering", "Produktivitet"],
  },
  {
    date: "2026-03-16",
    title: "Projektpåminnelser",
    description: "Automatiska påminnelser för deadlines, saknad budget och planering. Stäng av individuellt per projekt.",
    tags: ["Planering", "Produktivitet"],
  },
];
