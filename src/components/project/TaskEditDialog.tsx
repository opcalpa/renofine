import React, { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useMeasurement } from "@/contexts/MeasurementContext";
import { useTaxDeductionVisible } from "@/hooks/useTaxDeduction";
import { supabase } from "@/integrations/supabase/client";
import { MultiRoomSelect } from "@/components/shared/MultiRoomSelect";
import { SupplierAutocomplete } from "@/components/shared/SupplierAutocomplete";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { DatePicker } from "@/components/ui/date-picker";
import { formatCurrency } from "@/lib/currency";
import { parseLocalDate, formatLocalDate } from "@/lib/dateUtils";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Tag, ChevronDown, ChevronRight, Trash2, X, Info, Sparkles, Calculator } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AtaApprovalSection } from "./AtaApprovalSection";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CommentsSection } from "@/components/comments/CommentsSection";
import { EntityPhotoGallery } from "@/components/shared/EntityPhotoGallery";
import { TaskRoomDetails } from "@/components/shared/TaskRoomDetails";
import { TaskFilesList } from "./TaskFilesList";
import { TaskCostTable } from "./TaskCostTable";
import { DEFAULT_COST_CENTERS } from "@/lib/costCenters";
import { useProjectPermissions } from "@/hooks/useProjectPermissions";
import { useContextualTips } from "@/hooks/useContextualTips";
import { TipList } from "@/components/ui/TipCard";
import {
  suggestMaterials,
  suggestMaterialsMultiRoom,
  detectWorkType,
  estimateTaskMultiRoom,
  parseEstimationSettings,
  computeFloorAreaSqm,
  computeWallAreaSqm,
  ALL_WORK_TYPES,
  WORK_TYPE_LABEL_KEYS,
  type WorkType,
  type RecipeEstimationSettings,
  type RecipeRoom,
} from "@/lib/materialRecipes";

interface ChecklistItem {
  id: string;
  title: string;
  completed: boolean;
}

interface Checklist {
  id: string;
  title: string;
  items: ChecklistItem[];
}

interface MaterialItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  amount: number; // computed: quantity × unit_price (kept for backward compat)
  markup_percent: number | null; // null = use group markup
}

const MATERIAL_UNITS_METRIC = ["st", "m²", "L", "kg", "m"] as const;
const MATERIAL_UNITS_IMPERIAL = ["pcs", "sq ft", "gal", "lb", "ft"] as const;

function normalizeMaterialItem(item: Partial<MaterialItem> & { id: string; name: string }): MaterialItem {
  const quantity = item.quantity ?? 1;
  const unit = item.unit ?? "st";
  const unit_price = item.unit_price ?? (item.amount ?? 0);
  return {
    ...item,
    quantity,
    unit,
    unit_price,
    amount: Math.round(quantity * unit_price),
    markup_percent: item.markup_percent ?? null,
  };
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  start_date: string | null;
  finish_date: string | null;
  progress: number;
  assigned_to_stakeholder_id: string | null;
  room_id: string | null;
  room_ids?: string[] | null;
  budget: number | null;
  ordered_amount: number | null;
  payment_status: string | null;
  paid_amount: number | null;
  cost_center: string | null;
  cost_centers?: string[] | null;
  checklists?: Checklist[];
  material_items?: MaterialItem[];
  project_id: string;
  task_cost_type: string | null;
  estimated_hours: number | null;
  hourly_rate: number | null;
  subcontractor_cost: number | null;
  markup_percent: number | null;
  material_estimate: number | null;
  material_markup_percent: number | null;
  labor_cost_percent: number | null;
  is_ata: boolean;
  rot_eligible: boolean;
  rot_amount: number | null;
  supplier_id: string | null;
}

// ---------------------------------------------------------------------------
// Smart Estimate Card — supports all work types (labor + optional material)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Task title — click-to-edit with read mode as default
// ---------------------------------------------------------------------------

function TaskTitleField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => { setDraft(value); }, [value]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onChange(trimmed);
    setEditing(false);
  };

  if (!editing) {
    return (
      <DialogTitle
        className="text-lg font-semibold truncate cursor-pointer hover:text-primary transition-colors py-1"
        onClick={() => setEditing(true)}
        title={t("common.clickToEdit", "Click to edit")}
      >
        {value}
      </DialogTitle>
    );
  }

  return (
    <input
      className="text-lg font-semibold bg-transparent border-0 border-b-2 border-primary focus:outline-none w-full truncate px-0 py-1"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") { setDraft(value); setEditing(false); }
      }}
      autoFocus
    />
  );
}

// ---------------------------------------------------------------------------

interface SmartEstimateCardProps {
  task: Task;
  rooms: { id: string; name: string; dimensions?: RecipeRoom["dimensions"]; ceiling_height_mm?: number | null }[];
  estimationSettings: RecipeEstimationSettings | null;
  onApply: (hours: number, items: MaterialItem[]) => void;
  onSaveDefault?: (key: keyof RecipeEstimationSettings, value: number) => void;
  currency?: string | null;
  t: (key: string, fallback?: string | Record<string, string>) => string;
}

