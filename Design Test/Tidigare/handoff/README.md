# Renofine — Design Handoff Pack

**For Claude Code / developers implementing the Renofine 2026 design refresh.**

This folder contains six HTML mockups + their JSX source + the brand pack. Open `index.html` for a guided tour, or jump into any individual file.

---

## What you're looking at

A complete visual direction refresh for [renofine.com](https://renofine.com), built on top of the existing Vite + React + Tailwind + shadcn codebase at `opcalpa/renomate`. The visual system is **paper-warm with editorial typography** — Fraunces for display, Inter Tight for UI, JetBrains Mono for numerics, all on a `#FAFAF7` paper background with `#1A1A17` ink and `#2F5D4E` green as the only chromatic accent (mostly for ROT highlights and primary CTAs).

These mockups are **static React prototypes**, not production code. They're meant as a north star — the developer reads the JSX to see exact layout, spacing, copy, and component composition, then translates into shadcn + Tailwind in the real codebase.

---

## Files

| # | File | What it is | Maps to in code |
|---|---|---|---|
| 01 | `01-Renofine-2026.html` | 7 surfaces side-by-side on a pan/zoom canvas: Dashboard, Project detail, Floor map, Tasks/Kanban, Purchase orders, Client view, Timeline | `src/pages/Projects.tsx`, `src/pages/ProjectDetail.tsx`, `src/components/floormap/*`, etc. |
| 02 | `02-Dashboard-Full-Spec.html` | Dashboard alone, with all data states (empty, one project, many projects, error, loading) + handoff spec card | `src/pages/Projects.tsx` (overview) |
| 03 | `03-Home-Homeowner.html` | Hemskärm för hemägare, 3 lägen via Tweaks (empty / 1 active / many+history) | `src/pages/OwnerStart.tsx` |
| 04 | `04-Home-Contractor.html` | Hemskärm för hantverkare, 3 lägen via Tweaks (empty / busy day / quiet day) | `src/pages/Index.tsx` (contractor variant) |
| 05 | `05-Landing.html` | Public landing page | `src/pages/Index.tsx` (logged-out) |
| 06 | `06-Logotyp.html` | Logo direction + final Skåra mark + lockups | Brand assets |

Each `.html` opens in a browser standalone — no build step needed. They reference React via CDN and load JSX from `source/`.

---

## Folder map

```
handoff/
├── 01-Renofine-2026.html       ← main canvas, start here
├── 02-Dashboard-Full-Spec.html
├── 03-Home-Homeowner.html
├── 04-Home-Contractor.html
├── 05-Landing.html
├── 06-Logotyp.html
├── index.html                   ← guided tour with previews
│
├── source/                      ← all JSX source files (referenced by HTMLs)
│   ├── tokens.css
│   ├── design-canvas.jsx
│   ├── shared.jsx               ← AppHeader, Sidebar, primitives
│   ├── dashboard.jsx
│   ├── dashboard-states.jsx
│   ├── project-detail.jsx
│   ├── floormap.jsx
│   ├── tasks.jsx
│   ├── purchases.jsx
│   ├── client-view.jsx
│   ├── timeline.jsx
│   ├── handoff.jsx
│   ├── v2/                      ← Home + Landing + Tweaks panel
│   │   ├── home-homeowner.jsx
│   │   ├── home-contractor.jsx
│   │   ├── landing.jsx
│   │   ├── tweaks-panel.jsx
│   │   └── design-canvas.jsx
│   └── logo/                    ← Logo exploration
│       ├── marks.jsx
│       ├── marks-v2.jsx
│       ├── finals.jsx
│       └── design-canvas.jsx
│
└── brand/                       ← Final brand pack
    ├── svg/                     ← mark, wordmark, lockup, app-icon, OG
    ├── png/                     ← favicon, app-icons (180/192/512/1024), OG
    ├── components/Logo.jsx      ← drop-in React component
    ├── tokens.css               ← CSS variables
    ├── manifest.webmanifest
    ├── BRAND-GUIDE.md           ← usage rules, do's & don'ts
    ├── brand-sheet.html         ← printable A4 reference
    ├── index.html               ← brand pack preview
    └── README.md
```

---

## Design system — the short version

### Colors (from `brand/tokens.css`)
- **Ink** `#1A1A17` — text, mark
- **Paper** `#FAFAF7` — default background
- **Green** `#2F5D4E` — ROT, primary CTA, accent only (a seasoning, never a wash)
- **Surface 1** `#F5F2E8` — card
- **Surface 2** `#EFEAE0` — hover / sunken
- **Hairline** `#E8E4D8` — borders, dividers

### Typography
- **Display** — Fraunces, regular, letter-spacing −2.5%
- **UI** — Inter Tight, 400/500/600
- **Numerics** — JetBrains Mono, 400/500 (for budget figures, project IDs, timestamps)

### Radii
- 4 px (chips), 8 px (cards), 12 px (hero / modal)

### Spacing rhythm
- Use 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 px
- Card padding 24–32 px (large) or 16–18 px (compact)
- Section gap 32–48 px

### Mark
- **Skåra** — solid disc with a rectangular notch in upper-right quadrant
- Path: `M32 6 a26 26 0 1 0 26 26 h-12 v-14 h-14 z` on a `0 0 64 64` viewBox
- Holds at 14 px

---

## How to translate into the codebase

1. **Copy `brand/tokens.css` into `src/styles/`** (or merge into your existing `index.css`). Update Tailwind config to read these CSS variables as theme colors:
   ```js
   // tailwind.config.js
   theme: {
     extend: {
       colors: {
         ink: 'var(--rf-ink)',
         paper: 'var(--rf-paper)',
         green: 'var(--rf-green)',
         /* ... */
       },
       fontFamily: {
         display: ['Fraunces', 'Georgia', 'serif'],
         sans: ['"Inter Tight"', 'system-ui', 'sans-serif'],
         mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
       },
     },
   }
   ```

2. **Drop `brand/components/Logo.jsx` into `src/components/`** and replace the existing logo references in `AppHeader.tsx`.

3. **Drop favicon + app-icons** from `brand/png/` into `public/` and update `index.html` head:
   ```html
   <link rel="icon" type="image/svg+xml" href="/mark-ink.svg"/>
   <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png"/>
   <link rel="apple-touch-icon" sizes="180x180" href="/app-icon-paper-180.png"/>
   <link rel="manifest" href="/manifest.webmanifest"/>
   ```

4. **For each surface (01–05), open the matching JSX in `source/`** and:
   - Match the layout structure
   - Lift exact spacing, font sizes, colors
   - Replace placeholder Swedish copy with i18n keys (look in `src/i18n/locales/sv.json` for existing strings; add new ones)
   - Wire up real data via existing hooks/contexts

5. **The Tweaks panels in 03/04 are dev-only** — they exist to show data state variations. Don't ship the Tweaks UI; pick one default state and ensure your component handles the others gracefully.

---

## Notes for Claude Code

- The mockups are intentionally **opinionated about copy** in Swedish. Treat copy as a design choice, not placeholder — discuss any changes before rewriting.
- **Don't deviate from the palette** without good reason. Particularly: don't use Tailwind's default green/blue — they read as generic SaaS.
- The design avoids **Tailwind shadow defaults**. Use the `--rf-shadow-*` tokens instead (warmer, paper-aware).
- **Numerals always go in JetBrains Mono** — budget figures, ROT %, room dimensions, dates. This is a load-bearing detail of the brand.
- **Fraunces is for headlines and the wordmark only.** Don't set body copy in it.

---

## Open questions for the team

- Should the Tweaks panel ship in dev/staging as a debug tool? (Could be useful for QA across data states.)
- Floor map: the mockup shows a 2D plan with the existing Leaflet-based renderer assumption. Is the 3D variant in scope for this refresh?
- Client view: who has access — only homeowner role, or also "guest" link?

Drop questions in chat or as code review comments. Happy to iterate.
