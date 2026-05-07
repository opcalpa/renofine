import { useState } from 'react';
import { useTranslation } from 'react-i18next';


import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, Check, Eye, Link2, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { linkFileToEntity } from '@/services/fileLinkService';
import type { BatchClassificationItem } from '@/hooks/useBatchClassification';

interface EntityOption { id: string; name: string }

interface BatchTolkSummaryTableProps {
  items: BatchClassificationItem[];
  onUpdateItem: (path: string, updates: Partial<BatchClassificationItem>) => void;
  onPreviewFile: (file: BatchClassificationItem['file']) => void;
  selectedForRename: Set<string>;
  onToggleRename: (path: string) => void;
  projectId: string;
  tasks: EntityOption[];
  materials: EntityOption[];
  rooms: EntityOption[];
  onEntitiesChanged: () => void;
  profileId: string | null;
}

const CATEGORY_MAP: Record<string, string> = {
  quote: 'Offert', invoice: 'Faktura', receipt: 'Kvitto', floor_plan: 'Ritning',
  contract: 'Kontrakt', specification: 'Specifikation', product_image: 'Bild', other: 'Övrigt',
};

function StatusIcon({ status }: { status: string }) {
  if (status === 'classifying') return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
  if (status === 'done') return <Check className="h-3.5 w-3.5 text-green-600" />;
  if (status === 'error') return <span className="text-red-500 text-xs font-bold">!</span>;
  return <span className="h-3.5 w-3.5 rounded-full bg-muted-foreground/20 block" />;
}

