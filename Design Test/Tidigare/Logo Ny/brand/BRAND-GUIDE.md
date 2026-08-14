# Renofine — Brand Guide

> A short, opinionated guide. Read once, refer to it when in doubt.

---

## 1. The mark

The **Rf monogram** is Renofine's primary identity mark. It's the letters "Rf" in **Fraunces medium** sitting in a rounded square.

**Default version:** ink (`#1A1A1A`) plate, paper (`#FAFAF7`) Rf.

### Use the mark when:
- App icon, favicon, social profile pic
- Anywhere the wordmark "Renofine" already appears nearby (avoid redundancy)
- Tight UI spots: loading states, avatar, badge, menu icon

### Do NOT:
- ❌ Render the plate without the Rf inside (an empty rounded square is not the brand)
- ❌ Skew, rotate beyond 0/90/180/270, or stretch the mark
- ❌ Put a stroke around the plate
- ❌ Change the corner radius (currently `10/64` = `15.6%`)
- ❌ Use the mark below 16px — use the favicon-16 PNG instead at that size

---

## 2. The lockup

The **lockup** = the Rf mark + "Renofine" wordmark side by side (or stacked).

Use the lockup when:
- Website header / navbar
- Email signature
- Documents (invoices, quotes)
- Marketing material where the brand needs to be named

**Horizontal lockup** is default. **Stacked** only when horizontal won't fit (square crops, profile photos with no width).

### Sizing
- Min width for horizontal lockup: **96px**
- Below that, drop to mark only

### Clear space
Reserve at least **half the mark's height** of empty space on all sides of the lockup. Don't crowd it.

---

## 3. Color

| Token         | Hex       | Use                                    |
|---------------|-----------|----------------------------------------|
| `--ink`       | `#1A1A1A` | Primary text, primary mark fill        |
| `--paper`     | `#FAFAF7` | Background (light mode), inverted text |
| `--green`     | `#1F4D3A` | Accent (CTAs, links, highlights)       |
| `--cream`     | `#F4EFE6` | Subtle surfaces (sidebars, cards)      |
| `--hairline`  | `rgba(20,20,20,0.10)` | Borders, dividers           |

Don't introduce new brand colors without need. The palette is deliberately small.

---

## 4. Typography

| Family            | Use                                    |
|-------------------|----------------------------------------|
| **Fraunces**      | Headings, wordmark, marketing display  |
| **Inter Tight**   | Body, UI, paragraphs                   |
| **JetBrains Mono**| Kickers, labels, data, code            |

### Type scale
```
Display    72 / 1.0   Fraunces 300, letter-spacing -0.03em
H1         48 / 1.05  Fraunces 400, letter-spacing -0.025em
H2         36 / 1.1   Fraunces 400
H3         24 / 1.2   Fraunces 500
Body       15 / 1.55  Inter Tight 400
Caption    13 / 1.5   Inter Tight 400
Mono kicker 10 / 1.2  JetBrains Mono 500, uppercase, tracking 0.12em
```

Fraunces gets *italic emphasis* for editorial accents — use sparingly, for the one word in a sentence that matters.

---

## 5. Voice

Renofine is **calm, competent, hand-tools-clean**.

Anti-Excel-tone — but not anti-corporate or anti-tech. Tone for builders, written by a builder. Plain Swedish, short sentences, no jargon.

✅ "Skicka offert på 10 minuter."
❌ "Streamlined offer creation workflow."

✅ "8 timmar mindre administration per projekt."
❌ "Save up to 8 hours per project!"

---

## 6. App icons

**Primary:** `app-icon-1024.png` — ink plate, paper Rf.
**Accent:** `app-icon-green-1024.png` — green plate, paper Rf. Use only when context calls for color (a folder of mostly-black icons, etc).

**Never** ship an icon that's a colored rounded square without the Rf inside. The Rf is the brand.

---

## 7. Open Graph

`og-image-1200x630.png` — full-bleed green with white lockup and tagline. Use for all social shares unless a specific page has a custom share image.

---

## 8. File hygiene

When updating brand assets:
1. Edit the SVG source first
2. Re-export PNGs at all required sizes
3. Update this guide if you've changed something foundational
4. Bump `BRAND_VERSION` at the top of `tokens.css`

Don't ship one-off logo variants in product code. If a use case isn't covered here, talk to design first.
