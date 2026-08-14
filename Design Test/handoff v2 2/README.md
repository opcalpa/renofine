# Renofine · Handoff v2.0.0

Designpaket för Renofine — paper-warm, editorial typografi, full feature parity mot kodbasen.

> **Versionering:** se [`CHANGELOG.md`](CHANGELOG.md). Be alltid Claude Code läsa senaste versionen.
>
> **Behöver du veta vad som är klart och vad som saknas?** Öppna [`STATUS.md`](STATUS.md) — single source of truth.
>
> **Vill du ha en visuell översikt?** Öppna [`index.html`](index.html) i webbläsaren.

## Mappstruktur

```
handoff v2/
├── README.md                       Den här filen
├── STATUS.md                       Status per modul (🟢 Klar / 🟡 Delvis / 🔴 Saknas)
├── index.html                      Visuell länksida med statusbadges
│
├── 00-roadmap/                     Övergripande planering
│   ├── Feature-roadmap.html        P0-P3 prioritering
│   └── Feature-inventory.html      Komplett feature-lista per sida
│
├── 01-brand/                       Brand-systemet
│   ├── Logotyp.html                Logotyp-presentation
│   └── assets/                     SVG, PNG, ikoner, OG-bild, tokens.css, brand-guide.md
│
├── 02-pages/                       En mapp per sida
│   ├── Landing/                    design.html (🟡 skiss)
│   ├── Start-Homeowner/            design.html (🟡 skiss)
│   ├── Start-Contractor/           design.html (🟡 skiss)
│   ├── Rum/                        design.html + parity.html (🟢 klar)
│   ├── Offert/                     design.html + parity.html (🟢 klar)
│   └── Faktura/                    design.html + parity.html (🟢 klar)
│
└── 03-source/                      JSX-källor till canvas-mockups
```

## Konvention

För varje sida i `02-pages/`:

- **`design.html`** — själva designen (en eller flera scener / lägen)
- **`parity.html`** — feature-parity-rapport som listar varje funktion i kodbasen och visar var/hur den är mockad

När en parity-rapport saknas är designen att betrakta som första-skiss — kan ha luckor mot kodbasen som ännu inte identifierats.

## Designsystem

Alla mockups använder Renofine 2026 paper-warm-systemet:

- **Färger:** `#FAFAF7` paper, `#1A1A17` ink, `#2F5D4E` grön accent, `#B5341E` rust, `#A8845C` gold
- **Typsnitt:** Fraunces (display, 300/400) · Inter Tight (UI, 400/500/600) · JetBrains Mono (numerik)
- **Tokens:** se `01-brand/assets/tokens.css`

## Arbetsflöde framåt

Vi följer en parity-driven loop per modul:

1. **Läs koden** för modulen (`src/pages/...`, `src/components/...`)
2. **Lista features** — varje knapp, fält, modal, state, flöde
3. **Skissa designen** med alla features mockade
4. **Skriv parity-rapport** som visar vad som finns var
5. **Lägg in i `02-pages/<Modul>/`** + uppdatera `STATUS.md`

Se `STATUS.md` för rekommenderad ordning på återstående moduler.
