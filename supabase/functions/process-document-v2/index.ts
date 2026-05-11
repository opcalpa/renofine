import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-ignore - pdf-parse types
import pdf from 'npm:pdf-parse@1.1.1';
// @ts-ignore - mammoth types
import mammoth from 'npm:mammoth@1.6.0';

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://app.renofine.com',
  'https://renofine.com',
];

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_VERSION = '2023-06-01';

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

// Output shape — v1-compatible so QuoteReviewDialog needs no rewrite.
interface ExtractedRoom {
  name: string;
  estimatedAreaSqm: number | null;
  description: string | null;
  confidence: number;
  sourceText: string;
}

interface ExtractedTask {
  title: string;
  description: string | null;
  category: string;
  roomName: string | null;
  confidence: number;
  sourceText: string;
  estimatedCost: number | null;
  laborCost: number | null;
  materialCost: number | null;
  startDate: string | null;
  endDate: string | null;
  isMaterialBudget: boolean;
  parentTaskName: string | null;
  rotEligible: boolean;
  rotAmount: number | null;
  isIncludingVat: boolean;
}

type QuoteSource = 'building_supplier' | 'contractor' | 'mixed';

interface QuoteMetadata {
  vendorName: string | null;
  totalAmount: number | null;
  vatAmount: number | null;
  validUntil: string | null;
  paymentTerms: string | null;
  quoteDate: string | null;
  quoteNumber: string | null;
  isIncludingVat: boolean;
  totalRotAmount: number | null;
  quoteSource: QuoteSource | null;
}

interface ExtractionResult {
  rooms: ExtractedRoom[];
  tasks: ExtractedTask[];
  documentSummary: string;
  quoteMetadata: QuoteMetadata | null;
}

// ---------- Pass 1: thin extraction (one Anthropic call) ----------

const PASS1_SCOPE_SYSTEM = `Du analyserar svenska renoveringsdokument och extraherar rum + uppgifter.

RUM = fysiska utrymmen eller egna byggnader där arbeten utförs.
✅ Räknas som rum: Kök, Sovrum, Badrum, Hall, Vardagsrum, Källare, Tvättstuga, Kontor, Vind, Loft, Attefallshus, Garage, Förråd, Carport, Uterum, Altan.
❌ Räknas INTE som rum (extrahera INTE som rum, även om de nämns flera gånger):
   - Byggnadskomponenter: Bjälklag, Loft Bjälklag, Yttervägg, Innervägg, Tak, Yttertak, Innertak, Grund, Takstol, Bärlina, Fasad, Plintar, Sockel, Mellanbjälklag
   - Material-kategorier: Trä, Isolering, Skivor, Skruv, Spik
   - Arbetsmoment: Rivning, Målning, El, VVS, Snickeri
Om dokumentet inte namnger fysiska utrymmen, returnera tom rooms-array. Det är bättre än att hitta på rum.

UPPGIFTER = arbetsmoment som ska utföras. Var specifik. Använd svenska.

Kalla extract_scope-verktyget med resultatet. Extrahera ALLT, sammanfatta aldrig flera rader till en.`;

const PASS1_QUOTE_SYSTEM = `Du analyserar svenska bygofferter och extraherar rader + metadata.

RUM = fysiska utrymmen eller egna byggnader.
✅ Rum: Kök, Sovrum, Badrum, Hall, Vardagsrum, Källare, Tvättstuga, Kontor, Vind, Loft, Attefallshus, Garage, Förråd, Carport, Uterum, Altan.
❌ INTE rum: Byggnadskomponenter (Bjälklag, Loft Bjälklag, Yttervägg, Innervägg, Tak, Yttertak, Innertak, Grund, Takstol, Bärlina, Fasad, Plintar, Sockel, Mellanbjälklag), material-kategorier eller arbetsmoment.
Bjälklag och vägg-typer är ALDRIG rum, även om de utgör egna sektioner i offerten. Om offerten bara listar byggnadskomponenter utan att namnge fysiska utrymmen → tom rooms-array.

RADER: varje prispost = en task. Sätt isMaterialBudget=true för rena material-/produktrader (specifika produktnamn, dimensioner, märken som "K-virke C24 45x170", "PAROC Isoleringsskiva", "Moelven Trend"). false för arbetsposter (verb: rivning, montering, målning, installation, demontering).

För material-rader: parentTaskName = exakt titel på arbetsposten material hör till, eller null om fristående.

KVITTOKÄLLA (quoteSource):
- "building_supplier" — bygghandlare (Vindö, Beijer, Optimera, Woody, Bauhaus, K-Rauta, Byggmax, XL-Bygg, Hornbach). 100% material, inga arbeten.
- "contractor" — entreprenör/snickare. Innehåller arbetsmoment med verb.
- "mixed" — både rena material-batch-rader OCH separata arbetsrader (sällsynt).

KRITISKT — Extrahera ALLA rader. Hoppa aldrig över en rad. Sammanfatta aldrig. Använd ALDRIG "etc.", "och så vidare", "(resterande poster)". Räkna mentalt antalet rader innan du svarar, säkerställ att tasks.length matchar.

estimatedCost = totalbeloppet på raden (mängd × á-pris, inte á-priset). Tal, inte sträng. ALDRIG egna beräkningar — använd det belopp som faktiskt står.

Kalla extract_quote-verktyget med resultatet.`;

