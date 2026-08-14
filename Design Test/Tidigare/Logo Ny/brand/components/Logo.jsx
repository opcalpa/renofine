// Drop-in React Logo component for Renofine.
// Place under src/components/Logo.tsx (or .jsx) and import.
//
// Usage:
//   <Logo />                                 // horizontal lockup, light surface, 32px
//   <Logo variant="stacked" />               // stacked lockup
//   <Logo variant="mark" size={48} />        // just the Rf mark
//   <Logo surface="dark" />                  // for dark backgrounds
//   <Logo variant="wordmark" size={28} />    // text only, no mark
//
// All assets live in /brand/svg/. Adjust BASE if your asset path differs.

const BASE = "/brand/svg";

const VARIANTS = {
  "horizontal-light":  `${BASE}/lockup/horizontal-ink.svg`,
  "horizontal-dark":   `${BASE}/lockup/horizontal-on-dark.svg`,
  "stacked-light":     `${BASE}/lockup/stacked-ink.svg`,
  "stacked-dark":      `${BASE}/lockup/stacked-on-dark.svg`,
  "mark-light":        `${BASE}/mark/rf-mark-ink.svg`,
  "mark-dark":         `${BASE}/mark/rf-mark-paper.svg`,
  "mark-green-light":  `${BASE}/mark/rf-mark-green.svg`,
  "mark-green-dark":   `${BASE}/mark/rf-mark-green.svg`,
  "wordmark-light":    `${BASE}/wordmark/wordmark-ink.svg`,
  "wordmark-dark":     `${BASE}/wordmark/wordmark-paper.svg`,
};

export function Logo({
  variant = "horizontal",   // "horizontal" | "stacked" | "mark" | "mark-green" | "wordmark"
  surface = "light",        // "light" | "dark"
  size = 32,                // height in px (width auto-scales)
  className = "",
  style = {},
  ...rest
}) {
  const key = `${variant}-${surface}`;
  const src = VARIANTS[key] ?? VARIANTS["horizontal-light"];
  return (
    <img
      src={src}
      alt="Renofine"
      className={className}
      style={{ height: size, width: "auto", display: "block", ...style }}
      {...rest}
    />
  );
}

export default Logo;
