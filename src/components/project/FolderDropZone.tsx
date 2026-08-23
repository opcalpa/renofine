/**
 * Desktop folder-drop surface ("släpp din mapp").
 *
 * Wraps a page and shows a full-area invitation overlay while a FILE drag is
 * over it. The parent owns what happens next (route to Renaida, to Files, …) —
 * this component only detects the drag and reads the dropped tree.
 *
 * Desktop-only on purpose: mobile browsers have no folder drag-and-drop, and
 * the mobile capture path is the photo button.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderInput } from 'lucide-react';
import { RenaidaAvatar } from '@/components/renaida/RenaidaAvatar';
import { readDroppedItems, type DroppedFile } from '@/lib/dropTree';

interface Props {
  /** Called with the (recursively read) dropped files. Never called empty. */
  onDropped: (files: DroppedFile[]) => void;
  /** Headline shown in the overlay. Defaults to the generic invitation. */
  title?: string;
  /** Sub-line under the headline. */
  subtitle?: string;
  /** Skip the overlay entirely (e.g. a tab that owns its own drop area). */
  disabled?: boolean;
  children: React.ReactNode;
}

/** True only for drags that actually carry files (not internal column DnD). */
function isFileDrag(e: React.DragEvent): boolean {
  const types = e.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes('Files');
}

export function FolderDropZone({ onDropped, title, subtitle, disabled = false, children }: Props) {
  const { t } = useTranslation();
  const [active, setActive] = useState(false);
  const [reading, setReading] = useState(false);
  // dragenter/dragleave fire per child element — count depth so the overlay
  // doesn't flicker while the pointer moves across the page.
  const depth = useRef(0);
  const [pointerFine, setPointerFine] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    setPointerFine(window.matchMedia('(pointer: fine)').matches);
  }, []);

  const enabled = pointerFine && !disabled;

  const reset = useCallback(() => {
    depth.current = 0;
    setActive(false);
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (!enabled || !isFileDrag(e)) return;
    depth.current += 1;
    setActive(true);
  }, [enabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!enabled || !isFileDrag(e)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setActive(false);
  }, [enabled]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!enabled || !isFileDrag(e)) return;
    e.preventDefault(); // required for drop to fire
    e.dataTransfer.dropEffect = 'copy';
  }, [enabled]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    if (!enabled || !isFileDrag(e)) return;
    e.preventDefault();
    reset();
    setReading(true);
    try {
      const files = await readDroppedItems(e.dataTransfer);
      if (files.length > 0) onDropped(files);
    } finally {
      setReading(false);
    }
  }, [enabled, onDropped, reset]);

  return (
    <div
      className="relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={(e) => void handleDrop(e)}
    >
      {children}

      {enabled && (active || reading) && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-sm pointer-events-none">
          <div className="mx-6 max-w-md rounded-2xl border-2 border-dashed border-primary/60 bg-card px-8 py-10 text-center shadow-lg">
            <div className="flex justify-center mb-3">
              <RenaidaAvatar size={72} state={reading ? 'think' : 'hello'} aria-hidden />
            </div>
            <div className="flex items-center justify-center gap-2 text-lg font-semibold">
              <FolderInput className="h-5 w-5 text-primary" />
              {reading
                ? t('folderDrop.reading', 'Läser mappen …')
                : (title ?? t('folderDrop.title', 'Släpp din projektmapp här'))}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {reading
                ? t('folderDrop.readingHint', 'Går igenom undermapparna.')
                : (subtitle ?? t('folderDrop.subtitle', 'Renaida läser kvitton, offerter och ritningar — undermappar också.'))}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
