/**
 * AI Project Import Modal
 * Upload a document, AI extracts project name, rooms and tasks,
 * then creates the project with everything pre-filled.
 */

import { useState, useCallback } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  Sparkles,
  Loader2,
  Home,
  ClipboardList,
  CheckCircle2,
  Edit2,
  Upload,
  FileText,
  ZoomIn,
  ZoomOut,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { scaffoldProject } from '@/services/scaffoldProject';
import { Switch } from '@/components/ui/switch';
import { Package, Shield, AlertTriangle } from 'lucide-react';
import {
  ExtractedRoom,
  ExtractedTask,
  AIDocumentExtractionResult,
  QuoteMetadata,
  TaskCategory,
  TASK_CATEGORY_LABELS,
  TASK_CATEGORY_TO_COST_CENTER,
} from '@/services/aiDocumentService.types';

const VAT_RATE = 0.25;

function formatCostNum(amount: number, sourceIsIncVat: boolean, displayIncVat: boolean): number {
  if (sourceIsIncVat === displayIncVat) return Math.round(amount);
  if (sourceIsIncVat && !displayIncVat) return Math.round(amount / (1 + VAT_RATE));
  return Math.round(amount * (1 + VAT_RATE));
}

interface EditableRoom extends ExtractedRoom {
  index: number;
  selected: boolean;
}

interface EditableTask extends ExtractedTask {
  index: number;
  selected: boolean;
  materialChildren: ExtractedTask[];
}

interface StandaloneMaterial extends ExtractedTask {
  index: number;
  selected: boolean;
}

function ConfidenceIndicator({ confidence }: { confidence: number }) {
  if (confidence >= 0.8) return <span title={`${Math.round(confidence * 100)}%`}>🟢</span>;
  if (confidence >= 0.5) return <span title={`${Math.round(confidence * 100)}%`}>🟡</span>;
  return <span title={`${Math.round(confidence * 100)}%`}>🔴</span>;
}

interface AIProjectImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectCreated: (projectId: string) => void;
}

