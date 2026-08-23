/**
 * BatchSmartUploadDialog — AI-classifies multiple dropped files at once
 *
 * Flow:
 * 1. User drops files/folders onto the files area
 * 2. This dialog opens showing all files in a table
 * 3. Each file is AI-classified sequentially (quote, invoice, receipt, etc.)
 * 4. User reviews/adjusts categories per file
 * 5. On confirm → files are uploaded to category folders
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  Check,
  AlertCircle,
  FileText,
  Image as ImageIcon,
  Eye,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  classifyDocument,
  ensureCategoryFolder,
  uploadToCategoryFolder,
  type DocumentType,
  type ClassificationResult,
} from '@/services/smartUploadService';
import { toast } from 'sonner';

import { readDroppedItems, type DroppedFile } from '@/lib/dropTree';

// Re-exported for existing importers (the file drop area uses readDroppedItems).
export { readDroppedItems };
export type { DroppedFile };

interface FileEntry {
  file: File;
  relativePath: string;
  status: 'pending' | 'classifying' | 'done' | 'error';
  classification: ClassificationResult | null;
  categoryOverride: DocumentType | null; // user override
}

interface BatchSmartUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: DroppedFile[];
  projectId: string;
  currentFolder: string;
  onComplete: () => void;
}

const CATEGORY_LABELS: Record<DocumentType, string> = {
  quote: 'Offert',
  invoice: 'Faktura',
  receipt: 'Kvitto',
  floor_plan: 'Ritning',
  contract: 'Kontrakt',
  specification: 'Specifikation',
  product_image: 'Produktbild',
  other: 'Övrigt',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const BatchSmartUploadDialog: React.FC<BatchSmartUploadDialogProps> = ({
  open,
  onOpenChange,
  files,
  projectId,
  currentFolder,
  onComplete,
}) => {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const classifyingRef = useRef(false);

  // Initialize entries from dropped files
  useEffect(() => {
    if (!open || files.length === 0) return;
    setEntries(
      files.map((f) => ({
        file: f.file,
        relativePath: f.relativePath,
        status: 'pending',
        classification: null,
        categoryOverride: null,
      })),
    );
  }, [open, files]);

  // Classify files sequentially
  useEffect(() => {
    if (!open || entries.length === 0 || classifyingRef.current) return;

    const nextPending = entries.find((e) => e.status === 'pending');
    if (!nextPending) return;

    classifyingRef.current = true;
    const idx = entries.indexOf(nextPending);

    setEntries((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, status: 'classifying' } : e)),
    );

    classifyDocument(nextPending.file)
      .then((result) => {
        setEntries((prev) =>
          prev.map((e, i) =>
            i === idx ? { ...e, status: 'done', classification: result } : e,
          ),
        );
      })
      .catch(() => {
        setEntries((prev) =>
          prev.map((e, i) => (i === idx ? { ...e, status: 'error' } : e)),
        );
      })
      .finally(() => {
        classifyingRef.current = false;
      });
  }, [open, entries]);

  const getCategory = (entry: FileEntry): DocumentType => {
    return entry.categoryOverride ?? entry.classification?.type ?? 'other';
  };

  const allDone = entries.length > 0 && entries.every((e) => e.status === 'done' || e.status === 'error');
  const classifiedCount = entries.filter((e) => e.status === 'done').length;

  // Upload all files to their category folders
  const handleConfirm = useCallback(async () => {
    setUploading(true);
    let uploadedCount = 0;

    try {
      // Ensure category folders exist
      const usedCategories = new Set(entries.map(getCategory));
      for (const cat of usedCategories) {
        await ensureCategoryFolder(projectId, cat);
      }

      // Upload each file
      for (const entry of entries) {
        if (entry.status === 'error') continue;
        const category = getCategory(entry);
        const filePath = await uploadToCategoryFolder(projectId, entry.file, category, currentFolder);

        if (filePath) {
          uploadedCount++;

          // Auto-link: match vendor_name against existing materials/tasks
          if (entry.classification?.vendor_name) {
            const vendor = entry.classification.vendor_name.toLowerCase();
            const { data: matchingMats } = await supabase
              .from('materials')
              .select('id, name, vendor_name')
              .eq('project_id', projectId)
              .or(`vendor_name.ilike.%${vendor}%,name.ilike.%${vendor}%`)
              .limit(1);

            const { data: userData } = await supabase.auth.getUser();
            let profileId: string | null = null;
            if (userData.data.user) {
              const { data: profile } = await supabase
                .from('profiles').select('id').eq('user_id', userData.data.user.id).single();
              profileId = profile?.id || null;
            }

            if (matchingMats && matchingMats.length > 0 && profileId) {
              const fileTypeMap: Record<string, string> = {
                invoice: 'invoice', receipt: 'receipt', quote: 'quote',
                contract: 'contract', other: 'other',
              };
              await supabase.from('task_file_links').insert({
                project_id: projectId,
                material_id: matchingMats[0].id,
                file_path: filePath,
                file_name: entry.file.name,
                file_type: fileTypeMap[category] || 'other',
                file_size: entry.file.size,
                mime_type: entry.file.type,
                linked_by_user_id: profileId,
                invoice_date: entry.classification?.invoice_date || null,
                invoice_amount: entry.classification?.invoice_amount || null,
              });
            }
          }
        }
      }

      toast.success(
        t('files.batchUploadSuccess', {
          count: uploadedCount,
          defaultValue: `${uploadedCount} filer uppladdade`,
        }),
      );
      onComplete();
      onOpenChange(false);
    } catch (err) {
      console.error('Batch upload error:', err);
      toast.error(t('files.uploadError', 'Uppladdning misslyckades'));
    } finally {
      setUploading(false);
    }
  }, [entries, projectId, currentFolder, onComplete, onOpenChange, t]);

  const handlePreview = (file: File) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (file.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(file));
    } else if (file.type === 'application/pdf') {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-7xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t('files.batchUploadTitle', 'Smart uppladdning')}
            <span className="text-sm font-normal text-muted-foreground">
              {entries.length} {t('files.filesCount', 'filer')}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Progress bar */}
        {!allDone && entries.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t('files.classifying', 'Analyserar')} {classifiedCount}/{entries.length}
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${(classifiedCount / entries.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* File list */}
        <div className="flex-1 overflow-y-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr className="border-b">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  {t('files.fileName', 'Fil')}
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-36">
                  {t('files.category', 'Kategori')}
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-32">
                  {t('files.autoLink', 'Koppling')}
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground w-20">
                  {t('files.size', 'Storlek')}
                </th>
                <th className="px-3 py-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, idx) => {
                const category = getCategory(entry);
                const isImage = entry.file.type.startsWith('image/');
                return (
                  <tr key={idx} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {entry.status === 'classifying' && (
                          <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                        )}
                        {entry.status === 'done' && (
                          <Check className="h-4 w-4 text-green-500 shrink-0" />
                        )}
                        {entry.status === 'error' && (
                          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                        )}
                        {entry.status === 'pending' && (
                          isImage
                            ? <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                            : <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <span className="truncate">{entry.file.name}</span>
                      </div>
                      {entry.classification?.summary && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate pl-6">
                          {entry.classification.summary}
                          {entry.classification.invoice_amount != null && (
                            <span className="ml-2 font-medium text-foreground">
                              {entry.classification.invoice_amount.toLocaleString('sv-SE')} kr
                            </span>
                          )}
                          {entry.classification.invoice_date && (
                            <span className="ml-1 text-muted-foreground">
                              ({entry.classification.invoice_date})
                            </span>
                          )}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {entry.status === 'done' ? (
                        <Select
                          value={category}
                          onValueChange={(val) =>
                            setEntries((prev) =>
                              prev.map((e, i) =>
                                i === idx
                                  ? { ...e, categoryOverride: val as DocumentType }
                                  : e,
                              ),
                            )
                          }
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                              <SelectItem key={key} value={key}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : entry.status === 'classifying' ? (
                        <span className="text-xs text-muted-foreground">...</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {entry.classification?.vendor_name ? (
                        <span className="text-foreground" title={`Matchas mot: ${entry.classification.vendor_name}`}>
                          {entry.classification.vendor_name}
                        </span>
                      ) : entry.status === 'done' ? (
                        <span className="text-muted-foreground/40">–</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">
                      {formatFileSize(entry.file.size)}
                    </td>
                    <td className="px-2 py-2">
                      {(isImage || entry.file.type === 'application/pdf') && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handlePreview(entry.file)}
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Preview */}
        {previewUrl && (
          <div className="border rounded-lg p-2 max-h-48 overflow-hidden flex items-center justify-center bg-muted/30">
            {previewUrl.endsWith('.pdf') || previewUrl.includes('blob:') ? (
              <img
                src={previewUrl}
                alt="Preview"
                className="max-h-44 object-contain rounded"
                onError={() => setPreviewUrl(null)}
              />
            ) : (
              <img
                src={previewUrl}
                alt="Preview"
                className="max-h-44 object-contain rounded"
              />
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
            {t('common.cancel', 'Avbryt')}
          </Button>
          <Button onClick={handleConfirm} disabled={!allDone || uploading}>
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('files.uploading', 'Laddar upp...')}
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                {t('files.confirmUpload', 'Ladda upp alla')} ({entries.filter(e => e.status !== 'error').length})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
