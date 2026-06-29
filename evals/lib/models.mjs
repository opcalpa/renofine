// One call surface for both providers — this is what lets the suite compare
// gpt-4o-mini ↔ gpt-4o ↔ claude and answer "should we switch model/provider?".

function stripFences(text) {
  return (text || "").trim()
    .replace(/^```json?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "");
}

export function safeParseJson(text) {
  try {
    return { ok: true, value: JSON.parse(stripFences(text)) };
  } catch {
    return { ok: false, value: null, raw: text };
  }
}

// --- aidev-admin: tunn push-adapter (observability) ---
// Pushar en trace per LLM-anrop till aidev-admin (/api/ingest), taggad med project.
// Fire-and-forget och fail-silent: observability far ALDRIG krascha en eval-korning.
// Konfig via env (evals/.env): AIDEV_INGEST_KEY kravs, AIDEV_ENDPOINT/AIDEV_PROJECT valfria.
const AIDEV_ENDPOINT = process.env.AIDEV_ENDPOINT || "http://localhost:5007";
const AIDEV_PROJECT = process.env.AIDEV_PROJECT || "renofine";
function traceLLM(record) {
  const key = process.env.AIDEV_INGEST_KEY;
  if (!key) return; // ingen nyckel -> ingen instrumentering (no-op)
  try {
    fetch(`${AIDEV_ENDPOINT}/api/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-ingest-key": key },
      body: JSON.stringify({ project: AIDEV_PROJECT, ...record }),
    }).catch(() => {});
  } catch { /* fail-silent */ }
}

// Returns the raw assistant text. temperature defaults to 0.1 (matches prod).
// jsonObject:true sends OpenAI's response_format json_object (mirrors functions
// that use it, e.g. parse-renovation-description). Ignored for Claude.
export async function callModel(model, system, user, { temperature = 0.1, maxTokens = 2000, jsonObject = false, label } = {}) {
  if (model.startsWith("claude")) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY not set (needed for " + model + ")");
    const t0 = Date.now();
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const data = await res.json();
    traceLLM({ model, tokens: { in: data.usage?.input_tokens || 0, out: data.usage?.output_tokens || 0 }, latencyMs: Date.now() - t0, label });
    return (data.content || []).map((b) => b.text || "").join("");
  }

  // default: OpenAI chat completions
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set (needed for " + model + ")");
  const body = {
    model,
    temperature,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  if (jsonObject) body.response_format = { type: "json_object" };
  const t0 = Date.now();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  traceLLM({ model, tokens: { in: data.usage?.prompt_tokens || 0, out: data.usage?.completion_tokens || 0 }, latencyMs: Date.now() - t0, label });
  return data.choices?.[0]?.message?.content || "";
}

// DeepL target-language codes for the langs our suite uses. DeepL is the
// "commodity machine translation" baseline in the head-to-head — it translates
// raw strings with no construction-domain awareness, which is exactly what we
// want to expose as inferior on color codes / ceiling-vs-wall meaning.
export const DEEPL_TARGET = {
  en: "EN-US", de: "DE", pl: "PL", uk: "UK", sv: "SV", es: "ES", fi: "FI", ar: "AR",
};

// Translate an array of strings via DeepL. One API call, order preserved.
// Free keys end with ":fx" and use the free host. Throws (caller skips deepl)
// if DEEPL_API_KEY is unset or the target language is unsupported.
export async function callDeepL(texts, lang, sourceLang = "SV") {
  const key = process.env.DEEPL_API_KEY;
  if (!key) throw new Error("DEEPL_API_KEY not set (needed for the deepl engine)");
  const target = DEEPL_TARGET[lang];
  if (!target) throw new Error(`DeepL has no target mapping for lang "${lang}"`);
  if (!texts.length) return [];
  const host = key.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
  const res = await fetch(`${host}/v2/translate`, {
    method: "POST",
    headers: { Authorization: `DeepL-Auth-Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: texts, target_lang: target, source_lang: sourceLang }),
  });
  if (!res.ok) throw new Error(`DeepL ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.translations || []).map((t) => t.text);
}
