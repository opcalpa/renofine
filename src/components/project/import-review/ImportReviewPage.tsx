import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { MultiSection, type MultiSectionTab } from '@/components/ui/multi-section';
import { captureDocument, peekAttachment } from '@/services/agent/documentCapture';
import { useIsMobile } from '@/hooks/use-mobile';
import type { AgentProposal, ProposalAction } from '@/services/agent/types';
import type {
  DrawingChoice,
  ImportFileRow,
  ImportSession,
} from '@/services/agent/importSession';
import { changeCount } from '@/services/agent/importSession';
import type { DocumentType } from '@/services/smartUploadService';
import { describeModelCalls } from '@/lib/modelCalls';
import { ImportFilesPane } from './ImportFilesPane';
import { ImportPreview } from './ImportPreview';
import { ImportRoomsSection } from './ImportRoomsSection';
import { ImportTasksSection } from './ImportTasksSection';
import { ImportDrawingsSection } from './ImportDrawingsSection';
import { ImportFilingSection } from './ImportFilingSection';
import { PurchaseList, PurchaseToolbar, type PurchaseField } from './ImportPurchasesTab';
import { buildPurchaseRows, filterRows, type PurchaseFilter } from './purchaseRowModel';
import { SecondOpinionPanel } from './SecondOpinionPanel';
import type { CsvRow, FieldDiff, MatchTarget } from '@/lib/secondOpinionCsv';

/**
 * Reconcile a dropped folder against the project it landed on.
 *
 * The panel could ask "add these 14 things, yes or no?". It could not ask the
 * question that actually matters when the folder describes a home the person
 * already described: which of these rooms are the rooms you already have?
 *
 * Left: the files, and the original of whichever one is selected — so the
 * interpretation can be checked against the document it came from.
 * Right: what will happen, editable.
 */

type CreateRoomAction = Extract<ProposalAction, { type: 'create_room' }>;
type CreateTaskAction = Extract<ProposalAction, { type: 'create_task' }>;

const NO_ROOM = '__none__';

interface ImportReviewPageProps {
  session: ImportSession;
  onChange: (session: ImportSession) => void;
  onApply: (session: ImportSession) => Promise<void>;
  onCancel: () => void;
  applying: boolean;
}

