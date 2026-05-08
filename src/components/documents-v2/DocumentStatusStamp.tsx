import type { ReactNode } from "react";

export type StampTone = "neutral" | "sent" | "paid" | "rejected" | "draft";

const STAMP_COLOR: Record<StampTone, string> = {
  neutral: "var(--rf-fg-muted)",
  draft: "var(--rf-amber-soft-fg)",
  sent: "var(--rf-green)",
  paid: "var(--rf-green)",
  rejected: "var(--rf-danger)",
};

interface DocumentStatusStampProps {
  /** Stamp text (e.g. "Skickad", "Betald", "Utkast") */
  label: ReactNode;
  tone?: StampTone;
  /** Position relative to the parent (which must be position: relative). Default: top-right */
  position?: "top-right" | "top-left";
}

/**
 * Diagonal status stamp overlay rendered above a document.
 * Place inside DocumentLayout's `stamp` slot — the layout's main column is `position: relative`.
 */
export function DocumentStatusStamp({
  label,
  tone = "sent",
  position = "top-right",
}: DocumentStatusStampProps) {
  const color = STAMP_COLOR[tone];
  return (
    <div
      className="rf-display pointer-events-none absolute"
      style={{
        top: 30,
        ...(position === "top-right" ? { right: 42 } : { left: 42 }),
        border: `2px solid ${color}`,
        color,
        padding: "6px 14px",
        fontSize: 18,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        fontWeight: 400,
        transform: position === "top-right" ? "rotate(-6deg)" : "rotate(6deg)",
        zIndex: 1,
        background: "var(--rf-surface)",
      }}
    >
      {label}
    </div>
  );
}
