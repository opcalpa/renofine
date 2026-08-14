# Claude Code — Apply Renofine Brand

You are applying the Renofine brand identity to this codebase.

The full assets are in `brand/`. Read `brand/README.md` and `brand/BRAND-GUIDE.md` first.

## What to do

### 1. Wire up the design tokens

Find the project's main global stylesheet (look for `index.css`, `globals.css`, `app.css`, or similar at root or under `src/`).

At the **top** of that file, add:

```css
@import "/brand/tokens.css";
```

If the project uses a different asset layout (e.g. `public/brand/` for Vite/Next), adjust the path.

If the codebase has existing color tokens that conflict (e.g. `--primary` set to a different color), **replace** their values with the Renofine ones rather than duplicating. Check `brand/tokens.css` for the source of truth.

### 2. Update the favicon and OG meta in `index.html`

Find the project's `index.html` (usually at root or `public/`). Replace any existing favicon/og tags with:

```html
<!-- Renofine brand — favicons -->
<link rel="icon" type="image/png" sizes="16x16"  href="/brand/png/favicon/favicon-16.png">
<link rel="icon" type="image/png" sizes="32x32"  href="/brand/png/favicon/favicon-32.png">
<link rel="icon" type="image/png" sizes="48x48"  href="/brand/png/favicon/favicon-48.png">
<link rel="apple-touch-icon" sizes="180x180"     href="/brand/png/app-icons/apple-touch-icon-180.png">

<!-- Renofine brand — social -->
<meta property="og:image"        content="/brand/png/social/og-image-1200x630.png">
<meta property="og:image:width"  content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card"        content="summary_large_image">
<meta name="twitter:image"       content="/brand/png/social/og-image-1200x630.png">

<!-- Renofine brand — fonts -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,300;0,400;0,500;1,400;1,500&family=Inter+Tight:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

### 3. Replace logo/wordmark uses with the new lockup

Search the codebase for the existing logo / brand element. Common locations:
- A `Logo` or `Brand` component under `src/components/`
- The site header / navigation bar
- Email / PDF templates

Replace with the appropriate SVG:

```jsx
// Header (light surface)
<img src="/brand/svg/lockup/horizontal-ink.svg" alt="Renofine" style={{ height: 32 }}/>

// Header on dark surface (e.g. footer)
<img src="/brand/svg/lockup/horizontal-on-dark.svg" alt="Renofine" style={{ height: 32 }}/>

// Tight UI spot (avatar, sidebar collapsed, etc)
<img src="/brand/svg/mark/rf-mark-ink.svg" alt="Renofine" style={{ width: 28, height: 28 }}/>
```

If the project has a `<Logo />` React component, update its implementation to render the SVG and respect a `variant` prop:

```jsx
// brand/Logo.jsx — drop into your components folder
export function Logo({ variant = "horizontal", surface = "light", size = 32 }) {
  const map = {
    "horizontal-light":  "/brand/svg/lockup/horizontal-ink.svg",
    "horizontal-dark":   "/brand/svg/lockup/horizontal-on-dark.svg",
    "stacked-light":     "/brand/svg/lockup/stacked-ink.svg",
    "stacked-dark":      "/brand/svg/lockup/stacked-on-dark.svg",
    "mark-light":        "/brand/svg/mark/rf-mark-ink.svg",
    "mark-dark":         "/brand/svg/mark/rf-mark-paper.svg",
    "wordmark-light":    "/brand/svg/wordmark/wordmark-ink.svg",
    "wordmark-dark":     "/brand/svg/wordmark/wordmark-paper.svg",
  };
  const key = `${variant}-${surface}`;
  return <img src={map[key]} alt="Renofine" style={{ height: size }}/>;
}
```

### 4. Audit for stragglers

Search and remove:
- Any inline SVG logos that predate this brand
- Hardcoded color values that should use tokens (search for hex codes like `#000`, `#fff`, etc — replace with `var(--fg)`, `var(--bg)`)
- Any references to old logo files under `public/`, `assets/`, or similar — delete them

### 5. Verify

After changes:
- Run the dev server, confirm favicons show in the browser tab
- Open the site on mobile (or DevTools mobile mode), confirm apple-touch-icon works
- Share a link in Slack/iMessage to confirm the OG image renders
- Inspect the DOM to confirm `var(--primary)` resolves to the new green
- Take a screenshot of the header — the lockup should be sharp at all DPRs

## Out of scope

Do **not** touch:
- Component layout / structure (only swap the visual asset)
- Copy / wording (the brand voice is Swedish, lugn-och-kompetent — leave existing copy unless it's blatantly off-tone)
- Routing, state, business logic
- Tests (unless a snapshot test of a header is failing — update the snapshot, don't dilute the brand)

## Troubleshooting

- **Fonts look wrong:** Confirm the Google Fonts `<link>` is in `<head>`, not `<body>`.
- **Green color looks different on Safari:** `oklch()` is supported in Safari 15.4+. If older Safari support matters, use `--color-green-hex: #1F4D3A` instead.
- **SVG won't load:** Check the path. Vite/Next public-folder assets are served from `/`, not `/public/`.
- **Logo too big in header:** Set explicit `height` (e.g. `style={{ height: 32 }}`); width auto-scales.

## Done?

When the brand is applied, take a screenshot of the homepage header and one of the logged-in app shell, and report back. We'll review and iterate.
