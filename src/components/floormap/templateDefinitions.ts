/**
 * TEMPLATE SYSTEM - Save & Reuse Canvas Selections
 * 
 * Allows users to save selected shapes as reusable templates.
 * Templates can be walls, objects, or combinations.
 * When placed, they create regular editable shapes.
 * 
 * Storage: Supabase database (templates table)
 */

import { FloorMapShape } from './types';
import { supabase } from '@/integrations/supabase/client';

export interface Template {
  id: string;
  user_id: string;
  project_id?: string;
  name: string;
  description?: string;
  category: TemplateCategory;
  
  // The shapes that make up this template (relative coordinates)
  shapes: FloorMapShape[];
  
  // Bounding box (for preview and placement)
  bounds: {
    width: number;  // in mm
    height: number; // in mm
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  
  // Metadata
  created_at: string;
  updated_at?: string;
  tags?: string[];
}

export type TemplateCategory = 
  | 'walls'
  | 'bathroom'
  | 'kitchen'
  | 'electrical'
  | 'furniture'
  | 'doors_windows'
  | 'stairs'
  | 'structural'
  | 'other';

/**
 * Calculate bounding box for a set of shapes
 */
export function calculateBounds(shapes: FloorMapShape[]): Template['bounds'] {
  if (shapes.length === 0) {
    return { width: 0, height: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  
  shapes.forEach(shape => {
    const coords = shape.coordinates as any;
    
    // WALLS: {x1, y1, x2, y2}
    if (shape.type === 'wall' && coords.x1 !== undefined) {
      minX = Math.min(minX, coords.x1, coords.x2);
      minY = Math.min(minY, coords.y1, coords.y2);
      maxX = Math.max(maxX, coords.x1, coords.x2);
      maxY = Math.max(maxY, coords.y1, coords.y2);
    }
    // ROOMS/POLYGONS: {points: [...]}
    else if ((shape.type === 'room' || shape.type === 'polygon') && coords.points) {
      coords.points.forEach((point: any) => {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      });
    }
    // FREEHAND: {points: [...]} or with placementX/Y
    else if (shape.type === 'freehand' && coords.points) {
      if (shape.metadata?.placementX !== undefined && shape.metadata?.placementY !== undefined) {
        const px = shape.metadata.placementX;
        const py = shape.metadata.placementY;
        const size = 1000;
        minX = Math.min(minX, px);
        minY = Math.min(minY, py);
        maxX = Math.max(maxX, px + size);
        maxY = Math.max(maxY, py + size);
      } else {
        coords.points.forEach((point: any) => {
          minX = Math.min(minX, point.x);
          minY = Math.min(minY, point.y);
          maxX = Math.max(maxX, point.x);
          maxY = Math.max(maxY, point.y);
        });
      }
    }
    // RECTANGLES: {left, top, width, height}
    else if (shape.type === 'rectangle' && coords.left !== undefined) {
      minX = Math.min(minX, coords.left);
      minY = Math.min(minY, coords.top);
      maxX = Math.max(maxX, coords.left + coords.width);
      maxY = Math.max(maxY, coords.top + coords.height);
    }
    // CIRCLES: {cx, cy, radius}
    else if (shape.type === 'circle' && coords.cx !== undefined) {
      minX = Math.min(minX, coords.cx - coords.radius);
      minY = Math.min(minY, coords.cy - coords.radius);
      maxX = Math.max(maxX, coords.cx + coords.radius);
      maxY = Math.max(maxY, coords.cy + coords.radius);
    }
    // SYMBOLS: {x, y, width, height}
    else if (shape.type === 'symbol' && coords.x !== undefined) {
      minX = Math.min(minX, coords.x);
      minY = Math.min(minY, coords.y);
      maxX = Math.max(maxX, coords.x + (coords.width || 0));
      maxY = Math.max(maxY, coords.y + (coords.height || 0));
    }
    // TEXT: {x, y}
    else if (shape.type === 'text' && coords.x !== undefined) {
      minX = Math.min(minX, coords.x);
      minY = Math.min(minY, coords.y);
      maxX = Math.max(maxX, coords.x + 100); // Assume 100mm width for text
      maxY = Math.max(maxY, coords.y + 20); // Assume 20mm height for text
    }
  });
  
  return {
    width: maxX - minX,
    height: maxY - minY,
    minX,
    minY,
    maxX,
    maxY,
  };
}

/**
 * Normalize shapes to relative coordinates (starting from 0,0)
 */
export function normalizeShapes(shapes: FloorMapShape[]): FloorMapShape[] {
  const bounds = calculateBounds(shapes);
  const offsetX = bounds.minX;
  const offsetY = bounds.minY;
  
  // Normalizing shapes to relative coordinates
  
  return shapes.map(shape => {
    const normalized = JSON.parse(JSON.stringify(shape)); // Deep clone
    
    if (shape.type === 'wall' && shape.coordinates.points) {
      normalized.coordinates.points = shape.coordinates.points.map(p => ({
        x: p.x - offsetX,
        y: p.y - offsetY,
      }));
    } else if (shape.type === 'room' && shape.coordinates.points) {
      normalized.coordinates.points = shape.coordinates.points.map(p => ({
        x: p.x - offsetX,
        y: p.y - offsetY,
      }));
    } else if (shape.type === 'freehand' && shape.coordinates.points) {
      if (shape.metadata?.placementX !== undefined && shape.metadata?.placementY !== undefined) {
        // For library symbols/objects, adjust placement
        normalized.metadata = {
          ...shape.metadata,
          placementX: shape.metadata.placementX - offsetX,
          placementY: shape.metadata.placementY - offsetY,
        };
      } else {
        normalized.coordinates.points = shape.coordinates.points.map(p => ({
          x: p.x - offsetX,
          y: p.y - offsetY,
        }));
      }
    } else if (shape.type === 'rectangle' && shape.coordinates.x !== undefined && shape.coordinates.y !== undefined) {
      normalized.coordinates.x = shape.coordinates.x - offsetX;
      normalized.coordinates.y = shape.coordinates.y - offsetY;
    } else if (shape.type === 'circle' && shape.coordinates.x !== undefined && shape.coordinates.y !== undefined) {
      normalized.coordinates.x = shape.coordinates.x - offsetX;
      normalized.coordinates.y = shape.coordinates.y - offsetY;
    }
    
    return normalized;
  });
}

/**
 * Place template shapes at a specific position (convert relative to absolute)
 * This function recalculates bounds from the actual shapes to ensure correct placement.
 * All shapes from the same template placement share a groupId for unified manipulation.
 */
export function placeTemplateShapes(
  template: Template | null,
  position: { x: number; y: number },
  planId: string
): FloorMapShape[] {
  if (!template || !template.shapes) {
    console.error('Invalid template or template.shapes is undefined');
    return [];
  }

  // Calculate actual bounds from the template shapes (in case normalization wasn't perfect)
  const actualBounds = calculateBounds(template.shapes);

  // Calculate offset needed to move shapes from their current position to the click position
  // We want the top-left corner of the bounding box to be at the click position
  const offsetX = position.x - actualBounds.minX;
  const offsetY = position.y - actualBounds.minY;

  // Generate a shared groupId for all shapes from this template placement
  const groupId = crypto.randomUUID();

  // Template info to attach to the group leader
  const templateInfo = {
    templateId: template.id,
    templateName: template.name,
    category: template.category,
    boundsWidth: actualBounds.width,
    boundsHeight: actualBounds.height,
    boundsDepth: 2400, // Default height in mm (can be edited later)
    originalWidth: actualBounds.width,
    originalHeight: actualBounds.height,
    originalDepth: 2400,
  };

  return template.shapes.map((shape, index) => {
    const placed = JSON.parse(JSON.stringify(shape)) as FloorMapShape; // Deep clone
    placed.id = crypto.randomUUID(); // New unique ID
    placed.planId = planId; // Assign to current plan
    placed.groupId = groupId; // Link all shapes from same template

    // First shape is the group leader (holds templateInfo and represents the group)
    if (index === 0) {
      placed.isGroupLeader = true;
      placed.templateInfo = templateInfo;
    }

    const coords = placed.coordinates as any;

    // WALLS: {x1, y1, x2, y2}
    if (shape.type === 'wall' && coords.x1 !== undefined) {
      coords.x1 += offsetX;
      coords.y1 += offsetY;
      coords.x2 += offsetX;
      coords.y2 += offsetY;
    }
    // ROOMS/POLYGONS: {points: [...]}
    else if ((shape.type === 'room' || shape.type === 'polygon') && coords.points) {
      coords.points = coords.points.map((p: any) => ({
        x: p.x + offsetX,
        y: p.y + offsetY,
      }));
    }
    // FREEHAND: {points: [...]} or with placementX/Y
    else if (shape.type === 'freehand' && coords.points) {
      if (placed.metadata?.placementX !== undefined) {
        placed.metadata.placementX += offsetX;
        placed.metadata.placementY += offsetY;
      } else {
        coords.points = coords.points.map((p: any) => ({
          x: p.x + offsetX,
          y: p.y + offsetY,
        }));
      }
    }
    // RECTANGLES: {left, top, width, height}
    else if (shape.type === 'rectangle' && coords.left !== undefined) {
      coords.left += offsetX;
      coords.top += offsetY;
    }
    // CIRCLES: {cx, cy, radius}
    else if (shape.type === 'circle' && coords.cx !== undefined) {
      coords.cx += offsetX;
      coords.cy += offsetY;
    }
    // SYMBOLS: {x, y, width, height}
    else if (shape.type === 'symbol' && coords.x !== undefined) {
      coords.x += offsetX;
      coords.y += offsetY;
    }
    // TEXT: {x, y}
    else if (shape.type === 'text' && coords.x !== undefined) {
      coords.x += offsetX;
      coords.y += offsetY;
    }
    // Unified library objects (v2) position via metadata.placementX/Y
    // (freehand already offset its metadata above — don't double-shift)
    if (
      shape.type !== 'freehand' &&
      typeof placed.metadata?.placementX === 'number' &&
      typeof placed.metadata?.placementY === 'number'
    ) {
      placed.metadata.placementX += offsetX;
      placed.metadata.placementY += offsetY;
    }
    return placed;
  });
}

/**
 * Get all templates for current user
 */
export async function getTemplates(projectId?: string): Promise<Template[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    
    let query = supabase
      .from('templates')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    
    if (projectId) {
      query = query.eq('project_id', projectId);
    }
    
    const { data, error } = await query;
    
    if (error) {
      if (error.code !== 'PGRST205') {
        console.error('Error loading templates:', error);
      }
      return [];
    }
    
    return data || [];
  } catch (error) {
    return [];
  }
}

/**
 * Add a new template
 */
export async function addTemplate(template: Omit<Template, 'id' | 'created_at' | 'updated_at'>): Promise<Template | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    const { data, error } = await supabase
      .from('templates')
      .insert({
        user_id: user.id,
        project_id: template.project_id,
        name: template.name,
        description: template.description,
        category: template.category,
        shapes: template.shapes as any,
        bounds: template.bounds as any,
        tags: template.tags,
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error adding template:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Error adding template:', error);
    return null;
  }
}

/**
 * Delete a template
 */
export async function deleteTemplate(templateId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('templates')
      .delete()
      .eq('id', templateId);
    
    if (error) {
      console.error('Error deleting template:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error deleting template:', error);
    return false;
  }
}

/**
 * Get template by ID
 */
export async function getTemplateById(templateId: string): Promise<Template | null> {
  try {
    const { data, error } = await supabase
      .from('templates')
      .select('*')
      .eq('id', templateId)
      .single();
    
    if (error) {
      if (error.code !== 'PGRST205') {
        console.error('Error getting template:', error);
      }
      return null;
    }
    
    return data;
  } catch (error) {
    return null;
  }
}

/**
 * Get templates by category
 */
export async function getTemplatesByCategory(category: TemplateCategory, projectId?: string): Promise<Template[]> {
  const templates = await getTemplates(projectId);
  return templates.filter(t => t.category === category);
}

/**
 * Get all categories with templates
 */
export async function getAllTemplateCategories(projectId?: string): Promise<TemplateCategory[]> {
  const templates = await getTemplates(projectId);
  const categories = new Set<TemplateCategory>(templates.map(t => t.category));
  return Array.from(categories);
}

/**
 * Export templates as JSON
 */
export async function exportTemplatesAsJSON(projectId?: string): Promise<string> {
  const templates = await getTemplates(projectId);
  return JSON.stringify(templates, null, 2);
}

/**
 * Import templates from JSON
 */
export async function importTemplatesFromJSON(json: string, projectId?: string): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const imported = JSON.parse(json);
    if (!Array.isArray(imported)) {
      return { success: false, count: 0, error: 'Invalid JSON format (not an array)' };
    }
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, count: 0, error: 'User not authenticated' };
    }
    
    let successCount = 0;
    for (const template of imported) {
      const result = await addTemplate({
        user_id: user.id,
        project_id: projectId,
        name: template.name,
        description: template.description,
        category: template.category,
        shapes: template.shapes,
        bounds: template.bounds,
        tags: template.tags,
      });
      
      if (result) {
        successCount++;
      }
    }
    
    return { success: true, count: successCount };
  } catch (error) {
    return { success: false, count: 0, error: (error as Error).message };
  }
}

