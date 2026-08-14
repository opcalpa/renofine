# Renofine Brand Guide

**v1.0** — A short, opinionated guide. If something isn't covered here, ask.

## 1 · The mark — Skåra

A solid disc with a rectangular notch in the upper-right quadrant.

- **Why it works**: It's a constructed shape, not a typographic monogram. It references measured, cut, fitted work without falling into building/tool clichés.
- **Always**: Use the provided SVG. Don't redraw, recolor outside the palette, or apply effects (drop shadows, gradients, outlines).
- **Minimum size**: 14 px (digital), 8 mm (print). Below that, use the wordmark instead.

## 2 · The wordmark — Renofine

Set in **Fraunces**, regular weight, letter-spacing −2.5%.

- Never use bold, italic, condensed, or alternate weights for the mark itself.
- The wordmark may exist without the mark in tight horizontal contexts (footers, mobile nav).
- The mark may exist without the wordmark in app icons and favicons.

## 3 · Color

| Token | Hex | Use |
|---|---|---|
| Ink | `#1A1A17` | Primary text, mark on paper |
| Paper | `#FAFAF7` | Default background |
| Green | `#2F5D4E` | ROT highlights, primary CTA, accent only |
| Surface 1 | `#F5F2E8` | Card |
| Surface 2 | `#EFEAE0` | Hover / sunken |
| Hairline | `#E8E4D8` | Borders, dividers |

**Green is a seasoning, not the dish.** Use it for one element per screen — primary button, ROT badge, key chart accent. Never as a large flood color or full-bleed background.

## 4 · Clear space

Reserve a margin equal to **the height of the notch** around the mark on all sides. Around the lockup, reserve **the cap-height of the wordmark** on all sides.

```
┌──────────────┐     ← cap-height of "R"
│  ┌────────┐  │
│  │  ▣ Renofine
│  └────────┘  │
└──────────────┘     ← cap-height of "R"
```

## 5 · Sizing rules

| Context | Mark | Wordmark |
|---|---|---|
| Browser tab (favicon) | 16 px (transparent) | – |
| App icon (iOS) | 180 px on full-bleed plate | – |
| Top-nav (desktop) | 24–28 px | 28–32 px |
| Top-nav (mobile) | 22–24 px | 26–28 px |
| Hero / marketing | 64–120 px | 56–96 px |
| Print letterhead | 12 mm | 14 mm |

## 6 · Don'ts

- ❌ Don't put the mark on a busy photo without the paper plate
- ❌ Don't recolor the notch or fill it with a different color
- ❌ Don't outline the mark — it's a solid form
- ❌ Don't add a drop shadow, glow, or gradient
- ❌ Don't tilt or rotate the mark — the notch position is fixed
- ❌ Don't use the green plate variant alongside green CTA buttons (it competes)
- ❌ Don't pair the wordmark with any font other than Fraunces

## 7 · Background pairings

| Background | Use |
|---|---|
| Paper (`#FAFAF7`) | `mark-ink.svg` + `wordmark-ink.svg` |
| White | Same as paper |
| Ink (`#1A1A17`) | `mark-paper.svg` + `wordmark-paper.svg` |
| Green (`#2F5D4E`) | `mark-paper.svg` + `wordmark-paper.svg` |
| Photo | Use lockup with paper plate (`lockup-horizontal-on-paper.svg`) |

## 8 · Voice (one-liner)

> Renofine helps homeowners and craftsmen run renovations like they actually run — with the paperwork, the budgets, and the reality of who's on site this Tuesday.

Calm. Specific. Swedish-first. No hype, no exclamation marks, no "revolutionize."

---
Last updated: brand v1.0 · Skåra mark
