import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Copy, FileText, Home, Layers, RefreshCw, Search, Split, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { ImportSession } from '@/services/agent/importSession';
import {
  DOCUMENT_TYPE_CATALOG,
  PICKABLE_DOCUMENT_TYPES,
  type DocumentType,
} from '@/services/smartUploadService';
import type { PurchaseFilter, PurchaseRow } from './purchaseRowModel';
import type { AtaSuggestion } from '@/services/agent/ataSuggestion';

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

/**
 * Where a rescued document is filed.
 *
 * The app's own document vocabulary, not a new one — the same `DocumentType`
 * every other filing path uses, so a följesedel saved here lands in the same
 * place the batch upload would have put it. Övrigt is first and is the default
 * (Carl, 2026-09-03): a delivery note is not a receipt, and inventing a folder
 * for it would be a category nobody else in the app knows about.
 */
/**
 * The picker, grouped, straight off the catalog.
 *
 * Övrigt keeps its place at the TOP even though the catalog lists it last:
 * here it is the default, and the whole point of the action is that the person
 * does not have to know what the paper is called to keep it (Carl,
 * 2026-09-03). Everywhere else Övrigt is the last resort and sorts last.
 */
const TYPE_GROUPS: Array<{ key: string; fallback: string; types: typeof PICKABLE_DOCUMENT_TYPES }> = [
  { key: 'smartUpload.groups.fallback', fallback: 'Vet inte', types: PICKABLE_DOCUMENT_TYPES.filter((d) => d.group === 'fallback') },
  { key: 'smartUpload.groups.economy', fallback: 'Ekonomi', types: PICKABLE_DOCUMENT_TYPES.filter((d) => d.group === 'economy') },
  { key: 'smartUpload.groups.legal', fallback: 'Juridik & ansvar', types: PICKABLE_DOCUMENT_TYPES.filter((d) => d.group === 'legal') },
  { key: 'smartUpload.groups.technical', fallback: 'Teknik', types: PICKABLE_DOCUMENT_TYPES.filter((d) => d.group === 'technical') },
].filter((g) => g.types.length > 0);

