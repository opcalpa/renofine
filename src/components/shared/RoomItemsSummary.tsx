/**
 * Read-only summary of a set of rooms' room_items — the task card's mirror of
 * objects logged/placed on the floor plan and wall views. Same record as the
 * room-details list and the shared worker instructions (get-worker-data), so
 * the three surfaces can never disagree.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ExternalLink, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ROOM_ITEM_CATEGORIES } from "@/components/floormap/room-details/constants";

interface SummaryItem {
  id: string;
  room_id: string | null;
  category: string;
  subtype: string | null;
  title: string;
  install_status: string;
  detail: Record<string, unknown> | null;
  floor_map_shape_id: string | null;
}

interface RoomItemsSummaryProps {
  roomIds: string[];
}

export function RoomItemsSummary({ roomIds }: RoomItemsSummaryProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<SummaryItem[]>([]);
  const [roomNames, setRoomNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (roomIds.length === 0) {
      setItems([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const [itemsRes, roomsRes] = await Promise.all([
        supabase
          .from("room_items")
          .select("id, room_id, category, subtype, title, install_status, detail, floor_map_shape_id")
          .in("room_id", roomIds)
          .order("category")
          .order("sort_order", { ascending: true, nullsFirst: false }),
        supabase.from("rooms").select("id, name").in("id", roomIds),
      ]);
      if (cancelled) return;
      if (!itemsRes.error && itemsRes.data) setItems(itemsRes.data as SummaryItem[]);
      if (!roomsRes.error && roomsRes.data) {
        setRoomNames(Object.fromEntries(roomsRes.data.map((r) => [r.id, r.name])));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomIds.join(",")]);

  if (items.length === 0) return null;

  const categoryLabel = (category: string) => {
    const cat = ROOM_ITEM_CATEGORIES.find((c) => c.value === category);
    return cat ? t(cat.labelKey) : category;
  };

  const multiRoom = roomIds.length > 1;

  return (
    <div>
      <span className="rf-section-label mb-2 block">
        {t("roomItems.taskSummaryTitle", "Rummets objekt")} ({items.length})
      </span>
      <ul className="space-y-1">
        {items.map((item) => {
          const installed = item.install_status === "installed";
          const quantity =
            item.detail && typeof item.detail.quantity === "number" ? item.detail.quantity : null;
          const productLink =
            item.detail && typeof item.detail.product_link === "string"
              ? item.detail.product_link
              : null;
          return (
            <li
              key={item.id}
              className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
              style={{ borderColor: "var(--rf-hairline)", background: "var(--rf-paper-2)" }}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  installed ? "border-green-500 bg-green-500 text-white" : "border-muted-foreground/40"
                }`}
                title={installed ? t("roomItems.installed", "Installerad") : t("roomItems.planned", "Planerad")}
              >
                {installed && <Check className="h-3 w-3" />}
              </span>
              <span className={`min-w-0 truncate ${installed ? "text-muted-foreground line-through" : ""}`}>
                {item.title}
                {quantity != null && quantity > 1 && (
                  <span className="ml-1 text-xs text-muted-foreground">×{quantity}</span>
                )}
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                {productLink && (
                  <a
                    href={productLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                    title={t("roomItems.productLink", "Produktlänk")}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                {item.floor_map_shape_id && (
                  <span
                    className="flex items-center gap-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                    title={t("roomItems.onDrawing", "Placerad på ritningen")}
                  >
                    <MapPin className="h-3 w-3" />
                  </span>
                )}
                <span className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {categoryLabel(item.category)}
                  {multiRoom && item.room_id && roomNames[item.room_id]
                    ? ` · ${roomNames[item.room_id]}`
                    : ""}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
