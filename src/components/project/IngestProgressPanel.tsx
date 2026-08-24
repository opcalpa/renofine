import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import type { IngestProgress } from '@/services/ingestProjectFolder';

/**
 * What the folder reader is doing, while it does it.
 *
 * A 100-file drop spends minutes across three phases, and two of them used to
 * report nothing at all — so the app sat silent and then produced a summary
 * out of nowhere. Every phase reports here, including the upload into Files
 * that runs after the reading is done.
 */

const PHASE_KEY: Record<IngestProgress['phase'], { key: string; fallback: string }> = {
  classify: { key: 'renaidaFlow.folder.phase.classify', fallback: 'Sorterar bilderna…' },
  read: { key: 'renaidaFlow.folder.phase.read', fallback: 'Läser fil {{done}} av {{total}}…' },
  archive: { key: 'renaidaFlow.folder.phase.archive', fallback: 'Sparar fil {{done}} av {{total}} i Filer…' },
};

interface IngestProgressPanelProps {
  progress: IngestProgress;
  /** Compact bar for the birth dialog; the project page uses the full pill. */
  variant?: 'inline' | 'floating';
}

export function IngestProgressPanel({ progress, variant = 'inline' }: IngestProgressPanelProps) {
  const { t } = useTranslation();
  const { phase, done, total, fileName } = progress;

  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const label = t(PHASE_KEY[phase].key, PHASE_KEY[phase].fallback, { done, total });
  // Long jobs deserve a warning up front rather than a frozen-looking screen.
  const slow = total >= 25;

  const bar = (
    <div className="h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
    </div>
  );

  if (variant === 'inline') {
    return (
      <div className="space-y-1">
        {bar}
        <p className="text-[11px] text-muted-foreground">
          {label}
          {fileName ? ` · ${fileName}` : ''}
        </p>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4 print:hidden">
      <div className="w-full max-w-md space-y-2 rounded-xl border bg-card px-4 py-3 shadow-lg">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
          <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
          <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
        </div>
        {bar}
        {fileName && (
          <p className="truncate text-[11px] text-muted-foreground" title={fileName}>
            {fileName}
          </p>
        )}
        {slow && (
          <p className="text-[11px] text-muted-foreground">
            {t('renaidaFlow.folder.slowHint', 'Med {{total}} filer tar det någon minut — du kan lämna sidan öppen.', { total })}
          </p>
        )}
      </div>
    </div>
  );
}
