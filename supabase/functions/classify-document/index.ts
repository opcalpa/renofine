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

type DocumentType = 'quote' | 'invoice' | 'receipt' | 'floor_plan' | 'contract' | 'product_image' | 'specification' | 'other';

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
}

function buildSystemPrompt(): string {
  return `You classify renovation project documents. Analyze the document and determine its type.

DOCUMENT TYPES:
- "quote" — A price offer/estimate from a contractor or supplier. Contains line items with prices, work descriptions, totals. Swedish: "Offert", "Prisförslag", "Anbud".
- "invoice" — A bill requesting payment. Has invoice number, due date, OCR/payment reference, bankgiro. Swedish: "Faktura".
- "receipt" — Proof of payment already made. From retail stores, hardware stores. Swedish: "Kvitto", "Kassakvitto".
- "floor_plan" — Architectural drawing, blueprint, or floor plan image. Shows rooms, walls, dimensions. Can be a photo of a printed drawing.
- "contract" — Legal agreement, construction contract, work order. Swedish: "Avtal", "Kontrakt", "Beställning".
- "specification" — Technical specification, material list, scope of work document without prices. Swedish: "Beskrivning", "Specifikation", "Arbetsbeskrivning".
- "product_image" — Photo of a product, material sample, fixture, appliance, or inspiration image.
- "other" — Anything that doesn't fit above categories.

SUGGESTED ACTIONS:
- "extract_tasks" — For quotes, specifications, contracts with work items → extract as tasks with budget
- "extract_purchase" — For invoices, receipts → extract as purchase/material record
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

Return ONLY valid JSON:
{
  "type": "invoice",
  "confidence": 0.95,
  "summary": "Faktura från Bauhaus för golvmaterial, totalt 4 500 kr.",
  "vendor_name": "Bauhaus",
  "invoice_date": "2026-03-15",
  "invoice_amount": 4500,
  "suggested_action": "extract_purchase",
  "property_address": {"street": "Storgatan 5", "postal_code": "114 25", "city": "Stockholm"},
  "address_source": "site_field"
}`;
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
function narrowAddress(
  type: DocumentType,
  raw: { property_address?: unknown; address_source?: unknown },
): { property_address: PropertyAddress | null; address_source: AddressSource } {
  const none = { property_address: null, address_source: null as AddressSource };
  if (type === 'receipt' || type === 'product_image' || type === 'floor_plan') return none;

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

async function classifyWithContent(
  content: string,
  fileName: string,
  isImage: boolean,
  isPdf: boolean,
  base64Data?: string,
  mimeType?: string,
): Promise<ClassificationResult> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  let userContent: unknown[];

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
        text: `File name: "${fileName}". Document text (first 5000 chars):\n\n${content.substring(0, 5000)}\n\nClassify this document.`,
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
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: userContent },
      ],
      max_tokens: 512,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenAI API error:', errorText);
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
    const validTypes: DocumentType[] = ['quote', 'invoice', 'receipt', 'floor_plan', 'contract', 'product_image', 'specification', 'other'];
    const validActions = ['extract_tasks', 'extract_purchase', 'import_to_canvas', 'store_only'];

    const type: DocumentType = validTypes.includes(result.type) ? result.type : 'other';
    const { property_address, address_source } = narrowAddress(type, result);

    return {
      type,
      confidence: typeof result.confidence === 'number' ? result.confidence : 0.5,
      summary: result.summary || '',
      vendor_name: result.vendor_name || null,
      invoice_date: result.invoice_date || null,
      invoice_amount: typeof result.invoice_amount === 'number' ? result.invoice_amount : null,
      suggested_action: validActions.includes(result.suggested_action) ? result.suggested_action : 'store_only',
      property_address,
      address_source,
    };
  } catch {
    console.error('Failed to parse classification:', jsonText.substring(0, 500));
    return { type: 'other', confidence: 0, summary: '', vendor_name: null, invoice_date: null, invoice_amount: null, suggested_action: 'store_only', property_address: null, address_source: null };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const body = await req.json();

    // NEW: Accept filePath for server-side file fetch (fast path)
    if (body.filePath && body.fileName) {
      const { filePath, fileName } = body;
      console.log('Fast path: fetching file from storage:', filePath);

      const { base64, mimeType } = await fetchFileFromStorage(filePath);
      const isImage = mimeType.startsWith('image/');
      const isPdf = mimeType === 'application/pdf';

      console.log('Classifying document:', fileName, 'mimeType:', mimeType, 'size:', base64.length);

      const result = await classifyWithContent(
        isImage ? base64 : '', // For images, pass base64 directly
        fileName,
        isImage,
        isPdf,
        isPdf ? base64 : undefined,
        mimeType,
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

    const result = await classifyWithContent(content, fileName || 'unknown', isImage, false);

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
        type: 'other',
        confidence: 0,
        summary: '',
        vendor_name: null,
        invoice_date: null,
        invoice_amount: null,
        suggested_action: 'store_only',
        property_address: null,
        address_source: null,
      }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
