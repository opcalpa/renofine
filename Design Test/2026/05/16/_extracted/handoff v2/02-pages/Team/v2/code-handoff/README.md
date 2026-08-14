# Handoff: Team &amp; Inbjudningsflöde v2 (Renofine v2.2.0)

> **För Claude Code:** detta är en designreferens i HTML, inte production code att kopiera rakt. Uppgiften är att **återskapa designen i Renofine-kodbasen** (React + TypeScript + Supabase + Tailwind + shadcn/ui) enligt befintliga patterns. Schema-ändringar är produktions-ready och kan köras som de är.

## Snabbreferens

| Fil | Vad det är |
|---|---|
| `README.md` | Detta dokument |
| `01-migration.sql` | **Ready-to-run** SQL migration för 5 schema-ändringar |
| `02-personaToAccess.ts` | Ny derive-funktion som ersätter `packageToAccess.ts` |
| `03-projectDataService.ts` | Skeleton för field-masking i datalagret |
| `04-component-changes.md` | Fil-för-fil-lista över ändringar (skapa/modifiera/ta bort) |
| `05-test-checklist.md` | Manuell + automatisk testplan |
| `design-reference/` | Original HTML-prototyper för visuell referens |

## Översikt

Team-fliken och inbjudningsflödet i Renofine har genomgått en grundlig analys (5 dokument i föregående mapp). Resultatet är att **modellen är strukturellt rätt men fasaden är otydlig och läcker på minst 10 ställen**. Denna handoff levererar V2-design och implementationsplan som löser alla läckor och förenklar UX:n radikalt.

**Kärnförändring:** Wizardens första fråga går från `"worker eller member?"` (teknisk datakontrakt-fråga) till `"vem är personen?"` (mänsklig). Sedan väljs en `ekonomi-mode` (None/Egna/Full) som deterministiskt mappar mot den befintliga 11-fält `FeatureAccess`-matrisen.

## Designramverk

### 4 personas (alla val tillgängliga vid invitation)
1. **Worker (token)** — Engångsuppdrag. WorkerView, ingen inlogg, ingen ekonomi.
2. **Klient** — PM bjuder in sin slutkund. CustomerView (separat surface), egen sida av bordet.
3. **UE-medlem** — Återkommande hantverkare/specialist (inkl. designer/arkitekt). Full app med scope:assigned default.
4. **PM / Co-owner** — Partner eller anlitad PM. Full app, admin-rättigheter. Två sub-typer (etiketter): "Partner" eller "Anlitad PM".

### 3 ekonomi-modes (gäller UE-medlem + PM)
- **None** — Inga belopp visas någonstans.
- **Egna** — Bara egna materials/timrapporter. Inga task-budgetar, inga andra UE:s priser.
- **Full** — Allt synligt, inkl. marginal och vinst.

### 2 projekt-toggles (på project-nivå)
- **`tracks_economy`** (default `true` för proffs, `false` för hemägar) — Stänger av/på Budget-tab och ekonomi-tracking globalt.
- **`tracks_rot`** (default `false`) — ROT-avdrag opt-in per projekt.

## Om designreferensfilerna

Filerna i `design-reference/` är **HTML-prototyper** byggda med React + Babel inline i webbläsaren. De visar:
- Färg, typografi, spacing, hover-states (high-fidelity)
- Layout-strukturen för wizard + table + projekt-skapande
- Exakta copy och microcopy

De är **inte** kod att kopiera in i kodbasen. Använd dem som visuell sanning, men implementera i:
- **React 18** (befintlig stack)
- **TypeScript** (strict)
- **Tailwind + shadcn/ui** (befintliga komponenter — Dialog, Button, Select, etc.)
- **Supabase** för data + RLS
- **react-i18next** för i18n (alla strängar i `src/i18n/locales/`)

## Fidelity

**Hifi** — pixel-perfekta mockups med slutgiltiga färger, typografi, spacing och interaktioner. Det är så det ska kännas.

**Designsystem:** Renofine 2026 paper-warm. Tokens redan i `src/index.css` + Tailwind config.
- `#FAFAF7` paper · `#1A1A17` ink · `#2F5D4E` grön accent · `#B5341E` rust · `#A8845C` gold
- Fraunces (display) · Inter Tight (UI) · JetBrains Mono (numerics)

## Skärmar / vyer (9 artboards)

### 1. Strategi-overview *(intern dokumentation, behöver inte implementeras)*
Visualiserar designramverket. Stannar i handoff-mappen.

### 2. Wizard Step 1 — Persona-val
**Plats:** `src/components/project/team/invite-wizard/WizardStep1Path.tsx` (refaktorera)

**Layout:** Modal-dialog, 540px bred. Stor titel + 4 persona-kort i 2×2-grid.