/**
 * TEMPLATE COORDINATE SYSTEM
 * 
 * Canvas coordinate system: 1 canvas unit = 10 mm in real world
 * Therefore: To get 900mm on canvas, we need coordinate value of 90
 * 
 * SCALE_FACTOR converts real-world mm to canvas units
 * Formula: canvas_units = real_mm / SCALE_FACTOR
 * 
 * Standard measurements (in real mm → canvas units):
 * - Door width: 900mm → 90 units
 * - Window width: 1200mm → 120 units  
 * - Wall thickness: 150mm → 15 units
 * - Room height: 2400mm → 240 units
 */
const TEMPLATE_SCALE_FACTOR = 10; // 1 canvas unit = 10mm

/**
 * Helper function to convert mm to canvas units
 */
const mm = (value: number) => value / TEMPLATE_SCALE_FACTOR;

/**
 * Default architectural templates
 * Professional standard symbols according to Swedish building standards (SS-EN ISO 7518)
 * Simple, clear representations suitable for 1:50 and 1:100 scale drawings
 * ALL COORDINATES ARE IN CANVAS UNITS (use mm() helper for real measurements)
 * Centered around origin (0,0) for easy placement
 */
export const DEFAULT_TEMPLATES: Omit<Template, 'id' | 'user_id' | 'created_at'>[] = [
  // ============================================================================
  // SANITET / BATHROOM (Standard symbols)
  // ============================================================================

  // WC - Standard symbol: oval bowl + rectangular tank
  {
    name: 'WC',
    description: 'Toalettstol (380×700mm)',
    category: 'bathroom',
    tags: ['wc', 'toalett', 'sanitet'],
    shapes: [
      // Tank
      {
        id: 'wc-tank',
        type: 'rectangle',
        coordinates: { left: mm(-190), top: mm(-350), width: mm(380), height: mm(180) },
        strokeColor: '#1f2937',
        strokeWidth: 2,
        color: 'transparent',
      } as FloorMapShape,
      // Bowl (oval shape approximated with rectangle + semicircle feel)
      {
        id: 'wc-bowl',
        type: 'rectangle',
        coordinates: { left: mm(-175), top: mm(-170), width: mm(350), height: mm(520) },
        strokeColor: '#1f2937',
        strokeWidth: 2,
        color: 'transparent',
      } as FloorMapShape,
    ],
    bounds: { width: mm(380), height: mm(700), minX: mm(-190), minY: mm(-350), maxX: mm(190), maxY: mm(350) },
  },

  // Handfat - Standard symbol
  {
    name: 'Handfat',
    description: 'Tvättställ (500×400mm)',
    category: 'bathroom',
    tags: ['handfat', 'tvättställ', 'sanitet'],
    shapes: [
      {
        id: 'sink-body',
        type: 'rectangle',
        coordinates: { left: mm(-250), top: mm(-200), width: mm(500), height: mm(400) },
        strokeColor: '#1f2937',
        strokeWidth: 2,
        color: 'transparent',
      } as FloorMapShape,
    ],
    bounds: { width: mm(500), height: mm(400), minX: mm(-250), minY: mm(-200), maxX: mm(250), maxY: mm(200) },
  },

  // Dusch - Standard symbol med golvbrunn
  {
    name: 'Dusch 900×900',
    description: 'Duschutrymme med brunn',
    category: 'bathroom',
    tags: ['dusch', 'sanitet'],
    shapes: [
      // Duschyta
      {
        id: 'shower-area',
        type: 'rectangle',
        coordinates: { left: mm(-450), top: mm(-450), width: mm(900), height: mm(900) },
        strokeColor: '#1f2937',
        strokeWidth: 2,
        color: 'transparent',
      } as FloorMapShape,
      // Golvbrunn (diagonal)
      {
        id: 'shower-drain',
        type: 'wall',
        coordinates: { x1: mm(-150), y1: mm(-150), x2: mm(150), y2: mm(150) },
        strokeColor: '#6b7280',
        strokeWidth: 1,
      } as FloorMapShape,
      {
        id: 'shower-drain-2',
        type: 'wall',
        coordinates: { x1: mm(-150), y1: mm(150), x2: mm(150), y2: mm(-150) },
        strokeColor: '#6b7280',
        strokeWidth: 1,
      } as FloorMapShape,
    ],
    bounds: { width: mm(900), height: mm(900), minX: mm(-450), minY: mm(-450), maxX: mm(450), maxY: mm(450) },
  },

  // Badkar - Standard symbol
  {
    name: 'Badkar',
    description: 'Standard badkar (1700×700mm)',
    category: 'bathroom',
    tags: ['badkar', 'sanitet'],
    shapes: [
      {
        id: 'bath-body',
        type: 'rectangle',
        coordinates: { left: mm(-850), top: mm(-350), width: mm(1700), height: mm(700) },
        strokeColor: '#1f2937',
        strokeWidth: 2,
        color: 'transparent',
      } as FloorMapShape,
    ],
    bounds: { width: mm(1700), height: mm(700), minX: mm(-850), minY: mm(-350), maxX: mm(850), maxY: mm(350) },
  },

  // Tvättmaskin
  {
    name: 'Tvättmaskin',
    description: 'Tvättmaskin (600×600mm)',
    category: 'bathroom',
    tags: ['tvättmaskin', 'vitvaror'],
    shapes: [
      {
        id: 'washer-body',
        type: 'rectangle',
        coordinates: { left: mm(-300), top: mm(-300), width: mm(600), height: mm(600) },
        strokeColor: '#1f2937',
        strokeWidth: 2,
        color: 'transparent',
      } as FloorMapShape,
      // Lucka/trumma
      {
        id: 'washer-drum',
        type: 'circle',
        coordinates: { cx: 0, cy: 0, radius: mm(180) },
        strokeColor: '#6b7280',
        strokeWidth: 1,
        color: 'transparent',
      } as FloorMapShape,
    ],
    bounds: { width: mm(600), height: mm(600), minX: mm(-300), minY: mm(-300), maxX: mm(300), maxY: mm(300) },
  },

  // ============================================================================
  // KÖK / KITCHEN
  // ============================================================================

  // Spis/Häll - Symbol med X
  {
    name: 'Spis 600',
    description: 'Spis/häll (600×600mm)',
    category: 'kitchen',
    tags: ['spis', 'häll', 'kök'],
    shapes: [
      {
        id: 'stove-body',
        type: 'rectangle',
        coordinates: { left: mm(-300), top: mm(-300), width: mm(600), height: mm(600) },
        strokeColor: '#1f2937',
        strokeWidth: 2,
        color: 'transparent',
      } as FloorMapShape,
      // X-markering
      {
        id: 'stove-x1',
        type: 'wall',
        coordinates: { x1: mm(-200), y1: mm(-200), x2: mm(200), y2: mm(200) },
        strokeColor: '#6b7280',
        strokeWidth: 1,
      } as FloorMapShape,
      {
        id: 'stove-x2',
        type: 'wall',
        coordinates: { x1: mm(-200), y1: mm(200), x2: mm(200), y2: mm(-200) },
        strokeColor: '#6b7280',
        strokeWidth: 1,
      } as FloorMapShape,
    ],
    bounds: { width: mm(600), height: mm(600), minX: mm(-300), minY: mm(-300), maxX: mm(300), maxY: mm(300) },
  },

  // Diskho
  {
    name: 'Diskho',
    description: 'Diskho enkel (600×500mm)',
    category: 'kitchen',
    tags: ['diskho', 'vask', 'kök'],
    shapes: [
      {
        id: 'sink-cabinet',
        type: 'rectangle',
        coordinates: { left: mm(-300), top: mm(-250), width: mm(600), height: mm(500) },
        strokeColor: '#1f2937',
        strokeWidth: 2,
        color: 'transparent',
      } as FloorMapShape,
      // Hoöppning
      {
        id: 'sink-bowl',
        type: 'rectangle',
        coordinates: { left: mm(-200), top: mm(-150), width: mm(400), height: mm(300) },
        strokeColor: '#6b7280',
        strokeWidth: 1,
        color: 'transparent',
      } as FloorMapShape,
    ],
    bounds: { width: mm(600), height: mm(500), minX: mm(-300), minY: mm(-250), maxX: mm(300), maxY: mm(250) },
  },

  // Kyl/Frys
  {
    name: 'Kyl/Frys',
    description: 'Kombinerad kyl/frys (600×600mm)',
    category: 'kitchen',
    tags: ['kyl', 'frys', 'kök', 'vitvaror'],
    shapes: [
      {
        id: 'fridge-body',
        type: 'rectangle',
        coordinates: { left: mm(-300), top: mm(-300), width: mm(600), height: mm(600) },
        strokeColor: '#1f2937',
        strokeWidth: 2,
        color: 'transparent',
      } as FloorMapShape,
      // Diagonal (standard kyl-symbol)
      {
        id: 'fridge-diag',
        type: 'wall',
        coordinates: { x1: mm(-300), y1: mm(-300), x2: mm(300), y2: mm(300) },
        strokeColor: '#6b7280',
        strokeWidth: 1,
      } as FloorMapShape,
    ],
    bounds: { width: mm(600), height: mm(600), minX: mm(-300), minY: mm(-300), maxX: mm(300), maxY: mm(300) },
  },

  // Diskmaskin
  {
    name: 'Diskmaskin',
    description: 'Diskmaskin (600×600mm)',
    category: 'kitchen',
    tags: ['diskmaskin', 'kök', 'vitvaror'],
    shapes: [
      {
        id: 'dishwasher-body',
        type: 'rectangle',
        coordinates: { left: mm(-300), top: mm(-300), width: mm(600), height: mm(600) },
        strokeColor: '#1f2937',
        strokeWidth: 2,
        color: 'transparent',
      } as FloorMapShape,
      // Horisontell linje (lucka)
      {
        id: 'dishwasher-door',
        type: 'wall',
        coordinates: { x1: mm(-250), y1: mm(0), x2: mm(250), y2: mm(0) },
        strokeColor: '#6b7280',
        strokeWidth: 1,
      } as FloorMapShape,
    ],
    bounds: { width: mm(600), height: mm(600), minX: mm(-300), minY: mm(-300), maxX: mm(300), maxY: mm(300) },
  },

  // ============================================================================
  // DÖRRAR / DOORS
  // ============================================================================

  // Enkeldörr 9M (900mm)
  {
    name: 'Dörr 9M',
    description: 'Enkeldörr 900mm med slagbåge',
    category: 'doors_windows',
    tags: ['dörr', 'enkeldörr', '9M', '900mm'],
    shapes: [
      // Dörrblad
      {
        id: 'door-leaf',
        type: 'wall',
        coordinates: { x1: 0, y1: 0, x2: mm(900), y2: 0 },
        strokeColor: '#1f2937',
        strokeWidth: 3,
      } as FloorMapShape,
      // Slagbåge (kvartsirkel)
      {
        id: 'door-swing',
        type: 'freehand',
        coordinates: {
          points: Array.from({ length: 25 }, (_, i) => {
            const angle = (i / 24) * (Math.PI / 2);
            return { x: Math.cos(angle) * mm(900), y: Math.sin(angle) * mm(900) };
          }),
        },
        strokeColor: '#9ca3af',
        strokeWidth: 1,
      } as FloorMapShape,
    ],
    bounds: { width: mm(900), height: mm(900), minX: 0, minY: 0, maxX: mm(900), maxY: mm(900) },
  },

  // Enkeldörr 8M (800mm)
  {
    name: 'Dörr 8M',
    description: 'Enkeldörr 800mm med slagbåge',
    category: 'doors_windows',
    tags: ['dörr', 'enkeldörr', '8M', '800mm'],
    shapes: [
      {
        id: 'door-leaf',
        type: 'wall',
        coordinates: { x1: 0, y1: 0, x2: mm(800), y2: 0 },
        strokeColor: '#1f2937',
        strokeWidth: 3,
      } as FloorMapShape,
      {
        id: 'door-swing',
        type: 'freehand',
        coordinates: {
          points: Array.from({ length: 25 }, (_, i) => {
            const angle = (i / 24) * (Math.PI / 2);
            return { x: Math.cos(angle) * mm(800), y: Math.sin(angle) * mm(800) };
          }),
        },
        strokeColor: '#9ca3af',
        strokeWidth: 1,
      } as FloorMapShape,
    ],
    bounds: { width: mm(800), height: mm(800), minX: 0, minY: 0, maxX: mm(800), maxY: mm(800) },
  },

  // Skjutdörr
  {
    name: 'Skjutdörr',
    description: 'Skjutdörr 900mm',
    category: 'doors_windows',
    tags: ['dörr', 'skjutdörr'],
    shapes: [
      // Skena
      {
        id: 'slide-track',
        type: 'wall',
        coordinates: { x1: 0, y1: 0, x2: mm(1800), y2: 0 },
        strokeColor: '#9ca3af',
        strokeWidth: 1,
      } as FloorMapShape,
      // Dörrblad (stängt)
      {
        id: 'door-closed',
        type: 'wall',
        coordinates: { x1: mm(900), y1: mm(-30), x2: mm(1800), y2: mm(-30) },
        strokeColor: '#1f2937',
        strokeWidth: 3,
      } as FloorMapShape,
      // Pil
      {
        id: 'arrow',
        type: 'wall',
        coordinates: { x1: mm(900), y1: mm(30), x2: mm(450), y2: mm(30) },
        strokeColor: '#6b7280',
        strokeWidth: 1,
      } as FloorMapShape,
    ],
    bounds: { width: mm(1800), height: mm(100), minX: 0, minY: mm(-50), maxX: mm(1800), maxY: mm(50) },
  },

  // ============================================================================
  // FÖNSTER / WINDOWS
  // ============================================================================

  // Fönster 12M
  {
    name: 'Fönster 12M',
    description: 'Fönster 1200mm',
    category: 'doors_windows',
    tags: ['fönster', '12M', '1200mm'],
    shapes: [
      // Ytterram
      {
        id: 'frame-top',
        type: 'wall',
        coordinates: { x1: mm(-600), y1: mm(-75), x2: mm(600), y2: mm(-75) },
        strokeColor: '#1f2937',
        strokeWidth: 2,
      } as FloorMapShape,
      {
        id: 'frame-bottom',
        type: 'wall',
        coordinates: { x1: mm(-600), y1: mm(75), x2: mm(600), y2: mm(75) },
        strokeColor: '#1f2937',
        strokeWidth: 2,
      } as FloorMapShape,
      // Glaslinje (mitten)
      {
        id: 'glass',
        type: 'wall',
        coordinates: { x1: mm(-600), y1: 0, x2: mm(600), y2: 0 },
        strokeColor: '#6b7280',
        strokeWidth: 1,
      } as FloorMapShape,
    ],
    bounds: { width: mm(1200), height: mm(150), minX: mm(-600), minY: mm(-75), maxX: mm(600), maxY: mm(75) },
  },

  // Fönster 10M
  {
    name: 'Fönster 10M',
    description: 'Fönster 1000mm',
    category: 'doors_windows',
    tags: ['fönster', '10M', '1000mm'],
    shapes: [
      {
        id: 'frame-top',
        type: 'wall',
        coordinates: { x1: mm(-500), y1: mm(-75), x2: mm(500), y2: mm(-75) },
        strokeColor: '#1f2937',
        strokeWidth: 2,
      } as FloorMapShape,
      {
        id: 'frame-bottom',
        type: 'wall',
        coordinates: { x1: mm(-500), y1: mm(75), x2: mm(500), y2: mm(75) },
        strokeColor: '#1f2937',
        strokeWidth: 2,
      } as FloorMapShape,
      {
        id: 'glass',
        type: 'wall',
        coordinates: { x1: mm(-500), y1: 0, x2: mm(500), y2: 0 },
        strokeColor: '#6b7280',
        strokeWidth: 1,
      } as FloorMapShape,
    ],
    bounds: { width: mm(1000), height: mm(150), minX: mm(-500), minY: mm(-75), maxX: mm(500), maxY: mm(75) },
  },

  // ============================================================================
  // MÖBLER / FURNITURE
  // ============================================================================

  // Säng 180
  {
    name: 'Säng 180',
    description: 'Dubbelsäng 1800×2000mm',
    category: 'furniture',
    tags: ['säng', 'sovrum', '180'],
    shapes: [
      {
        id: 'bed-frame',
        type: 'rectangle',
        coordinates: { left: mm(-900), top: mm(-1000), width: mm(1800), height: mm(2000) },
        strokeColor: '#1f2937',
        strokeWidth: 2,
        color: 'transparent',
      } as FloorMapShape,
      // Huvudgavel
      {
        id: 'headboard',
        type: 'wall',
        coordinates: { x1: mm(-900), y1: mm(-1000), x2: mm(900), y2: mm(-1000) },
        strokeColor: '#1f2937',
        strokeWidth: 4,
      } as FloorMapShape,
    ],
    bounds: { width: mm(1800), height: mm(2000), minX: mm(-900), minY: mm(-1000), maxX: mm(900), maxY: mm(1000) },
  },

  // Säng 140
  {
    name: 'Säng 140',
    description: 'Enkelsäng 1400×2000mm',
    category: 'furniture',
    tags: ['säng', 'sovrum', '140'],
    shapes: [
      {
        id: 'bed-frame',
        type: 'rectangle',
        coordinates: { left: mm(-700), top: mm(-1000), width: mm(1400), height: mm(2000) },
        strokeColor: '#1f2937',
        strokeWidth: 2,
        color: 'transparent',
      } as FloorMapShape,
      {
        id: 'headboard',
        type: 'wall',
        coordinates: { x1: mm(-700), y1: mm(-1000), x2: mm(700), y2: mm(-1000) },
        strokeColor: '#1f2937',
        strokeWidth: 4,
      } as FloorMapShape,
    ],
    bounds: { width: mm(1400), height: mm(2000), minX: mm(-700), minY: mm(-1000), maxX: mm(700), maxY: mm(1000) },
  },

  // Säng 90
  {
    name: 'Säng 90',
    description: 'Enkelsäng 900×2000mm',
    category: 'furniture',
    tags: ['säng', 'sovrum', '90'],
    shapes: [
      {
        id: 'bed-frame',
        type: 'rectangle',
        coordinates: { left: mm(-450), top: mm(-1000), width: mm(900), height: mm(2000) },
        strokeColor: '#1f2937',
        strokeWidth: 2,
        color: 'transparent',
      } as FloorMapShape,
      {
        id: 'headboard',
        type: 'wall',
        coordinates: { x1: mm(-450), y1: mm(-1000), x2: mm(450), y2: mm(-1000) },
        strokeColor: '#1f2937',
        strokeWidth: 4,
      } as FloorMapShape,
    ],
    bounds: { width: mm(900), height: mm(2000), minX: mm(-450), minY: mm(-1000), maxX: mm(450), maxY: mm(1000) },
  },

  // Soffa 3-sits
  {
    name: 'Soffa 3-sits',
    description: 'Soffa 2200×900mm',
    category: 'furniture',
    tags: ['soffa', 'vardagsrum'],
    shapes: [
      // Sittdel
      {
        id: 'sofa-seat',
        type: 'rectangle',
        coordinates: { left: mm(-1100), top: mm(-300), width: mm(2200), height: mm(600) },
        strokeColor: '#1f2937',
        strokeWidth: 2,
        color: 'transparent',
      } as FloorMapShape,
      // Ryggstöd
      {
        id: 'sofa-back',
        type: 'rectangle',
        coordinates: { left: mm(-1100), top: mm(-450), width: mm(2200), height: mm(150) },
        strokeColor: '#1f2937',
        strokeWidth: 2,
        color: 'transparent',
      } as FloorMapShape,
    ],
    bounds: { width: mm(2200), height: mm(900), minX: mm(-1100), minY: mm(-450), maxX: mm(1100), maxY: mm(450) },
  },

  // Soffa 2-sits
  {
    name: 'Soffa 2-sits',
    description: 'Soffa 1600×900mm',
    category: 'furniture',
    tags: ['soffa', 'vardagsrum'],
    shapes: [
      {
        id: 'sofa-seat',
        type: 'rectangle',
        coordinates: { left: mm(-800), top: mm(-300), width: mm(1600), height: mm(600) },
        strokeColor: '#1f2937',
        strokeWidth: 2,
        color: 'transparent',
      } as FloorMapShape,
      {
        id: 'sofa-back',
        type: 'rectangle',
        coordinates: { left: mm(-800), top: mm(-450), width: mm(1600), height: mm(150) },
        strokeColor: '#1f2937',
        strokeWidth: 2,
        color: 'transparent',
      } as FloorMapShape,
    ],
    bounds: { width: mm(1600), height: mm(900), minX: mm(-800), minY: mm(-450), maxX: mm(800), maxY: mm(450) },
  },

  // Matbord 6 pers
  {
    name: 'Matbord 6 pers',
    description: 'Matbord 1600×900mm',
    category: 'furniture',
    tags: ['bord', 'matbord', 'matplats'],
    shapes: [
      {
        id: 'table',
        type: 'rectangle',
        coordinates: { left: mm(-800), top: mm(-450), width: mm(1600), height: mm(900) },
        strokeColor: '#1f2937',
        strokeWidth: 2,
        color: 'transparent',
      } as FloorMapShape,
    ],
    bounds: { width: mm(1600), height: mm(900), minX: mm(-800), minY: mm(-450), maxX: mm(800), maxY: mm(450) },
  },

  // Skrivbord
  {
    name: 'Skrivbord',
    description: 'Skrivbord 1200×600mm',
    category: 'furniture',
    tags: ['skrivbord', 'arbetsplats', 'kontor'],
    shapes: [
      {
        id: 'desk',
        type: 'rectangle',
        coordinates: { left: mm(-600), top: mm(-300), width: mm(1200), height: mm(600) },
        strokeColor: '#1f2937',
        strokeWidth: 2,
        color: 'transparent',
      } as FloorMapShape,
    ],
    bounds: { width: mm(1200), height: mm(600), minX: mm(-600), minY: mm(-300), maxX: mm(600), maxY: mm(300) },
  },

  // Stol
  {
    name: 'Stol',
    description: 'Stol 450×450mm',
    category: 'furniture',
    tags: ['stol', 'möbel'],
    shapes: [
      // Sits
      {
        id: 'seat',
        type: 'rectangle',
        coordinates: { left: mm(-225), top: mm(-100), width: mm(450), height: mm(400) },
        strokeColor: '#1f2937',
        strokeWidth: 2,
        color: 'transparent',
      } as FloorMapShape,
      // Ryggstöd
      {
        id: 'back',
        type: 'wall',
        coordinates: { x1: mm(-225), y1: mm(-125), x2: mm(225), y2: mm(-125) },
        strokeColor: '#1f2937',
        strokeWidth: 3,
      } as FloorMapShape,
    ],
    bounds: { width: mm(450), height: mm(500), minX: mm(-225), minY: mm(-250), maxX: mm(225), maxY: mm(250) },
  },

  // Garderob 60cm djup
  {
    name: 'Garderob',
    description: 'Garderob 1000×600mm',
    category: 'furniture',
    tags: ['garderob', 'förvaring', 'sovrum'],
    shapes: [
      {
        id: 'wardrobe',
        type: 'rectangle',
        coordinates: { left: mm(-500), top: mm(-300), width: mm(1000), height: mm(600) },
        strokeColor: '#1f2937',
        strokeWidth: 2,
        color: 'transparent',
      } as FloorMapShape,
      // Mittlinje (dörrar)
      {
        id: 'doors',
        type: 'wall',
        coordinates: { x1: 0, y1: mm(-300), x2: 0, y2: mm(300) },
        strokeColor: '#6b7280',
        strokeWidth: 1,
      } as FloorMapShape,
    ],
    bounds: { width: mm(1000), height: mm(600), minX: mm(-500), minY: mm(-300), maxX: mm(500), maxY: mm(300) },
  },

  // ============================================================================
  // TRAPPOR / STAIRS
  // ============================================================================

  // Rak trappa
  {
    name: 'Trappa rak',
    description: 'Rak trappa 900×2600mm (13 steg)',
    category: 'stairs',
    tags: ['trappa', 'rak'],
    shapes: [
      // Trappkontur
      {
        id: 'stair-outline',
        type: 'rectangle',
        coordinates: { left: mm(-450), top: mm(-1300), width: mm(900), height: mm(2600) },
        strokeColor: '#1f2937',
        strokeWidth: 2,
        color: 'transparent',
      } as FloorMapShape,
      // Steglinjer (13 steg à 200mm)
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `step-${i}`,
        type: 'wall' as const,
        coordinates: { x1: mm(-450), y1: mm(-1100 + i * 200), x2: mm(450), y2: mm(-1100 + i * 200) },
        strokeColor: '#6b7280',
        strokeWidth: 1,
      })),
      // Pil (upp)
      {
        id: 'arrow-line',
        type: 'wall',
        coordinates: { x1: 0, y1: mm(1000), x2: 0, y2: mm(-800) },
        strokeColor: '#1f2937',
        strokeWidth: 1,
      } as FloorMapShape,
    ],
    bounds: { width: mm(900), height: mm(2600), minX: mm(-450), minY: mm(-1300), maxX: mm(450), maxY: mm(1300) },
  },
];
