import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
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

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface DocumentAnalysisResult {
  document_type: "receipt" | "invoice";
  vendor_name: string;
  total_amount: number;
  vat_amount: number | null;
  purchase_date: string | null;
  due_date: string | null;
  invoice_number: string | null;
  ocr_number: string | null;
  line_items: LineItem[];
  rot_amount: number | null;
  rot_personnummer: string | null;
  confidence: number;
}

function buildSystemPrompt(): string {
  return `You are an expert at analyzing financial documents (receipts and invoices) and extracting structured data.

Your task is to analyze the document image and extract key information.

STEP 1: DETERMINE DOCUMENT TYPE
First, determine if this is a RECEIPT or an INVOICE:

RECEIPT indicators:
- Kassakvitto, kvitto
- Payment already made (shows change given, card payment confirmation)
- "TOTAL", "SUMMA", "ATT BETALA" with immediate payment
- Typically shorter, from retail stores
- No invoice number or due date

INVOICE indicators:
- "Faktura", "Invoice", "Fakturanummer"
- Payment due in the future ("Förfallodatum", "Due date", "Att betala senast")
- OCR-nummer, Betalningsreferens
- Bankgiro, Plusgiro payment details
- Company header with organization number

STEP 2: EXTRACT INFORMATION

For BOTH document types:
- vendor_name: Company/store name
- total_amount: Final amount to pay
- vat_amount: VAT/moms if visible
- purchase_date: Document date (YYYY-MM-DD)
- line_items: Individual items if visible

For INVOICES only (leave null for receipts):
- due_date: Payment due date (YYYY-MM-DD)
- invoice_number: Fakturanummer
- ocr_number: OCR/payment reference

For Swedish documents:
- "SUMMA" or "ATT BETALA" = total amount
- "MOMS" = VAT
- "Förfallodatum" or "Förfaller" = due date
- "Fakturanummer" or "Fakturanr" = invoice number
- "OCR" or "Betalningsreferens" = ocr_number

For ROT/RUT tax deductions (common in Swedish renovation invoices):
- "ROT-avdrag" or "Rutavdrag" = rot_amount (the deduction amount, NOT the total)
- Look for Swedish personnummer (YYYYMMDD-XXXX or YYMMDD-XXXX format) associated with the ROT deduction
- The personnummer is the property owner who claims the deduction

RETURN FORMAT:
{
  "document_type": "receipt" or "invoice",
  "vendor_name": "Company name",
  "total_amount": 123.45,
  "vat_amount": 24.69,
  "purchase_date": "2026-02-10",
  "due_date": "2026-03-10",
  "invoice_number": "12345",
  "ocr_number": "1234567890",
  "line_items": [
    {"description": "Item name", "quantity": 1, "unit_price": 99.00, "total": 99.00}
  ],
  "rot_amount": 15000.00,
  "rot_personnummer": "19850101-1234",
  "confidence": 0.85
}

RULES:
- document_type MUST be either "receipt" or "invoice"
- total_amount MUST be a number (not a string)
- vat_amount can be null if not visible
- purchase_date should be in ISO format (YYYY-MM-DD) or null if not found
- due_date, invoice_number, ocr_number should be null for receipts
- line_items can be an empty array if items are unclear
- rot_amount is the ROT/RUT deduction amount (null if not a ROT invoice)
- rot_personnummer is the Swedish personal ID linked to the ROT deduction (null if not found)
- confidence is a number between 0 and 1 indicating how confident you are

Return ONLY valid JSON, no explanations.`;
}

async function analyzeDocument(base64Image: string): Promise<DocumentAnalysisResult> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  console.log('Analyzing receipt with OpenAI Vision');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt(),
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
                detail: 'high',
              },
            },
            {
              type: 'text',
              text: 'Analyze this document. First determine if it is a receipt or invoice, then extract all relevant information. Return structured JSON.',
            },
          ],
        },
      ],
      max_tokens: 4096,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenAI API error:', errorText);
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('No content in OpenAI response');
  }

  console.log('OpenAI raw response:', content.substring(0, 500));

  // Parse JSON from response
  let jsonText = content;

  // Try to extract JSON from markdown code blocks if present
  const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1].trim();
  }

  // Also try to find JSON object directly
  const jsonObjectMatch = jsonText.match(/\{[\s\S]*\}/);
  if (jsonObjectMatch) {
    jsonText = jsonObjectMatch[0];
  }

  try {
    const result = JSON.parse(jsonText);

    // Validate and normalize the result
    const normalizedResult: DocumentAnalysisResult = {
      document_type: result.document_type === 'invoice' ? 'invoice' : 'receipt',
      vendor_name: result.vendor_name || '',
      total_amount: typeof result.total_amount === 'number' ? result.total_amount : parseFloat(result.total_amount) || 0,
      vat_amount: result.vat_amount != null ? (typeof result.vat_amount === 'number' ? result.vat_amount : parseFloat(result.vat_amount)) : null,
      purchase_date: result.purchase_date || null,
      due_date: result.due_date || null,
      invoice_number: result.invoice_number || null,
      ocr_number: result.ocr_number || null,
      line_items: Array.isArray(result.line_items) ? result.line_items.map((item: Partial<LineItem>) => ({
        description: item.description || '',
        quantity: typeof item.quantity === 'number' ? item.quantity : parseFloat(String(item.quantity)) || 1,
        unit_price: typeof item.unit_price === 'number' ? item.unit_price : parseFloat(String(item.unit_price)) || 0,
        total: typeof item.total === 'number' ? item.total : parseFloat(String(item.total)) || 0,
      })) : [],
      confidence: typeof result.confidence === 'number' ? result.confidence : 0.5,
    };

    console.log('Parsed document result:', JSON.stringify(normalizedResult, null, 2));

    return normalizedResult;
  } catch (parseError) {
    console.error('Failed to parse OpenAI response:', jsonText.substring(0, 1000));
    console.error('Parse error:', parseError);

    // Return empty result instead of throwing
    return {
      document_type: 'receipt',
      vendor_name: '',
      total_amount: 0,
      vat_amount: null,
      purchase_date: null,
      due_date: null,
      invoice_number: null,
      ocr_number: null,
      line_items: [],
      confidence: 0,
    };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const { image } = await req.json();

    if (!image) {
      throw new Error('image is required');
    }

    console.log('Processing document, image length:', image.length, 'chars');

    const result = await analyzeDocument(image);

    return new Response(JSON.stringify(result), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Error processing document:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        document_type: 'receipt',
        vendor_name: '',
        total_amount: 0,
        vat_amount: null,
        purchase_date: null,
        due_date: null,
        invoice_number: null,
        ocr_number: null,
        line_items: [],
        confidence: 0,
      }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
