/**
 * AI Vision Service for Floor Plan Conversion
 * Uses Supabase Edge Functions to securely process images
 */

import { v4 as uuidv4 } from "uuid";
import { FloorMapShape } from "@/components/floormap/types";
import { supabase } from "@/lib/supabaseClient";
import { postProcessWalls } from "@/services/wallPostProcess";
import { worldPerMm } from "@/components/floormap/editor/core/units";

export interface AIConversionResult {
  walls: Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    thickness?: number;
  }>;
  doors: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
  }>;
  fixtures: Array<{
    x: number;
    y: number;
    symbolType: string;
    rotation?: number;
  }>;
  rooms: Array<{
    points: Array<{ x: number; y: number }>;
    name?: string;
  }>;
}

/**
 * Convert image to Base64
 */
async function imageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      const base64Data = base64.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Call Supabase Edge Function instead of OpenAI directly
 */
async function callVisionAPI(
  base64Image: string,
  ratio: number,
  imageWidth?: number,
  imageHeight?: number
): Promise<AIConversionResult> {

  const { data, error } = await supabase.functions.invoke('process-floorplan', {
    body: {
      image: base64Image,
      ratio: ratio,
      imageWidth,
      imageHeight,
    },
  });

  if (error) {
    console.error('Supabase Edge Function error:', error);
    throw new Error(`AI-analys misslyckades: ${error.message}`);
  }

  return data as AIConversionResult;
}

/**
 * Convert AI result to FloorMapShape objects.
 * `ratio` scales the result's coordinate space into persisted world units
 * (callers pass worldPerMm() for mm-space results). Real-mm fields
 * (thicknessMM/heightMM) are NOT scaled.
 */
function convertToFloorMapShapes(
  aiResult: AIConversionResult,
  ratio: number,
  planId: string
): FloorMapShape[] {
  const shapes: FloorMapShape[] = [];
  const r = (v: number) => v * ratio;

  // Walls
  aiResult.walls?.forEach((wall) => {
    shapes.push({
      id: uuidv4(),
      planId,
      type: 'wall',
      coordinates: { x1: r(wall.x1), y1: r(wall.y1), x2: r(wall.x2), y2: r(wall.y2) },
      thicknessMM: wall.thickness || 150,
      heightMM: 2400,
      strokeColor: '#2d3748',
    });
  });

  // Doors — create as library symbol shapes
  aiResult.doors?.forEach((door) => {
    const rotation = door.rotation || 0;
    const symbolType = rotation === 90 || rotation === 270 ? 'door_swing_right' : 'door_swing_left';
    shapes.push({
      id: uuidv4(),
      planId,
      type: 'freehand',
      coordinates: {
        points: [
          { x: r(door.x), y: r(door.y) },
          { x: r(door.x) + 1, y: r(door.y) + 1 },
        ],
      },
      strokeColor: '#000000',
      color: 'transparent',
      strokeWidth: 2,
      name: symbolType === 'door_swing_left' ? 'Door (Left Swing)' : 'Door (Right Swing)',
      metadata: {
        isLibrarySymbol: true,
        symbolType,
        placementX: r(door.x),
        placementY: r(door.y),
        scale: 1,
        rotation: rotation,
      },
    });
  });

  // Fixtures — architectural objects mapped to library symbols
  aiResult.fixtures?.forEach((fixture) => {
    shapes.push({
      id: uuidv4(),
      planId,
      type: 'freehand',
      coordinates: {
        points: [
          { x: r(fixture.x), y: r(fixture.y) },
          { x: r(fixture.x) + 1, y: r(fixture.y) + 1 },
        ],
      },
      strokeColor: '#000000',
      color: 'transparent',
      strokeWidth: 2,
      name: fixture.symbolType,
      metadata: {
        isLibrarySymbol: true,
        symbolType: fixture.symbolType,
        placementX: r(fixture.x),
        placementY: r(fixture.y),
        scale: 1,
        rotation: fixture.rotation || 0,
      },
    });
  });

  // Rooms
  aiResult.rooms?.forEach((room) => {
    const baseColor = '#3b82f6';
    const getDarkerColor = (hexColor: string): string => {
      return `rgba(25, 57, 109, 0.8)`; // Förenklad mörkblå
    };

    shapes.push({
      id: uuidv4(),
      planId,
      type: 'room',
      coordinates: { points: room.points.map((p) => ({ x: r(p.x), y: r(p.y) })) },
      name: room.name || 'Unnamed Room',
      color: 'rgba(59, 130, 246, 0.2)',
      fillOpacity: 0.1,
      strokeColor: getDarkerColor(baseColor),
    });
  });

  return shapes;
}

export async function convertImageToBlueprint(
  imageFile: File,
  pixelToMmRatio: number,
  planId: string,
  imageWidth?: number,
  imageHeight?: number
): Promise<FloorMapShape[]> {
  const aiResult = await analyzeFloorPlan(imageFile, pixelToMmRatio, imageWidth, imageHeight);
  return floorPlanResultToShapes(aiResult, planId);
}

/**
 * Analyze only (no shape conversion) — coordinates come back in mm. Split out
 * so Renaida's folder ingest (Fas D) can analyze at drop time (room names fold
 * into the draft) and materialize shapes later at project birth without a
 * second vision call.
 */
export async function analyzeFloorPlan(
  imageFile: File,
  pixelToMmRatio: number,
  imageWidth?: number,
  imageHeight?: number
): Promise<AIConversionResult> {
  const base64Image = await imageToBase64(imageFile);
  const aiResult = await callVisionAPI(base64Image, pixelToMmRatio, imageWidth, imageHeight);
  aiResult.walls = postProcessWalls(aiResult.walls || []);
  return aiResult;
}

/**
 * Analyze a floor-plan IMAGE file end-to-end: measure its pixel dimensions,
 * derive the px→mm ratio (longest side spans DEFAULT span), run the vision
 * analysis. Single source for Renaida's folder ingest AND the live-panel
 * floor-plan capture (SP1).
 */
export const DEFAULT_SKETCH_SPAN_MM = 10000;

export async function analyzeFloorPlanFile(file: File): Promise<AIConversionResult> {
  let width: number | undefined;
  let height: number | undefined;
  try {
    const bmp = await createImageBitmap(file);
    width = bmp.width;
    height = bmp.height;
    bmp.close();
  } catch {
    /* dims stay undefined — the edge fn copes */
  }
  const ratio = width && height ? DEFAULT_SKETCH_SPAN_MM / Math.max(width, height) : 10;
  return analyzeFloorPlan(file, ratio, width, height);
}

/**
 * Turn an analyzed (mm-space) result into placeable floor-map shapes.
 * Persisted shapes are in WORLD UNITS (1 unit = 1/pixelsPerMm mm — see
 * editor/core/units.ts), so mm coordinates are scaled by pixelsPerMm here.
 * thicknessMM/heightMM stay in real mm (semantic mm fields).
 */
export function floorPlanResultToShapes(
  aiResult: AIConversionResult,
  planId: string
): FloorMapShape[] {
  return convertToFloorMapShapes(aiResult, worldPerMm(), planId);
}