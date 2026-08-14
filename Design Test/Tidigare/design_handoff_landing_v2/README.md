# Handoff: Renofine Public Landing Page v2

## Overview
Komplett redesign av den publika landingssidan på renofine.com. Strategin är **byggare-först** — primär målgrupp är yrkesverksamma byggare/renoveringsfirmor (betalande kunder, 549 kr/mån), medan hemägare positioneras som distribution (gratis kundvy som blir viraliseringsmotor när byggare bjuder in sina kunder).

Designen ersätter nuvarande `src/pages/Index.tsx` och gör `src/pages/LandingTest.tsx` obsolet.

## About the Design Files
Filerna i denna bunt är **designreferenser skapade i HTML/JSX** — prototyper som visar avsedd visuell utformning och beteende. **De är inte produktionskod att kopiera direkt.**

Uppgiften är att **återskapa designen i Renomate-codebasen** (React + TypeScript + Tailwind + shadcn/ui) med de existerande mönstren:
- Använd `Button`, `Card`, etc. från `@/components/ui/`
- Använd `react-i18next` för all text
- Använd `react-router-dom` för navigation (samma `nav.toAuth`/`nav.demoTab` som i `LandingTest.tsx`)
- Återanvänd `Footer`-komponenten från `@/components/Footer`
- Återanvänd `useGuestMode`, `PUBLIC_DEMO_PROJECT_ID`, `GuestRoleModal` från Index.tsx

## Fidelity
**High-fidelity (hifi)**. Pixel-perfekt mockup med slutgiltiga färger, typografi, spacing och innehåll. Implementera precis så.

## Visual Direction: "Editorial / Anti-Excel"
- Lugnt, redaktionellt anslag (à la Linear, Stripe, Vercel — inte typisk SaaS)
- **Fraunces** som display-font (vikt 300–500, optisk storlek följer storlek)
- **Inter Tight** som UI-font
- **JetBrains Mono** för kickers/labels (uppercase, letter-spacing 0.08–0.1em)
- "Paper"-tema: varma off-white-toner, hairline-borders (1px), subtila skuggor
- Primärfärg: forest/shamrock-grön (`oklch(52% 0.09 155)`)
- Aldrig: gradient-bakgrunder, emoji, runda kort med vänster-bordkant, AI-genererade siffror

## Strategi (kontext för utvecklaren)
Hemägare ≠ kund. Byggare = kund. Hemägare = distribution.

Betyder konkret för sidan:
- **En primär CTA**: "Prova fritt 14 dagar" (för byggare)
- **En sekundär CTA**: "Boka demo" / "Se demoprojekt"
- Hemägare får en **liten sektion** ("För hemägaren") som förklarar att de bjuds in av sin byggare — INTE en parallell signup-funnel
- Pricing fokuserar på byggar-firmor (Solo / Team / Större firma)

## Sektioner (i ordning)

1. **Header/Nav** — Logo + nav-länkar (Funktioner, Priser, För hemägare, Kunder) + "Logga in" + primär CTA "Prova fritt 14 dagar"
2. **Hero** — Pill ("För renoveringsbranschen · 142 firmor"), H1 (Fraunces, 68px), brödtext, CTAs, mikro-trust ("Inga kontokrav · Igång på 18 minuter · Avsluta när du vill"), produktskärmdump med 2 annoteringar
3. **Logo strip** — "142 firmor använder Renofine dagligen" + 6 firmonamn (Holmberg Bygg, Skanlund AB, Wallin & Söner, BoBygg Stockholm, Andersson Renoverar, Mälar Bygg)
4. **Stats band** — 4 siffror: 8h / 3.2d / 94% / 4.7/5 (alla med understatement-källa)
5. **Builder features** — 4 alternerande rader (text+bild, omvänt varannan): Offert & avtal / Tidsplan / Inköp & ROT / Kundvy
6. **Homeowner-as-feature** — Sektion med sunken bg, 2-kolumn, förklarar kundvy-värdet, slutar med "Är du hemägare? Be din byggare bjuda in dig"
7. **Testimonial** — Citat (Fraunces italic, 32px), foto + namn + roll
8. **Pricing** — 3-kolumn (Solo 299 / Team 549 [Mest populär] / Större firma Kontakt)
9. **FAQ** — 5 accordion-frågor (onboarding, ROT, kundvy, offline, dataexport)
10. **Final CTA** — Stort H2, mikro-text, 2 CTAs
11. **Footer** — 5 kolumner

## Designtokens
Alla värden finns i `design_files/tokens.css`. Lyft `[data-theme="paper"]`-blocket rakt in i Tailwind config eller `src/index.css`.

