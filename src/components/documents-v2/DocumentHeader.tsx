import type { ReactNode } from "react";

/* ──────── DocumentNumber: top header with doc type/number left, date right ──────── */

interface DocumentNumberProps {
  /** Eyebrow (e.g. "Offert", "Faktura", "ÄTA") */
  type: ReactNode;
  /** Big display number (e.g. "2026-0142") */
  number: ReactNode;
  /** Right-side eyebrow (e.g. "Datum", "Förfaller") */
  rightLabel?: ReactNode;
  /** Right-side primary value */
  rightValue?: ReactNode;
  /** Right-side secondary value (e.g. "Giltig t.o.m. 12 jun") */
  rightHint?: ReactNode;
  /** Optional pill below the number — used for "à konto-faktura 1 av 3 · 30%" etc. */
  badge?: ReactNode;
}

export function DocumentNumber({
  type,
  number,
  rightLabel,
  rightValue,
  rightHint,
  badge,
}: DocumentNumberProps) {
  return (
    <div
      className="mb-6 flex items-end justify-between gap-4 border-b pb-4"
      style={{ borderColor: "var(--rf-hairline)" }}
    >
      <div>
        <div
          className="rf-num mb-1.5"
          style={{
            fontSize: 11,
            color: "var(--rf-fg-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          {type}
        </div>
        <div
          className="rf-display"
          style={{
            fontSize: 32,
            fontWeight: 300,
            letterSpacing: "-0.02em",
            color: "var(--rf-ink)",
            lineHeight: 1,
          }}
        >
          {number}
        </div>
        {badge && <div className="mt-2">{badge}</div>}
      </div>
      {(rightLabel || rightValue) && (
        <div className="text-right">
          {rightLabel && (
            <div
              className="rf-num mb-1.5"
              style={{
                fontSize: 11,
                color: "var(--rf-fg-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              {rightLabel}
            </div>
          )}
          {rightValue && (
            <div
              className="rf-num"
              style={{
                fontSize: 14,
                color: "var(--rf-ink)",
                fontWeight: 500,
              }}
            >
              {rightValue}
            </div>
          )}
          {rightHint && (
            <div
              className="rf-num mt-0.5"
              style={{ fontSize: 11, color: "var(--rf-fg-muted)" }}
            >
              {rightHint}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ──────── DocumentParties: From / To grid ──────── */

export interface PartyInfo {
  name: ReactNode;
  /** Multi-line address. Newlines become <br>. */
  address?: ReactNode;
}

interface DocumentPartiesProps {
  from: PartyInfo;
  to: PartyInfo;
  fromLabel?: ReactNode;
  toLabel?: ReactNode;
}

function PartyBlock({ label, party }: { label: ReactNode; party: PartyInfo }) {
  return (
    <div>
      <div
        className="rf-num mb-1.5"
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--rf-fg-muted)",
        }}
      >
        {label}
      </div>
      <div style={{ fontWeight: 500, fontSize: 14, color: "var(--rf-ink)", marginBottom: 2 }}>
        {party.name}
      </div>
      {party.address && (
        <div style={{ fontSize: 12, color: "var(--rf-fg-muted)", lineHeight: 1.5 }}>
          {party.address}
        </div>
      )}
    </div>
  );
}

export function DocumentParties({
  from,
  to,
  fromLabel = "Från",
  toLabel = "Till",
}: DocumentPartiesProps) {
  return (
    <div className="mb-7 grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8">
      <PartyBlock label={fromLabel} party={from} />
      <PartyBlock label={toLabel} party={to} />
    </div>
  );
}
