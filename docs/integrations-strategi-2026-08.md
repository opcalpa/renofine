# Renofine: integrations-önskelista och strategisk utvärdering (2026-08-24)

Syfte: rangordna integrationer med growth som primär lins, och vara ärlig om var det INTE
finns någon öppen API-väg (byggvaruhus, hitta-byggare) så vi inte planerar mot stängda
dörrar. Gatekeeper-läget är verifierat per plattform, källor sist.

## Utvärderingsmodell
Samma tre klasser som i Produlogs systerdokument (Produlog/specs/integrations-strategi-2026-08.md):
INTAG (aktivering), DISTRIBUTION (förvärv), STANDARDER (noll gatekeeper). Renofine-specifik
insikt: den starkaste growth-mekaniken finns REDAN i produkten, arbetar-token-länken. Varje
SMS till en hantverkare är en exponering mot en icke-användare i exakt målgruppen. Att
förstärka den loopen är billigare än varje ny integration på listan.

## Rangordning

| # | Integration | Klass | Gatekeeper | Growth-hävstång | Byggkostnad | Prio |
|---|-------------|-------|-----------|-----------------|-------------|------|
| 0 | Förstärkt viral-loop i arbetar-token-vyn | Distribution | Ingen | Hög (finns redan, outnyttjad) | Låg | P0 |
| 1 | Scrive eSign på offerter | Intag/förtroende | Ingen i test (gratis testbädd), betald licens i prod | Medel + STRATEGISK dubbelverkan (jobbsök-artefakt) | Låg-medel | P0 |
| 2 | SIE4-export (Fortnox/Visma/Bokio/BL i ETT bygge) | Standard | Ingen (öppen svensk standard) | Medel (hantverkarsegmentet) | Låg-medel | P1 |
| 3 | Fortnox API tvåvägs (fakturor ur offerter) | Intag | Ingen för API:et (självbetjäning), granskning + 10 kunder först för Marketplace | Medel-hög (marketplace = kanal senare) | Medel-hög | P2 |
| 4 | ICS-kalenderexport av projekttidplan | Standard | Ingen | Låg-medel (delningsbar = exponering) | Låg | P2 |
| 5 | Byggvaruhus/materialpriser (Byggmax, Bauhaus, Hornbach, Prisjakt) | Intag | STÄNGT (inga öppna API:er) | Hög om den fanns | N/A | Park, BD-spår |
| 6 | "Hitta byggare"-plattformar (Offerta, Servicefinder) | Distribution | STÄNGT (inga öppna API:er) | Hög om den fanns | N/A | Park, BD-spår |
| 7 | Swish-betalning | Intag | Tung (bankavtal, cert) | Låg för growth | Hög | Park |

## Detalj per kandidat

### 0. Viral-loopen som redan finns (P0, ingen integration alls)
Arbetar-token-länken (app.renofine.com/w/<token>) landar i händerna på hantverkare, alltså
framtida betalande användare, via SMS från en nöjd kund. Idag är den vyn en ren arbetsyta.
Lägg diskret "Renofine, prova själv"-branding + CTA i arbetar-vyn och mät konvertering i
PostHog. Detta är den billigaste förvärvsmekaniken i hela dokumentet och kräver noll
extern part. Att den hamnar överst i en INTEGRATIONS-analys är poängen: bästa kanalen
visade sig inte vara en integration.

### 1. Scrive eSign på offerter (P0)
Renofine genererar redan offerter med AI. En osignerad offert är ett dokument, en signerad
är ett åtagande, och e-signering är förtroendesteget som gör privatperson↔hantverkare-
relationen seriös (BankID-identifiering via Scrives eID-stöd är exakt vad svenska
privatpersoner litar på). Gatekeeper: gratis självbetjänings-testbädd
(api-testbed.scrive.com, eget konto via login-sidan), REST/JSON-API, API-explorer i
webbläsaren. Produktion kräver betald Scrive-licens, det är kostnadsflaggan, men bygget
och en full demo kan göras gratis i testbädden.

