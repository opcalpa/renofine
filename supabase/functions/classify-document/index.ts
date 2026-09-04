import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import {
  scopeJsonShape,
  scopeRules,
  validateScope,
  type RenovationScope,
} from '../_shared/renovationScope.ts';
import { checkRateLimit, rateLimitedBody } from '../_shared/rateLimit.ts';

/**
 * `verify_jwt = true` is NOT a limit here: the publishable anon key is a validly
 * signed JWT, so the platform waves it through and the guest folder drop travels
 * that way on purpose. The anon tier has to fit one honest guest drop (capped at
 * 20 files client-side, ~2 calls per file) and nothing beyond it.
 */
const RATE_LIMIT_SCOPE = 'classify-document';
const RATE_LIMIT_TIERS = { anon: 60, authenticated: 400 };

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

type DocumentType =
  | 'quote' | 'invoice' | 'receipt' | 'ata' | 'delivery_note'
  | 'contract' | 'inspection_report' | 'certificate' | 'permit'
  | 'floor_plan' | 'specification' | 'product_image' | 'other';

/**
 * P1: where the document's OBJECT address came from.
 *  - 'property_document' — the document is about the home itself (köpekontrakt,
 *    objektsbeskrivning, besiktningsprotokoll, energideklaration). High trust.
 *  - 'site_field'        — a job document that names the work site in a field
 *    such as "Objekt", "Arbetsplats", "Arbetsställe", "Leveransadress". Medium.
 *  - null                — no object address. ALWAYS null for receipts: the
 *    address on a receipt is the store's, and ten Bauhaus receipts would
 *    otherwise turn a home into "Sickla".
 */
type AddressSource = 'property_document' | 'site_field' | null;

interface PropertyAddress {
  street: string;
  postal_code: string | null;
  city: string | null;
}

/**
 * Document classes that may shape a project. Mirrors SCOPE_BEARING in
 * src/services/ingestProjectFolder.ts — and this copy is the one that decides,
 * because it runs on the server where the model's answer lands first.
 */
// Mirrors `scopeBearing` in src/services/smartUploadService.ts's catalog.
// ÄTA carries scope by definition — it IS a change to the agreed work.
const SCOPE_BEARING: readonly DocumentType[] = ['quote', 'contract', 'specification', 'ata'];

interface ClassificationResult {
  type: DocumentType;
  confidence: number;
  summary: string;
  vendor_name: string | null;
  invoice_date: string | null;
  invoice_amount: number | null;
  suggested_action: 'extract_tasks' | 'extract_purchase' | 'import_to_canvas' | 'store_only';
  property_address: PropertyAddress | null;
  address_source: AddressSource;
  /**
   * The work scope this document describes — present ONLY when the caller asked
   * for it AND the document is one that may carry scope. Null means "nothing to
   * act on", which is the honest answer for a CV, a receipt or a bank statement.
   */
  scope: RenovationScope | null;
  /**
   * True when the document was longer than the scope reader could take, so what
   * came back describes the beginning of it and not the whole. Never silent:
   * the drop says so rather than letting missing rooms look like absent ones.
   */
  text_truncated: boolean;
}

/**
 * `scopeLang` turns this into ONE call that answers both "what is this?" and
 * "what work does it describe?". The folder ingest used to ask those with two
 * round trips over the same text; a quote, a contract and a specification are
 * the most common files in a real project folder, and each of them paid twice.
 */
function buildSystemPrompt(scopeLang: string | null): string {
  const base = buildClassifyPrompt();
  if (!scopeLang) return base;
  return `${base}

ADDITIONALLY — WORK SCOPE:
If (and only if) the type you chose is "quote", "contract", "specification" or "ata",
also extract the renovation scope the document describes, as a "scope" field.
For EVERY other type — including "other" — set "scope": null. Do not guess a
scope out of a document you could not place: a CV, a bank statement or a
purchase contract for a home describes no renovation, and inventing rooms from
one is worse than returning nothing.

The "scope" field, when present, has this exact structure:
${scopeJsonShape(scopeLang)}

${scopeRules(scopeLang)}

Add "scope" to the SAME JSON object as the classification fields. The
classification "summary" describes the DOCUMENT; the scope's own "summary"
describes the RENOVATION. They are different fields and both may be present.`;
}

