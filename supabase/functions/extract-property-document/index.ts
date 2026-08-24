/**
 * extract-property-document — read the FACTS out of one of the home's papers (P5).
 *
 * Purchase price, possession date, living area, build year, monthly fee,
 * property designation, BRF name/org number — the things a household needs
 * years later and never wants to dig out of a 40-page PDF again.
 *
 * THIS IS AN EXPLICIT STEP, NEVER AUTOMATIC. A köpekontrakt carries the
 * seller's personal number: a third party who never agreed to anything with
 * this app. So (1) the caller must be a signed-in user (not the anon key),
 * (2) the model is told to leave identifiers out, and (3) the output is
 * scrubbed with a regex before it leaves this function — belt and braces,
 * because a model that is 99% obedient still leaks on the hundredth contract.
 *
 * No profit calculation happens here or anywhere: these are facts from the
 * documents, shown as source material. The tax rules for improvement costs
 * are a separate decision with its own rule engine (plan §1.3).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5002',
  'http://localhost:3000',
  'https://app.renofine.com',
  'https://renofine.com',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

/** Enough for the first two pages, which is where every fact below lives. */
const MAX_TEXT_CHARS = 8000;
const MODEL = 'gpt-4o-mini';

export interface PropertyFacts {
  address: { street: string; postal_code: string | null; city: string | null } | null;
  purchase_price: number | null;
  contract_date: string | null;
  possession_date: string | null;
  living_area_sqm: number | null;
  build_year: number | null;
  property_designation: string | null;
  brf_name: string | null;
  brf_org_number: string | null;
  apartment_number: string | null;
  monthly_fee: number | null;
  tenure: 'bostadsratt' | 'aganderatt' | 'hyresratt' | null;
}

function buildSystemPrompt(): string {
  return `You read Swedish home documents (köpekontrakt, överlåtelseavtal, upplåtelseavtal, köpebrev, objektsbeskrivning, besiktningsprotokoll, energideklaration, taxeringsbeslut, likvidavräkning, årsredovisning) and extract FACTS ABOUT THE HOME.

EXTRACT (null when absent — never guess):
- address: the OBJECT's address (the home the document is about) — {"street": "Storgatan 5", "postal_code": "114 25", "city": "Stockholm"}. Never the seller's, buyer's, broker's or company's address.
- purchase_price: köpeskilling in SEK as a number (4250000, not "4 250 000 kr").
- contract_date: the date the agreement was signed, ISO YYYY-MM-DD.
- possession_date: tillträdesdag, ISO YYYY-MM-DD.
- living_area_sqm: boarea in m² as a number.
- build_year: byggår as a 4-digit number.
- property_designation: fastighetsbeteckning, e.g. "Lidingö Lingonet 4" (äganderätt only; null for bostadsrätt).
- brf_name: the housing association's name, e.g. "Brf Storgården".
- brf_org_number: the association's organisation number, e.g. "769612-3456". This is a COMPANY number (third digit ≥ 2) — it is not a personal number.
- apartment_number: lägenhetsnummer as the association writes it, e.g. "1203". Not Lantmäteriet's 4-digit LGH number unless it is the only one.
- monthly_fee: månadsavgift in SEK as a number.
- tenure: "bostadsratt" if the document concerns a bostadsrätt (överlåtelseavtal, upplåtelseavtal, förening, andel), "aganderatt" if it concerns a fastighet with a fastighetsbeteckning/lagfart, "hyresratt" for a rental, else null.

NEVER OUTPUT — leave out completely, in every field:
- personnummer (YYMMDD-XXXX / YYYYMMDD-XXXX) of anyone
- bank account numbers, bankgiro, IBAN, OCR numbers, klientmedelskonto
- phone numbers, e-mail addresses
- the names of any person (buyer, seller, broker, inspector)

Return ONLY valid JSON with exactly these keys:
{"address": {"street": "...", "postal_code": "...", "city": "..."} | null, "purchase_price": 0 | null, "contract_date": "YYYY-MM-DD" | null, "possession_date": "YYYY-MM-DD" | null, "living_area_sqm": 0 | null, "build_year": 0 | null, "property_designation": "..." | null, "brf_name": "..." | null, "brf_org_number": "..." | null, "apartment_number": "..." | null, "monthly_fee": 0 | null, "tenure": "bostadsratt" | "aganderatt" | "hyresratt" | null}`;
}

/**
 * Swedish personal numbers, and nothing else.
 *
 * Personnummer: YYMMDD(-|+)XXXX or YYYYMMDD-XXXX. The MONTH is the tell: a
 * person's is 01–12. An organisation number looks the same shape (769612-3456)
 * but its third digit is ≥ 2 by definition, so its "month" is ≥ 20 and it is
 * never matched — which is what lets the BRF's org number, a fact we want,
 * through. Coordination numbers add 60 to the day, hence the 61–91 day forms.
 * Word bounds keep a purchase price or an OCR number (no date inside) intact.
 */
