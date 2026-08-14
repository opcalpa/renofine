/* global React */
// ─────────────────────────────────────────────────────────────────
// Renofine logo marks — round 2
// New directions after feedback:
//   - Modul (round 1) → too Microsoft, killed
//   - Trappa (round 1) → too Excel-chart, killed
//   - Rf (round 1) → too plain, needs character
// New explorations: more graphic personality, no obvious clichés.
// All hand-drawn SVG, 64×64 viewBox, monochrome (currentColor).
// ─────────────────────────────────────────────────────────────────

// 06 — SKÅRA: Solid disc with a precise notch carved out at upper-right.
// Like a measured rabbet/fals in section. Uncommon shape — won't be
// confused with another tech logo. Very strong at small sizes (16px).
window.MarkSkara = function MarkSkara({ size = 64, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M32 6 a26 26 0 1 0 26 26 h-12 v-14 h-14 z"
        fill={color}
      />
    </svg>
  );
};

// 07 — STAPLAD R: A custom 'R' where the bowl is solid and the leg
// is split into 2 stacked rails. Reads as a proper letterform but with
// a constructed, blueprint-y feel. Designed (not typeset).
window.MarkStaplad = function MarkStaplad({ size = 64, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Outer R bowl */}
      <path
        d="M14 8 h22 a14 14 0 0 1 0 28 h-12 v18 h-10 z M24 16 v12 h12 a6 6 0 0 0 0 -12 z"
        fill={color}
        fillRule="evenodd"
      />
      {/* Stacked leg — two parallel rails */}
      <rect x="36" y="36" width="14" height="4" rx="1" fill={color}/>
      <rect x="40" y="44" width="14" height="4" rx="1" fill={color}/>
      <rect x="44" y="52" width="10" height="4" rx="1" fill={color}/>
    </svg>
  );
};

// 08 — VINKEL: Open right-angle / corner mark with a small dot anchor.
// Refers to drawing a plan (set square) and 'cornerstone' simultaneously.
// Clean, calm, geometric — but not a rectangle.
window.MarkVinkel = function MarkVinkel({ size = 64, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* L-shape (corner) */}
      <path
        d="M14 14 v36 h36 v-8 h-28 v-28 z"
        fill={color}
      />
      {/* Anchor dot at the outside corner — the cornerstone */}
      <circle cx="50" cy="14" r="5" fill={color}/>
    </svg>
  );
};

// 09 — TRÅD: A single continuous stroke that forms an 'R'-ish shape.
// Rounded, friendly, hand-drawn-feeling without being sloppy. Suggests
// flow, continuity — start to finish in one move.
window.MarkTrad = function MarkTrad({ size = 64, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M16 56 V14 c0 -3 2 -5 5 -5 h16 a13 13 0 0 1 0 26 H30 l18 21"
        stroke={color}
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
};

// 10 — LIGATUR: Custom 'Rf' ligature where the f's crossbar extends
// from the R's bowl. One drawn glyph, not two letters. Gives the
// monogram the graphic character it's missing.
window.MarkLigatur = function MarkLigatur({ size = 64, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* R: vertical spine + bowl */}
      <path
        d="M10 8 v48 h7 V36 h7 l10 20 h8 L31 35 a14 14 0 0 0 -7 -27 H10 z M17 14 h7 a8 8 0 0 1 0 16 H17 z"
        fill={color}
        fillRule="evenodd"
      />
      {/* f: the f's stem starts mid-height, hooked top, and its
          crossbar extends from the R's bowl junction outward */}
      <path
        d="M44 22 v34 h6 V28 h6 v-6 h-6 v-2 a4 4 0 0 1 4 -4 h2 V10 h-3 a8 8 0 0 0 -9 8 v4 z"
        fill={color}
      />
      {/* Connecting crossbar — the ligature move: R's leg-junction
          extends as f's crossbar */}
      <rect x="31" y="22" width="25" height="4" fill={color}/>
    </svg>
  );
};

// ─────────────────────────────────────────────────────────────────
// Wordmark + Lockup (re-exported, identical to round 1)
// ─────────────────────────────────────────────────────────────────
window.Wordmark = function Wordmark({
  text = "Renofine",
  font = "fraunces",
  weight = 500,
  size = 28,
  color = "currentColor",
  letterSpacing,
  italic = false,
}) {
  const families = {
    fraunces: "'Fraunces', Georgia, serif",
    inter: "'Inter Tight', Inter, system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
  };
  const ls = letterSpacing ?? (font === "mono" ? "-0.02em" : font === "inter" ? "-0.025em" : "-0.035em");
  return (
    <span style={{
      fontFamily: families[font],
      fontWeight: weight,
      fontSize: size,
      letterSpacing: ls,
      color,
      lineHeight: 1,
      fontStyle: italic ? "italic" : "normal",
      whiteSpace: "nowrap",
    }}>{text}</span>
  );
};

window.Lockup = function Lockup({
  Mark,
  text = "Renofine",
  font = "fraunces",
  weight = 500,
  markSize = 32,
  textSize = 24,
  gap = 10,
  color = "currentColor",
  stacked = false,
  italic = false,
}) {
  return (
    <div style={{
      display: "inline-flex",
      flexDirection: stacked ? "column" : "row",
      alignItems: "center",
      gap,
    }}>
      {Mark && <Mark size={markSize} color={color}/>}
      <Wordmark text={text} font={font} weight={weight} size={textSize} color={color} italic={italic}/>
    </div>
  );
};
