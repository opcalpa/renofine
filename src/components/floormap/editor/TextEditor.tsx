/**
 * Inline text editor for text shapes — opens on placement (TextTool) and on
 * double-click in the select tool. Enter/blur commits; Escape cancels; an
 * empty commit on a fresh label deletes it (no invisible empty text shapes).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { TextCoordinates } from '../types';
import { useFloorMapStore } from '../store';
import { useEditorUiStore } from './state/uiStore';
import { execute } from './core/commands';

export const TextEditor = () => {
  const textEditId = useEditorUiStore((s) => s.textEditId);
  const shapes = useFloorMapStore((s) => s.shapes);
  const viewState = useFloorMapStore((s) => s.viewState);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');

  const shape = useMemo(
    () => shapes.find((s) => s.id === textEditId && s.type === 'text') ?? null,
    [shapes, textEditId]
  );

  useEffect(() => {
    if (shape) {
      setValue(shape.text ?? '');
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [textEditId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!shape) return null;
  const c = shape.coordinates as TextCoordinates;
  const screen = {
    x: c.x * viewState.zoom + viewState.panX,
    y: c.y * viewState.zoom + viewState.panY,
  };

  const close = () => useEditorUiStore.getState().setTextEditId(null);

  const commitText = () => {
    const text = value.trim();
    if (!text) {
      // Empty label is invisible — remove it instead of leaving a ghost.
      execute('shape.delete', { ids: [shape.id] });
    } else if (text !== shape.text) {
      execute('shape.update', { id: shape.id, updates: { text } });
    }
    close();
  };

  return (
    <div className="absolute z-30" style={{ left: screen.x, top: screen.y }}>
      <input
        ref={inputRef}
        autoFocus
        data-testid="text-shape-input"
        className="min-w-[120px] rounded border bg-white px-1.5 py-0.5 text-sm shadow-lg focus:outline-none focus:ring-1 focus:ring-primary"
        value={value}
        placeholder="Text…"
        onChange={(e) => setValue(e.target.value)}
        onBlur={commitText}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') commitText();
          if (e.key === 'Escape') {
            if (!shape.text) execute('shape.delete', { ids: [shape.id] });
            close();
          }
        }}
      />
    </div>
  );
};
