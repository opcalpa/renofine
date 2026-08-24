import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { AgentProposal, ProposalAction } from '@/services/agent/types';
import type { ImportSession } from '@/services/agent/importSession';
import { assignableRooms, taskProposals } from '@/services/agent/importSession';

/**
 * The work the import wants to add, and which room each piece lands in.
 *
 * Moving a task between rooms is half the reconciliation: when `Badrum 1` folds
 * into `Badrum`, its tiling job has to follow. The dropdown lists the rooms that
 * exist plus the ones this batch will create, so nothing can be assigned to a
 * room that will not be there afterwards.
 */

type CreateTaskAction = Extract<ProposalAction, { type: 'create_task' }>;

const NO_ROOM = '__none__';

interface ImportTasksSectionProps {
  session: ImportSession;
  highlightedIds: Set<string>;
  onAssign: (proposalId: string, value: string) => void;
  onToggle: (proposalId: string, keep: boolean) => void;
  /** The dropdown value for a task's current room target. */
  valueFor: (action: CreateTaskAction) => string;
}

export function ImportTasksSection({
  session,
  highlightedIds,
  onAssign,
  onToggle,
  valueFor,
}: ImportTasksSectionProps) {
  const { t } = useTranslation();
  const proposals = taskProposals(session);
  const rooms = assignableRooms(session);

  if (proposals.length === 0) return null;

  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium">{t('importReview.tasks.title', 'Arbeten')}</h3>
        <span className="text-xs text-muted-foreground">
          {t('importReview.tasks.count', '{{count}} st', {
            count: proposals.filter((p) => !session.rejected.has(p.id)).length,
          })}
        </span>
      </header>

      <ul className="space-y-1.5">
        {proposals.map((proposal) => (
          <TaskRow
            key={proposal.id}
            proposal={proposal}
            rooms={rooms}
            dropped={session.rejected.has(proposal.id)}
            highlighted={highlightedIds.has(proposal.id)}
            value={valueFor(proposal.action as CreateTaskAction)}
            onAssign={onAssign}
            onToggle={onToggle}
          />
        ))}
      </ul>
    </section>
  );
}

function TaskRow({
  proposal,
  rooms,
  dropped,
  highlighted,
  value,
  onAssign,
  onToggle,
}: {
  proposal: AgentProposal;
  rooms: Array<{ value: string; label: string; isNew: boolean }>;
  dropped: boolean;
  highlighted: boolean;
  value: string;
} & Pick<ImportTasksSectionProps, 'onAssign' | 'onToggle'>) {
  const { t } = useTranslation();
  const action = proposal.action as CreateTaskAction;

  return (
    <li
      className={cn(
        'flex items-center gap-2 rounded-lg border p-2',
        dropped && 'opacity-50',
        highlighted && 'ring-2 ring-primary/40'
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm" title={action.title}>
          {action.title}
        </p>
        {proposal.sourceFile && (
          <p className="truncate text-[11px] text-muted-foreground" title={proposal.sourceFile}>
            {t('importReview.fromFile', 'Från {{file}}', { file: proposal.sourceFile })}
          </p>
        )}
      </div>

      <Select value={value} onValueChange={(v) => onAssign(proposal.id, v)} disabled={dropped}>
        <SelectTrigger className="h-8 w-[46%] shrink-0 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_ROOM}>{t('importReview.tasks.noRoom', 'Inget rum')}</SelectItem>
          {rooms.map((room) => (
            <SelectItem key={room.value} value={room.value}>
              {room.isNew
                ? t('importReview.tasks.newRoomOption', '{{name}} (nytt)', { name: room.label })
                : room.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 shrink-0 p-0"
        onClick={() => onToggle(proposal.id, dropped)}
        aria-label={dropped ? t('importReview.restore', 'Ta med igen') : t('importReview.remove', 'Ta bort')}
      >
        {dropped ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
      </Button>
    </li>
  );
}
