/**
 * "Dina adresser" on /start — the entry point to a home's full history.
 *
 * Homeowner-only: a builder has many customer sites, which is a different
 * concept (see the property epic). Addresses whose every project is
 * soft-deleted are filtered out — after the backfill most accounts have a tail
 * of those and they would read as clutter, not as homes.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, ChevronRight } from 'lucide-react';
import {
  listMyPropertiesWithCounts,
  propertyLabel,
  hasRealAddress,
  type PropertyWithProjectCount,
} from '@/services/propertyService';

export function AddressListSection() {
  const { t } = useTranslation();
  const [addresses, setAddresses] = useState<PropertyWithProjectCount[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMyPropertiesWithCounts().then((rows) => {
      if (!cancelled) setAddresses(rows.filter((p) => p.liveProjectCount > 0));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!addresses || addresses.length === 0) return null;

  return (
    <section className="mt-6 sm:mt-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">{t('addresses.list.title', 'Dina adresser')}</h2>
        <p className="text-xs text-muted-foreground">
          {t('addresses.list.subtitle', 'Allt som gjorts i en bostad, samlat')}
        </p>
      </div>

      <ul className="divide-y rounded-xl border bg-card">
        {addresses.map((a) => (
          <li key={a.id}>
            <Link
              to={`/addresses/${a.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40"
            >
              <span className="rounded-lg bg-primary/10 p-1.5 shrink-0">
                <Home className="h-4 w-4 text-primary" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{propertyLabel(a)}</span>
                <span className="block text-xs text-muted-foreground">
                  {t('addresses.list.projectCount', { count: a.liveProjectCount })}
                  {!hasRealAddress(a) && (
                    <> · {t('addresses.noAddressSet', 'ingen adress angiven')}</>
                  )}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
