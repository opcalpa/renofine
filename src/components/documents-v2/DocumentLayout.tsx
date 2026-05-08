import type { ReactNode } from "react";

interface DocumentLayoutProps {
  /** Title bar text (e.g. "Offert 2026-0142 · Brf Linden 12B") */
  title?: ReactNode;
  /** Right-aligned text in the title bar (e.g. "Utkast · Senast sparad 14:22") */
  meta?: ReactNode;
  /** Main column content — the document itself (parties, lines, totals) */
  main: ReactNode;
  /** Right column content — status, actions, timeline, koppling */
  sidebar?: ReactNode;
  /** When true, the sidebar stacks below main on desktop too (single-column mode) */
  singleColumn?: boolean;
  /** When true, an absolutely-positioned overlay (status stamp) is rendered above main */
  stamp?: ReactNode;
}

/**
 * Two-column document shell used by Quote / Invoice / ÄTA v2 pages.
 * Wraps content in `.rf-paper` so all paper-warm tokens resolve.
 *
 * Desktop: main (1fr) + sidebar (320px). Mobile: stacked.
 */
export function DocumentLayout({
  title,
  meta,
  main,
  sidebar,
  singleColumn = false,
  stamp,
}: DocumentLayoutProps) {
  return (
    <div
      className="rf-paper"
      style={{
        background: "var(--rf-paper)",
        minHeight: "100%",
        color: "var(--rf-ink)",
      }}
    >
      {(title || meta) && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3 sm:px-7"
          style={{
            background: "var(--rf-bg-sunken)",
            borderColor: "var(--rf-hairline)",
          }}
        >
          {title && (
            <span
              className="rf-display"
              style={{ fontSize: 18, fontWeight: 400, color: "var(--rf-ink)" }}
            >
              {title}
            </span>
          )}
          {meta && (
            <span
              className="rf-num"
              style={{
                fontSize: 10,
                color: "var(--rf-fg-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {meta}
            </span>
          )}
        </div>
      )}

      <div
        className={
          singleColumn || !sidebar
            ? "block"
            : "grid lg:grid-cols-[1fr_320px]"
        }
      >
        {/* MAIN — the document itself */}
        <div
          className="relative"
          style={{
            background: "var(--rf-surface)",
            borderRight: sidebar && !singleColumn ? "1px solid var(--rf-hairline)" : undefined,
            padding: "32px 24px",
          }}
        >
          {stamp}
          {main}
        </div>

        {/* SIDEBAR */}
        {sidebar && !singleColumn && (
          <aside
            className="flex flex-col gap-4 px-5 py-6 lg:py-7"
            style={{ background: "var(--rf-paper)" }}
          >
            {sidebar}
          </aside>
        )}
      </div>
    </div>
  );
}
