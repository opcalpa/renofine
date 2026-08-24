/**
 * "You already have an address like this one" (S5, the cheap half).
 *
 * Merging afterwards is the cure; this is the prevention. A duplicate address
 * is born the moment someone types "Storg. 5" where they once typed
 * "Storgatan 5" — and from then on every total for that home is split without
 * looking split. One line here, before the project exists, costs nothing.
 *
 * It never picks for the user: exact matches are already grouped automatically
 * by `propertyAddressKey`, so anything this catches is by definition a judgment
 * call.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lightbulb } from 'lucide-react';
import {
  findSimilarProperties,
  listMyPropertiesWithCounts,
  propertyLabel,
  type PropertyWithProjectCount,
} from '@/services/propertyService';

interface Props {
  address: string;
  postalCode?: string;
  city?: string;
  /** Called when the user accepts the suggestion — same shape as the picker. */
  onPick: (property: PropertyWithProjectCount) => void;
}

export function SimilarAddressHint({ address, postalCode, city, onPick }: Props) {
  const { t } = useTranslation();
  const [properties, setProperties] = useState<PropertyWithProjectCount[]>([]);

  useEffect(() => {
    let cancelled = false;
    listMyPropertiesWithCounts().then((rows) => {
      if (!cancelled) setProperties(rows.filter((p) => p.liveProjectCount > 0));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Wait until there is enough typed to say anything — a hint on the third
  // keystroke would be noise, and wrong most of the time.
  if (address.trim().length < 4 || properties.length === 0) return null;

  const matches = findSimilarProperties(properties, { address, postalCode, city });
  if (matches.length === 0) return null;

  return (
    <div className="rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-sm">
      <p className="flex items-start gap-2 text-muted-foreground">
        <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        {t('addresses.similar.prompt', 'Du har redan en adress som liknar den här:')}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {matches.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p)}
            className="rounded-full border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted"
          >
            {t('addresses.similar.use', { name: propertyLabel(p), defaultValue: 'Använd {{name}}' })}
          </button>
        ))}
      </div>
    </div>
  );
}
