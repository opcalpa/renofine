import type { ReactNode } from "react";

export interface DocumentLineItem {
  id?: string;
  /** Section title — render as a section header row instead of a normal row */
  sectionHeader?: ReactNode;
  /** Description (line 1) */
  description?: ReactNode;
  /** Description hint / supplier / sub-text */
  comment?: ReactNode;
  /** "8 tim", "1 st", "3,2 m" */
  quantity?: ReactNode;
  /** "685 kr" */
  unitPrice?: ReactNode;
  /** "5 480 kr" */
  total?: ReactNode;
  /** Marks the line as ROT-eligible — appends "(ROT)" suffix */
  rot?: boolean;
  /** Optional pill rendered after description (e.g. AI-source) */
  pill?: ReactNode;
  /** When true, render as a deduction row (e.g. ROT-avdrag) — total in green */
  deduction?: boolean;
}

interface DocumentLinesProps {
  items: DocumentLineItem[];
  /** Override the default Swedish column labels */
  labels?: {
    description?: ReactNode;
    quantity?: ReactNode;
    unitPrice?: ReactNode;
    total?: ReactNode;
  };
}

const DEFAULT_LABELS = {
  description: "Beskrivning",
  quantity: "Antal",
  unitPrice: "à-pris",
  total: "Summa",
};

const ROW_GRID = "1fr 70px 90px 100px";
const ROW_PAD = "14px 24px";

export function DocumentLines({ items, labels }: DocumentLinesProps) {
  const L = { ...DEFAULT_LABELS, ...labels };

  return (
    <div style={{ margin: "0 -24px" }}>
      {/* Header row */}
      <div
        className="rf-num"
        style={{
          display: "grid",
          gridTemplateColumns: ROW_GRID,
          gap: 16,
          padding: "9px 24px",
          background: "var(--rf-bg-sunken)",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--rf-fg-muted)",
          fontWeight: 500,
          borderBottom: "1px solid var(--rf-hairline)",
        }}
      >
        <div>{L.description}</div>
        <div style={{ textAlign: "right" }}>{L.quantity}</div>
        <div style={{ textAlign: "right" }}>{L.unitPrice}</div>
        <div style={{ textAlign: "right" }}>{L.total}</div>
      </div>

      {items.map((item, i) => {
        if (item.sectionHeader) {
          return (
            <div
              key={item.id ?? `sh-${i}`}
              className="rf-display"
              style={{
                padding: "18px 24px 6px",
                fontWeight: 400,
                fontSize: 15,
                color: "var(--rf-green)",
              }}
            >
              {item.sectionHeader}
            </div>
          );
        }

        return (
          <div
            key={item.id ?? `row-${i}`}
            style={{
              display: "grid",
              gridTemplateColumns: ROW_GRID,
              gap: 16,
              padding: ROW_PAD,
              borderBottom: "1px solid var(--rf-hairline)",
              alignItems: "flex-start",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  color: item.deduction ? "var(--rf-fg-muted)" : "var(--rf-ink)",
                  marginBottom: item.comment ? 3 : 0,
                  lineHeight: 1.4,
                }}
              >
                {item.description}
                {item.rot && (
                  <span style={{ fontSize: 11, color: "var(--rf-fg-muted)", marginLeft: 6 }}>
                    (ROT)
                  </span>
                )}
                {item.pill && <span style={{ marginLeft: 8 }}>{item.pill}</span>}
              </div>
              {item.comment && (
                <div style={{ fontSize: 11, color: "var(--rf-fg-muted)", lineHeight: 1.4 }}>
                  {item.comment}
                </div>
              )}
            </div>
            <div
              className="rf-num"
              style={{
                fontSize: 13,
                textAlign: "right",
                color: item.deduction ? "var(--rf-fg-muted)" : "var(--rf-ink)",
              }}
            >
              {item.quantity}
            </div>
            <div
              className="rf-num"
              style={{
                fontSize: 13,
                textAlign: "right",
                color: item.deduction ? "var(--rf-fg-muted)" : "var(--rf-ink)",
              }}
            >
              {item.unitPrice}
            </div>
            <div
              className="rf-num"
              style={{
                fontSize: 13,
                textAlign: "right",
                fontWeight: 500,
                color: item.deduction ? "var(--rf-green)" : "var(--rf-ink)",
              }}
            >
              {item.total}
            </div>
          </div>
        );
      })}
    </div>
  );
}
