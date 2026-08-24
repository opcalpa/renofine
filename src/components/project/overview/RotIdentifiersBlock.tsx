/**
 * What the ROT claim still needs at this home (P2).
 *
 * The app used to ask everyone for a fastighetsbeteckning. Skatteverket asks
 * for that only when the home is a småhus or ägarlägenhet; for a bostadsrätt
 * it asks for the association's organisationsnummer and the lägenhetsnummer
 * instead — and for a rental it asks for nothing, because rotavdrag requires
 * owning the home. A bostadsrätt owner was therefore shown a field they cannot
 * fill in, with no hint that something else applied to them.
 *
 * So the question comes first, and only then the fields. It is asked once,
 * answered with one tap, and always reversible from the address page.
 *
 * The identifiers live on the ADDRESS, not on the project: they are true of
 * the home across every renovation in it, and duplicating them per project is
 * exactly the split the address work removed. The project's own legacy
 * `property_designation` is still read as a fallback, never written.
 *
 * Every line reports what Skatteverket asks for. None of it advises.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, CheckCircle2, AlertCircle, Pencil, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { updateProperty, type Tenure } from '@/services/propertyService';
import { TENURE_OPTIONS } from '@/lib/rotIdentifiers';
import { useRotIdentifiers } from '@/hooks/useRotIdentifiers';
import { EditPropertyDialog } from '@/components/property/EditPropertyDialog';

interface Props {
  /** Omit when `state` is supplied — the address page has no project. */
  projectId?: string;
  /** Homeowners answer this; a builder sees the status but never the question. */
  isHomeowner: boolean;
  /**
   * Pre-loaded state. Passed by callers that already hold the property (the
   * address page) or that share it with a readiness check (the declaration
   * summary), so the two can never disagree about what is missing.
   */
  state?: ReturnType<typeof useRotIdentifiers>;
}

export function RotIdentifiersBlock({ projectId, isHomeowner, state }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();

  // Always called, so the hook order never changes; it no-ops without an id.
  const loadedHere = useRotIdentifiers(state ? null : projectId ?? null);
  const { loaded, property, canManage, tracksRot, status, reload } = state ?? loadedHere;

  const [saving, setSaving] = useState<Tenure | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const answerTenure = async (tenure: Tenure) => {
    if (!property) return;
    setSaving(tenure);
    const ok = await updateProperty(property.id, {
      name: property.name,
      address: property.address,
      postalCode: property.postal_code,
      city: property.city,
      propertyDesignation: property.property_designation,
      tenure,
    });
    setSaving(null);
    if (!ok) {
      toast({ title: t('rot.tenure.saveFailed', 'Kunde inte spara'), variant: 'destructive' });
      return;
    }
    await reload();
  };

  if (!loaded || !tracksRot) return null;

  // No address on the project: the old per-project field is all there is, and
  // the settings dialog already owns it. Nothing useful to add here.
  if (!property) return null;

  // The question. Asked only of the person who can answer it, and phrased as
  // the tax form's own question rather than as a setting.
  if (status.eligibility === 'unknown') {
    if (!isHomeowner || !canManage) return null;
    return (
      <div className="rounded-lg border border-dashed px-4 py-3 space-y-2.5">
        <p className="flex items-start gap-2 text-sm">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            {t(
              'rot.tenure.question',
              'För ROT-underlaget: är bostaden en bostadsrätt eller äger ni fastigheten? Skatteverket ber om olika uppgifter beroende på vilket.'
            )}
          </span>
        </p>
        <div className="flex flex-wrap gap-2 pl-6">
          {TENURE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={saving !== null}
              onClick={() => void answerTenure(option.value)}
              className="rounded-full border bg-background px-3.5 py-1.5 text-sm transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-60"
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>
        <p className="pl-6 text-xs text-muted-foreground">
          {t('rot.tenure.questionHint', 'Går att ändra när som helst på adressen.')}
        </p>
      </div>
    );
  }

  // A rental: say that ROT does not apply, instead of asking for a number that
  // would never be used. Hedged — this reports the rule, it does not advise.
  if (status.eligibility === 'not_applicable') {
    return (
      <div className="rounded-lg border px-4 py-3">
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {t(
              'rot.tenure.rentalNotice',
              'Skatteverket kräver att man äger bostaden för ROT-avdrag, så det gäller inte en hyresrätt. Övriga kostnader räknas som vanligt.'
            )}
            {canManage && (
              <>
                {' '}
                <button
                  type="button"
                  className="underline hover:no-underline"
                  onClick={() => setEditOpen(true)}
                >
                  {t('rot.tenure.changeAnswer', 'Ändra svaret')}
                </button>
              </>
            )}
          </span>
        </p>
        <EditPropertyDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          property={property}
          onSaved={() => void reload()}
        />
      </div>
    );
  }

  const borderClass = status.complete
    ? 'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20'
    : 'border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20';

  return (
    <div className={`rounded-lg border ${borderClass} px-4 py-3 space-y-2`}>
      <div className="flex items-center gap-2">
        {status.complete ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
        ) : (
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
        )}
        <span className="flex-1 text-sm font-medium">
          {status.complete
            ? t('rot.tenure.ready', 'ROT-uppgifter om bostaden — kompletta')
            : t('rot.tenure.incomplete', 'ROT-uppgifter om bostaden — saknas')}
        </span>
        {canManage && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="h-3 w-3" />
            {t('common.edit', 'Ändra')}
          </Button>
        )}
      </div>

      <ul className="space-y-1.5 pl-6">
        {status.required.map((identifier) => (
          <li key={identifier.key} className="text-sm">
            <div className="flex items-center gap-2">
              {identifier.value ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              )}
              <span className={identifier.value ? 'text-muted-foreground' : ''}>
                {t(identifier.labelKey)}
              </span>
              {identifier.value && (
                <span className="ml-auto truncate font-mono text-xs text-muted-foreground">
                  {identifier.value}
                </span>
              )}
            </div>
            {/* Where to actually find it — the part that saves a phone call. */}
            {!identifier.value && (
              <p className="pl-6 text-xs text-muted-foreground">{t(identifier.hintKey)}</p>
            )}
          </li>
        ))}
      </ul>

      {!status.complete && !canManage && (
        <p className="pl-6 text-xs text-amber-700 dark:text-amber-400">
          {t('rot.readiness.builderAskClient', 'Be kunden fylla i de saknade uppgifterna')}
        </p>
      )}

      <EditPropertyDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        property={property}
        onSaved={() => void reload()}
      />
    </div>
  );
}
