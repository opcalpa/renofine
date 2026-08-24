import { useTranslation } from 'react-i18next';
import { Check, Home, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { roomProposals } from '@/services/agent/importSession';

/**
 * The rooms this import wants to create, against the rooms that already exist.
 *
 * This is where Carl's five phantom bathrooms get settled. The matcher already
 * removed the certain duplicates; what is left here is the genuinely uncertain
 * — `WC` next to `Gäst WC` — plus everything new. Each row can become a room,
 * fold into an existing one, or be dropped entirely.
 *
 * Existing rooms are listed too, greyed out. Seeing "you already have Badrum"
 * is what makes a proposed second one obviously wrong.
 */

type CreateRoomAction = Extract<ProposalAction, { type: 'create_room' }>;

const NEW_ROOM = '__new__';

interface ImportRoomsSectionProps {
  session: ImportSession;
  highlightedIds: Set<string>;
  onRename: (proposalId: string, name: string) => void;
  onMerge: (proposalId: string, roomId: string | null) => void;
  onToggle: (proposalId: string, keep: boolean) => void;
}

export function ImportRoomsSection({
  session,
  highlightedIds,
  onRename,
  onMerge,
  onToggle,
}: ImportRoomsSectionProps) {
  const { t } = useTranslation();
  const proposals = roomProposals(session);

  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium">{t('importReview.rooms.title', 'Rum')}</h3>
        <span className="text-xs text-muted-foreground">
          {t('importReview.rooms.count', '{{count}} nya', { count: proposals.filter((p) => !session.rejected.has(p.id)).length })}
        </span>
      </header>

      {session.existingRooms.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-2">
          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            {t('importReview.rooms.existing', 'Finns redan i projektet')}
          </p>
          <div className="flex flex-wrap gap-1">
            {session.existingRooms.map((room) => (
              <Badge key={room.id} variant="secondary" className="gap-1 text-xs font-normal">
                <Home className="h-3 w-3" />
                {room.name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {proposals.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t('importReview.rooms.none', 'Inga nya rum — allt mappen nämnde finns redan.')}
        </p>
      ) : (
        <ul className="space-y-2">
          {proposals.map((proposal) => (
            <RoomRow
              key={proposal.id}
              session={session}
              proposal={proposal}
              highlighted={highlightedIds.has(proposal.id)}
              onRename={onRename}
              onMerge={onMerge}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function RoomRow({
  session,
  proposal,
  highlighted,
  onRename,
  onMerge,
  onToggle,
}: {
  session: ImportSession;
  proposal: AgentProposal;
  highlighted: boolean;
} & Pick<ImportRoomsSectionProps, 'onRename' | 'onMerge' | 'onToggle'>) {
  const { t } = useTranslation();
  const action = proposal.action as CreateRoomAction;
  const dropped = session.rejected.has(proposal.id);
  const mergedInto = action.mergeIntoRoomId
    ? session.existingRooms.find((r) => r.id === action.mergeIntoRoomId)
    : undefined;
  const suggested = action.suggestedMergeRoomId
    ? session.existingRooms.find((r) => r.id === action.suggestedMergeRoomId)
    : undefined;

  return (
    <li
      className={cn(
        'rounded-lg border p-2 transition-colors',
        dropped && 'opacity-50',
        highlighted && 'ring-2 ring-primary/40'
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Input
            value={action.name}
            onChange={(e) => onRename(proposal.id, e.target.value)}
            disabled={dropped || !!action.mergeIntoRoomId}
            className="h-8 text-sm"
            aria-label={t('importReview.rooms.nameLabel', 'Rummets namn')}
          />

          <Select
            value={action.mergeIntoRoomId ?? NEW_ROOM}
            onValueChange={(value) => onMerge(proposal.id, value === NEW_ROOM ? null : value)}
            disabled={dropped}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NEW_ROOM}>
                {t('importReview.rooms.asNew', 'Skapa som nytt rum')}
              </SelectItem>
              {session.existingRooms.map((room) => (
                <SelectItem key={room.id} value={room.id}>
                  {t('importReview.rooms.mergeInto', '= {{name}} (finns redan)', { name: room.name })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex flex-wrap items-center gap-1.5">
            {proposal.sourceFile && (
              <span className="truncate text-[11px] text-muted-foreground" title={proposal.sourceFile}>
                {t('importReview.fromFile', 'Från {{file}}', { file: proposal.sourceFile })}
              </span>
            )}
            {mergedInto && (
              <Badge variant="outline" className="gap-1 text-[11px] font-normal">
                <Check className="h-3 w-3" />
                {t('importReview.rooms.willMerge', 'Slås ihop med {{name}}', { name: mergedInto.name })}
              </Badge>
            )}
            {!mergedInto && suggested && (
              <button
                type="button"
                onClick={() => onMerge(proposal.id, suggested.id)}
                className="rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground hover:border-solid hover:text-foreground"
              >
                {t('importReview.rooms.maybeSame', 'Är det här {{name}}?', { name: suggested.name })}
              </button>
            )}
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 shrink-0 p-0"
          onClick={() => onToggle(proposal.id, dropped)}
          aria-label={
            dropped
              ? t('importReview.restore', 'Ta med igen')
              : t('importReview.remove', 'Ta bort')
          }
          title={dropped ? t('importReview.restore', 'Ta med igen') : t('importReview.remove', 'Ta bort')}
        >
          {dropped ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
        </Button>
      </div>
    </li>
  );
}
