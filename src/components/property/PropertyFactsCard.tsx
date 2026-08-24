/**
 * Uppgifter om bostaden — what the home's papers say about it (P5).
 *
 * Purchase price, possession date, living area, build year, monthly fee,
 * designation, association. Every fact carries the name of the document it
 * came from, because a number without its source is a claim, and a claim about
 * a home is the kind of thing people need to check.
 *
 * Two lines that shape the card:
 *  - Facts reach the property's own fields ONLY through "Använd" (P1's rule —
 *    suggest, never auto), and only into fields that are empty.
 *  - Nothing here is a profit calculation. The card says so out loud.
 */

import { useTranslation } from 'react-i18next';
import { FileSearch, ArrowRight, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  aggregateFacts,
  canApplyFact,
  type AggregatedFact,
} from '@/services/propertyFactsService';
import type { PropertyDocument, PropertyFacts } from '@/services/propertyDocumentService';
import type { PropertyRow } from '@/services/propertyService';

interface Props {
  property: PropertyRow;
  documents: PropertyDocument[];
  canManage: boolean;
  onApply: (fact: AggregatedFact) => void;
  applying: string | null;
}

const LABEL_KEYS: Record<AggregatedFact['key'], string> = {
  address: 'addresses.facts.address',
  purchase_price: 'addresses.facts.purchase_price',
  contract_date: 'addresses.facts.contract_date',
  possession_date: 'addresses.facts.possession_date',
  living_area_sqm: 'addresses.facts.living_area_sqm',
  build_year: 'addresses.facts.build_year',
  tenure: 'addresses.facts.tenure',
  property_designation: 'addresses.facts.property_designation',
  brf_name: 'addresses.facts.brf_name',
  brf_org_number: 'addresses.facts.brf_org_number',
  apartment_number: 'addresses.facts.apartment_number',
  monthly_fee: 'addresses.facts.monthly_fee',
};

export function PropertyFactsCard({ property, documents, canManage, onApply, applying }: Props) {
  const { t, i18n } = useTranslation();
  const facts = aggregateFacts(documents);
  if (facts.length === 0) return null;

  const format = (fact: AggregatedFact): string => {
    const v = fact.value;
    switch (fact.key) {
      case 'address': {
        const a = v as PropertyFacts['address'];
        if (!a) return '';
        return [a.street, [a.postal_code, a.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
      }
      case 'purchase_price':
      case 'monthly_fee':
        return `${Number(v).toLocaleString('sv-SE')} kr${fact.key === 'monthly_fee' ? t('addresses.facts.perMonth', '/mån') : ''}`;
      case 'living_area_sqm':
        return `${Number(v).toLocaleString('sv-SE')} m²`;
      case 'contract_date':
      case 'possession_date':
        return new Date(String(v)).toLocaleDateString(i18n.language === 'sv' ? 'sv-SE' : i18n.language, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      case 'tenure':
        return t(`addresses.facts.tenureValue.${String(v)}`, String(v));
      default:
        return String(v);
    }
  };

  return (
    // The seller's home, the price paid: never into session replay.
    <section className="rounded-xl border bg-card print:break-inside-avoid" data-sentry-block>
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <FileSearch className="h-4 w-4 shrink-0 text-primary" />
        <h2 className="text-sm font-semibold">
          {t('addresses.facts.title', 'Uppgifter om bostaden')}
        </h2>
      </header>

      <dl className="divide-y">
        {facts.map((fact) => {
          const target = canManage ? canApplyFact(property, fact.key) : null;
          return (
            <div key={fact.key} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-2.5">
              <dt className="w-40 shrink-0 text-sm text-muted-foreground">{t(LABEL_KEYS[fact.key])}</dt>
              <dd className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{format(fact)}</span>
                  {/* Provenance is part of the fact, not a footnote. */}
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    {t('addresses.facts.from', { file: fact.sourceName, defaultValue: 'från {{file}}' })}
                  </span>
                  {target && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      disabled={applying !== null}
                      onClick={() => onApply(fact)}
                    >
                      {applying === fact.key ? null : <ArrowRight className="mr-1 h-3 w-3" />}
                      {t('addresses.facts.use', 'Använd')}
                    </Button>
                  )}
                </div>
                {/* Two documents that disagree are shown, not resolved: the
                    person knows which paper is right, the app does not. */}
                {fact.conflicts.length > 0 && (
                  <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
                    {t('addresses.facts.conflict', {
                      values: fact.conflicts
                        .map((c) => `${format({ ...fact, value: c.value })} (${c.sourceName})`)
                        .join(', '),
                      defaultValue: 'Annat värde i: {{values}}',
                    })}
                  </p>
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
        {t(
          'addresses.facts.note',
          'Underlag från dina dokument — inte en vinstberäkning. Personnummer läses aldrig ut.'
        )}
      </p>
    </section>
  );
}
