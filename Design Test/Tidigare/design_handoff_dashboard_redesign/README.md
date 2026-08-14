# Handoff — Dashboard Redesign (Renofine)

> **Target stack:** React (Vite or CRA). Styling approach is your call — the prototype uses plain CSS with CSS variables; pick whatever matches conventions in the repo (Tailwind, CSS Modules, vanilla CSS are all fine). The *values* in `tokens.css` must be preserved regardless of styling approach.

---

## About the design files

The files in `design_files/` are **design references created in HTML** — React components rendered through inline Babel, not production code to copy directly. They are the source of truth for **layout, tokens, copy, and interaction vocabulary**, but you should **recreate them in the app's existing React environment** using its established component patterns. If the app has a design-system primitive (Button, Card, Chip, Input), use it, and only fall back to new primitives where the design genuinely calls for something new.

**Fidelity: HIGH.** Colors, typography, spacing, and micro-interactions are final. Match them precisely.

---

## Scope for this pass

Implement the **main dashboard view** — the canonical signed-in state a returning user lands on when they have active projects. Modals, mobile, onboarding, and alternate states are out of scope for this pass (they exist in the source HTML and can be lifted later).

---

## What "main dashboard" contains

Top-down, one column, max content width 1200px, centered.

1. **App header** — brand mark (R) + wordmark "Renofine", nav (Start · Hitta proffs · Tips · Nyheter), right-aligned icon actions (search, notifications, avatar). Sticky. Shared across app.
2. **Greeting block** — eyebrow "MIN START · [day, date]" (uppercase mono, 11px, letter-spacing 0.1em), display serif greeting "God morgon, [name]." (48px Fraunces, weight 400, letter-spacing -0.025em), muted supporting line with bolded counts ("Du har **3 arbeten** som behöver uppmärksamhet idag och en materialbeställning som väntar på godkännande.").
3. **Stat strip** — 3 equal cards in a grid. Each card: uppercase mono eyebrow (label), display serif number (48px), footnote detail. Labels: "AKTIVA PROJEKT / ARBETEN DENNA VECKA / BUDGET KVAR". Cards use `.rf-card` (surface + hairline + radius-lg).
4. **Projects list** — section header with display serif title "Dina renoveringar", right side has segmented filter (Alla · Pågående · Avslutade) + a ghost "+ Nytt projekt" button. The list is a table-like card with a header row and data rows. Columns: **Projekt** (name + address), **Arbeten** (completed/total, mono-tabular numerals), **Budget** (spent/total tkr), **Framsteg** (thin 4px progress bar + chip), **State** (reserved right column).
5. **Activity rail** — right-docked narrow column "I DAG / Aktivitet" with a display serif header and a vertical list of activity items (avatar dot + timestamp + actor + action). This sits beside the projects list (not full-width); on narrower viewports it collapses under the list.

See `screenshots/01-canonical.png` for the rendered layout.

---

## Design tokens

All tokens live in `design_files/tokens.css`. Lift the `:root` / `[data-theme="paper"]` block directly into your `src/index.css` — they're already OKLCH and standards-compliant. Tokens are grouped into three themes (`paper`, `charcoal`, `blueprint`) toggleable on `<html data-theme="...">`. **Paper is the default and the one these designs are composed against.**

Key primitives already defined in `tokens.css`:

| Primitive | Class | Notes |
|---|---|---|
| Card | `.rf-card` | surface + hairline border + `--radius-lg` (12px) |
| Chip | `.rf-chip`, `.rf-chip.chip-primary`, `.rf-chip.chip-warn`, `.rf-chip.chip-muted` | 11px, pill, subtle fill |
| Button | `.rf-btn` + `.rf-btn-primary` \| `.rf-btn-ghost` \| `.rf-btn-ink` | 13px, 7×12 padding, `--radius-sm` |
| Input | `.rf-input` | 13px, hairline border, surface background |
| Tabular numerals | `.mono.tnum` | for all money + count values |
| Blueprint accent | `.blueprint-grid` | 24px grid overlay, decorative only |

Type stack (loaded via Google Fonts in `Dashboard - Full Spec.html`):
- **Inter Tight** — UI body. `font-feature-settings: "ss01", "cv11", "cv02"`. Letter-spacing `-0.003em` on body.
- **Fraunces** — display. Class `.font-display`. `opsz 144`, `SOFT 50`, letter-spacing `-0.022em`. Used for greeting, stat numbers, section titles.
- **JetBrains Mono** — numerics & eyebrows. Class `.mono`. Uppercase + letter-spacing 0.08–0.1em for label eyebrows; tabular-nums (`.tnum`) for money/counts.