function EntityLinkPopover({
  label,
  options,
  linkedIds,
  onLink,
  onCreate,
  createPlaceholder,
}: {
  label: string;
  options: EntityOption[];
  linkedIds: Set<string>;
  onLink: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
  createPlaceholder: string;
}) {
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    await onCreate(newName.trim());
    setNewName('');
    setCreating(false);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs px-2">
          <Link2 className="h-3 w-3" />
          {linkedIds.size > 0 ? `${linkedIds.size}` : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1 max-h-56 overflow-y-auto" align="start">
        {options.map(opt => (
          <button key={opt.id} type="button"
            onClick={() => onLink(opt.id)}
            className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted flex items-center gap-2 ${linkedIds.has(opt.id) ? 'bg-primary/5 font-medium' : ''}`}
          >
            {linkedIds.has(opt.id) && <Check className="h-3 w-3 text-primary shrink-0" />}
            <span className={linkedIds.has(opt.id) ? '' : 'pl-5'} title={opt.name}>{opt.name}</span>
          </button>
        ))}
        <div className="border-t mt-1 pt-1">
          <div className="flex gap-1 px-1">
            <Input value={newName} onChange={e => setNewName(e.target.value)}
              placeholder={createPlaceholder} className="h-7 text-xs"
              onKeyDown={e => e.key === 'Enter' && handleCreate()} />
            <Button size="sm" variant="outline" className="h-7 text-xs shrink-0"
              onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function BatchTolkSummaryTable({
  items, onUpdateItem, onPreviewFile, selectedForRename, onToggleRename,
  projectId, tasks, materials, rooms, onEntitiesChanged, profileId,
}: BatchTolkSummaryTableProps) {
  const { t } = useTranslation();
  const [linkedEntities, setLinkedEntities] = useState<Map<string, { tasks: Set<string>; materials: Set<string>; rooms: Set<string> }>>(new Map());

  const getLinked = (path: string) => {
    return linkedEntities.get(path) || { tasks: new Set<string>(), materials: new Set<string>(), rooms: new Set<string>() };
  };

  const toggleLink = async (filePath: string, entityType: 'task' | 'material' | 'room', entityId: string) => {
    const key = entityType === 'task' ? 'tasks' : entityType === 'material' ? 'materials' : 'rooms';
    setLinkedEntities(prev => {
      const next = new Map(prev);
      const current = next.get(filePath) || { tasks: new Set<string>(), materials: new Set<string>(), rooms: new Set<string>() };
      const updated = { ...current, [key]: new Set(current[key]) };
      if (updated[key].has(entityId)) {
        updated[key].delete(entityId);
      } else {
        updated[key].add(entityId);
        linkFileToEntity(projectId, filePath, entityType, entityId);
      }
      next.set(filePath, updated);
      return next;
    });
  };

  const createAndLink = async (filePath: string, entityType: 'task' | 'material' | 'room', name: string) => {
    const table = entityType === 'task' ? 'tasks' : entityType === 'material' ? 'materials' : 'rooms';
    const nameField = entityType === 'task' ? 'title' : 'name';
    const insertData: Record<string, unknown> = { project_id: projectId, [nameField]: name };
    if (entityType === 'task') insertData.status = 'to_do';
    if (entityType === 'material') {
      // Auto-populate from classification result
      const classItem = items.find(i => i.file.path === filePath);
      const r = classItem?.result;
      const isInvoiceOrReceipt = r?.type === 'invoice' || r?.type === 'receipt';
      insertData.status = isInvoiceOrReceipt ? (r?.type === 'receipt' ? 'paid' : 'billed') : 'submitted';
      if (r?.vendor_name) insertData.vendor_name = r.vendor_name;
      if (r?.invoice_amount != null) insertData.price_total = r.invoice_amount;
      // Auto-match supplier
      if (r?.vendor_name && profileId) {
        const { data: supplier } = await supabase
          .from('suppliers')
          .select('id')
          .eq('profile_id', profileId)
          .ilike('name', r.vendor_name)
          .maybeSingle();
        if (supplier) {
          insertData.supplier_id = supplier.id;
        }
      }
    }
    if (profileId) insertData.created_by_user_id = profileId;

    const { data, error } = await supabase.from(table).insert(insertData).select('id').single();
    if (error || !data) return;

    await linkFileToEntity(projectId, filePath, entityType, data.id);
    const key = entityType === 'task' ? 'tasks' : entityType === 'material' ? 'materials' : 'rooms';
    setLinkedEntities(prev => {
      const next = new Map(prev);
      const current = next.get(filePath) || { tasks: new Set<string>(), materials: new Set<string>(), rooms: new Set<string>() };
      const updated = { ...current, [key]: new Set(current[key]) };
      updated[key].add(data.id);
      next.set(filePath, updated);
      return next;
    });
    onEntitiesChanged();
  };

  return (
    <div className="rounded-lg border bg-card overflow-auto max-h-[55vh]">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted border-b">
            <th className="px-3 py-2.5 kicker w-8"><Checkbox /></th>
            <th className="px-3 py-2.5 kicker w-8" />
            <th className="px-3 py-2.5 kicker text-left">{t('common.name')}</th>
            <th className="px-3 py-2.5 kicker text-left">{t('batchTolk.suggestedName', 'Nytt namn')}</th>
            <th className="px-3 py-2.5 kicker text-left">{t('batchTolk.category', 'Kategori')}</th>
            <th className="px-3 py-2.5 kicker text-left">{t('batchTolk.vendor', 'Leverantör')}</th>
            <th className="px-3 py-2.5 kicker text-right">{t('batchTolk.amount', 'Belopp')}</th>
            <th className="px-3 py-2.5 kicker text-left">{t('batchTolk.date', 'Datum')}</th>
            <th className="px-3 py-2.5 kicker text-left">{t('batchTolk.link', 'Koppling')}</th>
            <th className="px-3 py-2.5 kicker w-8" />
          </tr>
        </thead>
        <tbody>
          {items.map(item => {
            const r = item.result;
            const linked = getLinked(item.file.path);
            return (
              <tr key={item.file.path} className={`border-b last:border-b-0 hover:bg-muted/30 transition-colors ${item.status === 'error' ? 'bg-destructive/5' : ''}`}>
                <td className="px-3 py-2.5">
                  <Checkbox
                    checked={selectedForRename.has(item.file.path)}
                    onCheckedChange={() => onToggleRename(item.file.path)}
                    disabled={!item.suggestedName}
                  />
                </td>
                <td className="px-3 py-2.5"><StatusIcon status={item.status} /></td>
                <td className="px-3 py-2.5 max-w-[160px] truncate" title={item.file.name}>
                  {item.file.name}
                </td>
                <td className="px-3 py-2.5 max-w-[180px]">
                  {item.suggestedName ? (
                    <Input
                      value={item.suggestedName}
                      onChange={e => onUpdateItem(item.file.path, { suggestedName: e.target.value })}
                      className="h-6 text-xs border-dashed"
                    />
                  ) : item.status === 'classifying' ? (
                    <span className="text-muted-foreground italic">{t('batchTolk.classifying', 'Tolkar...')}</span>
                  ) : null}
                </td>
                <td className="px-3 py-2.5">
                  {r?.type && <Badge variant="outline" className="text-[10px]">{CATEGORY_MAP[r.type] || r.type}</Badge>}
                </td>
                <td className="px-3 py-2.5 truncate max-w-[100px]">{r?.vendor_name || '–'}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {r?.invoice_amount != null ? `${r.invoice_amount.toLocaleString('sv-SE')} kr` : '–'}
                </td>
                <td className="px-3 py-2.5">{r?.invoice_date || '–'}</td>
                <td className="px-3 py-2.5">
                  {item.status === 'done' && (
                    <div className="flex gap-0.5">
                      <EntityLinkPopover
                        label={t('batchTolk.task', 'Arbete')}
                        options={tasks.map(tk => ({ id: tk.id, name: tk.name }))}
                        linkedIds={linked.tasks}
                        onLink={id => toggleLink(item.file.path, 'task', id)}
                        onCreate={name => createAndLink(item.file.path, 'task', name)}
                        createPlaceholder={t('batchTolk.newTask', 'Nytt arbete...')}
                      />
                      <EntityLinkPopover
                        label={t('batchTolk.purchase', 'Inköp')}
                        options={materials.map(m => ({ id: m.id, name: m.name }))}
                        linkedIds={linked.materials}
                        onLink={id => toggleLink(item.file.path, 'material', id)}
                        onCreate={name => createAndLink(item.file.path, 'material', name)}
                        createPlaceholder={t('batchTolk.newPurchase', 'Nytt inköp...')}
                      />
                      <EntityLinkPopover
                        label={t('batchTolk.room', 'Rum')}
                        options={rooms.map(r => ({ id: r.id, name: r.name }))}
                        linkedIds={linked.rooms}
                        onLink={id => toggleLink(item.file.path, 'room', id)}
                        onCreate={name => createAndLink(item.file.path, 'room', name)}
                        createPlaceholder={t('batchTolk.newRoom', 'Nytt rum...')}
                      />
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0"
                    onClick={() => onPreviewFile(item.file)}>
                    <Eye className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
