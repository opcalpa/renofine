import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Copy, Home, Pencil, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { ImportSession } from '@/services/agent/importSession';
import type { PurchaseFilter, PurchaseRow } from './purchaseRowModel';

export const NO_ROOM = '__none__';

const kr = (n: number, locale: string) =>
  `${n.toLocaleString(locale, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} kr`;

function fmtDate(d: string | null, locale: string): string {
  if (!d) return '';
  const date = new Date(`${d}T12:00:00`);
  if (Number.isNaN(date.getTime())) return d;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** A small coloured chip that names why a row needs a second look. */
function Flag({
  tone,
  icon: Icon,
  children,
}: {
  tone: 'warn' | 'dup';
  icon: typeof AlertTriangle;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
        tone === 'warn'
          ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
          : 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200'
      )}
    >
      <Icon className="h-3 w-3" />
      {children}
    </span>
  );
}

export interface PurchaseEdits {
  vendorName: string;
  total: string;
  documentDate: string;
  invoiceNumber: string;
}

interface PurchaseListProps {
  rows: PurchaseRow[];
  session: ImportSession;
  selectedId: string | null;
  linkedIds: Set<string>;
  editingId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string, keep: boolean) => void;
  onRoom: (id: string, value: string) => void;
  onEdit: (id: string | null) => void;
  onSaveEdit: (id: string, edits: PurchaseEdits) => void;
}

/**
 * The purchases, grouped so the rows that need a decision come first.
 *
 * With fifty receipts the difference between a scannable list and an
 * unreadable one is entirely this grouping: five rows with a warning, then
 * forty-five that look fine (Design handoff v2, 2026-09-01).
 */
