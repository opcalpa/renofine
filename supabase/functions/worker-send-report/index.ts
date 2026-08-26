import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { checkRateLimit, rateLimitedBody } from "../_shared/rateLimit.ts";
import { parseReport, needsModelPass, type ParsedReport, type ReportPart } from "../_shared/fieldReport.ts";

/**
 * worker-send-report — one report from site, however many parts it carries.
 *
 * Replaces the "pick exactly one of four" flow. A worker writes, speaks or
 * photographs what happened and ticks only what applies; this endpoint reads
 * the rest and writes every row it implies in one go, all linked to one
 * `field_reports` row so the builder gets ONE card with one action per part.
 *
 * Voice is transcribed here rather than stored raw. Storing the audio meant
 * the builder received a sound file with no text and no translation — the one
 * thing a Polish voice note must not be.
 *
 * Nothing here is irreversible: hours and purchases arrive unapproved and wait
 * for the builder. A misreading costs a correction, never money.
 *
 * verify_jwt = false, like its worker siblings: the token in the link is the
 * gate, not a JWT. That is exactly why the rate limit passes trustJwt = false
 * — on an unverified endpoint any caller can mint a fresh `sub` per request,
 * so an authenticated tier would be a tier anyone could grant themselves.
 * The cap therefore keys on IP for everyone.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

const RATE_LIMIT_SCOPE = "worker-send-report";
// One tier in practice: with trustJwt = false every caller counts as anon.
const RATE_LIMIT_TIERS = { anon: 120, authenticated: 120 };

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5002",
  "http://localhost:3000",
  "https://app.renofine.com",
  "https://renofine.com",
];

// Statuses a worker report may move. A decision the PM already made
// ('completed', 'awaiting_review', 'cancelled') is never undone from the field.
const TRANSITIONABLE_STATUSES = new Set(["planned", "to_do", "waiting", "in_progress"]);

const TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";
const PARSE_MODEL = "gpt-4o-mini";

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonResponse(data: unknown, status: number, req: Request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

/** Speech to text. Empty string on any failure — the report still goes through. */
async function transcribe(audio: File, language: string | null): Promise<string> {
  if (!OPENAI_API_KEY) return "";
  try {
    const form = new FormData();
    form.append("model", TRANSCRIBE_MODEL);
    form.append("file", audio, audio.name || "voice.webm");
    form.append("response_format", "json");
    if (language) form.append("language", language);
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form,
    });
    if (!res.ok) {
      console.error("Transcription failed:", res.status, await res.text());
      return "";
    }
    const data = await res.json();
    return typeof data?.text === "string" ? data.text.trim() : "";
  } catch (err) {
    console.error("Transcription error:", err);
    return "";
  }
}

/**
 * The one model call, made only when the text plainly carries more than the
 * regex found. Returns null on anything unexpected — the regex result stands.
 */
async function modelParse(text: string): Promise<ReportPart[] | null> {
  if (!OPENAI_API_KEY) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: PARSE_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'You read a construction worker\'s message, in any language, and list only the parts that are clearly there. ' +
              'Reply as JSON: {"parts":[{"kind":"hours"|"progress"|"purchase","value":number,"name":string}]}. ' +
              'hours = hours worked (multiply by crew size if stated). progress = percent complete 0-100. ' +
              'purchase = material asked for, value is the quantity, name is the product. ' +
              'Omit anything you are not sure about. Never invent numbers. Reply {"parts":[]} if nothing is clear.',
          },
          { role: "user", content: text.slice(0, 800) },
        ],
      }),
    });
    if (!res.ok) {
      console.error("Parse model failed:", res.status);
      return null;
    }
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content;
    if (typeof raw !== "string") return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.parts)) return null;

    const out: ReportPart[] = [];
    for (const p of parsed.parts) {
      const kind = p?.kind;
      const value = typeof p?.value === "number" ? p.value : null;
      if (kind === "hours" && value != null && value > 0 && value <= 24) {
        out.push({ kind: "hours", value, reason: "read from the message" });
      } else if (kind === "progress" && value != null && value >= 0 && value <= 100) {
        out.push({ kind: "progress", value, reason: "read from the message" });
      } else if (kind === "purchase" && typeof p?.name === "string" && p.name.trim()) {
        out.push({
          kind: "purchase",
          value: value != null && value > 0 ? value : undefined,
          name: String(p.name).slice(0, 200).trim(),
          reason: "read from the message",
        });
      }
    }
    return out;
  } catch (err) {
    console.error("Parse model error:", err);
    return null;
  }
}

function numOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * What the worker asked to be ordered.
 *
 * `purchaseItems` is a JSON list — several things can be needed in one breath.
 * The single `purchaseName` form is still read so a page loaded before this
 * shipped (the worker view is a link people keep open on site all day) does
 * not silently lose its order.
 */
const MAX_PURCHASE_ITEMS = 20;

function readPurchases(form: FormData): Array<{ quantity: number | null; name: string }> {
  const raw = form.get("purchaseItems");
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map((it) => ({
            quantity: numOrNull(it?.quantity),
            name: String(it?.name ?? "").slice(0, 200).trim(),
          }))
          .filter((it) => it.name.length > 0)
          .slice(0, MAX_PURCHASE_ITEMS);
      }
    } catch (e) {
      console.error("purchaseItems parse error:", e);
    }
  }
  const legacy = form.get("purchaseName");
  if (legacy) {
    const name = String(legacy).slice(0, 200).trim();
    if (name) return [{ quantity: numOrNull(form.get("purchaseQuantity")), name }];
  }
  return [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    const rl = await checkRateLimit(req, RATE_LIMIT_SCOPE, RATE_LIMIT_TIERS, false);
    if (!rl.allowed) return jsonResponse(rateLimitedBody({ parts: [] }), 429, req);

    const form = await req.formData();
    const token = String(form.get("token") ?? "");
    if (!token) return jsonResponse({ error: "Token is required" }, 400, req);

    let text = String(form.get("text") ?? "").trim();
    const rawTaskId = (form.get("taskId") as string) || null;
    const photoFile = form.get("photo") as File | null;
    const voiceFile = form.get("voice") as File | null;

    // What the worker ticked. Always believed — a person who ticked "Klart"
    // said so, and no parser gets to disagree.
    const explicit = {
      done: String(form.get("done") ?? "") === "true",
      progress: numOrNull(form.get("progress")),
      hours: numOrNull(form.get("hours")),
      purchases: readPurchases(form),
    };

    if (
      !text && !photoFile && !voiceFile && !explicit.done &&
      explicit.progress == null && explicit.hours == null && explicit.purchases.length === 0
    ) {
      return jsonResponse({ error: "Nothing to send" }, 400, req);
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: tokenRecord } = await sb
      .from("worker_access_tokens")
      .select("id, project_id, assigned_task_ids, created_by_user_id, worker_name, worker_language, can_create_purchases")
      .eq("token", token)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (!tokenRecord) return jsonResponse({ error: "Invalid or expired token" }, 403, req);

    const assignedIds: string[] = tokenRecord.assigned_task_ids || [];
    let taskId: string | null = rawTaskId && assignedIds.includes(rawTaskId) ? rawTaskId : null;
    // With exactly one assignment there is nothing to choose, so the report
    // belongs to it. Without this a report lands on the project and moves nothing.
    if (!taskId && assignedIds.length === 1) taskId = assignedIds[0];

    // ---- Voice becomes text, and goes through the same reading as typing ----
    let voiceUrl: string | null = null;
    if (voiceFile) {
      const ext = (voiceFile.name?.split(".").pop() || "webm").toLowerCase();
      const path = `projects/${tokenRecord.project_id}/voice/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await sb.storage
        .from("project-files")
        .upload(path, new Uint8Array(await voiceFile.arrayBuffer()), {
          contentType: voiceFile.type || "audio/webm",
          upsert: false,
        });
      if (upErr) console.error("Voice upload error:", upErr);
      else voiceUrl = path;

      if (!text) {
        text = await transcribe(voiceFile, tokenRecord.worker_language || null);
      }
    }

    // ---- Read the report ----
    let parsed: ParsedReport = parseReport(text, explicit);
    if (needsModelPass(text, parsed)) {
      const extra = await modelParse(text);
      if (extra && extra.length > 0) {
        const kinds = new Set(parsed.parts.map((p) => p.kind));
        const merged = [...parsed.parts];
        for (const p of extra) {
          if (!kinds.has(p.kind)) {
            merged.push(p);
            kinds.add(p.kind);
          }
        }
        parsed = { parts: merged, source: "model" };
      }
    }

    // A purchase is only ever created when the worker is allowed to ask for one.
    if (tokenRecord.can_create_purchases === false) {
      parsed = { ...parsed, parts: parsed.parts.filter((p) => p.kind !== "purchase") };
    }

    const part = (kind: string) => parsed.parts.find((p) => p.kind === kind);

    // ---- The report row everything else hangs on ----
    const { data: report, error: reportError } = await sb
      .from("field_reports")
      .insert({
        project_id: tokenRecord.project_id,
        worker_token_id: tokenRecord.id,
        task_id: taskId,
        raw_text: text || null,
        voice_url: voiceUrl,
        parsed,
      })
      .select("id")
      .single();

    if (reportError || !report) {
      console.error("Field report insert error:", reportError);
      return jsonResponse({ error: "Failed to save report" }, 500, req);
    }
    const reportId = report.id;

    // ---- Photo ----
    let photoRow: { id: string; url: string; caption: string | null } | null = null;
    if (photoFile) {
      const ext = (photoFile.name?.split(".").pop() || "jpg").toLowerCase();
      const path = `projects/${tokenRecord.project_id}/${taskId ? "task" : "project"}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await sb.storage
        .from("project-files")
        .upload(path, new Uint8Array(await photoFile.arrayBuffer()), {
          contentType: photoFile.type || "image/jpeg",
          upsert: false,
        });
      if (upErr) {
        console.error("Photo upload error:", upErr);
      } else {
        const { data: inserted, error: photoErr } = await sb
          .from("photos")
          .insert({
            url: path,
            linked_to_type: taskId ? "task" : "project",
            linked_to_id: taskId || tokenRecord.project_id,
            uploaded_by_user_id: tokenRecord.created_by_user_id,
            caption: tokenRecord.worker_name,
            // Only a completion claim documents finished work. Anything else is
            // context for what is being said, never proof the job is done.
            kind: part("done") ? "after" : "during",
            source: "worker",
            mime_type: photoFile.type || "image/jpeg",
          })
          .select("id, url, caption")
          .single();
        if (photoErr) console.error("Photo insert error:", photoErr);
        else photoRow = inserted;
      }
    }

    // ---- The words, as a comment ----
    const questionPart = part("question");
    const intent = questionPart ? "fraga" : part("done") ? "klart" : part("purchase") ? "behover" : "info";
    const content = text || (voiceUrl ? "🎤" : photoRow ? "📷" : "");

    const { data: comment, error: commentError } = await sb
      .from("comments")
      .insert({
        content,
        entity_type: taskId ? "task" : "project",
        entity_id: taskId || tokenRecord.project_id,
        task_id: taskId,
        project_id: tokenRecord.project_id,
        created_by_user_id: tokenRecord.created_by_user_id,
        author_display_name: `${tokenRecord.worker_name} (worker)`,
        intent,
        // Only a question is owed an answer; everything else arrives settled.
        is_resolved: !questionPart,
        // The field talks to the BUILDER, not to the builder's customer.
        visible_to_client: false,
        report_id: reportId,
        images: photoRow ? [{ id: photoRow.id, url: photoRow.url, caption: photoRow.caption }] : undefined,
      })
      .select("id")
      .single();

    if (commentError) console.error("Comment insert error:", commentError);

    // ---- Hours: unapproved, waiting for the builder, like a purchase ----
    const hoursPart = part("hours");
    if (hoursPart?.value) {
      const { error: timeError } = await sb.from("time_entries").insert({
        project_id: tokenRecord.project_id,
        task_id: taskId,
        // The token IS the person. Crediting the owner would put the worker's
        // day on the owner's name.
        user_id: null,
        worker_token_id: tokenRecord.id,
        date: new Date().toISOString().slice(0, 10),
        hours: hoursPart.value,
        description: hoursPart.reason,
        approved: false,
        report_id: reportId,
      });
      if (timeError) console.error("Time entry insert error:", timeError);
    }

    // ---- Purchase: request PO + material, same invariant as everywhere ----
    // Several things needed on the same day are ONE request with several
    // lines, not several requests. That is how the builder actually orders,
    // and it keeps one errand from filling the inbox with three cards.
    const purchaseParts = parsed.parts.filter((p) => p.kind === "purchase" && p.name);
    if (purchaseParts.length > 0) {
      const { data: po, error: poError } = await sb
        .from("purchase_orders")
        .insert({
          project_id: tokenRecord.project_id,
          status: "requested",
          total: 0,
          source: "manual",
          created_by_user_id: tokenRecord.created_by_user_id,
          notes: [...new Set(purchaseParts.map((p) => p.reason))].join("; "),
        })
        .select("id")
        .single();
      if (poError || !po) {
        console.error("PO insert error:", poError);
      } else {
        const { error: matError } = await sb.from("materials").insert(
          purchaseParts.map((p) => ({
            project_id: tokenRecord.project_id,
            purchase_order_id: po.id,
            task_id: taskId,
            name: p.name,
            quantity: p.value ?? 1,
            // No unit unless the worker said one. "5 st × worków fugi" invents
            // a Swedish word inside a Polish sentence; "5 × worków fugi" does not.
            unit: null,
            status: "submitted",
            created_by_user_id: tokenRecord.created_by_user_id,
            submitted_by_worker_token_id: tokenRecord.id,
            exclude_from_budget: false,
            report_id: reportId,
          }))
        );
        if (matError) {
          console.error("Material insert error:", matError);
          // The PO must not survive without its lines — materials_po_invariant_check.
          await sb.from("purchase_orders").delete().eq("id", po.id);
        }
      }
    }

    // ---- Progress and status ----
    let taskStatus: string | null = null;
    if (taskId) {
      const progressPart = part("progress");
      const donePart = part("done");
      const update: Record<string, unknown> = {};
      if (progressPart?.value != null) update.progress = progressPart.value;
      // "Klart", or 100 %, hands the work off for review — the same signal a
      // completion photo has always sent.
      const handsOff = !!donePart || (progressPart?.value ?? 0) >= 100;
      if (handsOff) update.progress = 100;

      if (Object.keys(update).length > 0) {
        const { data: taskRow } = await sb.from("tasks").select("status").eq("id", taskId).single();
        if (handsOff && taskRow && TRANSITIONABLE_STATUSES.has(taskRow.status)) {
          update.status = "awaiting_review";
          taskStatus = "awaiting_review";
        }
        update.updated_at = new Date().toISOString();
        const { error: taskError } = await sb.from("tasks").update(update).eq("id", taskId);
        if (taskError) console.error("Task update error:", taskError);
      }
    }

    // The receipt the worker sees: what we understood, in their own words'
    // order. They can change it; nothing that costs money has happened yet.
    return jsonResponse(
      {
        success: true,
        reportId,
        commentId: comment?.id ?? null,
        text,
        parts: parsed.parts,
        taskStatus,
      },
      200,
      req
    );
  } catch (error) {
    console.error("worker-send-report error:", error);
    return jsonResponse({ error: (error as Error).message }, 500, req);
  }
});
