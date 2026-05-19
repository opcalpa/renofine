import { Trash2, DoorOpen, AlertCircle, Hammer, Handshake, ShoppingCart, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

const UNITS = ["st", "m2", "m", "h", "kg"];

export type QuoteItemSource = "hours" | "subcontractor" | "material" | "fixed" | "missing";

export interface QuoteItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  isRotEligible: boolean;
  roomId?: string;
  comment?: string;
  discountPercent?: number;
  /** Origin type — set during prepopulation to give visual context */
  source?: QuoteItemSource;
  /** Planning task this item was generated from */
  sourceTaskId?: string;
  /** Room name — for display in room-grouped mode */
  roomName?: string;
  /** Section header — rendered as a divider row, not a line item */
  sectionHeader?: string;
  /** Imported from AI source (QuickQuote / Intake). Surfaces a small pill on the row. */
  aiGenerated?: boolean;
}

interface QuoteItemRowProps {
  item: QuoteItem;
  onChange: (id: string, updates: Partial<QuoteItem>) => void;
  onDelete: (id: string) => void;
  onImportRoom: (id: string) => void;
  /** Show the ROT-eligible toggle (Swedish-market only). Defaults true. */
  showRot?: boolean;
}

const SOURCE_STYLES: Record<QuoteItemSource, string> = {
  hours: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  subcontractor: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  material: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  fixed: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  missing: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export function QuoteItemRow({ item, onChange, onDelete, onImportRoom, showRot = true }: QuoteItemRowProps) {
  const { t } = useTranslation();

  // Section header — render as a simple divider
  if (item.sectionHeader) {
    return (
      <div className="flex items-center gap-2 pt-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{item.sectionHeader}</span>
        <div className="flex-1 h-px bg-border" />
        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={() => onDelete(item.id)}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  const lineTotal = item.quantity * item.unitPrice * (1 - (item.discountPercent ?? 0) / 100);
  const isMissing = item.source === "missing";
  // Expand-on-focus: comment textarea stays hidden until the row gets focus,
  // and stays visible while it has content. Removes visual noise when most rows
  // don't carry a comment (the common case).
  const [hasFocus, setHasFocus] = useState(false);
  const showComment = hasFocus || !!(item.comment && item.comment.length > 0);

  return (
    <div
      onFocus={() => setHasFocus(true)}
      onBlur={(e) => {
        // Only collapse when focus leaves the row entirely — moving between
        // inputs within the row keeps the comment expanded.
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setHasFocus(false);
        }
      }}
      className={cn(
        "rounded-lg border bg-card p-4 space-y-3",
        isMissing && "border-red-300 dark:border-red-800"
      )}
    >
      <div className="flex items-center gap-2">
        <Input
          placeholder={t("quotes.description")}
          value={item.description}
          onChange={(e) => onChange(item.id, { description: e.target.value })}
          className="min-h-[48px] flex-1"
        />
        {item.aiGenerated && (
          <Badge
            variant="secondary"
            className="text-xs font-normal shrink-0 h-6 gap-1 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
            title={t("quotes.aiGeneratedHint", "Imported from AI suggestion — review before sending")}
          >
            <Sparkles className="h-3 w-3" />
            {t("quotes.aiGenerated", "AI")}
          </Badge>
        )}
        {item.source && (
          <Badge
            variant="secondary"
            className={cn("text-xs font-normal shrink-0 h-6 gap-1", SOURCE_STYLES[item.source])}
          >
            {item.source === "hours" && <><Hammer className="h-3 w-3" />{t("quotes.sourceHours", "Hours")}</>}
            {item.source === "subcontractor" && <><Handshake className="h-3 w-3" />{t("quotes.sourceSubcontractor", "Subcontractor")}</>}
            {item.source === "material" && <><ShoppingCart className="h-3 w-3" />{t("quotes.sourceMaterial", "Material")}</>}
            {item.source === "fixed" && t("quotes.sourceFixed", "Fixed")}
            {item.source === "missing" && t("quotes.sourceMissing", "No price")}
          </Badge>
        )}
      </div>

      {isMissing && (
        <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {t("quotes.missingPriceHint", "This task has no cost data. Fill in hours/rate on the task first, or set a price here.")}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row">
        <Input
          type="number"
          placeholder={item.source === "hours" ? t("quotes.hoursPlaceholder", "Hours") : t("quotes.quantity")}
          value={item.quantity || ""}
          onChange={(e) => onChange(item.id, { quantity: parseFloat(e.target.value) || 0 })}
          className="min-h-[48px] sm:w-24"
          min={0}
          step="any"
        />
        <Select value={item.unit} onValueChange={(v) => onChange(item.id, { unit: v })}>
          <SelectTrigger className="min-h-[48px] sm:w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UNITS.map((u) => (
              <SelectItem key={u} value={u}>{u}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          placeholder={item.source === "hours" ? t("quotes.hourlyRatePlaceholder", "Rate/h") : t("quotes.unitPrice")}
          value={item.unitPrice || ""}
          onChange={(e) => onChange(item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
          className="min-h-[48px] sm:flex-1"
          min={0}
          step="any"
        />
        <Input
          type="number"
          placeholder={t("quotes.discountPercent", "Discount %")}
          value={item.discountPercent || ""}
          onChange={(e) => onChange(item.id, { discountPercent: parseFloat(e.target.value) || 0 })}
          className="min-h-[48px] sm:w-24"
          min={0}
          max={100}
          step="any"
        />
      </div>

      {showComment && (
        <Input
          placeholder={t("quotes.commentPlaceholder", "Add a note for this line...")}
          value={item.comment || ""}
          onChange={(e) => onChange(item.id, { comment: e.target.value })}
          className="min-h-[40px] text-sm text-muted-foreground"
        />
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-4">
          {item.source !== "material" && showRot && (
            <label className="flex items-center gap-2 min-h-[48px]">
              <Checkbox
                checked={item.isRotEligible}
                onCheckedChange={(checked) => onChange(item.id, { isRotEligible: !!checked })}
              />
              <span className="text-sm">{t("quotes.rotEligible")}</span>
            </label>
          )}
          <span className="text-sm font-medium">
            {lineTotal.toLocaleString("sv-SE", { minimumFractionDigits: 2 })} kr
          </span>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="min-h-[48px] min-w-[48px]" onClick={() => onImportRoom(item.id)} title="Välj rum">
            <DoorOpen className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="min-h-[48px] min-w-[48px] text-destructive" onClick={() => onDelete(item.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
