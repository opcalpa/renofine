/* global React */
// ─────────────────────────────────────────────────────────────────
// Renofine logo marks — five directions
// All hand-drawn SVG, designed at 64×64 viewBox, monochrome,
// with currentColor so they inherit ink color.
// Strokes use round caps; geometry is precise (snap to grid).
// ─────────────────────────────────────────────────────────────────

// 01 — MODUL: 2×2 grid with one cell offset, suggesting modular
// construction / a floor plan from above. Ordered but not rigid.
window.MarkModul = function MarkModul({ size = 64, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="8" width="22" height="22" rx="2" fill={color}/>
      <rect x="34" y="8" width="22" height="22" rx="2" fill={color} opacity="0.45"/>
      <rect x="8" y="34" width="22" height="22" rx="2" fill={color} opacity="0.45"/>
      <rect x="34" y="34" width="22" height="22" rx="2" fill={color}/>
    </svg>
  );
};

// 02 — FALS: An R built from rectilinear strokes, where the leg is
// stepped (suggesting a measured offset / construction tolerance).
// Custom-drawn — no font, so it reads as a designed mark.
window.MarkFals = function MarkFals({ size = 64, color = "currentColor" }) {
  const s = 6; // stroke
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* vertical spine */}
      <rect x="14" y="10" width={s} height="44" fill={color}/>
      {/* top bar */}
      <rect x="14" y="10" width="28" height={s} fill={color}/>
      {/* right side of bowl */}
      <rect x="36" y="10" width={s} height="20" fill={color}/>
      {/* bowl bottom */}
      <rect x="14" y="28" width="28" height={s} fill={color}/>
      {/* leg — offset to suggest a rabbet/fals (stepped) */}
      <rect x="26" y="34" width={s} height="8" fill={color}/>
      <rect x="26" y="36" width="14" height={s} fill={color}/>
      <rect x="34" y="42" width={s} height="12" fill={color}/>
    </svg>
  );
};

// 03 — TRAPPA: A staircase / progression mark. Three rising steps
// suggesting phases (offert → bygg → besiktning) without being literal.
window.MarkTrappa = function MarkTrappa({ size = 64, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Step 1 — short */}
      <rect x="8" y="40" width="14" height="14" rx="1.5" fill={color} opacity="0.4"/>
      {/* Step 2 — medium */}
      <rect x="25" y="28" width="14" height="26" rx="1.5" fill={color} opacity="0.7"/>
      {/* Step 3 — tall */}
      <rect x="42" y="14" width="14" height="40" rx="1.5" fill={color}/>
    </svg>
  );
};

// 04 — RING: A status/progress ring with a notched arc — suggests
// progression/completion. Could be ROT-saldo, project progress, etc.
// Three-quarter arc with a tick at the end.
window.MarkRing = function MarkRing({ size = 64, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background ring (faint) */}
      <circle cx="32" cy="32" r="22" stroke={color} strokeWidth="6" opacity="0.18" fill="none"/>
      {/* Foreground arc — ~73% */}
      <path d="M 32 10 A 22 22 0 1 1 14.6 42.5" stroke={color} strokeWidth="6" strokeLinecap="round" fill="none"/>
      {/* Center dot */}
      <circle cx="32" cy="32" r="3.5" fill={color}/>
    </svg>
  );
};

// 05 — Rf monogram. Two render modes:
//  - default:   solid rounded square in `color`, Rf cut through (counter-color)
//  - onSurface: just Rf glyph in `color`, no background plate
// `bg` overrides the counter color when given (e.g. for inverse on dark ink).
window.MarkRf = function MarkRf({ size = 64, color = "currentColor", bg, onSurface = false }) {
  // Counter color: explicit bg if provided, else paper.
  const counter = bg || "#FAFAF7";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {!onSurface && (
        <rect x="2" y="2" width="60" height="60" rx="10" fill={color}/>
      )}
      <text x="32" y="45" textAnchor="middle"
            fontFamily="'Fraunces', Georgia, serif"
            fontSize="38" fontWeight="500"
            letterSpacing="-0.04em"
            fill={onSurface ? color : counter}>Rf</text>
    </svg>
  );
};

// ─────────────────────────────────────────────────────────────────
// Wordmark — paired with each mark in different typographic styles.
// We pass `font` and `case` as variants so we can show many at once.
// ─────────────────────────────────────────────────────────────────
window.Wordmark = function Wordmark({
  text = "Renofine",
  font = "fraunces",   // fraunces | inter | mono | custom
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
    custom: "'Fraunces', Georgia, serif", // we'll override with SVG path versions later
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

// ─────────────────────────────────────────────────────────────────
// Lockup — mark + wordmark side by side or stacked.
// ─────────────────────────────────────────────────────────────────
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
