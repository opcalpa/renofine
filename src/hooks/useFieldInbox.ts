import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getFileUrls } from "@/lib/fileUrl";

/**
 * "Från fältet" — what has stopped somebody on site.
 *
 * A report from site arrives as ONE thing said, carrying several parts: a
 * question, a purchase, hours, a percentage. It is therefore returned as ONE
 * card with one action per part, not as three unrelated rows — splitting it
 * would hand the builder the pieces and keep the sentence to ourselves.
 *
 * Three kinds of part are waiting on the builder and nothing else is:
 *   question — comments.intent='fraga', unresolved
 *   purchase — materials 'submitted' whose PO is still 'requested'
 *   hours    — time_entries reported from a worker link, not yet judged
 *
 * Anything that arrived settled (a note, a completion, a percentage) is not a
 * row here. A list is only useful when every line in it is actionable.
 *
 * Messages sent before grammar v2 have no report; each becomes a card of its
 * own so nothing that was already waiting disappears.
 */

export type FieldInboxPartKind = "question" | "purchase" | "hours";

export interface FieldInboxImage {
  url: string;
  caption: string | null;
}

export interface FieldInboxPart {
  kind: FieldInboxPartKind;
  /** comment id / material id / time entry id — what the action acts on. */
  id: string;
  /** question */
  visibleToClient?: boolean;
  /** purchase */
  purchase?: {
    materialId: string;
    purchaseOrderId: string | null;
    quantity: number | null;
    unit: string | null;
    priceTotal: number | null;
    vendorName: string | null;
    name: string;
  };
  /** hours */
  hours?: { value: number; note: string | null; date: string };
}

export interface FieldInboxCard {
  /** Report id, or the single part's id for a pre-v2 message. */
  id: string;
  reportId: string | null;
  authorName: string;
  createdAt: string;
  /** Room or task the report hangs on, resolved to a name. */
  context: string | null;
  image: FieldInboxImage | null;
  /** The worker's own words, in their language. */
  text: string;
  /** Key the translation is cached under — the comment the words live in. */
  textId: string | null;
  parts: FieldInboxPart[];
}

export interface FieldInboxSettledItem {
  id: string;
  intent: string | null;
  content: string;
  authorName: string;
  createdAt: string;
  context: string | null;
}

const WORKER_SUFFIX = " (worker)";

/** Strip the marker the edge functions append so the site sees a person. */
function displayName(raw: string | null): string {
  if (!raw) return "";
  return raw.endsWith(WORKER_SUFFIX) ? raw.slice(0, -WORKER_SUFFIX.length) : raw;
}

function firstImage(images: unknown): FieldInboxImage | null {
  if (!Array.isArray(images)) return null;
  for (const img of images) {
    if (img && typeof img === "object" && typeof (img as { url?: unknown }).url === "string") {
      const { url, caption } = img as { url: string; caption?: string | null };
      return { url, caption: caption ?? null };
    }
  }
  return null;
}

function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
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
  report_id: string | null;
}

interface MaterialRow {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  price_total: number | null;
  vendor_name: string | null;
  created_at: string;
  task_id: string | null;
  purchase_order_id: string | null;
  submitted_by_worker_token_id: string | null;
  report_id: string | null;
}

interface TimeRow {
  id: string;
  hours: number;
  date: string;
  description: string | null;
  created_at: string | null;
  task_id: string | null;
  worker_token_id: string | null;
  report_id: string | null;
}

