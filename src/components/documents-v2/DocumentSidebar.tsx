import type { ReactNode } from "react";

/* ──────── shared sidebar primitives ──────── */

interface SidebarCardProps {
  label?: ReactNode;
  children: ReactNode;
}

export function SidebarCard({ label, children }: SidebarCardProps) {
  return (
    <div
      className="rounded-md border p-3.5"
      style={{
        background: "var(--rf-surface)",
        borderColor: "var(--rf-hairline)",
      }}
    >
      {label && (
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
      )}
      {children}
    </div>
  );
}

/* ──────── status pill ──────── */

export type StatusTone = "draft" | "sent" | "accepted" | "rejected" | "paid" | "overdue" | "neutral";

const STATUS_PILL_STYLE: Record<StatusTone, { bg: string; fg: string; dot: string }> = {
  draft: { bg: "var(--rf-amber-soft)", fg: "var(--rf-amber-soft-fg)", dot: "#A8845C" },
  sent: { bg: "var(--rf-green-soft)", fg: "var(--rf-green-soft-fg)", dot: "var(--rf-green)" },
  accepted: { bg: "var(--rf-green-soft)", fg: "var(--rf-green-soft-fg)", dot: "var(--rf-green)" },
  paid: { bg: "var(--rf-green-soft)", fg: "var(--rf-green-soft-fg)", dot: "var(--rf-green)" },
  rejected: { bg: "var(--rf-warn-soft)", fg: "var(--rf-warn-soft-fg)", dot: "var(--rf-danger)" },
  overdue: { bg: "var(--rf-warn-soft)", fg: "var(--rf-warn-soft-fg)", dot: "var(--rf-danger)" },
  neutral: { bg: "var(--rf-bg-sunken)", fg: "var(--rf-fg-muted)", dot: "var(--rf-fg-muted)" },
};

interface StatusPillProps {
  tone?: StatusTone;
  label: ReactNode;
}

export function StatusPill({ tone = "neutral", label }: StatusPillProps) {
  const s = STATUS_PILL_STYLE[tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium"
      style={{ background: s.bg, color: s.fg }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: s.dot }} />
      {label}
    </span>
  );
}

/* ──────── timeline ──────── */

export interface TimelineItem {
  what: ReactNode;
  when: ReactNode;
  /** When true, the dot is muted and text is subtle — used for future/pending events */
  pending?: boolean;
}

export function SidebarTimeline({ items }: { items: TimelineItem[] }) {
  return (
    <div className="mt-2 flex flex-col gap-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2 text-xs">
          <span
            className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full"
            style={{
              background: item.pending ? "var(--rf-hairline)" : "var(--rf-green)",
            }}
          />
          <div style={{ color: item.pending ? "var(--rf-fg-subtle)" : "var(--rf-ink)" }}>
            <div style={{ fontSize: 12, lineHeight: 1.4 }}>{item.what}</div>
            <div
              className="rf-num"
              style={{
                fontSize: 10,
                color: "var(--rf-fg-subtle)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginTop: 1,
              }}
            >
              {item.when}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ──────── action buttons ──────── */

export interface SidebarAction {
  label: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "outline" | "ghost" | "destructive";
  icon?: ReactNode;
  disabled?: boolean;
  href?: string;
}

const ACTION_STYLE: Record<NonNullable<SidebarAction["variant"]>, React.CSSProperties> = {
  primary: {
    background: "var(--rf-ink)",
    color: "var(--rf-paper)",
    border: "1px solid var(--rf-ink)",
  },
  outline: {
    background: "var(--rf-surface)",
    color: "var(--rf-ink)",
    border: "1px solid var(--rf-hairline)",
  },
  ghost: {
    background: "transparent",
    color: "var(--rf-ink)",
    border: "1px solid transparent",
  },
  destructive: {
    background: "transparent",
    color: "var(--rf-danger)",
    border: "1px solid var(--rf-hairline)",
  },
};

export function SidebarActions({ actions }: { actions: SidebarAction[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {actions.map((a, i) => {
        const style = {
          ...ACTION_STYLE[a.variant ?? "outline"],
          padding: "8px 12px",
          fontSize: 13,
          borderRadius: 6,
          fontWeight: 500,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          opacity: a.disabled ? 0.5 : 1,
          cursor: a.disabled ? "not-allowed" : "pointer",
          textDecoration: "none",
        } as React.CSSProperties;

        if (a.href) {
          return (
            <a key={i} href={a.href} style={style}>
              {a.icon}
              {a.label}
            </a>
          );
        }
        return (
          <button key={i} type="button" onClick={a.onClick} disabled={a.disabled} style={style}>
            {a.icon}
            {a.label}
          </button>
        );
      })}
    </div>
  );
}

/* ──────── linked project block ──────── */

interface SidebarLinkBlockProps {
  /** Eyebrow label (e.g. "Koppling") */
  label?: ReactNode;
  /** Primary line (e.g. project name) */
  title: ReactNode;
  /** Secondary line (e.g. room / address) */
  subtitle?: ReactNode;
  /** Optional CTA at the bottom */
  cta?: { label: ReactNode; href?: string; onClick?: () => void };
}

export function SidebarLinkBlock({ label, title, subtitle, cta }: SidebarLinkBlockProps) {
  return (
    <SidebarCard label={label}>
      <div style={{ fontSize: 13, color: "var(--rf-ink)", marginTop: 2 }}>{title}</div>
      {subtitle && (
        <div style={{ fontSize: 11, color: "var(--rf-fg-muted)", marginTop: 2 }}>{subtitle}</div>
      )}
      {cta &&
        (cta.href ? (
          <a
            href={cta.href}
            className="mt-2 inline-block"
            style={{ fontSize: 12, color: "var(--rf-green)", textDecoration: "none" }}
          >
            → {cta.label}
          </a>
        ) : (
          <button
            type="button"
            onClick={cta.onClick}
            className="mt-2 inline-block bg-transparent p-0"
            style={{ fontSize: 12, color: "var(--rf-green)", border: "none", cursor: "pointer" }}
          >
            → {cta.label}
          </button>
        ))}
    </SidebarCard>
  );
}
