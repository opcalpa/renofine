import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getFileUrls } from "@/lib/fileUrl";
import type { FieldIntent } from "@/lib/fieldIntent";

/**
 * "Från fältet" — what has stopped somebody on site.
 *
 * The builder is the bottleneck on every build, so this list holds exactly the
 * two things that are waiting on a decision from them:
 *
 *   questions — comments with intent='fraga' that are not resolved
 *   purchases — materials the worker asked for, whose PO is still 'requested'
 *
 * Everything else a worker sends (a report, a note) arrives already settled and
 * belongs in the feed, not here. A list that is only useful if every row is
 * actionable stops being useful the moment one row isn't.
 */

export type FieldInboxKind = "question" | "purchase";

export interface FieldInboxImage {
  url: string;
  caption: string | null;
}

export interface FieldInboxItem {
  id: string;
  kind: FieldInboxKind;
  /** The worker's own words, in their language. */
  content: string;
  authorName: string;
  createdAt: string;
  /** Room / task the message hangs on, already resolved to a name. */
  context: string | null;
  image: FieldInboxImage | null;
  /** purchase only — what to approve. */
  purchase?: {
    materialId: string;
    purchaseOrderId: string;
    quantity: number | null;
    unit: string | null;
    priceTotal: number | null;
    vendorName: string | null;
  };
  /** question only — whether it has been passed on to the customer. */
  visibleToClient?: boolean;
}

export interface FieldInboxSettledItem {
  id: string;
  intent: FieldIntent | null;
  content: string;
  authorName: string;
  createdAt: string;
  context: string | null;
}

interface CommentRow {
  id: string;
  content: string;
  created_at: string;
  author_display_name: string | null;
  task_id: string | null;
  intent: string | null;
  is_resolved: boolean | null;
  visible_to_client: boolean;
  images: unknown;
}

interface MaterialRow {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  price_total: number | null;
  vendor_name: string | null;
  description: string | null;
  created_at: string;
  task_id: string | null;
  purchase_order_id: string | null;
  submitted_by_worker_token_id: string | null;
}

const WORKER_SUFFIX = " (worker)";

/** Strip the marker the edge functions append so the site sees a person, not a role. */
function displayName(raw: string | null): string {
  if (!raw) return "";
  return raw.endsWith(WORKER_SUFFIX) ? raw.slice(0, -WORKER_SUFFIX.length) : raw;
}

function firstImage(images: unknown): { url: string; caption: string | null } | null {
  if (!Array.isArray(images)) return null;
  for (const img of images) {
    if (img && typeof img === "object" && typeof (img as { url?: unknown }).url === "string") {
      const { url, caption } = img as { url: string; caption?: string | null };
      return { url, caption: caption ?? null };
    }
  }
  return null;
}