function SmartEstimateCard({ task, rooms, estimationSettings, onApply, onSaveDefault, currency, t }: SmartEstimateCardProps) {
  const ms = useMeasurement();
  const roomIds = (task.room_ids && task.room_ids.length > 0)
    ? task.room_ids
    : task.room_id ? [task.room_id] : [];
  const linkedRooms = roomIds
    .map((id) => rooms.find((r) => r.id === id))
    .filter((r): r is typeof rooms[number] => !!r && !!r.dimensions);

  // Detect work type (or let user pick via cost_center)
  const detectedType = detectWorkType(task);
  const isPainting = detectedType === "painting";
  const [includeCeiling, setIncludeCeiling] = useState(false);
  const result = linkedRooms.length > 0 && detectedType
    ? estimateTaskMultiRoom(task, linkedRooms as RecipeRoom[], estimationSettings ?? undefined, { includeCeiling })
    : null;

  // Local override state
  const [overrideHours, setOverrideHours] = useState<number | null>(null);
  const [overrideUnitPrice, setOverrideUnitPrice] = useState<number | null>(null);
  const [overrideQuantity, setOverrideQuantity] = useState<number | null>(null);
  const [overrideProductivityRate, setOverrideProductivityRate] = useState<number | null>(null);
  const [overrideHourlyRate, setOverrideHourlyRate] = useState<number | null>(null);
  const [overrideCeilingQty, setOverrideCeilingQty] = useState<number | null>(null);
  const [overrideCeilingPrice, setOverrideCeilingPrice] = useState<number | null>(null);
  const [overrideCoats, setOverrideCoats] = useState<number | null>(null);
  const [overrideCoverage, setOverrideCoverage] = useState<number | null>(null);
  const [overrideWaste, setOverrideWaste] = useState<number | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState("");
  const [saveDefaultPrompt, setSaveDefaultPrompt] = useState<{ key: keyof RecipeEstimationSettings; value: number; label: string } | null>(null);

  // Reset overrides when estimation changes
  const prevKey = useRef<string | null>(null);
  useEffect(() => {
    const key = result ? `${result.workType}-${result.totalAreaSqm}-${result.productivityRate}-${includeCeiling}` : null;
    if (key !== prevKey.current) {
      prevKey.current = key;
      setOverrideHours(null);
      setOverrideUnitPrice(null);
      setOverrideQuantity(null);
      setOverrideProductivityRate(null);
      setOverrideHourlyRate(null);
      setOverrideCeilingQty(null);
      setOverrideCeilingPrice(null);
      setOverrideCoats(null);
      setOverrideCoverage(null);
      setOverrideWaste(null);
    }
  }, [result]);

  if (!result) return null;

  const alreadyApplied = !!task.estimated_hours;

  const productivityRate = overrideProductivityRate ?? result.productivityRate;
  const defaultHours = Math.round((result.totalAreaSqm / productivityRate) * 2) / 2;
  const hours = overrideHours ?? defaultHours;
  const hourlyRate = overrideHourlyRate ?? (task.hourly_rate || 0);
  const laborTotal = hours * hourlyRate;

  // Material (only for recipe types)
  const mat = result.material;
  const unitPrice = overrideUnitPrice ?? (mat?.unitPrice ?? 0);

  // Derive quantity from recipe params (coats/coverage for painting, waste for flooring/tiling)
  const coats = overrideCoats ?? (mat?.coats ?? 0);
  const coverage = overrideCoverage ?? (mat?.coverage ?? 0);
  const wasteFactor = overrideWaste ?? (mat?.wasteFactor ?? 0);
  const hasPaintRecipe = mat && mat.coats !== undefined;
  const hasWasteRecipe = mat && mat.wasteFactor !== undefined;
  const derivedQuantity = hasPaintRecipe
    ? Math.ceil((mat.workAreaSqm / coverage) * coats)
    : hasWasteRecipe
      ? Math.round(mat.workAreaSqm * wasteFactor * 10) / 10
      : (mat?.quantity ?? 0);
  const quantity = overrideQuantity ?? derivedQuantity;
  const materialCost = Math.round(quantity * unitPrice);

  // Compute ceiling with overrides
  const ceilingExtra = result?.extraMaterials[0] ?? null;
  const ceilingCoats = overrideCoats ?? (ceilingExtra?.coats ?? 0);
  const ceilingCoverage = overrideCoverage ?? (ceilingExtra?.coverage ?? 0);
  const derivedCeilingQty = ceilingExtra && ceilingExtra.coats !== undefined
    ? Math.ceil((ceilingExtra.workAreaSqm / ceilingCoverage) * ceilingCoats)
    : (ceilingExtra?.quantity ?? 0);
  const ceilingQty = overrideCeilingQty ?? derivedCeilingQty;
  const ceilingPrice = overrideCeilingPrice ?? (ceilingExtra?.unitPrice ?? 0);
  const ceilingCost = Math.round(ceilingQty * ceilingPrice);
  const extraMaterialsCost = ceilingExtra ? ceilingCost : 0;
  const estimatedTotal = laborTotal + materialCost + extraMaterialsCost;

  const areaType = result.areaType;
  const areaFn = areaType === "wall" ? computeWallAreaSqm : computeFloorAreaSqm;
  const areaLabel = areaType === "wall" ? t("planningTasks.wallArea", "wall area") : t("planningTasks.floorArea", "floor area");

  const startEdit = (field: string, currentValue: number) => {
    setEditingField(field);
    setEditBuffer(String(currentValue));
  };

  // Map editable fields to profile estimation_settings keys
  const RATE_KEY_MAP: Record<string, string> = {
    painting: "paint_sqm_per_hour", flooring: "floor_sqm_per_hour", tiling: "tile_sqm_per_hour",
    demolition: "demolition_sqm_per_hour", spackling: "spackling_sqm_per_hour", sanding: "sanding_sqm_per_hour",
    carpentry: "carpentry_sqm_per_hour", electrical: "electrical_sqm_per_hour", plumbing: "plumbing_sqm_per_hour",
  };
  const PRICE_KEY_MAP: Record<string, string> = {
    painting: "paint_price_per_liter", flooring: "floor_price_per_sqm", tiling: "tile_price_per_sqm",
  };

  const fieldToSettingsKey = (field: string): keyof RecipeEstimationSettings | null => {
    if (field === "productivityRate") return (RATE_KEY_MAP[result.workType] ?? null) as keyof RecipeEstimationSettings | null;
    if (field === "unitPrice" || field === "ceilingPrice") return (PRICE_KEY_MAP[result.workType] ?? null) as keyof RecipeEstimationSettings | null;
    if (field === "coverage") return "paint_coverage_sqm_per_liter";
    if (field === "coats") return "paint_coats";
    return null;
  };

  const fieldLabel = (field: string): string => {
    if (field === "productivityRate") return t("estimation.productivityRates", "productivity rate");
    if (field === "unitPrice" || field === "ceilingPrice") return t("estimation.materialPrices", "material price");
    if (field === "coverage") return t("materialRecipes.coverage", "coverage");
    if (field === "coats") return t("materialRecipes.coatsLabel", "coats");
    return field;
  };

  const commitEdit = () => {
    if (!editingField) return;
    const val = parseFloat(editBuffer);
    if (!isNaN(val) && val > 0) {
      if (editingField === "hours") setOverrideHours(val);
      else if (editingField === "unitPrice") setOverrideUnitPrice(val);
      else if (editingField === "quantity") setOverrideQuantity(val);
      else if (editingField === "productivityRate") {
        setOverrideProductivityRate(val);
        setOverrideHours(null);
      }
      else if (editingField === "hourlyRate") setOverrideHourlyRate(val);
      else if (editingField === "ceilingQty") setOverrideCeilingQty(val);
      else if (editingField === "ceilingPrice") setOverrideCeilingPrice(val);
      else if (editingField === "coats") { setOverrideCoats(val); setOverrideQuantity(null); setOverrideCeilingQty(null); }
      else if (editingField === "coverage") { setOverrideCoverage(val); setOverrideQuantity(null); setOverrideCeilingQty(null); }
      else if (editingField === "wasteFactor") { setOverrideWaste(val); setOverrideQuantity(null); }

      // Prompt to save as default for profile-linked fields
      const settingsKey = fieldToSettingsKey(editingField);
      if (settingsKey && onSaveDefault) {
        setSaveDefaultPrompt({ key: settingsKey, value: val, label: fieldLabel(editingField) });
      }
    } else if (!isNaN(val) && val === 0) {
      if (editingField === "quantity") setOverrideQuantity(val);
      else if (editingField === "unitPrice") setOverrideUnitPrice(val);
      else if (editingField === "hourlyRate") setOverrideHourlyRate(val);
      else if (editingField === "ceilingQty") setOverrideCeilingQty(val);
      else if (editingField === "ceilingPrice") setOverrideCeilingPrice(val);
    }
    setEditingField(null);
  };

  const renderEditable = (field: string, value: number, suffix: string) => {
    if (editingField === field) {
      return (
        <input
          autoFocus
          type="number"
          step={field === "hours" || field === "productivityRate" ? "0.5" : "1"}
          min="0"
          className="w-16 h-5 text-xs text-right font-semibold bg-white border rounded px-1 tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          value={editBuffer}
          onChange={(e) => setEditBuffer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") setEditingField(null);
          }}
          onBlur={commitEdit}
        />
      );
    }
    const isOverridden =
      (field === "hours" && overrideHours !== null) ||
      (field === "unitPrice" && overrideUnitPrice !== null) ||
      (field === "quantity" && overrideQuantity !== null) ||
      (field === "productivityRate" && overrideProductivityRate !== null) ||
      (field === "hourlyRate" && overrideHourlyRate !== null) ||
      (field === "ceilingQty" && overrideCeilingQty !== null) ||
      (field === "ceilingPrice" && overrideCeilingPrice !== null) ||
      (field === "coats" && overrideCoats !== null) ||
      (field === "coverage" && overrideCoverage !== null) ||
      (field === "wasteFactor" && overrideWaste !== null);

    return (
      <button
        type="button"
        className={`font-semibold cursor-pointer rounded px-0.5 -mx-0.5 transition-colors underline decoration-dotted underline-offset-2 ${isOverridden ? "text-primary decoration-primary/40" : "text-green-700 decoration-green-700/40 hover:text-green-800 hover:decoration-green-800/60"}`}
        onClick={() => startEdit(field, value)}
        title={t("materialRecipes.clickToEdit", "Click to adjust")}
      >
        {field === "unitPrice" || field === "quantity" || field === "hourlyRate"
          ? value.toLocaleString("sv-SE")
          : value}{suffix}
      </button>
    );
  };

  // Per-room breakdown data
  const roomBreakdown = linkedRooms.map((room) => {
    const area = areaFn(room as RecipeRoom);
    const roomHours = area ? Math.round((area / productivityRate) * 2) / 2 : 0;
    return { name: room.name, area: area ?? 0, hours: roomHours };
  });

  return (
    <Collapsible defaultOpen={!alreadyApplied}>
      <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-1">
        <div className="flex items-center justify-between">
          <CollapsibleTrigger className="flex items-center gap-1.5 group">
            <ChevronRight className="h-3.5 w-3.5 text-primary/60 transition-transform group-data-[state=open]:rotate-90" />
            <span className="text-xs font-medium text-primary flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              {t(WORK_TYPE_LABEL_KEYS[result.workType], result.workType)}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums ml-1">
              {hours}h{estimatedTotal > 0 ? ` · ${estimatedTotal.toLocaleString("sv-SE")} SEK` : ""}
            </span>
          </CollapsibleTrigger>
          <Button
            type="button" variant="default" size="sm" className="h-7 text-xs gap-1.5"
            onClick={() => {
              const items: MaterialItem[] = [];
              if (mat) {
                items.push({
                  id: crypto.randomUUID(),
                  name: t(mat.nameKey, mat.nameFallback),
                  quantity,
                  unit: mat.unit,
                  unit_price: unitPrice,
                  amount: materialCost,
                  markup_percent: null,
                });
              }
              if (ceilingExtra) {
                items.push({
                  id: crypto.randomUUID(),
                  name: t(ceilingExtra.nameKey, ceilingExtra.nameFallback),
                  quantity: ceilingQty,
                  unit: ceilingExtra.unit,
                  unit_price: ceilingPrice,
                  amount: ceilingCost,
                  markup_percent: null,
                });
              }
              onApply(hours, items);
            }}
          >
            {alreadyApplied
              ? t("materialRecipes.reApplyEstimate", "Re-apply")
              : t("materialRecipes.applyEstimate", "Apply estimate")}
          </Button>
        </div>

        <CollapsibleContent className="space-y-3 pt-2">
          {/* Ceiling toggle — only for painting */}
          {isPainting && linkedRooms.length > 0 && (
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={includeCeiling} onCheckedChange={(v) => setIncludeCeiling(!!v)} />
              <span className="text-xs">{t("materialRecipes.includeCeiling", "Include ceiling")}</span>
            </label>
          )}

          {/* Room breakdown mini-table */}
          {linkedRooms.length > 1 && (
            <div className="rounded border bg-white/50 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left font-medium text-muted-foreground px-2 py-1">{t("tasks.room", "Room")}</th>
                    <th className="text-right font-medium text-muted-foreground px-2 py-1">{areaLabel}</th>
                    <th className="text-right font-medium text-muted-foreground px-2 py-1">{t("taskCost.estimatedHours", "Hours")}</th>
                  </tr>
                </thead>
                <tbody>
                  {roomBreakdown.map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-2 py-1">{r.name}</td>
                      <td className="text-right px-2 py-1 tabular-nums">{r.area.toFixed(1)} m²</td>
                      <td className="text-right px-2 py-1 tabular-nums">{r.hours}h</td>
                    </tr>
                  ))}
                  <tr className="font-medium bg-muted/20">
                    <td className="px-2 py-1">{t("common.total", "Total")}</td>
                    <td className="text-right px-2 py-1 tabular-nums">{result.totalAreaSqm} m²</td>
                    <td className="text-right px-2 py-1 tabular-nums">{hours}h</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Formula breakdown — Hours, then material */}
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs tabular-nums">
            {/* --- HOURS --- */}
            <span className="text-muted-foreground">{t("taskCost.estimatedHours", "Hours")}:</span>
            <span className="text-right">
              {ms.isImperial ? (result.totalAreaSqm * 10.7639).toFixed(1) : result.totalAreaSqm} {ms.areaLabel} ÷ {renderEditable("productivityRate", productivityRate, ` ${ms.areaLabel}/h`)} = {renderEditable("hours", hours, "h")}
              {hourlyRate > 0 && (
                <span className="text-muted-foreground ml-2">
                  ({t("materialRecipes.hourlyRate", "hourly rate")}: {renderEditable("hourlyRate", hourlyRate, " SEK/h")})
                </span>
              )}
            </span>

            {/* --- MATERIAL SECTION --- */}
            {mat && (
              <>
                {/* Material quantity derivation */}
                <span className="text-muted-foreground border-t pt-1 mt-1">{t("materialRecipes.materialQty", "Quantity")}:</span>
                <span className="text-right border-t pt-1 mt-1">
                  {hasPaintRecipe ? (
                    <>
                      {ms.isImperial ? (mat.workAreaSqm * 10.7639).toFixed(1) : mat.workAreaSqm.toFixed(1)} {ms.areaLabel} ÷ {renderEditable("coverage", coverage, ms.isImperial ? " sq ft/gal" : " m²/L")} × {renderEditable("coats", coats, ` ${t("materialRecipes.coats", "coats")}`)} = {renderEditable("quantity", quantity, mat.unit)}
                    </>
                  ) : hasWasteRecipe ? (
                    <>
                      {mat.workAreaSqm.toFixed(1)} m² × {renderEditable("wasteFactor", wasteFactor, "")} = {renderEditable("quantity", quantity, ` ${mat.unit}`)}
                    </>
                  ) : (
                    <>{renderEditable("quantity", quantity, ` ${mat.unit}`)}</>
                  )}
                </span>
                {/* Material cost */}
                <span className="text-muted-foreground">{t(mat.nameKey, mat.nameFallback)}:</span>
                <span className="text-right">
                  {renderEditable("quantity", quantity, mat.unit)} × {renderEditable("unitPrice", unitPrice, ` SEK/${mat.unit}`)} = <strong>{materialCost.toLocaleString("sv-SE")} SEK</strong>
                </span>
              </>
            )}
            {!mat && result.extraMaterials.length === 0 && (
              <>
                <span className="text-muted-foreground border-t pt-1 mt-1">{t("planningTasks.estMaterial", "Material")}:</span>
                <span className="text-right text-amber-600 text-[11px] border-t pt-1 mt-1">
                  {t("planningTasks.estNoMaterial", "Add manually or via subcontractor quote")}
                </span>
              </>
            )}
            {/* Ceiling paint */}
            {ceilingExtra && (
              <>
                <span className="text-muted-foreground">{t("materialRecipes.ceilingQty", "Ceiling qty")}:</span>
                <span className="text-right">
                  {ms.isImperial ? (ceilingExtra.workAreaSqm * 10.7639).toFixed(1) : ceilingExtra.workAreaSqm.toFixed(1)} {ms.areaLabel} ÷ {renderEditable("coverage", coverage, ms.isImperial ? " sq ft/gal" : " m²/L")} × {renderEditable("coats", coats, ` ${t("materialRecipes.coats", "coats")}`)} = {renderEditable("ceilingQty", ceilingQty, ceilingExtra.unit)}
                </span>
                <span className="text-muted-foreground">{t(ceilingExtra.nameKey, ceilingExtra.nameFallback)}:</span>
                <span className="text-right">
                  {renderEditable("ceilingQty", ceilingQty, ceilingExtra.unit)} × {renderEditable("ceilingPrice", ceilingPrice, ` SEK/${ceilingExtra.unit}`)} = <strong>{ceilingCost.toLocaleString("sv-SE")} SEK</strong>
                </span>
              </>
            )}

            {/* --- TOTAL --- */}
            <span className="text-muted-foreground font-medium border-t pt-1 mt-1">{t("materialRecipes.estimatedTotal", "Estimated total")} <span className="font-normal text-[10px]">({t("estimation.exMomsShort", "ex moms")})</span>:</span>
            <span className="text-right font-semibold border-t pt-1 mt-1">{estimatedTotal.toLocaleString("sv-SE")} SEK</span>
          </div>
          {/* Save-as-default prompt for profile-linked values */}
          {saveDefaultPrompt && (
            <div className="flex items-center gap-2 text-xs bg-blue-50 border border-blue-200 rounded px-2.5 py-1.5 animate-in fade-in slide-in-from-top-1">
              <span className="text-blue-800 flex-1">
                {t("materialRecipes.saveAsDefault", "Save as new default in profile?")}
              </span>
              <button
                type="button"
                className="text-blue-700 font-medium hover:text-blue-900 underline underline-offset-2"
                onClick={() => {
                  onSaveDefault?.(saveDefaultPrompt.key, saveDefaultPrompt.value);
                  setSaveDefaultPrompt(null);
                }}
              >
                {t("common.save", "Save")}
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setSaveDefaultPrompt(null)}
              >
                {t("materialRecipes.onlyThisTask", "Only this task")}
              </button>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground/60">{t("materialRecipes.clickToEdit", "Click bold values to adjust before applying")}</p>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------

/** Wrapper that renders either a Dialog (modal) or Sheet (right drawer) with the same header */
function TaskEditWrapper({ variant, open, onOpenChange, title, onTitleChange, t, children }: {
  variant: "dialog" | "sheet";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  onTitleChange?: (title: string) => void;
  t: (key: string, fallback?: string) => string;
  children: React.ReactNode;
}) {
  const header = title && onTitleChange ? (
    <TaskTitleField value={title} onChange={onTitleChange} />
  ) : null;

  if (variant === "sheet") {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-xl lg:max-w-2xl p-0 flex flex-col overflow-hidden">
          <SheetHeader className="flex-shrink-0 px-6 pt-5 pb-3 border-b bg-gradient-to-b from-background to-muted/20">
            {header || <SheetTitle className="truncate">{t("tasks.editTask")}</SheetTitle>}
            <SheetDescription className="sr-only">{t("tasks.editTaskDescription", "Edit task details")}</SheetDescription>
          </SheetHeader>
          {children}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl lg:max-w-5xl max-h-[90vh] h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="flex-shrink-0 px-6 pt-5 pb-3 border-b bg-gradient-to-b from-background to-muted/20">
          {header || <DialogTitle className="truncate">{t("tasks.editTask")}</DialogTitle>}
          <DialogDescription className="sr-only">{t("tasks.editTaskDescription", "Edit task details")}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

interface TaskEditDialogProps {
  taskId: string | null;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  currency?: string | null;
  projectStatus?: string | null;
  variant?: "dialog" | "sheet";
}

export const TaskEditDialog = ({
  taskId,
  projectId,
  open,
  onOpenChange,
  onSaved,
  currency,
  projectStatus,
  variant = "dialog",
}: TaskEditDialogProps) => {
  const isPlanning = projectStatus === "planning";
  const { t } = useTranslation();
  const { toast } = useToast();
  const ms = useMeasurement();
  const { showTaxDeduction } = useTaxDeductionVisible();
  const permissions = useProjectPermissions(projectId);
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingBudgetField, setEditingBudgetField] = useState<"labor" | "material" | null>(null);
  const [rooms, setRooms] = useState<{ id: string; name: string; dimensions?: RecipeRoom["dimensions"]; ceiling_height_mm?: number | null }[]>([]);
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string; role?: string }[]>([]);
  const [customCostCenters, setCustomCostCenters] = useState<string[]>([]);
  const [showCustomCostCenter, setShowCustomCostCenter] = useState(false);
  const [generatingChecklist, setGeneratingChecklist] = useState(false);
  const [customCostCenterValue, setCustomCostCenterValue] = useState("");
  const [perRowMarkup, setPerRowMarkup] = useState(false);
  const [rotSubsidyPercent, setRotSubsidyPercent] = useState(30);
  const [rotMaxPerPerson, setRotMaxPerPerson] = useState(50000);
  const [profileDefaultRate, setProfileDefaultRate] = useState<number | null>(null);
  const [photoCount, setPhotoCount] = useState(0);
  const [profileLaborCostPercent, setProfileLaborCostPercent] = useState<number | null>(null);
  const [userType, setUserType] = useState<string | null>(null);
  const [taskProfileId, setTaskProfileId] = useState<string | null>(null);
  const [taskSuppliers, setTaskSuppliers] = useState<{ id: string; name: string }[]>([]);
  const isBuilder = permissions.isOwner && userType !== "homeowner";
  const isHomeowner = userType === "homeowner";
  const hasAutoFilledRef = useRef(false);
  const [materialSpent, setMaterialSpent] = useState(0);
  const [estimationSettings, setEstimationSettings] = useState<RecipeEstimationSettings | null>(null);
  const [dependencies, setDependencies] = useState<{ id: string; depends_on_task_id: string; title: string; status: string; finish_date: string | null }[]>([]);
  const [allProjectTasks, setAllProjectTasks] = useState<{ id: string; title: string; status: string; finish_date: string | null }[]>([]);

  // Room IDs for room details section
  const taskRoomIds = task
    ? (task.room_ids && task.room_ids.length > 0 ? task.room_ids : task.room_id ? [task.room_id] : [])
    : [];

  // Contextual tips based on task title, work type, room, etc.
  const taskTipContext = React.useMemo(() => ({
    taskTitle: task?.title || undefined,
    workType: task ? detectWorkType(task) ?? undefined : undefined,
    costCenter: task?.cost_center || undefined,
    projectStatus: projectStatus || undefined,
    userRole: isBuilder ? "contractor" as const : "homeowner" as const,
  }), [task?.title, task?.cost_center, projectStatus, isBuilder]);
  const { tips: taskTips, dismiss: dismissTip } = useContextualTips(taskTipContext);

  const fetchTask = useCallback(async () => {
    if (!taskId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", taskId)
        .single();

      if (error) throw error;

      // Fetch linked materials for this task
      const { data: linkedMaterials } = await supabase
        .from("materials")
        .select("id, name, quantity, unit, price_per_unit, price_total, markup_percent, status, exclude_from_budget")
        .eq("task_id", taskId);

      // Split into planned items (editable in pricing) vs actual spend
      const allMaterials = linkedMaterials || [];
      const plannedItems: MaterialItem[] = allMaterials
        .filter((m) => m.status === "planned")
        .map((m) => ({
          id: m.id,
          name: m.name,
          quantity: m.quantity ?? 1,
          unit: m.unit ?? "st",
          unit_price: m.price_per_unit ?? (m.price_total ?? 0),
          amount: m.price_total ?? Math.round((m.quantity ?? 1) * (m.price_per_unit ?? 0)),
          markup_percent: m.markup_percent ?? null,
        }));

      // Materials table is the source of truth. Clear JSONB to avoid stale data showing.
      data.material_items = plannedItems.length > 0 ? plannedItems : undefined;

      setTask(data);

      // Quick photo count for header badge
      supabase
        .from("photos")
        .select("id", { count: "exact", head: true })
        .eq("linked_to_type", "task")
        .eq("linked_to_id", data.id)
        .then(({ count }) => setPhotoCount(count || 0));

      // Material spend = non-planned materials linked to this task
      const actualSpend = allMaterials
        .filter((m) => m.status !== "planned" && !m.exclude_from_budget)
        .reduce((sum, m) => sum + (m.price_total ?? ((m.quantity || 0) * (m.price_per_unit || 0))), 0);
      setMaterialSpent(actualSpend);

      // Detect per-row markup mode from loaded data
      setPerRowMarkup(plannedItems.length > 0 && plannedItems.some((i: MaterialItem) => (i.markup_percent ?? null) !== null));

      // Extract custom cost centers from task
      const existingCenters = data.cost_centers || [];
      const defaultIds = DEFAULT_COST_CENTERS.map((cc) => cc.id);
      const custom = existingCenters.filter((c: string) => !defaultIds.includes(c));
      setCustomCostCenters(custom);

      // Fetch dependencies (what this task depends on)
      const { data: deps } = await supabase
        .from("task_dependencies")
        .select("id, depends_on_task_id")
        .eq("task_id", taskId);

      // Fetch all project tasks for the dependency picker
      const { data: projTasks } = await supabase
        .from("tasks")
        .select("id, title, status, finish_date")
        .eq("project_id", projectId)
        .neq("id", taskId);

      const taskList = projTasks || [];
      setAllProjectTasks(taskList);

      // Enrich dependencies with task info
      const enrichedDeps = (deps || []).map(d => {
        const depTask = taskList.find(t => t.id === d.depends_on_task_id);
        return {
          id: d.id,
          depends_on_task_id: d.depends_on_task_id,
          title: depTask?.title || "Unknown",
          status: depTask?.status || "to_do",
          finish_date: depTask?.finish_date || null,
        };
      });
      setDependencies(enrichedDeps);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to load task";
      toast({ title: t("common.error"), description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [taskId, toast, t]);

  const fetchSupportingData = useCallback(async () => {
    try {
      // Fetch rooms
      const { data: roomsData } = await supabase
        .from("rooms")
        .select("id, name, dimensions, ceiling_height_mm")
        .eq("project_id", projectId)
        .order("name");
      setRooms(roomsData || []);

      // Fetch team members in two steps (no FK relationship)
      const { data: sharesData } = await supabase
        .from("project_shares")
        .select("shared_with_user_id")
        .eq("project_id", projectId);

      const profileIds = (sharesData || [])
        .map((s) => s.shared_with_user_id)
        .filter((id): id is string => id != null);

      if (profileIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, name")
          .in("id", profileIds);

        setTeamMembers(
          (profilesData || [])
            .filter((p) => p.name)
            .map((p) => ({ id: p.id, name: p.name }))
        );
      } else {
        setTeamMembers([]);
      }
    } catch (error) {
      console.error("Failed to fetch supporting data:", error);
    }
  }, [projectId]);

  const fetchProfileDefault = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("default_hourly_rate, default_labor_cost_percent, estimation_settings, onboarding_user_type")
        .eq("user_id", user.id)
        .single();
      setProfileDefaultRate(data?.default_hourly_rate ?? null);
      setProfileLaborCostPercent(data?.default_labor_cost_percent ?? null);
      setUserType(data?.onboarding_user_type ?? null);
      // Fetch profile id + suppliers for autocomplete
      const { data: prof } = await supabase.from("profiles").select("id").eq("user_id", user.id).single();
      if (prof) {
        setTaskProfileId(prof.id);
        const { data: suppData } = await supabase.from("suppliers").select("id, name").eq("profile_id", prof.id).order("name");
        setTaskSuppliers(suppData || []);
      }
      if (data?.estimation_settings) {
        setEstimationSettings(
          parseEstimationSettings(data.estimation_settings as Record<string, unknown>)
        );
      }
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    if (open && taskId) {
      fetchTask();
      fetchSupportingData();
      fetchProfileDefault();
      // Fetch current ROT rate
      const today = new Date().toISOString().slice(0, 10);
      supabase
        .from("rot_yearly_limits")
        .select("subsidy_percent, max_amount_per_person")
        .lte("valid_from", today)
        .gte("valid_until", today)
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setRotSubsidyPercent(data.subsidy_percent);
            setRotMaxPerPerson(data.max_amount_per_person);
          }
        });
    }
    if (!open) {
      hasAutoFilledRef.current = false;
    }
  }, [open, taskId, fetchTask, fetchSupportingData, fetchProfileDefault]);

  // Auto-fill hourly rate from profile default during planning
  useEffect(() => {
    if (
      isPlanning &&
      task &&
      task.hourly_rate == null &&
      profileDefaultRate != null &&
      !hasAutoFilledRef.current
    ) {
      hasAutoFilledRef.current = true;
      const hours = task.estimated_hours || 0;
      const labor = hours * profileDefaultRate;
      const ue = (task.subcontractor_cost || 0) * (1 + (task.markup_percent || 0) / 100);
      const matItems = task.material_items || [];
      const matBase = matItems.length > 0
        ? matItems.reduce((sum, i) => sum + (i.amount || 0), 0)
        : (task.material_estimate || 0);
      const mat = matBase * (1 + (task.material_markup_percent || 0) / 100);
      const budget = labor + ue + mat || null;
      setTask({ ...task, hourly_rate: profileDefaultRate, budget });
    }
  }, [isPlanning, task, profileDefaultRate]);

  // Sync material items → materials table (status: "planned")
  // Called immediately on SmartEstimate apply AND on save as fallback.
  const syncPlannedMaterials = React.useCallback(async (items: MaterialItem[], taskId: string, projectId: string) => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;
    const { data: matProfile } = await supabase.from("profiles").select("id").eq("user_id", authUser.id).single();
    const profileId = matProfile?.id;
    if (!profileId) return;

    const { data: existingPlanned } = await supabase
      .from("materials").select("id").eq("task_id", taskId).eq("status", "planned");
    const existingIds = new Set((existingPlanned || []).map((m) => m.id));
    const currentIds = new Set(items.map((i) => i.id));
    const toDelete = [...existingIds].filter((id) => !currentIds.has(id));

    if (toDelete.length > 0) {
      await supabase.from("materials").delete().in("id", toDelete);
    }

    for (const item of items) {
      const row = {
        id: item.id,
        name: item.name || t("taskCost.material", "Material"),
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
        price_per_unit: item.unit_price ?? null,
        price_total: item.amount ?? null,
        markup_percent: item.markup_percent ?? null,
        task_id: taskId,
        project_id: projectId,
        status: "planned",
        exclude_from_budget: false,
        created_by_user_id: profileId,
      };
      const { error } = await supabase
        .from("materials")
        .upsert(row, { onConflict: "id" });
      if (error) {
        console.error("Material upsert failed:", error.message, error.details, row);
        toast({ title: t("common.error"), description: `Material: ${error.message}`, variant: "destructive" });
      }
    }
  }, [t, toast]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task) return;

    setSaving(true);
    try {
      // Build update payload — only include cost fields if they exist on the DB
      // (i.e. the migration has been applied and select("*") returned them)
      const payload: Record<string, unknown> = {
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        start_date: task.start_date || null,
        finish_date: task.finish_date || null,
        room_id: task.room_id || null,
        room_ids: task.room_ids || [],
        progress: task.progress,
        assigned_to_stakeholder_id: task.assigned_to_stakeholder_id || null,
        budget: task.budget ? Math.round(task.budget) : null,
        ordered_amount: task.ordered_amount || null,
        payment_status: task.payment_status || null,
        paid_amount: task.paid_amount || null,
        cost_center: task.cost_center || null,
        cost_centers: task.cost_centers || null,
        checklists: task.checklists || [],
      };

      // Cost estimation fields — only include if the column existed when we fetched
      if ("task_cost_type" in task) {
        payload.task_cost_type = task.task_cost_type || "own_labor";
        payload.estimated_hours = task.estimated_hours || null;
        payload.hourly_rate = task.hourly_rate || null;
        payload.subcontractor_cost = task.subcontractor_cost || null;
        payload.markup_percent = task.markup_percent ?? 0;
        payload.material_estimate = task.material_estimate || null;
        payload.material_markup_percent = task.material_markup_percent ?? 0;
      }

      // Labor cost percent — only include if the column existed when we fetched
      if ("labor_cost_percent" in task) {
        payload.labor_cost_percent = task.labor_cost_percent;
      }

      // material_items JSONB is no longer written — materials table is the source of truth.

      // ÄTA field — only include if the column existed when we fetched
      if ("is_ata" in task) {
        payload.is_ata = task.is_ata;
      }

      // Supplier
      if ("supplier_id" in task) {
        payload.supplier_id = task.supplier_id || null;
      }

      // ROT fields
      if ("rot_eligible" in task) {
        payload.rot_eligible = task.rot_eligible;
        payload.rot_amount = task.rot_amount || null;
      }

      const { error } = await supabase
        .from("tasks")
        .update(payload)
        .eq("id", task.id);

      if (error) throw error;

      // Sync material items → materials table (fallback for any manual edits since last apply)
      const items: MaterialItem[] = task.material_items || [];
      if (items.length > 0) {
        await syncPlannedMaterials(items, task.id, task.project_id);
      }

      toast({
        title: t("common.success"),
        description: t("tasks.taskUpdatedDescription"),
      });

      // Offer to save hourly rate as profile default if none set yet
      if (
        task.hourly_rate &&
        task.hourly_rate > 0 &&
        profileDefaultRate == null
      ) {
        toast({
          description: t("taskCost.saveAsDefault"),
          action: (
            <ToastAction
              altText={t("common.save")}
              onClick={async () => {
                const { data: { user: currentUser } } = await supabase.auth.getUser();
                if (!currentUser) return;
                const { error: profileError } = await supabase
                  .from("profiles")
                  .update({ default_hourly_rate: task.hourly_rate })
                  .eq("user_id", currentUser.id);
                if (!profileError) {
                  setProfileDefaultRate(task.hourly_rate);
                  toast({
                    description: t("taskCost.rateSavedToProfile"),
                  });
                }
              }}
            >
              {t("common.save")}
            </ToastAction>
          ),
        });
      }

      onOpenChange(false);
      onSaved?.();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to update";
      toast({ title: t("common.error"), description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const updateChecklist = (clIdx: number, updates: Partial<Checklist>) => {
    if (!task) return;
    const updated = [...(task.checklists || [])];
    updated[clIdx] = { ...updated[clIdx], ...updates };
    setTask({ ...task, checklists: updated });
  };

  const deleteChecklist = (clIdx: number) => {
    if (!task) return;
    const updated = (task.checklists || []).filter((_, i) => i !== clIdx);
    setTask({ ...task, checklists: updated });
  };

  const handleGenerateChecklist = async () => {
    if (!task || !task.room_id) return;
    setGeneratingChecklist(true);
    try {
      // Fetch room specs
      const { data: roomData } = await supabase
        .from("rooms")
        .select("name, wall_spec, floor_spec, ceiling_spec, joinery_spec, dimensions")
        .eq("id", task.room_id)
        .single();

      if (!roomData) throw new Error("Room not found");

      const { data: result, error } = await supabase.functions.invoke("generate-work-checklist", {
        body: {
          taskTitle: task.title,
          taskDescription: task.description,
          roomName: roomData.name,
          wallSpec: roomData.wall_spec,
          floorSpec: roomData.floor_spec,
          ceilingSpec: roomData.ceiling_spec,
          joinerySpec: roomData.joinery_spec,
          dimensions: roomData.dimensions,
        },
      });

      if (error) throw error;
      if (result?.checklist) {
        setTask({ ...task, checklists: [...(task.checklists || []), result.checklist] });
        toast({ description: t("tasks.checklistGenerated", "Checklist generated from room specs") });
      }
    } catch (err) {
      console.error("Generate checklist failed:", err);
      toast({ title: t("common.error"), description: String(err), variant: "destructive" });
    } finally {
      setGeneratingChecklist(false);
    }
  };

  return (
    <TaskEditWrapper variant={variant} open={open} onOpenChange={onOpenChange} title={task?.title} onTitleChange={task ? (title: string) => setTask({ ...task, title }) : undefined} t={t}>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : task ? (
          <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
            <div className="space-y-5 overflow-y-auto flex-1 py-5 px-6 bg-gradient-to-b from-muted/30 to-muted/10">
              {/* Contextual tips based on task title */}
              {taskTips.length > 0 && (
                <TipList tips={taskTips} onDismiss={dismissTip} maxTips={1} compact />
              )}

              <div className="space-y-2 rounded-xl border border-border/60 bg-background p-4 shadow-sm">
                <Label htmlFor="edit-task-description" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("tasks.description")}</Label>
                <Textarea
                  id="edit-task-description"
                  value={task.description || ""}
                  onChange={(e) => setTask({ ...task, description: e.target.value })}
                  rows={2}
                  className="rounded-lg"
                />
              </div>

              {/* Room selector — multi-select during planning */}
              {isPlanning && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    {t("tasks.room")}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[220px]">
                          <p className="text-xs">{t("tasks.roomTooltip")}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start font-normal text-sm h-10 bg-white dark:bg-background border-border/40 hover:border-primary/30">
                        {(() => {
                          const ids = task.room_ids || (task.room_id ? [task.room_id] : []);
                          if (ids.length === 0) return <span className="text-muted-foreground">{t("tasks.noRoom")}</span>;
                          const names = ids.map((id) => rooms.find((r) => r.id === id)?.name).filter(Boolean);
                          return names.join(", ");
                        })()}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-1" align="start">
                      <div className="space-y-0.5">
                        {rooms.map((room) => {
                          const ids = task.room_ids || (task.room_id ? [task.room_id] : []);
                          const checked = ids.includes(room.id);
                          return (
                            <label
                              key={room.id}
                              className="flex items-center gap-2 w-full text-sm px-2 py-1.5 rounded hover:bg-muted cursor-pointer"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => {
                                  const next = checked
                                    ? ids.filter((id) => id !== room.id)
                                    : [...ids, room.id];
                                  setTask({ ...task, room_ids: next, room_id: next[0] || null });
                                }}
                              />
                              {room.name}
                            </label>
                          );
                        })}
                        {rooms.length === 0 && (
                          <p className="text-xs text-muted-foreground px-2 py-1.5">{t("planningTasks.noRoomsYet", "No rooms created yet")}</p>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              {/* ── Property Grid — Status, Room, Dates ── */}
              {!isPlanning && (
              <div className="rounded-xl border border-border/60 bg-background p-4 shadow-sm space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{t("tasks.status")}</Label>
                    {(() => {
                      const unresolvedDeps = dependencies.filter(d => d.status !== "completed");
                      const blockedStatuses = ["in_progress", "completed"];
                      const isBlocked = unresolvedDeps.length > 0;
                      const handleStatusChange = (value: string) => {
                        if (isBlocked && blockedStatuses.includes(value)) {
                          toast({ title: t("tasks.depBlockedTitle", "Dependencies not completed"), description: `${unresolvedDeps.map(d => d.title).join(", ")} — ${t("tasks.depOverrideHint", "status changed anyway")}` });
                        }
                        setTask({ ...task, status: value });
                      };
                      return (
                        <Select value={task.status} onValueChange={handleStatusChange}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="planned">{t("statuses.planned", "Planned")}</SelectItem>
                            <SelectItem value="to_do">{t("statuses.toDo")}</SelectItem>
                            <SelectItem value="in_progress">{t("statuses.inProgress")}{isBlocked && " ⚠️"}</SelectItem>
                            <SelectItem value="waiting">{t("statuses.waiting")}</SelectItem>
                            <SelectItem value="awaiting_review">{t("statuses.awaitingReview", "Awaiting review")}</SelectItem>
                            <SelectItem value="completed">{t("statuses.completed")}{isBlocked && " ⚠️"}</SelectItem>
                            <SelectItem value="cancelled">{t("statuses.cancelled")}</SelectItem>
                          </SelectContent>
                        </Select>
                      );
                    })()}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{t("tasks.priority")}</Label>
                    <Select value={task.priority} onValueChange={(value) => setTask({ ...task, priority: value })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">{t("tasks.priorityLow")}</SelectItem>
                        <SelectItem value="medium">{t("tasks.priorityMedium")}</SelectItem>
                        <SelectItem value="high">{t("tasks.priorityHigh")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{t("tasks.assignTo")}</Label>
                    <Select value={task.assigned_to_stakeholder_id || "unassigned"} onValueChange={(value) => setTask({ ...task, assigned_to_stakeholder_id: value === "unassigned" ? null : value })}>
                      <SelectTrigger className="h-9"><SelectValue placeholder={t("common.unassigned")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">{t("common.unassigned")}</SelectItem>
                        {teamMembers.map((member) => (
                          <SelectItem key={member.id} value={member.id}>{member.name} {member.role ? `(${member.role})` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{t("tasks.room")}</Label>
                    <MultiRoomSelect rooms={rooms} selectedIds={task.room_ids?.length ? task.room_ids : (task.room_id ? [task.room_id] : [])} onChange={(ids) => setTask({ ...task, room_ids: ids, room_id: ids[0] || null })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{t("tasks.costCenter")}</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full h-9 justify-start text-sm font-normal">
                          {(task.cost_centers || []).length > 0
                            ? (task.cost_centers || []).map((cc: string) => { const def = DEFAULT_COST_CENTERS.find(d => d.id === cc); return def ? t(def.labelKey, def.label) : cc; }).join(", ")
                            : <span className="text-muted-foreground">{t("common.none", "Ingen")}</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-2 max-h-[60vh] overflow-y-auto" align="start" style={{ overflowY: "auto" }}>
                        {DEFAULT_COST_CENTERS.map((cc) => { const Icon = cc.icon; const isSelected = (task.cost_centers || []).includes(cc.id); return (
                          <label key={cc.id} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted cursor-pointer text-xs">
                            <Checkbox checked={isSelected} onCheckedChange={(checked) => { const current = task.cost_centers || []; const next = checked ? [...current, cc.id] : current.filter((c: string) => c !== cc.id); setTask({ ...task, cost_centers: next, cost_center: next[0] || null }); }} />
                            <Icon className="h-3.5 w-3.5" /> {t(cc.labelKey, cc.label)}
                          </label>
                        ); })}
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{t("tasks.startDate")}</Label>
                    <DatePicker date={task.start_date ? parseLocalDate(task.start_date) : undefined} onDateChange={(date) => setTask({ ...task, start_date: date ? formatLocalDate(date) : null })} placeholder={t("tasks.startDate")} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{t("tasks.finishDate")}</Label>
                    <DatePicker date={task.finish_date ? parseLocalDate(task.finish_date) : undefined} onDateChange={(date) => setTask({ ...task, finish_date: date ? formatLocalDate(date) : null })} placeholder={t("tasks.finishDate")} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{t("tasks.progress")} {task.progress}%</Label>
                    <Slider min={0} max={100} step={5} value={[task.progress]} onValueChange={([value]) => setTask({ ...task, progress: value })} className="w-full pt-2" />
                  </div>
                </div>
              </div>
              )}

              {/* Cost estimation — planning mode gets the pricing form */}
              {isPlanning && isHomeowner ? (
              <div className="space-y-3 rounded-xl border border-border/60 bg-background p-4 shadow-sm">
                <Label htmlFor="edit-task-budget" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("taskCost.budget", "Budget")}</Label>
                <Input
                  id="edit-task-budget"
                  type="number"
                  step="1"
                  min="0"
                  placeholder="SEK"
                  className="text-lg font-semibold tabular-nums"
                  value={task.budget != null ? Math.round(task.budget).toString() : ""}
                  onChange={(e) =>
                    setTask({ ...task, budget: e.target.value ? parseFloat(e.target.value) : null })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {t("taskCost.homeownerBudgetHint", "Your estimated budget or quote amount for this task")}
                </p>

                {/* Smart material estimate — homeowner version */}
                {(() => {
                  const roomIds = (task.room_ids && task.room_ids.length > 0)
                    ? task.room_ids
                    : task.room_id ? [task.room_id] : [];
                  const linkedRooms = roomIds
                    .map((id) => rooms.find((r) => r.id === id))
                    .filter((r): r is typeof rooms[number] => !!r && !!r.dimensions);
                  const detected = detectWorkType(task);
                  const est = linkedRooms.length > 0 && detected
                    ? estimateTaskMultiRoom(task, linkedRooms as RecipeRoom[], estimationSettings ?? undefined)
                    : null;
                  if (!est || !est.material) return null;

                  const mat = est.material;
                  const materialCost = Math.round(mat.quantity * mat.unitPrice);
                  const areaLabel = est.areaType === "wall"
                    ? t("planningTasks.wallArea", "väggyta")
                    : t("planningTasks.floorArea", "golvyta");

                  return (
                    <div className="mt-2 rounded-md bg-muted/40 p-3 space-y-2">
                      <p className="text-xs font-medium flex items-center gap-1.5">
                        <Calculator className="h-3.5 w-3.5 text-primary" />
                        {t("taskCost.materialEstimate", "Materialuppskattning")}
                      </p>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">{areaLabel}</span>
                          <p className="font-medium tabular-nums">{Math.round(est.totalAreaSqm * 10) / 10} m²</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t("taskCost.quantity", "Åtgång")}</span>
                          <p className="font-medium tabular-nums">{Math.round(mat.quantity * 10) / 10} {mat.unit}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t("taskCost.unitPrice", "Pris/enhet")}</span>
                          <p className="font-medium tabular-nums">{Math.round(mat.unitPrice)} kr/{mat.unit}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-muted">
                        <span className="text-xs text-muted-foreground">{t("taskCost.estimatedMaterialCost", "Beräknad materialkostnad")}</span>
                        <div className="text-right">
                          <span className="text-sm font-semibold tabular-nums">{Math.round(materialCost * 1.25).toLocaleString("sv-SE")} kr</span>
                          <span className="text-[10px] text-muted-foreground ml-1">{t("estimation.incMomsShort", "inc moms")}</span>
                          <p className="text-[10px] text-muted-foreground tabular-nums">{materialCost.toLocaleString("sv-SE")} kr {t("estimation.exMomsShort", "ex moms")}</p>
                        </div>
                      </div>
                      {task.budget == null && (
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() => setTask({ ...task, budget: Math.round(materialCost * 1.25) })}
                        >
                          {t("taskCost.useAsbudget", "Använd som budget")}
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>
              ) : isPlanning ? (
              (() => {
                const laborTotal = (task.estimated_hours || 0) * (task.hourly_rate || 0);
                const ueWithMarkup = (task.subcontractor_cost || 0) * (1 + (task.markup_percent || 0) / 100);

                // Material calculation — supports both simple and multi-row modes
                const calcMaterial = (t: Task) => {
                  const items = t.material_items || [];
                  if (items.length > 0) {
                    const base = items.reduce((sum, i) => sum + (i.amount || 0), 0);
                    const hasPerRow = items.some(i => (i.markup_percent ?? null) !== null);
                    if (hasPerRow) {
                      return items.reduce((sum, i) =>
                        sum + (i.amount || 0) * (1 + (i.markup_percent || 0) / 100), 0);
                    }
                    return base * (1 + (t.material_markup_percent || 0) / 100);
                  }
                  return (t.material_estimate || 0) * (1 + (t.material_markup_percent || 0) / 100);
                };

                const materialWithMarkup = calcMaterial(task);
                const materialBase = (task.material_items || []).length > 0
                  ? (task.material_items || []).reduce((sum, i) => sum + (i.amount || 0), 0)
                  : (task.material_estimate || 0);
                const customerPrice = laborTotal + ueWithMarkup + materialWithMarkup;
                const ueMarkupAmount = ueWithMarkup - (task.subcontractor_cost || 0);
                const materialMarkupAmount = materialWithMarkup - materialBase;
                const effectiveCostPercent = task.labor_cost_percent ?? profileLaborCostPercent ?? 50;
                const laborProfit = laborTotal * (1 - effectiveCostPercent / 100);
                const result = laborProfit + ueMarkupAmount + materialMarkupAmount;

                const recalcBudget = (updates: Partial<Task>) => {
                  const next = { ...task, ...updates };
                  const labor = (next.estimated_hours || 0) * (next.hourly_rate || 0);
                  const ue = (next.subcontractor_cost || 0) * (1 + (next.markup_percent || 0) / 100);
                  const mat = calcMaterial(next);
                  const total = labor + ue + mat;
                  setTask({ ...next, budget: total || null });
                };

                return (
              <div className="space-y-3">
                {/* Smart estimate — AI-based calculation */}
                <SmartEstimateCard
                  task={task}
                  rooms={rooms}
                  estimationSettings={estimationSettings}
                  onApply={async (hours, items) => {
                    const newItems = items.length > 0 ? items : (task.material_items || []);
                    recalcBudget({ estimated_hours: hours, material_items: newItems });

                    // Immediately write to DB so sub-row appears in planning table
                    if (task && newItems.length > 0) {
                      await syncPlannedMaterials(newItems, task.id, task.project_id);

                      // Re-fetch from DB so dialog shows the saved rows (with DB ids/names)
                      const { data: saved } = await supabase
                        .from("materials")
                        .select("id, name, quantity, unit, price_per_unit, price_total, markup_percent")
                        .eq("task_id", task.id)
                        .eq("status", "planned");
                      if (saved && saved.length > 0) {
                        const refreshed = saved.map((m) => ({
                          id: m.id,
                          name: m.name,
                          quantity: m.quantity ?? 1,
                          unit: m.unit ?? "st",
                          unit_price: m.price_per_unit ?? 0,
                          amount: m.price_total ?? Math.round((m.quantity || 0) * (m.price_per_unit || 0)),
                          markup_percent: m.markup_percent ?? null,
                        }));
                        setTask((prev) => prev ? { ...prev, material_items: refreshed } : prev);
                      }
                    }

                    toast({ description: t("materialRecipes.estimateApplied", "Estimate applied — adjust values as needed") });
                  }}
                  onSaveDefault={async (key, value) => {
                    try {
                      const { data: { user } } = await supabase.auth.getUser();
                      if (!user) return;
                      const updated = { ...(estimationSettings ?? {}), [key]: value };
                      await supabase.from("profiles").update({ estimation_settings: updated }).eq("user_id", user.id);
                      setEstimationSettings(parseEstimationSettings(updated as Record<string, unknown>));
                      toast({ description: t("materialRecipes.defaultSaved", "Default saved to profile") });
                    } catch {
                      toast({ variant: "destructive", description: t("common.errorSaving", "Could not save") });
                    }
                  }}
                  currency={currency}
                  t={t}
                />

                {/* Cost breakdown table */}
                <TaskCostTable
                  estimatedHours={task.estimated_hours}
                  hourlyRate={task.hourly_rate}
                  subcontractorCost={task.subcontractor_cost}
                  markupPercent={task.markup_percent}
                  materialEstimate={task.material_estimate}
                  materialMarkupPercent={task.material_markup_percent}
                  materialItems={task.material_items}
                  currency={currency}
                  onChange={(updates) => recalcBudget(updates as Partial<Task>)}
                />

              </div>
                );
              })()
              ) : (
              (() => {
                const laborVal = task.task_cost_type === "subcontractor"
                  ? (task.subcontractor_cost || 0)
                  : (task.estimated_hours || 0) * (task.hourly_rate || 0);
                const materialVal = task.material_estimate || 0;
                const computedTotal = laborVal + materialVal;
                const displayTotal = (laborVal > 0 || materialVal > 0) ? computedTotal : (task.budget || 0);

                const updateLabor = (val: number | null) => {
                  const newLabor = val || 0;
                  const newTotal = newLabor + materialVal;
                  if (task.task_cost_type === "subcontractor") {
                    setTask({ ...task, subcontractor_cost: val, budget: newTotal || null });
                  } else {
                    setTask({ ...task, subcontractor_cost: val, task_cost_type: val ? "subcontractor" : task.task_cost_type, budget: newTotal || null });
                  }
                };

                const updateMaterial = (val: number | null) => {
                  const newMaterial = val || 0;
                  const newTotal = laborVal + newMaterial;
                  setTask({ ...task, material_estimate: val, budget: newTotal || null });
                };

                return (
                  <div className="space-y-3 rounded-xl border border-border/60 bg-background p-4 shadow-sm">
                    <div className="flex items-baseline justify-between">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {isBuilder ? t("tasks.contractValue", "Contract Value") : t("tasks.budget")}
                      </Label>
                      <span className="text-lg font-bold tabular-nums text-primary">
                        {Math.round(displayTotal).toLocaleString("sv-SE")} kr
                      </span>
                    </div>
                    <div className="space-y-1.5 pt-2 border-t">
                      {/* Cost type selector — builder only */}
                      {isBuilder && <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-muted-foreground">{t("tasks.costType", "Kostnadstyp")}</span>
                        <Select
                          value={task.task_cost_type || "own_labor"}
                          onValueChange={(v) => {
                            const updates: Partial<Task> = { task_cost_type: v };
                            if (v === "own_labor" && task.task_cost_type === "subcontractor") {
                              updates.estimated_hours = null;
                              updates.hourly_rate = null;
                            }
                            setTask({ ...task, ...updates });
                          }}
                        >
                          <SelectTrigger className="h-7 w-44 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="own_labor">{t("tasks.costTypeOwnLabor", "Eget arbete")}</SelectItem>
                            <SelectItem value="subcontractor">{t("tasks.costTypeSubcontractor", "Underentreprenör")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>}
                      {/* Labor row — click to edit */}
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-muted-foreground">
                          {(task.task_cost_type || "own_labor") === "subcontractor"
                            ? t("tasks.subcontractorCost", "UE-kostnad")
                            : t("tasks.rotLaborCost", "Arbetskostnad")}
                        </span>
                        {editingBudgetField === "labor" ? (
                          <div className="flex items-center gap-1">
                            <Input
                              autoFocus
                              type="number"
                              step="1"
                              min="0"
                              placeholder="0"
                              className="h-7 w-28 text-right text-sm tabular-nums"
                              value={laborVal > 0 ? Math.round(laborVal).toString() : ""}
                              onChange={(e) => updateLabor(e.target.value ? parseFloat(e.target.value) : null)}
                              onBlur={() => setEditingBudgetField(null)}
                              onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditingBudgetField(null); }}
                            />
                            <span className="text-xs text-muted-foreground">kr</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="text-sm tabular-nums hover:bg-muted px-2 py-0.5 rounded transition-colors cursor-text"
                            onDoubleClick={() => setEditingBudgetField("labor")}
                            title={t("common.doubleClickToEdit", "Dubbelklicka för att redigera")}
                          >
                            {laborVal > 0 ? `${Math.round(laborVal).toLocaleString("sv-SE")} kr` : <span className="text-muted-foreground/40">0 kr</span>}
                          </button>
                        )}
                      </div>
                      {/* Material row — click to edit */}
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-muted-foreground">{t("tasks.materialBudget", "Materialbudget")}</span>
                        {editingBudgetField === "material" ? (
                          <div className="flex items-center gap-1">
                            <Input
                              autoFocus
                              type="number"
                              step="1"
                              min="0"
                              placeholder="0"
                              className="h-7 w-28 text-right text-sm tabular-nums"
                              value={materialVal > 0 ? Math.round(materialVal).toString() : ""}
                              onChange={(e) => updateMaterial(e.target.value ? parseFloat(e.target.value) : null)}
                              onBlur={() => setEditingBudgetField(null)}
                              onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditingBudgetField(null); }}
                            />
                            <span className="text-xs text-muted-foreground">kr</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="text-sm tabular-nums hover:bg-muted px-2 py-0.5 rounded transition-colors cursor-text"
                            onDoubleClick={() => setEditingBudgetField("material")}
                            title={t("common.doubleClickToEdit", "Dubbelklicka för att redigera")}
                          >
                            {materialVal > 0 ? `${Math.round(materialVal).toLocaleString("sv-SE")} kr` : <span className="text-muted-foreground/40">0 kr</span>}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()
              )}

              {/* Economics summary: material budget + consumed (non-planning, builder only) */}
              {!isPlanning && isBuilder && (() => {
                const plannedMaterialTotal = (task.material_items || []).reduce((sum, i) => sum + (i.amount || 0), 0)
                  || task.material_estimate || 0;
                if (plannedMaterialTotal === 0 && materialSpent === 0) return null;
                const remaining = plannedMaterialTotal - materialSpent;
                const ratio = plannedMaterialTotal > 0 ? materialSpent / plannedMaterialTotal : 0;
                const barColor = ratio >= 1 ? "bg-destructive" : ratio >= 0.8 ? "bg-amber-500" : "bg-emerald-500";
                return (
                  <div className="rounded-xl border border-blue-200/60 bg-blue-50/30 dark:bg-blue-950/10 dark:border-blue-800/40 p-3 space-y-2">
                    <p className="text-xs font-medium text-blue-700 dark:text-blue-400 uppercase tracking-wide">
                      {t("costBreakdown.purchaseTracking")}
                    </p>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">{t("costBreakdown.materialBudget")}</p>
                        <p className="font-medium tabular-nums">{formatCurrency(plannedMaterialTotal, currency)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{t("costBreakdown.spent")}</p>
                        <p className="font-medium tabular-nums">{formatCurrency(materialSpent, currency)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{t("costBreakdown.remainingToBuy")}</p>
                        <p className={`font-medium tabular-nums ${remaining < 0 ? "text-destructive" : remaining > 0 ? "text-emerald-600" : ""}`}>
                          {formatCurrency(remaining, currency)}
                        </p>
                      </div>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(ratio * 100, 100)}%` }} />
                    </div>
                  </div>
                );
              })()}

              {/* ROT deduction section — only for Swedish market */}
              {showTaxDeduction && (() => {
                // Calculate labor cost for ROT suggestion
                const laborCost = task.task_cost_type === "subcontractor"
                  ? (task.subcontractor_cost || 0)
                  : (task.estimated_hours || 0) * (task.hourly_rate || 0);
                const rotPercent = rotSubsidyPercent;
                const suggestedRot = laborCost > 0 ? Math.round(laborCost * rotPercent / 100) : 0;
                const cappedRot = Math.min(suggestedRot, rotMaxPerPerson);

                return (
                  <div className={cn("p-4 rounded-xl border space-y-2 transition-colors", task.rot_eligible ? "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800" : "border-border/60 bg-background")}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={task.rot_eligible ?? false}
                          onCheckedChange={(checked) => {
                            const newAmount = checked && laborCost > 0 ? cappedRot : null;
                            setTask({ ...task, rot_eligible: checked, rot_amount: newAmount });
                          }}
                        />
                        <div>
                          <p className="text-sm font-medium">{t("tasks.rotEligible", "ROT-berättigat")}</p>
                          <p className="text-xs text-muted-foreground">{t("tasks.rotDescription", "Avdrag gäller bara arbetskostnad")}</p>
                        </div>
                      </div>
                      {task.rot_eligible && (
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            value={task.rot_amount ?? ""}
                            onChange={(e) =>
                              setTask({ ...task, rot_amount: e.target.value ? parseFloat(e.target.value) : null })
                            }
                            className="h-8 w-28 text-right text-sm tabular-nums"
                            placeholder="0"
                          />
                          <span className="text-sm text-muted-foreground">kr</span>
                        </div>
                      )}
                    </div>
                    {/* Calculation hint when ROT is enabled */}
                    {task.rot_eligible && laborCost > 0 && (
                      <div className="text-xs text-muted-foreground space-y-0.5 pt-1 border-t">
                        <div className="flex justify-between">
                          <span>{t("tasks.rotSubsidy", "ROT-avdrag")} {rotPercent}%</span>
                          <span className="tabular-nums">{suggestedRot.toLocaleString("sv-SE")} kr</span>
                        </div>
                        {suggestedRot > rotMaxPerPerson && (
                          <div className="flex justify-between text-amber-600">
                            <span>{t("tasks.rotCapped", "Tak per person/år")}</span>
                            <span className="tabular-nums">{rotMaxPerPerson.toLocaleString("sv-SE")} kr</span>
                          </div>
                        )}
                        {task.rot_amount !== cappedRot && task.rot_amount != null && (
                          <button
                            type="button"
                            className="text-primary hover:underline text-xs"
                            onClick={() => setTask({ ...task, rot_amount: cappedRot })}
                          >
                            {t("tasks.rotResetSuggested", "Återställ till föreslaget belopp")} ({cappedRot.toLocaleString("sv-SE")} kr)
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Property Grid moved before budget sections */}

              {/* ── Collapsible deep-dive sections ── */}
              {!isPlanning && (
              <div className="space-y-1.5 pt-3">

                {/* Payment / cost tracking — always visible */}
                <div className="rounded-xl border border-border/60 bg-background p-4 shadow-sm space-y-3">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                    {isBuilder ? t("tasks.costTracking", "Cost Tracking") : t("tasks.paymentStatus")}
                  </p>
                      {/* Cost Breakdown — builder only */}
                      {isBuilder && task.budget ? (() => {
                        const laborTotal = (task.estimated_hours || 0) * (task.hourly_rate || 0);
                        const ueCost = task.subcontractor_cost || 0;
                        const ueMarkup = ueCost * (task.markup_percent || 0) / 100;
                        const materialBase = task.material_estimate || 0;
                        const materialMarkup = materialBase * (task.material_markup_percent || 0) / 100;
                        const effectiveCostPercent = task.labor_cost_percent ?? profileLaborCostPercent ?? 50;
                        const laborProfit = laborTotal * (1 - effectiveCostPercent / 100);
                        const totalProfit = laborProfit + ueMarkup + materialMarkup;

                        return (
                          <div className="rounded-lg border p-3 bg-muted/30 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{t("taskCost.customerPrice")} <span className="font-normal text-[10px] text-muted-foreground">({t("estimation.exMomsShort", "ex moms")})</span></span>
                              <span className="text-sm font-semibold">{formatCurrency(task.budget, currency)}</span>
                            </div>
                            <Separator />
                            <span className="text-xs font-medium text-muted-foreground">{t("costBreakdown.title")}</span>
                            {laborTotal > 0 && (
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">{t("taskCost.ownLabor")}</span>
                                <span>{formatCurrency(laborTotal, currency)}</span>
                              </div>
                            )}
                            {ueCost > 0 && (
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">{t("taskCost.subcontractor")}</span>
                                <span>{formatCurrency(ueCost + ueMarkup, currency)}</span>
                              </div>
                            )}
                            {materialBase > 0 && (
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">
                                  {t("taskCost.materialEstimate")}
                                  <span className="ml-1 text-muted-foreground/60">({t("costBreakdown.spendingBudget")})</span>
                                </span>
                                <span>{formatCurrency(materialBase, currency)}</span>
                              </div>
                            )}
                            {totalProfit > 0 && (
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">{t("costBreakdown.markupProfit")}</span>
                                <span className="text-green-600">{formatCurrency(totalProfit, currency)}</span>
                              </div>
                            )}
                          </div>
                        );
                      })() : null}

                      {/* Purchase Tracking — builder only, when material budget > 0 */}
                      {isBuilder && (() => {
                        const materialBudget = (task.material_items || []).reduce((sum, i) => sum + (i.amount || 0), 0)
                          || task.material_estimate || 0;
                        if (materialBudget === 0 && materialSpent === 0) return null;
                        const ratio = materialSpent / materialBudget;
                        const remaining = materialBudget - materialSpent;
                        const barColor = ratio >= 1 ? "bg-destructive" : ratio >= 0.8 ? "bg-amber-500" : "bg-emerald-500";
                        const textColor = remaining < 0 ? "text-destructive" : remaining > 0 ? "text-emerald-600" : "";

                        return (
                          <div className="rounded-lg border p-3 space-y-2">
                            <span className="text-xs font-medium">{t("costBreakdown.purchaseTracking")}</span>
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">{t("costBreakdown.materialBudget")}</span>
                              <span>{formatCurrency(materialBudget, currency)}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">{t("costBreakdown.spent")}</span>
                              <span>{formatCurrency(materialSpent, currency)}</span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                              <div className={`h-full rounded-full ${barColor}`}
                                   style={{ width: `${Math.min(ratio * 100, 100)}%` }} />
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">{t("costBreakdown.remainingToBuy")}</span>
                              <span className={textColor}>{formatCurrency(remaining, currency)}</span>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="edit-task-ordered">
                            {isBuilder ? t("tasks.materialPurchased", "Material Purchased") : t("tasks.ordered")}
                          </Label>
                          <Input
                            id="edit-task-ordered"
                            type="number"
                            step="0.01"
                            placeholder="SEK"
                            value={task.ordered_amount?.toString() || ""}
                            onChange={(e) =>
                              setTask({
                                ...task,
                                ordered_amount: e.target.value ? parseFloat(e.target.value) : null,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-task-paid">
                            {isBuilder ? t("tasks.expenses", "Expenses") : t("tasks.paid")}
                          </Label>
                          <Input
                            id="edit-task-paid"
                            type="number"
                            step="0.01"
                            placeholder="SEK"
                            value={task.paid_amount?.toString() || ""}
                            onChange={(e) =>
                              setTask({
                                ...task,
                                paid_amount: e.target.value ? parseFloat(e.target.value) : null,
                              })
                            }
                          />
                        </div>
                      </div>

                      {/* Margin — builder only */}
                      {isBuilder && task.budget ? (() => {
                        const totalExpenses = (task.paid_amount || 0) + (task.ordered_amount || 0);
                        const laborCost = (task.estimated_hours || 0) * (task.hourly_rate || 0);
                        const ueCost = task.subcontractor_cost || 0;
                        const matCost = task.material_estimate || 0;
                        const estimatedCosts = laborCost + ueCost + matCost;
                        const margin = task.budget - (totalExpenses > 0 ? totalExpenses : estimatedCosts);
                        return (
                          <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
                            <span className="text-sm text-muted-foreground">{t("tasks.margin", "Margin")}</span>
                            <span className={`text-sm font-semibold ${margin >= 0 ? "text-green-600" : "text-destructive"}`}>
                              {formatCurrency(margin, currency)}
                            </span>
                          </div>
                        );
                      })() : null}

                      {/* Supplier */}
                      {"supplier_id" in task && (
                        <div className="space-y-2">
                          <Label>{t("budget.supplier", "Leverantör")}</Label>
                          <SupplierAutocomplete
                            profileId={taskProfileId}
                            suppliers={taskSuppliers}
                            value={taskSuppliers.find(s => s.id === task.supplier_id)?.name || ""}
                            onChange={(suppId) => setTask({ ...task, supplier_id: suppId })}
                            onCreated={async () => {
                              if (!taskProfileId) return;
                              const { data } = await supabase.from("suppliers").select("id, name").eq("profile_id", taskProfileId).order("name");
                              setTaskSuppliers(data || []);
                            }}
                          />
                        </div>
                      )}

                      {!isBuilder && task.budget && (
                        <div className="space-y-2">
                          <Label htmlFor="edit-task-payment-status">{t("tasks.paymentStatus")}</Label>
                          <Select
                            value={task.payment_status || "not_paid"}
                            onValueChange={(value) => {
                              if (value === "input_amount") {
                                setTask({ ...task, payment_status: "partially_paid" });
                              } else {
                                setTask({
                                  ...task,
                                  payment_status: value,
                                  paid_amount: value === "paid" && task.budget ? task.budget : null,
                                });
                              }
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="not_paid">{t("tasks.notPaid")}</SelectItem>
                              <SelectItem value="paid">{t("tasks.paid")}</SelectItem>
                              <SelectItem value="billed">{t("tasks.billed")}</SelectItem>
                              <SelectItem value="input_amount">{t("tasks.partiallyPaid")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                  {/* ÄTA checkbox + approval — at bottom of finance section */}
                  {!isPlanning && "is_ata" in task && (
                    <div className="space-y-2 pt-2 border-t">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="edit-task-is-ata"
                          checked={task.is_ata}
                          onCheckedChange={(checked) => setTask({ ...task, is_ata: !!checked })}
                        />
                        <Label htmlFor="edit-task-is-ata" className="text-sm font-normal cursor-pointer">
                          {t("tasks.isAta")}
                        </Label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3.5 w-3.5 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-[240px]">
                              <p className="text-xs">{t("tasks.ataTooltip")}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      {task.is_ata && (
                        <AtaApprovalSection taskId={task.id} projectId={projectId} ataStatus={(task as Record<string, unknown>).ata_status as string | null} isHomeowner={isHomeowner} />
                      )}
                    </div>
                  )}
                </div>

                {/* Dependencies */}
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-2 w-full py-2.5 px-3 text-sm font-medium rounded-lg hover:bg-background hover:shadow-sm border border-transparent hover:border-border transition-all group">
                    <ChevronRight className="h-4 w-4 transition-transform group-data-[state=open]:rotate-90" />
                    {t("tasks.dependencies", "Dependencies")} {dependencies.length > 0 && `(${dependencies.length})`}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="ml-3 pl-4 pb-3 space-y-2 border-l-2 border-muted">
                      {/* Existing dependencies */}
                      {dependencies.map((dep) => {
                        const isReady = dep.status === "completed";
                        return (
                          <div key={dep.id} className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm ${isReady ? "border-green-200 bg-green-50/50" : "border-amber-200 bg-amber-50/50"}`}>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`h-2 w-2 rounded-full shrink-0 ${isReady ? "bg-green-500" : "bg-amber-500"}`} />
                              <span className="truncate">{dep.title}</span>
                              <span className="text-xs text-muted-foreground shrink-0">
                                {isReady ? t("tasks.depReady", "Ready") : t("tasks.depWaiting", "Waiting")}
                              </span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
                              onClick={async () => {
                                await supabase.from("task_dependencies").delete().eq("id", dep.id);
                                setDependencies(prev => prev.filter(d => d.id !== dep.id));
                              }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        );
                      })}
                      {/* Add dependency */}
                      {(() => {
                        const availableTasks = allProjectTasks.filter(
                          t => !dependencies.some(d => d.depends_on_task_id === t.id)
                        );
                        if (availableTasks.length === 0 && dependencies.length === 0) {
                          return <p className="text-xs text-muted-foreground">{t("tasks.noDepsAvailable", "No other tasks to depend on")}</p>;
                        }
                        if (availableTasks.length === 0) return null;
                        return (
                          <Select
                            value=""
                            onValueChange={async (depTaskId) => {
                              const { data, error } = await supabase
                                .from("task_dependencies")
                                .insert({ task_id: taskId!, depends_on_task_id: depTaskId })
                                .select("id")
                                .single();
                              if (!error && data) {
                                const depTask = allProjectTasks.find(t => t.id === depTaskId);
                                setDependencies(prev => [...prev, {
                                  id: data.id,
                                  depends_on_task_id: depTaskId,
                                  title: depTask?.title || "Unknown",
                                  status: depTask?.status || "to_do",
                                  finish_date: depTask?.finish_date || null,
                                }]);
                              }
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder={t("tasks.addDependency", "Add dependency...")} />
                            </SelectTrigger>
                            <SelectContent>
                              {availableTasks.map(pt => (
                                <SelectItem key={pt.id} value={pt.id}>
                                  {pt.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        );
                      })()}
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Checklists */}
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-2 w-full py-2.5 px-3 text-sm font-medium rounded-lg hover:bg-background hover:shadow-sm border border-transparent hover:border-border transition-all group">
                    <ChevronRight className="h-4 w-4 transition-transform group-data-[state=open]:rotate-90" />
                    {t("tasks.checklists")} {(task.checklists || []).length > 0 && `(${(task.checklists || []).length})`}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="ml-3 pl-4 pb-3 space-y-3 border-l-2 border-muted">
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const newChecklist: Checklist = {
                              id: crypto.randomUUID(),
                              title: t("tasks.checklist"),
                              items: [],
                            };
                            setTask({ ...task, checklists: [...(task.checklists || []), newChecklist] });
                          }}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          {t("tasks.addChecklist")}
                        </Button>
                        {task.room_id && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleGenerateChecklist}
                            disabled={generatingChecklist}
                          >
                            {generatingChecklist ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <Sparkles className="h-3 w-3 mr-1" />
                            )}
                            {t("tasks.generateChecklist", "Generate from room")}
                          </Button>
                        )}
                      </div>
                      {(task.checklists || []).map((checklist, clIdx) => {
                        const completedCount = checklist.items.filter((i) => i.completed).length;
                        const totalCount = checklist.items.length;
                        const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
                        return (
                          <div key={checklist.id} className="border rounded-lg">
                            <Collapsible defaultOpen>
                              <div className="flex items-center gap-2 px-3 py-2">
                                <CollapsibleTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                    <ChevronDown className="h-3 w-3" />
                                  </Button>
                                </CollapsibleTrigger>
                                <Input
                                  value={checklist.title}
                                  onChange={(e) => updateChecklist(clIdx, { title: e.target.value })}
                                  className="h-7 text-sm font-medium border-none shadow-none px-1 focus-visible:ring-1"
                                />
                                {totalCount > 0 && (
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">{completedCount}/{totalCount}</span>
                                )}
                                <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => deleteChecklist(clIdx)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                              {totalCount > 0 && (
                                <div className="px-3 pb-1"><Progress value={progressPct} className="h-1.5" /></div>
                              )}
                              <CollapsibleContent>
                                <div className="px-3 pb-3 space-y-1">
                                  {checklist.items.map((item, itemIdx) => (
                                    <div key={item.id} className="flex items-center gap-2 group">
                                      <Checkbox
                                        checked={item.completed}
                                        onCheckedChange={(checked) => {
                                          const newItems = [...checklist.items];
                                          newItems[itemIdx] = { ...newItems[itemIdx], completed: !!checked };
                                          updateChecklist(clIdx, { items: newItems });
                                        }}
                                      />
                                      <Input
                                        value={item.title}
                                        onChange={(e) => {
                                          const newItems = [...checklist.items];
                                          newItems[itemIdx] = { ...newItems[itemIdx], title: e.target.value };
                                          updateChecklist(clIdx, { items: newItems });
                                        }}
                                        className={`h-7 text-sm border-none shadow-none px-1 focus-visible:ring-1 ${item.completed ? "line-through text-muted-foreground" : ""}`}
                                      />
                                      <Button type="button" variant="ghost" size="sm" className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive" onClick={() => {
                                        const newItems = checklist.items.filter((_, i) => i !== itemIdx);
                                        updateChecklist(clIdx, { items: newItems });
                                      }}>
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  ))}
                                  <Input
                                    placeholder={t("tasks.addItem")}
                                    className="h-7 text-sm mt-1"
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        const val = (e.target as HTMLInputElement).value.trim();
                                        if (val) {
                                          const newItem: ChecklistItem = { id: crypto.randomUUID(), title: val, completed: false };
                                          updateChecklist(clIdx, { items: [...checklist.items, newItem] });
                                          (e.target as HTMLInputElement).value = "";
                                        }
                                      }
                                    }}
                                  />
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Room details (aggregated from all linked rooms) */}
                {taskRoomIds.length > 0 && (
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center gap-2 w-full py-2.5 px-3 text-sm font-medium rounded-lg hover:bg-background hover:shadow-sm border border-transparent hover:border-border transition-all group">
                      <ChevronRight className="h-4 w-4 transition-transform group-data-[state=open]:rotate-90" />
                      {t("tasks.roomDetails", "Room details")}
                      {taskRoomIds.length > 1 && <span className="text-muted-foreground font-normal">({taskRoomIds.length} {t("tasks.rooms", "rooms")})</span>}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="ml-3 pl-4 pb-3 border-l-2 border-muted">
                        <TaskRoomDetails roomIds={taskRoomIds} />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Photos */}
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-2 w-full py-2.5 px-3 text-sm font-medium rounded-lg hover:bg-background hover:shadow-sm border border-transparent hover:border-border transition-all group">
                    <ChevronRight className="h-4 w-4 transition-transform group-data-[state=open]:rotate-90" />
                    {t("entityPhotos.photos", "Photos")}
                    {photoCount > 0 && <span className="text-muted-foreground font-normal">({photoCount})</span>}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="ml-3 pl-4 pb-3 border-l-2 border-muted">
                      <EntityPhotoGallery entityId={task.id} entityType="task" projectId={projectId} onPhotoCount={setPhotoCount} />
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Files */}
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-2 w-full py-2.5 px-3 text-sm font-medium rounded-lg hover:bg-background hover:shadow-sm border border-transparent hover:border-border transition-all group">
                    <ChevronRight className="h-4 w-4 transition-transform group-data-[state=open]:rotate-90" />
                    {t("tasks.linkedFiles", "Linked files")}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="ml-3 pl-4 pb-3 border-l-2 border-muted">
                      <TaskFilesList taskId={task.id} projectId={projectId} />
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Comments */}
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-2 w-full py-2.5 px-3 text-sm font-medium rounded-lg hover:bg-background hover:shadow-sm border border-transparent hover:border-border transition-all group">
                    <ChevronRight className="h-4 w-4 transition-transform group-data-[state=open]:rotate-90" />
                    {t("feed.comments", "Comments")}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="ml-3 pl-4 pb-3 border-l-2 border-muted">
                      <CommentsSection taskId={task.id} projectId={projectId} />
                    </div>
                  </CollapsibleContent>
                </Collapsible>

              </div>
              )}

            </div>
            {/* Sticky save footer */}
            <div className="flex-shrink-0 border-t bg-background px-6 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
              <Button type="submit" className="w-full h-11 text-base font-medium shadow-sm" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    {t("tasks.updating")}
                  </>
                ) : (
                  t("tasks.updateTask")
                )}
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-muted-foreground py-8 text-center">{t("budget.noData")}</p>
        )}
    </TaskEditWrapper>
  );
};
