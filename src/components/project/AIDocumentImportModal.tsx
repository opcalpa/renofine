/**
 * AI Document Import Modal
 * Displays extracted rooms and tasks from documents for review and import
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  Sparkles,
  Loader2,
  Home,
  ClipboardList,
  CheckCircle2,
  AlertCircle,
  Edit2,
  X,
  FileText,
  Wallet,
  Building2,
  Check,
  ZoomIn,
  ZoomOut,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useFloorMapStore } from '@/components/floormap/store';
import {
  ExtractedRoom,
  ExtractedTask,
  AIDocumentExtractionResult,
  TaskCategory,
  TASK_CATEGORY_LABELS,
  TASK_CATEGORY_TO_COST_CENTER,
} from '@/services/aiDocumentService.types';
import { extractFromDocument, getFileSignedUrl } from '@/services/aiDocumentService';
import { useFileUrl } from '@/lib/fileUrl';
import { calculateGridPlacements, createRoomPoints } from '@/components/floormap/utils/roomPlacement';
import { FloorMapShape } from '@/components/floormap/types';
import { saveShapesForPlan } from '@/components/floormap/utils/plans';

interface ProjectFile {
  id: string;
  name: string;
  path: string;
  size: number;
  type: string;
}

interface AIDocumentImportModalProps {
  projectId: string;
  file: ProjectFile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}

interface EditableRoom extends ExtractedRoom {
  index: number;
  selected: boolean;
}

interface EditableTask extends ExtractedTask {
  index: number;
  selected: boolean;
}

/**
 * Get confidence indicator based on score
 */
function ConfidenceIndicator({ confidence }: { confidence: number }) {
  if (confidence >= 0.8) {
    return <span title={`Konfidens: ${Math.round(confidence * 100)}%`}>🟢</span>;
  } else if (confidence >= 0.5) {
    return <span title={`Konfidens: ${Math.round(confidence * 100)}%`}>🟡</span>;
  } else {
    return <span title={`Konfidens: ${Math.round(confidence * 100)}%`}>🔴</span>;
  }
}

