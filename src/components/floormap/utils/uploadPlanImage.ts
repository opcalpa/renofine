/**
 * Upload a trace-over/background image for a floor plan and return the shape
 * to add. Shared by the v2 EditorToolbar (and eventually the legacy toolbar,
 * which currently carries an inline copy slated for the phase-5 teardown).
 */

import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { FloorMapShape } from '../types';

/**
 * Decode the image's natural pixel size, capped to 800 on the long edge (the
 * same cap the renderer applied lazily). Materializing it here means every
 * uploaded image has real world-unit dimensions from the start, so it can be
 * scaled to real measurements for tracing. Returns 0/0 if decoding fails —
 * the renderer's fallback still handles that case.
 */
async function decodeCappedSize(file: File): Promise<{ width: number; height: number }> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
    const size = { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) };
    bitmap.close?.();
    return size;
  } catch {
    return { width: 0, height: 0 };
  }
}

export async function uploadPlanImage(
  projectId: string,
  file: File,
  planId: string | undefined,
  viewCenter: { x: number; y: number }
): Promise<FloorMapShape | null> {
  if (!file.type.startsWith('image/')) {
    toast.error('Vänligen välj en bildfil');
    return null;
  }
  if (file.size > 10 * 1024 * 1024) {
    toast.error('Max 10MB');
    return null;
  }
  try {
    const filePath = `projects/${projectId}/Uppladdade filer/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from('project-files')
      .upload(filePath, file);
    if (uploadError) throw uploadError;
    const { width, height } = await decodeCappedSize(file);
    return {
      id: uuidv4(),
      type: 'image',
      planId,
      coordinates: { x: viewCenter.x, y: viewCenter.y, width, height },
      imageUrl: filePath,
      imageOpacity: 0.5,
      locked: false,
      zIndex: -100,
      name: file.name,
    };
  } catch (error) {
    console.error('Error uploading image:', error);
    toast.error('Kunde inte ladda upp');
    return null;
  }
}
