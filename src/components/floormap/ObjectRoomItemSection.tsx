/**
 * ObjectRoomItemSection — in the PropertyPanel, shows the room_items entry linked
 * to the selected placed object (E5.3). Unlike the hover tooltip, this is
 * persistent and interactive: the product link is clickable and the install
 * status can be toggled, turning the drawing into a live checklist.
 */
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Check, ExternalLink, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ROOM_ITEM_CATEGORIES } from './room-details/constants';

interface LinkedItem {
  id: string;
  title: string;
  category: string;
  install_status: string;
  detail: { product_link?: string; quantity?: number };
}

const categoryLabelKey = (category: string) =>
  ROOM_ITEM_CATEGORIES.find((c) => c.value === category)?.labelKey;

export function ObjectRoomItemSection({ shapeId }: { shapeId: string }) {
  const { t } = useTranslation();
  const [item, setItem] = useState<LinkedItem | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchItem = useCallback(async () => {
    const { data, error } = await supabase
      .from('room_items')
      .select('id, title, category, install_status, detail')
      .eq('floor_map_shape_id', shapeId)
      .maybeSingle();
    if (error) {
      console.error('Failed to load linked room item:', error);
      return;
    }
    setItem(data ? ({ ...data, detail: (data.detail ?? {}) } as LinkedItem) : null);
  }, [shapeId]);

  useEffect(() => {
    fetchItem();
  }, [fetchItem]);

  if (!item) return null;

  const installed = item.install_status === 'installed';
  const qty = item.detail?.quantity;
  const link = item.detail?.product_link;
  const catKey = categoryLabelKey(item.category);

  const toggleInstalled = async () => {
    const next = installed ? 'planned' : 'installed';
    setSaving(true);
    setItem((prev) => (prev ? { ...prev, install_status: next } : prev));
    const { error } = await supabase
      .from('room_items')
      .update({ install_status: next })
      .eq('id', item.id);
    setSaving(false);
    if (error) {
      console.error('Failed to update install status:', error);
      toast.error(t('roomItems.saveError', 'Kunde inte spara objektet'));
      fetchItem();
    }
  };

  return (
    <>
      <Separator />
      <div>
        <div className="mb-3 flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-gray-600" />
          <Label className="text-sm font-medium text-gray-700">
            {t('roomItems.linkedItem', 'Loggad post')}
          </Label>
          {catKey && (
            <Badge variant="outline" className="ml-auto text-xs">
              {t(catKey)}
            </Badge>
          )}
        </div>

        <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="font-semibold text-gray-800">{item.title}</div>

          <button
            type="button"
            onClick={toggleInstalled}
            disabled={saving}
            className="flex w-full items-center gap-2 text-sm"
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                installed
                  ? 'border-emerald-500 bg-emerald-500 text-white'
                  : 'border-gray-300 text-transparent hover:border-emerald-400'
              }`}
            >
              <Check className="h-3 w-3" />
            </span>
            <span className={installed ? 'text-emerald-700' : 'text-gray-600'}>
              {installed
                ? t('roomItems.installed', 'Installerad')
                : t('roomItems.markInstalled', 'Markera installerad')}
            </span>
          </button>

          {qty != null && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">{t('roomItems.quantity', 'Antal')}:</span>
              <span className="rf-num font-medium text-gray-800">×{qty}</span>
            </div>
          )}

          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{t('roomItems.productLink', 'Produktlänk')}</span>
            </a>
          )}
        </div>
      </div>
    </>
  );
}
