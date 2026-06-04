/**
 * ObjectInfoTooltip — hover card for a placed canvas object that is linked to a
 * room_items row (E5). Shows the logged item's info (title, quantity, install
 * status, whether a product link exists) so the drawing reads as an instruction.
 */
import { useTranslation } from 'react-i18next';
import { Check, Link as LinkIcon } from 'lucide-react';
import type { ShapeRoomItem } from '../hooks/useRoomItemsByShape';

interface ObjectInfoTooltipProps {
  item: ShapeRoomItem | null;
  mousePosition: { x: number; y: number } | null;
}

export function ObjectInfoTooltip({ item, mousePosition }: ObjectInfoTooltipProps) {
  const { t } = useTranslation();
  if (!item || !mousePosition) return null;

  const installed = item.install_status === 'installed';
  const qty = item.detail?.quantity;
  const hasLink = !!item.detail?.product_link;

  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{ left: mousePosition.x + 16, top: mousePosition.y + 16 }}
    >
      <div className="min-w-[160px] rounded-lg border border-border bg-background/95 px-3 py-2 text-sm shadow-lg backdrop-blur-sm">
        <div className="mb-1 font-medium text-foreground">{item.title}</div>
        <div className="space-y-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full ${
                installed ? 'bg-emerald-500 text-white' : 'border border-muted-foreground/40'
              }`}
            >
              {installed && <Check className="h-2.5 w-2.5" />}
            </span>
            <span>
              {installed
                ? t('roomItems.installed', 'Installerad')
                : t('roomItems.planned', 'Planerad')}
            </span>
          </div>
          {qty != null && (
            <div>
              {t('roomItems.quantity', 'Antal')}: <span className="rf-num">×{qty}</span>
            </div>
          )}
          {hasLink && (
            <div className="flex items-center gap-1.5">
              <LinkIcon className="h-3 w-3" />
              {t('roomItems.productLink', 'Produktlänk')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