export function PurchaseList({
  rows,
  session,
  selectedId,
  linkedIds,
  editingId,
  onSelect,
  onToggle,
  onRoom,
  onEdit,
  onSaveEdit,
}: PurchaseListProps) {
  const { t } = useTranslation();

  const groups = useMemo(() => {
    const look = rows.filter((r) => r.needsLook);
    const fine = rows.filter((r) => !r.needsLook);
    return [
      {
        key: 'look',
        label: t('importReview.purchases.groupNeedsLook', 'Behöver din blick'),
        hint: t('importReview.purchases.groupNeedsLookHint', 'varning eller dubblett'),
        rows: look,
      },
      {
        key: 'fine',
        label: t('importReview.purchases.groupFine', 'Ser bra ut'),
        hint: '',
        rows: fine,
      },
    ].filter((g) => g.rows.length > 0);
  }, [rows, t]);

  if (rows.length === 0) {
    return (
      <p className="p-6 text-center text-xs text-muted-foreground">
        {t('importReview.purchases.emptyFiltered', 'Inga inköp matchar det du filtrerat på.')}
      </p>
    );
  }

  return (
    <div>
      {groups.map((group) => (
        <div key={group.key}>
          <div className="sticky top-0 z-10 flex items-baseline gap-2 border-b bg-muted/70 px-3.5 py-1.5 backdrop-blur">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">{group.rows.length}</span>
            {group.hint && (
              <span className="truncate text-[11px] text-muted-foreground">· {group.hint}</span>
            )}
          </div>
          {group.rows.map((row) => (
            <PurchaseRowView
              key={row.id}
              row={row}
              session={session}
              selected={selectedId === row.id}
              linked={linkedIds.has(row.id)}
              editing={editingId === row.id}
              onSelect={() => onSelect(row.id)}
              onToggle={() => onToggle(row.id, !row.kept)}
              onRoom={(value) => onRoom(row.id, value)}
              onEdit={() => onEdit(editingId === row.id ? null : row.id)}
              onSaveEdit={(edits) => onSaveEdit(row.id, edits)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function PurchaseRowView({
  row,
  session,
  selected,
  linked,
  editing,
  onSelect,
  onToggle,
  onRoom,
  onEdit,
  onSaveEdit,
}: {
  row: PurchaseRow;
  session: ImportSession;
  selected: boolean;
  linked: boolean;
  editing: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onRoom: (value: string) => void;
  onEdit: () => void;
  onSaveEdit: (edits: PurchaseEdits) => void;
}) {
  const { t, i18n } = useTranslation();
  const off = !row.kept;

  const flagText = row.sumMismatch
    ? t('importReview.purchases.sumMismatchBody', 'Raderna summerar till {{sum}} — inte till {{total}}', {
        sum: kr(row.sumMismatch, i18n.language),
        total: kr(row.total, i18n.language),
      })
    : row.duplicateOfExisting
      ? t('importReview.purchases.dupExistingBody', 'Finns redan i projektet')
      : row.pairOf
        ? t('importReview.purchases.pairBody', 'Troligen samma kvitto som {{file}}', { file: row.pairOf })
        : null;

  return (
    <div
      onClick={onSelect}
      className={cn(
        'cursor-pointer border-b px-3 py-2.5 transition-colors',
        selected ? 'bg-primary/5 shadow-[inset_3px_0_0_hsl(var(--primary))]' : 'hover:bg-muted/40',
        linked && !selected && 'outline outline-[1.5px] -outline-offset-[3px] outline-dashed outline-primary/50',
        off && 'opacity-50'
      )}
    >
      <div className="flex items-start gap-2.5">
        <input
          type="checkbox"
          className="mt-1 shrink-0"
          checked={row.kept}
          onClick={(e) => e.stopPropagation()}
          onChange={onToggle}
          aria-label={t('importReview.purchases.keep', 'Ta med')}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2.5">
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-sm font-semibold',
                off && 'line-through'
              )}
            >
              {row.vendor}
            </span>
            <span
              className={cn(
                'shrink-0 font-mono text-[13px] tabular-nums',
                off ? 'text-muted-foreground line-through' : 'text-foreground'
              )}
            >
              {kr(row.total, i18n.language)}
            </span>
          </div>

          <div className="mt-1 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
              <span className="font-mono">{fmtDate(row.date, i18n.language)}</span>
              {row.lineCount > 0 && (
                <>
                  {' · '}
                  {t('importReview.purchases.lines', '{{count}} rader', { count: row.lineCount })}
                </>
              )}
              {row.invoiceNumber && (
                <>
                  {' · '}
                  {t('importReview.purchases.invoiceNo', 'Fakturanr')}{' '}
                  <span className="font-mono">{row.invoiceNumber}</span>
                </>
              )}
            </span>
            {session.existingRooms.length > 0 && (
              <span onClick={(e) => e.stopPropagation()}>
                <Select value={row.roomId ? `existing:${row.roomId}` : NO_ROOM} onValueChange={onRoom}>
                  <SelectTrigger className="h-7 w-[120px] shrink-0 text-xs">
                    <Home className="mr-1 h-3 w-3 shrink-0 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ROOM}>
                      {t('importReview.purchases.noRoom', 'Välj rum')}
                    </SelectItem>
                    {session.existingRooms.map((r) => (
                      <SelectItem key={r.id} value={`existing:${r.id}`}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-7 w-7 shrink-0', editing && 'bg-muted')}
              title={t('importReview.purchases.edit', 'Rätta uppgifterna')}
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>

          {flagText && (
            <div className="mt-1.5 flex items-center gap-2">
              {row.sumMismatch && (
                <Flag tone="warn" icon={AlertTriangle}>
                  {t('importReview.purchases.sumMismatch', 'Summan stämmer inte')}
                </Flag>
              )}
              {row.duplicateOfExisting && (
                <Flag tone="dup" icon={Copy}>
                  {t('importReview.purchases.dupExisting', 'Redan bokförd')}
                </Flag>
              )}
              {!row.duplicateOfExisting && row.pairOf && (
                <Flag tone="dup" icon={Copy}>
                  {t('importReview.purchases.pair', 'Trolig dubblett')}
                </Flag>
              )}
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                {flagText}
              </span>
            </div>
          )}

          {editing && <InlineEdit row={row} onSave={onSaveEdit} onCancel={onEdit} />}
        </div>
      </div>
    </div>
  );
}

/** Correct what the AI read, without leaving the review. */
function InlineEdit({
  row,
  onSave,
  onCancel,
}: {
  row: PurchaseRow;
  onSave: (edits: PurchaseEdits) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <form
      onClick={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        onSave({
          vendorName: (form.elements.namedItem('vendorName') as HTMLInputElement).value,
          total: (form.elements.namedItem('total') as HTMLInputElement).value,
          documentDate: (form.elements.namedItem('documentDate') as HTMLInputElement).value,
          invoiceNumber: (form.elements.namedItem('invoiceNumber') as HTMLInputElement).value,
        });
      }}
      className="mt-2 rounded-lg border border-dashed bg-muted/50 p-2.5"
    >
      <div className="flex flex-wrap gap-2">
        <Field name="vendorName" label={t('importReview.purchases.fieldVendor', 'Leverantör')} defaultValue={row.vendor} className="w-[170px]" />
        <Field name="total" label={t('importReview.purchases.fieldTotal', 'Belopp')} defaultValue={String(row.total)} className="w-[110px] font-mono" />
        <Field name="documentDate" label={t('importReview.purchases.fieldDate', 'Datum')} defaultValue={row.date ?? ''} type="date" className="w-[140px] font-mono" />
        <Field name="invoiceNumber" label={t('importReview.purchases.fieldInvoiceNo', 'Fakturanr')} defaultValue={row.invoiceNumber ?? ''} className="w-[120px] font-mono" />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" className="h-7 text-xs">
          {t('importReview.purchases.saveEdit', 'Spara rättningen')}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>
          {t('common.cancel', 'Avbryt')}
        </Button>
        <span className="text-[11px] text-muted-foreground">
          {t('importReview.purchases.editHint', 'Ändringen sparas först när du trycker Genomför.')}
        </span>
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  defaultValue,
  className,
  type,
}: {
  name: string;
  label: string;
  defaultValue: string;
  className?: string;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <Input name={name} type={type} defaultValue={defaultValue} className={cn('h-7 text-xs', className)} />
    </label>
  );
}

/** Search + filter chips + bulk menu — the toolbar that flips with this tab. */
export function PurchaseToolbar({
  query,
  onQuery,
  filter,
  onFilter,
  counts,
  shownCount,
  onBulk,
}: {
  query: string;
  onQuery: (q: string) => void;
  filter: PurchaseFilter;
  onFilter: (f: PurchaseFilter) => void;
  counts: Record<PurchaseFilter, number>;
  shownCount: number;
  onBulk: (keep: boolean) => void;
}) {
  const { t } = useTranslation();
  const chips: Array<{ id: PurchaseFilter; label: string }> = [
    { id: 'all', label: t('importReview.purchases.filterAll', 'Alla') },
    { id: 'needsLook', label: t('importReview.purchases.filterNeedsLook', 'Behöver blick') },
    { id: 'noRoom', label: t('importReview.purchases.filterNoRoom', 'Utan rum') },
    { id: 'dropped', label: t('importReview.purchases.filterDropped', 'Urbockade') },
  ];

  return (
    <>
      <div className="relative min-w-[150px] flex-1">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t('importReview.purchases.search', 'Sök leverantör eller fil')}
          className="h-7 pl-7 text-xs"
        />
      </div>
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={() => onFilter(chip.id)}
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
            filter === chip.id
              ? 'border-primary bg-primary text-primary-foreground'
              : 'bg-background hover:bg-muted'
          )}
        >
          {chip.id === 'needsLook' && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
          {chip.label}
          <span className="font-mono text-[11px] tabular-nums opacity-70">{counts[chip.id]}</span>
        </button>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="ml-auto h-7 text-xs">
            {/* Always names the ACTIVE filter's count, so a bulk action can
                never quietly touch rows that are scrolled out of view. */}
            {t('importReview.purchases.bulk', 'Åtgärda de {{count}} som visas', { count: shownCount })}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onBulk(true)}>
            {t('importReview.purchases.bulkKeep', 'Bocka i alla')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onBulk(false)}>
            {t('importReview.purchases.bulkDrop', 'Bocka ur alla')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
