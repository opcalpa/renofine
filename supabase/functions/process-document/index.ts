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

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

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
  // Quote mode fields (null in scope mode)
  estimatedCost: number | null;
  laborCost: number | null;
  materialCost: number | null;
  startDate: string | null;
  endDate: string | null;
  // Material budget fields
  isMaterialBudget: boolean;
  parentTaskName: string | null;
  // ROT fields
  rotEligible: boolean;
  rotAmount: number | null;
  // VAT context
  isIncludingVat: boolean;
}

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
}

interface ExtractionResult {
  rooms: ExtractedRoom[];
  tasks: ExtractedTask[];
  documentSummary: string;
  // Quote mode metadata (null in scope mode)
  quoteMetadata: QuoteMetadata | null;
}

const SYSTEM_PROMPT = `Du är en expert på att analysera svenska renoveringsdokument och uppdragsbeskrivningar.

Analysera dokumentet och extrahera:

1. RUM - Alla rum som nämns i dokumentet
   - name: Rumsnamn (t.ex. "Kök", "Vardagsrum", "Master bedroom")
   - estimatedAreaSqm: Uppskattad storlek i m² om det nämns, annars null
   - description: Kort beskrivning av rummet baserat på dokumentet
   - confidence: Din konfidens i extraheringen (0.0-1.0)
   - sourceText: Exakt text från dokumentet som nämnde rummet

2. UPPGIFTER/ARBETEN - Alla arbeten eller åtgärder som ska utföras
   - title: Kort titel för uppgiften (t.ex. "Riva vägg mellan kök och vardagsrum")
   - description: Detaljerad beskrivning
   - category: En av följande kategorier:
     * rivning - Rivningsarbeten
     * el - Elarbeten
     * vvs - VVS/rörarbeten
     * malning - Målningsarbeten
     * golv - Golvarbeten
     * kok - Köksarbeten
     * badrum - Badrumsarbeten
     * snickeri - Snickeriarbeten
     * kakel - Kakel/plattsättning
     * ovrigt - Övrigt
   - roomName: Vilket rum uppgiften gäller (null om generellt)
   - confidence: Din konfidens i extraheringen (0.0-1.0)
   - sourceText: Exakt text från dokumentet

3. SAMMANFATTNING - En kort sammanfattning av dokumentet (2-3 meningar)

VIKTIGT:
- Extrahera BARA det som TYDLIGT och EXPLICIT nämns i dokumentet
- Gissa ALDRIG rum eller uppgifter som inte direkt framgår av texten
- Det är bättre att missa något än att hitta på något som inte stod i dokumentet
- Använd svenska namn och beskrivningar
- Var specifik med uppgifter - "måla väggar" ska specificeras till vilket rum
- Om samma rum nämns flera gånger, slå ihop informationen
- Confidence ska vara max 0.7 om det inte ordagrant nämns i texten
- Confidence ska vara:
  * 0.9-1.0: Tydligt specificerat i dokumentet
  * 0.7-0.9: Rimlig tolkning baserat på kontext
  * 0.5-0.7: Osäker men trolig
  * <0.5: Gissning

Svara ENDAST med giltig JSON i detta format:
{
  "rooms": [...],
  "tasks": [...],
  "documentSummary": "..."
}`;