---

## Component contracts (suggested React API)

```tsx
// Top-level
<Dashboard user={{ name: string, date: Date }} projects={Project[]} activity={Activity[]} />

// Primitives — live in a shared folder
<Card />
<Chip tone="neutral" | "primary" | "warn" | "muted" />
<Button variant="primary" | "ghost" | "ink" />
<ProgressBar value={0..1} />
<Stat label={string} value={string|number} detail={string} />

// Dashboard pieces
<AppHeader />                // sticky; shared across app
<GreetingBlock date name counts />
<StatStrip items={Stat[]} />
<ProjectsList projects filter onFilterChange onNewProject />
<ActivityRail items />
```

Row in `<ProjectsList>` grid: `gridTemplateColumns: "1.6fr 1fr 1fr 1.2fr auto"` · `gap: 16` · padding `14px 20px` · row divider = `1px solid var(--hairline)`. The header row uses the same grid so columns align.

---

## Interaction vocabulary

Defined in `dashboard-states.jsx` — the `<DashHover>` export shows all four states on one screen side-by-side. Lift these exact rules into your row / list components.

| State | Recipe |
|---|---|
| default | `background: var(--surface)` · hairline divider |
| hover | `background: var(--surface-2)` · **no** transform, no shadow change |
| selected | `background: color-mix(in oklab, var(--primary) 6%, var(--surface))` · 2px left accent bar in `--primary` · full width |
| focus | keyboard only · `box-shadow: 0 0 0 2px var(--primary)` inset on a 4px-inset overlay; no outline |
| disabled | `opacity: 0.55` · pointer-events: none |

Transitions: `all 120ms ease` on buttons/chips. No transitions on row hover — instant.

---

## Copy (Swedish)

All user-facing copy is Swedish; keep strings exactly as in the HTML. The main ones:

- Greeting: `God morgon, {name}.` / `Du har {n} arbeten som behöver uppmärksamhet idag…`
- Section: `Dina renoveringar`
- Filter: `Alla / Pågående / Avslutade`
- Empty: `Inga projekt ännu` / `Starta med en planlösning, importera från tidigare projekt, eller lägg till ett lead från en offertförfrågan.`
- Chips: `Pågående`, `Försenad`, `Avslutad`, `Planering`

---

## Assets

No external image assets yet. Avatars are colored circles with initials. Icons are inline SVG paths defined in `shared.jsx` (the `icons` object) — treat them as data, not a dependency; copy the path strings into your project's icon system.

---

## Files in this handoff

```
design_handoff_dashboard_redesign/
├── README.md                        ← this file
├── CLAUDE_CODE_PROMPT.md            ← paste-ready prompt for your Claude Code session
├── design_files/
│   ├── Dashboard - Full Spec.html   ← root canvas; open in browser to see all surfaces
│   ├── tokens.css                   ← all design tokens, lift wholesale
│   ├── shared.jsx                   ← AppHeader, SectionHeader, Ico, icons object
│   ├── dashboard.jsx                ← main Dashboard component (canonical state)
│   └── dashboard-states.jsx         ← empty / loading / hover-states reference
└── screenshots/
    ├── 01-canonical.png             ← the main view this pass targets
    ├── 02-empty.png                 ← empty state (future)
    └── 03-loading.png               ← skeleton (future)
```

Open `Dashboard - Full Spec.html` in any browser to see all surfaces live. The React source in `dashboard.jsx` / `dashboard-states.jsx` is the most reliable reference for exact markup and styles — the HTML is just a canvas that composes them.

---

## Definition of done

- [ ] Tokens from `tokens.css` are in the app's global CSS; `html[data-theme="paper"]` is the default.
- [ ] Fonts Inter Tight, Fraunces, JetBrains Mono are loaded.
- [ ] The canonical dashboard matches `screenshots/01-canonical.png` — greeting, stat strip, projects list, activity rail — at 1280px width.
- [ ] Row hover / selected / focus states match the recipe above.
- [ ] Copy strings are preserved verbatim (Swedish).
- [ ] Numbers use tabular numerals.
- [ ] Section titles render in Fraunces; numbers in Fraunces; eyebrows in JetBrains Mono uppercase.
