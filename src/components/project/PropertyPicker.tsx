/**
 * Pick the address (property) a project belongs to.
 *
 * Shared by project creation and project settings so "which home is this?" is
 * asked the same way everywhere. Selecting `null` means "a new address", which
 * is the default and reproduces the old free-text behaviour exactly.
 *
 * Addresses whose every project is soft-deleted are hidden: after the backfill
 * most users have a tail of those, and offering them as destinations would make
 * the list read as noise. The currently selected one is always shown.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  listMyPropertiesWithCounts,
  propertyLabel,
  type PropertyWithProjectCount,
} from '@/services/propertyService';

const NEW_ADDRESS = '__new__';

interface Props {
  /** Selected property id, or null for "new address". */
  value: string | null;
  onChange: (propertyId: string | null, property: PropertyWithProjectCount | null) => void;
  /** Hide the picker entirely when the user has no addresses to choose from. */
  hideWhenEmpty?: boolean;
  disabled?: boolean;
  label?: string;
  newLabel?: string;
}

export function PropertyPicker({
  value,
  onChange,
  hideWhenEmpty = true,
  disabled = false,
  label,
  newLabel,
}: Props) {
  const { t } = useTranslation();
  const [properties, setProperties] = useState<PropertyWithProjectCount[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMyPropertiesWithCounts().then((rows) => {
      if (!cancelled) setProperties(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (properties === null) return null;

  const selectable = properties.filter((p) => p.liveProjectCount > 0 || p.id === value);
  if (selectable.length === 0 && hideWhenEmpty) return null;

  return (
    <div className="space-y-2">
      <Label>{label ?? t('addresses.picker.label', 'Adress')}</Label>
      <Select
        value={value ?? NEW_ADDRESS}
        disabled={disabled}
        onValueChange={(next) => {
          if (next === NEW_ADDRESS) {
            onChange(null, null);
            return;
          }
          onChange(next, selectable.find((p) => p.id === next) ?? null);
        }}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NEW_ADDRESS}>
            {newLabel ?? t('addresses.picker.newAddress', 'Ny adress')}
          </SelectItem>
          {selectable.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {propertyLabel(p)}
              {p.liveProjectCount > 1 && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {t('addresses.picker.projectCount', '{{count}} projekt', {
                    count: p.liveProjectCount,
                  })}
                </span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