function buildClassifyPrompt(): string {
  return `You classify renovation project documents. Analyze the document and determine its type.

ORIENTATION: a photographed document is often rotated — the person shot the paper
as it happened to lie on the table, and no metadata records that. Judge the type
regardless of which way up it sits. A receipt turned sideways is still a receipt,
and calling it "product_image" is how a whole pile of them gets filed as photos
and never read (Carl's 112-receipt drop, 2026-09-01).

DOCUMENT TYPES:
- "quote" — A price offer/estimate from a contractor or supplier. Contains line items with prices, work descriptions, totals. Swedish: "Offert", "Prisförslag", "Anbud".
- "invoice" — A bill requesting payment. Has invoice number, due date, OCR/payment reference, bankgiro. Swedish: "Faktura".
- "receipt" — Proof of payment already made. From retail stores, hardware stores. Swedish: "Kvitto", "Kassakvitto".
- "ata" — A change to work ALREADY agreed: extra, altered or removed work against an existing contract or quote. Swedish: "ÄTA", "ÄTA-arbete", "Ändrings- och tilläggsarbete", "Tilläggsbeställning". Distinguish from "quote": a quote proposes a NEW job; an ÄTA amends one that is already running, and usually references the original order or contract.
- "delivery_note" — A DELIVERY document listing what was shipped, NOT what it cost. Swedish: "Följesedel", "Packsedel", "Leveranssedel", "Lastorder". Tell it apart from a receipt/invoice by what it is missing: no "Att betala", no total to pay, often quantities only, or prices that are clearly not a demand for payment. A följesedel with a small stray number on it is STILL a följesedel — do not call it a receipt because you found a figure.
- "inspection_report" — Inspection or survey report. Swedish: "Besiktningsprotokoll", "Slutbesiktning", "Garantibesiktning", "Överlåtelsebesiktning", "Statusbesiktning".
- "certificate" — A certificate or self-inspection proving work was done correctly. Swedish: "Våtrumsintyg", "Kvalitetsdokument", "GVK", "BKR", "Säker Vatten", "Egenkontroll", "Elinstallationsintyg", "Injusteringsprotokoll".
- "permit" — A decision or permission from an authority or a housing association. Swedish: "Bygglov", "Startbesked", "Slutbesked", "Rivningslov", "Kontrollplan", "Styrelsens godkännande", "Tillstånd från föreningen".
- "floor_plan" — Architectural drawing, blueprint, or floor plan image. Shows rooms, walls, dimensions. Can be a photo of a printed drawing.
- "contract" — Legal agreement, construction contract, work order. Swedish: "Avtal", "Kontrakt", "Beställning", "Hantverkarformuläret", "ABS 18", "Entreprenadkontrakt".
- "specification" — Technical specification, material list, scope of work document without prices. Swedish: "Beskrivning", "Specifikation", "Arbetsbeskrivning".
- "product_image" — Photo of a product, material sample, fixture, appliance, or inspiration image.
- "other" — Anything that doesn't fit above categories.

OBSERVATIONS — report what you SEE, and let the app decide the money family.
Return a "signals" object. These are observations, not judgements: answer each
one from the page in front of you and do not reason about what the document
"must" be. The app ranks the type from them, because a följesedel legitimately
mentions "faktura" in small print (payment terms, dröjsmålsränta, F-skattebevis)
and word-spotting therefore cannot tell the two apart.

"signals": {
  "heading": "<the words printed as the document's own heading, at the top or in
              a corner — e.g. FÖLJESEDEL, FAKTURA, KVITTO, OFFERT. null if none>",
  "text_is_upright": <true if the text runs left-to-right the normal way in the
                      image as given; false if you had to read it sideways or
                      upside down. Answer honestly — this is used to turn the
                      image, not to judge you>,
  "has_payable_total": <true only if a SUM TO PAY is printed: "Att betala",
                        "Summa att betala", "Totalt att betala", "Att erlägga">,
  "has_vat": <true if a VAT/moms AMOUNT is printed (not merely a VAT number)>,
  "has_invoice_number": <true if a field names an invoice number: "Fakturanr",
                         "Fakturanummer">,
  "has_due_date": <true if a payment due date or terms are printed:
                   "Förfallodatum", "Betalningsvillkor", "Förfaller">,
  "has_payment_reference": <true if OCR, bankgiro or plusgiro is given AS A
                            PAYMENT INSTRUCTION for this document>,
  "amount_count": <"none" | "one" | "few" | "many" — roughly how many monetary
                   amounts appear anywhere on the page>
}

A delivery note lists WHAT ARRIVED: quantities, article numbers, often no prices
at all, and no sum to pay. An invoice or receipt is ABOUT money: a total, VAT,
and a way to pay. That structural difference is what separates them — not a word.

THE DOCUMENT'S OWN HEADING DECIDES. Read the heading first — the word printed
at the top of the form, often in the corner — and let it win over anything else
on the page. A "FÖLJESEDEL" that mentions bankgiro, F-skattebevis, dröjsmålsränta
or payment terms in its footer is STILL a följesedel: those words are boilerplate
printed on every form the supplier owns, not a statement about this paper.
Measured failure this rule exists for (2026-09-04): a Beijer följesedel headed
"FÖLJESEDEL / PACKSEDEL, LASTORDER" was called an "invoice", justified with the
word "Faktura" — a word that does not appear anywhere on it.

EVIDENCE IS REQUIRED FOR EVERY SPECIFIC TYPE.
Return a "type_evidence" field: the exact words IN THE DOCUMENT that told you
the type — a heading, a form name, a labelled field ("Följesedel", "Att betala",
"Slutbesked", "Fakturanr"). Quote them; do not paraphrase and do not invent.
If you cannot quote anything, the type is "other" and "type_evidence" is null.
Quote ONLY words you can actually see printed. Do not write the word you would
expect this kind of document to carry — an invented quotation is worse than an
honest null, because it is checked.
This is not a formality: a type you cannot point at is a guess, and a guess is
what we are trying to avoid. "type_evidence" is null for "other".

WHEN YOU ARE NOT SURE, CHOOSE "other". This is an instruction, not a fallback.
A specific type you guessed wrong is WORSE than "other": a receipt filed as
"Avtal" is a paper the person stops looking for, while one in "Övrigt" says
honestly that we do not know, and they can correct it in one click. Only pick a
specific type when the document itself gives you clear evidence — a heading, a
form name, a field. Do not infer the type from the sender, the file name, or
what would be most useful. Set "confidence" to what you actually believe; it is
used to move weak answers to "Övrigt", never to promote them. Do not emit a
habitual 0.95 — a number you give every document carries no information.

SUGGESTED ACTIONS:
- "extract_tasks" — For quotes, specifications, contracts and ÄTA with work items → extract as tasks with budget
- "extract_purchase" — For invoices, receipts → extract as purchase/material record. NEVER for "delivery_note": a delivery note is proof of what arrived, not of what was paid, and booking one as a purchase invents a cost.
- "import_to_canvas" — For floor plans → import as background image on canvas
- "store_only" — For product images, other documents → just save to files

INVOICE/RECEIPT EXTRACTION:
When type is "invoice" or "receipt":
- invoice_date: Extract the invoice date or receipt date as ISO YYYY-MM-DD. Look for "Fakturadatum", "Datum", "Date". Null if not found.
- invoice_amount: Extract the total amount as a number (no currency, no spaces). Look for "Att betala", "Totalt", "Summa", "Total". Null if not extractable.
For other document types, set both to null.

PROPERTY ADDRESS (the address of the HOME the document is about — never the sender's):
- address_source "property_document": the document is ABOUT a property itself — köpekontrakt, köpebrev, överlåtelseavtal, upplåtelseavtal, objektsbeskrivning, besiktningsprotokoll, energideklaration, taxeringsbeslut, lagfart. Extract the object's address ("Objekt", "Fastighet", "Adress", "Lägenhet … på").
- address_source "site_field": a quote, contract, specification or invoice that names WHERE the work is done, in a field like "Objekt", "Arbetsplats", "Arbetsställe", "Leveransadress", "Utförandeadress". Only from such a field.
- address_source null and property_address null in EVERY other case. Receipts ("Kvitto") are ALWAYS null — the address on a receipt is the store's.
- NEVER use the sender's, contractor's, company's, store's or invoice-issuer's address. The letterhead is not the object. If the only address in the document belongs to the company that wrote it, return null.
- property_address: {"street": "Storgatan 5", "postal_code": "114 25", "city": "Stockholm"} — street includes the house number; postal_code/city null when absent. Swedish postal codes are 5 digits, written "114 25".

RULES:
- Be decisive. Pick the most specific type that fits.
- vendor_name: Extract company/store name if visible, null otherwise.
- summary: 1-2 sentences in Swedish describing what the document is.
- confidence: 0.0-1.0

Return ONLY valid JSON. Every key below is REQUIRED, "signals" included:
{
  "type": "invoice",
  "confidence": 0.9,
  "type_evidence": "Faktura",
  "signals": {
    "heading": "FAKTURA",
    "text_is_upright": true,
    "has_payable_total": true,
    "has_vat": true,
    "has_invoice_number": true,
    "has_due_date": true,
    "has_payment_reference": true,
    "amount_count": "many"
  },
  "summary": "Faktura från Bauhaus för golvmaterial, totalt 4 500 kr.",
  "vendor_name": "Bauhaus",
  "invoice_date": "2026-03-15",
  "invoice_amount": 4500,
  "suggested_action": "extract_purchase",
  "property_address": {"street": "Storgatan 5", "postal_code": "114 25", "city": "Stockholm"},
  "address_source": "site_field"
}

Note how "type_evidence" and "signals.heading" AGREE with "type" in that
example. A delivery note would instead be:
{"type": "delivery_note", "type_evidence": "FÖLJESEDEL", "signals":
 {"heading": "FÖLJESEDEL", "has_payable_total": false, "has_vat": false,
  "amount_count": "few"}, "invoice_amount": null, "suggested_action": "store_only"}`;
}

