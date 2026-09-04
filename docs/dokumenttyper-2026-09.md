# Dokumenttyper — beslutad taxonomi (2026-09-04)

Beslutad av Carl på Fable-session 95. Ändringar här kräver nytt beslut —
taxonomin sitter i DB-värden, klassificerarens prompt, mappstruktur och i18n
på fem språk samtidigt.

## Principer

1. **En typ är vad pappret ÄR, inte vad appen gör med det.**
   `product_image` och `floor_plan`-routingen är infrastruktur, inte vokabulär.
2. **En felgissad specifik typ är värre än Övrigt.** Ett kvitto märkt "Avtal"
   slutar man leta efter. Övrigt är ett hedervärt svar.
3. **Rangordning efter vad det kostar när pappret SAKNAS**, inte efter volym.

## Typerna (DB-värden är engelska nycklar, översätts vid visning)

### Ekonomi
| värde | etikett (sv) | status |
|---|---|---|
| quote | Offert | finns |
| invoice | Faktura | finns |
| receipt | Kvitto | finns |
| delivery_note | Följesedel | NY — stäms mot faktura; ska INTE läsas som inköp |

**`ata` STRUKEN som dokumenttyp (Carl, 2026-09-04, samma dag den lades in).**
ÄTA är inte en sorts papper — det är ett FÖRHÅLLANDE mellan en kostnad och den
accepterade budgeten, och underlaget säger sällan "ÄTA" (en ÄTA-kostnad kommer
som vanlig faktura eller vanligt kvitto). Appen bär redan förhållandet på två
rätta ställen: `quotes.is_ata` (tilläggsofferten) och
`materials.exclude_from_budget` (kostnadsflaggan, som Budget-fliken redan delar
på). En dokumenttyp hade blivit ett TREDJE konkurrerande hem som kan säga emot
de två. Typ = vad pappret är; ÄTA = hur det räknas. En "ÄTA-underlag"-vy i
Filer härleds ur flaggan — härledning slår dubblering.

**ÄTA-flaggan sätts som förslag + bekräftelse, aldrig tyst:** starkast är att
pappret faktiskt säger ÄTA/tillägg (rubriksignalen föreslår FLAGGAN, inte
typen); därnäst att kostnaden saknar motsvarighet i accepterad offert (finns i
agent-flödet); tidssignaler färgar bara förslaget. Standard = inom budget.
**Invariant att pinna med test:** ÄTA räknas ÄNDÅ i totalkostnad och ROT-tak.
**"Tillgängliga medel":** ett informativt fält på projektet (accepterad budget ·
totalt inkl ÄTA · kvar av medel). Byggs sist eller stryks.

### Juridik & ansvar
| contract | Avtal | finns (mappen /Kontrakt behålls, etiketten byts) |
| inspection_report | Besiktningsprotokoll | NY — startar garantitid |
| certificate | Intyg & egenkontroller | NY — våtrum (GVK/BKR/Säker Vatten), el, egenkontroller. Dyrast att sakna. |
| permit | Tillstånd & beslut | NY — bygglov, start-/slutbesked, BRF-godkännande |

### Teknik
| floor_plan | Ritning | finns |
| specification | Specifikation | finns (scope-bearing, driver arbetsextraktion) |

### Sist
| other | Övrigt | finns — alltid ett giltigt svar |

**Internt, ej i väljare:** product_image.

**Medvetet utelämnat:** ROT-underlag (strukturerad data på fakturan, ej
papperstyp), F-skatt/försäkringsbevis (hör hemma på motparten i Team, ej i
projektfiler), arbetsmiljöplan (Övrigt tills en firma ber om den).

## Osäkerhetskontraktet

1. Klassificerarens prompt: sätt specifik typ ENDAST vid tydliga belägg;
   `other` vid tvekan. (Instruktionen saknas i dag.)
2. Klientsida: confidence < 0,7 → degradera till `other` + `needsTypeReview`.
   Confidence får bara SÄNKA en typ, aldrig höja — siffran är inte
   kalibrerad (se feedback_ask_the_model_only_what_it_can_answer).
3. Fråga användaren i granskningen (chip "Vad är det här?" + typväljare).
   Utanför granskningen: landa i Övrigt utan tjat; kortet "Oklassificerade"
   i Filer är kön, klick öppnar bulk-typning.