STRATEGISK DUBBELVERKAN (och ärligt: halva skälet till P0): Calle ligger i process hos
Scrive för rollen Product Manager Integrations, med CHRO-rekommendation inne hos
rekryterande chef Mathias. En 90-sekunders skärminspelning "Renofine skickar en offert för
signering via Scrives API, byggd mot er publika testbädd på en kväll" är den perfekta
artefakten för det DM:et: den bevisar exakt hantverket rollen kräver, på deras eget API,
och är vidarebefordringsbar internt. Även utan jobbspåret står integrationen på egna ben,
därför är detta inte fjäsk utan äkta konvergens.

### 2. SIE4-export (P1), standarden som slår fyra API:er med ett bygge
SIE är det öppna svenska standardformatet för bokföringsdata som Fortnox, Visma, Bokio,
Björn Lundén m.fl. alla importerar. Ingen ansökan, ingen nyckel, ingen part att fråga:
Renofine exporterar en .se-fil, hantverkaren importerar i SITT program, vilket som helst.
Underlaget finns redan i produkten: kvitto-OCR (verifikationer med belopp/moms/datum) och
offerter/kostnader per projekt. Bygget är formatgenerering, inte API-integration, och
täcker hela den svenska bokföringsmarknaden i ett slag. Detta är rätt FÖRSTA
bokföringssteg; API-spåret (#3) motiveras först när användare ber om tvåvägssynk.

### 3. Fortnox API (P2)
Verifierat: developer-registrering och client id/secret är självbetjäning
(apps.fortnox.se/developer), upp till 30 test-sandboxar, och OAuth-koppling fungerar utan
Marketplace-listning. Granskningen gäller bara publicering i Marketplace, som dessutom
kräver minst 10 aktiva kunder och 3-stjärnigt snitt, alltså är sekvensen framtvingad: bygg
ospublicerat, samla kunder, ta listningen som growth-kanal sen. Fortnox har i
storleksordningen 600 000 företagskunder och är dominant just bland småföretagare av
hantverkartyp. Kärnflöde: accepterad offert → fakturautkast i Fortnox. Byggkostnaden är
den verkliga invändningen (OAuth-hantering per användare, token-förnyelse, felhantering),
därför efter #2.

### 4. ICS-kalenderexport (P2)
Projekttidplanen som prenumererbar ICS-URL, importerbar i Google/Apple/Outlook utan någon
API-relation alls. Låg kostnad, och delnings-URL:en till kund + hantverkare är ännu en
yta där Renofine syns hos icke-användare.

### 5-6. De stängda dörrarna, säg det ärligt
Byggvaruhusen (Byggmax, Bauhaus, Hornbach) har inga öppna produkt/pris-API:er, och
Prisjakt kräver partneransökan. Offerta/Servicefinder har inga publika API:er alls, deras
lead-flöde ÄR deras affär och de delar den inte. Båda spåren är därför
affärsutvecklingssamtal (partnerskap, affiliate) och ska inte planeras som API-byggen.
Om materialpris-behovet blir akut är den ärliga vägen manuellt kuraterade prislistor för
de 100 vanligaste varorna, inte skrapning.

### 7. Swish (Park)
Swish Handel kräver avtal via bank + certifikathantering, tung process för lågt
growth-värde idag (betalningen sker ändå, utanför Renofine). Omvärdera när transaktioner
är en intäktsmodell.

## Nästa steg
Triage av Calle: valda kandidater blir kort i BACKLOG.md (inga tysta byggen). Föreslagen
första våg: #0 (en kväll) + #1 (testbädden, med dubbelverkan mot Scrive-processen) + #2.

## Källor (verifierade 2026-08-24)
- Scrive eSign API + gratis testbädd + API-explorer: apidocs.scrive.com, helpcenter.scrive.com ("Get started with the eSign API": testbädd via login-sidan, betald licens för prod-API)
- Fortnox developer-portal självbetjäning + Marketplace-krav (granskning, 10 aktiva kunder, 3-stjärnigt snitt, 30 sandboxar): fortnox.se/developer, fortnox.se/developer/checklist, fortnox.se/developer/faq
- SIE-formatet (öppen standard, sie.se): stöds för import av Fortnox/Visma/Bokio/Björn Lundén
- Swish Handel kräver bankavtal: swish.nu/foretag
