import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Copy, Home, Layers, RefreshCw, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  // 'ok' is not a warning — it states a fact the person created by merging.
  tone: 'warn' | 'dup' | 'ok';
  icon: typeof AlertTriangle;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
        tone === 'warn'
          ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
          : tone === 'ok'
            ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
            : 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200'
      )}
    >
      <Icon className="h-3 w-3" />
      {children}
    </span>
  );
}


/**
 * A value you correct by clicking it.
 *
 * The full form was a modal-in-a-row: to fix one wrong date you opened four
 * fields and pressed Save. Carl, 2026-09-02: "istället för att trycka upp
 * maximerad edit version, kanske man kan hovra över detaljerna och klicka på
 * dom för att enablea edit direkt på värdet". So each value edits where it
 * stands — Enter or blur commits, Escape abandons.
 */
function EditableValue({
  value,
  display,
  label,
  type,
  mono,
  className,
  onSave,
  armed,
  onArm,
}: {
  value: string;
  display: string;
  label: string;
  type?: string;
  mono?: boolean;
  className?: string;
  onSave: (next: string) => void;
  /**
   * Whether this row is the selected one. Values on an UNSELECTED row are not
   * editable: the first click anywhere on a row means "show me this receipt",
   * and with fields packed into the row it was far too easy to open an editor
   * when all you wanted was to look at the next document (Carl, 2026-09-02).
   */
  armed: boolean;
  /** Select the row instead of editing, when the row is not armed yet. */
  onArm: () => void;
}) {
  const { t } = useTranslation();
  const hint = t('importReview.purchases.clickToEdit', 'klicka för att rätta');
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <Input
        autoFocus
        type={type}
        defaultValue={value}
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        onBlur={(e) => {
          setEditing(false);
          if (e.target.value !== value) onSave(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            setEditing(false);
          }
        }}
        className={cn('h-6 w-auto min-w-[7ch] max-w-[22ch] px-1.5 py-0 text-[11px]', mono && 'font-mono', className)}
      />
    );
  }

  return (
    <button
      type="button"
      title={armed ? `${label} — ${hint}` : label}
      onClick={(e) => {
        e.stopPropagation();
        // Not selected yet → this click selects the row and shows its image.
        if (!armed) {
          onArm();
          return;
        }
        setEditing(true);
      }}
      className={cn(
        'rounded px-1 -mx-1 text-left transition-colors',
        armed && 'hover:bg-muted hover:ring-1 hover:ring-border',
        mono && 'font-mono',
        !display && 'italic text-muted-foreground/70',
        className
      )}
    >
      {display || '—'}
    </button>
  );
}

/** The fields a person may correct on a purchase row, one at a time. */
export type PurchaseField =
  | 'vendorName'
  | 'total'
  | 'documentDate'
  | 'invoiceNumber'
  | 'vatAmount';


/**
 * Pick a room for a purchase — or name a new one right here.
 *
 * Every other room picker in the app offers "create new" at the bottom of the
 * list (AIDocumentImportModal, PropertyPicker), and this one silently did not:
 * a receipt for a room the project has never heard of had nowhere to go
 * (Carl, 2026-09-02). The new room is only a PROPOSAL until Genomför, like
 * everything else on this screen.
 */