export function useFieldInbox(projectId: string | undefined, enabled: boolean) {
  const [cards, setCards] = useState<FieldInboxCard[]>([]);
  const [settled, setSettled] = useState<FieldInboxSettledItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!projectId || !enabled) {
      setCards([]);
      setSettled([]);
      return;
    }
    setLoading(true);
    try {
      const commentCols =
        "id, content, created_at, author_display_name, task_id, intent, is_resolved, visible_to_client, images, report_id";

      const [openRes, settledRes, materialsRes, timeRes] = await Promise.all([
        supabase
          .from("comments")
          .select(commentCols)
          .eq("project_id", projectId)
          .eq("intent", "fraga")
          .eq("is_resolved", false)
          .order("created_at", { ascending: true }),
        supabase
          .from("comments")
          .select(commentCols)
          .eq("project_id", projectId)
          .not("intent", "is", null)
          .eq("is_resolved", true)
          .gte("created_at", startOfToday())
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("materials")
          .select(
            "id, name, quantity, unit, price_total, vendor_name, created_at, task_id, purchase_order_id, submitted_by_worker_token_id, report_id"
          )
          .eq("project_id", projectId)
          .eq("status", "submitted")
          .not("purchase_order_id", "is", null)
          .order("created_at", { ascending: true }),
        supabase
          .from("time_entries")
          .select("id, hours, date, description, created_at, task_id, worker_token_id, report_id")
          .eq("project_id", projectId)
          .eq("approved", false)
          .is("declined_at", null)
          .not("worker_token_id", "is", null)
          .order("created_at", { ascending: true }),
      ]);

      const openComments = (openRes.data ?? []) as unknown as CommentRow[];
      const settledComments = (settledRes.data ?? []) as unknown as CommentRow[];
      const materials = (materialsRes.data ?? []) as unknown as MaterialRow[];
      const timeRows = (timeRes.data ?? []) as unknown as TimeRow[];

      // Only materials whose PO still awaits the builder's word. Anything
      // already ordered is bookkeeping, not a decision.
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
      const pendingMaterials = materials.filter(
        (m) => m.purchase_order_id && requestedPoIds.has(m.purchase_order_id)
      );

      // ---- The reports these parts belong to ----
      const reportIds = [
        ...new Set(
          [...openComments, ...pendingMaterials, ...timeRows]
            .map((r) => r.report_id)
            .filter(Boolean) as string[]
        ),
      ];
      const reports = new Map<
        string,
        { id: string; task_id: string | null; raw_text: string | null; created_at: string; worker_token_id: string | null }
      >();
      if (reportIds.length > 0) {
        const { data } = await supabase
          .from("field_reports")
          .select("id, task_id, raw_text, created_at, worker_token_id")
          .in("id", reportIds);
        for (const r of data ?? []) reports.set(r.id, r);
      }

      // Every comment belonging to one of these reports carries its words and
      // its photo, including reports whose only waiting part is hours.
      const reportComments = new Map<string, CommentRow>();
      if (reportIds.length > 0) {
        const { data } = await supabase
          .from("comments")
          .select(commentCols)
          .in("report_id", reportIds);
        for (const c of (data ?? []) as unknown as CommentRow[]) {
          if (c.report_id && !reportComments.has(c.report_id)) reportComments.set(c.report_id, c);
        }
      }

      // ---- Names for the context line and the person ----
      const taskIds = [
        ...new Set(
          [...openComments, ...settledComments, ...pendingMaterials, ...timeRows]
            .map((r) => r.task_id)
            .filter(Boolean) as string[]
        ),
      ];
      const taskNames = new Map<string, string>();
      if (taskIds.length > 0) {
        const { data } = await supabase.from("tasks").select("id, title").in("id", taskIds);
        for (const t of data ?? []) taskNames.set(t.id, t.title);
      }

      const tokenIds = [
        ...new Set(
          [
            ...pendingMaterials.map((m) => m.submitted_by_worker_token_id),
            ...timeRows.map((t) => t.worker_token_id),
            ...[...reports.values()].map((r) => r.worker_token_id),
          ].filter(Boolean) as string[]
        ),
      ];
      const workerNames = new Map<string, string>();
      if (tokenIds.length > 0) {
        const { data } = await supabase
          .from("worker_access_tokens")
          .select("id, worker_name")
          .in("id", tokenIds);
        for (const tk of data ?? []) workerNames.set(tk.id, tk.worker_name);
      }

      // The product shot hangs on the material, not on the comment.
      const productImages = new Map<string, FieldInboxImage>();
      if (pendingMaterials.length > 0) {
        const { data } = await supabase
          .from("photos")
          .select("linked_to_id, url, caption")
          .eq("linked_to_type", "material")
          .in("linked_to_id", pendingMaterials.map((m) => m.id));
        for (const p of data ?? []) {
          if (!productImages.has(p.linked_to_id)) {
            productImages.set(p.linked_to_id, { url: p.url, caption: p.caption });
          }
        }
      }

      // ---- Build one card per report, plus one per pre-v2 orphan ----
      const byId = new Map<string, FieldInboxCard>();

      const cardFor = (
        key: string,
        seed: () => Omit<FieldInboxCard, "parts">
      ): FieldInboxCard => {
        const existing = byId.get(key);
        if (existing) return existing;
        const created = { ...seed(), parts: [] as FieldInboxPart[] };
        byId.set(key, created);
        return created;
      };

      const cardForReport = (reportId: string, fallbackCreatedAt: string) => {
        const report = reports.get(reportId);
        const comment = reportComments.get(reportId);
        return cardFor(reportId, () => ({
          id: reportId,
          reportId,
          authorName:
            displayName(comment?.author_display_name ?? null) ||
            (report?.worker_token_id ? workerNames.get(report.worker_token_id) ?? "" : ""),
          createdAt: report?.created_at ?? comment?.created_at ?? fallbackCreatedAt,
          context: report?.task_id ? taskNames.get(report.task_id) ?? null : null,
          image: firstImage(comment?.images),
          text: report?.raw_text ?? comment?.content ?? "",
          textId: comment?.id ?? null,
        }));
      };

      for (const c of openComments) {
        const card = c.report_id
          ? cardForReport(c.report_id, c.created_at)
          : cardFor(c.id, () => ({
              id: c.id,
              reportId: null,
              authorName: displayName(c.author_display_name),
              createdAt: c.created_at,
              context: c.task_id ? taskNames.get(c.task_id) ?? null : null,
              image: firstImage(c.images),
              text: c.content,
              textId: c.id,
            }));
        card.parts.push({ kind: "question", id: c.id, visibleToClient: c.visible_to_client });
      }

      for (const m of pendingMaterials) {
        const card = m.report_id
          ? cardForReport(m.report_id, m.created_at)
          : cardFor(m.id, () => ({
              id: m.id,
              reportId: null,
              authorName: m.submitted_by_worker_token_id
                ? workerNames.get(m.submitted_by_worker_token_id) ?? ""
                : "",
              createdAt: m.created_at,
              context: m.task_id ? taskNames.get(m.task_id) ?? null : null,
              image: productImages.get(m.id) ?? null,
              text: "",
              textId: null,
            }));
        if (!card.image) card.image = productImages.get(m.id) ?? null;
        card.parts.push({
          kind: "purchase",
          id: m.id,
          purchase: {
            materialId: m.id,
            purchaseOrderId: m.purchase_order_id,
            quantity: m.quantity,
            unit: m.unit,
            priceTotal: m.price_total,
            vendorName: m.vendor_name,
            name: m.name,
          },
        });
      }

      for (const te of timeRows) {
        const created = te.created_at ?? te.date;
        const card = te.report_id
          ? cardForReport(te.report_id, created)
          : cardFor(te.id, () => ({
              id: te.id,
              reportId: null,
              authorName: te.worker_token_id ? workerNames.get(te.worker_token_id) ?? "" : "",
              createdAt: created,
              context: te.task_id ? taskNames.get(te.task_id) ?? null : null,
              image: null,
              text: "",
              textId: null,
            }));
        card.parts.push({
          kind: "hours",
          id: te.id,
          hours: { value: Number(te.hours), note: te.description, date: te.date },
        });
      }

      const all = [...byId.values()].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      // Stored references are PATHS — sign once, here in the data layer, never
      // in the <img>. A signed URL is never written back anywhere.
      const paths = all.map((c) => c.image?.url).filter(Boolean) as string[];
      if (paths.length > 0) {
        const signed = await getFileUrls(paths);
        for (const card of all) {
          if (!card.image) continue;
          const url = signed.get(card.image.url);
          if (url) card.image = { ...card.image, url };
        }
      }

      setCards(all);
      setSettled(
        settledComments.map((c) => ({
          id: c.id,
          intent: c.intent,
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

  const counts = useMemo(() => {
    const parts = cards.flatMap((c) => c.parts);
    return {
      total: parts.length,
      questions: parts.filter((p) => p.kind === "question").length,
      purchases: parts.filter((p) => p.kind === "purchase").length,
      hours: parts.filter((p) => p.kind === "hours").length,
    };
  }, [cards]);

  /** Drop one part the moment the builder acts; the card goes when it empties. */
  const removePart = useCallback((partId: string) => {
    setCards((prev) =>
      prev
        .map((c) => ({ ...c, parts: c.parts.filter((p) => p.id !== partId) }))
        .filter((c) => c.parts.length > 0)
    );
  }, []);

  const markForwarded = useCallback((partId: string) => {
    setCards((prev) =>
      prev.map((c) => ({
        ...c,
        parts: c.parts.map((p) => (p.id === partId ? { ...p, visibleToClient: true } : p)),
      }))
    );
  }, []);

  return { cards, settled, counts, loading, reload: load, removePart, markForwarded };
}
