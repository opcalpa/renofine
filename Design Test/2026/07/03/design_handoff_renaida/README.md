# Handoff: Renaida — assistent-avatar

## Översikt
**Renaida** är den inbyggda AI-assistenten i Renofine. Den här leveransen tar Renofines
logotyp — **Skåra-marken** (en disc med en utskuren fals) — och gör den till en levande
avatar som hälsar, lyssnar, tänker, pratar, vägleder och firar. Avataren används för att
hjälpa användaren att *fylla appen med innehåll* (onboarding, skapa första projektet) och
*hitta rätt i UI:t* (peka mot nästa steg).

Idén i en mening: **falsen i marken blir ett öga.** Ingen ny form ritas — marken tolkas.

> Namnet *Renaida* = **Ren**- (Renofine) + gömt **AI** i mitten (Ren·**ai**·da).

---

## Om designfilerna
Filerna i det här paketet är **designreferenser byggda i HTML/React** — de visar avsedd
look, rörelse och beteende. De är **inte** produktionskod att klistra in rakt av.
Uppgiften är att **återskapa avataren i Renofines riktiga kodbas** (React/TS enligt
`src/`-strukturen) med appens etablerade mönster, tokens och komponentbibliotek.

SVG-geometrin och animationsvärdena nedan är exakta och ska kopieras 1:1. Presentations-
sidan (`Renaida.html`) är en showcase — bara avatar-komponenten + dess keyframes är det
som ska produktionssättas.

## Fidelity
**High-fidelity.** Slutliga färger, geometri, animationskurvor och timing är satta och ska
återskapas pixel-/frame-exakt med Renofines befintliga designsystem (tokens i `tokens.css`).

---

## Komponent: `RenaidaAvatar`

En enda återanvändbar SVG-komponent. Källa: `renaida/renaida-avatar.jsx`.

### Props
| Prop | Typ | Default | Beskrivning |
|---|---|---|---|
| `size` | number (px) | `160` | Renderad bredd/höjd. |
| `state` | string | `"idle"` | Uttryck (se tabell nedan). |
| `look` | string | `"center"` | Blickriktning för pupillen. |
| `headColor` | hex | `#2F5D4E` (grön) | Discens fyllnad. Använd ink `#1A1A17` på ljus yta vid behov. |
| `socketColor` | hex | `#FAFAF7` (paper) | Ögonhålans (falsens) fyllnad. |
| `pupilColor` | hex | `#1A1A17` (ink) | Pupill + happy/sleep-kurva. |
| `className` | string | `""` | Extra klasser. |
| `style` | object | `{}` | Inline-stil på `<svg>`. |

### Geometri (viewBox `-12 -12 88 88`)
Allt bygger på den exakta mark-pathen — kopiera oförändrad:
```
disc + fals:  M32 6 a26 26 0 1 0 26 26 h-12 v-14 h-14 z
```
- Disc: radie **26**, centrum **(32, 32)**.
- Fals (ögonhåla): kvadrat **x 32→46 · y 18→32**.
- **Ögonhåla** (rundad rekt): `x=32.5 y=18.5 w=13 h=13 rx=3`, fyllnad `socketColor`.
- **Pupill**: `r=3.9`, fyllnad `pupilColor`, placeras enligt `look` (se nedan).
- **Glimt**: `r=1.1`, fyllnad `socketColor`, offset `(+1.4, −1.4)` från pupillen.
- **Skugga**: ellips `cx=32 cy=60 rx=20 ry=4`, `rgba(26,26,23,0.10)`.
- Happy (öppet leende-öga): `M35 27 q4 -4.5 8.5 0`, stroke `pupilColor` 2.4, rund kapsel.
- Sleep (stängt lock): `M35 24.5 q4 3.5 8.5 0`, samma stroke.

### `look` → pupillposition (SVG-enheter)
Ögonhålans centrum ≈ (39, 25). Pupillen clampas inom hålan:
```
center    (39, 25)     up        (39, 22)     down      (39, 27.5)
left      (36.5, 25)   right     (42, 25)
upleft    (36.5, 22)   upright   (42, 22)      downright (42, 27)
```

### `state` — uttryck
| state | Används när | Rörelse |
|---|---|---|
| `idle` | Viloläge, väntar | Flyt + periodisk blinkning |
| `hello` | Onboarding / första hej | Head-wave-tilt + sparkles + blink |
| `think` | Hämtar/räknar i bakgrunden | Pupill upp-vänster + tre stigande prickar |
| `talk` | Föreslår/förklarar | Head-nod + pulserande ljudbågar |
| `guide` | Pekar mot nästa steg | Pupill riktad (sätt `look`) + blink |
| `happy` | Bekräftar utfört jobb | Hopp + `^`-öga + sparkles |
| `sleep` | Minimerad/offline | Stängt lock + drivande "z z z", långsammare flyt |

