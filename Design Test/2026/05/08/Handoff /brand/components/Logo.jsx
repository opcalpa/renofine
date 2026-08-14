// Renofine logo — drop-in React component
// Usage:
//   import { Logo, Mark } from "./Logo";
//   <Logo size={32} />              // mark + wordmark, ink on paper
//   <Logo size={32} variant="green"/>
//   <Logo size={32} stacked />
//   <Mark size={24} color="#2F5D4E"/>
//
// Variants: "ink" (default) | "paper" | "green"

import React from "react";

const PATH = "M32 6 a26 26 0 1 0 26 26 h-12 v-14 h-14 z";

const COLORS = {
  ink:   "#1A1A17",
  paper: "#FAFAF7",
  green: "#2F5D4E",
};

export function Mark({ size = 32, color = "currentColor", title = "Renofine", ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      {...rest}
    >
      <title>{title}</title>
      <path d={PATH} fill={color} />
    </svg>
  );
}

export function Wordmark({ size = 32, color = "currentColor", ...rest }) {
  // size = font-size in px
  return (
    <span
      style={{
        fontFamily: '"Fraunces", Georgia, serif',
        fontWeight: 400,
        fontSize: size,
        letterSpacing: "-0.025em",
        color,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
      {...rest}
    >
      Renofine
    </span>
  );
}

export function Logo({
  size = 28,                 // mark height in px
  variant = "ink",           // "ink" | "paper" | "green"
  stacked = false,
  ...rest
}) {
  const fill = COLORS[variant] || variant;
  const wordSize = Math.round(size * 1.15);

  if (stacked) {
    return (
      <span
        style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: size * 0.4 }}
        {...rest}
      >
        <Mark size={size * 1.4} color={fill} />
        <Wordmark size={wordSize} color={fill} />
      </span>
    );
  }

  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", gap: size * 0.4 }}
      {...rest}
    >
      <Mark size={size} color={fill} />
      <Wordmark size={wordSize} color={fill} />
    </span>
  );
}

export default Logo;
