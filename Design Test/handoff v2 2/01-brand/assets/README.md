# Renofine Brand Pack

**Version 1.0 · Skåra mark + Fraunces wordmark**

A complete asset pack for Renofine: SVG logos, raster app icons, favicons, social cards, design tokens, and a drop-in React component.

## What's inside

```
brand/
├── svg/                       # Vector — primary deliverables
│   ├── mark/                  # Just the symbol
│   │   ├── mark-ink.svg
│   │   ├── mark-paper.svg
│   │   └── mark-green.svg
│   ├── wordmark/              # Just "Renofine" in Fraunces
│   ├── lockup/                # Mark + wordmark together
│   │   ├── lockup-horizontal-{ink,green,on-dark,on-paper}.svg
│   │   └── lockup-stacked-{ink,green,on-dark}.svg
│   ├── app-icon/              # Mark on a colored plate (squircle)
│   └── social/                # OG card 1200×630
│
├── png/                       # Raster — for places that can't use SVG
│   ├── favicon/               # 16, 32, 48 (transparent + paper bg)
│   ├── app-icons/             # 180 (iOS), 192 (Android), 512, 1024 — 3 plate variants
│   └── social/                # OG card PNG
│
├── components/
│   └── Logo.jsx               # Drop-in React component
├── tokens.css                 # CSS variables (colors, type, spacing)
├── BRAND-GUIDE.md             # Usage rules, do's & don'ts
├── brand-sheet.html           # Printable one-page reference
└── README.md
```

## Quick start

### Web (React)
```jsx
import { Logo, Mark } from "./brand/components/Logo";
import "./brand/tokens.css";

<Logo size={28} />                      // mark + wordmark
<Logo size={28} variant="green" />      // green
<Logo size={28} stacked />              // mark above text
<Mark size={20} color="#2F5D4E" />      // mark only
```

### Favicon HTML
```html
<link rel="icon" type="image/svg+xml" href="/brand/svg/mark/mark-ink.svg" />
<link rel="icon" type="image/png" sizes="32x32" href="/brand/png/favicon/favicon-32.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/brand/png/app-icons/app-icon-paper-180.png" />
```

### Open Graph / social
```html
<meta property="og:image" content="https://renofine.com/brand/png/social/og-card-1200x630.png" />
<meta name="twitter:card" content="summary_large_image" />
```

## Design choices (the short version)

- **Mark — Skåra**: A solid disc with an exact rectangular notch in the upper-right quadrant. Reads as a precision-cut shape, references measured construction without literal hammers/houses. Holds at 14 px.
- **Wordmark — Fraunces**: Editorial serif that gives the brand a hand-built, considered feel. Use the regular weight; never bold.
- **Colors**: Warm paper (`#FAFAF7`) as the default canvas, ink (`#1A1A17`) for type, green (`#2F5D4E`) for ROT/primary action accents. The pack avoids large fields of green — green is a moment, not a wash.

See `BRAND-GUIDE.md` for clear-space, sizing rules, and what not to do.

---
Need a variant that's not in here? Tell me what surface you're applying it to and I'll generate it.
