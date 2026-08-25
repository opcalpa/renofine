/**
 * Put a drawing under the canvas as a trace-over layer.
 *
 * Three ways in, one shape out:
 *   - upload a NEW image                 → uploadPlanImage
 *   - upload a NEW pdf                   → uploadPlanImage (page rasterized)
 *   - reuse a file ALREADY in the project → planLayerFromStoredFile
 *
 * The canvas only ever renders an image, so a PDF is rasterized to a PNG and
 * that PNG is what the layer points at. The original stays where it is — the
 * layer is a derivative, not a replacement.
 *
 * Shared by the v2 EditorToolbar (and eventually the legacy toolbar, which
 * currently carries an inline copy slated for the phase-5 teardown).
 */

import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getFileUrl } from '@/lib/fileUrl';
import { rasterizePdfPage } from '@/lib/pdfRaster';
import { FloorMapShape } from '../types';

/** What the layer pickers will take: drawings arrive as either. */
export const UNDERLAY_ACCEPT = 'image/*,application/pdf';

const MAX_BYTES = 10 * 1024 * 1024;

/** Rasterized pages land beside the originals, not loose in the project root. */
const DERIVED_FOLDER = 'Uppladdade filer';

export function isPdf(file: { type?: string; name?: string }): boolean {
  return (
    file.type === 'application/pdf' || /\.pdf$/i.test(file.name ?? '')
  );
}

export function isSupportedUnderlay(file: { type?: string; name?: string }): boolean {
  return Boolean(file.type?.startsWith('image/')) || isPdf(file);
}

/**
 * Decode the image's natural pixel size, capped to 800 on the long edge (the
 * same cap the renderer applies lazily). Materializing it here means every
 * layer has real world-unit dimensions from the start, so it can be scaled to
 * real measurements for tracing. Returns 0/0 if decoding fails — the renderer's
 * fallback still handles that case.
 */
async function decodeCappedSize(source: Blob): Promise<{ width: number; height: number }> {
  try {
    const bitmap = await createImageBitmap(source);
    const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
    const size = { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) };
    bitmap.close?.();
    return size;
  } catch {
    return { width: 0, height: 0 };
  }
}

function makeShape(
  storagePath: string,
  name: string,
  planId: string | undefined,
  viewCenter: { x: number; y: number },
  size: { width: number; height: number }
): FloorMapShape {
  // x/y is the TOP-LEFT corner, so dropping the raw view centre in there put
  // the drawing half off screen — you had to hunt for what you just added.
  // Centre it on the view instead. Size 0 (undecodable) keeps the old
  // behaviour rather than guessing an offset.
  const x = size.width ? viewCenter.x - size.width / 2 : viewCenter.x;
  const y = size.height ? viewCenter.y - size.height / 2 : viewCenter.y;
  return {
    id: uuidv4(),
    type: 'image',
    planId,
    coordinates: { x, y, width: size.width, height: size.height },
    imageUrl: storagePath,
    imageOpacity: 0.5,
    locked: false,
    zIndex: -100,
    name,
  };
}

async function uploadDerived(projectId: string, file: File): Promise<string> {
  const filePath = `projects/${projectId}/${DERIVED_FOLDER}/${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from('project-files').upload(filePath, file);
  if (error) throw error;
  return filePath;
}

/**
 * Upload a file the person just picked and return the layer shape.
 *
 * `pageNumber` only applies to PDFs; page 1 is the default, and a caller that
 * wants a different page has already asked (see UnderlayPicker).
 */
export async function uploadPlanImage(
  projectId: string,
  file: File,
  planId: string | undefined,
  viewCenter: { x: number; y: number },
  pageNumber = 1
): Promise<FloorMapShape | null> {
  if (!isSupportedUnderlay(file)) {
    toast.error('Välj en bild eller en PDF');
    return null;
  }
  if (file.size > MAX_BYTES) {
    toast.error('Max 10MB');
    return null;
  }
  try {
    let toStore = file;
    if (isPdf(file)) {
      const raster = await rasterizePdfPage(file, pageNumber);
      if (!raster) {
        toast.error('Kunde inte läsa PDF:en');
        return null;
      }
      toStore = raster.file;
    }

    const storagePath = await uploadDerived(projectId, toStore);
    const size = await decodeCappedSize(toStore);
    return makeShape(storagePath, toStore.name, planId, viewCenter, size);
  } catch (error) {
    console.error('Error uploading image:', error);
    toast.error('Kunde inte ladda upp');
    return null;
  }
}

/**
 * Build a layer from a file the project ALREADY holds.
 *
 * Until this existed the only way onto the canvas was to upload again — so a
 * drawing that arrived with the folder import, or sits under the address's
 * papers, had to be downloaded and re-uploaded to be traced. Nothing was
 * missing except the path from one to the other.
 *
 * An image is referenced in place (no copy). A PDF cannot be, so the chosen
 * page is rendered and that PNG is stored alongside; the original is untouched.
 */
export async function planLayerFromStoredFile(
  projectId: string,
  storagePath: string,
  fileName: string,
  planId: string | undefined,
  viewCenter: { x: number; y: number },
  pageNumber = 1
): Promise<FloorMapShape | null> {
  try {
    const signed = await getFileUrl(storagePath);
    if (!signed) {
      toast.error('Kunde inte öppna filen');
      return null;
    }
    const blob = await (await fetch(signed)).blob();

    if (isPdf({ type: blob.type, name: fileName })) {
      const raster = await rasterizePdfPage(
        new File([blob], fileName, { type: 'application/pdf' }),
        pageNumber
      );
      if (!raster) {
        toast.error('Kunde inte läsa PDF:en');
        return null;
      }
      const derivedPath = await uploadDerived(projectId, raster.file);
      const size = await decodeCappedSize(raster.file);
      return makeShape(derivedPath, raster.file.name, planId, viewCenter, size);
    }

    // Already an image: point at it where it lies rather than making a copy.
    const size = await decodeCappedSize(blob);
    return makeShape(storagePath, fileName, planId, viewCenter, size);
  } catch (error) {
    console.error('Error placing stored file as layer:', error);
    toast.error('Kunde inte lägga in filen');
    return null;
  }
}

/** How many pages a stored PDF has, so the picker can offer a choice. */
export async function storedPdfPageCount(storagePath: string, fileName: string): Promise<number> {
  try {
    const signed = await getFileUrl(storagePath);
    if (!signed) return 1;
    const blob = await (await fetch(signed)).blob();
    const raster = await rasterizePdfPage(
      new File([blob], fileName, { type: 'application/pdf' }),
      1,
      // Tiny render: we only want the page count, not the picture.
      120
    );
    return raster?.pageCount ?? 1;
  } catch {
    return 1;
  }
}
