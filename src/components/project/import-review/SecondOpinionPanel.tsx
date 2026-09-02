import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, FileSpreadsheet, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  matchCsvRows,
  parseCsv,
  rowsFromCsv,
  type CsvColumn,
  type CsvMatch,
  type FieldDiff,
  type MatchTarget,
  type ParsedCsv,
} from '@/lib/secondOpinionCsv';

/**
 * Bring in a table another model produced from the same receipts, and show
 * where the two readings disagree.
 *
 * Nothing here writes. It produces a picture: how many rows the two agree on,
 * which fields they differ on, and which rows only one of them saw. The
 * person applies a difference one field at a time, and OUR value is what
 * stands until they do.
 */

const COLUMNS: CsvColumn[] = ['vendor', 'docNumber', 'date', 'total', 'vat', 'ignore'];

interface SecondOpinionPanelProps {
  targets: MatchTarget[];
  /** Adopt one value from the file onto one of our purchases. */
  onAdopt: (targetId: string, diff: FieldDiff) => void;
  /** Row the file has and we do not — create it as a purchase to fill in. */
  onLift: (row: CsvMatch['row']) => void;
  onClose: () => void;
}

export function SecondOpinionPanel({ targets, onAdopt, onLift, onClose }: SecondOpinionPanelProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<CsvColumn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());

  const matches = useMemo(
    () => (parsed ? matchCsvRows(rowsFromCsv(parsed, mapping), targets) : []),
    [parsed, mapping, targets]
  );

  const agreed = matches.filter((m) => m.targetId && m.diffs.length === 0).length;
  const differing = matches.filter((m) => m.targetId && m.diffs.length > 0);
  const onlyInFile = matches.filter((m) => !m.targetId);

  const handleFile = async (file: File) => {
    setError(null);
    const text = await file.text();
    const p = parseCsv(text);
    if (!p) {
      setError(t('secondOpinion.unreadable', 'Filen gick inte att läsa som en tabell.'));
      return;
    }
    setParsed(p);
    setMapping(p.guess);
  };

  return (
    <section className="rounded-xl border bg-card">
      <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-display text-base font-normal tracking-tight">
            <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted-foreground" />
            {t('secondOpinion.title', 'Jämför med en annan tolkning')}
          </h3>
          <p className="mt-1 max-w-[70ch] text-xs text-muted-foreground">
            {t(
              'secondOpinion.lead',
              'Har du kört samma kvitton genom ChatGPT eller Gemini och fått ut en tabell? Släpp in den här. Där båda läsningarna säger samma sak är chansen stor att de har rätt — där de skiljer sig vet du vilken rad du ska öppna. Ingenting ändras utan att du väljer det.'
            )}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </header>

      {!parsed ? (
        <div className="space-y-3 p-4">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            <Upload className="mr-2 h-3.5 w-3.5" />
            {t('secondOpinion.pick', 'Välj CSV-fil')}
          </Button>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none">
              {t('secondOpinion.howTo', 'Så får du fram tabellen')}
            </summary>
            <p className="mt-2 max-w-[70ch] whitespace-pre-line">
              {t(
                'secondOpinion.howToBody',
                'Ladda upp samma kvittobilder i ChatGPT eller Gemini och be om:\n\n"Läs varje kvitto och ge mig en CSV med kolumnerna leverantör, kvitto-/fakturanummer, datum (ÅÅÅÅ-MM-DD), totalbelopp, moms. En rad per kvitto. Skriv null där något inte går att läsa — gissa aldrig."\n\nSpara svaret som .csv och släpp in det här.'
              )}
            </p>
          </details>
        </div>
      ) : (
        <div className="space-y-4 p-4">
          {/* Column mapping — remembered nowhere on purpose: a file from a
              different chat can have a different shape, and a wrong remembered
              mapping is harder to spot than one you set. */}
          <div className="flex flex-wrap gap-2">
            {parsed.headers.map((h, i) => (
              <label key={i} className="flex items-center gap-1.5 text-xs">
                <span className="max-w-[14ch] truncate text-muted-foreground" title={h}>
                  {h || `#${i + 1}`}
                </span>
                <Select
                  value={mapping[i] ?? 'ignore'}
                  onValueChange={(v) =>
                    setMapping((m) => m.map((c, j) => (j === i ? (v as CsvColumn) : c)))
                  }
                >
                  <SelectTrigger className="h-7 w-[120px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLUMNS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {t(`secondOpinion.col.${c}`, c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            ))}
          </div>

          <div className="flex flex-wrap gap-4 rounded-lg bg-muted/40 px-3 py-2 text-xs">
            <span className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-emerald-600" />
              {t('secondOpinion.agreed', '{{count}} rader stämmer överens', { count: agreed })}
            </span>
            <span>{t('secondOpinion.differing', '{{count}} skiljer sig', { count: differing.length })}</span>
            <span>
              {t('secondOpinion.onlyInFile', '{{count}} finns bara i filen', {
                count: onlyInFile.length,
              })}
            </span>
          </div>

          {differing.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('secondOpinion.differences', 'Där läsningarna skiljer sig')}
              </h4>
              {differing.map((m) => (
                <div key={m.row.line} className="rounded-lg border p-2">
                  <p className="text-xs font-medium">
                    {m.row.vendor ?? '—'}{' '}
                    <span className="font-normal text-muted-foreground">
                      · {t(`secondOpinion.via.${m.via}`, m.via ?? '')}
                    </span>
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {m.diffs.map((d) => {
                      const key = `${m.targetId}:${d.field}`;
                      return (
                        <li key={d.field} className="flex flex-wrap items-center gap-2 text-[11px]">
                          <span className="w-[7ch] shrink-0 text-muted-foreground">
                            {t(`secondOpinion.col.${d.field}`, d.field)}
                          </span>
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono">
                            {t('secondOpinion.ours', 'Vi')}: {String(d.ours ?? '—')}
                          </span>
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono">
                            {t('secondOpinion.theirs', 'Filen')}: {String(d.theirs ?? '—')}
                          </span>
                          <Button
                            size="sm"
                            variant={applied.has(key) ? 'ghost' : 'outline'}
                            disabled={applied.has(key)}
                            className="h-6 px-2 text-[11px]"
                            onClick={() => {
                              onAdopt(m.targetId!, d);
                              setApplied((a) => new Set(a).add(key));
                            }}
                          >
                            {applied.has(key)
                              ? t('secondOpinion.took', 'Tagen')
                              : t('secondOpinion.take', 'Använd filens')}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {onlyInFile.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('secondOpinion.missing', 'Finns bara i filen')}
              </h4>
              <p className="text-[11px] text-muted-foreground">
                {t(
                  'secondOpinion.missingHint',
                  'Antingen missade vi ett kvitto — eller så hittade den andra modellen på en rad. Lägg bara till det du känner igen.'
                )}
              </p>
              {onlyInFile.map((m) => (
                <div
                  key={m.row.line}
                  className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {m.row.vendor ?? '—'}{' '}
                    <span className="font-mono text-muted-foreground">
                      {m.row.total != null ? `${m.row.total} kr` : ''} {m.row.date ?? ''}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className={cn('h-6 px-2 text-[11px]')}
                    onClick={() => onLift(m.row)}
                  >
                    {t('secondOpinion.add', 'Lägg till som inköp')}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
