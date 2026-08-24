/**
 * Completed-project summary (Skiva 3).
 *
 * A finished renovation still has to answer three questions: what did it cost,
 * what can be deducted, and where is the paperwork. This is the retro project's
 * whole reason to exist — the sale, the tax return, the "what did we pay for
 * the bathroom" argument two years later. Printable, because that is how these
 * numbers actually get used.
 *
 * The figures come from `fetchSpendRollup` (S3), the same engine the address
 * roll-up reads, so a project and its address can never disagree about what
 * was spent.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ReceiptText } from 'lucide-react';
import { fetchSpendRollup, type SpendRollup } from '@/lib/spendRollup';
import { SpendSummaryPanel } from '@/components/property/SpendSummaryPanel';

interface Props {
  projectId: string;
  currency?: string | null;
  /** Homeowners see amounts incl. VAT, pros ex VAT — the label always says which. */
  isHomeowner: boolean;
  /** ROT/RUT only where the market has it. */
  showTaxDeduction?: boolean;
}

export function CompletedProjectSummary({ projectId, currency, isHomeowner, showTaxDeduction }: Props) {
  const { t } = useTranslation();
  const [rollup, setRollup] = useState<SpendRollup | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSpendRollup([projectId]).then((r) => {
      if (!cancelled) setRollup(r);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Nothing bought → nothing to sum up. Don't show an empty ceremony.
  if (!rollup || rollup.poCount === 0) return null;

  return (
    <SpendSummaryPanel
      rollup={rollup}
      currency={currency}
      isHomeowner={isHomeowner}
      showTaxDeduction={showTaxDeduction}
      title={t('overview.completed.title', 'Sammanställning')}
      icon={<ReceiptText className="h-4 w-4 text-primary shrink-0" />}
    />
  );
}
