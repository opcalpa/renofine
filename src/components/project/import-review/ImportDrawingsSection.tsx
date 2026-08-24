import { useTranslation } from 'react-i18next';
import { Layers, PenLine, FolderInput } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { DrawingChoice, ImportDrawing, ImportSession } from '@/services/agent/importSession';

/**
 * What to do with each drawing the folder contained.
 *
 * The app used to have one answer — trace it — and Carl's drawings came back as
 * three rooms bearing no resemblance to the flat, with no way to say "just put
 * the picture under the canvas and I'll draw it myself". That is usually the
 * honest option: a vision pass reads a clean architectural PDF well and a
 * photographed sketch badly, and only the person holding it knows which they
 * have.
 *
 * So all three answers are offered, and the default leans safe: a project that
 * already has a drawn plan gets the image as a layer rather than a second,
 * conflicting set of walls.
 */

const CHOICES: Array<{
  value: DrawingChoice;
  icon: typeof Layers;
  labelKey: string;
  fallback: string;
  hintKey: string;
  hintFallback: string;
}> = [
  {
    value: 'layer',
    icon: Layers,
    labelKey: 'importReview.drawings.layer',
    fallback: 'Lägg som lager',
    hintKey: 'importReview.drawings.layerHint',
    hintFallback: 'Bilden hamnar under canvasen — du ritar rummen ovanpå själv.',
  },
  {
    value: 'trace',
    icon: PenLine,
    labelKey: 'importReview.drawings.trace',
    fallback: 'Rita ut åt mig',
    hintKey: 'importReview.drawings.traceHint',
    hintFallback: 'Väggar och rum ritas automatiskt. Blir sällan exakt — bra på rena ritningar.',
  },
  {
    value: 'fileOnly',
    icon: FolderInput,
    labelKey: 'importReview.drawings.fileOnly',
    fallback: 'Bara spara i Filer',
    hintKey: 'importReview.drawings.fileOnlyHint',
    hintFallback: 'Rör inte planritaren alls.',
  },
];

interface ImportDrawingsSectionProps {
  session: ImportSession;
  onChoice: (proposalId: string, choice: DrawingChoice) => void;
  onTargetPlan: (proposalId: string, planId: string) => void;
}

export function ImportDrawingsSection({ session, onChoice, onTargetPlan }: ImportDrawingsSectionProps) {
  const { t } = useTranslation();
  if (session.drawings.length === 0) return null;

  return (
    <section className="space-y-3">
      <header>
        <h3 className="text-sm font-medium">{t('importReview.drawings.title', 'Ritningar')}</h3>
        <p className="text-xs text-muted-foreground">
          {t(
            'importReview.drawings.lead',
            'Ska jag rita av ritningen, eller lägga den som bakgrund så du ritar själv?'
          )}
        </p>
      </header>

      <ul className="space-y-2">
        {session.drawings.map((drawing) => (
          <DrawingRow
            key={drawing.proposalId}
            drawing={drawing}
            session={session}
            onChoice={onChoice}
            onTargetPlan={onTargetPlan}
          />
        ))}
      </ul>
    </section>
  );
}

function DrawingRow({
  drawing,
  session,
  onChoice,
  onTargetPlan,
}: {
  drawing: ImportDrawing;
  session: ImportSession;
} & Pick<ImportDrawingsSectionProps, 'onChoice' | 'onTargetPlan'>) {
  const { t } = useTranslation();

  return (
    <li className="space-y-2 rounded-lg border p-2">
      <div className="min-w-0">
        <p className="truncate text-sm" title={drawing.fileName}>
          {drawing.fileName}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {drawing.roomNames.length > 0
            ? t('importReview.drawings.saw', 'Jag tycker mig se: {{rooms}}', {
                rooms: drawing.roomNames.join(', '),
              })
            : t('importReview.drawings.sawNothing', 'Jag hittade inga rumsnamn i den.')}
        </p>
      </div>

      <div className="grid gap-1.5 sm:grid-cols-3">
        {CHOICES.map((choice) => {
          const active = drawing.choice === choice.value;
          const Icon = choice.icon;
          // Nothing to trace when the vision pass found no geometry.
          const disabled = choice.value === 'trace' && drawing.wallCount === 0 && drawing.roomNames.length === 0;
          return (
            <button
              key={choice.value}
              type="button"
              disabled={disabled}
              onClick={() => onChoice(drawing.proposalId, choice.value)}
              className={cn(
                'rounded-lg border p-2 text-left transition-colors',
                active ? 'border-primary bg-primary/5' : 'hover:bg-muted',
                disabled && 'cursor-not-allowed opacity-40'
              )}
            >
              <span className="flex items-center gap-1.5 text-xs font-medium">
                <Icon className="h-3.5 w-3.5" />
                {t(choice.labelKey, choice.fallback)}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                {t(choice.hintKey, choice.hintFallback)}
              </span>
            </button>
          );
        })}
      </div>

      {drawing.choice === 'layer' && (
        <Select value={drawing.targetPlanId} onValueChange={(v) => onTargetPlan(drawing.proposalId, v)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {session.existingPlans.map((plan) => (
              <SelectItem key={plan.id} value={plan.id}>
                {t('importReview.drawings.ontoPlan', 'På {{name}}', { name: plan.name })}
              </SelectItem>
            ))}
            <SelectItem value="new">
              {t('importReview.drawings.newPlan', 'På en ny planritning')}
            </SelectItem>
          </SelectContent>
        </Select>
      )}
    </li>
  );
}