**Komponent:** PersonaCard — knappar med:
- Ikon (38×38, rounded 10px, färg per persona)
- Title (Fraunces, 16px, weight 500)
- Description (Inter Tight, 11.5px, muted)
- Surface-label (mono, 10px, persona-färg, uppercase)
- Selected state: 2px solid persona-färg + greenSoft background

**Copy:** Exakt enligt design-reference. Använd i18n-keys:
- `team.persona.worker.title` = "Hantverkare med jobb"
- `team.persona.worker.description` = "Får ett dagsjobb via SMS-länk. Behöver inget konto."
- (4 personas totalt)

### 3. Wizard Step 2 — UE-medlem konfiguration
**Plats:** Ny fil `src/components/project/team/invite-wizard/WizardStep2Member.tsx`
(ersätter `WizardStep3Member.tsx`)

**Sektioner i ordning:**
1. **Yrke** — pill-rad (etikett bara): Elektriker · VVS · Snickeri · Måleri · Plattsättning · Designer · Arkitekt · Annat
2. **Vilka delar av projektet?** — 2×2 kort:
   - Mina tasks (default vald) → scope:assigned
   - Alla tasks → scope:all
   - Specifika rum → öppnar room-picker
   - Tasks med tag → öppnar tag-picker
3. **Ekonomi-åtkomst** — 2 stora kort (sida vid sida):
   - **Inga belopp** (default för granskare-fallet)
   - **Egna belopp** (default för UE)
4. **Inköpsbehörigheter** — toggles:
   - Kan föreslå inköp (default på)
   - Kan logga utförda inköp direkt (default av)
   - Kan se andra UE:s leverantörsnamn utan priser (bara om Mode = Egna)

### 4. Wizard Step 2 — PM/Co-owner konfiguration
**Plats:** Ny fil `src/components/project/team/invite-wizard/WizardStep2PM.tsx`

**Sektioner:**
1. **Relation** — 2 kort:
   - "Min partner / co-owner" → `role_type: "co_owner"`
   - "Min anlitade projektledare" → `role_type: "pm_hired"` (NY enum-värde)
2. **Ekonomi-åtkomst** — 3 kort (None/Egna/Full, Full default)
3. **Övriga rättigheter** — toggles (bjuda in, ändra projekt, interna meddelanden, notiser)
4. **Tidsbegränsning** — pill-rad: Permanent · Hela projektet (default) · 90 dagar · Egen datum
   - Sätter `project_shares.expires_at` (NY kolumn)

### 5. Wizard Step 3 — Kontakt + förhandsvisning
**Plats:** Modifiera `WizardStep4Contact.tsx`. Bredda dialog till 720px (vid 2-kolumn).

**Vänster kolumn:** Befintliga fält (namn, email, telefon, språk, välkomstmeddelande).

**Höger kolumn:** Ny komponent `InvitePreviewOverlay.tsx`.
- Header med "Förhandsgranska som [namn]" + knapp "Öppna full"
- Iframe-liknande mini-preview av Översikt + en task + Inköp
- Field-masking enligt vald persona+mode
- "Öppna full" → modal-overlay som visar samma sak fullskärm

### 6. TeamTable v2
**Plats:** Modifiera `src/components/project/team/TeamTable.tsx`

**Nya kolumner (i den ordningen):**
1. Namn + roll (befintlig, behåll)
2. **Persona** (NY) — färgkodad pill, mappar från `project_shares.role_type`:
   - Owner (ink, paper2 background)
   - Co-owner (green)
   - Anlitad PM (rust)
   - UE-medlem (blå-oklch)
   - Klient (green)
   - Worker (gold)
3. **Mode** (NY) — mono-pill:
   - "Full ekonomi" (rust)
   - "Egna belopp" (green)
   - "Inga belopp" (mut)
   - "Klientvy" (green)
4. Kontakt (befintlig)
5. **Senast aktiv** (NY) — från `access_log`-tabellen
6. **Actions** (befintliga + 1 ny: "Förhandsgranska som")

**Filter-flikar ovan tabellen:** Alla · Aktiva · Workers · Utgångna

### 7. Audit-log
**Plats:** Ny fil `src/components/project/team/AccessAuditLog.tsx`. Egen sub-tab på Team-fliken.

**Layout:** Rad-baserad lista. Per rad:
- Ikon (28×28, persona-färgad bakgrund)
- "[Vem] [action] [target]" som sammanhängande mening
- Tidsstämpel höger (mono, uppercase, "12 min sedan")
- Nekade åtkomster: rustSoft bakgrund

**Filter-pills:** Alla · Sidvisningar · Filer · Inställningar · Nekad åtkomst