const PNR_PATTERN =
  /\b(?:19|20)?\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01]|6[1-9]|[78]\d|9[01])[-+]?\d{4}\b/g;

function scrubIdentifiers(json: string): { text: string; hits: number } {
  let hits = 0;
  const text = json.replace(PNR_PATTERN, () => {
    hits += 1;
    return '[borttaget]';
  });
  return { text, hits };
}

// --- aidev-admin: thin push adapter (observability, fail-silent) ---
function traceLLM(record: Record<string, unknown>) {
  const key = Deno.env.get('AIDEV_INGEST_KEY');
  if (!key) return;
  const endpoint = Deno.env.get('AIDEV_ENDPOINT') || 'http://localhost:5007';
  try {
    fetch(`${endpoint}/api/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ingest-key': key },
      body: JSON.stringify({ project: 'renofine', ...record }),
    }).catch(() => {});
  } catch {
    /* observability must never sink the request */
  }
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^\d.,-]/g, '').replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) && v.trim() !== '' ? n : null;
  }
  return null;
}
function asIsoDate(v: unknown): string | null {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}
function asText(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function narrow(raw: Record<string, unknown>): PropertyFacts {
  const addrRaw = raw.address && typeof raw.address === 'object' ? (raw.address as Record<string, unknown>) : null;
  const street = addrRaw ? asText(addrRaw.street) : null;
  const tenure = raw.tenure;
  return {
    // A street without a number is a neighbourhood, not a home.
    address: street && /\d/.test(street)
      ? { street, postal_code: asText(addrRaw!.postal_code), city: asText(addrRaw!.city) }
      : null,
    purchase_price: asNumber(raw.purchase_price),
    contract_date: asIsoDate(raw.contract_date),
    possession_date: asIsoDate(raw.possession_date),
    living_area_sqm: asNumber(raw.living_area_sqm),
    build_year: (() => {
      const y = asNumber(raw.build_year);
      return y && y >= 1500 && y <= 2100 ? Math.round(y) : null;
    })(),
    property_designation: asText(raw.property_designation),
    brf_name: asText(raw.brf_name),
    brf_org_number: asText(raw.brf_org_number),
    apartment_number: asText(raw.apartment_number),
    monthly_fee: asNumber(raw.monthly_fee),
    tenure: tenure === 'bostadsratt' || tenure === 'aganderatt' || tenure === 'hyresratt' ? tenure : null,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }
  const headers = { ...getCorsHeaders(req), 'Content-Type': 'application/json' };

  try {
    // A signed-in person only. The anon key is a valid JWT too, and this
    // endpoint spends money on documents that belong to real households.
    // getUser() must be handed the token explicitly: with no browser session
    // in Deno it otherwise answers "Auth session missing" for every caller.
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );
    const { data: { user }, error: userError } = token
      ? await supabase.auth.getUser(token)
      : { data: { user: null }, error: new Error('missing token') };
    if (userError || !user || (user as { is_anonymous?: boolean }).is_anonymous) {
      return new Response(JSON.stringify({ error: 'Sign in to read out document details' }), { headers, status: 401 });
    }

    const body = await req.json();
    const text = typeof body.text === 'string' ? body.text.slice(0, MAX_TEXT_CHARS) : '';
    const category = typeof body.category === 'string' ? body.category : 'other';
    const fileName = typeof body.fileName === 'string' ? body.fileName : 'document';
    const tenureHint = typeof body.tenureHint === 'string' ? body.tenureHint : null;
    if (!text.trim()) {
      return new Response(JSON.stringify({ error: 'text is required' }), { headers, status: 400 });
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

    const userContent =
      `Document category (as filed by the user): ${category}\n` +
      (tenureHint ? `Known tenure: ${tenureHint}\n` : '') +
      `File name: "${fileName}"\n\nDocument text:\n\n${text}\n\nExtract the facts about the home.`;

    const t0 = Date.now();
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: userContent },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 600,
        temperature: 0,
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }
    const data = await response.json();
    traceLLM({
      model: MODEL,
      label: 'lab:renofine:property-extract',
      tokens: { in: data.usage?.prompt_tokens || 0, out: data.usage?.completion_tokens || 0 },
      latencyMs: Date.now() - t0,
      meta: { category },
    });

    const rawContent: string = data.choices?.[0]?.message?.content ?? '{}';
    // Scrub BEFORE parsing so an identifier hiding in any string field is
    // caught, whatever key the model put it under.
    const { text: scrubbedText, hits } = scrubIdentifiers(rawContent);
    if (hits > 0) console.warn(`extract-property-document: scrubbed ${hits} identifier(s) the model was told to omit`);

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(scrubbedText);
    } catch {
      console.error('extract-property-document: unparseable model output');
      return new Response(JSON.stringify({ error: 'Could not read the document' }), { headers, status: 502 });
    }

    const facts = narrow(parsed);
    return new Response(JSON.stringify({ facts, scrubbed: hits, model: MODEL }), { headers, status: 200 });
  } catch (error) {
    console.error('extract-property-document failed:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers, status: 500 },
    );
  }
});