const SCOPE_TOOL = {
  name: 'extract_scope',
  description: 'Extraherar rum och uppgifter från ett renoveringsdokument',
  input_schema: {
    type: 'object',
    properties: {
      rooms: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            estimatedAreaSqm: { type: ['number', 'null'] },
            description: { type: ['string', 'null'] },
            sourceText: { type: 'string' },
          },
          required: ['name', 'estimatedAreaSqm', 'description', 'sourceText'],
        },
      },
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: ['string', 'null'] },
            category: {
              type: 'string',
              enum: ['rivning', 'el', 'vvs', 'malning', 'golv', 'kok', 'badrum', 'snickeri', 'kakel', 'ovrigt'],
            },
            roomName: { type: ['string', 'null'] },
            sourceText: { type: 'string' },
          },
          required: ['title', 'description', 'category', 'roomName', 'sourceText'],
        },
      },
      documentSummary: { type: 'string' },
    },
    required: ['rooms', 'tasks', 'documentSummary'],
  },
};

const QUOTE_TOOL = {
  name: 'extract_quote',
  description: 'Extraherar rader och metadata från en svensk bygoffert',
  input_schema: {
    type: 'object',
    properties: {
      rooms: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            estimatedAreaSqm: { type: ['number', 'null'] },
            sourceText: { type: 'string' },
          },
          required: ['name', 'estimatedAreaSqm', 'sourceText'],
        },
      },
      tasks: {
        type: 'array',
        description: 'EN entry per prispost/rad i offerten. Ingen sammanslagning. Ingen utelämning.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            sourceText: { type: 'string', description: 'Exakt text från offerten' },
            estimatedCost: { type: ['number', 'null'] },
            isMaterialBudget: { type: 'boolean' },
            parentTaskName: { type: ['string', 'null'] },
            roomName: { type: ['string', 'null'] },
          },
          required: ['title', 'sourceText', 'estimatedCost', 'isMaterialBudget', 'parentTaskName', 'roomName'],
        },
      },
      quoteMetadata: {
        type: 'object',
        properties: {
          vendorName: { type: ['string', 'null'] },
          totalAmount: { type: ['number', 'null'] },
          vatAmount: { type: ['number', 'null'] },
          validUntil: { type: ['string', 'null'], description: 'YYYY-MM-DD eller null' },
          paymentTerms: { type: ['string', 'null'] },
          quoteDate: { type: ['string', 'null'], description: 'YYYY-MM-DD eller null' },
          quoteNumber: { type: ['string', 'null'] },
          isIncludingVat: { type: 'boolean' },
          totalRotAmount: { type: ['number', 'null'] },
          quoteSource: {
            type: ['string', 'null'],
            enum: ['building_supplier', 'contractor', 'mixed', null],
          },
        },
        required: [
          'vendorName', 'totalAmount', 'vatAmount', 'validUntil', 'paymentTerms',
          'quoteDate', 'quoteNumber', 'isIncludingVat', 'totalRotAmount', 'quoteSource',
        ],
      },
      documentSummary: { type: 'string' },
    },
    required: ['rooms', 'tasks', 'quoteMetadata', 'documentSummary'],
  },
};

async function callAnthropic(
  apiKey: string,
  system: string,
  userContent: string,
  tool: typeof SCOPE_TOOL,
  maxTokens: number,
): Promise<Record<string, unknown>> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userContent }],
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Anthropic API error:', response.status, errorText);
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  const toolUse = data.content?.find((c: Record<string, unknown>) => c.type === 'tool_use');
  if (!toolUse?.input) {
    throw new Error('No tool_use block in Anthropic response');
  }

  if (data.stop_reason === 'max_tokens') {
    console.error('Anthropic response truncated at max_tokens');
    throw new Error('Dokumentet är för stort för att tolkas i ett svep. Försök dela upp det.');
  }

  console.log('Anthropic call: input_tokens', data.usage?.input_tokens, 'output_tokens', data.usage?.output_tokens);
  return toolUse.input as Record<string, unknown>;
}

function numOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const parsed = parseFloat(v.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function expandQuoteResult(raw: Record<string, unknown>): ExtractionResult {
  const rooms: ExtractedRoom[] = ((raw.rooms as Record<string, unknown>[]) || []).map((r) => ({
    name: String(r.name || ''),
    estimatedAreaSqm: numOrNull(r.estimatedAreaSqm),
    description: null,
    confidence: 0.9,
    sourceText: String(r.sourceText || ''),
  }));

  const qmRaw = (raw.quoteMetadata as Record<string, unknown>) || {};
  const rawSource = typeof qmRaw.quoteSource === 'string' ? qmRaw.quoteSource.toLowerCase() : null;
  const quoteSource: QuoteSource | null =
    rawSource === 'building_supplier' || rawSource === 'contractor' || rawSource === 'mixed'
      ? (rawSource as QuoteSource)
      : null;

  const isIncludingVat = !!qmRaw.isIncludingVat;

  const quoteMetadata: QuoteMetadata = {
    vendorName: (qmRaw.vendorName as string) || null,
    totalAmount: numOrNull(qmRaw.totalAmount),
    vatAmount: numOrNull(qmRaw.vatAmount),
    validUntil: (qmRaw.validUntil as string) || null,
    paymentTerms: (qmRaw.paymentTerms as string) || null,
    quoteDate: (qmRaw.quoteDate as string) || null,
    quoteNumber: (qmRaw.quoteNumber as string) || null,
    isIncludingVat,
    totalRotAmount: numOrNull(qmRaw.totalRotAmount),
    quoteSource,
  };

  const tasks: ExtractedTask[] = ((raw.tasks as Record<string, unknown>[]) || []).map((t) => {
    const isMaterial = !!t.isMaterialBudget;
    return {
      title: String(t.title || ''),
      description: null,
      category: 'ovrigt',
      roomName: (t.roomName as string) || null,
      confidence: 0.9,
      sourceText: String(t.sourceText || ''),
      estimatedCost: numOrNull(t.estimatedCost),
      laborCost: null,
      materialCost: null,
      startDate: null,
      endDate: null,
      isMaterialBudget: isMaterial,
      parentTaskName: (t.parentTaskName as string) || null,
      rotEligible: !isMaterial,
      rotAmount: null,
      isIncludingVat,
    };
  });

  return {
    rooms,
    tasks,
    documentSummary: (raw.documentSummary as string) || '',
    quoteMetadata,
  };
}

function expandScopeResult(raw: Record<string, unknown>): ExtractionResult {
  const rooms: ExtractedRoom[] = ((raw.rooms as Record<string, unknown>[]) || []).map((r) => ({
    name: String(r.name || ''),
    estimatedAreaSqm: numOrNull(r.estimatedAreaSqm),
    description: (r.description as string) || null,
    confidence: 0.9,
    sourceText: String(r.sourceText || ''),
  }));

  const tasks: ExtractedTask[] = ((raw.tasks as Record<string, unknown>[]) || []).map((t) => ({
    title: String(t.title || ''),
    description: (t.description as string) || null,
    category: (t.category as string) || 'ovrigt',
    roomName: (t.roomName as string) || null,
    confidence: 0.9,
    sourceText: String(t.sourceText || ''),
    estimatedCost: null,
    laborCost: null,
    materialCost: null,
    startDate: null,
    endDate: null,
    isMaterialBudget: false,
    parentTaskName: null,
    rotEligible: false,
    rotAmount: null,
    isIncludingVat: false,
  }));

  return {
    rooms,
    tasks,
    documentSummary: (raw.documentSummary as string) || '',
    quoteMetadata: null,
  };
}

// ---------- Pass 2: enrichment (conditional, only for contractor/mixed quotes) ----------

const PASS2_SYSTEM = `Du berikar redan extraherade offertrader med detaljerade fält.

För varje rad du får, fyll i:
- category: rivning, el, vvs, malning, golv, kok, badrum, snickeri, kakel, ovrigt
- laborCost: arbetskostnad i SEK om uppdelat, annars null
- materialCost: materialkostnad i SEK om uppdelat, annars null
- rotEligible: true om arbetet är ROT-berättigat (gäller ALDRIG material)
- rotAmount: ROT-avdrag i SEK om angivet, annars null
- startDate/endDate: YYYY-MM-DD om angivet, annars null
- description: kort beskrivning baserat på sourceText, annars null

Var konservativ — om ett fält inte explicit nämns för raden, returnera null. Returnera EXAKT samma antal rader som du fått, i samma ordning.

Kalla enrich_quote-verktyget med resultatet.`;

const ENRICH_TOOL = {
  name: 'enrich_quote',
  description: 'Berikar extraherade offertrader med kategoriserade fält',
  input_schema: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            category: {
              type: 'string',
              enum: ['rivning', 'el', 'vvs', 'malning', 'golv', 'kok', 'badrum', 'snickeri', 'kakel', 'ovrigt'],
            },
            description: { type: ['string', 'null'] },
            laborCost: { type: ['number', 'null'] },
            materialCost: { type: ['number', 'null'] },
            rotEligible: { type: 'boolean' },
            rotAmount: { type: ['number', 'null'] },
            startDate: { type: ['string', 'null'] },
            endDate: { type: ['string', 'null'] },
          },
          required: [
            'title', 'category', 'description', 'laborCost', 'materialCost',
            'rotEligible', 'rotAmount', 'startDate', 'endDate',
          ],
        },
      },
    },
    required: ['tasks'],
  },
};

