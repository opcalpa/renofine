/**
 * Upload a trace-over/background image for a floor plan and return the shape
 * to add. Shared by the v2 EditorToolbar (and eventually the legacy toolbar,
 * which currently carries an inline copy slated for the phase-5 teardown).
 */

import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { FloorMapShape } from '../types';

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
    const {
      data: { publicUrl },
    } = supabase.storage.from('project-files').getPublicUrl(filePath);
    return {
      id: uuidv4(),
      type: 'image',
      planId,
      coordinates: { x: viewCenter.x, y: viewCenter.y, width: 0, height: 0 },
      imageUrl: publicUrl,
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