/** The i18n key + Swedish fallback for one document type, for the caller's `t`. */
function documentTypeLabel(type: DocumentType): { key: string; fallback: string } {
  const entry = DOCUMENT_TYPE_CATALOG.find((d) => d.value === type);
  return entry ? { key: entry.labelKey, fallback: entry.fallback } : { key: type, fallback: type };
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
  /** Book the cost outside the accepted budget (ÄTA). */
  onBookAsAta: (id: string, ata: boolean) => void;
  /** "Ingår i avtalet" — stop asking about this row. */
  onDismissAta: (id: string) => void;
  /** Rows budgetvakten wants a decision on, by proposal id. */
  ataSuggestions: Map<string, AtaSuggestion>;
  /** Read the same image again; a hard photo often lands better on try two. */
  onReread: (id: string) => void;
  /**
   * "This is not a purchase — keep the paper." `null` undoes it.
   *
   * Closes the hole where switching a row off lost the FILE as well as the
   * reading: the order owns the bytes until Genomför, so an unchecked row
   * never uploaded anywhere (Carl, 2026-09-03).
   */
  onSaveAsDocument: (id: string, type: DocumentType | null) => void;
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
  onBookAsAta,
  onDismissAta,
  ataSuggestions,
  onReread,
  onSaveAsDocument,
  rereading,
}: PurchaseListProps) {
  const { t } = useTranslation();

  /**
   * Open the row a flag points at, wherever it sits.
   *
   * Selecting it shows its image in the preview — which is the actual
   * comparison — and scrolling centres it, because the partner may well have
   * been accepted already and moved down into "Ser bra ut".
   */
  const jumpTo = (id: string) => {
    onSelect(id);
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-purchase-row="${id}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  };

  /**
   * Seat the two halves of a suspected duplicate next to each other.
   *
   * "Troligen samma kvitto som IMG_4083.jpg" is unanswerable if IMG_4083 is
   * thirty rows away — the whole judgement is a comparison, and the person had
   * to scroll off and hunt for it (Carl, 2026-09-03). Stable otherwise: a row
   * only ever moves to sit beside its own partner.
   */
  const seatPairsTogether = (list: PurchaseRow[]): PurchaseRow[] => {
    const out: PurchaseRow[] = [];
    const placed = new Set<string>();
    for (const row of list) {
      if (placed.has(row.id)) continue;
      out.push(row);
      placed.add(row.id);
      if (!row.pairKey) continue;
      for (const other of list) {
        if (other.id === row.id || placed.has(other.id)) continue;
        if (other.pairKey === row.pairKey) {
          out.push(other);
          placed.add(other.id);
        }
      }
    }
    return out;
  };

  const groups = useMemo(() => {
    const look = seatPairsTogether(rows.filter((r) => r.needsLook));
    const fine = seatPairsTogether(rows.filter((r) => !r.needsLook));
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
              allRows={rows}
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
              onBookAsAta={(ata) => onBookAsAta(row.id, ata)}
              onDismissAta={() => onDismissAta(row.id)}
              ataSuggestion={ataSuggestions.get(row.id) ?? null}
              onReread={() => onReread(row.id)}
              onSaveAsDocument={(type) => onSaveAsDocument(row.id, type)}
              rereading={rereading.has(row.id)}
              onJumpTo={jumpTo}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function PurchaseRowView({
  row,
  allRows,
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
  onBookAsAta,
  onDismissAta,
  ataSuggestion,
  onReread,
  onSaveAsDocument,
  rereading,
  onJumpTo,
}: {
  row: PurchaseRow;
  /** Every row in the batch — the pool "Slå ihop med…" chooses a partner from. */
  allRows: PurchaseRow[];
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
  onBookAsAta: (ata: boolean) => void;
  onDismissAta: () => void;
  ataSuggestion: AtaSuggestion | null;
  onReread: () => void;
  onSaveAsDocument: (type: DocumentType | null) => void;
  rereading: boolean;
  onJumpTo: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const off = !row.kept;
  /**
   * Rows that could be another sheet of this one.
   *
   * Everything except this row, rows already merged away, and the partner the
   * one-click button above already handles — offering it twice would give the
   * same action two different names.
   */
  const mergeCandidates = allRows.filter(
    (r) => r.id !== row.id && !r.savedAsDocument && r.id !== row.pairOfId
  );
  /** The gross the verifier computed, when the total was read off a net line. */
  const netFix = (() => {
    const issue = row.issues.find((i) => i.code === 'total_looks_net');
    const gross = issue?.detail?.gross;
    return typeof gross === 'number' ? gross : null;
  })();

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
      data-purchase-row={row.id}
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

          {/* Not a cost, but not thrown away either — say which, on the row. */}
          {row.savedAsDocument && (
            <div className="mt-1.5 flex items-center gap-2">
              <Flag tone="ok" icon={FileText}>
                {t('importReview.purchases.savedAsDocument', 'Sparas som dokument')}
              </Flag>
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                {t('importReview.purchases.savedAsDocumentBody', 'Filen läggs i {{folder}} — ingen kostnad bokförs', {
                  folder: t(
                    documentTypeLabel(row.savedAsDocument).key,
                    documentTypeLabel(row.savedAsDocument).fallback
                  ),
                })}
              </span>
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
                    {row.duplicateOfExisting ? (
                      t('importReview.purchases.dupExistingBody', 'Finns redan i projektet')
                    ) : (
                      <>
                        {t('importReview.purchases.pairBodyPrefix', 'Troligen samma kvitto som')}{' '}
                        {/* The named file is the answer to the question the flag
                            asks, so it has to be reachable from the question. */}
                        <button
                          type="button"
                          className="font-mono underline decoration-dotted underline-offset-2 hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            onJumpTo(row.pairOfId!);
                          }}
                        >
                          {row.pairOf}
                        </button>
                      </>
                    )}
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
              Inte ett inköp — keep the PAPER, drop the cost
              Ta inte med— genuinely not wanted, paper included

            Shown only where there is something to resolve, so a clean row stays
            a clean row.
          */}
          {/* Shown where there is something to resolve — and on the row you are
              LOOKING at, because a clean-looking 8 kr row from a följesedel is
              exactly the one that needs "this is not a purchase" and never had
              a warning to hang it on (Carl, 2026-09-03). */}
          {(row.needsLook || row.acknowledged || row.savedAsDocument || selected) && (
            <div
              className="mt-2 flex flex-wrap items-center gap-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              {/*
                When the arithmetic already knows the answer, offering it beats
                pointing at it. `total_looks_net` fires only when the VAT sits
                at a legal rate against the total itself, which means the gross
                is not a guess — it is total + VAT, and one click is the whole
                correction (Carl, 2026-09-03).
              */}
              {netFix != null && !row.acknowledged && (
                <RowAction
                  icon={Check}
                  onClick={() => onField('total', String(netFix))}
                >
                  {t('importReview.purchases.useGross', 'Sätt till {{amount}}', {
                    amount: kr(netFix, i18n.language),
                  })}
                </RowAction>
              )}
              {/* Whichever half you press it on, the FIRST reading survives and
                  the other becomes a page of it — so the result does not depend
                  on which row you happened to be looking at. */}
              {row.pairOfId && !row.acknowledged && (
                <RowAction
                  icon={Layers}
                  onClick={() =>
                    row.pairPrimary
                      ? onMerge(row.pairOfId!, row.id)
                      : onMerge(row.id, row.pairOfId!)
                  }
                >
                  {t('importReview.purchases.merge', 'Slå ihop till ett underlag')}
                </RowAction>
              )}
              {/*
                The pair detector only fires on the SAME vendor and the SAME
                amount to the öre, so it never sees sheet 1 and sheet 2 of one
                invoice — which is exactly the case that needs merging, and the
                one that had no button at all (Carl, 2026-09-04). This picker
                is the general form: any row can become a page of this one.
              */}
              {!row.acknowledged && mergeCandidates.length > 0 && (
                <MergeWithPicker
                  row={row}
                  candidates={mergeCandidates}
                  onMerge={onMerge}
                />
              )}
              {row.action.attachmentKey && (
                <RowAction icon={RefreshCw} busy={rereading} onClick={onReread}>
                  {t('importReview.purchases.reread', 'Läs om')}
                </RowAction>
              )}
              {/*
                Budgetvakten's question, on the row that passes the agreement.

                A QUESTION, never a pre-tick: the final invoice for work that
                was always included also arrives last, so "past the budget" is
                not the same as "extra work", and a silently wrong booking is
                worse than no help (Carl, 2026-09-04). It names the SUM rather
                than warning — a 400 kr overshoot explains itself and gets
                ignored, which is the correct outcome for a 400 kr overshoot.
                Silent under budget, and silent entirely when there is no
                accepted quote to be outside of.
              */}
              {ataSuggestion && !row.bookAsAta && (
                <span className="flex w-full flex-wrap items-center gap-1.5 rounded-md border border-amber-300/60 bg-amber-50/60 px-2 py-1.5 text-[11px] dark:border-amber-500/30 dark:bg-amber-500/10">
                  <span className="min-w-0 flex-1 whitespace-normal text-amber-900 dark:text-amber-200">
                    {t('importReview.purchases.ataAsk', {
                      over: kr(ataSuggestion.overBy, i18n.language),
                      contract: kr(ataSuggestion.contractValue, i18n.language),
                      defaultValue:
                        'Tar projektet {{over}} över det ni kom överens om ({{contract}}). Är det extra arbete?',
                    })}
                  </span>
                  <RowAction icon={Split} onClick={() => onBookAsAta(true)}>
                    {t('importReview.purchases.ataYes', 'Bokför som ÄTA')}
                  </RowAction>
                  <RowAction icon={Check} onClick={onDismissAta}>
                    {t('importReview.purchases.ataNo', 'Ingår i avtalet')}
                  </RowAction>
                </span>
              )}
              {/*
                ÄTA — extra work outside the accepted budget.

                Shown on EVERY row that stays a purchase, not only flagged ones,
                because an ÄTA invoice looks completely ordinary: the paper says
                nothing about it (Carl, 2026-09-04). Hiding it behind a warning
                would mean the rows that need it are the ones that never offer
                it. It does not touch the amount — the cost is real either way;
                it moves which side of the accepted budget it counts on.
              */}
              {row.kept && !row.savedAsDocument && (
                <RowAction
                  icon={Split}
                  tone={row.bookAsAta ? 'done' : undefined}
                  onClick={() => onBookAsAta(!row.bookAsAta)}
                >
                  {row.bookAsAta
                    ? t('importReview.purchases.ataOn', 'ÄTA — utanför budget')
                    : t('importReview.purchases.ata', 'Bokför som ÄTA')}
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
              {/*
                The fifth action, and the only one that keeps the PAPER.
                "Ta inte med" drops the reading AND the file — a file read as a
                purchase has no storage path of its own until the order uploads
                it at Genomför. A följesedel misread as 8 kr therefore left the
                choice between a false cost and a lost document (Carl,
                2026-09-03). Övrigt is the default and sits first.
              */}
              {row.savedAsDocument ? (
                <RowAction icon={FileText} tone="done" onClick={() => onSaveAsDocument(null)}>
                  {t('importReview.purchases.savedAsDocumentUndo', 'Sparas som dokument — ångra')}
                </RowAction>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-transparent px-1.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
                    >
                      <FileText className="h-3 w-3 shrink-0" />
                      {t('importReview.purchases.notAPurchase', 'Inte ett inköp — spara som dokument')}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                    {TYPE_GROUPS.map((group, i) => (
                      <div key={group.key}>
                        {i > 0 && <DropdownMenuSeparator />}
                        <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {t(group.key, group.fallback)}
                        </DropdownMenuLabel>
                        {group.types.map((doc) => (
                          <DropdownMenuItem
                            key={doc.value}
                            className="text-xs"
                            onSelect={() => onSaveAsDocument(doc.value)}
                          >
                            {t(doc.labelKey, doc.fallback)}
                          </DropdownMenuItem>
                        ))}
                      </div>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
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

/**
 * "Slå ihop med…" — pick which other reading is another sheet of this one.
 *
 * The automatic pair only fires on identical vendor AND identical amount, so
 * page 1 and page 2 of one invoice (different totals) never got a button. This
 * is the manual form, and it is deliberately explicit about direction: the row
 * you opened the picker on is the one that SURVIVES, keeping its amount, and
 * the row you choose becomes a page of it. Getting that backwards would book
 * the wrong total, so it is written on the menu rather than implied.
 */
function MergeWithPicker({
  row,
  candidates,
  onMerge,
}: {
  row: PurchaseRow;
  candidates: PurchaseRow[];
  onMerge: (fromId: string, intoId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const shown = q
    ? candidates.filter((c) =>
        `${c.action.vendorName} ${c.sourceFile ?? ''}`.toLowerCase().includes(q)
      )
    : candidates;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Layers className="h-3 w-3 shrink-0" />
          <span className="whitespace-normal">
            {t('importReview.purchases.mergeWith', 'Slå ihop med…')}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1">
        <p className="px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
          {t('importReview.purchases.mergeWithHint', {
            amount: kr(row.action.total, i18n.language),
            defaultValue:
              'Raden du väljer blir en sida av den här. Beloppet som gäller blir {{amount}}.',
          })}
        </p>
        {candidates.length > 6 && (
          <div className="px-1 pb-1">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('importReview.purchases.search', 'Sök leverantör eller fil')}
              className="h-7 text-xs"
            />
          </div>
        )}
        <div className="max-h-64 overflow-y-auto">
          {shown.length === 0 && (
            <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">
              {t('importReview.purchases.mergeWithNone', 'Ingen rad matchar')}
            </p>
          )}
          {shown.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onMerge(c.id, row.id);
                setOpen(false);
                setQuery('');
              }}
              className="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium">{c.action.vendorName}</span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {kr(c.action.total, i18n.language)}
                </span>
              </span>
              {c.sourceFile && (
                <span className="block truncate text-[11px] text-muted-foreground">
                  {c.sourceFile}
                </span>
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
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
  const allChips: Array<{ id: PurchaseFilter; label: string }> = [
    { id: 'all', label: t('importReview.purchases.filterAll', 'Alla') },
    { id: 'needsLook', label: t('importReview.purchases.filterNeedsLook', 'Behöver blick') },
    { id: 'noRoom', label: t('importReview.purchases.filterNoRoom', 'Utan rum') },
    { id: 'dropped', label: t('importReview.purchases.filterDropped', 'Urbockade') },
  ];

  /**
   * Only chips that would actually change what is on screen.
   *
   * A fresh batch showed "Alla 39 · Behöver blick 14 · Utan rum 39 ·
   * Urbockade 0" — two of the four are noise the person still has to read past
   * every time (Carl, 2026-09-04). A chip whose count is 0 filters to an empty
   * list, and one whose count equals the total filters nothing away; neither
   * is a choice. `all` always stays, and so does whatever is selected, so the
   * row cannot drop the way out from under the person who clicked it.
   */
  const chips = allChips.filter(
    ({ id }) =>
      id === 'all' ||
      id === filter ||
      (counts[id] > 0 && counts[id] < counts.all)
  );

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