export function ImportReviewPage({
  session,
  onChange,
  onApply,
  onCancel,
  applying,
}: ImportReviewPageProps) {
  const { t, i18n } = useTranslation();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState('purchases');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PurchaseFilter>('all');
  /** Mobile only: the preview lives in a bottom sheet. */
  const [previewOpen, setPreviewOpen] = useState(false);
  /**
   * Rotation per document, remembered for the life of the review. A receipt
   * you turned upright must stay upright when you come back to it — checking
   * fifty of them means leaving and returning constantly (Carl, 2026-09-02).
   */
  const [rotations, setRotations] = useState<Record<string, number>>({});
  const [secondOpinionOpen, setSecondOpinionOpen] = useState(false);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(
    () => session.files.find((f) => f.kind === 'interpreted')?.id ?? null
  );

  const selectedFile = useMemo(
    () => session.files.find((f) => f.id === selectedFileId) ?? null,
    [session.files, selectedFileId]
  );

  /** Rows that came from the file being previewed. */
  const highlightedIds = useMemo(
    () => new Set(selectedFile?.proposalIds ?? []),
    [selectedFile]
  );

  const patchProposal = useCallback(
    (proposalId: string, update: (action: ProposalAction) => ProposalAction) => {
      onChange({
        ...session,
        proposals: session.proposals.map((p) =>
          p.id === proposalId ? { ...p, action: update(p.action) } : p
        ),
      });
    },
    [session, onChange]
  );

  /**
   * Switching a row back ON un-does "spara som dokument" with it.
   *
   * The two states are exclusive and the row can only be in one: a proposal
   * that is kept AND marked as a document would be booked as a purchase and
   * ALSO filed as a paper — the same receipt counted twice. Both the row's own
   * checkbox and the bulk action come through here for that reason.
   */
  const keepProposals = useCallback(
    (ids: string[], keep: boolean) => {
      const rejected = new Set(session.rejected);
      const savedAsDocument = { ...(session.savedAsDocument ?? {}) };
      for (const id of ids) {
        if (keep) {
          rejected.delete(id);
          delete savedAsDocument[id];
        } else {
          rejected.add(id);
        }
      }
      onChange({ ...session, rejected, savedAsDocument });
    },
    [session, onChange]
  );

  const handleToggle = useCallback(
    (proposalId: string, keep: boolean) => keepProposals([proposalId], keep),
    [keepProposals]
  );

  /**
   * "Det stämmer" — the person has looked at the warning and accepted the row.
   *
   * It does not edit anything and it does not hide the flag; it takes the row
   * out of "Behöver din blick" so the queue can actually reach zero. Before
   * this, the only way to silence a warning on a purchase you WANTED was to
   * switch that purchase off (Carl, 2026-09-03).
   */
  const handleAcknowledge = useCallback(
    (proposalId: string, ack: boolean) => {
      const acknowledged = new Set(session.acknowledged ?? []);
      if (ack) acknowledged.add(proposalId);
      else acknowledged.delete(proposalId);
      onChange({ ...session, acknowledged });
    },
    [session, onChange]
  );

  /**
   * "Inte ett inköp — spara som dokument."
   *
   * The row leaves the purchase list, and the FILE is filed instead. Both
   * halves matter: dropping the row alone loses the document, because a file
   * the reader turned into a purchase has no storage path until the order
   * uploads it at Genomför. Passing `null` puts the row back.
   */
  const handleSaveAsDocument = useCallback(
    (proposalId: string, type: DocumentType | null) => {
      const savedAsDocument = { ...(session.savedAsDocument ?? {}) };
      const rejected = new Set(session.rejected);
      if (type) {
        savedAsDocument[proposalId] = type;
        rejected.add(proposalId);
      } else {
        delete savedAsDocument[proposalId];
        rejected.delete(proposalId);
      }
      onChange({ ...session, rejected, savedAsDocument });
    },
    [session, onChange]
  );

  /**
   * Fold one reading into another as a further page of the same document.
   *
   * A receipt shot twice — page two, or a closer photo of the same paper — is
   * read twice and flagged as a duplicate. Deleting one loses a page of the
   * underlag; keeping both books the cost twice. Neither is what happened.
   * So the surviving order takes the other's file (and any pages IT had
   * already absorbed, or a second merge would drop them), and the merged row
   * leaves the list as a page rather than as something thrown away.
   */
  const handleMergePurchase = useCallback(
    (fromId: string, intoId: string) => {
      const from = session.proposals.find((p) => p.id === fromId);
      if (!from || from.action.type !== 'import_purchase') return;
      const fromAction = from.action;
      const pages = [
        ...(fromAction.attachmentKey
          ? [{ attachmentKey: fromAction.attachmentKey, fileName: fromAction.sourceFileName ?? from.sourceFile ?? '' }]
          : []),
        ...(fromAction.extraPages ?? []),
      ];
      if (pages.length === 0) return;

      const rejected = new Set(session.rejected);
      rejected.add(fromId);
      onChange({
        ...session,
        rejected,
        merged: { ...(session.merged ?? {}), [fromId]: intoId },
        proposals: session.proposals.map((p) => {
          if (p.id !== intoId || p.action.type !== 'import_purchase') return p;
          const existing = p.action.extraPages ?? [];
          const seen = new Set(existing.map((e) => e.attachmentKey));
          return {
            ...p,
            action: {
              ...p.action,
              extraPages: [...existing, ...pages.filter((pg) => !seen.has(pg.attachmentKey))],
            },
          };
        }),
      });
    },
    [session, onChange]
  );

  /**
   * Read the same image again.
   *
   * Worth a button because the reader is genuinely unstable on hard photos —
   * the same crumpled receipt has come back "Byggmax 2948 / 0,55" on one run
   * and "other / 0,05" on the next (s89). A second attempt is the cheapest
   * thing that can turn a 35 %-confidence row into a usable one, and it is
   * the only action here that can FIX a row rather than just accept it.
   *
   * The room, the note and the merged pages are the person's work, not the
   * model's — they survive the re-read untouched.
   */
  const [rereading, setRereading] = useState<Set<string>>(new Set());
  const handleReread = useCallback(
    async (proposalId: string) => {
      const proposal = session.proposals.find((p) => p.id === proposalId);
      if (!proposal || proposal.action.type !== 'import_purchase') return;
      const key = proposal.action.attachmentKey;
      const file = key ? peekAttachment(key) : null;
      if (!file) return;

      setRereading((s) => new Set(s).add(proposalId));
      try {
        const again = await captureDocument(file);
        if (again.kind !== 'receipt' && again.kind !== 'invoice') {
          toast.error(t('importReview.purchases.rereadFailed', 'Kunde inte läsa dokumentet bättre den här gången'));
          return;
        }
        patchProposal(proposalId, (action) => {
          if (action.type !== 'import_purchase') return action;
          return {
            ...again.action,
            // Everything below is the person's, not the reader's.
            attachmentKey: action.attachmentKey,
            extraPages: action.extraPages,
            sourceFileName: action.sourceFileName,
            userNote: action.userNote,
            roomId: action.roomId,
            roomName: action.roomName,
          };
        });
        toast.success(t('importReview.purchases.rereadDone', 'Läste om dokumentet'));
      } catch {
        toast.error(t('importReview.purchases.rereadFailed', 'Kunde inte läsa dokumentet bättre den här gången'));
      } finally {
        setRereading((s) => {
          const next = new Set(s);
          next.delete(proposalId);
          return next;
        });
      }
    },
    [session.proposals, patchProposal, t]
  );

  const handleRename = useCallback(
    (proposalId: string, name: string) => {
      patchProposal(proposalId, (action) =>
        action.type === 'create_room' ? { ...action, name } : action
      );
    },
    [patchProposal]
  );

  const handleMerge = useCallback(
    (proposalId: string, roomId: string | null) => {
      patchProposal(proposalId, (action) =>
        action.type === 'create_room'
          ? { ...action, mergeIntoRoomId: roomId ?? undefined }
          : action
      );
    },
    [patchProposal]
  );

  /**
   * A task's room target as a dropdown value. `roomId` means an existing room;
   * `roomName` means one this batch creates, matched by the name it will have.
   */
  const taskValue = useCallback(
    (action: CreateTaskAction): string => {
      if (action.roomId) return `existing:${action.roomId}`;
      if (!action.roomName) return NO_ROOM;
      const match = session.proposals.find(
        (p) =>
          p.action.type === 'create_room' &&
          (p.action as CreateRoomAction).name === action.roomName
      );
      return match ? `new:${match.id}` : NO_ROOM;
    },
    [session.proposals]
  );

  const handleAssign = useCallback(
    (proposalId: string, value: string) => {
      patchProposal(proposalId, (action) => {
        if (action.type !== 'create_task') return action;
        if (value === NO_ROOM) {
          return { ...action, roomId: undefined, roomName: undefined };
        }
        if (value.startsWith('existing:')) {
          return { ...action, roomId: value.slice('existing:'.length), roomName: undefined };
        }
        const target = session.proposals.find((p) => p.id === value.slice('new:'.length));
        const name = target ? (target.action as CreateRoomAction).name : undefined;
        return { ...action, roomId: undefined, roomName: name };
      });
    },
    [patchProposal, session.proposals]
  );

  const handleDrawingChoice = useCallback(
    (proposalId: string, choice: DrawingChoice) => {
      const rejected = new Set(session.rejected);
      // "Only file it" is the same thing as not applying the proposal.
      if (choice === 'fileOnly') rejected.add(proposalId);
      else rejected.delete(proposalId);
      onChange({
        ...session,
        rejected,
        drawings: session.drawings.map((d) =>
          d.proposalId === proposalId ? { ...d, choice } : d
        ),
      });
    },
    [session, onChange]
  );

  const handleTargetPlan = useCallback(
    (proposalId: string, planId: string) => {
      onChange({
        ...session,
        drawings: session.drawings.map((d) =>
          d.proposalId === proposalId ? { ...d, targetPlanId: planId } : d
        ),
      });
    },
    [session, onChange]
  );

  const describeFile = useCallback(
    (file: ImportFileRow): string => {
      if (file.kind === 'alreadyImported') {
        return t('importReview.files.alreadyImportedRow', 'Redan importerad tidigare');
      }
      if (file.kind === 'homePaper') {
        return t('importReview.files.homePaperRow', 'Handlar om bostaden');
      }
      if (file.kind === 'filed') {
        return t('importReview.files.filedRow', 'Sparad, rör inget i projektet');
      }
      const own = session.proposals.filter((p) => file.proposalIds.includes(p.id));
      const rooms = own.filter((p) => p.action.type === 'create_room').length;
      const tasks = own.filter((p) => p.action.type === 'create_task').length;
      const purchases = own.filter((p) => p.action.type === 'import_purchase').length;
      const sketches = own.filter((p) => p.action.type === 'create_plan_sketch').length;
      const parts = [
        rooms > 0 ? t('importReview.files.nRooms', '{{count}} rum', { count: rooms }) : null,
        tasks > 0 ? t('importReview.files.nTasks', '{{count}} arbeten', { count: tasks }) : null,
        purchases > 0 ? t('importReview.files.nPurchases', '{{count}} inköp', { count: purchases }) : null,
        sketches > 0 ? t('importReview.files.drawing', 'Ritning') : null,
      ].filter(Boolean);
      return parts.length > 0
        ? parts.join(' · ')
        : t('importReview.files.nothing', 'Inget nytt');
    },
    [session.proposals, t]
  );

  /**
   * Move one file to another folder in Files. Recorded on the row and carried
   * out on accept, so nothing in storage changes while the person is still
   * making up their mind.
   */
  const handleMoveFile = useCallback(
    (fileId: string, folder: string) => {
      onChange({
        ...session,
        files: session.files.map((f) =>
          f.id === fileId ? { ...f, targetFolder: folder } : f
        ),
      });
    },
    [session, onChange]
  );

  const rows = useMemo(() => buildPurchaseRows(session), [session]);
  const shownRows = useMemo(() => filterRows(rows, filter, query), [rows, filter, query]);
  const total = changeCount(session);

  const filterCounts: Record<PurchaseFilter, number> = useMemo(
    () => ({
      all: rows.length,
      needsLook: rows.filter((r) => r.needsLook).length,
      noRoom: rows.filter((r) => !r.roomId).length,
      dropped: rows.filter((r) => !r.kept).length,
    }),
    [rows]
  );

  /**
   * Clicking a purchase row shows ITS receipt. The file has no storage path
   * yet (the order owns it on accept), but it is right there in the attachment
   * registry — "check my reading against the image" must not have to wait for
   * the apply (Carl, 2026-09-01).
   */
  const selectedRow = rows.find((r) => r.id === selectedPurchaseId) ?? null;
  const selectedAttachment = useMemo(() => {
    if (selectedRow) {
      const file = peekAttachment(selectedRow.action.attachmentKey);
      return file ? { file, label: selectedRow.vendor } : null;
    }
    // The SAME receipt, reached from the Files tab instead of the purchase.
    // A file the reader turned into an order has no storage path until accept,
    // so without this the preview said "the file could not be saved to Files"
    // about a file that is sitting in memory two panes away — and it said it
    // about exactly the 39 files that worked (Carl, 2026-09-03). The order
    // owns the bytes; find the order that came from this file and borrow them.
    if (!selectedFile) return null;
    const owner = rows.find((r) => r.action.sourceFileName === selectedFile.name);
    const file = owner ? peekAttachment(owner.action.attachmentKey) : null;
    return file ? { file, label: owner?.vendor ?? selectedFile.name } : null;
  }, [selectedRow, selectedFile, rows]);

  const handleSelectPurchase = useCallback((proposalId: string) => {
    setSelectedFileId(null);
    setSelectedPurchaseId((prev) => (prev === proposalId ? null : proposalId));
    setPreviewOpen(true);
  }, []);

  const handleSelectFile = useCallback((file: ImportFileRow) => {
    setSelectedPurchaseId(null);
    setSelectedFileId(file.id);
    setPreviewOpen(true);
  }, []);

  /** Point a purchase (and its unassigned lines) at one of the project's rooms. */
  const handlePurchaseRoom = useCallback(
    (proposalId: string, value: string) => {
      patchProposal(proposalId, (action) => {
        if (action.type !== 'import_purchase') return action;
        if (value === NO_ROOM) return { ...action, roomId: null, roomName: null };
        const room = session.existingRooms.find((r) => r.id === value.slice('existing:'.length));
        return { ...action, roomId: room?.id ?? null, roomName: room?.name ?? null };
      });
    },
    [patchProposal, session.existingRooms]
  );

  /**
   * One corrected field, written straight back onto the proposal.
   *
   * A rejected value leaves the old one standing rather than blanking it: a
   * typo in an amount must not silently zero a receipt.
   */
  const handleField = useCallback(
    (proposalId: string, field: PurchaseField, raw: string) => {
      patchProposal(proposalId, (action) => {
        if (action.type !== 'import_purchase') return action;
        const num = () => Number(raw.replace(/\s/g, '').replace(',', '.'));
        switch (field) {
          case 'vendorName':
            return { ...action, vendorName: raw.trim() || action.vendorName };
          case 'total': {
            const v = num();
            return Number.isFinite(v) && v > 0 ? { ...action, total: v } : action;
          }
          case 'vatAmount': {
            if (!raw.trim()) return { ...action, vatAmount: null };
            const v = num();
            return Number.isFinite(v) && v >= 0 ? { ...action, vatAmount: v } : action;
          }
          case 'documentDate':
            return { ...action, documentDate: raw || action.documentDate };
          case 'invoiceNumber':
            return { ...action, invoiceNumber: raw.trim() || null };
          default:
            return action;
        }
      });
    },
    [patchProposal]
  );

  /**
   * Bulk only ever touches what the current filter SHOWS. A bulk action that
   * silently reached rows scrolled out of view would be the fastest way to
   * lose trust in this screen.
   */
  const handleBulk = useCallback(
    (keep: boolean) => keepProposals(shownRows.map((r) => r.id), keep),
    [keepProposals, shownRows]
  );

  /**
   * Promote an unread file to a purchase the person fills in themselves.
   * Creates an EMPTY proposal (no invented amounts) opened straight into the
   * inline editor — the app must never guess money it did not read.
   */
  const handleLiftToPurchase = useCallback(
    (file: ImportFileRow) => {
      const id = `lift-${file.id}`;
      if (session.proposals.some((p) => p.id === id)) {
        setActiveTab('purchases');
        setSelectedPurchaseId(id);
        return;
      }
      const proposal: AgentProposal = {
        id,
        summary: t('importReview.files.liftedSummary', 'Inköp från {{file}}', { file: file.name }),
        confidence: 1,
        sourceFile: file.name,
        action: {
          type: 'import_purchase',
          documentType: 'receipt',
          vendorName: '',
          total: 0,
          lineItems: [],
        },
      };
      onChange({ ...session, proposals: [...session.proposals, proposal] });
      setActiveTab('purchases');
      setFilter('all');
      setSelectedPurchaseId(id);
    },
    [session, onChange, t]
  );

  /**
   * Name a room from a purchase row. Adds a create_room PROPOSAL and points
   * this purchase at it — nothing is written until Genomför, same as every
   * other decision here. Applying rooms before purchases is already the
   * order applyProposals uses, so the room exists by the time the order lands.
   */
  const handleCreateRoomForPurchase = useCallback(
    (purchaseId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const roomProposal: AgentProposal = {
        id: `room-${purchaseId}`,
        summary: t('importReview.purchases.createdRoom', 'Skapa rummet {{name}}', { name: trimmed }),
        confidence: 1,
        action: { type: 'create_room', name: trimmed },
      };
      onChange({
        ...session,
        proposals: [
          ...session.proposals.filter((p) => p.id !== roomProposal.id),
          roomProposal,
        ].map((p) =>
          p.id === purchaseId && p.action.type === 'import_purchase'
            ? { ...p, action: { ...p.action, roomId: null, roomName: trimmed } }
            : p
        ),
      });
    },
    [session, onChange, t]
  );

  /* ── Second opinion (CSV from another model) ─────────────────────────── */

  const matchTargets: MatchTarget[] = useMemo(
    () =>
      rows.map((r) => ({
        id: r.id,
        vendor: r.vendor,
        total: r.total,
        date: r.date,
        docNumber: r.invoiceNumber,
        vat: r.vatAmount,
      })),
    [rows]
  );

  /** Take one value from the file. Goes through the SAME path as a typed
   *  correction, so it is nothing more privileged than the person typing it. */
  const handleAdopt = useCallback(
    (targetId: string, diff: FieldDiff) => {
      const field: PurchaseField | null =
        diff.field === 'docNumber'
          ? 'invoiceNumber'
          : diff.field === 'vendor'
            ? 'vendorName'
            : diff.field === 'date'
              ? 'documentDate'
              : diff.field === 'total'
                ? 'total'
                : diff.field === 'vat'
                  ? 'vatAmount'
                  : null;
      if (!field) return;
      handleField(targetId, field, String(diff.theirs ?? ''));
    },
    [handleField]
  );

  /** A row only the file has. Created EMPTY of anything it did not state —
   *  the file is evidence, not a source of truth. */
  const handleLiftCsvRow = useCallback(
    (row: CsvRow) => {
      const id = `csv-${row.line}`;
      if (session.proposals.some((p) => p.id === id)) return;
      const proposal: AgentProposal = {
        id,
        summary: t('secondOpinion.fromFile', 'Inköp från jämförelsefilen'),
        confidence: 0.5,
        action: {
          type: 'import_purchase',
          documentType: 'receipt',
          vendorName: row.vendor ?? '',
          total: row.total ?? 0,
          vatAmount: row.vat,
          documentDate: row.date,
          invoiceNumber: row.docNumber,
          lineItems: [],
        },
      };
      onChange({ ...session, proposals: [...session.proposals, proposal] });
      setActiveTab('purchases');
      setSelectedPurchaseId(id);
    },
    [session, onChange, t]
  );

  /**
   * Offered, never forced — and only where it pays for itself. Checking a
   * handful of rows by eye is quicker than running them through a second
   * model; at thirty it is the other way round.
   */
  const BULK_THRESHOLD = 20;
  const worthSecondOpinion = rows.length >= BULK_THRESHOLD;

  const roomTaskCount =
    session.proposals.filter((p) =>
      ['create_room', 'create_task', 'create_plan_sketch'].includes(p.action.type)
    ).length;

  const tabs: MultiSectionTab[] = [
    {
      id: 'purchases',
      label: t('importReview.tab.purchases', 'Inköp'),
      count: rows.length,
      alert: filterCounts.needsLook,
    },
    {
      id: 'rooms',
      label: t('importReview.tab.rooms', 'Rum & arbeten'),
      count: roomTaskCount,
      alert: session.proposals.filter(
        (p) => p.duplicateOfExisting && p.action.type !== 'import_purchase'
      ).length,
    },
    {
      id: 'files',
      label: t('importReview.tab.files', 'Filer'),
      count: session.files.length,
      alert: session.outcome.unreadableCount,
    },
  ];

  const keptRows = rows.filter((r) => r.kept);
  const documentRows = rows.filter((r) => r.savedAsDocument);
  const keptSum = keptRows.reduce((s, r) => s + r.total, 0);

  const toolbar =
    activeTab === 'purchases' ? (
      <PurchaseToolbar
        query={query}
        onQuery={setQuery}
        filter={filter}
        onFilter={setFilter}
        counts={filterCounts}
        shownCount={shownRows.length}
        onBulk={handleBulk}
      />
    ) : undefined;

  const secondOpinionBar =
    activeTab === 'purchases' && worthSecondOpinion && !secondOpinionOpen ? (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-xs">
        <span className="min-w-0 text-muted-foreground">
          {t(
            'secondOpinion.offer',
            'Många kvitton på en gång. Vill du dubbelkolla dem mot en tolkning från en annan AI?'
          )}
        </span>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSecondOpinionOpen(true)}>
          {t('secondOpinion.open', 'Jämför med en fil')}
        </Button>
      </div>
    ) : null;

  const footer =
    activeTab === 'purchases' ? (
      <>
        <span>
          {t('importReview.purchases.tally', '{{kept}} av {{total}} inköp tas med', {
            kept: keptRows.length,
            total: rows.length,
          })}
          {/* Papers rescued from rows that were not purchases — otherwise the
              tally reads as "17 of 39" with no account of the other 22. */}
          {documentRows.length > 0 && (
            <>
              {' · '}
              {t('importReview.purchases.tallyDocuments', '{{count}} sparas som dokument', {
                count: documentRows.length,
              })}
            </>
          )}
        </span>
        <span className="font-mono tabular-nums">
          {keptSum.toLocaleString(i18n.language, { maximumFractionDigits: 0 })} kr
        </span>
      </>
    ) : activeTab === 'files' ? (
      <ImportFilingSection session={session} variant="footer" />
    ) : undefined;

  /** A note the person writes on a receipt; carried into the order's description. */
  const handleComment = useCallback(
    (text: string) => {
      if (!selectedPurchaseId) return;
      patchProposal(selectedPurchaseId, (action) =>
        action.type === 'import_purchase' ? { ...action, userNote: text || undefined } : action
      );
    },
    [patchProposal, selectedPurchaseId]
  );

  const previewKey = selectedPurchaseId ?? selectedFileId ?? '';

  const preview = (
    <ImportPreview
      file={selectedFile}
      attachment={selectedAttachment}
      comment={selectedRow?.action.userNote ?? ''}
      onComment={selectedRow ? handleComment : undefined}
      rotation={rotations[previewKey]}
      onRotation={(deg) => setRotations((r) => ({ ...r, [previewKey]: deg }))}
    />
  );

  const body = (
    <MultiSection
      title={t('importReview.panelTitle', 'Vad jag tror att filerna är')}
      hint={t(
        'importReview.panelHint',
        'Klicka på en rad för att se bilden bredvid. Bockar du ur en rad tas varken inköpet eller bilden in i projektet.'
      )}
      tabs={tabs}
      active={activeTab}
      onTab={setActiveTab}
      toolbar={toolbar}
      footer={footer}
      className={isMobile ? 'min-h-[60vh]' : 'h-[calc(100vh-19rem)]'}
    >
      {activeTab === 'purchases' && (
        <PurchaseList
          rows={shownRows}
          session={session}
          selectedId={selectedPurchaseId}
          linkedIds={highlightedIds}
          onSelect={handleSelectPurchase}
          onToggle={handleToggle}
          onRoom={handlePurchaseRoom}
          onField={handleField}
          onCreateRoom={handleCreateRoomForPurchase}
          onMerge={handleMergePurchase}
          onAcknowledge={handleAcknowledge}
          onReread={handleReread}
          onSaveAsDocument={handleSaveAsDocument}
          rereading={rereading}
        />
      )}
      {activeTab === 'rooms' && (
        <div className="space-y-6 p-3">
          <ImportRoomsSection
            session={session}
            highlightedIds={highlightedIds}
            onRename={handleRename}
            onMerge={handleMerge}
            onToggle={handleToggle}
          />
          <ImportTasksSection
            session={session}
            highlightedIds={highlightedIds}
            onAssign={handleAssign}
            onToggle={handleToggle}
            valueFor={taskValue}
          />
          <ImportDrawingsSection
            session={session}
            onChoice={handleDrawingChoice}
            onTargetPlan={handleTargetPlan}
          />
        </div>
      )}
      {activeTab === 'files' && (
        <div className="p-3">
          <ImportFilesPane
            session={session}
            selectedFileId={selectedFileId}
            onSelectFile={handleSelectFile}
            describeFile={describeFile}
            onMoveFile={handleMoveFile}
            onLiftToPurchase={handleLiftToPurchase}
          />
        </div>
      )}
    </MultiSection>
  );

  return (
    // `container py-…` is the app's page frame (see CLAUDE.md "Sidlayout").
    <div className="container space-y-4 py-4 md:py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="font-display text-2xl font-normal tracking-tight">
            {t('importReview.title', 'Stäm av importen')}
          </h1>
          <p className="max-w-[62ch] text-sm text-muted-foreground">
            {t(
              'importReview.leadV2',
              'Jag läste igenom mappen och gissade vad varje fil är. Titta igenom förslagen, rätta det som blev fel och bocka ur det som inte hör hemma.'
            )}{' '}
            <strong className="font-semibold text-foreground">
              {t('importReview.leadNothingYet', 'Ingenting läggs in i projektet förrän du trycker Genomför.')}
            </strong>
          </p>
        </div>
        <div className="w-full max-w-[34ch] shrink-0 space-y-0.5 text-right text-xs text-muted-foreground sm:w-auto">
          <p className="font-mono">
            {t('importReview.statFiles', '{{files}} filer lästa', { files: session.outcome.filesRead })}
            {session.outcome.modelCalls?.total > 0 && (
              <span title={describeModelCalls(session.outcome.modelCalls)}>
                {' · '}
                {t('importReview.statCalls', '{{calls}} AI-anrop', {
                  calls: session.outcome.modelCalls.total,
                })}
              </span>
            )}
          </p>
          {(session.outcome.alreadyImportedNames?.length ?? 0) > 0 && (
            <p>
              {t('importReview.leadSkipped', '{{count}} filer kände jag igen sedan tidigare och hoppade över helt.', {
                count: session.outcome.alreadyImportedNames?.length ?? 0,
              })}
            </p>
          )}
          {/* A document cut off for length is the one case where a room that is
              MISSING looks exactly like a room that was never there. */}
          {session.outcome.truncatedDocCount > 0 && (
            <p className="text-amber-700 dark:text-amber-500">
              {t('importReview.truncatedDocs', {
                count: session.outcome.truncatedDocCount,
                defaultValue:
                  '{{count}} dokument var så långa att jag bara hann läsa början — kolla att inget rum saknas.',
              })}
            </p>
          )}
          {session.outcome.unreadableCount > 0 && (
            <p className="text-rose-700 dark:text-rose-400">
              {t('importReview.statUnreadable', '{{count}} filer gick inte att läsa', {
                count: session.outcome.unreadableCount,
              })}
            </p>
          )}
        </div>
      </header>

      {secondOpinionBar}
      {secondOpinionOpen && (
        <SecondOpinionPanel
          targets={matchTargets}
          onAdopt={handleAdopt}
          onLift={handleLiftCsvRow}
          onClose={() => setSecondOpinionOpen(false)}
        />
      )}

      {isMobile ? (
        <>
          {body}
          {/* The preview is a bottom sheet on mobile: a phone cannot hold the
              list and the document side by side, and the list is where the
              decisions are made. */}
          <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
            <SheetContent side="bottom" className="h-[84vh] overflow-y-auto">
              <SheetHeader className="text-left">
                <SheetTitle className="text-base">
                  {selectedRow?.vendor ?? selectedFile?.name ?? t('importReview.preview.title', 'Dokumentet')}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-3">{preview}</div>
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,47fr)_minmax(0,53fr)]">
          {body}
          <div className="min-w-0">{preview}</div>
        </div>
      )}

      <footer className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-2 border-t bg-background/95 py-3 backdrop-blur">
        <p className="text-xs text-muted-foreground">
          {t('importReview.filesSafe', 'Filerna är redan sparade i Filer — avbryter du händer ingenting mer.')}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={applying}>
            {t('common.cancel', 'Avbryt')}
          </Button>
          <Button onClick={() => onApply(session)} disabled={applying || total === 0}>
            {applying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('importReview.apply', 'Genomför ({{count}})', { count: total })}
          </Button>
        </div>
      </footer>
    </div>
  );
}
