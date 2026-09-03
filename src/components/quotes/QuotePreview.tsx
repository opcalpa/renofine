import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { Eye } from "lucide-react";
import type { QuoteItem } from "./QuoteItemRow";
import { QuoteDocument, type QuoteCompanyInfo } from "./QuoteDocument";
import type { RotCapacity } from "@/lib/rot";

interface QuotePreviewProps {
  open: boolean;
  onClose: () => void;
  projectName: string;
  objectDescription?: string;
  items: QuoteItem[];
  freeText?: string;
  company?: QuoteCompanyInfo;
  clientName?: string;
  quoteNumber?: string | null;
  quoteDate?: string;
  onSend?: () => void;
  rotCapacity?: RotCapacity;
  /** @deprecated use company prop */
  companyName?: string;
  /** @deprecated use company prop */
  companyLogoUrl?: string;
}

export function QuotePreview({
  open,
  onClose,
  projectName,
  objectDescription,
  items,
  freeText,
  company,
  clientName,
  quoteNumber,
  quoteDate,
  onSend,
  rotCapacity,
  companyName,
  companyLogoUrl,
}: QuotePreviewProps) {
  const { t } = useTranslation();

  // Merge legacy props with company object
  const co: QuoteCompanyInfo = {
    ...company,
    name: company?.name || companyName,
    logoUrl: company?.logoUrl || companyLogoUrl,
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="md:max-w-[960px] md:w-[92vw] md:max-h-[94vh] p-0 overflow-hidden flex flex-col">
        <DialogTitle className="sr-only">{t("quotes.preview", "Quote preview")}</DialogTitle>
        {/* Header bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30 flex-shrink-0">
          <Eye className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{t("quotes.preview")}</span>
          <span className="text-xs text-muted-foreground ml-auto">
            {t("quotes.previewHint", "This is how the quote looks to the customer")}
          </span>
        </div>

        {/* Scrollable A4-style document */}
        <div className="flex-1 overflow-y-auto bg-neutral-100 dark:bg-neutral-900 p-3 sm:p-6 md:p-10">
          <QuoteDocument
            projectName={projectName}
            objectDescription={objectDescription}
            items={items}
            freeText={freeText}
            company={co}
            clientName={clientName}
            quoteNumber={quoteNumber}
            quoteDate={quoteDate}
            rotCapacity={rotCapacity}
          />
        </div>

        {/* Sticky action footer */}
        {onSend && (
          <div className="flex-shrink-0 border-t bg-background px-4 py-3">
            <Button className="w-full min-h-[48px]" onClick={onSend}>
              {t("quotes.sendToClient")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