export function AIDocumentImportModal({
  projectId,
  file,
  open,
  onOpenChange,
  onImportComplete,
}: AIDocumentImportModalProps) {
  const { toast } = useToast();
  const { t } = useTranslation();

  // States
  const [extracting, setExtracting] = useState(false);
  const [extractionResult, setExtractionResult] = useState<AIDocumentExtractionResult | null>(null);
  const [rooms, setRooms] = useState<EditableRoom[]>([]);
  const [tasks, setTasks] = useState<EditableTask[]>([]);
  const [importing, setImporting] = useState(false);
  const [editingRoomIndex, setEditingRoomIndex] = useState<number | null>(null);
  const [editingTaskIndex, setEditingTaskIndex] = useState<number | null>(null);
  const [previewExpanded, setPreviewExpanded] = useState(true);
  const [previewZoom, setPreviewZoom] = useState(100);
  const previewUrl = useFileUrl(file?.path);

  // Manual linking state
  const [existingRooms, setExistingRooms] = useState<{ id: string; name: string }[]>([]);
  const [existingTasks, setExistingTasks] = useState<{ id: string; title: string }[]>([]);
  const [existingPurchases, setExistingPurchases] = useState<{ id: string; name: string }[]>([]);
  const [linkedRoomIds, setLinkedRoomIds] = useState<Set<string>>(new Set());
  const [linkedTaskIds, setLinkedTaskIds] = useState<Set<string>>(new Set());
  const [linkedPurchaseIds, setLinkedPurchaseIds] = useState<Set<string>>(new Set());
  const [newRoomName, setNewRoomName] = useState("");
  const [newTaskName, setNewTaskName] = useState("");
  const [newPurchaseName, setNewPurchaseName] = useState("");
  const [creatingSub, setCreatingSub] = useState<"room" | "task" | "purchase" | null>(null);

  const getProfileId = async (): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from("profiles").select("id").eq("user_id", user.id).single();
    return data?.id || null;
  };

  const handleCreateRoom = async () => {
    if (!newRoomName.trim() || creatingSub) return;
    setCreatingSub("room");
    const { data, error } = await supabase.from("rooms").insert({ project_id: projectId, name: newRoomName.trim() }).select("id, name").single();
    if (error) { toast({ variant: "destructive", description: error.message }); }
    else if (data) { setExistingRooms(prev => [...prev, data]); setLinkedRoomIds(prev => new Set(prev).add(data.id)); setNewRoomName(""); }
    setCreatingSub(null);
  };

  const handleCreateTask = async () => {
    if (!newTaskName.trim() || creatingSub) return;
    setCreatingSub("task");
    const profileId = await getProfileId();
    const { data, error } = await supabase.from("tasks").insert({ project_id: projectId, title: newTaskName.trim(), status: "to_do", created_by_user_id: profileId }).select("id, title").single();
    if (error) { toast({ variant: "destructive", description: error.message }); }
    else if (data) { setExistingTasks(prev => [...prev, data]); setLinkedTaskIds(prev => new Set(prev).add(data.id)); setNewTaskName(""); }
    setCreatingSub(null);
  };

  const handleCreatePurchase = async () => {
    if (!newPurchaseName.trim() || creatingSub) return;
    setCreatingSub("purchase");
    const profileId = await getProfileId();
    const amount = extractionResult?.quoteMetadata?.totalAmount || null;
    const { data, error } = await supabase.from("materials").insert({
      project_id: projectId, name: newPurchaseName.trim(), status: "planned",
      created_by_user_id: profileId,
      ...(amount ? { price_total: amount } : {}),
    }).select("id, name").single();
    if (error) { toast({ variant: "destructive", description: error.message }); }
    else if (data) { setExistingPurchases(prev => [...prev, data]); setLinkedPurchaseIds(prev => new Set(prev).add(data.id)); setNewPurchaseName(""); }
    setCreatingSub(null);
  };

  // Zustand store
  const { shapes, currentPlanId, addShape } = useFloorMapStore();

  // Fetch existing entities for manual linking
  useEffect(() => {
    if (!open) return;
    (async () => {
      const [roomsRes, tasksRes, purchasesRes] = await Promise.all([
        supabase.from("rooms").select("id, name").eq("project_id", projectId).order("name"),
        supabase.from("tasks").select("id, title").eq("project_id", projectId).order("title"),
        supabase.from("materials").select("id, name").eq("project_id", projectId).order("name"),
      ]);
      setExistingRooms(roomsRes.data || []);
      setExistingTasks(tasksRes.data || []);
      setExistingPurchases(purchasesRes.data || []);
    })();
  }, [open, projectId]);

  // Reset state when modal opens with a new file
  useEffect(() => {
    if (open && file) {
      setExtractionResult(null);
      setRooms([]);
      setTasks([]);
      setEditingRoomIndex(null);
      setEditingTaskIndex(null);
      setLinkedRoomIds(new Set());
      setLinkedTaskIds(new Set());
      setLinkedPurchaseIds(new Set());
      setNewPurchaseName('');
      setNewTaskName('');
      setNewRoomName('');

      // Pre-populate purchase name from existing fileLinks (saved by Smart tolk)
      (async () => {
        const { data: links } = await supabase
          .from('task_file_links')
          .select('vendor_name, invoice_date, invoice_amount')
          .eq('file_path', file.path)
          .limit(1);
        if (links?.[0]) {
          const l = links[0];
          const parts: string[] = [];
          if (l.invoice_date) parts.push(String(l.invoice_date).slice(0, 10));
          if (l.vendor_name) parts.push(l.vendor_name);
          if (l.invoice_amount) parts.push(`${Number(l.invoice_amount).toLocaleString('sv-SE')} kr`);
          if (parts.length > 0) setNewPurchaseName(parts.join(' — '));
        }
      })();

      handleExtract();
    }
  }, [open, file?.id]);

  const handleExtract = useCallback(async () => {
    if (!file) return;

    setExtracting(true);

    try {
      const fileUrl = await getFileSignedUrl(file.path);
      if (!fileUrl) throw new Error('Kunde inte komma åt filen');

      const result = await extractFromDocument(fileUrl, file.type, file.name, file.size);

      setExtractionResult(result);

      // Initialize editable rooms
      setRooms(
        result.rooms.map((room, index) => ({
          ...room,
          index,
          selected: room.confidence >= 0.5, // Auto-select high-confidence items
        }))
      );

      // Initialize editable tasks
      setTasks(
        result.tasks.map((task, index) => ({
          ...task,
          index,
          selected: task.confidence >= 0.5,
        }))
      );

      // Auto-suggest purchase name from metadata: "YYYY-MM-DD — Vendor — Amount kr"
      const meta = result.quoteMetadata;
      if (meta) {
        const parts: string[] = [];
        if (meta.quoteDate) parts.push(meta.quoteDate);
        if (meta.vendorName) parts.push(meta.vendorName);
        if (meta.totalAmount) parts.push(`${meta.totalAmount.toLocaleString('sv-SE')} kr`);
        if (parts.length > 0) setNewPurchaseName(parts.join(' — '));
      }

      toast({
        title: t('aiDocumentImport.analysisDone'),
        description: t('aiDocumentImport.analysisResult', { rooms: result.rooms.length, tasks: result.tasks.length }),
      });
    } catch (error) {
      console.error('Extraction error:', error);
      toast({
        title: t('aiDocumentImport.analysisError'),
        description: error instanceof Error ? error.message : t('aiDocumentImport.couldNotAnalyze'),
        variant: 'destructive',
      });
      onOpenChange(false);
    } finally {
      setExtracting(false);
    }
  }, [file, toast, onOpenChange]);

  const toggleRoomSelection = (index: number) => {
    setRooms((prev) =>
      prev.map((room) => (room.index === index ? { ...room, selected: !room.selected } : room))
    );
  };

  const toggleTaskSelection = (index: number) => {
    setTasks((prev) =>
      prev.map((task) => (task.index === index ? { ...task, selected: !task.selected } : task))
    );
  };

  const selectAllRooms = () => {
    setRooms((prev) => prev.map((room) => ({ ...room, selected: true })));
  };

  const deselectAllRooms = () => {
    setRooms((prev) => prev.map((room) => ({ ...room, selected: false })));
  };

  const selectAllTasks = () => {
    setTasks((prev) => prev.map((task) => ({ ...task, selected: true })));
  };

  const deselectAllTasks = () => {
    setTasks((prev) => prev.map((task) => ({ ...task, selected: false })));
  };

  const updateRoom = (index: number, updates: Partial<ExtractedRoom>) => {
    setRooms((prev) =>
      prev.map((room) => (room.index === index ? { ...room, ...updates } : room))
    );
  };

  const updateTask = (index: number, updates: Partial<ExtractedTask>) => {
    setTasks((prev) =>
      prev.map((task) => (task.index === index ? { ...task, ...updates } : task))
    );
  };

  const handleImport = async () => {
    const selectedRooms = rooms.filter((r) => r.selected);
    const selectedTasks = tasks.filter((t) => t.selected);

    const hasManualLinks = linkedRoomIds.size > 0 || linkedTaskIds.size > 0 || linkedPurchaseIds.size > 0;
    if (selectedRooms.length === 0 && selectedTasks.length === 0 && !hasManualLinks) {
      toast({
        title: t('aiDocumentImport.nothingSelected'),
        description: t('aiDocumentImport.selectAtLeastOne'),
        variant: 'destructive',
      });
      return;
    }

    setImporting(true);

    try {
      // Get user profile for created_by_user_id
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Inte inloggad');

      const { data: profileData } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!profileData) throw new Error('Kunde inte hitta användarprofil');

      const profileId = profileData.id;
      const createdRoomIds = new Map<string, string>(); // roomName -> roomId

      // 1. Create rooms in database and as shapes
      if (selectedRooms.length > 0) {
        // Calculate grid placements
        const placements = calculateGridPlacements(selectedRooms, shapes);

        for (const room of selectedRooms) {
          const placement = placements.get(room.index);
          if (!placement) continue;

          // Create room in rooms table
          const { data: roomData, error: roomError } = await supabase
            .from('rooms')
            .insert({
              project_id: projectId,
              name: room.name,
              description: room.description,
              dimensions: {
                estimatedAreaSqm: room.estimatedAreaSqm,
                width: placement.width,
                height: placement.height,
              },
            })
            .select('id')
            .single();

          if (roomError) {
            console.error('Error creating room:', roomError);
            continue;
          }

          createdRoomIds.set(room.name.toLowerCase(), roomData.id);

          // Create shape for canvas if we have a plan
          if (currentPlanId) {
            const roomShape: FloorMapShape = {
              id: `room-${Date.now()}-${room.index}`,
              type: 'room',
              planId: currentPlanId,
              roomId: roomData.id,
              name: room.name,
              coordinates: {
                points: createRoomPoints(placement),
              },
              color: 'rgba(59, 130, 246, 0.2)',
              strokeColor: '#1d4ed8',
            };

            addShape(roomShape);
          }
        }

        // Save shapes to database if we have a plan
        if (currentPlanId) {
          const updatedShapes = useFloorMapStore.getState().shapes;
          await saveShapesForPlan(currentPlanId, updatedShapes);
        }
      }

      // 2. Create tasks in database
      if (selectedTasks.length > 0) {
        for (const task of selectedTasks) {
          // Try to find matching room
          let roomId = null;
          if (task.roomName) {
            roomId = createdRoomIds.get(task.roomName.toLowerCase()) || null;

            // If not found in newly created rooms, search existing rooms
            if (!roomId) {
              const { data: existingRoom } = await supabase
                .from('rooms')
                .select('id')
                .eq('project_id', projectId)
                .ilike('name', task.roomName)
                .single();

              roomId = existingRoom?.id || null;
            }
          }

          const costCenter = TASK_CATEGORY_TO_COST_CENTER[task.category as TaskCategory] || 'construction';

          const { error: taskError } = await supabase.from('tasks').insert({
            project_id: projectId,
            room_id: roomId,
            title: task.title,
            description: task.description,
            status: 'to_do',
            priority: 'medium',
            created_by_user_id: profileId,
            cost_center: costCenter,
            task_cost_type: 'subcontractor',
            subcontractor_cost: task.estimatedCost || null,
            material_estimate: task.materialCost || null,
            budget: (task.estimatedCost || 0) + (task.materialCost || 0) > 0
              ? (task.estimatedCost || 0) + (task.materialCost || 0)
              : null,
            rot_eligible: task.rotEligible || false,
            rot_amount: task.rotAmount || null,
          });

          if (taskError) {
            console.error('Error creating task:', taskError);
          }
        }
      }

      // 3. Save manual file links (room, task, purchase connections)
      if (file && (linkedRoomIds.size > 0 || linkedTaskIds.size > 0 || linkedPurchaseIds.size > 0)) {
        const fileType = file.type?.includes("pdf") ? "document" : file.type?.startsWith("image/") ? "image" : "other";
        const qm = extractionResult?.quoteMetadata;
        const sharedMeta = {
          project_id: projectId, file_path: file.path, file_name: file.name, file_type: fileType,
          ...(qm?.vendorName ? { vendor_name: qm.vendorName } : {}),
          ...(qm?.totalAmount ? { invoice_amount: qm.totalAmount } : {}),
          ...(qm?.quoteDate ? { invoice_date: qm.quoteDate } : {}),
        };
        const linkInserts: Array<Record<string, unknown>> = [];
        for (const roomId of linkedRoomIds) {
          linkInserts.push({ ...sharedMeta, room_id: roomId });
        }
        for (const taskId of linkedTaskIds) {
          linkInserts.push({ ...sharedMeta, task_id: taskId });
        }
        for (const materialId of linkedPurchaseIds) {
          linkInserts.push({ ...sharedMeta, material_id: materialId });
        }
        if (linkInserts.length > 0) {
          await supabase.from("task_file_links").insert(linkInserts);
        }
      }

      toast({
        title: t('aiDocumentImport.importDone'),
        description: t('aiDocumentImport.importResult', { rooms: selectedRooms.length, tasks: selectedTasks.length }),
      });

      onOpenChange(false);
      onImportComplete?.();
    } catch (error) {
      console.error('Import error:', error);
      toast({
        title: t('aiDocumentImport.importError'),
        description: error instanceof Error ? error.message : t('aiDocumentImport.couldNotImport'),
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  };

  const selectedRoomCount = rooms.filter((r) => r.selected).length;
  const selectedTaskCount = tasks.filter((t) => t.selected).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-5xl w-[calc(100%-3rem)] !max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {t('aiDocumentImport.title', { name: file?.name })}
          </DialogTitle>
          <DialogDescription>
            {t('aiDocumentImport.description')}
          </DialogDescription>
        </DialogHeader>

        {/* Loading State */}
        {extracting && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg font-medium">{t('aiDocumentImport.analyzing')}</p>
            <p className="text-sm text-muted-foreground mt-2">{t('aiDocumentImport.analyzingTime')}</p>
          </div>
        )}

        {/* Results */}
        {!extracting && extractionResult && (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Summary */}
            {extractionResult.documentSummary && (
              <Card className="mb-4 flex-shrink-0">
                <CardContent className="pt-4">
                  <div className="flex gap-2 items-start">
                    <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">{extractionResult.documentSummary}</p>
                      {extractionResult.quoteMetadata && (
                        <div className="flex flex-wrap gap-3 mt-2">
                          {extractionResult.quoteMetadata.vendorName && (
                            <Badge variant="outline" className="gap-1">
                              <Building2 className="h-3 w-3" />
                              {extractionResult.quoteMetadata.vendorName}
                            </Badge>
                          )}
                          {extractionResult.quoteMetadata.totalAmount && (
                            <Badge variant="outline" className="gap-1 font-semibold">
                              {extractionResult.quoteMetadata.totalAmount.toLocaleString("sv-SE")} kr
                            </Badge>
                          )}
                          {extractionResult.quoteMetadata.quoteDate && (
                            <Badge variant="outline" className="gap-1">
                              {extractionResult.quoteMetadata.quoteDate}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Document Preview */}
            {file && (
              <div className="flex-shrink-0 mb-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-2 cursor-pointer select-none">
                  <span className="flex items-center gap-2" onClick={() => setPreviewExpanded(v => !v)}>
                    {previewExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {t('aiDocumentImport.documentPreview', 'Dokumentförhandsvisning')}
                  </span>
                  {previewExpanded && (
                    <span className="flex items-center gap-1 ml-2">
                      <button type="button" onClick={() => setPreviewZoom(z => Math.max(50, z - 25))} className="p-0.5 hover:bg-muted rounded">
                        <ZoomOut className="h-3 w-3" />
                      </button>
                      <span className="text-xs tabular-nums min-w-[32px] text-center">{previewZoom}%</span>
                      <button type="button" onClick={() => setPreviewZoom(z => Math.min(200, z + 25))} className="p-0.5 hover:bg-muted rounded">
                        <ZoomIn className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                </div>
                {previewExpanded && (
                  <div className="border rounded-lg bg-muted/30 overflow-auto" style={{ maxHeight: '35vh' }}>
                    {file.type?.includes('pdf') ? (
                      <iframe
                        src={previewUrl ? `${previewUrl}#navpanes=0&scrollbar=1&view=FitH` : undefined}
                        title={file.name}
                        className="w-full border-0"
                        style={{ height: '35vh', transform: `scale(${previewZoom / 100})`, transformOrigin: 'top left', width: `${100 / (previewZoom / 100)}%` }}
                      />
                    ) : file.type?.startsWith('image/') ? (
                      <img
                        src={previewUrl ?? undefined}
                        alt={file.name}
                        className="max-w-full h-auto mx-auto"
                        style={{ transform: `scale(${previewZoom / 100})`, transformOrigin: 'top center', maxHeight: '35vh' }}
                      />
                    ) : (
                      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                        <FileText className="h-8 w-8 mr-2" />
                        {file.name}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* AI-extracted items (rooms/tasks found in document) */}
            {(rooms.length > 0 || tasks.length > 0) && (
              <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
                {rooms.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium flex items-center gap-1.5">
                        <Home className="h-3.5 w-3.5" />
                        {t('aiDocumentImport.roomsFound', { count: rooms.length })}
                      </h4>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={selectAllRooms}>{t('aiDocumentImport.all')}</Button>
                        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={deselectAllRooms}>{t('aiDocumentImport.none')}</Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {rooms.map((room) => (
                        <button key={room.index} type="button"
                          onClick={() => toggleRoomSelection(room.index)}
                          className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${room.selected ? 'bg-primary/10 border-primary/30 text-foreground' : 'hover:bg-muted text-muted-foreground'}`}
                        >
                          {room.selected && <CheckCircle2 className="h-3 w-3 text-primary" />}
                          {room.name}
                          {room.estimatedAreaSqm && <span className="text-muted-foreground">({room.estimatedAreaSqm}m²)</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {tasks.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium flex items-center gap-1.5">
                        <ClipboardList className="h-3.5 w-3.5" />
                        {t('aiDocumentImport.tasksFound', { count: tasks.length })}
                      </h4>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={selectAllTasks}>{t('aiDocumentImport.all')}</Button>
                        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={deselectAllTasks}>{t('aiDocumentImport.none')}</Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {tasks.map((task) => (
                        <button key={task.index} type="button"
                          onClick={() => toggleTaskSelection(task.index)}
                          className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${task.selected ? 'bg-primary/10 border-primary/30 text-foreground' : 'hover:bg-muted text-muted-foreground'}`}
                        >
                          {task.selected && <CheckCircle2 className="h-3 w-3 text-primary" />}
                          {task.title}
                          {task.roomName && <span className="text-muted-foreground">· {task.roomName}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sticky linking footer — Arbete, Inköp, Rum */}
            <div className="flex-shrink-0 border-t pt-3 mt-3">
              <p className="text-xs text-muted-foreground mb-2">{t('aiDocumentImport.linkFile', 'Koppla filen till:')}</p>
              <div className="grid grid-cols-3 gap-3">
                {/* Koppla till arbete */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full justify-start gap-2 h-9">
                      <ClipboardList className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate text-xs">
                        {linkedTaskIds.size > 0
                          ? `${linkedTaskIds.size} arbete${linkedTaskIds.size > 1 ? 'n' : ''}`
                          : existingTasks.length > 0 ? t('aiDocumentImport.linkToTask', 'Koppla till arbete') : t('aiDocumentImport.createNewTask', 'Skapa nytt arbete')}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-1 max-h-64 overflow-y-auto" align="start">
                    {existingTasks.map((tk) => (
                      <button key={tk.id} type="button"
                        onClick={() => setLinkedTaskIds(prev => { const n = new Set(prev); n.has(tk.id) ? n.delete(tk.id) : n.add(tk.id); return n; })}
                        className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted flex items-center gap-2 ${linkedTaskIds.has(tk.id) ? 'bg-primary/5 font-medium' : ''}`}
                      >
                        {linkedTaskIds.has(tk.id) && <Check className="h-3 w-3 text-primary shrink-0" />}
                        <span className={linkedTaskIds.has(tk.id) ? '' : 'pl-5'} title={tk.title}>{tk.title}</span>
                      </button>
                    ))}
                    <div className="border-t mt-1 pt-1">
                      <div className="flex gap-1 px-1">
                        <Input value={newTaskName} onChange={(e) => setNewTaskName(e.target.value)}
                          placeholder={t('aiDocumentImport.createNewTask', 'Skapa nytt arbete...')}
                          className="h-7 text-xs" onKeyDown={(e) => e.key === "Enter" && handleCreateTask()} />
                        <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={handleCreateTask} disabled={creatingSub === "task" || !newTaskName.trim()}>
                          {creatingSub === "task" ? <Loader2 className="h-3 w-3 animate-spin" /> : "+"}
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Koppla till inköp */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full justify-start gap-2 h-9">
                      <Wallet className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate text-xs">
                        {linkedPurchaseIds.size > 0
                          ? `${linkedPurchaseIds.size} inköp`
                          : existingPurchases.length > 0 ? t('aiDocumentImport.linkToPurchase', 'Koppla till inköp') : t('aiDocumentImport.createNewPurchase', 'Skapa nytt inköp')}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-1 max-h-64 overflow-y-auto" align="start">
                    {existingPurchases.map((p) => (
                      <button key={p.id} type="button"
                        onClick={() => setLinkedPurchaseIds(prev => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })}
                        className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted flex items-center gap-2 ${linkedPurchaseIds.has(p.id) ? 'bg-primary/5 font-medium' : ''}`}
                      >
                        {linkedPurchaseIds.has(p.id) && <Check className="h-3 w-3 text-primary shrink-0" />}
                        <span className={linkedPurchaseIds.has(p.id) ? '' : 'pl-5'} title={p.name}>{p.name}</span>
                      </button>
                    ))}
                    <div className="border-t mt-1 pt-1">
                      <div className="flex gap-1 px-1">
                        <Input value={newPurchaseName} onChange={(e) => setNewPurchaseName(e.target.value)}
                          placeholder={t('aiDocumentImport.createNewPurchase', 'Skapa nytt inköp...')}
                          className="h-7 text-xs" onKeyDown={(e) => e.key === "Enter" && handleCreatePurchase()} />
                        <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={handleCreatePurchase} disabled={creatingSub === "purchase" || !newPurchaseName.trim()}>
                          {creatingSub === "purchase" ? <Loader2 className="h-3 w-3 animate-spin" /> : "+"}
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Koppla till rum */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full justify-start gap-2 h-9">
                      <Home className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate text-xs">
                        {linkedRoomIds.size > 0
                          ? `${linkedRoomIds.size} rum`
                          : existingRooms.length > 0 ? t('aiDocumentImport.linkToRoom', 'Koppla till rum') : t('aiDocumentImport.createNewRoom', 'Skapa nytt rum')}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-1 max-h-64 overflow-y-auto" align="start">
                    {existingRooms.map((r) => (
                      <button key={r.id} type="button"
                        onClick={() => setLinkedRoomIds(prev => { const n = new Set(prev); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })}
                        className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted flex items-center gap-2 ${linkedRoomIds.has(r.id) ? 'bg-primary/5 font-medium' : ''}`}
                      >
                        {linkedRoomIds.has(r.id) && <Check className="h-3 w-3 text-primary shrink-0" />}
                        <span className={linkedRoomIds.has(r.id) ? '' : 'pl-5'} title={r.name}>{r.name}</span>
                      </button>
                    ))}
                    <div className="border-t mt-1 pt-1">
                      <div className="flex gap-1 px-1">
                        <Input value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)}
                          placeholder={t('aiDocumentImport.createNewRoom', 'Skapa nytt rum...')}
                          className="h-7 text-xs" onKeyDown={(e) => e.key === "Enter" && handleCreateRoom()} />
                        <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={handleCreateRoom} disabled={creatingSub === "room" || !newRoomName.trim()}>
                          {creatingSub === "room" ? <Loader2 className="h-3 w-3 animate-spin" /> : "+"}
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <Separator className="my-4" />
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {selectedRoomCount > 0 || selectedTaskCount > 0 ? (
              <span>
                {t('aiDocumentImport.selected', { rooms: selectedRoomCount, tasks: selectedTaskCount })}
              </span>
            ) : (
              <span>{t('aiDocumentImport.selectPrompt')}</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleImport}
              disabled={
                extracting ||
                importing ||
                (selectedRoomCount === 0 && selectedTaskCount === 0 && linkedRoomIds.size === 0 && linkedTaskIds.size === 0 && linkedPurchaseIds.size === 0)
              }
            >
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('aiDocumentImport.importing')}
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  {t('aiDocumentImport.importButton', { rooms: selectedRoomCount, tasks: selectedTaskCount })}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
