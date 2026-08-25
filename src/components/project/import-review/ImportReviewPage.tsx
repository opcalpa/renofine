import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIsMobile } from '@/hooks/use-mobile';
import type { AgentProposal, ProposalAction } from '@/services/agent/types';
import type {
  DrawingChoice,
  ImportFileRow,
  ImportSession,
} from '@/services/agent/importSession';
import { changeCount, purchaseProposals } from '@/services/agent/importSession';
import { actionDetails } from '@/components/agent/ConfirmDiff';
import { ImportFilesPane } from './ImportFilesPane';
import { ImportPreview } from './ImportPreview';
import { ImportRoomsSection } from './ImportRoomsSection';
import { ImportTasksSection } from './ImportTasksSection';
import { ImportDrawingsSection } from './ImportDrawingsSection';

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

  const purchases = purchaseProposals(session);
  const total = changeCount(session);

  const filesPane = (
    <ImportFilesPane
      session={session}
      selectedFileId={selectedFileId}
      onSelectFile={(f) => setSelectedFileId(f.id)}
      describeFile={describeFile}
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
      />
      <ImportDrawingsSection
        session={session}
        onChoice={handleDrawingChoice}
        onTargetPlan={handleTargetPlan}
      />
    </div>
  );

  return (
    <div className="space-y-4">
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
            <ImportPreview file={selectedFile} />
            {filesPane}
          </TabsContent>
        </Tabs>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(0,1.2fr)_minmax(280px,1fr)]">
          <div className="max-h-[70vh] overflow-y-auto rounded-lg border p-3">{filesPane}</div>
          <ImportPreview file={selectedFile} />
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
}: {
  purchases: AgentProposal[];
  session: ImportSession;
  onToggle: (id: string, keep: boolean) => void;
  highlightedIds: Set<string>;
}) {
  const { t, i18n } = useTranslation();
  if (purchases.length === 0) return null;

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">{t('importReview.purchases.title', 'Inköp')}</h3>
      <ul className="space-y-1.5">
        {purchases.map((proposal) => {
          const dropped = session.rejected.has(proposal.id);
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
              className={`rounded-lg border p-2 ${dropped ? 'opacity-50' : ''} ${
                highlightedIds.has(proposal.id) ? 'ring-2 ring-primary/40' : ''
              }`}
            >
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={!dropped}
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
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