### 8. Preview-matris *(intern dokumentation, behöver inte implementeras direkt)*
Visualiserar hur samma projekt ser olika ut för 4 personas. Kan användas som referens när du implementerar field-masking.

### 9. Projekt-skapande v2
**Plats:** Modifiera `src/components/project/CreateProjectDialog.tsx`

**Bredda till 920px (2-kolumn).** Vänster: befintliga fält. Höger:
- **Track ekonomi i Renofine** toggle (default på för proffs-konto)
- **Använd ROT-avdrag** toggle (default av — KRITISKT, dagens default är via modul som är på)
- **Vem äger projektet?** — 2 kort: Jag (proffs) / Jag (hemägare)
  - Sätter `projects.owner_user_type` cachat värde

## Interaktioner &amp; beteende

### Wizard flow
- Step 1 → Step 2 (persona-specifik) → Step 3 (kontakt + preview)
- "Tillbaka"-knapp aktiv från Step 2
- Avbryt → konfirmationsdialog om något fyllts i
- Skicka → spinner, sedan success-screen (för worker) eller toast (för member)

### Förhandsvisning
- Mini-preview uppdaterar live när användaren ändrar persona/mode/scope
- "Öppna full" expanderar till modal-overlay
- ESC stänger preview

### TeamTable
- Klick på rad expanderar (befintligt beteende, behåll)
- Klick på persona-pill öppnar inställnings-popup för att ändra
- Klick på mode-pill samma sak
- Klick på "Förhandsgranska som"-ikon öppnar `InvitePreviewOverlay` för den raden

## State management

### Wizard
**Behåll** befintlig `useInviteWizard` hook. Ändra:
- `state.path` → `state.persona: InvitePersona`
- Lägg till `state.mode: "none" | "own" | "full"`
- Lägg till `state.subType?: "co_owner" | "pm_hired"` (bara för PM-persona)
- Lägg till `state.expiresAt?: Date | null`

### TeamTable
**Ny hook:** `useTeamRowsV2(projectId)` — returnerar rader med persona-pill-data, mode-pill-data, last-active. Använder ny RPC `get_team_rows`.

**Ny hook:** `useLastActive(profileId, projectId)` — query mot `access_log`.

### Preview overlay
**Ny hook:** `usePreviewData(persona, mode, scopeRule, projectId)` — returnerar field-maskad project-data via service layer (se `03-projectDataService.ts`).

## Design tokens (alla finns redan)

Använd befintliga Tailwind/CSS-variabler:
- Färger: `--paper`, `--ink`, `--mut`, `--green`, `--rust`, `--gold`, `--line`
- Spacing: standard Tailwind scale
- Border radius: `--radius-sm` (6px), `--radius-md` (8px), `--radius-lg` (12px)
- Font: `font-display` (Fraunces) klass redan definierad
- Shadow: `--shadow-md`, `--shadow-lg`

## Assets

Inga nya assets behövs. Lucide-icons via befintliga imports:
- Worker: `Send` / `Wrench`
- Klient: `Users`
- UE-medlem: `HardHat` / `Tag`
- PM/Co-owner: `Layers` / `Crown`

## Filer

Designreferensfilerna ligger i `design-reference/`:
- `design.html` — huvudprototyp med design-canvas
- `parity.html` — full parity-mapping mot kodbasen
- `team-v2.jsx` — React-komponenter (referens, ej production)
- `tokens.css` — designtokens (redan i kodbasen)
- `shared.jsx` — AppHeader/SectionHeader referens

## Migration order (kritisk — följ denna)

1. **Schema-migration** (kör `01-migration.sql` i Supabase)
2. **TypeScript types** uppdateras i `src/integrations/supabase/types.ts` (regenerera via Supabase CLI)
3. **Service layer** (`03-projectDataService.ts`) skapas och hooks pekar om
4. **personaToAccess** (`02-personaToAccess.ts`) ersätter `packageToAccess.ts`
5. **Wizard-komponenter** refaktoreras
6. **TeamTable v2** + AuditLog läggs till
7. **CreateProjectDialog** får nya toggles
8. **Verifiering** via `05-test-checklist.md`

Se `04-component-changes.md` för exakt fil-lista.

## Frågor / klargöranden

Om något i designen är otydligt — kolla `parity.html` (i design-reference/), den har "Beslut"-block för varje icke-trivial omarbetning. Eller fråga i Linear/Slack.

---

**Version:** Renofine v2.2.0 · 16 maj 2026
**Föregående analys:** 5 dokument i `02-pages/Team/` (analysis.html, analysis-2-access-logic.html, plattform-och-personer.html, del-4-uppfoljning.html, v2/parity.html) — läs dem om du vill förstå reasoning bakom designbesluten.