/** Start of the local day — "Klart idag" means today, not "the last 24 hours". */
function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function useFieldInbox(projectId: string | undefined, enabled: boolean) {
  const [items, setItems] = useState<FieldInboxItem[]>([]);
  const [settled, setSettled] = useState<FieldInboxSettledItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!projectId || !enabled) {
      setItems([]);
      setSettled([]);
      return;
    }
    setLoading(true);
    try {
      const [openRes, settledRes, materialsRes] = await Promise.all([
        supabase
          .from("comments")
          .select(
            "id, content, created_at, author_display_name, task_id, intent, is_resolved, visible_to_client, images"
          )
          .eq("project_id", projectId)
          .eq("intent", "fraga")
          .eq("is_resolved", false)
          .order("created_at", { ascending: true }),
        supabase
          .from("comments")
          .select(
            "id, content, created_at, author_display_name, task_id, intent, is_resolved, visible_to_client, images"
          )
          .eq("project_id", projectId)
          .not("intent", "is", null)
          .eq("is_resolved", true)
          .gte("created_at", startOfToday())
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("materials")
          .select(
            "id, name, quantity, unit, price_total, vendor_name, description, created_at, task_id, purchase_order_id, submitted_by_worker_token_id"
          )
          .eq("project_id", projectId)
          .eq("status", "submitted")
          .not("purchase_order_id", "is", null)
          .order("created_at", { ascending: true }),
      ]);

      const openComments = (openRes.data ?? []) as unknown as CommentRow[];
      const settledComments = (settledRes.data ?? []) as unknown as CommentRow[];
      const materials = (materialsRes.data ?? []) as unknown as MaterialRow[];

      // Only materials whose PO is still awaiting the builder's word. Anything
      // already ordered or delivered is bookkeeping, not a decision.
      const poIds = [...new Set(materials.map((m) => m.purchase_order_id).filter(Boolean))] as string[];
      const requestedPoIds = new Set<string>();
      if (poIds.length > 0) {
        const { data: pos } = await supabase
          .from("purchase_orders")
          .select("id, status")
          .in("id", poIds)
          .eq("status", "requested");
        for (const po of pos ?? []) requestedPoIds.add(po.id);
      }
      const pending = materials.filter(
        (m) => m.purchase_order_id && requestedPoIds.has(m.purchase_order_id)
      );

      // Names for the context line, in one round per kind.
      const taskIds = [
        ...new Set(
          [...openComments, ...settledComments, ...pending]
            .map((r) => r.task_id)
            .filter(Boolean) as string[]
        ),
      ];
      const taskNames = new Map<string, string>();
      if (taskIds.length > 0) {
        const { data: tasks } = await supabase
          .from("tasks")
          .select("id, title")
          .in("id", taskIds);
        for (const t of tasks ?? []) taskNames.set(t.id, t.title);
      }

      // Who is blocked. A material carries the token that submitted it, not a
      // name — but "Piotr is waiting" is the whole point of the row.
      const tokenIds = [
        ...new Set(pending.map((m) => m.submitted_by_worker_token_id).filter(Boolean) as string[]),
      ];
      const workerNames = new Map<string, string>();
      if (tokenIds.length > 0) {
        const { data: tokens } = await supabase
          .from("worker_access_tokens")
          .select("id, worker_name")
          .in("id", tokenIds);
        for (const tk of tokens ?? []) workerNames.set(tk.id, tk.worker_name);
      }

      // The product shot hangs on the material, not on a comment.
      const productImages = new Map<string, FieldInboxImage>();
      if (pending.length > 0) {
        const { data: photos } = await supabase
          .from("photos")
          .select("linked_to_id, url, caption")
          .eq("linked_to_type", "material")
          .in(
            "linked_to_id",
            pending.map((m) => m.id)
          );
        for (const p of photos ?? []) {
          if (!productImages.has(p.linked_to_id)) {
            productImages.set(p.linked_to_id, { url: p.url, caption: p.caption });
          }
        }
      }

      const questionItems: FieldInboxItem[] = openComments.map((c) => ({
        id: c.id,
        kind: "question",
        content: c.content,
        authorName: displayName(c.author_display_name),
        createdAt: c.created_at,
        context: c.task_id ? taskNames.get(c.task_id) ?? null : null,
        image: firstImage(c.images),
        visibleToClient: c.visible_to_client,
      }));

      const purchaseItems: FieldInboxItem[] = pending.map((m) => ({
        id: m.id,
        kind: "purchase",
        content: m.name,
        authorName: m.submitted_by_worker_token_id
          ? workerNames.get(m.submitted_by_worker_token_id) ?? ""
          : "",
        createdAt: m.created_at,
        context: m.task_id ? taskNames.get(m.task_id) ?? null : null,
        image: productImages.get(m.id) ?? null,
        purchase: {
          materialId: m.id,
          purchaseOrderId: m.purchase_order_id as string,
          quantity: m.quantity,
          unit: m.unit,
          priceTotal: m.price_total,
          vendorName: m.vendor_name,
        },
      }));

      const all = [...purchaseItems, ...questionItems].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      // Stored references are PATHS — sign once, here in the data layer, never
      // in the <img>. A signed URL is never written back anywhere.
      const paths = all.map((i) => i.image?.url).filter(Boolean) as string[];
      if (paths.length > 0) {
        const signed = await getFileUrls(paths);
        for (const item of all) {
          if (!item.image) continue;
          const url = signed.get(item.image.url);
          if (url) item.image = { ...item.image, url };
        }
      }

      setItems(all);
      setSettled(
        settledComments.map((c) => ({
          id: c.id,
          intent: (c.intent as FieldIntent | null) ?? null,
          content: c.content,
          authorName: displayName(c.author_display_name),
          createdAt: c.created_at,
          context: c.task_id ? taskNames.get(c.task_id) ?? null : null,
        }))
      );
    } catch (err) {
      console.error("Failed to load field inbox:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(
    () => ({
      total: items.length,
      questions: items.filter((i) => i.kind === "question").length,
      purchases: items.filter((i) => i.kind === "purchase").length,
    }),
    [items]
  );

  /** Drop a row the moment the builder acts — the server call follows. */
  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const markForwarded = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, visibleToClient: true } : i))
    );
  }, []);

  return { items, settled, counts, loading, reload: load, removeItem, markForwarded };
}