export function AIProjectImportModal({ open, onOpenChange, onProjectCreated }: AIProjectImportModalProps) {
  const { toast } = useToast();
  const { t } = useTranslation();

  // Step 1: Upload, Step 2: Review, Step 3: Creating
  const [step, setStep] = useState<'upload' | 'review' | 'creating'>('upload');
  const [extracting, setExtracting] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [rooms, setRooms] = useState<EditableRoom[]>([]);
  const [tasks, setTasks] = useState<EditableTask[]>([]);
  const [editingRoomIndex, setEditingRoomIndex] = useState<number | null>(null);
  const [editingTaskIndex, setEditingTaskIndex] = useState<number | null>(null);
  const [summary, setSummary] = useState('');
  const [quoteMetadata, setQuoteMetadata] = useState<QuoteMetadata | null>(null);
  const [uploadedFile, setUploadedFile] = useState<{ tempPath: string; name: string; file: File } | null>(null);
  const [showIncVat, setShowIncVat] = useState(true);
  const [standaloneMaterials, setStandaloneMaterials] = useState<StandaloneMaterial[]>([]);
  const [editingMaterialKey, setEditingMaterialKey] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [previewZoom, setPreviewZoom] = useState(100);
  /** Base64 data URL for document preview (created from file) */
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);

  const resetState = useCallback(() => {
    setStep('upload');
    setExtracting(false);
    setProjectName('');
    setRooms([]);
    setTasks([]);
    setEditingRoomIndex(null);
    setEditingTaskIndex(null);
    setSummary('');
    setQuoteMetadata(null);
    setUploadedFile(null);
    setShowIncVat(true);
    setStandaloneMaterials([]);
    setEditingMaterialKey(null);
    setPreviewOpen(true);
    setPreviewZoom(100);
    setPreviewDataUrl(null);
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.toLowerCase().split('.').pop();
    if (!['pdf', 'txt', 'docx', 'doc'].includes(ext || '')) {
      toast({
        title: t('errors.generic'),
        description: t('aiProjectImport.unsupportedFormat'),
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: t('errors.generic'),
        description: t('aiProjectImport.fileTooLarge'),
        variant: 'destructive',
      });
      return;
    }

    setExtracting(true);

    try {
      // Convert file to base64 and send directly to edge function
      // (no temp storage needed — project doesn't exist yet, RLS blocks temp/ paths)
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const fileBase64 = btoa(binary);

      // Use fetch instead of functions.invoke so the server-side error body
      // surfaces on 4xx (invoke swallows the body and returns a generic
      // "non-2xx status code" message). Auth header still added since the
      // function defaults to verify_jwt=true.
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token ?? supabaseAnonKey;
      const response = await fetch(`${supabaseUrl}/functions/v1/process-document`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({
          fileBase64,
          mimeType: file.type,
          fileType: file.type,
          fileName: file.name,
          mode: 'quote',
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.error) {
        // Surface the real server-side message so the user can act on it
        // (e.g. "Kunde inte läsa PDF-filen", "Dokumentet verkar vara tomt", etc.)
        const serverMessage = data?.error || `HTTP ${response.status}`;
        console.error('AI extraction error:', serverMessage);
        throw new Error(serverMessage);
      }

      // Keep file reference to upload into project after creation
      setUploadedFile({ tempPath: '', name: file.name, file });

      // Create data URL for preview
      const blob = new Blob([file], { type: file.type });
      setPreviewDataUrl(URL.createObjectURL(blob));

      const result = data as AIDocumentExtractionResult;
      result.rooms = result.rooms || [];
      result.tasks = result.tasks || [];
      result.documentSummary = result.documentSummary || '';

      // Save quote metadata (vendor, total, date)
      if (result.quoteMetadata) {
        setQuoteMetadata(result.quoteMetadata);
        if (result.quoteMetadata.isIncludingVat !== undefined) {
          setShowIncVat(result.quoteMetadata.isIncludingVat);
        }
      }

      // Suggest project name from AI summary (NOT filename)
      const suggestedName = extractProjectName(result.documentSummary, file.name);
      setProjectName(suggestedName);
      setSummary(result.documentSummary);

      setRooms(
        result.rooms.map((room, index) => ({
          ...room,
          index,
          selected: room.confidence >= 0.5,
        }))
      );

      // Split work tasks from material budget lines
      const workItems: ExtractedTask[] = [];
      const materialItems: ExtractedTask[] = [];
      for (const task of result.tasks) {
        if (task.isMaterialBudget) {
          materialItems.push(task);
        } else {
          workItems.push(task);
        }
      }

      // Match material items to parent work tasks
      const unmatchedMaterials: ExtractedTask[] = [];
      const materialByParent = new Map<number, ExtractedTask[]>();

      for (const mat of materialItems) {
        if (mat.parentTaskName) {
          const parentIdx = workItems.findIndex(
            (w) => w.title.toLowerCase() === mat.parentTaskName!.toLowerCase()
          );
          if (parentIdx >= 0) {
            const existing = materialByParent.get(parentIdx) || [];
            existing.push(mat);
            materialByParent.set(parentIdx, existing);
            continue;
          }
        }
        unmatchedMaterials.push(mat);
      }

      setTasks(
        workItems.map((task, index) => ({
          ...task,
          index,
          selected: task.confidence >= 0.5,
          materialChildren: materialByParent.get(index) || [],
        }))
      );

      setStandaloneMaterials(
        unmatchedMaterials.map((mat, index) => ({
          ...mat,
          index,
          selected: mat.confidence >= 0.5,
        }))
      );

      setStep('review');

      // Empty extraction is not a failure (the file parsed and the call
      // succeeded) but it's also not "Analysis done" — surface as a warning
      // so the banner in the review step doesn't feel like a contradiction.
      if (result.rooms.length === 0 && workItems.length === 0) {
        toast({
          title: t('aiDocumentImport.nothingExtractedTitle', 'Inget kunde extraheras'),
          description: t(
            'aiDocumentImport.nothingExtractedToast',
            'AI:n hittade inga rum eller arbeten. Försök med en tydligare offert eller fyll i manuellt.',
          ),
        });
      } else {
        toast({
          title: t('aiDocumentImport.analysisDone'),
          description: t('aiDocumentImport.analysisResult', { rooms: result.rooms.length, tasks: workItems.length }),
        });
      }
    } catch (err) {
      console.error('AI extraction error:', err);
      // The edge function returns user-friendly Swedish error messages
      // (empty PDF, corrupt file, doc-not-supported, etc.) — surface them
      // verbatim. Fall back to generic copy for network / HTTP errors.
      const message = err instanceof Error ? err.message : '';
      const isNetworkError = !message || /^HTTP \d+/.test(message);
      toast({
        title: t('aiDocumentImport.analysisError'),
        description: isNetworkError ? t('aiDocumentImport.couldNotAnalyze') : message,
        variant: 'destructive',
      });
    } finally {
      setExtracting(false);
      // Reset the input so the same file can be re-selected
      e.target.value = '';
    }
  };

  const handleImport = async () => {
    if (!projectName.trim()) return;

    const selectedRooms = rooms.filter((r) => r.selected);
    const selectedTasks = tasks.filter((t) => t.selected);

    setStep('creating');

    try {
      // Refresh session to ensure valid token after potentially long AI analysis
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) throw new Error('Inte inloggad');

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!profile) throw new Error('Profil hittades inte');

      // Delegate creation to the shared scaffoldProject engine. VAT normalization
      // (costs → ex VAT) stays here in the caller; the engine takes ex-VAT values
      // and owns the project/rooms/tasks/materials inserts + room→task resolution.
      const scaffoldTasks = selectedTasks.map((task) => {
        const costCenter = TASK_CATEGORY_TO_COST_CENTER[task.category as TaskCategory] || 'construction';

        // Calculate material estimate from children
        const materialEstimate = task.materialChildren.reduce(
          (sum, child) => sum + (child.estimatedCost || 0),
          0
        ) || task.materialCost || null;

        // Store costs ex VAT in database
        const estimatedCost = task.estimatedCost != null
          ? Math.round(task.isIncludingVat ? task.estimatedCost / (1 + VAT_RATE) : task.estimatedCost)
          : null;

        const materialEstimateExVat = materialEstimate != null
          ? Math.round(task.isIncludingVat ? materialEstimate / (1 + VAT_RATE) : materialEstimate)
          : null;

        return {
          title: task.title,
          description: task.description,
          roomName: task.roomName || null,
          status: 'to_do',
          costCenter,
          taskCostType: 'subcontractor',
          subcontractorCost: estimatedCost,
          materialEstimate: materialEstimateExVat,
          budget: estimatedCost != null || materialEstimateExVat != null
            ? (estimatedCost || 0) + (materialEstimateExVat || 0)
            : null,
          rotEligible: task.rotEligible || false,
          rotAmount: task.rotAmount || null,
          materials: task.materialChildren.map((child) => ({
            name: child.title,
            description: child.description,
            priceTotalExVat: child.estimatedCost != null
              ? Math.round(child.isIncludingVat ? child.estimatedCost / (1 + VAT_RATE) : child.estimatedCost)
              : null,
          })),
        };
      });

      const scaffoldResult = await scaffoldProject(
        {
          project: {
            name: projectName.trim(),
            description: summary || null,
            totalBudget: quoteMetadata?.totalAmount || null,
          },
          rooms: selectedRooms.map((room) => ({
            name: room.name,
            description: room.description,
            dimensions: room.estimatedAreaSqm ? { estimatedAreaSqm: room.estimatedAreaSqm } : null,
          })),
          tasks: scaffoldTasks,
          standaloneMaterials: standaloneMaterials
            .filter((m) => m.selected)
            .map((mat) => ({
              name: mat.title,
              description: mat.description,
              priceTotalExVat: mat.estimatedCost != null
                ? Math.round(mat.isIncludingVat ? mat.estimatedCost / (1 + VAT_RATE) : mat.estimatedCost)
                : null,
            })),
        },
        profile.id
      );

      const projectId = scaffoldResult.projectId;

      // Move uploaded document into project files + link to all created tasks
      if (uploadedFile) {
        const safeName = uploadedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const uploadedFilePath = `projects/${projectId}/${Date.now()}-${safeName}`;
        await supabase.storage.from('project-files').upload(uploadedFilePath, uploadedFile.file);
        if (uploadedFile.tempPath) {
          supabase.storage.from('project-files').remove([uploadedFile.tempPath]);
        }

        if (scaffoldResult.taskIds.length > 0) {
          const fileType = uploadedFile.file.type?.includes('pdf') ? 'quote' : 'document';
          const links = scaffoldResult.taskIds.map((taskId) => ({
            project_id: projectId,
            task_id: taskId,
            file_path: uploadedFilePath,
            file_name: uploadedFile.name || 'document',
            file_type: fileType,
            vendor_name: quoteMetadata?.vendorName || null,
            invoice_amount: quoteMetadata?.totalAmount || null,
            invoice_date: quoteMetadata?.quoteDate || null,
          }));

          await supabase.from('task_file_links').insert(links);
        }
      }

      toast({
        title: t('aiProjectImport.projectCreated'),
        description: t('aiProjectImport.projectCreatedDescription', {
          rooms: selectedRooms.length,
          tasks: selectedTasks.length,
        }),
      });

      onOpenChange(false);
      resetState();
      onProjectCreated(projectId);
    } catch (err) {
      console.error('Import error:', err);
      toast({
        title: t('errors.generic'),
        description: err instanceof Error ? err.message : t('aiDocumentImport.couldNotImport'),
        variant: 'destructive',
      });
      setStep('review');
    }
  };

  const toggleRoomSelection = (index: number) => {
    setRooms((prev) => prev.map((r) => (r.index === index ? { ...r, selected: !r.selected } : r)));
  };

  const toggleTaskSelection = (index: number) => {
    setTasks((prev) => prev.map((t) => (t.index === index ? { ...t, selected: !t.selected } : t)));
  };

  const updateRoom = (index: number, updates: Partial<ExtractedRoom>) => {
    setRooms((prev) => prev.map((r) => (r.index === index ? { ...r, ...updates } : r)));
  };

  const updateTask = (index: number, updates: Partial<ExtractedTask>) => {
    setTasks((prev) => prev.map((t) => (t.index === index ? { ...t, ...updates } : t)));
  };

  const updateMaterialChild = (taskIndex: number, matIndex: number, cost: number | null) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.index !== taskIndex) return t;
        const updated = [...t.materialChildren];
        updated[matIndex] = { ...updated[matIndex], estimatedCost: cost };
        return { ...t, materialChildren: updated };
      })
    );
  };

  const updateStandaloneMaterial = (matIndex: number, cost: number | null) => {
    setStandaloneMaterials((prev) =>
      prev.map((m) => (m.index === matIndex ? { ...m, estimatedCost: cost } : m))
    );
  };

  const selectedRoomCount = rooms.filter((r) => r.selected).length;
  const selectedTaskCount = tasks.filter((t) => t.selected).length;

  const isBusy = extracting || step === 'creating';

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (!o && isBusy) return;
      if (!o && uploadedFile?.tempPath) {
        supabase.storage.from('project-files').remove([uploadedFile.tempPath]);
      }
      onOpenChange(o);
      if (!o) resetState();
    }}>
      <DialogContent
        className={`flex flex-col overflow-hidden transition-all ${
          step === 'review' && previewOpen
            ? '!max-w-[95vw] !w-[95vw] !h-[92vh] max-h-[92vh]'
            : step === 'review'
              ? '!max-w-3xl !w-full !h-[92vh] max-h-[92vh]'
              : 'max-w-lg max-h-[80vh]'
        }`}
        onPointerDownOutside={(e) => { if (isBusy) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (isBusy) e.preventDefault(); }}
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {t('aiProjectImport.title')}
          </DialogTitle>
          <DialogDescription>{t('aiProjectImport.description')}</DialogDescription>
        </DialogHeader>

        {/* Upload step */}
        {step === 'upload' && !extracting && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="rounded-full bg-primary/10 p-4">
              <Upload className="h-8 w-8 text-primary" />
            </div>
            <div className="text-center space-y-1">
              <p className="font-medium">{t('aiProjectImport.uploadTitle')}</p>
              <p className="text-sm text-muted-foreground">{t('aiProjectImport.uploadDescription')}</p>
            </div>
            <Label htmlFor="ai-project-file" className="cursor-pointer">
              <Button asChild variant="outline" className="min-h-[48px]">
                <span>
                  <FileText className="h-4 w-4 mr-2" />
                  {t('aiProjectImport.chooseFile')}
                </span>
              </Button>
            </Label>
            <input
              id="ai-project-file"
              type="file"
              accept=".pdf,.txt,.docx,.doc"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        )}

        {/* Extracting spinner */}
        {extracting && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg font-medium">{t('aiDocumentImport.analyzing')}</p>
            <p className="text-sm text-muted-foreground mt-2">{t('aiDocumentImport.analyzingTime')}</p>
          </div>
        )}

        {/* Review step */}
        {step === 'review' && (
          <div className="flex-1 min-h-0 flex gap-4 overflow-hidden">
            {/* Document preview panel — collapsible */}
            {previewDataUrl && previewOpen && (
              <div className="w-[50%] hidden sm:flex flex-col min-h-0 shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-muted-foreground">{t('aiDocumentImport.documentPreview', 'Dokument')}</span>
                  <span className="flex items-center gap-1 ml-auto">
                    <button type="button" onClick={() => setPreviewZoom(z => Math.max(50, z - 25))} className="p-0.5 hover:bg-muted rounded"><ZoomOut className="h-3 w-3" /></button>
                    <span className="text-xs tabular-nums min-w-[32px] text-center">{previewZoom}%</span>
                    <button type="button" onClick={() => setPreviewZoom(z => Math.min(200, z + 25))} className="p-0.5 hover:bg-muted rounded"><ZoomIn className="h-3 w-3" /></button>
                  </span>
                </div>
                <div className="flex-1 border rounded-lg bg-muted/30 overflow-auto">
                  {uploadedFile?.file.type?.includes('pdf') ? (
                    <iframe
                      src={`${previewDataUrl}#navpanes=0&scrollbar=1&view=FitH`}
                      title={uploadedFile.name}
                      className="w-full h-full border-0"
                      style={{ minHeight: '400px', transform: `scale(${previewZoom / 100})`, transformOrigin: 'top left', width: `${100 / (previewZoom / 100)}%` }}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground py-12">
                      <FileText className="h-10 w-10 mr-2" />
                      <span className="text-sm">{uploadedFile?.name}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Vertical resize bar — toggle preview */}
            {previewDataUrl && (
              <button
                type="button"
                onClick={() => setPreviewOpen(!previewOpen)}
                className="hidden sm:flex items-center justify-center w-3 shrink-0 group cursor-col-resize"
                title={previewOpen ? t('common.collapse', 'Minimera') : t('aiDocumentImport.documentPreview', 'Visa dokument')}
              >
                <div className="w-1 h-12 rounded-full bg-border group-hover:bg-primary/50 group-hover:h-16 transition-all" />
              </button>
            )}

            {/* Results panel */}
          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            <div className="space-y-4">
              {/* Empty-extraction banner — when AI returns 0 rooms AND 0 tasks the
                  user otherwise gets two passive "not found" lines and a disabled
                  Create button. Surface the issue + suggested action up front. */}
              {rooms.length === 0 && tasks.length === 0 && (
                <div
                  className="flex gap-2 items-start p-3 rounded-lg border"
                  style={{
                    background: 'var(--rf-warn-bg, #FEF3C7)',
                    borderColor: 'var(--rf-warn, #92400E)',
                    color: 'var(--rf-warn, #92400E)',
                  }}
                >
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <div className="text-sm space-y-1">
                    <p className="font-medium">
                      {t('aiDocumentImport.nothingExtractedTitle', 'Inget kunde extraheras')}
                    </p>
                    <p className="text-xs opacity-90">
                      {t(
                        'aiDocumentImport.nothingExtractedHint',
                        'Försök ladda upp en tydligare offert eller skapa projektet manuellt.',
                      )}
                    </p>
                  </div>
                </div>
              )}

              {/* Project name */}
              <div className="space-y-2">
                <Label>{t('projects.projectName')} *</Label>
                <Input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder={t('projects.projectNamePlaceholder')}
                  className="min-h-[44px]"
                />
              </div>

              {/* Summary */}
              {summary && (
                <div className="flex gap-2 items-start p-3 rounded-lg bg-muted/50">
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">{summary}</p>
                </div>
              )}

              {/* Rooms */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Home className="h-4 w-4" />
                    {t('aiDocumentImport.roomsFound', { count: rooms.length })}
                  </h4>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setRooms((p) => p.map((r) => ({ ...r, selected: true })))}>
                      {t('aiDocumentImport.all')}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setRooms((p) => p.map((r) => ({ ...r, selected: false })))}>
                      {t('aiDocumentImport.none')}
                    </Button>
                  </div>
                </div>
                {rooms.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-3">{t('aiDocumentImport.noRoomsFound')}</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {rooms.map((room) => (
                      <div
                        key={room.index}
                        className={`flex items-start gap-2 p-2 rounded-lg border transition-colors ${room.selected ? 'bg-primary/5 border-primary/20' : 'bg-background'}`}
                      >
                        <Checkbox checked={room.selected} onCheckedChange={() => toggleRoomSelection(room.index)} className="mt-0.5" />
                        <div className="flex-1 min-w-0">
                          {editingRoomIndex === room.index ? (
                            <div className="space-y-1.5">
                              <Input value={room.name} onChange={(e) => updateRoom(room.index, { name: e.target.value })} className="h-7 text-sm" />
                              <Input
                                type="number"
                                value={room.estimatedAreaSqm || ''}
                                onChange={(e) => updateRoom(room.index, { estimatedAreaSqm: e.target.value ? parseFloat(e.target.value) : null })}
                                placeholder={t('aiDocumentImport.areaPlaceholder')}
                                className="h-7 text-sm"
                              />
                              <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setEditingRoomIndex(null)}>{t('aiDocumentImport.done')}</Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium truncate">{room.name}</span>
                              {room.estimatedAreaSqm && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{room.estimatedAreaSqm} m²</Badge>}
                              <ConfidenceIndicator confidence={room.confidence} />
                            </div>
                          )}
                        </div>
                        {editingRoomIndex !== room.index && (
                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setEditingRoomIndex(room.index)}>
                            <Edit2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Tasks + Prices */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" />
                    {t('aiDocumentImport.tasksFound', { count: tasks.length })}
                  </h4>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{t('quoteImport.exVat', 'Ex. moms')}</span>
                      <Switch checked={showIncVat} onCheckedChange={setShowIncVat} className="h-4 w-7 data-[state=checked]:bg-primary" />
                      <span>{t('quoteImport.incVat', 'Ink. moms')}</span>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setTasks((p) => p.map((t) => ({ ...t, selected: true })))}>
                        {t('aiDocumentImport.all')}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setTasks((p) => p.map((t) => ({ ...t, selected: false })))}>
                        {t('aiDocumentImport.none')}
                      </Button>
                    </div>
                  </div>
                </div>
                {tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-3">{t('aiDocumentImport.noTasksFound')}</p>
                ) : (
                  <div className="space-y-1.5">
                    {tasks.map((task) => {
                      const fmtCost = (amt: number, srcInc: boolean) =>
                        formatCostNum(amt, srcInc, showIncVat).toLocaleString('sv-SE');
                      return (
                        <div key={task.index}>
                          <div
                            className={`flex items-start gap-2 p-2 rounded-lg border transition-colors ${task.selected ? 'bg-primary/5 border-primary/20' : 'bg-background'}`}
                          >
                            <Checkbox checked={task.selected} onCheckedChange={() => toggleTaskSelection(task.index)} className="mt-0.5" />
                            <div className="flex-1 min-w-0">
                              {editingTaskIndex === task.index ? (
                                <div className="space-y-1.5">
                                  <Input value={task.title} onChange={(e) => updateTask(task.index, { title: e.target.value })} className="h-7 text-sm" />
                                  <div className="flex gap-2">
                                    <Select value={task.category} onValueChange={(v) => updateTask(task.index, { category: v as TaskCategory })}>
                                      <SelectTrigger className="h-7 text-sm flex-1"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        {Object.entries(TASK_CATEGORY_LABELS).map(([value, label]) => (
                                          <SelectItem key={value} value={value}>{label}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Input
                                      type="number"
                                      value={task.estimatedCost || ''}
                                      onChange={(e) => updateTask(task.index, { estimatedCost: e.target.value ? parseFloat(e.target.value) : null })}
                                      placeholder={t('quoteImport.costPlaceholder', 'Kostnad (SEK)')}
                                      className="h-7 text-sm w-32"
                                    />
                                  </div>
                                  <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setEditingTaskIndex(null)}>{t('aiDocumentImport.done')}</Button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-sm font-medium">{task.title}</span>
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                    {TASK_CATEGORY_LABELS[task.category as TaskCategory] || task.category}
                                  </Badge>
                                  {task.roomName && <span className="text-xs text-muted-foreground">({task.roomName})</span>}
                                  {task.rotEligible && (
                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700">
                                      <Shield className="h-2.5 w-2.5 mr-0.5" />ROT
                                    </Badge>
                                  )}
                                  <ConfidenceIndicator confidence={task.confidence} />
                                  {task.estimatedCost != null && (
                                    <span className="ml-auto text-sm font-medium tabular-nums">
                                      {fmtCost(task.estimatedCost, task.isIncludingVat)} kr
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            {editingTaskIndex !== task.index && (
                              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setEditingTaskIndex(task.index)}>
                                <Edit2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                          {/* Material children */}
                          {task.materialChildren.length > 0 && (
                            <div className="ml-8 mt-0.5 space-y-0.5">
                              {task.materialChildren.map((mat, mi) => {
                                const matKey = `${task.index}-${mi}`;
                                const isEditingMat = editingMaterialKey === matKey;
                                return (
                                  <div key={`mat-${matKey}`} className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground rounded bg-amber-50 border border-amber-100">
                                    <Package className="h-3 w-3 text-amber-600 shrink-0" />
                                    <span className="truncate">{mat.title}</span>
                                    {isEditingMat ? (
                                      <div className="ml-auto flex items-center gap-1">
                                        <span className="text-amber-700">+</span>
                                        <Input
                                          type="number"
                                          autoFocus
                                          defaultValue={mat.estimatedCost ?? ''}
                                          className="h-6 w-24 text-xs text-right tabular-nums"
                                          onBlur={(e) => {
                                            const val = e.target.value ? parseFloat(e.target.value) : null;
                                            updateMaterialChild(task.index, mi, val);
                                            setEditingMaterialKey(null);
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              const val = (e.target as HTMLInputElement).value ? parseFloat((e.target as HTMLInputElement).value) : null;
                                              updateMaterialChild(task.index, mi, val);
                                              setEditingMaterialKey(null);
                                            }
                                          }}
                                        />
                                        <span className="text-amber-700">kr</span>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        className="ml-auto font-medium tabular-nums text-amber-700 hover:underline hover:text-amber-900 cursor-pointer"
                                        onClick={() => setEditingMaterialKey(matKey)}
                                      >
                                        +{mat.estimatedCost != null ? fmtCost(mat.estimatedCost, mat.isIncludingVat) : '0'} kr
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {task.rotAmount != null && task.rotAmount > 0 && (
                            <div className="ml-8 mt-0.5 flex items-center gap-2 px-2 py-1 text-xs text-green-700 rounded bg-green-50 border border-green-100">
                              <Shield className="h-3 w-3 shrink-0" />
                              <span>{t('quoteImport.rotDeduction', 'ROT-avdrag')}</span>
                              <span className="ml-auto font-medium tabular-nums">-{task.rotAmount.toLocaleString('sv-SE')} kr</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Standalone materials */}
                {standaloneMaterials.length > 0 && (
                  <div className="mt-3">
                    <h5 className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5" />
                      {t('quoteImport.standaloneMaterials', 'Fristående materialposter')}
                    </h5>
                    <div className="space-y-1">
                      {standaloneMaterials.map((mat) => {
                        const sKey = `standalone-${mat.index}`;
                        const isEditingMat = editingMaterialKey === sKey;
                        return (
                          <div
                            key={sKey}
                            className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${mat.selected ? 'bg-amber-50 border-amber-200' : 'bg-background'}`}
                          >
                            <Checkbox
                              checked={mat.selected}
                              onCheckedChange={() =>
                                setStandaloneMaterials((p) => p.map((m) => m.index === mat.index ? { ...m, selected: !m.selected } : m))
                              }
                            />
                            <Package className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                            <span className="text-sm truncate">{mat.title}</span>
                            {isEditingMat ? (
                              <div className="ml-auto flex items-center gap-1">
                                <Input
                                  type="number"
                                  autoFocus
                                  defaultValue={mat.estimatedCost ?? ''}
                                  className="h-6 w-24 text-xs text-right tabular-nums"
                                  onBlur={(e) => {
                                    const val = e.target.value ? parseFloat(e.target.value) : null;
                                    updateStandaloneMaterial(mat.index, val);
                                    setEditingMaterialKey(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      const val = (e.target as HTMLInputElement).value ? parseFloat((e.target as HTMLInputElement).value) : null;
                                      updateStandaloneMaterial(mat.index, val);
                                      setEditingMaterialKey(null);
                                    }
                                  }}
                                />
                                <span className="text-sm">kr</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="ml-auto text-sm font-medium tabular-nums hover:underline cursor-pointer"
                                onClick={() => setEditingMaterialKey(sKey)}
                              >
                                {mat.estimatedCost != null ? formatCostNum(mat.estimatedCost, mat.isIncludingVat, showIncVat).toLocaleString('sv-SE') : '0'} kr
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>{t('aiDocumentImport.highConfidence')}</span>
                <span>{t('aiDocumentImport.mediumConfidence')}</span>
                <span>{t('aiDocumentImport.lowConfidence')}</span>
              </div>
            </div>
          </div>
          </div>
        )}

        {/* Creating spinner */}
        {step === 'creating' && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg font-medium">{t('aiProjectImport.creating')}</p>
          </div>
        )}

        {/* Footer */}
        {step === 'review' && (
          <>
            <Separator className="my-4" />
            <div className="flex items-center justify-between flex-shrink-0">
              <div className="text-sm text-muted-foreground">
                {selectedRoomCount > 0 || selectedTaskCount > 0
                  ? t('aiDocumentImport.selected', { rooms: selectedRoomCount, tasks: selectedTaskCount })
                  : t('aiDocumentImport.selectPrompt')}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { onOpenChange(false); resetState(); }}>
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={!projectName.trim() || (selectedRoomCount === 0 && selectedTaskCount === 0)}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  {t('aiProjectImport.createProject')}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Try to extract a short project name from the AI summary.
 * Falls back to a cleaned-up filename.
 */
function extractProjectName(summary: string, fileName: string): string {
  // If summary is short enough (< 60 chars), use it as-is
  if (summary && summary.length < 60 && summary.length > 3) {
    // Take first sentence
    const firstSentence = summary.split(/[.\n]/)[0].trim();
    if (firstSentence.length > 3 && firstSentence.length < 60) {
      return firstSentence;
    }
  }

  // Try to extract an address or object name from summary
  if (summary) {
    // Look for common patterns like "Renovering av Storgatan 12" or "Badrumsrenovering"
    const addressMatch = summary.match(/(?:renovering|ombyggnad|uppdrag)\s+(?:av|på|i)\s+([^,.]+)/i);
    if (addressMatch) return addressMatch[0].trim().substring(0, 60);

    // Just use first 60 chars of summary
    const short = summary.substring(0, 60).trim();
    if (short.length > 10) return short;
  }

  // Fall back to filename without extension
  return fileName.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
}
