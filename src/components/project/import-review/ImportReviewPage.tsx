import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { peekAttachment } from '@/services/agent/documentCapture';
import { useIsMobile } from '@/hooks/use-mobile';
import type { AgentProposal, ProposalAction } from '@/services/agent/types';
import type {
  DrawingChoice,
  ImportFileRow,
  ImportSession,
} from '@/services/agent/importSession';
import { changeCount, purchaseProposals } from '@/services/agent/importSession';
import { actionDetails } from '@/components/agent/ConfirmDiff';
import { callsPerFile, describeModelCalls } from '@/lib/modelCalls';
import { ImportFilesPane } from './ImportFilesPane';
import { ImportPreview } from './ImportPreview';
import { ImportRoomsSection } from './ImportRoomsSection';
import { ImportTasksSection } from './ImportTasksSection';
import { ImportDrawingsSection } from './ImportDrawingsSection';
import { ImportFilingSection } from './ImportFilingSection';

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
  const { t } = useTranslation();
  const isMobile = useIsMobile();
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

  const handleToggle = useCallback(
    (proposalId: string, keep: boolean) => {
      const rejected = new Set(session.rejected);
      if (keep) rejected.delete(proposalId);
      else rejected.add(proposalId);
      onChange({ ...session, rejected });
    },
    [session, onChange]
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

  const purchases = purchaseProposals(session);
  const total = changeCount(session);

  /**
   * Clicking a purchase row shows ITS receipt in the preview pane. The file
   * has no storage path yet (the order owns it on accept), but it is right
   * there in the attachment registry — "check my reading against the image"
   * must not have to wait for the apply (Carl, 2026-09-01).
   */
  const selectedPurchase = purchases.find((p) => p.id === selectedPurchaseId) ?? null;
  const selectedAttachment = useMemo(() => {
    if (!selectedPurchase || selectedPurchase.action.type !== 'import_purchase') return null;
    const file = peekAttachment(selectedPurchase.action.attachmentKey);
    if (!file) return null;
    return { file, label: selectedPurchase.action.vendorName };
  }, [selectedPurchase]);

  const handleSelectPurchase = useCallback((proposalId: string) => {
    setSelectedFileId(null);
    setSelectedPurchaseId((prev) => (prev === proposalId ? null : proposalId));
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

  const filesPane = (
    <ImportFilesPane
      session={session}
      selectedFileId={selectedFileId}
      onSelectFile={(f) => {
        setSelectedPurchaseId(null);
        setSelectedFileId(f.id);
      }}
      describeFile={describeFile}
      onMoveFile={handleMoveFile}
    />
  );

  const reviewPane = (
    <div className="space-y-6">
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
      <ImportPurchases
        purchases={purchases}
        session={session}
        onToggle={handleToggle}
        highlightedIds={highlightedIds}
        selectedId={selectedPurchaseId}
        onSelect={handleSelectPurchase}
        onAssignRoom={handlePurchaseRoom}
      />
      <ImportDrawingsSection
        session={session}
        onChoice={handleDrawingChoice}
        onTargetPlan={handleTargetPlan}
      />
      <ImportFilingSection session={session} />
    </div>
  );

  return (
    // `container py-…` is the app's page frame (see CLAUDE.md "Sidlayout") —
    // this page shipped without it once and sat flush against the viewport.
    <div className="container space-y-4 py-4 md:py-8">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">
          {t('importReview.title', 'Stäm av importen')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t(
            'importReview.lead',
            'Jag läste {{files}} filer. Kolla att jag förstod dem rätt — särskilt rummen, som kan vara sådana du redan har.',
            { files: session.outcome.filesRead }
          )}
          {(session.outcome.alreadyImportedNames?.length ?? 0) > 0 && (
            <>
              {' '}
              {t(
                'importReview.leadSkipped',
                '{{count}} filer kände jag igen sedan tidigare och hoppade över helt.',
                { count: session.outcome.alreadyImportedNames?.length ?? 0 }
              )}
            </>
          )}
        </p>
        {/* A document cut off for length is the one case where a room that is
            MISSING looks exactly like a room that was never there. A toast
            disappears; this stays until the person has decided. */}
        {session.outcome.truncatedDocCount > 0 && (
          <p className="text-sm text-amber-700 dark:text-amber-500">
            {t('importReview.truncatedDocs', {
              count: session.outcome.truncatedDocCount,
              defaultValue:
                '{{count}} dokument var så långa att jag bara hann läsa början — kolla att inget rum saknas.',
            })}
          </p>
        )}
        {/* What the drop cost. Measured, not estimated — every claim about this
            pipeline getting cheaper was a guess until this number existed. The
            per-function breakdown sits in the tooltip so the headline stays
            readable. */}
        {session.outcome.modelCalls?.total > 0 && (
          <p
            className="text-xs text-muted-foreground"
            title={describeModelCalls(session.outcome.modelCalls)}
          >
            {t('importReview.modelCalls', 'Det kostade {{calls}} AI-anrop ({{perFile}} per fil).', {
              calls: session.outcome.modelCalls.total,
              perFile: callsPerFile(session.outcome.modelCalls, session.outcome.filesRead) ?? 0,
            })}
          </p>
        )}
      </header>

      {isMobile ? (
        <Tabs defaultValue="review">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="review">{t('importReview.tab.review', 'Blir i projektet')}</TabsTrigger>
            <TabsTrigger value="files">{t('importReview.tab.files', 'Filer')}</TabsTrigger>
          </TabsList>
          <TabsContent value="review" className="mt-4">
            {reviewPane}
          </TabsContent>
          <TabsContent value="files" className="mt-4 space-y-4">
            <ImportPreview file={selectedFile} attachment={selectedAttachment} />
            {filesPane}
          </TabsContent>
        </Tabs>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(0,1.2fr)_minmax(280px,1fr)]">
          <div className="max-h-[70vh] overflow-y-auto rounded-lg border p-3">{filesPane}</div>
          <ImportPreview file={selectedFile} attachment={selectedAttachment} />
          <div className="max-h-[70vh] overflow-y-auto rounded-lg border p-3">{reviewPane}</div>
        </div>
      )}

      <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t bg-background/95 py-3 backdrop-blur">
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

/** Receipts and invoices — same presentation ConfirmDiff already uses. */
function ImportPurchases({
  purchases,
  session,
  onToggle,
  highlightedIds,
  selectedId,
  onSelect,
  onAssignRoom,
}: {
  purchases: AgentProposal[];
  session: ImportSession;
  onToggle: (id: string, keep: boolean) => void;
  highlightedIds: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAssignRoom: (id: string, value: string) => void;
}) {
  const { t, i18n } = useTranslation();
  if (purchases.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="space-y-0.5">
        <h3 className="text-sm font-medium">{t('importReview.purchases.title', 'Inköp')}</h3>
        <p className="text-xs text-muted-foreground">
          {t(
            'importReview.purchases.hint',
            'Klicka på en rad för att se kvittot i mitten. Bockar du ur en rad tas varken inköpet eller bilden in i projektet.',
          )}
        </p>
      </div>
      <ul className="space-y-1.5">
        {purchases.map((proposal) => {
          const dropped = session.rejected.has(proposal.id);
          const action = proposal.action.type === 'import_purchase' ? proposal.action : null;
          // actionDetails takes the narrow (key, fallback, opts) shape that
          // i18next's TFunction satisfies at runtime but not structurally.
          const details = actionDetails(
            proposal.action,
            t as unknown as (key: string, fallback?: string, opts?: Record<string, unknown>) => string,
            i18n.language,
          );
          return (
            <li
              key={proposal.id}
              // The row is the preview trigger; the checkbox and the room
              // select stop propagation so deciding is not also selecting.
              onClick={() => onSelect(proposal.id)}
              className={`cursor-pointer rounded-lg border p-2 transition-colors hover:bg-muted/40 ${
                dropped ? 'opacity-50' : ''
              } ${
                selectedId === proposal.id
                  ? 'ring-2 ring-primary/60'
                  : highlightedIds.has(proposal.id)
                    ? 'ring-2 ring-primary/40'
                    : ''
              }`}
            >
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={!dropped}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onToggle(proposal.id, e.target.checked)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">{proposal.summary}</span>
                  {proposal.duplicateOfExisting && (
                    <span className="block text-[11px] text-amber-600">
                      {t('importReview.duplicatePurchase', 'Redan bokförd — samma leverantör och fakturanummer')}
                    </span>
                  )}
                  {details.length > 0 && (
                    <span className="block text-[11px] text-muted-foreground">
                      {details.join(' · ')}
                    </span>
                  )}
                  {action && !dropped && session.existingRooms.length > 0 && (
                    <span className="mt-1.5 block" onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={action.roomId ? `existing:${action.roomId}` : NO_ROOM}
                        onValueChange={(value) => onAssignRoom(proposal.id, value)}
                      >
                        <SelectTrigger className="h-7 w-full max-w-[220px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_ROOM}>
                            {t('importReview.purchases.noRoom', 'Inget rum')}
                          </SelectItem>
                          {session.existingRooms.map((room) => (
                            <SelectItem key={room.id} value={`existing:${room.id}`}>
                              {room.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </span>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