---

## Animationer (keyframes)

Ligger i värdsidans `<style>` (kopiera till global CSS eller styled-component).
**Alla loopande animationer är inpackade i `@media (prefers-reduced-motion: no-preference)`**
så print/reduced-motion visar ett stabilt slut-läge.

| Namn | Mål | Duration · easing | Beskrivning |
|---|---|---|---|
| `rn-float` | `.rn` (svg) | 3.6s ease-in-out ∞ | translateY 0 → −3px → 0 |
| `rn-blink` | `.rn-eye` | 4.8s ease-in-out ∞ | scaleY 1 → 0.1 (94%) → 1 (97%) |
| `rn-nod` | `.rn--talk .rn-head` | 0.9s ease-in-out ∞ | rotate −4° ↔ 4° |
| `rn-wave` | `.rn--hello .rn-head` | 0.8s ease-in-out ∞ | rotate −7° ↔ 8°, origin `50% 82%` |
| `rn-hop` | `.rn--happy .rn-head` | 0.72s ease-in-out ∞ | translateY 0 → −5px |
| `rn-dot` | `.rn--think .rn-dots circle` | 1.4s ∞ (stagger .18s) | opacity + translateY |
| `rn-snd` | `.rn--talk .rn-sound path` | 0.9s ∞ (2:a delay .2s) | opacity 0.2 ↔ 0.9 |
| `rn-tw` | sparkles | 1.3s ∞ (b delay .45s) | scale 0.55 ↔ 1 + opacity |
| `rn-z` | `.rn--sleep .rn-z*` | 2.4s ∞ (z2 delay .5s) | drift upp + fade |

Blinkning kräver `transform-box: fill-box; transform-origin: center;` på `.rn-eye`.
Dekor-lager (`.rn-dots/.rn-sound/.rn-spark/.rn-zzz`) har `opacity:0` default och slås
på per `.rn--<state>`.

**Gaze-follow** (delightful touch på stora ytor): mät pekaren relativt avatarens
bounding box, mappa till närmaste `look`-riktning, uppdatera prop. Se `gazeFrom()` i
`Renaida.html`. Använd bara i idle/hello — övriga states styr blicken själva.

---

## Designtokens (från `tokens.css`)
Inga nya färger införs — allt är befintlig Renofine-palett.

| Token | Hex | Roll i avataren |
|---|---|---|
| `--rf-green` | `#2F5D4E` | Standard `headColor`, prickar, ljudbågar, sparkles |
| `--rf-ink` | `#1A1A17` | Pupill; alternativ `headColor` på ljus yta |
| `--rf-paper` | `#FAFAF7` | Ögonhåla + glimt |
| `--rf-gold` | `#A8845C` | (accent i UI runt avataren, ej i marken) |

Typsnitt i showcase-UI: Fraunces (display), Inter Tight (UI), JetBrains Mono (numerik/labels).

---

## Integrationsförslag (Renofine-appen)
1. Lägg `RenaidaAvatar` som TS/React-komponent under `src/components/renaida/`.
   Porta SVG:n oförändrad; flytta keyframes till global stylesheet eller CSS-modul.
2. **Launcher**: docka avataren nere till höger (`pod` 72px cirkel, paper + hairline +
   mjuk skugga) med en talbubbla (ink-bakgrund, paper-text, radius 14, svans nere höger).
   Se `.launcher`-blocket i `Renaida.html`.
3. **Onboarding-flöde**: driv `state`/`look`/copy från ett steg-schema (se `STEPS`-arrayen
   i demon). Koppla `guide`-steget till en pulserande CTA (`rn-pulse`) på den knapp du vill
   att användaren trycker.
4. Respektera `prefers-reduced-motion` (redan inbyggt i keyframe-guarden).

---

## Screens / Views i showcase (`Renaida.html`)
Referenssida — inte del av produkten, men visar avsedd användning:
- **Levande avatar** — stor interaktiv avatar med humör-chips + gaze-follow.
- **Uttryck** — galleri med alla 7 states + användningsfall.
- **I appen** — mock av Renofine (topp-nav Projekt/Inköp/Kunder, tom projekt-lista →
  ifyllt projekt) med Renaida-launcher som lotsar genom onboarding i 4 steg.
- **Så byggs hon** — mark → avatar → palett-konstruktion.

## Filer i paketet
- `Renaida.html` — komplett showcase/prototyp (React + Babel, inline).
- `renaida/renaida-avatar.jsx` — **den återanvändbara avatar-komponenten** (porta denna).
- `tokens.css` — Renofines designtokens (referens).
- `README.md` — detta dokument.

## Assets
Inga externa bild-assets. Avataren är ren SVG härledd ur Skåra-marken. Typsnitt laddas
från Google Fonts i showcase; i appen används de redan installerade familjerna.