Nyckelvärden:
- `--bg`: `oklch(97.4% 0.004 85)` (varm off-white)
- `--surface`: `oklch(99.5% 0.002 85)`
- `--bg-sunken`: `oklch(95.5% 0.006 85)`
- `--fg`: `oklch(22% 0.01 260)`
- `--fg-muted`: `oklch(48% 0.01 260)`
- `--fg-subtle`: `oklch(62% 0.008 260)`
- `--hairline`: `oklch(88% 0.005 85)`
- `--primary`: `oklch(52% 0.09 155)`
- `--accent-ink`: `oklch(22% 0.01 260)` (svart-button)
- Border-radius: 6px (knappar), 8px (annoteringar/cards), 12-14px (skärmdumps-ramar)
- Shadow-md: `0 2px 8px -2px oklch(22% 0.01 260 / 0.08), 0 1px 2px 0 oklch(22% 0.01 260 / 0.04)`

## Typografi
- **H1 hero**: Fraunces, weight 300, 68px, letter-spacing -0.03em, line-height 1.02
- **H2 sektioner**: Fraunces, weight 300, 38–54px, letter-spacing -0.025em
- **H3 features**: Fraunces, weight 400, 30px, letter-spacing -0.02em
- **Body**: Inter Tight, 15–17px, line-height 1.55–1.6
- **Stats**: Fraunces, weight 300, 42px, letter-spacing -0.025em, **tabular-nums**
- **Pill/kicker**: JetBrains Mono, 10–11px, uppercase, letter-spacing 0.08–0.1em
- **Testimonial**: Fraunces italic 300, 32px, letter-spacing -0.018em, `text-wrap: pretty`

## Innehåll (svenska — alla strängar redo att lyftas)

### Hero
- Pill: "För renoveringsbranschen · 142 firmor"
- H1: "Det enda projektkontoret du kommer behöva." (sista punkten i `--primary`)
- Body: "Offerter, ROT, tidsplan, inköp och kundkommunikation — i ett verktyg byggt för dig som faktiskt utför jobbet, inte för Excel-konsulten. **Spara 8 timmar admin per projekt.**"
- CTA primär: "Prova fritt 14 dagar"
- CTA sekundär: "Se demoprojekt"
- Mikro: "Inga kontokrav · Igång på 18 minuter · Avsluta när du vill"
- Annotering top-right: "ROT 2026 · 32 400 kr kvar"
- Annotering bottom-left: "Aktivt · **Kök bänkskivor** klart imorgon"

### Stats
| Siffra | Etikett | Källa |
|--------|---------|-------|
| 8 h | Mindre admin per projekt | Genomsnitt över 612 avslutade projekt |
| 3.2 d | Snabbare till skickad offert | Från första kundmöte |
| 94 % | Förnyar abonnemanget år 2 | Av betalande firmor |
| 4.7/5 | Hur byggare betygsätter Renofine | Trustpilot · 47 omdömen |

### Testimonial
> "Vi gick från 11 timmars administration per projekt till runt 3. På årsbasis blir det två extra projekt per arbetsledare — utan att anställa."

— Marcus Holmberg, VD · Holmberg Bygg AB · Stockholm

### Pricing
- **Solo** — 299 kr/mån, 3 aktiva projekt, "Prova fritt"
- **Team** — 549 kr/mån, obegränsade projekt, "Prova fritt" [badge: "Mest populär"]
- **Större firma** — Kontakt, anpassad onboarding, "Boka demo"

Alla planer inkluderar: Obegränsat antal kunder, Offert + faktura + ROT, Tidsplan & inköp, Mobilapp.

Footnote: "Alla priser exkl. moms · Avsluta när du vill · 30 dagars pengarna-tillbaka-garanti"

### FAQ-frågor (fullständiga svar i `landing.jsx`)
1. Hur lång är onboarding-tiden?
2. Hanterar Renofine ROT-avdraget korrekt?
3. Får mina kunder också använda appen?
4. Funkar det på byggplats / med dålig täckning?
5. Kan jag exportera min data om jag avslutar?

### Final CTA
- H2: "Bygg branschens vassaste projektkontor."
- Body: "14 dagars fri provperiod. Inga kontokrav. Importera ditt första projekt på två minuter."

## Komponenter att skapa

### `<Shot>` (återanvändbar bildram)
Browser-chrome-stil ram runt skärmdumpar:
- 1px hairline border, 12px radius, shadow-md
- 28px topp-bar med 3 trafikljus + URL "renofine.com / projekt"
- Bilden är `object-fit: cover, object-position: top left`
- Tar `src`, `alt`, `ratio` (default 4/3), `chrome` (bool), `fit` (cover/contain), `children` (för annoteringar)

### `<Anno>` (annotering på skärmdump)
Floating box ovanpå `<Shot>`:
- Position: top-left/top-right/bottom-left/bottom-right (offsets `dx`/`dy`)
- Surface bg, hairline border, 8px radius, shadow-md, padding 8px 12px
- Inre struktur: `kicker` (mono, uppercase, 9px, fg-subtle) + huvudtext (12px, weight 500)