## Ändra i efterhand — saknad grundsten (verifierat 2026-09-04)

`task_file_links.file_type` skrivs en gång och uppdateras ALDRIG i dagens kod.
Bygg: typväljare på filrad/detalj i Filer → uppdatera file_type + flytta fil
till typens mapp. Samma yta får rum- och arbetsväljare (room_id/task_id finns
redan i tabellen — bara skrivvägen saknas).

## ÄTA-förslaget — "budgetvakten" (designad på Fable 2026-09-04)

Jobbet är inte att klassificera papper utan att BEVARA BERÄTTELSEN om budgeten
i stunden användaren vet svaret. Mekanik:

- Signal = ARITMETIK PÅ EGEN DATA, inget modellomdöme: `contract_value`
  (triggerunderhållen summa av accepterade offerter) mot löpande utfall +
  batchens rader i datumordning. Dagens mätningar fällde varje omätt
  modellsignal (confidence konstant, fabricerade citat, text_is_upright ljuger).
- Tyst under budget. Först när en rad tar projektet FÖRBI det accepterade får
  just den raden en FRÅGA med siffran: "tar projektet X kr över det ni kom
  överens om (Y). Extra arbete?" → [Bokför som ÄTA] / [Ingår i avtalet].
- Aldrig förbockning: slutfakturan för planerat arbete kommer också sist, och
  en tyst felbokning är värre än ingen hjälp. Frågan + siffran, användaren dömer.
- "Ingår i avtalet" minns per rad i sessionen (Record, inte Set — importRuns-
  läxan) så frågan inte tjatar vid återöppning.
- Ingen accepterad offert (`contract_value` null) → ingen chip alls. Retro-
  projekt (Carls eget) ser aldrig förslaget; manuella knappen täcker dem.
- Egna materialkvitton ingår inte i hantverkarens avtal men räknas i utfallet —
  v1 accepterar oskärpan öppet, siffran visar läget och personen dömer.
- Hjälparen (`ataSuggestion.ts`, ren funktion + två selects) skrivs återanvändbar:
  nästa yta är enstaka kvittofoto/manuellt inköp i levande projekt.
- Rader som redan flaggats ÄTA konsumerar INTE det accepterade i löpsumman.
- Senare, mäts först: "pappret säger ÄTA" ur extraktionen som samma chip.

## Byggskivor (exekveras på Opus)

0. **STRYK `ata`** ur DocumentType-katalogen, klassificerarens enum/prompt,
   SCOPE_BEARING (tilläggsofferten klassas som quote och är redan scope-bearing),
   i18n och mappen /ÄTA — inga rader hann skrivas med typen. Behåll
   rubrikdetektionen ("ÄTA", "tilläggs…") som FÖRSLAG på ÄTA-flaggan.
4. **ÄTA-kryssruta per inköpsrad i granskningen** (styr `bookAsAta` →
   `exclude_from_budget`), alltid ändringsbar. ✅ KLAR 2026-09-04 (13fa934f) —
   manuell, ingen förbockning.
6. **Budgetvakten** enligt designen ovan: `ataSuggestion.ts` (ren, testbar),
   chip i granskningen på rader förbi gränsen, dismissal-minne i sessionen,
   e2e på ren funktion (gränspassage, datumordning, null-avtal → tyst,
   ÄTA-rader utanför löpsumman).
5. *(valfri, Carls "kanske")* `available_funds` på projektet + raden
   "accepterad budget · totalt inkl ÄTA · kvar av medel" i Budget-fliken.

1. Typlistan: DocumentType-union, CATEGORY_FOLDERS (nya mappar /Foljesedlar,
   /Besiktning, /Intyg, /Tillstand, /ATA), klassificerarens enum + prompt,
   i18n (en/sv fullt, de/fr/es best effort), typväljaren grupperad
   Ekonomi/Juridik/Teknik/Övrigt.
2. Osäkerhetskontraktet enligt ovan. delivery_note stängs ute ur
   inköpsextraktionen (8 kr-fallet).
3. Ändra i efterhand + rum/arbete-koppling i Filer.

Invarianter: invoice/receipt-pipelinen orörd; inga befintliga file_type-rader
migreras (text-kolumn, additiva värden); en fil får aldrig bli oåtkomlig av
en typändring (flytt misslyckas → typen ändras ändå, filen ligger kvar).