/** Fetch file from Supabase Storage (server-to-server, fast) */
async function fetchFileFromStorage(filePath: string): Promise<{ base64: string; mimeType: string }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data, error } = await supabase.storage
    .from('project-files')
    .download(filePath);

  if (error || !data) {
    throw new Error(`Failed to download file: ${error?.message || 'unknown'}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  // Convert to base64
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  const mimeType = data.type || 'application/octet-stream';

  return { base64, mimeType };
}

/**
 * The address rule enforced in code, not only in the prompt.
 *
 * A receipt can never carry an object address (the prompt says so, but a model
 * that is 95% obedient is still wrong on the twentieth receipt), and a source
 * label the model invented is dropped rather than trusted. Street is required;
 * a "city only" address is no address.
 */
/** Keep only the shapes we asked for; a missing signal is `null`, never a guess. */
function narrowSignals(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const bool = (v: unknown) => (typeof v === 'boolean' ? v : null);
  const count = ['none', 'one', 'few', 'many'];
  return {
    heading: typeof r.heading === 'string' && r.heading.trim() ? r.heading.trim().slice(0, 120) : null,
    text_is_upright: bool(r.text_is_upright),
    has_payable_total: bool(r.has_payable_total),
    has_vat: bool(r.has_vat),
    has_invoice_number: bool(r.has_invoice_number),
    has_due_date: bool(r.has_due_date),
    has_payment_reference: bool(r.has_payment_reference),
    amount_count: typeof r.amount_count === 'string' && count.includes(r.amount_count) ? r.amount_count : null,
  };
}

function narrowAddress(
  type: DocumentType,
  raw: { property_address?: unknown; address_source?: unknown },
): { property_address: PropertyAddress | null; address_source: AddressSource } {
  const none = { property_address: null, address_source: null as AddressSource };
  if (type === 'receipt' || type === 'product_image' || type === 'floor_plan') return none;
  // A följesedel's address is the DELIVERY address, which is the site — but the
  // form has no field naming it as such, so trusting it would be a guess.
  if (type === 'delivery_note') return none;

  const source = raw.address_source;
  if (source !== 'property_document' && source !== 'site_field') return none;

  const addr = raw.property_address;
  if (!addr || typeof addr !== 'object') return none;
  const a = addr as Record<string, unknown>;
  const street = typeof a.street === 'string' ? a.street.trim() : '';
  // A street without a number is a neighbourhood, not a home.
  if (!street || !/\d/.test(street)) return none;

  return {
    property_address: {
      street,
      postal_code: typeof a.postal_code === 'string' && a.postal_code.trim() ? a.postal_code.trim() : null,
      city: typeof a.city === 'string' && a.city.trim() ? a.city.trim() : null,
    },
    address_source: source,
  };
}

/**
 * How much document text the merged call reads. Classification needs the first
 * page; a scope extraction needs the whole quote, and truncating one at 5 000
 * characters is how the last two rooms of a specification disappear. Only the
 * text actually present is sent, so a receipt still costs a receipt.
 *
 * The scope limit is generous rather than tight — roughly a thirty-page
 * specification — because the thing it guards against is not a long document
 * but an absurd one: an OCR pass over a 200-page scan can produce half a
 * million characters, and reading all of it would cost far more than the rooms
 * it contains are worth. Below the limit nothing is lost; above it, the caller
 * is TOLD. A cap that silently reads half a specification and reports rooms as
 * if it read all of it is the kind of quiet wrongness this pipeline exists to
 * avoid.
 */
const TEXT_LIMIT = 5000;
const TEXT_LIMIT_WITH_SCOPE = 60000;

/** An upstream limit or outage — worth waiting out, unlike a bad request. */
class RetryableUpstreamError extends Error {}

/**
 * The AI account has no credits left. Shares HTTP 429 with rate limiting but
 * is its opposite: no amount of waiting or retrying changes it. Surfaced to
 * the client under its own code so the app can say what actually has to happen.
 */
class QuotaExhaustedError extends Error {}

/**
 * Retry a throttled classification with exponential backoff and jitter.
 *
 * Jitter matters more than the delay here: a folder drop fires several calls
 * in the same instant, and without it they all retry in the same instant too,
 * reproducing the burst that caused the 429.
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (!(e instanceof RetryableUpstreamError) || i === attempts - 1) throw e;
      const backoffMs = 700 * 2 ** i + Math.floor(Math.random() * 400);
      console.log(`classify: upstream throttled, retrying in ${backoffMs}ms (attempt ${i + 1})`);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw lastError;
}

async function classifyWithContent(
  content: string,
  fileName: string,
  isImage: boolean,
  isPdf: boolean,
  base64Data?: string,
  mimeType?: string,
  scopeLang?: string | null,
): Promise<ClassificationResult> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  let userContent: unknown[];
  const limit = scopeLang ? TEXT_LIMIT_WITH_SCOPE : TEXT_LIMIT;
  // Only the text path can truncate; an image or a PDF is sent whole.
  const truncated = !isImage && !isPdf && (content?.length ?? 0) > limit;

  if (isImage) {
    userContent = [
      {
        type: 'image_url' as const,
        image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${content}`, detail: 'low' as const },
      },
      { type: 'text' as const, text: `File name: "${fileName}". Classify this document.` },
    ];
  } else if (isPdf && base64Data) {
    // Send PDF directly to GPT-4o-mini (supports file input)
    userContent = [
      {
        type: 'file' as const,
        file: {
          filename: fileName,
          file_data: `data:application/pdf;base64,${base64Data}`,
        },
      },
      { type: 'text' as const, text: `File name: "${fileName}". Classify this document.` },
    ];
  } else {
    userContent = [
      {
        type: 'text' as const,
        text: `File name: "${fileName}". Document text (first ${limit} chars):\n\n${content.substring(0, limit)}\n\nClassify this document.`,
      },
    ];
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: buildSystemPrompt(scopeLang ?? null) },
        { role: 'user', content: userContent },
      ],
      // A scope answer is a whole plan, not a label — 512 tokens truncates it
      // mid-JSON, and a truncated JSON is an unread document.
      max_tokens: scopeLang ? 3000 : 512,
      temperature: 0.1,
      ...(scopeLang ? { response_format: { type: 'json_object' as const } } : {}),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenAI API error:', response.status, errorText);
    // A 429 is TWO different situations wearing the same status code, and
    // telling them apart is the whole point (Carl, 2026-09-01: 102 of these,
    // every one of them an empty account, while the app said "the service was
    // overloaded, try again in a moment" — advice that could never work).
    //
    //   insufficient_quota / credit_balance_exhausted → the account is empty.
    //     Retrying is pure waste; only topping up fixes it, and the person
    //     has to be TOLD that rather than invited to try again.
    //   anything else 429, or 5xx                     → genuine throttling or
    //     an outage. Worth waiting out.
    if (response.status === 429 && /insufficient_quota|credit|billing|quota/i.test(errorText)) {
      throw new QuotaExhaustedError('OpenAI credits exhausted');
    }
    if (response.status === 429 || response.status >= 500) {
      throw new RetryableUpstreamError(`OpenAI API error: ${response.status}`);
    }
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content;
  if (!rawContent) throw new Error('No content in OpenAI response');

  let jsonText = rawContent;
  const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonText = jsonMatch[1].trim();
  const jsonObjectMatch = jsonText.match(/\{[\s\S]*\}/);
  if (jsonObjectMatch) jsonText = jsonObjectMatch[0];

  try {
    const result = JSON.parse(jsonText);
    const validTypes: DocumentType[] = ['quote', 'invoice', 'receipt', 'ata', 'delivery_note', 'contract', 'inspection_report', 'certificate', 'permit', 'floor_plan', 'specification', 'product_image', 'other'];
    const validActions = ['extract_tasks', 'extract_purchase', 'import_to_canvas', 'store_only'];

    const type: DocumentType = validTypes.includes(result.type) ? result.type : 'other';
    const { property_address, address_source } = narrowAddress(type, result);

    // P4.0, enforced in code: only a document class that actually carries work
    // scope may hand rooms and tasks to a project. A model that decided "other"
    // and then listed three rooms anyway is answered with null — this is the one
    // gate that stopped a CV from giving someone's project a kitchen.
    const scope =
      scopeLang && SCOPE_BEARING.includes(type)
        ? validateScope(result.scope, content || '')
        : null;

    return {
      type,
      confidence: typeof result.confidence === 'number' ? result.confidence : 0.5,
      // What the model says it SAW. Checkable, unlike the confidence number —
      // measured 2026-09-04 across 47 real classifications, every single one
      // came back 0.95, so that field carries no signal at all.
      type_evidence:
        typeof result.type_evidence === 'string' && result.type_evidence.trim()
          ? result.type_evidence.trim().slice(0, 200)
          : null,
      // Observations, not a verdict. The client ranks the money family from
      // these — a följesedel mentions "faktura" in its own small print, so no
      // amount of word-spotting can separate it from one (Carl, 2026-09-04).
      signals: narrowSignals(result.signals),
      summary: result.summary || '',
      vendor_name: result.vendor_name || null,
      invoice_date: result.invoice_date || null,
      invoice_amount: typeof result.invoice_amount === 'number' ? result.invoice_amount : null,
      suggested_action: validActions.includes(result.suggested_action) ? result.suggested_action : 'store_only',
      property_address,
      address_source,
      scope,
      text_truncated: truncated,
    };
  } catch {
    console.error('Failed to parse classification:', jsonText.substring(0, 500));
    return { type: 'other', confidence: 0, type_evidence: null, signals: null, summary: '', vendor_name: null, invoice_date: null, invoice_amount: null, suggested_action: 'store_only', property_address: null, address_source: null, scope: null, text_truncated: truncated };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    // Before the body is even read — a hammering caller costs us nothing.
    // trustJwt: true mirrors verify_jwt = true in config.toml (the platform
    // checked the signature, so `sub` can be believed). See _shared/rateLimit.ts.
    const rl = await checkRateLimit(req, RATE_LIMIT_SCOPE, RATE_LIMIT_TIERS, true);
    if (!rl.allowed) {
      return new Response(JSON.stringify(rateLimitedBody({ type: 'other', confidence: 0, type_evidence: null, signals: null })), {
        status: 429,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();

    // `scope: { language }` asks for the merged answer: classification AND the
    // work scope, in one call. Absent → the classic classify-only response.
    const scopeLang: string | null =
      body.scope && typeof body.scope === 'object' && typeof body.scope.language === 'string'
        ? body.scope.language
        : body.scope === true
          ? 'sv'
          : null;

    // NEW: Accept filePath for server-side file fetch (fast path)
    if (body.filePath && body.fileName) {
      const { filePath, fileName } = body;
      console.log('Fast path: fetching file from storage:', filePath);

      const { base64, mimeType } = await fetchFileFromStorage(filePath);
      const isImage = mimeType.startsWith('image/');
      const isPdf = mimeType === 'application/pdf';

      console.log('Classifying document:', fileName, 'mimeType:', mimeType, 'size:', base64.length);

      const result = await withRetry(() =>
        classifyWithContent(
          isImage ? base64 : '', // For images, pass base64 directly
          fileName,
          isImage,
          isPdf,
          isPdf ? base64 : undefined,
          mimeType,
          scopeLang,
        ),
      );

      console.log('Classification:', result.type, 'confidence:', result.confidence);

      return new Response(JSON.stringify(result), {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // LEGACY: Accept base64 image/text directly (backward compatible)
    const { image, text, fileName } = body;

    if (!image && !text) {
      throw new Error('filePath+fileName or image/text is required');
    }

    const isImage = !!image;
    const content = image || text;

    console.log('Legacy path: classifying document:', fileName, 'isImage:', isImage);

    const result = await withRetry(() =>
      classifyWithContent(
        content,
        fileName || 'unknown',
        isImage,
        false,
        undefined,
        // The legacy path sends raw base64 with no mime type; images are JPEG
        // by the time they reach here (the client compresses to JPEG).
        isImage ? 'image/jpeg' : undefined,
        scopeLang,
      ),
    );

    console.log('Classification:', result.type, 'confidence:', result.confidence);

    return new Response(JSON.stringify(result), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Error classifying document:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        // The one failure the caller must be able to name out loud, because it
        // is the only one the person can actually do something about.
        ...(error instanceof QuotaExhaustedError ? { error_code: 'quota_exhausted' } : {}),
        type: 'other',
        confidence: 0,
        summary: '',
        vendor_name: null,
        invoice_date: null,
        invoice_amount: null,
        suggested_action: 'store_only',
        property_address: null,
        address_source: null,
        scope: null,
        text_truncated: false,
      }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
