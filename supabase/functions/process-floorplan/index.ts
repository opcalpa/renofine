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

interface Wall {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness?: number;
}

interface Door {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

interface Fixture {
  x: number;
  y: number;
  symbolType: string;
  rotation?: number;
}

interface Room {
  points: Array<{ x: number; y: number }>;
  name?: string;
}

interface FloorPlanResult {
  walls: Wall[];
  doors: Door[];
  fixtures: Fixture[];
  rooms: Room[];
}

function buildSystemPrompt(imageWidth?: number, imageHeight?: number): string {
  const dimensionLine = imageWidth && imageHeight
    ? `3. The image is exactly ${imageWidth}x${imageHeight} pixels. Return coordinates within this range.`
    : `3. Estimate coordinates based on the image dimensions.`;

  return `You are an expert at analyzing architectural floor plans and extracting geometric data.

Your task is to analyze the floor plan image and extract ALL walls, doors, fixtures, and rooms with their PIXEL coordinates.

IMPORTANT INSTRUCTIONS:
1. The image coordinate system starts at (0,0) in the TOP-LEFT corner
2. X increases to the RIGHT, Y increases DOWNWARD
${dimensionLine}
4. Extract EVERY wall segment you can see - walls are typically thick black lines
5. If there are multiple floor plans in the image, focus on the LEFT/FIRST one only

WALLS:
- Each wall is a line segment with start (x1,y1) and end (x2,y2)
- Break complex wall shapes into individual straight segments
- Include both exterior walls (thick) and interior walls (thinner)
- Estimate thickness in pixels (exterior ~15-20px, interior ~8-12px)
- Walls that appear horizontal MUST have identical y1 and y2 values
- Walls that appear vertical MUST have identical x1 and x2 values
- Wall endpoints that visually meet MUST share the EXACT same coordinates (no gaps)
- Exterior walls form a closed perimeter — ensure the first wall's start point equals the last wall's end point

DOORS:
- Doors appear as gaps in walls, often with arc symbols
- Provide center position (x,y), width, height, and rotation (0, 90, 180, 270)

FIXTURES (architectural objects/symbols):
- Identify ALL fixtures, furniture, and architectural elements visible in the floor plan
- For each fixture, provide center position (x,y), rotation (0, 90, 180, 270), and symbolType
- symbolType MUST be one of these exact values:
  DOORS: "door_swing_left", "door_swing_right", "door_double", "door_sliding", "door_pocket"
  WINDOWS: "window_standard", "window_double", "window_corner"
  BATHROOM: "toilet_standard", "toilet_wall_hung", "sink_single", "sink_double", "bathtub_standard", "bathtub_corner", "shower_square", "shower_corner"
  KITCHEN: "stove_4burner", "sink_kitchen", "refrigerator", "dishwasher"
  FURNITURE: "bed_single", "bed_double", "sofa_2seat", "sofa_3seat", "sofa_corner", "table_round", "table_rectangular", "chair"
  STAIRS: "stair_straight_up", "stair_straight_down", "stair_spiral"
- Choose the closest matching symbolType for each element you see
- Prefer placing doors as fixtures with door_swing_left/right instead of in the "doors" array

ROOMS:
- Each room is a closed polygon defined by corner points
- List points in clockwise order starting from top-left
- Include the room name if visible in the image

EXAMPLE OUTPUT:
{
  "walls": [
    {"x1": 100, "y1": 100, "x2": 400, "y2": 100, "thickness": 15},
    {"x1": 400, "y1": 100, "x2": 400, "y2": 300, "thickness": 15}
  ],
  "doors": [],
  "fixtures": [
    {"x": 200, "y": 100, "symbolType": "door_swing_left", "rotation": 0},
    {"x": 350, "y": 250, "symbolType": "toilet_standard", "rotation": 90},
    {"x": 150, "y": 150, "symbolType": "window_standard", "rotation": 0},
    {"x": 300, "y": 400, "symbolType": "stair_straight_up", "rotation": 0}
  ],
  "rooms": [
    {"points": [{"x": 100, "y": 100}, {"x": 400, "y": 100}, {"x": 400, "y": 300}, {"x": 100, "y": 300}], "name": "Bathroom"}
  ]
}

Now analyze the provided floor plan image. Return ONLY valid JSON, no explanations.`;
}

async function analyzeFloorPlan(base64Image: string, ratio: number, imageWidth?: number, imageHeight?: number): Promise<FloorPlanResult> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  console.log('Analyzing floor plan with OpenAI Vision, ratio:', ratio);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt(imageWidth, imageHeight),
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${base64Image}`,
                detail: 'high',
              },
            },
            {
              type: 'text',
              text: 'Analyze this floor plan. Extract all walls as line segments, all doors, and all rooms as polygons. Return the coordinates in pixels. Be thorough - include every wall segment you can identify.',
            },
          ],
        },
      ],
      max_tokens: 16384,
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

    console.log('Parsed raw result:',
      'walls:', result.walls?.length || 0,
      'doors:', result.doors?.length || 0,
      'fixtures:', result.fixtures?.length || 0,
      'rooms:', result.rooms?.length || 0
    );

    // Apply ratio conversion (pixel to mm)
    const convertedResult: FloorPlanResult = {
      walls: (result.walls || []).map((wall: Wall) => ({
        x1: Math.round(wall.x1 * ratio),
        y1: Math.round(wall.y1 * ratio),
        x2: Math.round(wall.x2 * ratio),
        y2: Math.round(wall.y2 * ratio),
        thickness: Math.round((wall.thickness || 12) * ratio),
      })),
      doors: (result.doors || []).map((door: Door) => ({
        x: Math.round(door.x * ratio),
        y: Math.round(door.y * ratio),
        width: Math.round(door.width * ratio),
        height: Math.round(door.height * ratio),
        rotation: door.rotation || 0,
      })),
      fixtures: (result.fixtures || []).map((fixture: Fixture) => ({
        x: Math.round(fixture.x * ratio),
        y: Math.round(fixture.y * ratio),
        symbolType: fixture.symbolType,
        rotation: fixture.rotation || 0,
      })),
      rooms: (result.rooms || []).map((room: Room) => ({
        points: (room.points || []).map((p: { x: number; y: number }) => ({
          x: Math.round(p.x * ratio),
          y: Math.round(p.y * ratio),
        })),
        name: room.name || 'Room',
      })),
    };

    console.log(
      'Converted result:',
      convertedResult.walls.length, 'walls,',
      convertedResult.doors.length, 'doors,',
      convertedResult.fixtures.length, 'fixtures,',
      convertedResult.rooms.length, 'rooms'
    );

    return convertedResult;
  } catch (parseError) {
    console.error('Failed to parse OpenAI response:', jsonText.substring(0, 1000));
    console.error('Parse error:', parseError);

    // Return empty result instead of throwing
    return {
      walls: [],
      doors: [],
      fixtures: [],
      rooms: [],
    };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const { image, ratio, imageWidth, imageHeight } = await req.json();

    if (!image) {
      throw new Error('image is required');
    }

    if (!ratio || ratio <= 0) {
      throw new Error('Valid ratio is required');
    }

    console.log('Processing floor plan, image length:', image.length, 'chars, ratio:', ratio, 'dimensions:', imageWidth, 'x', imageHeight);

    const result = await analyzeFloorPlan(image, ratio, imageWidth, imageHeight);

    return new Response(JSON.stringify(result), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Error processing floor plan:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        walls: [],
        doors: [],
        rooms: [],
      }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
