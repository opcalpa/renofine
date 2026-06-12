import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

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

interface QuoteItem {
  description: string;
  quantity: number;
  unit: string;
  estimatedPrice: number | null;
  isLabor: boolean;
  category: string;
}

interface GenerationResult {
  items: QuoteItem[];
  summary: string;
}

const SYSTEM_PROMPT = `Du är en expert på att skapa offerter för svenska renoveringsprojekt.

Givet en beskrivning av ett renoveringsprojekt, extrahera och skapa offertrader.

För varje arbetsmoment eller material, skapa en offertrad med:
- description: Tydlig beskrivning av arbetet/materialet
- quantity: Uppskattad mängd (1 om osäker)
- unit: Enhet - använd:
  * "st" för styckpris/pauschal
  * "m2" för ytor (golv, tak, väggar)
  * "lpm" för löpmeter (socklar, lister)
  * "tim" för timarbete
- estimatedPrice: Uppskattat pris per enhet i SEK (null om osäker)
- isLabor: true för arbete, false för material
- category: En av: rivning, el, vvs, malning, golv, kok, badrum, snickeri, kakel, ovrigt

VIKTIGT:
- Dela upp arbeten i logiska delposter
- Separera material från arbete när möjligt
- Använd realistiska svenska priser (2024):
  * Hantverkararbete: 450-650 kr/tim
  * Målning: 150-250 kr/m2
  * Golvläggning: 300-600 kr/m2
  * Kakel/klinker: 800-1500 kr/m2 (inkl arbete)
  * Rivning: 200-400 kr/m2
- Om inget pris kan uppskattas, sätt null
- Skapa en kort sammanfattning av projektet

Svara ENDAST med giltig JSON:
{
  "items": [...],
  "summary": "Kort sammanfattning av projektet"
}`;

async function generateWithOpenAI(description: string): Promise<GenerationResult> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  if (!description || description.trim().length < 10) {
    throw new Error('Beskrivningen är för kort. Skriv mer detaljer om projektet.');
  }

  console.log('Generating quote items, description length:', description.length);

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
          content: SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: `Skapa offertrader för följande projekt:\n\n${description.substring(0, 10000)}`,
        },
      ],
      max_tokens: 2048,
      temperature: 0.3,
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

  console.log('OpenAI response received, length:', content.length);

  // Parse JSON from response
  let jsonText = content;

  // Try to extract JSON from markdown code blocks if present
  const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1].trim();
  }

  try {
    const result = JSON.parse(jsonText);
    return {
      items: result.items || [],
      summary: result.summary || '',
    };
  } catch (parseError) {
    console.error('Failed to parse OpenAI response:', jsonText.substring(0, 500));
    throw new Error('Kunde inte tolka AI-svaret. Försök igen.');
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const { description } = await req.json();

    console.log('Processing quote generation request');

    if (!description) {
      throw new Error('description is required');
    }

    const result = await generateWithOpenAI(description);

    console.log('Success! Generated items:', result.items.length);

    return new Response(JSON.stringify(result), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Error generating quote items:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        items: [],
        summary: '',
      }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