async function enrichTasks(
  apiKey: string,
  documentContent: string,
  result: ExtractionResult,
): Promise<ExtractionResult> {
  // Send thin row info — title + sourceText is enough for Pass 2 to enrich.
  const thinTasks = result.tasks.map((t, i) => ({
    idx: i,
    title: t.title,
    sourceText: t.sourceText,
    isMaterialBudget: t.isMaterialBudget,
  }));

  const userContent = `Dokumenttext:\n${documentContent.substring(0, 80000)}\n\nExtraherade rader:\n${JSON.stringify(thinTasks, null, 2)}\n\nBerika varje rad. Returnera exakt ${thinTasks.length} entries i samma ordning.`;

  const enrichRaw = await callAnthropic(apiKey, PASS2_SYSTEM, userContent, ENRICH_TOOL, 8192);
  const enrichedTasks = (enrichRaw.tasks as Record<string, unknown>[]) || [];

  if (enrichedTasks.length !== result.tasks.length) {
    console.warn(`Pass 2 row count mismatch: expected ${result.tasks.length}, got ${enrichedTasks.length}. Skipping enrichment.`);
    return result;
  }

  const merged = result.tasks.map((t, i) => {
    const e = enrichedTasks[i];
    if (!e) return t;
    const isMaterial = t.isMaterialBudget;
    return {
      ...t,
      description: (e.description as string) || t.description,
      category: (e.category as string) || t.category,
      laborCost: numOrNull(e.laborCost),
      materialCost: numOrNull(e.materialCost),
      rotEligible: isMaterial ? false : !!e.rotEligible, // material never ROT
      rotAmount: numOrNull(e.rotAmount),
      startDate: (e.startDate as string) || null,
      endDate: (e.endDate as string) || null,
    };
  });

  return { ...result, tasks: merged };
}

// ---------- Document text extraction (verbatim from v1) ----------

async function extractTextFromPdf(fileUrl: string): Promise<string> {
  console.log('Fetching PDF from:', fileUrl);
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);
  console.log('Parsing PDF, size:', buffer.length);
  try {
    const data = await pdf(buffer);
    console.log('PDF parsed, text length:', data.text?.length || 0);
    return data.text || '';
  } catch (pdfError) {
    console.error('PDF parse error:', pdfError);
    throw new Error('Kunde inte läsa PDF-filen. Försök med en annan fil.');
  }
}

