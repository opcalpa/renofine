/**
 * Smart Estimate Card — supports all work types (labor + optional material).
 * Moved verbatim from TaskEditDialog.tsx in the tabbed-dialog restructure.
 */
import { useState, useEffect, useRef } from "react";
import { useMeasurement } from "@/contexts/MeasurementContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight, Sparkles } from "lucide-react";
import {
  detectWorkType,
  estimateTaskMultiRoom,
  computeFloorAreaSqm,
  computeWallAreaSqm,
  WORK_TYPE_LABEL_KEYS,
  type RecipeEstimationSettings,
  type RecipeRoom,
} from "@/lib/materialRecipes";
import type { Task, MaterialItem } from "./types";

interface SmartEstimateCardProps {
  task: Task;
  rooms: { id: string; name: string; dimensions?: RecipeRoom["dimensions"]; ceiling_height_mm?: number | null }[];
  estimationSettings: RecipeEstimationSettings | null;
  onApply: (hours: number, items: MaterialItem[]) => void;
  onSaveDefault?: (key: keyof RecipeEstimationSettings, value: number) => void;
  currency?: string | null;
  t: (key: string, fallback?: string | Record<string, string>) => string;
}

export function SmartEstimateCard({ task, rooms, estimationSettings, onApply, onSaveDefault, currency, t }: SmartEstimateCardProps) {
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
