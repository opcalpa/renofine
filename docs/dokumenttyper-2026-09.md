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
| ata | ÄTA | NY — begreppet finns redan i offert/faktura/ROT-tak |
| delivery_note | Följesedel | NY — stäms mot faktura; ska INTE läsas som inköp |

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

## Byggskivor (exekveras på Opus)

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
