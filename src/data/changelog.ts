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
  // ── 2026-07-08 ──
  {
    date: "2026-07-08",
    title: "Arbetskortet fick flikar — som rumskortet",
    description: "Arbetsdialogen är omstrukturerad med samma upplägg som rumsdetaljerna: Översikt, Ekonomi, Checklistor och Relaterat. Översikt samlar det centrala — beskrivning (med växel till nya Interna anteckningar, som aldrig delas med inbjudna arbetare), status, datum, framsteg, foton och kommentarer. Allt ekonomiskt (budget, ROT, kostnadsuppföljning) ligger under Ekonomi. Rumsnamnet i dialogen är dessutom klickbart och tar dig direkt in i rummets detaljer.",
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