async function extractTextFromDocx(fileUrl: string): Promise<string> {
  console.log('Fetching DOCX from:', fileUrl);
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`Failed to fetch DOCX: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  console.log('Parsing DOCX, size:', arrayBuffer.byteLength);
  try {
    const result = await mammoth.extractRawText({ arrayBuffer });
    console.log('DOCX parsed, text length:', result.value?.length || 0);
    return result.value || '';
  } catch (docxError) {
    console.error('DOCX parse error:', docxError);
    throw new Error('Kunde inte läsa Word-filen. Försök med PDF eller TXT istället.');
  }
}

async function extractTextFromBase64(fileBase64: string, mimeType: string, fileName: string): Promise<string> {
  console.log('Processing base64 document:', fileName, 'type:', mimeType);
  const binaryStr = atob(fileBase64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  const extension = fileName.toLowerCase().split('.').pop();

  if (mimeType.includes('pdf') || extension === 'pdf') {
    try {
      const data = await pdf(bytes);
      return data.text || '';
    } catch (pdfError) {
      console.error('PDF parse error:', pdfError);
      throw new Error('Kunde inte läsa PDF-filen. Försök med en annan fil.');
    }
  }
  if (mimeType.includes('openxmlformats') || extension === 'docx') {
    try {
      const result = await mammoth.extractRawText({ arrayBuffer: bytes.buffer });
      return result.value || '';
    } catch (docxError) {
      console.error('DOCX parse error:', docxError);
      throw new Error('Kunde inte läsa Word-filen. Försök med PDF eller TXT istället.');
    }
  }
  if (mimeType.includes('text') || mimeType.includes('plain') || extension === 'txt') {
    return new TextDecoder().decode(bytes);
  }
  return new TextDecoder().decode(bytes);
}

async function fetchDocumentContent(fileUrl: string, fileType: string, fileName: string): Promise<string> {
  const extension = fileName.toLowerCase().split('.').pop();
  if (fileType.includes('pdf') || extension === 'pdf') return extractTextFromPdf(fileUrl);
  if (fileType.includes('openxmlformats') || extension === 'docx') return extractTextFromDocx(fileUrl);
  if (fileType.includes('msword') || extension === 'doc') {
    throw new Error('Gamla Word-dokument (.doc) stöds inte. Spara som .docx eller PDF först.');
  }
  if (fileType.includes('text') || fileType.includes('plain') || extension === 'txt') {
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error(`Failed to fetch document: ${response.status}`);
    return response.text();
  }
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`Failed to fetch document: ${response.status}`);
  return response.text();
}

// ---------- Main handler ----------

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

    const { fileUrl, fileBase64, fileType, mimeType, fileName, mode } = await req.json();
    const extractionMode: 'scope' | 'quote' = mode === 'quote' ? 'quote' : 'scope';
    console.log('v2 request:', { fileName, mode: extractionMode, hasBase64: !!fileBase64 });

    if (!fileUrl && !fileBase64) throw new Error('fileUrl or fileBase64 is required');

    const documentContent = fileBase64
      ? await extractTextFromBase64(fileBase64, mimeType || fileType || '', fileName || '')
      : await fetchDocumentContent(fileUrl, fileType || '', fileName || '');

    if (!documentContent || documentContent.trim().length === 0) {
      throw new Error('Dokumentet verkar vara tomt eller kunde inte läsas.');
    }

    // Pass 1 — thin extraction. Anthropic Haiku 4.5 has 200k context; cap at 100k chars input.
    const userContent = `Analysera följande dokument:\n\n${documentContent.substring(0, 100000)}`;
    const isQuote = extractionMode === 'quote';
    const system = isQuote ? PASS1_QUOTE_SYSTEM : PASS1_SCOPE_SYSTEM;
    const tool = isQuote ? QUOTE_TOOL : SCOPE_TOOL;
    // 16384 output tokens — first test at 8192 truncated Vindö (71 rows × ~120
    // tok/row + metadata ≈ 9k). Haiku 4.5 supports up to 64k output. Wall-clock
    // budget at ~250 tok/s (Haiku's claimed throughput) ≈ 65s for full 16k —
    // tight against the 60s gateway but should rarely max out in practice.
    const pass1Raw = await callAnthropic(apiKey, system, userContent, tool, 16384);
    let result = isQuote ? expandQuoteResult(pass1Raw) : expandScopeResult(pass1Raw);

    // Pass 2 — only for contractor/mixed quotes (building_supplier rows are pure
    // material and don't need enrichment beyond what Pass 1 already produced).
    const needsEnrichment =
      isQuote &&
      result.quoteMetadata?.quoteSource !== 'building_supplier' &&
      result.tasks.length > 0 &&
      result.tasks.length <= 60; // keep Pass 2 output bounded
    if (needsEnrichment) {
      console.log('Running Pass 2 enrichment for', result.tasks.length, 'tasks');
      result = await enrichTasks(apiKey, documentContent, result);
    } else {
      console.log('Skipping Pass 2 (source:', result.quoteMetadata?.quoteSource, ', tasks:', result.tasks.length, ')');
    }

    console.log('Success — rooms:', result.rooms.length, 'tasks:', result.tasks.length);
    return new Response(JSON.stringify(result), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Error processing document:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        rooms: [],
        tasks: [],
        documentSummary: '',
        quoteMetadata: null,
      }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