### `<Pill>` (3 toner: ink / primary / paper)
- Inline-flex, padding 4px 10px, radius 999, mono 11px, uppercase, letter-spacing 0.04em
- Toner mappar till {bg, fg}-par

## Interaktioner

- **Nav-CTA, Hero-CTA, Final-CTA primär** → `setShowRoleModal(true)` eller `nav.startProject()`
- **Hero-CTA sekundär** → `nav.demoTab("contractor", "tasks")` (öppnar demoprojekt)
- **Skärmdumpar** → klickbara, leder till respektive demo-flik:
  - Hero/Tidsplan → `demoTab("contractor", "tasks")`
  - Inköp & ROT → `demoTab("contractor", "budget")`
  - Floorplan → `demoTab("contractor", "spaceplanner")`
- **FAQ accordion**: open/close, en åt gången, default index=0 öppen
- **Hover-states**: skärmdumpar får `shadow-lg` (från `shadow-md`), CTA primär: `--primary` → `--primary-hover` på 150ms
- **Mobile nav**: hamburger toggle, full-bredd dropdown med stora hit-targets (min-height 44px)

## State
- `showRoleModal` (bool) — för guest-rollval
- `openFaq` (number) — vilken FAQ är öppen, default 0
- `mobileNavOpen` (bool) — bara för mobile

## Responsivt beteende
- Desktop: 1280px max-width container, 40px sidopadding
- Mobile (< 768px): se `LandingMobile`-komponenten i `landing.jsx`
  - Header sticky, hamburger
  - Hero centrerat, H1 36px (inte 68px)
  - Stats-grid blir 2×2 (inte 1×4)
  - Features blir vertikal stack
  - Pricing blir bara Team-kortet (länk "Se alla planer" till modal/scroll)

## Bilder
Skärmdumpar i `design_files/v2/screenshots/`:
- `timeline.png` — Gantt-vy, används i hero + Tidsplan-feature + mobile hero
- `budget.png` — Budget-tabell, används i Inköp & ROT-feature + mobile
- `kanban.png` — Kanban-bräda (oanvänd just nu, finns för framtida bruk)
- `floorplan.png` — Floorplan-editor (oanvänd just nu)

**Saknas (placeholder visas i design):**
- Offert-vy (för Offert & avtal-feature)
- Kundvy mobil-screenshot (för Kundvy-feature + Homeowner-sektion)
- Marcus Holmberg-foto (testimonial)

## Filer i denna bunt
- `Landing v2.html` — kör i webbläsare för att se designen (har en design-canvas wrapper med strategi-card, hero-zoom, full sida desktop, mobil)
- `screenshots/01-desktop-full.png` — hela desktop-sidan stitchad (1280-bred, paper-tema)
- `screenshots/02-hero.png` — hero-zoom (rena pixlar, ingen canvas-chrome)
- `screenshots/03-mobile-full.png` — hela mobilsidan stitchad (390-bred)
- `v2/landing.jsx` — alla komponenter (`HeroEditorial`, `StatsBand`, `BuilderFeatures`, `HomeownerAsFeature`, `Testimonial`, `Pricing`, `FAQ`, `FinalCTA`, `PublicFooter`, `LandingEditorial` (composed), `LandingMobile`, plus atoms `Shot`/`Anno`/`Pill`/`Logo`/`PublicNav`)
- `v2/design-canvas.jsx` — bara för design-canvas i HTML-filen, behövs INTE för implementation
- `shared.jsx` — `Ico`/`icons` helpers (mappa till `lucide-react` i implementation)
- `tokens.css` — alla designtokens

## Refererade filer i Renomate-repot
- `src/pages/Index.tsx` — nuvarande landing (ersätt)
- `src/pages/LandingTest.tsx` — A/B/C-testvarianter (kan tas bort efter implementation)
- `src/components/Footer.tsx` — återanvänds
- `src/hooks/useGuestMode.ts` — återanvänds
- `src/components/guest/GuestRoleModal.tsx` — återanvänds
- `src/constants/publicDemo.ts` — `PUBLIC_DEMO_PROJECT_ID`

## Implementationsordning (förslag)
1. Lägg in `tokens.css` i `src/index.css` (paper-tema som default eller scoped på publika sidor)
2. Lägg till Fraunces + JetBrains Mono i font-import
3. Skapa `src/components/landing/` med `Shot`, `Anno`, `Pill`, `Logo`, `PublicNav`
4. Skapa `src/components/landing/sections/` med en fil per sektion
5. Komponera i `src/pages/Index.tsx`, ersätt allt nuvarande
6. Lägg till i18n-nycklar för alla strängar (svenska redan i designen, behöver engelska översättningar)
7. Ta bort `src/pages/LandingTest.tsx` när det är klart
