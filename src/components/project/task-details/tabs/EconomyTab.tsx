import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Calculator, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SupplierAutocomplete } from "@/components/shared/SupplierAutocomplete";
import { AtaApprovalSection } from "../../AtaApprovalSection";
import { TaskCostTable } from "../../TaskCostTable";
import { SmartEstimateCard } from "../SmartEstimateCard";
import { formatCurrency } from "@/lib/currency";
import {
  detectWorkType,
  estimateTaskMultiRoom,
  parseEstimationSettings,
  type RecipeEstimationSettings,
  type RecipeRoom,
} from "@/lib/materialRecipes";
import { type Task, type TaskRoom, type MaterialItem, taskRoomIdList } from "../types";

interface EconomyTabProps {
  task: Task;
  patch: (updates: Partial<Task>) => void;
  setTask: React.Dispatch<React.SetStateAction<Task | null>>;
  isPlanning: boolean;
  isBuilder: boolean;
  isHomeowner: boolean;
  rooms: TaskRoom[];
  projectId: string;
  currency?: string | null;
  showTaxDeduction: boolean;
  rotSubsidyPercent: number;
  rotMaxPerPerson: number;
  profileLaborCostPercent: number | null;
  materialSpent: number;
  estimationSettings: RecipeEstimationSettings | null;
  setEstimationSettings: (s: RecipeEstimationSettings | null) => void;
  taskProfileId: string | null;
  taskSuppliers: { id: string; name: string }[];
  setTaskSuppliers: (s: { id: string; name: string }[]) => void;
  syncPlannedMaterials: (items: MaterialItem[], taskId: string, projectId: string) => Promise<void>;
}

