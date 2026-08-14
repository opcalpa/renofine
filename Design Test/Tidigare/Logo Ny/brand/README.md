# Renofine — Brand Assets

Brand identity package for **Renofine** — projektkontoret för byggare.

This folder contains everything needed to apply the Renofine brand to a web app, marketing site, social media, and app icons.

## Structure

```
brand/
├── README.md                    ← this file
├── BRAND-GUIDE.md               ← usage rules, do/don't, colors, type
├── tokens.css                   ← drop-in CSS variables
├── svg/
│   ├── mark/                    ← Rf monogram (the icon)
│   │   ├── rf-mark-ink.svg          (black plate, paper Rf — primary)
│   │   ├── rf-mark-green.svg        (green plate, paper Rf — accent)
│   │   ├── rf-mark-paper.svg        (paper plate, ink Rf — for dark bg)
│   │   ├── rf-glyph-ink.svg         (Rf only, no plate, ink)
│   │   ├── rf-glyph-green.svg       (Rf only, no plate, green)
│   │   └── rf-glyph-paper.svg       (Rf only, no plate, paper)
│   ├── lockup/                  ← Rf mark + "Renofine" wordmark together
│   │   ├── horizontal-ink.svg       (most-used: header, navbar)
│   │   ├── horizontal-green.svg
│   │   ├── horizontal-on-dark.svg   (paper version for dark surfaces)
│   │   ├── stacked-ink.svg          (for square/portrait spaces)
│   │   ├── stacked-green.svg
│   │   └── stacked-on-dark.svg
│   └── wordmark/                ← "Renofine" text only (no mark)
│       ├── wordmark-ink.svg
│       ├── wordmark-green.svg
│       └── wordmark-paper.svg
└── png/
    ├── app-icons/
    │   ├── app-icon-1024.png        (App Store / Play Store)
    │   ├── app-icon-512.png         (PWA, manifest.json)
    │   ├── app-icon-green-1024.png  (alt: green plate)
    │   ├── app-icon-green-512.png
    │   └── apple-touch-icon-180.png (iOS home screen)
    ├── favicon/
    │   ├── favicon-16.png
    │   ├── favicon-32.png
    │   └── favicon-48.png
    └── social/
        └── og-image-1200x630.png    (Open Graph / Twitter card)
```

## Quick install

### 1. Copy this folder into your project
Place `brand/` at your project root, or under `public/brand/` for a Vite/Next/CRA app.

### 2. Add favicons + OG to `index.html`

```html
<link rel="icon" type="image/png" sizes="16x16"  href="/brand/png/favicon/favicon-16.png">
<link rel="icon" type="image/png" sizes="32x32"  href="/brand/png/favicon/favicon-32.png">
<link rel="icon" type="image/png" sizes="48x48"  href="/brand/png/favicon/favicon-48.png">
<link rel="apple-touch-icon"      sizes="180x180" href="/brand/png/app-icons/apple-touch-icon-180.png">

<meta property="og:image"          content="/brand/png/social/og-image-1200x630.png">
<meta property="og:image:width"    content="1200">
<meta property="og:image:height"   content="630">
<meta property="twitter:card"      content="summary_large_image">
<meta property="twitter:image"     content="/brand/png/social/og-image-1200x630.png">
```

### 3. Import design tokens

```css
@import "/brand/tokens.css";
```

Or in a Vite/Next app:
```js
import "@/brand/tokens.css";
```

### 4. Use the lockup in headers

```jsx
// Header component
<img src="/brand/svg/lockup/horizontal-ink.svg"
     alt="Renofine"
     style={{ height: 32 }}/>
```

For dark backgrounds:
```jsx
<img src="/brand/svg/lockup/horizontal-on-dark.svg"
     alt="Renofine"
     style={{ height: 32 }}/>
```

### 5. Use the mark alone

```jsx
// In a tight UI spot (e.g. avatar, menu icon, loading state)
<img src="/brand/svg/mark/rf-mark-ink.svg"
     alt="Renofine"
     style={{ width: 32, height: 32, borderRadius: 6 }}/>
```

## Web font

Renofine wordmark uses **Fraunces** (variable serif, Google Fonts).

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,300;0,400;0,500;1,400;1,500&display=swap" rel="stylesheet">
```

The SVG files reference `Fraunces` and fall back to `Georgia` on render failure — visually similar, ok as fallback.

## See also

- **`BRAND-GUIDE.md`** — usage rules, color tokens, typographic scale, do/don't
- **`tokens.css`** — CSS variables ready to drop in
