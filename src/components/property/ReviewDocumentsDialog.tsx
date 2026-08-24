/**
 * Approve before it happens (P3).
 *
 * The app guessed what each document is. This is where the person says yes —
 * or changes it — before anything is saved. That order matters more than the
 * accuracy of the guess: an assistant that files things on its own is one the
 * user has to go back and audit, while one that proposes is one they can let
 * run. Nothing here is written until "Spara" is pressed.
 *
 * Every field stays editable afterwards too (see the list on the address page),
 * so this step is a convenience, never a commitment.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, X, FileText } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  guessCategory,
  wasRecognised,
  PROPERTY_DOC_CATEGORIES,
  type PropertyDocumentCategory,
} from '@/services/propertyDocumentService';

export interface ReviewedDocument {
  file: File;
  displayName: string;
  category: PropertyDocumentCategory;
  /** True when a keyword matched — drives the "guessed" hint, nothing else. */
  guessed: boolean;
}

interface Props {
  files: File[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (documents: ReviewedDocument[]) => void;
  saving: boolean;
}

export function ReviewDocumentsDialog({ files, open, onOpenChange, onConfirm, saving }: Props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ReviewedDocument[]>([]);

  useEffect(() => {
    if (!open) return;
    setRows(
      files.map((file) => {
        const category = guessCategory(file.name);
        return {
          file,
          displayName: file.name,
          category,
          guessed: wasRecognised(category),
        };
      })
    );
  }, [open, files]);

  const patch = (index: number, updates: Partial<ReviewedDocument>) => {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...updates } : row))
    );
  };

  const recognisedCount = rows.filter((r) => r.guessed).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('addresses.documents.review.title', 'Stämmer det här?')}
          </DialogTitle>
          <DialogDescription>
            {recognisedCount > 0
              ? t('addresses.documents.review.guessed', {
                  count: recognisedCount,
                  total: rows.length,
                  defaultValue:
                    'Jag gissade vad {{count}} av {{total}} dokument är utifrån filnamnen. Ändra det som blev fel — inget sparas förrän du säger till.',
                })
              : t(
                  'addresses.documents.review.unknown',
                  'Jag känner inte igen filnamnen, så välj själv vad dokumenten är. Inget sparas förrän du säger till.'
                )}
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-3 py-2">
          {rows.map((row, index) => (
            <li key={`${row.file.name}-${index}`} className="rounded-lg border p-3">
              <div className="flex items-start gap-2">
                <FileText className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                  <Input
                    value={row.displayName}
                    onChange={(e) => patch(index, { displayName: e.target.value })}
                    aria-label={t('addresses.documents.review.nameLabel', 'Namn')}
                  />
                  <Select
                    value={row.category}
                    onValueChange={(value) =>
                      // Once a person has chosen, it is no longer a guess.
                      patch(index, { category: value as PropertyDocumentCategory, guessed: false })
                    }
                  >
                    <SelectTrigger>
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
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  aria-label={t('addresses.documents.review.remove', 'Ta bort ur listan')}
                  onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {row.guessed && (
                <p className="mt-1.5 flex items-center gap-1.5 pl-6 text-xs text-muted-foreground">
                  <Sparkles className="h-3 w-3 text-primary" />
                  {t('addresses.documents.review.guessedFromName', 'Gissat utifrån filnamnet')}
                </p>
              )}
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel', 'Avbryt')}
          </Button>
          <Button onClick={() => onConfirm(rows)} disabled={saving || rows.length === 0}>
            {saving
              ? t('addresses.documents.review.saving', 'Sparar…')
              : t('addresses.documents.review.confirm', {
                  count: rows.length,
                  defaultValue: 'Spara {{count}} dokument',
                })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