function RoomPicker({
  rooms,
  value,
  pendingName,
  onPick,
  onCreate,
}: {
  rooms: Array<{ id: string; name: string }>;
  value: string | null;
  /** A room this batch will create — shown as the current pick before it exists. */
  pendingName: string | null;
  onPick: (value: string) => void;
  onCreate: (name: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const current = rooms.find((r) => r.id === value);
  const label = current?.name ?? pendingName ?? null;

  const create = () => {
    const name = draft.trim();
    if (!name) return;
    onCreate(name);
    setDraft('');
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 w-[130px] shrink-0 justify-start gap-1 px-2 text-xs">
          <Home className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className={cn('truncate', !label && 'text-muted-foreground')}>
            {label ?? t('importReview.purchases.noRoom', 'Välj rum')}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-72 w-56 overflow-y-auto p-1">
        <button
          type="button"
          onClick={() => {
            onPick(NO_ROOM);
            setOpen(false);
          }}
          className={cn(
            'w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted',
            !label && 'bg-primary/5 font-medium'
          )}
        >
          {t('importReview.purchases.noRoomOption', 'Inget rum')}
        </button>
        {rooms.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => {
              onPick(`existing:${r.id}`);
              setOpen(false);
            }}
            className={cn(
              'w-full truncate rounded px-2 py-1.5 text-left text-xs hover:bg-muted',
              current?.id === r.id && 'bg-primary/5 font-medium'
            )}
            title={r.name}
          >
            {r.name}
          </button>
        ))}
        <div className="mt-1 border-t pt-1">
          <div className="flex gap-1 px-1">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t('importReview.purchases.createRoom', 'Skapa nytt rum…')}
              className="h-7 text-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  create();
                }
              }}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 shrink-0 px-2 text-xs"
              disabled={!draft.trim()}
              onClick={create}
            >
              +
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface PurchaseListProps {
  rows: PurchaseRow[];
  session: ImportSession;
  selectedId: string | null;
  linkedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string, keep: boolean) => void;
  onRoom: (id: string, value: string) => void;
  /** One corrected field on one row. Nothing reaches the DB until Genomför. */
  onField: (id: string, field: PurchaseField, value: string) => void;
  /** Name a room that does not exist yet; becomes a create_room proposal. */
  onCreateRoom: (purchaseId: string, name: string) => void;
  /** Fold a duplicate reading into its partner as a further page. */
  onMerge: (fromId: string, intoId: string) => void;
  /** "I looked, it is right" — takes the row out of the queue. */
  onAcknowledge: (id: string, ack: boolean) => void;
  /** Read the same image again; a hard photo often lands better on try two. */
  onReread: (id: string) => void;
  /** Rows with a re-read in flight. */
  rereading: Set<string>;
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
  onSelect,
  onToggle,
  onRoom,
  onField,
  onCreateRoom,
  onMerge,
  onAcknowledge,
  onReread,
  rereading,
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
              onSelect={() => onSelect(row.id)}
              onToggle={() => onToggle(row.id, !row.kept)}
              onRoom={(value) => onRoom(row.id, value)}
              onField={(field, value) => onField(row.id, field, value)}
              onCreateRoom={(name) => onCreateRoom(row.id, name)}
              onMerge={onMerge}
              onAcknowledge={(ack) => onAcknowledge(row.id, ack)}
              onReread={() => onReread(row.id)}
              rereading={rereading.has(row.id)}
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
  onSelect,
  onToggle,
  onRoom,
  onField,
  onCreateRoom,
  onMerge,
  onAcknowledge,
  onReread,
  rereading,
}: {
  row: PurchaseRow;
  session: ImportSession;
  selected: boolean;
  linked: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onRoom: (value: string) => void;
  onField: (field: PurchaseField, value: string) => void;
  onCreateRoom: (name: string) => void;
  onMerge: (fromId: string, intoId: string) => void;
  onAcknowledge: (ack: boolean) => void;
  onReread: () => void;
  rereading: boolean;
}) {
  const { t, i18n } = useTranslation();
  const off = !row.kept;

  /**
   * One line per thing the arithmetic could not reconcile, each naming the
   * FIELD to look at. "Check this row" is useless at fifty rows; "the VAT is
   * 19 %, not 25 %" sends the eye straight to the number (Carl, 2026-09-02).
   */
  const issueText = (issue: (typeof row.issues)[number]): string => {
    const d = issue.detail ?? {};
    switch (issue.code) {
      case 'line_sum_mismatch':
        return t('importReview.issues.lineSum', 'Raderna summerar till {{sum}} kr — inte till {{total}} kr', d);
      case 'printed_total_differs':
        return t('importReview.issues.printedTotal', 'Kvittot visar {{printed}} men tolken skrev {{parsed}}', d);
      case 'vat_rate_off':
        return t('importReview.issues.vatRate', 'Momsen blir {{rate}} % — förväntat {{expected}} %', d);
      case 'total_looks_net':
        return t('importReview.issues.totalLooksNet', 'Beloppet ser ut att vara exkl. moms — inkl. moms blir {{gross}} kr', d);
      case 'vat_exceeds_total':
        return t('importReview.issues.vatOverTotal', 'Momsen är större än totalbeloppet');
      case 'missing_total':
        return t('importReview.issues.missingTotal', 'Inget totalbelopp lästes');
      case 'missing_vendor':
        return t('importReview.issues.missingVendor', 'Ingen leverantör lästes');
      case 'missing_date':
        return t('importReview.issues.missingDate', 'Inget datum lästes');
      case 'date_in_future':
        return t('importReview.issues.dateFuture', 'Datumet ligger i framtiden');
      case 'date_implausible':
        return t('importReview.issues.dateOdd', 'Datumet ser orimligt ut');
      case 'invoice_number_on_receipt':
        return t('importReview.issues.invoiceNoOnReceipt', 'Ett kvitto med fakturanummer — är det en faktura?');
      case 'low_confidence':
        return t('importReview.issues.lowConfidence', 'Dokumentet var svårläst ({{confidence}} % säkerhet)', d);
      default:
        return '';
    }
  };

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
            <EditableValue
              value={row.vendor}
              display={row.vendor}
              label={t('importReview.purchases.fieldVendor', 'Leverantör')}
              onSave={(v) => onField('vendorName', v)}
              className={cn('min-w-0 flex-1 truncate text-sm font-semibold', off && 'line-through')}
                armed={selected}
                onArm={onSelect}
            />
            <EditableValue
              value={String(row.total)}
              display={kr(row.total, i18n.language)}
              label={t('importReview.purchases.fieldTotal', 'Belopp')}
              mono
              onSave={(v) => onField('total', v)}
              className={cn(
                'shrink-0 text-[13px] tabular-nums',
                off ? 'text-muted-foreground line-through' : 'text-foreground'
              )}
                armed={selected}
                onArm={onSelect}
            />
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            {/* Every field the person might have to correct, visible without
                opening anything — and each one edits where it stands. */}
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
              <EditableValue
                value={row.date ?? ''}
                display={fmtDate(row.date, i18n.language)}
                label={t('importReview.purchases.fieldDate', 'Datum')}
                type="date"
                mono
                onSave={(v) => onField('documentDate', v)}
                armed={selected}
                onArm={onSelect}
              />
              <span aria-hidden>·</span>
              <span className="whitespace-nowrap">
                {t('importReview.purchases.vat', 'Moms')}{' '}
                <EditableValue
                  value={row.vatAmount != null ? String(row.vatAmount) : ''}
                  display={row.vatAmount != null ? kr(row.vatAmount, i18n.language) : ''}
                  label={t('importReview.purchases.vat', 'Moms')}
                  mono
                  onSave={(v) => onField('vatAmount', v)}
                armed={selected}
                onArm={onSelect}
                />
              </span>
              <span aria-hidden>·</span>
              <span className="whitespace-nowrap">
                {t('importReview.purchases.docNo', 'Faktura-/kvittonr')}{' '}
                <EditableValue
                  value={row.invoiceNumber ?? ''}
                  display={row.invoiceNumber ?? ''}
                  label={t('importReview.purchases.docNo', 'Faktura-/kvittonr')}
                  mono
                  onSave={(v) => onField('invoiceNumber', v)}
                armed={selected}
                onArm={onSelect}
                />
              </span>
              {row.lineCount > 0 && (
                <>
                  <span aria-hidden>·</span>
                  <span className="whitespace-nowrap">
                    {t('importReview.purchases.lines', '{{count}} rader', { count: row.lineCount })}
                  </span>
                </>
              )}
              {/* The file it was read from. Without it, a row that disagrees
                  with the image beside it is unexplainable: you cannot tell a
                  misread document from a mispaired one (Carl, 2026-09-02). */}
              {row.sourceFile && (
                <>
                  <span aria-hidden>·</span>
                  <span className="truncate font-mono" title={row.sourceFile}>
                    {row.sourceFile}
                  </span>
                </>
              )}
            </span>
            <span onClick={(e) => e.stopPropagation()}>
              <RoomPicker
                rooms={session.existingRooms}
                value={row.roomId}
                pendingName={row.roomName}
                onPick={onRoom}
                onCreate={onCreateRoom}
              />
            </span>
          </div>

          {row.pageCount > 1 && (
            <div className="mt-1.5">
              <Flag tone="ok" icon={Layers}>
                {t('importReview.purchases.pages', '{{count}} sidor', { count: row.pageCount })}
              </Flag>
            </div>
          )}

          {(row.issues.length > 0 || row.duplicateOfExisting || row.pairOf) && (
            <div className="mt-1.5 space-y-1">
              {(row.duplicateOfExisting || row.pairOf) && (
                <div className="flex items-center gap-2">
                  <Flag tone="dup" icon={Copy}>
                    {row.duplicateOfExisting
                      ? t('importReview.purchases.dupExisting', 'Redan bokförd')
                      : t('importReview.purchases.pair', 'Trolig dubblett')}
                  </Flag>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                    {row.duplicateOfExisting
                      ? t('importReview.purchases.dupExistingBody', 'Finns redan i projektet')
                      : t('importReview.purchases.pairBody', 'Troligen samma kvitto som {{file}}', {
                          file: row.pairOf ?? '',
                        })}
                  </span>
                </div>
              )}
              {row.issues.map((issue) => (
                <div key={issue.code} className="flex items-center gap-2">
                  <Flag tone={issue.level === 'blocking' ? 'dup' : 'warn'} icon={AlertTriangle}>
                    {t(`importReview.issues.field.${issue.field}`, issue.field)}
                  </Flag>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                    {issueText(issue)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/*
            The actions a flagged row actually needs. Before these existed the
            only thing you could DO with a warning was switch the purchase off,
            which threw away a receipt you wanted (Carl, 2026-09-03).

              Slå ihop   — the duplicate is page two; one order, two underlag
              Läs om     — a hard photo read differently on the second try
              Det stämmer— I looked, it is right; leave the queue
              Ta inte med— genuinely not wanted

            Shown only where there is something to resolve, so a clean row stays
            a clean row.
          */}
          {(row.needsLook || row.acknowledged) && (
            <div
              className="mt-2 flex flex-wrap items-center gap-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              {row.pairOfId && !row.acknowledged && (
                <RowAction icon={Layers} onClick={() => onMerge(row.id, row.pairOfId!)}>
                  {t('importReview.purchases.merge', 'Slå ihop till ett underlag')}
                </RowAction>
              )}
              {row.action.attachmentKey && (
                <RowAction icon={RefreshCw} busy={rereading} onClick={onReread}>
                  {t('importReview.purchases.reread', 'Läs om')}
                </RowAction>
              )}
              <RowAction
                icon={Check}
                tone={row.acknowledged ? 'done' : undefined}
                onClick={() => onAcknowledge(!row.acknowledged)}
              >
                {row.acknowledged
                  ? t('importReview.purchases.acknowledged', 'Godkänd — ångra')
                  : t('importReview.purchases.acknowledge', 'Det stämmer')}
              </RowAction>
              {row.kept && (
                <RowAction icon={X} onClick={onToggle}>
                  {t('importReview.purchases.drop', 'Ta inte med')}
                </RowAction>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

/** One small action on a purchase row. Ghost until hovered — the row is the
 *  subject, these are what you can do to it. */
function RowAction({
  icon: Icon,
  children,
  onClick,
  busy,
  tone,
}: {
  icon: typeof Check;
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  tone?: 'done';
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50',
        tone === 'done'
          ? 'border-primary/30 bg-primary/10 text-primary'
          : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <Icon className={cn('h-3 w-3 shrink-0', busy && 'animate-spin')} />
      <span className="whitespace-normal">{children}</span>
    </button>
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
