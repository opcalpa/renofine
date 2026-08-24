/**
 * Bostadens papper — the home's own documents on the address page (P3).
 *
 * "I love being able to have ALL documents connected to a home in one place."
 * Until now the app could only hold documents about WORK: a purchase agreement
 * had to be filed under some renovation, where the next one buries it.
 *
 * Two rules run through this component:
 *  - nothing is saved before the person approves it (ReviewDocumentsDialog)
 *  - everything stays correctable afterwards — re-tag, rename, remove
 *
 * Only the owner and household admins see it at all. A purchase agreement
 * carries the seller's personal number and the price paid; the trusted-builder
 * role (S4 insyn) must never reach it, which the database enforces.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderLock, Upload, ExternalLink, Trash2, Pencil, Check, X, Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  listPropertyDocuments,
  uploadPropertyDocument,
  updatePropertyDocument,
  deletePropertyDocument,
  getPropertyDocumentUrl,
  PROPERTY_DOC_CATEGORIES,
  type PropertyDocument,
  type PropertyDocumentCategory,
} from '@/services/propertyDocumentService';
import { ReviewDocumentsDialog, type ReviewedDocument } from './ReviewDocumentsDialog';
import { PropertyFactsCard } from './PropertyFactsCard';
import {
  extractPropertyDocumentFacts,
  applyFactToProperty,
  EXTRACTABLE_CATEGORIES,
  type AggregatedFact,
} from '@/services/propertyFactsService';
import type { PropertyRow } from '@/services/propertyService';

interface Props {
  property: PropertyRow;
  /** Owner or household admin. Viewers never see this section. */
  canManage: boolean;
  /** A fact was written into the property ("Använd") — the page should reload it. */
  onPropertyUpdated?: () => void;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  // Rounding a small file to "0 kB" reads as a failed upload.
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PropertyDocumentsSection({ property, canManage, onPropertyUpdated }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const propertyId = property.id;

  /**
   * P5 state. `pendingExtract` holds what the person asked to read while the
   * consent line is on screen — nothing is sent until they confirm. Consent is
   * asked once per visit, not once per document.
   */
  const [pendingExtract, setPendingExtract] = useState<PropertyDocument[] | null>(null);
  const [consented, setConsented] = useState(false);
  const [extractingIds, setExtractingIds] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState<string | null>(null);

  const [documents, setDocuments] = useState<PropertyDocument[] | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [pendingDelete, setPendingDelete] = useState<PropertyDocument | null>(null);

  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    listPropertyDocuments(propertyId).then((rows) => {
      if (!cancelled) setDocuments(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [propertyId, canManage]);

  if (!canManage || documents === null) return null;

  const reload = async () => setDocuments(await listPropertyDocuments(propertyId));

  const handleFilesPicked = (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;
    setPendingFiles(files);
    setReviewOpen(true);
  };

  const handleConfirm = async (reviewed: ReviewedDocument[]) => {
    setSaving(true);
    let saved = 0;
    for (const row of reviewed) {
      const result = await uploadPropertyDocument({
        propertyId,
        file: row.file,
        category: row.category,
        displayName: row.displayName,
      });
      if (result) saved += 1;
    }
    setSaving(false);
    setReviewOpen(false);
    setPendingFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    await reload();

    // Never a silent partial success: say what did not make it.
    const failed = reviewed.length - saved;
    toast({
      title: t('addresses.documents.saved', { count: saved, defaultValue: '{{count}} dokument sparade' }),
      description:
        failed > 0
          ? t('addresses.documents.savedPartial', {
              count: failed,
              defaultValue: '{{count}} kunde inte sparas — försök igen.',
            })
          : undefined,
      variant: failed > 0 ? 'destructive' : undefined,
    });
  };

  /** Run the read-out for the given documents, one at a time, and say what happened. */
  const runExtraction = async (docs: PropertyDocument[]) => {
    if (docs.length === 0) return;
    setExtractingIds(new Set(docs.map((d) => d.id)));
    let ok = 0;
    for (const doc of docs) {
      const result = await extractPropertyDocumentFacts(doc);
      if (result.ok) ok += 1;
      setExtractingIds((current) => {
        const next = new Set(current);
        next.delete(doc.id);
        return next;
      });
      // Reload after each so the facts card grows as documents finish.
      await reload();
    }
    const failed = docs.length - ok;
    toast({
      title: t('addresses.documents.extract.resultOk', { count: ok, defaultValue: 'Uppgifter utlästa ur {{count}} dokument' }),
      description:
        failed > 0
          ? t('addresses.documents.extract.resultFailed', { count: failed, defaultValue: '{{count}} dokument kunde inte läsas.' })
          : undefined,
      variant: failed > 0 ? 'destructive' : undefined,
    });
  };

  /** Ask first — every time until they have said yes once this visit. */
  const requestExtraction = (docs: PropertyDocument[]) => {
    if (docs.length === 0) {
      toast({ title: t('addresses.documents.extract.nothingToRead', 'Inga köpehandlingar att läsa — lägg till köpekontrakt, objektsbeskrivning eller besiktningsprotokoll först.') });
      return;
    }
    if (consented) {
      void runExtraction(docs);
      return;
    }
    setPendingExtract(docs);
  };

  const confirmExtraction = () => {
    const docs = pendingExtract ?? [];
    setPendingExtract(null);
    setConsented(true);
    void runExtraction(docs);
  };

  const handleApplyFact = async (fact: AggregatedFact) => {
    setApplying(fact.key);
    const ok = await applyFactToProperty(property, fact);
    setApplying(null);
    if (!ok) {
      toast({ title: t('addresses.facts.applyFailed', 'Kunde inte spara på adressen'), variant: 'destructive' });
      return;
    }
    toast({ title: t('addresses.facts.applied', 'Sparat på adressen') });
    onPropertyUpdated?.();
  };

  const handleCategoryChange = async (doc: PropertyDocument, category: PropertyDocumentCategory) => {
    setDocuments((current) =>
      (current ?? []).map((d) => (d.id === doc.id ? { ...d, category } : d))
    );
    const ok = await updatePropertyDocument(doc.id, { category });
    if (!ok) {
      toast({ title: t('addresses.documents.updateFailed', 'Ändringen kunde inte sparas'), variant: 'destructive' });
      await reload();
    }
  };

  const handleRename = async (doc: PropertyDocument) => {
    const next = renameValue.trim();
    setRenamingId(null);
    if (!next || next === doc.file_name) return;

    setDocuments((current) =>
      (current ?? []).map((d) => (d.id === doc.id ? { ...d, file_name: next } : d))
    );
    const ok = await updatePropertyDocument(doc.id, { file_name: next });
    if (!ok) {
      toast({ title: t('addresses.documents.updateFailed', 'Ändringen kunde inte sparas'), variant: 'destructive' });
      await reload();
    }
  };

  const handleOpen = async (doc: PropertyDocument) => {
    const url = await getPropertyDocumentUrl(doc);
    if (!url) {
      toast({ title: t('addresses.documents.openFailed', 'Dokumentet kunde inte öppnas'), variant: 'destructive' });
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const ok = await deletePropertyDocument(pendingDelete);
    setPendingDelete(null);
    if (!ok) {
      toast({ title: t('addresses.documents.deleteFailed', 'Dokumentet kunde inte tas bort'), variant: 'destructive' });
      return;
    }
    await reload();
    toast({ title: t('addresses.documents.deleted', 'Dokumentet är borttaget') });
  };

  // Grouped in the fixed order categories are declared in, so the papers about
  // buying the home sit above the ones about knowing it.
  const grouped = PROPERTY_DOC_CATEGORIES.map((category) => ({
    category,
    docs: documents.filter((d) => d.category === category.value),
  })).filter((group) => group.docs.length > 0);

  return (
    // Session replay runs with maskAllText off; these papers never reach it.
    <section className="rounded-xl border bg-card print:hidden" data-sentry-block>
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <FolderLock className="h-4 w-4 shrink-0 text-primary" />
        <h2 className="text-sm font-semibold">
          {t('addresses.documents.title', 'Bostadens papper')}
        </h2>
        {documents.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {t('addresses.documents.count', { count: documents.length })}
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {documents.some((d) => EXTRACTABLE_CATEGORIES.has(d.category) && d.extraction_status !== 'done') && (
            <Button
              size="sm"
              variant="ghost"
              disabled={extractingIds.size > 0}
              onClick={() =>
                requestExtraction(
                  documents.filter((d) => EXTRACTABLE_CATEGORIES.has(d.category) && d.extraction_status !== 'done')
                )
              }
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              {t('addresses.documents.extract.actionAll', 'Läs ut alla köpehandlingar')}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            {t('addresses.documents.add', 'Lägg till dokument')}
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFilesPicked(e.target.files)}
        />
      </header>

      {/* P5: what the papers say about the home, with a source on every line. */}
      <div className="border-b p-3 empty:hidden">
        <PropertyFactsCard
          property={property}
          documents={documents}
          canManage={canManage}
          onApply={handleApplyFact}
          applying={applying}
        />
      </div>

      {documents.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          {t(
            'addresses.documents.empty',
            'Köpekontrakt, besiktningsprotokoll, frågelista, energideklaration — pappren om bostaden, inte om ett enskilt arbete. De ligger kvar här även när renoveringarna tar slut.'
          )}
        </p>
      ) : (
        <div className="divide-y">
          {grouped.map((group) => (
            <div key={group.category.value} className="px-4 py-3">
              <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t(group.category.labelKey)}
              </h3>
              <ul className="space-y-1">
                {group.docs.map((doc) => (
                  <li key={doc.id} className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/40">
                    {renamingId === doc.id ? (
                      <>
                        <Input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRename(doc);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          className="h-8 min-w-0 flex-1"
                          autoFocus
                        />
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleRename(doc)}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setRenamingId(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                          onClick={() => handleOpen(doc)}
                        >
                          {doc.file_name}
                        </button>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatSize(doc.file_size)}
                        </span>
                        {/* Re-tagging is a plain control, not hidden in a menu:
                            correcting a guess should be as easy as making it. */}
                        <Select
                          value={doc.category}
                          onValueChange={(value) =>
                            handleCategoryChange(doc, value as PropertyDocumentCategory)
                          }
                        >
                          <SelectTrigger className="h-8 w-[190px] shrink-0 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PROPERTY_DOC_CATEGORIES.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {t(option.labelKey)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {/* P5: explicit per document. A chip once it is done,
                            a spinner while it runs, a warning if it failed. */}
                        {extractingIds.has(doc.id) || doc.extraction_status === 'pending' ? (
                          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            {t('addresses.documents.extract.reading', 'Läser…')}
                          </span>
                        ) : doc.extraction_status === 'done' ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                            <Check className="h-3 w-3" />
                            {t('addresses.documents.extract.done', 'Uppgifter utlästa')}
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 shrink-0 px-2 text-xs"
                            onClick={() => requestExtraction([doc])}
                          >
                            {doc.extraction_status === 'failed' ? (
                              <AlertCircle className="mr-1 h-3.5 w-3.5 text-amber-600" />
                            ) : (
                              <Sparkles className="mr-1 h-3.5 w-3.5" />
                            )}
                            {doc.extraction_status === 'failed'
                              ? t('addresses.documents.extract.failed', 'Kunde inte läsas')
                              : t('addresses.documents.extract.action', 'Läs ut uppgifter')}
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0"
                          aria-label={t('addresses.documents.rename', 'Byt namn')}
                          onClick={() => {
                            setRenamingId(doc.id);
                            setRenameValue(doc.file_name);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0"
                          aria-label={t('addresses.documents.open', 'Öppna')}
                          onClick={() => handleOpen(doc)}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label={t('common.delete', 'Ta bort')}
                          onClick={() => setPendingDelete(doc)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <ReviewDocumentsDialog
        files={pendingFiles}
        open={reviewOpen}
        onOpenChange={(open) => {
          setReviewOpen(open);
          if (!open) {
            setPendingFiles([]);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }
        }}
        onConfirm={handleConfirm}
        saving={saving}
      />

      {/* The one place the app asks before it acts on a document: a
          köpekontrakt names a third party, and the person deserves to know
          where it goes and what is kept. */}
      <AlertDialog open={!!pendingExtract} onOpenChange={(open) => !open && setPendingExtract(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('addresses.documents.extract.consentTitle', 'Läsa ut uppgifter ur dokumentet?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'addresses.documents.extract.consentBody',
                'Dokumentet skickas till vår AI-tjänst för att läsa ut uppgifter om bostaden — köpeskilling, tillträde, boarea, förening. Personnummer och kontonummer sparas aldrig. Inget annat i appen ändras; du väljer efteråt vad som ska användas.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Avbryt')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmExtraction}>
              {t('addresses.documents.extract.consentConfirm', 'Läs ut')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('addresses.documents.deleteTitle', 'Ta bort dokumentet?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('addresses.documents.deleteBody', {
                name: pendingDelete?.file_name ?? '',
                defaultValue:
                  '"{{name}}" tas bort permanent. Underlag om bostaden kan behövas långt efter en försäljning.',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Avbryt')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              {t('common.delete', 'Ta bort')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