const QUOTE_PROMPT = `Du är en expert på att analysera svenska bygofferter, prisförslag och anbud.

Analysera dokumentet och extrahera ALL information:

1. RUM - Alla rum som nämns
   - name: Rumsnamn (t.ex. "Kök", "Badrum")
   - estimatedAreaSqm: Storlek i m² om det nämns, annars null
   - description: Kort beskrivning baserat på dokumentet
   - confidence: Din konfidens (0.0-1.0)
   - sourceText: Exakt text från dokumentet

2. ARBETEN OCH MATERIALPOSTER - Varje arbetsmoment eller offertrad

   För varje rad, avgör om det är en ARBETSPOST eller en MATERIALPOST:

   ARBETSPOST (isMaterialBudget: false):
   - Utför ett arbete (rivning, målning, rörarbete, etc.)
   - Kan ha egen materialkostnad specificerad (materialCost)

   MATERIALPOST (isMaterialBudget: true):
   - En separat rad som enbart beskriver material (t.ex. "Material för målning", "Golvmaterial")
   - Ska INTE bli en egen arbetsuppgift
   - Ska kopplas till närmaste arbetspost via parentTaskName
   - estimatedCost = materialbeloppet

   Fält per post:
   - title: Kort titel (t.ex. "Rivning av befintligt kök")
   - description: Detaljerad beskrivning av arbetet
   - category: En av: rivning, el, vvs, malning, golv, kok, badrum, snickeri, kakel, ovrigt
   - roomName: Vilket rum uppgiften gäller (null om generellt)
   - confidence: Din konfidens (0.0-1.0)
   - sourceText: Exakt text från dokumentet
   - estimatedCost: Totalkostnad för denna post i SEK, null om okänt
   - laborCost: Arbetskostnad separat i SEK om angivet, annars null
   - materialCost: Materialkostnad separat i SEK om angivet, annars null
   - startDate: Planerat startdatum (YYYY-MM-DD) om angivet, annars null
   - endDate: Planerat slutdatum (YYYY-MM-DD) om angivet, annars null
   - isMaterialBudget: true om detta är en ren materialpost, false om det är ett arbete
   - parentTaskName: Om isMaterialBudget=true, ange EXAKT titel på den arbetspost materialet hör till (null om det inte går att matcha)
   - rotEligible: true om arbetet är ROT-berättigat (gäller ALDRIG material — bara arbetskostnad)
   - rotAmount: ROT-avdragsbelopp i SEK om angivet i offerten, annars null
   - isIncludingVat: true om priset för denna post är inklusive moms

3. OFFERTMETADATA - Övergripande information om offerten
   - vendorName: Företagsnamn som lämnar offerten
   - totalAmount: Totalsumma i SEK
   - vatAmount: Momsbelopp i SEK om angivet, annars null
   - validUntil: Offertens giltighetstid (YYYY-MM-DD) om angivet, annars null
   - paymentTerms: Betalningsvillkor (t.ex. "30 dagar netto", "Delbetalning per etapp")
   - quoteDate: Offertdatum (YYYY-MM-DD) om angivet, annars null
   - quoteNumber: Offertnummer om angivet, annars null
   - isIncludingVat: true om offerten generellt anger priser inklusive moms
   - totalRotAmount: Totalt ROT-avdrag i SEK om angivet, annars null

4. SAMMANFATTNING - Kort sammanfattning (2-3 meningar)

VIKTIGT:
- Extrahera ALLA prisposter, även om de saknar detaljerad beskrivning
- Om priset inkluderar arbete + material men inte specificeras separat, sätt estimatedCost och lämna laborCost/materialCost som null
- Om ROT-avdrag nämns, extrahera priset FÖRE avdrag (bruttopris)
- Belopp ska vara tal (number), INTE strängar
- KRITISKT FÖR BELOPP: Använd EXAKT det belopp som står på raden i dokumentet. Beräkna ALDRIG egna belopp genom att multiplicera eller summera andra värden. Om en rad säger "Material för väggar 15 100 kr", ska estimatedCost vara exakt 15100, INTE ett beräknat värde.
- MATERIALRADER (t.ex. "Material för målning 20 000 kr") ska ha isMaterialBudget: true och parentTaskName satt till närmaste arbetspost (t.ex. "Målning"). Dessa blir materialbudgetar, INTE arbetsuppgifter.
- Om material ingår i en arbetspost (t.ex. "Målning inkl. material") — sätt materialCost på arbetsposten istället, INTE som separat materialrad. Undvik dubbelräkning.
- ROT gäller BARA arbetskostnad, aldrig material. Sätt rotEligible: false på materialrader.
- Confidence max 0.7 om det inte ordagrant nämns i texten
- Om en rad har mängd (antal) OCH á-pris, extrahera TOTALBELOPPET (mängd × á-pris) som estimatedCost, INTE á-priset ensamt.

Svara ENDAST med giltig JSON:
{
  "rooms": [...],
  "tasks": [...],
  "quoteMetadata": { ... },
  "documentSummary": "..."
}`;

