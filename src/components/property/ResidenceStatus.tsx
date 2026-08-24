/**
 * Do you live here? (S7)
 *
 * Three states, of which a person only ever picks two. The third — no answer —
 * is the default, and it exists because the app must not assert something
 * nobody told it: the backfill named dozens of addresses after their project,
 * and a new account makes throwaway ones while poking around. Neither is a
 * claim that someone lives there.
 *
 * The question is asked LATE, never while an address is being created. At that
 * point the answer is often genuinely unknown, and the answer only starts to
 * matter once there is a history to keep — which is when someone opens this
 * page. It is one dismissible line, never a modal, and it never blocks
 * anything.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Home, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { setResidenceStatus, type ResidenceStatus } from '@/services/propertyService';

/** The label on a list row. No answer shows nothing — silence is not a state. */
export function ResidenceStatusChip({ status }: { status: ResidenceStatus | null }) {
  const { t } = useTranslation();
  if (!status) return null;

  const isCurrent = status === 'current';
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
        isCurrent
          ? 'bg-primary/10 text-primary'
          : 'bg-muted text-muted-foreground'
      }`}
    >
      {isCurrent ? <Home className="h-2.5 w-2.5" /> : <History className="h-2.5 w-2.5" />}
      {isCurrent
        ? t('addresses.residence.current', 'Nuvarande')
        : t('addresses.residence.former', 'Tidigare')}
    </span>
  );
}

interface PromptProps {
  propertyId: string;
  status: ResidenceStatus | null;
  canManage: boolean;
  onAnswered: (status: ResidenceStatus) => void;
}

/** Per-browser, per-address: "not now" must not turn into "asked every visit". */
const dismissKey = (propertyId: string) => `rf_residence_asked_${propertyId}`;

function wasDismissed(propertyId: string): boolean {
  try {
    return localStorage.getItem(dismissKey(propertyId)) === '1';
  } catch {
    return false;
  }
}

export function ResidencePrompt({ propertyId, status, canManage, onAnswered }: PromptProps) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(() => wasDismissed(propertyId));
  const [saving, setSaving] = useState(false);

  // Answered, not allowed to answer, or waved away — the address page has more
  // useful things to show than a question nobody asked for. The answer can
  // still be changed any time from "Redigera adress".
  if (status || !canManage || dismissed) return null;

  const answer = async (next: ResidenceStatus) => {
    setSaving(true);
    const ok = await setResidenceStatus(propertyId, next);
    setSaving(false);
    if (ok) onAnswered(next);
  };

  const dismiss = () => {
    try {
      localStorage.setItem(dismissKey(propertyId), '1');
    } catch {
      // A browser that refuses storage just gets asked again. Harmless.
    }
    setDismissed(true);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-4 py-3 print:hidden">
      <p className="mr-1 text-sm">{t('addresses.residence.question', 'Bor ni här?')}</p>
      <Button size="sm" variant="outline" disabled={saving} onClick={() => answer('current')}>
        {t('addresses.residence.answerCurrent', 'Ja')}
      </Button>
      <Button size="sm" variant="outline" disabled={saving} onClick={() => answer('former')}>
        {t('addresses.residence.answerFormer', 'Vi har bott här')}
      </Button>
      <Button size="sm" variant="ghost" disabled={saving} onClick={dismiss}>
        {t('addresses.residence.answerLater', 'Inte än')}
      </Button>
    </div>
  );
}
