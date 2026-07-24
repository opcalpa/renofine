/**
 * TemplatesPanelV2 — the "Mallar" tab in the v2 object popover (P2).
 *
 * Surfaces the existing template system (templates table + defaults) in the
 * v2 editor: browse/search, click to place at the viewport centre through the
 * executor (one undo entry, group linked via groupId), and save the current
 * selection as a new template via the existing SaveTemplateDialog.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  DEFAULT_TEMPLATES,
  Template,
  getTemplates,
  placeTemplateShapes,
} from '../templateDefinitions';
import { TemplatePreview } from '../TemplatePreview';
import { SaveTemplateDialog } from '../SaveTemplateDialog';
import { useFloorMapStore } from '../store';
import { commit } from './core/executor';

export const TemplatesPanelV2: React.FC<{ onPlaced?: () => void }> = ({ onPlaced }) => {
  const { t } = useTranslation();
  const [custom, setCustom] = useState<Template[]>([]);
  const [query, setQuery] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);

  const selectedShapeIds = useFloorMapStore((s) => s.selectedShapeIds);
  const selectedShapes = useMemo(() => {
    const shapes = useFloorMapStore.getState().shapes;
    return shapes.filter((s) => selectedShapeIds.includes(s.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShapeIds]);

  const load = async () => {
    setCustom(await getTemplates());
  };
  useEffect(() => {
    void load();
  }, []);

  const defaults: Template[] = useMemo(
    () =>
      DEFAULT_TEMPLATES.map((tpl, idx) => ({
        ...tpl,
        id: `default-${idx}`,
        user_id: 'system',
        created_at: '',
      })),
    []
  );

  const all = useMemo(() => {
    const list = [...custom, ...defaults];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (tpl) =>
        tpl.name.toLowerCase().includes(q) ||
        tpl.description?.toLowerCase().includes(q) ||
        tpl.category.toLowerCase().includes(q)
    );
  }, [custom, defaults, query]);

  const place = (template: Template) => {
    const { viewState, currentPlanId, setSelectedShapeIds } = useFloorMapStore.getState();
    if (!currentPlanId) return;
    // Viewport centre in world coordinates
    const worldX = (window.innerWidth / 2 - viewState.panX) / viewState.zoom;
    const worldY = (window.innerHeight / 2 - viewState.panY) / viewState.zoom;
    const placed = placeTemplateShapes(template, { x: worldX, y: worldY }, currentPlanId);
    if (placed.length === 0) return;
    commit(
      t('templates.placeUndoLabel', 'Placera mall'),
      placed.map((shape) => ({ op: 'add' as const, shape }))
    );
    setSelectedShapeIds(placed.map((s) => s.id));
    toast.success(t('templates.placed', 'Mallen "{{name}}" placerad', { name: template.name }));
    onPlaced?.();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('templates.search', 'Sök mallar…')}
          className="h-8 text-xs"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {all.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-muted-foreground">
            {t('templates.empty', 'Inga mallar än — markera något och spara som mall.')}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {all.map((template) => (
              <button
                key={template.id}
                className="flex flex-col items-center gap-1 rounded-lg border p-2 text-left transition-colors hover:border-primary/50 hover:bg-gray-50"
                onClick={() => place(template)}
                title={template.description || template.name}
              >
                <TemplatePreview template={template} width={90} height={64} />
                <span className="w-full truncate text-center text-xs text-gray-700">
                  {template.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="border-t p-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs"
          disabled={selectedShapes.length === 0}
          onClick={() => setSaveOpen(true)}
          title={
            selectedShapes.length === 0
              ? t('templates.saveHint', 'Markera former på planen först')
              : undefined
          }
        >
          {t('templates.saveSelection', 'Spara markering som mall')}
        </Button>
      </div>
      <SaveTemplateDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        selectedShapes={selectedShapes}
        onSaveSuccess={() => void load()}
      />
    </div>
  );
};
