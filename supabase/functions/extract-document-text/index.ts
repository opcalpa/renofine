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

interface ExtractRequest {
  fileBase64: string;
  mimeType: string;
  fileName: string;
}

async function extractTextWithOpenAI(
  base64Data: string,
  mimeType: string,
  fileName: string
): Promise<string> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  // For images, use GPT-4 Vision
  if (mimeType.startsWith('image/')) {
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
            content: `Du är en expert på att extrahera text från bilder av dokument.
Extrahera ALL text från bilden exakt som den står.
Om det är en offertförfrågan, projektbeskrivning eller liknande - extrahera all relevant information.
Svara ENDAST med den extraherade texten, inga kommentarer eller förklaringar.`,
          },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Data}`,
                },
              },
              {
                type: 'text',
                text: 'Extrahera all text från denna bild.',
              },
            ],
          },
        ],
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI Vision API error:', errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  // For PDFs, use OpenAI with base64 PDF
  if (mimeType === 'application/pdf') {
    // GPT-4o-mini can handle PDFs via the file API, but for simplicity
    // we'll use a prompt to ask it to describe what it expects
    // Note: For production, consider using a dedicated PDF extraction service

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
            content: `Du är en expert på att extrahera text från PDF-dokument.
Extrahera ALL text från PDF:en exakt som den står.
Om det är en offertförfrågan, projektbeskrivning eller liknande - extrahera all relevant information.
Svara ENDAST med den extraherade texten, inga kommentarer eller förklaringar.`,
          },
          {
            role: 'user',
            content: [
              {
                type: 'file',
                file: {
                  filename: fileName,
                  file_data: `data:application/pdf;base64,${base64Data}`,
                },
              },
              {
                type: 'text',
                text: 'Extrahera all text från denna PDF.',
              },
            ],
          },
        ],
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      // If the file approach doesn't work, try treating it as an image
      // (some PDFs can be converted to images)
      console.log('PDF direct approach failed, trying alternative...');

      // Return a helpful message instead of failing completely
      return `[PDF-fil: ${fileName}]\n\nKunde inte automatiskt extrahera text från PDF. Kopiera texten manuellt från dokumentet.`;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  throw new Error(`Unsupported mime type: ${mimeType}`);
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const { fileBase64, mimeType, fileName }: ExtractRequest = await req.json();

    if (!fileBase64 || !mimeType) {
      throw new Error('fileBase64 and mimeType are required');
    }

    console.log(`Extracting text from ${fileName} (${mimeType})`);

    const text = await extractTextWithOpenAI(fileBase64, mimeType, fileName);

    console.log(`Extracted ${text.length} characters`);

    return new Response(JSON.stringify({ text }), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Error extracting text:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        text: '',
      }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