export function EconomyTab({
  task,
  patch,
  setTask,
  isPlanning,
  isBuilder,
  isHomeowner,
  rooms,
  projectId,
  currency,
  showTaxDeduction,
  rotSubsidyPercent,
  rotMaxPerPerson,
  profileLaborCostPercent,
  materialSpent,
  estimationSettings,
  setEstimationSettings,
  taskProfileId,
  taskSuppliers,
  setTaskSuppliers,
  syncPlannedMaterials,
}: EconomyTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [editingBudgetField, setEditingBudgetField] = useState<"labor" | "material" | null>(null);

  // Material calculation — supports both simple and multi-row modes
  const calcMaterial = (tk: Task) => {
    const items = tk.material_items || [];
    if (items.length > 0) {
      const base = items.reduce((sum, i) => sum + (i.amount || 0), 0);
      const hasPerRow = items.some((i) => (i.markup_percent ?? null) !== null);
      if (hasPerRow) {
        return items.reduce((sum, i) => sum + (i.amount || 0) * (1 + (i.markup_percent || 0) / 100), 0);
      }
      return base * (1 + (tk.material_markup_percent || 0) / 100);
    }
    return (tk.material_estimate || 0) * (1 + (tk.material_markup_percent || 0) / 100);
  };

  const recalcBudget = (updates: Partial<Task>) => {
    const next = { ...task, ...updates };
    const labor = (next.estimated_hours || 0) * (next.hourly_rate || 0);
    const ue = (next.subcontractor_cost || 0) * (1 + (next.markup_percent || 0) / 100);
    const mat = calcMaterial(next);
    const total = labor + ue + mat;
    setTask({ ...next, budget: total || null });
  };

  // ── Planning · homeowner: simple budget + smart material estimate ──
  const planningHomeowner = (
    <div className="space-y-3 rounded-xl border border-border/60 bg-background p-4 shadow-sm">
      <Label htmlFor="edit-task-budget" className="rf-section-label">{t("taskCost.budget", "Budget")}</Label>
      <Input
        id="edit-task-budget"
        type="number"
        step="1"
        min="0"
        placeholder="SEK"
        className="text-lg font-semibold tabular-nums"
        value={task.budget != null ? Math.round(task.budget).toString() : ""}
        onChange={(e) => patch({ budget: e.target.value ? parseFloat(e.target.value) : null })}
      />
      <p className="text-xs text-muted-foreground">
        {t("taskCost.homeownerBudgetHint", "Your estimated budget or quote amount for this task")}
      </p>

      {(() => {
        const roomIds = taskRoomIdList(task);
        const linkedRooms = roomIds
          .map((id) => rooms.find((r) => r.id === id))
          .filter((r): r is TaskRoom => !!r && !!r.dimensions);
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
                onClick={() => patch({ budget: Math.round(materialCost * 1.25) })}
              >
                {t("taskCost.useAsbudget", "Använd som budget")}
              </button>
            )}
          </div>
        );
      })()}
    </div>
  );

  // ── Planning · builder: smart estimate + cost breakdown table ──
  const planningBuilder = (
    <div className="space-y-3">
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
              setTask((prev) => (prev ? { ...prev, material_items: refreshed } : prev));
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

  // ── Active project: budget box (G2: UE-aware, stored budget wins) ──
  const activeBudgetBox = (() => {
    const isSubcontractorType = task.task_cost_type === "subcontractor";
    const laborVal = isSubcontractorType
      ? (task.subcontractor_cost || 0)
      : (task.estimated_hours || 0) * (task.hourly_rate || 0);
    // Mixed model: planning table/Renaida can set UE alongside own labor — include it or the total lies
    const ueVal = isSubcontractorType
      ? 0
      : (task.subcontractor_cost || 0) * (1 + (task.markup_percent || 0) / 100);
    const materialVal = task.material_estimate || 0;
    const computedTotal = laborVal + ueVal + materialVal;
    // Stored budget is what the tasks table and budget view show — prefer it so surfaces agree
    const displayTotal = (task.budget || 0) > 0 ? (task.budget || 0) : computedTotal;
    // Lump-editing labor overwrites subcontractor_cost — unsafe when a real UE part exists
    const laborLumpEditable = ueVal === 0;

    const updateLabor = (val: number | null) => {
      const newLabor = val || 0;
      const newTotal = newLabor + materialVal;
      if (task.task_cost_type === "subcontractor") {
        patch({ subcontractor_cost: val, budget: newTotal || null });
      } else {
        patch({ subcontractor_cost: val, task_cost_type: val ? "subcontractor" : task.task_cost_type, budget: newTotal || null });
      }
    };

    const updateMaterial = (val: number | null) => {
      const newMaterial = val || 0;
      const newTotal = laborVal + ueVal + newMaterial;
      patch({ material_estimate: val, budget: newTotal || null });
    };

    return (
      <div className="space-y-3 rounded-xl border border-border/60 bg-background p-4 shadow-sm">
        <div className="flex items-baseline justify-between">
          <Label className="rf-section-label">
            {isBuilder ? t("tasks.contractValue", "Contract Value") : t("tasks.budget")}
          </Label>
          <span className="text-lg font-bold tabular-nums text-primary">
            {Math.round(displayTotal).toLocaleString("sv-SE")} kr
          </span>
        </div>
        <div className="space-y-1.5 pt-2 border-t">
          {isBuilder && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">{t("tasks.costType", "Kostnadstyp")}</span>
              <Select
                value={task.task_cost_type || "own_labor"}
                onValueChange={(v) => {
                  const updates: Partial<Task> = { task_cost_type: v };
                  if (v === "own_labor" && task.task_cost_type === "subcontractor") {
                    updates.estimated_hours = null;
                    updates.hourly_rate = null;
                  }
                  patch(updates);
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
            </div>
          )}
          {/* Labor row — double-click to edit */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {(task.task_cost_type || "own_labor") === "subcontractor"
                ? t("tasks.subcontractorCost", "UE-kostnad")
                : t("tasks.rotLaborCost", "Arbetskostnad")}
            </span>
            {editingBudgetField === "labor" && laborLumpEditable ? (
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
                className={`text-sm tabular-nums px-2 py-0.5 rounded transition-colors ${laborLumpEditable ? "hover:bg-muted cursor-text" : "cursor-default"}`}
                onDoubleClick={() => { if (laborLumpEditable) setEditingBudgetField("labor"); }}
                title={laborLumpEditable
                  ? t("common.doubleClickToEdit", "Dubbelklicka för att redigera")
                  : t("tasks.editPartsInstead", "Kostnaden är nedbruten i delar — redigera delarna istället")}
              >
                {laborVal > 0 ? `${Math.round(laborVal).toLocaleString("sv-SE")} kr` : <span className="text-muted-foreground/40">0 kr</span>}
              </button>
            )}
          </div>
          {/* Subcontractor row — display only, set via planning table/Renaida */}
          {ueVal > 0 && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">{t("tasks.subcontractorCost", "UE-kostnad")}</span>
              <span className="text-sm tabular-nums px-2 py-0.5">{Math.round(ueVal).toLocaleString("sv-SE")} kr</span>
            </div>
          )}
          {/* Material row — double-click to edit */}
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
  })();

  // ── Purchase tracking summary (active, builder) ──
  const purchaseTrackingSummary = (() => {
    if (isPlanning || !isBuilder) return null;
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
  })();

  // ── ROT deduction (Swedish market) ──
  const rotSection = (() => {
    if (!showTaxDeduction) return null;
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
                patch({ rot_eligible: checked, rot_amount: newAmount });
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
                onChange={(e) => patch({ rot_amount: e.target.value ? parseFloat(e.target.value) : null })}
                className="h-8 w-28 text-right text-sm tabular-nums"
                placeholder="0"
              />
              <span className="text-sm text-muted-foreground">kr</span>
            </div>
          )}
        </div>
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
                onClick={() => patch({ rot_amount: cappedRot })}
              >
                {t("tasks.rotResetSuggested", "Återställ till föreslaget belopp")} ({cappedRot.toLocaleString("sv-SE")} kr)
              </button>
            )}
          </div>
        )}
      </div>
    );
  })();

  // ── Payment / cost tracking (active projects) ──
  const trackingSection = (() => {
    if (isPlanning) return null;
    return (
      <div className="rounded-xl border border-border/60 bg-background p-4 shadow-sm space-y-3">
        <p className="rf-section-label">
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
                <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(ratio * 100, 100)}%` }} />
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
              onChange={(e) => patch({ ordered_amount: e.target.value ? parseFloat(e.target.value) : null })}
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
              onChange={(e) => patch({ paid_amount: e.target.value ? parseFloat(e.target.value) : null })}
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
              value={taskSuppliers.find((s) => s.id === task.supplier_id)?.name || ""}
              onChange={(suppId) => patch({ supplier_id: suppId })}
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
                  patch({ payment_status: "partially_paid" });
                } else {
                  patch({
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

        {/* ÄTA checkbox + approval */}
        {"is_ata" in task && (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="edit-task-is-ata"
                checked={task.is_ata}
                onCheckedChange={(checked) => patch({ is_ata: !!checked })}
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
              <AtaApprovalSection
                taskId={task.id}
                projectId={projectId}
                ataStatus={(task as Record<string, unknown>).ata_status as string | null}
                isHomeowner={isHomeowner}
              />
            )}
          </div>
        )}
      </div>
    );
  })();

  return (
    <div className="flex flex-col gap-4 px-6 py-5">
      {isPlanning && isHomeowner ? planningHomeowner : isPlanning ? planningBuilder : activeBudgetBox}
      {purchaseTrackingSummary}
      {rotSection}
      {trackingSection}
    </div>
  );
}