async function extractTextFromPdf(fileUrl: string): Promise<string> {
  console.log('Fetching PDF from:', fileUrl);
  const response = await fetch(fileUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch PDF: ${response.status}`);
  }

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

  if (!response.ok) {
    throw new Error(`Failed to fetch DOCX: ${response.status}`);
  }

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
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const extension = fileName.toLowerCase().split('.').pop();

  // Handle PDF
  if (mimeType.includes('pdf') || extension === 'pdf') {
    try {
      const data = await pdf(bytes);
      console.log('PDF parsed from base64, text length:', data.text?.length || 0);
      return data.text || '';
    } catch (pdfError) {
      console.error('PDF parse error:', pdfError);
      throw new Error('Kunde inte läsa PDF-filen. Försök med en annan fil.');
    }
  }

  // Handle DOCX
  if (mimeType.includes('openxmlformats') || extension === 'docx') {
    try {
      const result = await mammoth.extractRawText({ arrayBuffer: bytes.buffer });
      console.log('DOCX parsed from base64, text length:', result.value?.length || 0);
      return result.value || '';
    } catch (docxError) {
      console.error('DOCX parse error:', docxError);
      throw new Error('Kunde inte läsa Word-filen. Försök med PDF eller TXT istället.');
    }
  }

  // Handle text files
  if (mimeType.includes('text') || mimeType.includes('plain') || extension === 'txt') {
    return new TextDecoder().decode(bytes);
  }

  // Default: try as text
  return new TextDecoder().decode(bytes);
}

async function fetchDocumentContent(fileUrl: string, fileType: string, fileName: string): Promise<string> {
  console.log('Fetching document:', fileName, 'type:', fileType);

  // Check file extension
  const extension = fileName.toLowerCase().split('.').pop();

  // Handle PDF files
  if (fileType.includes('pdf') || extension === 'pdf') {
    return await extractTextFromPdf(fileUrl);
  }

  // Handle DOCX files (modern Word format)
  if (fileType.includes('openxmlformats') || extension === 'docx') {
    return await extractTextFromDocx(fileUrl);
  }

  // Handle old .doc files - not supported
  if (fileType.includes('msword') || extension === 'doc') {
    throw new Error('Gamla Word-dokument (.doc) stöds inte. Spara som .docx eller PDF först.');
  }

  // Handle text files
  if (fileType.includes('text') || fileType.includes('plain') || extension === 'txt') {
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch document: ${response.status}`);
    }
    return await response.text();
  }

  // Default: try to get as text
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch document: ${response.status}`);
  }
  return await response.text();
}

async function extractWithOpenAI(documentContent: string, mode: 'scope' | 'quote' = 'scope'): Promise<ExtractionResult> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  if (!documentContent || documentContent.trim().length === 0) {
    throw new Error('Dokumentet verkar vara tomt eller kunde inte läsas.');
  }

  const isQuote = mode === 'quote';
  const systemPrompt = isQuote ? QUOTE_PROMPT : SYSTEM_PROMPT;
  // Use gpt-4o for quotes (more complex extraction), gpt-4o-mini for scope
  const model = isQuote ? 'gpt-4o' : 'gpt-4o-mini';
  // gpt-4o + gpt-4o-mini both support 16384 output tokens — needed so large
  // multi-room quotes don't get truncated mid-JSON.
  const maxTokens = isQuote ? 16384 : 8192;

  console.log('Sending to OpenAI, mode:', mode, 'model:', model, 'content length:', documentContent.length);

  const messages = [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: `Analysera följande dokument:\n\n${documentContent.substring(0, 30000)}`,
    },
  ];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenAI API error:', errorText);
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();

  const choice = data.choices?.[0];
  const content = choice?.message?.content;
  if (!content) {
    throw new Error('No content in OpenAI response');
  }

  if (choice.finish_reason === 'length') {
    console.error('OpenAI response truncated at max_tokens');
    throw new Error('Dokumentet är för stort för att tolkas i ett svep. Försök dela upp det eller ladda upp en mindre version.');
  }

  console.log('OpenAI response received, length:', content.length);

  let jsonText = content;
  const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1].trim();
  }

  try {
    const result = JSON.parse(jsonText);

    // Normalize tasks with quote fields
    const tasks: ExtractedTask[] = (result.tasks || []).map((t: Record<string, unknown>) => ({
      title: t.title || '',
      description: t.description || null,
      category: t.category || 'ovrigt',
      roomName: t.roomName || null,
      confidence: typeof t.confidence === 'number' ? t.confidence : 0.5,
      sourceText: t.sourceText || '',
      estimatedCost: typeof t.estimatedCost === 'number' ? t.estimatedCost : (typeof t.estimatedCost === 'string' ? parseFloat(t.estimatedCost) || null : null),
      laborCost: typeof t.laborCost === 'number' ? t.laborCost : (typeof t.laborCost === 'string' ? parseFloat(t.laborCost) || null : null),
      materialCost: typeof t.materialCost === 'number' ? t.materialCost : (typeof t.materialCost === 'string' ? parseFloat(t.materialCost) || null : null),
      startDate: t.startDate || null,
      endDate: t.endDate || null,
      isMaterialBudget: !!t.isMaterialBudget,
      parentTaskName: t.parentTaskName || null,
      rotEligible: !!t.rotEligible,
      rotAmount: typeof t.rotAmount === 'number' ? t.rotAmount : (typeof t.rotAmount === 'string' ? parseFloat(t.rotAmount) || null : null),
      isIncludingVat: !!t.isIncludingVat,
    }));

    // Normalize quote metadata
    let quoteMetadata: QuoteMetadata | null = null;
    if (isQuote && result.quoteMetadata) {
      const qm = result.quoteMetadata;
      quoteMetadata = {
        vendorName: qm.vendorName || null,
        totalAmount: typeof qm.totalAmount === 'number' ? qm.totalAmount : (typeof qm.totalAmount === 'string' ? parseFloat(qm.totalAmount) || null : null),
        vatAmount: typeof qm.vatAmount === 'number' ? qm.vatAmount : (typeof qm.vatAmount === 'string' ? parseFloat(qm.vatAmount) || null : null),
        validUntil: qm.validUntil || null,
        paymentTerms: qm.paymentTerms || null,
        quoteDate: qm.quoteDate || null,
        quoteNumber: qm.quoteNumber || null,
        isIncludingVat: !!qm.isIncludingVat,
        totalRotAmount: typeof qm.totalRotAmount === 'number' ? qm.totalRotAmount : (typeof qm.totalRotAmount === 'string' ? parseFloat(qm.totalRotAmount) || null : null),
      };
    }

    return {
      rooms: result.rooms || [],
      tasks,
      documentSummary: result.documentSummary || '',
      quoteMetadata,
    };
  } catch (parseError) {
    const preview = jsonText.substring(0, 200).replace(/\s+/g, ' ');
    console.error('Failed to parse OpenAI response:', jsonText.substring(0, 500));
    throw new Error(`Kunde inte tolka AI-svaret. AI svarade: "${preview}"`);
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const { fileUrl, fileBase64, fileType, mimeType, fileName, mode } = await req.json();

    const extractionMode: 'scope' | 'quote' = mode === 'quote' ? 'quote' : 'scope';

    console.log('Processing request:', { fileName, fileType, mimeType, mode: extractionMode, hasBase64: !!fileBase64, fileUrl: fileUrl?.substring(0, 50) });

    if (!fileUrl && !fileBase64) {
      throw new Error('fileUrl or fileBase64 is required');
    }

    // Fetch and extract document content
    const documentContent = fileBase64
      ? await extractTextFromBase64(fileBase64, mimeType || fileType || '', fileName || '')
      : await fetchDocumentContent(fileUrl, fileType || '', fileName || '');

    // Extract with OpenAI
    const result = await extractWithOpenAI(documentContent, extractionMode);

    console.log('Success! Mode:', extractionMode, 'Rooms:', result.rooms.length, 'Tasks:', result.tasks.length);

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
