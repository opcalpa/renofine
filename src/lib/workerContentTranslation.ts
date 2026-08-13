/**
 * Shared runtime translation for worker-facing free text.
 *
 * get-worker-data substitutes PERSISTENT translations (task/room/object titles,
 * descriptions, checklists) server-side. But a handful of free-text fields are
 * translated at RUNTIME via translate-comments so they stay fresh without a
 * re-invite: non-worker messages, the welcome message, wall-anchored notes,
 * object finish instructions, and instruction-image descriptions.
 *
 * Both the real worker view (WorkerView) and the owner's faithful preview
 * (WorkerInstructionsView) run this exact pass, so the preview shows precisely
 * what the worker sees — no drift between two copies of the prefix protocol.
 */
import { supabase } from "@/integrations/supabase/client";

export const WELCOME_ID = "__welcome__";
export const WN_PREFIX = "wn:";
export const FIN_PREFIX = "fin:";
export const II_PREFIX = "ii:";

interface TranslatableData {
  welcomeMessage?: string | null;
  tasks: Array<{
    messages: Array<{ id: string; content: string; isWorker: boolean }>;
    instructionImages?: Array<{ id: string; description: string }>;
  }>;
  wallNotes?: Array<{ id: string; text?: string | null }> | null;
  floorPlanObjects?: Array<{ id: string; finish?: string | null }> | null;
  wallObjects?: Array<{ id: string; finish?: string | null }> | null;
}

/** True when the language warrants runtime translation (sv/en are the source). */
export function needsRuntimeTranslation(lang: string | null | undefined): boolean {
  return !!lang && lang !== "sv" && lang !== "en";
}

/**
 * Collect every runtime-translatable field, translate them in one call, and
 * return a map keyed by the prefixed ids (WELCOME_ID / wn: / fin: / ii: / raw
 * message id). Returns an empty map on any failure — callers fall back to the
 * untranslated originals.
 */
export async function fetchWorkerRuntimeTranslations(
  data: TranslatableData,
  targetLanguage: string,
): Promise<Map<string, string>> {
  const items: Array<{ id: string; content: string }> = [];

  for (const task of data.tasks) {
    for (const m of task.messages) {
      if (!m.isWorker && m.content && !m.content.startsWith("🎤")) {
        items.push({ id: m.id, content: m.content });
      }
    }
    for (const img of task.instructionImages ?? []) {
      if (img.description?.trim()) items.push({ id: II_PREFIX + img.id, content: img.description });
    }
  }
  if (data.welcomeMessage) items.push({ id: WELCOME_ID, content: data.welcomeMessage });
  for (const n of data.wallNotes ?? []) {
    if (n.text?.trim()) items.push({ id: WN_PREFIX + n.id, content: n.text });
  }
  for (const o of [...(data.floorPlanObjects ?? []), ...(data.wallObjects ?? [])]) {
    if (o.finish?.trim()) items.push({ id: FIN_PREFIX + o.id, content: o.finish });
  }

  if (items.length === 0) return new Map();

  try {
    const { data: trData } = await supabase.functions.invoke("translate-comments", {
      body: { comments: items, targetLanguage },
    });
    if (!trData?.translations) return new Map();
    return new Map<string, string>(
      (trData.translations as Array<{ id: string; translatedContent: string }>).map((t) => [
        t.id,
        t.translatedContent,
      ]),
    );
  } catch {
    return new Map();
  }
}
