// DEPRECATED — superseded by process-document-v2 (unified extraction,
// scope/quote path). No remaining callers in the app. Kept deployed for
// a short parallel-run window; safe to delete this function once
// confirmed unused in logs.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-ignore - pdf-parse types
import pdf from 'npm:pdf-parse@1.1.1';
// @ts-ignore - mammoth types
import mammoth from 'npm:mammoth@1.6.0';

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
  // Quote mode metadata (null in scope mode)
  quoteMetadata: QuoteMetadata | null;
}

const SYSTEM_PROMPT = `Du är en expert på att analysera svenska renoveringsdokument och uppdragsbeskrivningar.

Analysera dokumentet och extrahera:

1. RUM - Fysiska utrymmen eller byggnader där arbetena utförs

   Vad räknas som ett rum:
   ✅ Utrymmen i en byggnad: Kök, Sovrum, Badrum, Hall, Vardagsrum, Källare, Tvättstuga, Kontor
   ✅ Egna byggnader/grupperingar: Attefallshus, Garage, Förråd, Komplementbyggnad, Carport, Altan, Pool, Trädgård, Uteplats

   Vad räknas INTE som rum (extrahera dem INTE som rum):
   ❌ Byggnadskomponenter: Bjälklag, Yttervägg, Innervägg, Tak, Grund, Takstol, Bärlina, Fasad
   ❌ Material- eller kostnadskategorier: Material, Förbrukning, Övrigt
   ❌ Arbetsmoment: Rivning, Målning, El, VVS — dessa hör till tasks, inte rooms

   Fält per rum:
   - name: Rumsnamn eller byggnadsnamn (t.ex. "Kök", "Attefallshus", "Garage")
   - estimatedAreaSqm: Uppskattad storlek i m² om det nämns, annars null
   - description: Kort beskrivning av rummet baserat på dokumentet
   - confidence: Din konfidens i extraheringen (0.0-1.0)
   - sourceText: Exakt text från dokumentet som nämnde rummet

   Om dokumentet inte namnger något fysiskt utrymme eller byggnad, returnera en TOM rooms-array ([]). Det är bättre än att hitta på rum.

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

1. RUM - Fysiska utrymmen eller byggnader där arbetena utförs

   Vad räknas som ett rum:
   ✅ Utrymmen i en byggnad: Kök, Sovrum, Badrum, Hall, Vardagsrum, Källare, Tvättstuga, Kontor
   ✅ Egna byggnader/grupperingar: Attefallshus, Garage, Förråd, Komplementbyggnad, Carport, Altan, Pool, Trädgård, Uteplats

   Vad räknas INTE som rum (extrahera dem INTE som rum):
   ❌ Byggnadskomponenter: Bjälklag, Yttervägg, Innervägg, Tak, Grund, Takstol, Bärlina, Fasad
   ❌ Material- eller kostnadskategorier: Material, Förbrukning, Övrigt
   ❌ Arbetsmoment: Rivning, Målning, El, VVS — hör till tasks

   Fält per rum:
   - name: Rumsnamn eller byggnadsnamn (t.ex. "Kök", "Attefallshus", "Garage")
   - estimatedAreaSqm: Storlek i m² om det nämns, annars null
   - description: Kort beskrivning baserat på dokumentet
   - confidence: Din konfidens (0.0-1.0)
   - sourceText: Exakt text från dokumentet

   Om offerten inte namnger något fysiskt utrymme/byggnad utan bara listar arbeten, returnera TOM rooms-array ([]). Sätt då roomName=null på alla tasks. Hellre tom än uppfunnen.

2. ARBETEN OCH MATERIALPOSTER - Varje arbetsmoment eller offertrad

   Avgör vilket av tre fall raden tillhör (spegla offertens struktur, tvinga inte separation):

   FALL 1 — ARBETSPOST utan separat material (isMaterialBudget: false):
   - Bara arbete, inget material specificerat (t.ex. "Rivning av kök 15 000 kr")
   - estimatedCost = arbetskostnad
   - materialCost = null
   - rotEligible kan vara true

   FALL 2 — ARBETSPOST inkl. material (isMaterialBudget: false):
   - Arbete + material i samma rad (t.ex. "Målning inkl. material 30 000 kr")
   - estimatedCost = totalpriset
   - Sätt materialCost om beloppet kan utläsas (t.ex. "varav material 8 000 kr"), annars null
   - Skapa INTE en separat materialpost — det vore dubbelräkning
   - rotEligible räknas på laborCost (eller estimatedCost minus materialCost)

   FALL 3 — SEPARAT MATERIALPOST (isMaterialBudget: true):
   - Egen rad som beskriver material/produkt, INTE ett arbete
   - estimatedCost = materialbeloppet
   - parentTaskName = EXAKT titel på arbetsposten material hör till, t.ex. "Målning"
   - Om ingen tillhörande arbetspost finns i offerten (fristående material), sätt parentTaskName = null
   - Skapa INTE en arbetsuppgift av denna rad
   - rotEligible = false ALLTID (ROT gäller aldrig material)

   Hur du känner igen FALL 3 — raden är materialpost om titeln är:
   ✅ "Material för målning", "Golvmaterial", "Material för väggar"
   ✅ Specifika produktnamn/dimensioner: "K-virke C24 45x170", "Takplåt", "Trallskruv", "PAROC Isoleringsskiva", "Underlagsspont", "Hyvlad regel gran"
   ✅ Varumärken: "Moelven Trend", "DalaFloda Softpine", "T-Vap Ångbroms"
   ❌ Däremot är följande arbeten (FALL 1 eller 2): "Rivning av kök", "Målning av hall", "Demontering", "Installation av el", "Montering av kök"

   VIKTIGT — rena materialoffert från bygghandlare:
   Offerter från bygghandlare (Vindö Byggvaror, Beijer, Optimera, Woody, Bauhaus, XL-Bygg, K-Rauta, etc.) består ofta UTESLUTANDE av produktrader utan ett enda arbete. Om hela offerten består av produktnamn/dimensioner och INGEN rad beskriver ett arbete med verb (rivning, montering, målning, installation), klassa ALLA rader som isMaterialBudget=true med parentTaskName=null. rotEligible=false på alla. Det är då användarens jobb att senare lägga till en separat arbetsoffert.

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
   - quoteSource: Klassificera offertkällan, ett av tre värden:
     * "building_supplier" — bygghandlare/materialleverantör som säljer produkter (Vindö Byggvaror, Beijer, Optimera, Woody, Bauhaus, XL-Bygg, K-Rauta, Byggmax, Hornbach). 100% materialrader, inga arbeten. Pyramid Business Studio/Mercur/Mascot-genererade dokument är ofta sådana.
     * "contractor" — entreprenör/snickare/hantverkare som lämnar arbets-offert. Innehåller arbets-rader (rivning, målning, installation, montering). Kan ha embedded eller separat material.
     * "mixed" — offert som tydligt har BÅDE rena material-batch-rader OCH separata arbets-rader (sällsynt, t.ex. en helhetsoffert där snickaren även säljer en bygghandlar-leverans direkt).
     Bestäm baserat på radernas innehåll (titlar, kategorier, arbets-verb), inte bara avsändaren.

4. SAMMANFATTNING - Kort sammanfattning (2-3 meningar)

VIKTIGT:
- Extrahera ALLA prisposter, även om de saknar detaljerad beskrivning
- Om ROT-avdrag nämns, extrahera priset FÖRE avdrag (bruttopris)
- Belopp ska vara tal (number), INTE strängar
- KRITISKT FÖR BELOPP: Använd EXAKT det belopp som står på raden. Beräkna ALDRIG egna belopp genom att multiplicera eller summera andra värden. Om en rad säger "Material för väggar 15 100 kr", ska estimatedCost vara exakt 15100, INTE ett beräknat värde.
- Om en rad har mängd (antal) OCH á-pris, extrahera TOTALBELOPPET (mängd × á-pris) som estimatedCost, INTE á-priset ensamt.
- Confidence max 0.7 om det inte ordagrant nämns i texten
- roomName: bara fysiskt utrymme/byggnad enligt regeln ovan. Sätt null om dokumentet bara har komponent-kategorier (Bjälklag, Yttervägg, Tak) eller arbets-kategorier som rubriker.

FULLSTÄNDIG ENUMERATION (kritiskt för stora dokument):

INNAN du svarar:
1. Räkna antalet prisposter/rader i dokumentet
2. Notera mentalt: "Detta dokument har N rader"
3. Försäkra dig om att tasks-arrayen kommer innehålla EXAKT N entries

UNDER extraktionen:
- Hoppa ALDRIG över en rad oavsett hur tråkig, upprepad, eller liten den ser ut
- Sammanfatta ALDRIG flera rader till en (t.ex. "...och 30 fler liknande")
- Använd ALDRIG fraser som "etc.", "och så vidare", "(samt resterande poster)", "...continued"
- Om listan känns lång — fortsätt ändå. Varje enskild rad räknas. Även rad 71 av 71.

EFTER extraktionen, innan du skriver JSON-svaret:
- Kontrollera att tasks.length matchar antalet rader du räknade ovan
- Om det skiljer, gå tillbaka och extrahera de saknade raderna

På små dokument (1-10 rader) är detta trivialt. På stora dokument (50+ rader)
är detta avgörande — det är bättre att svara fullständigt och långsamt än
ofullständigt och snabbt. ALLT eller INGET.

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
  // gpt-4o-mini for both modes — gpt-4o is too slow on Supabase edge workers
  // (504/546 on 50+ row quotes). Mini's "lazy listing" tendency is mitigated
  // by an explicit anti-lazy directive in QUOTE_PROMPT — verified to recover
  // full row count on Vindö-style large quotes.
  const model = 'gpt-4o-mini';
  const maxTokens = isQuote ? 16384 : 8192;

  console.log('Sending to OpenAI, mode:', mode, 'model:', model, 'content length:', documentContent.length);

  const messages = [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      // Hard cap at 100k chars (~25k input tokens). Both gpt-4o and gpt-4o-mini
      // support 128k context; 30k was too tight and silently dropped trailing
      // rows on large quotes (verified: Vindö Z20875 lost ~30 rows past char 30k).
      content: `Analysera följande dokument:\n\n${documentContent.substring(0, 100000)}`,
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
      const rawSource = typeof qm.quoteSource === 'string' ? qm.quoteSource.toLowerCase() : null;
      const quoteSource: QuoteSource | null =
        rawSource === 'building_supplier' || rawSource === 'contractor' || rawSource === 'mixed'
          ? (rawSource as QuoteSource)
          : null;

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
        quoteSource,
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
