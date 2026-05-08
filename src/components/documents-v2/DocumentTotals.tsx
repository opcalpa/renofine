import type { ReactNode } from "react";

export interface TotalsRow {
  label: ReactNode;
  value: ReactNode;
  /** When true, this row gets larger display type and a top divider — used for sub-totals */
  emphasize?: boolean;
}

interface DocumentTotalsProps {
  /** Regular sub-rows (Arbete, Material, Moms 25%) */
  rows: TotalsRow[];
  /** The big "Totalt" or "Att betala" row — display style */
  grand?: TotalsRow;
  /** Optional ROT highlight block — rendered between rows and grand */
  rot?: {
    label: ReactNode;
    /** Sub-text under label (e.g. "Att betala efter avdrag") */
    sublabel?: ReactNode;
    /** The deduction value (typically negative, e.g. "−16 100 kr") */
    value: ReactNode;
  };
  /** Optional row rendered AFTER the rot block — used for "Att betala" with green emphasis */
  afterRotGrand?: TotalsRow;
}

export function DocumentTotals({ rows, grand, rot, afterRotGrand }: DocumentTotalsProps) {
  return (
    <div style={{ padding: "24px 0 0" }}>
      {rows.map((r, i) => (
        <div
          key={i}
          className="flex justify-between"
          style={{
            padding: "6px 0",
            fontSize: 13,
            color: "var(--rf-fg-muted)",
          }}
        >
          <span>{r.label}</span>
          <span className="rf-num" style={{ color: "var(--rf-ink)" }}>
            {r.value}
          </span>
        </div>
      ))}

      {grand && (
        <div
          className="rf-display flex justify-between"
          style={{
            fontSize: 18,
            fontWeight: 500,
            color: "var(--rf-ink)",
            paddingTop: 14,
            marginTop: 8,
            borderTop: "1px solid var(--rf-hairline)",
          }}
        >
          <span>{grand.label}</span>
          <span className="rf-num" style={{ color: "var(--rf-ink)" }}>
            {grand.value}
          </span>
        </div>
      )}

      {rot && (
        <div
          className="mt-4 flex items-center justify-between rounded-md"
          style={{
            padding: "14px 16px",
            background: "var(--rf-green-soft)",
          }}
        >
          <div>
            <div
              className="rf-num"
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--rf-green)",
                fontWeight: 500,
              }}
            >
              {rot.label}
            </div>
            {rot.sublabel && (
              <div style={{ fontSize: 12, color: "var(--rf-green)", marginTop: 2 }}>
                {rot.sublabel}
              </div>
            )}
          </div>
          <div
            className="rf-display rf-num"
            style={{
              fontSize: 22,
              fontWeight: 400,
              color: "var(--rf-green)",
            }}
          >
            {rot.value}
          </div>
        </div>
      )}

      {afterRotGrand && (
        <div
          className="rf-display flex justify-between"
          style={{
            fontSize: 18,
            fontWeight: 500,
            color: "var(--rf-green)",
            paddingTop: 0,
            marginTop: 8,
            borderTop: "none",
          }}
        >
          <span>{afterRotGrand.label}</span>
          <span className="rf-num" style={{ color: "var(--rf-green)" }}>
            {afterRotGrand.value}
          </span>
        </div>
      )}
    </div>
  );
}
