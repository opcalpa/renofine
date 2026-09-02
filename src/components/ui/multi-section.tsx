import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A panel whose SHELL stays put while its contents flip between tabs.
 *
 * Built for the import review (Design handoff `design_handoff_import_v2`,
 * 2026-09-01) but deliberately generic: the same pattern fits anywhere a
 * screen would otherwise stack several unrelated lists into one long column
 * that nobody can scan.
 *
 * Fixed: the header (title + hint + optional right slot) and the tab row.
 * Flips per tab: the toolbar, the list, and the footer.
 *
 * TWO RULES THIS COMPONENT ENFORCES, because breaking either is how a tabbed
 * layout starts hiding decisions from people:
 *
 *   1. Every tab shows its COUNT, and a dot when something in it needs
 *      attention. A tab you cannot see into is a tab you forget to open.
 *   2. Only the list scrolls. The shell owns the height, so the tab row and
 *      the footer's running tally stay visible through a hundred rows.
 *
 * The caller keeps per-tab state (selection, scroll, checkboxes) — this
 * component never resets it, so switching tabs and coming back is free.
 */

export interface MultiSectionTab {
  id: string;
  label: string;
  /** Rows in this tab. Always rendered — see rule 1. */
  count: number;
  /** How many of them need a decision; > 0 shows the dot. */
  alert?: number;
}

interface MultiSectionProps {
  title: string;
  hint?: string;
  tabs: MultiSectionTab[];
  active: string;
  onTab: (id: string) => void;
  /** Flips with the tab: filters, search, bulk actions. */
  toolbar?: ReactNode;
  /** Flips with the tab: the running tally for what this tab holds. */
  footer?: ReactNode;
  /** Fixed: sits opposite the title (status lines, a summary). */
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function MultiSection({
  title,
  hint,
  tabs,
  active,
  onTab,
  toolbar,
  footer,
  headerRight,
  children,
  className,
}: MultiSectionProps) {
  return (
    <section
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card',
        className
      )}
    >
      <div className="shrink-0 px-4 pt-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-normal tracking-tight">{title}</h2>
            {hint && (
              <p className="mt-1 max-w-[52ch] text-xs text-muted-foreground">{hint}</p>
            )}
          </div>
          {headerRight}
        </div>
        <div role="tablist" className="mt-3 flex gap-0.5 border-b">
          {tabs.map((tab) => {
            const on = tab.id === active;
            return (
              <button
                key={tab.id}
                role="tab"
                type="button"
                aria-selected={on}
                onClick={() => onTab(tab.id)}
                className={cn(
                  '-mb-px flex items-center gap-1.5 border-b-2 px-3 pb-2 pt-2 text-sm transition-colors',
                  on
                    ? 'border-primary font-semibold text-foreground'
                    : 'border-transparent font-medium text-muted-foreground hover:text-foreground'
                )}
              >
                <span className="truncate">{tab.label}</span>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-px font-mono text-[11px] tabular-nums',
                    on ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  )}
                >
                  {tab.count}
                </span>
                {(tab.alert ?? 0) > 0 && (
                  <span
                    aria-hidden
                    title={`${tab.alert} behöver din blick`}
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {toolbar && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-muted/40 px-3.5 py-2">
          {toolbar}
        </div>
      )}

      {/* The only scrolling region — see rule 2. */}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

      {footer && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-muted/40 px-3.5 py-2 text-xs text-muted-foreground">
          {footer}
        </div>
      )}
    </section>
  );
}
