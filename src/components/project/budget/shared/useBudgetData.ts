// Data-fetch + row-construction for the budget tab. Both Owner and Contractor
// shells consume the same hook — the DB shape is identical, only the render
// branches by role.
//
// fetchData reads/writes `defaultLaborCostPercent` in a way that causes a
// single re-fetch on first load: the initial value is 50, the profile fetch
// may set it to a different value, and `useCallback` deps include it, so the
// effect re-runs once with the corrected percent. This produces accurate
// laborCost rows on second pass without an explicit "two-stage init" guard.

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { computeEvidenceStatus } from "@/lib/evidenceStatus";
import {
  computeTaskEstimatedCost,
  computeTaskLaborCost,
  computeMaterialBudget,
} from "./budgetCalc";
import type { BudgetRow } from "./types";

export interface PurchaseOrderInfo {
  status: string;
  vendor: string;
  total: number;
  rotAmount: number;
}

export interface UseBudgetDataResult {
  rows: BudgetRow[];
  extraTotal: number;
  projectBudget: number;
  loading: boolean;
  defaultLaborCostPercent: number;
  currentProfileId: string | null;
  suppliers: { id: string; name: string }[];
  purchaseOrderInfo: Map<string, PurchaseOrderInfo>;
  allRooms: { id: string; name: string }[];
  refetch: () => Promise<void>;
  refetchRooms: () => Promise<void>;
}

export function useBudgetData(projectId: string): UseBudgetDataResult {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [extraTotal, setExtraTotal] = useState(0);
  const [projectBudget, setProjectBudget] = useState(0);
  const [loading, setLoading] = useState(true);
  const [defaultLaborCostPercent, setDefaultLaborCostPercent] = useState(50);
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [purchaseOrderInfo, setPurchaseOrderInfo] = useState<Map<string, PurchaseOrderInfo>>(new Map());
  const [allRooms, setAllRooms] = useState<{ id: string; name: string }[]>([]);

  const fetchData = useCallback(async () => {
    try {
      // Fetch profile defaults for labor cost percent + suppliers
      const fetchedSuppliers: { id: string; name: string }[] = [];
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, default_labor_cost_percent")
          .eq("user_id", user.id)
          .single();
        if (profile) {
          if (profile.default_labor_cost_percent != null) {
            setDefaultLaborCostPercent(profile.default_labor_cost_percent);
          }
          setCurrentProfileId(profile.id);
          // Fetch suppliers for this profile
          const { data: suppData } = await supabase
            .from("suppliers")
            .select("id, name")
            .eq("profile_id", profile.id)
            .order("name");
          if (suppData) {
            fetchedSuppliers.push(...suppData);
            setSuppliers(suppData);
          }
        }
      }

      const [tasksRes, materialsRes, extraRes, projectRes, taskDocsRes, materialDocsRes, purchaseOrdersRes] = await Promise.all([
        supabase
          .from("tasks")
          .select("id, title, status, budget, ordered_amount, payment_status, paid_amount, room_id, cost_center, start_date, finish_date, is_ata, estimated_hours, hourly_rate, labor_cost_percent, subcontractor_cost, markup_percent, material_estimate, material_markup_percent, task_cost_type, rot_amount, supplier_id")
          .eq("project_id", projectId),
        supabase
          .from("materials")
          .select("id, name, price_total, quantity, price_per_unit, ordered_amount, paid_amount, status, room_id, task_id, vendor_name, source_material_id, purchase_order_id")
          .eq("project_id", projectId)
          .eq("exclude_from_budget", false),
        supabase
          .from("materials")
          .select("id, name, price_total, quantity, price_per_unit, ordered_amount, paid_amount, status, room_id, task_id, vendor_name, source_material_id, purchase_order_id")
          .eq("project_id", projectId)
          .eq("exclude_from_budget", true),
        supabase
          .from("projects")
          .select("contract_value")
          .eq("id", projectId)
          .single(),
        supabase
          .from("task_file_links")
          .select("task_id, file_type")
          .eq("project_id", projectId)
          .not("task_id", "is", null),
        supabase
          .from("task_file_links")
          .select("material_id, file_type")
          .eq("project_id", projectId)
          .not("material_id", "is", null),
        supabase
          .from("purchase_orders")
          .select("id, status, vendor_name, total, rot_amount")
          .eq("project_id", projectId),
      ]);

      if (tasksRes.error) throw tasksRes.error;
      if (materialsRes.error) throw materialsRes.error;
      if (extraRes.error) throw extraRes.error;

      setProjectBudget(projectRes.data?.contract_value ?? 0);

      // Build ÄTA rows from both tasks (is_ata) and materials (exclude_from_budget)
      const ataTasks = (tasksRes.data || []).filter((t) => t.is_ata);
      const ataMaterials = extraRes.data || [];
      const materialAtaTotal = ataMaterials.reduce((sum, m) => sum + (m.price_total || 0), 0);
      const taskAtaTotal = ataTasks.reduce((sum, t) => sum + (t.budget || 0), 0);
      setExtraTotal(materialAtaTotal + taskAtaTotal);

      // Build document count maps + qualifying file maps (invoice/receipt)
      const taskDocCounts = new Map<string, number>();
      const taskHasInvoice = new Map<string, boolean>();
      if (!taskDocsRes.error) {
        (taskDocsRes.data || []).forEach((d: { task_id: string | null; file_type?: string }) => {
          if (d.task_id) {
            taskDocCounts.set(d.task_id, (taskDocCounts.get(d.task_id) || 0) + 1);
            if (d.file_type === "invoice" || d.file_type === "receipt") {
              taskHasInvoice.set(d.task_id, true);
            }
          }
        });
      }

      const materialDocCounts = new Map<string, number>();
      const materialHasInvoice = new Map<string, boolean>();
      if (!materialDocsRes.error) {
        (materialDocsRes.data || []).forEach((d: { material_id: string | null; file_type?: string }) => {
          if (d.material_id) {
            materialDocCounts.set(d.material_id, (materialDocCounts.get(d.material_id) || 0) + 1);
            if (d.file_type === "invoice" || d.file_type === "receipt") {
              materialHasInvoice.set(d.material_id, true);
            }
          }
        });
      }

      // Collect unique room_ids to resolve names
      const roomIds = new Set<string>();
      for (const tt of tasksRes.data || []) {
        if (tt.room_id) roomIds.add(tt.room_id);
      }
      for (const m of materialsRes.data || []) {
        if (m.room_id) roomIds.add(m.room_id);
      }

      const roomMap = new Map<string, string>();
      if (roomIds.size > 0) {
        const { data: rooms } = await supabase
          .from("rooms")
          .select("id, name")
          .in("id", Array.from(roomIds));
        for (const r of rooms || []) {
          roomMap.set(r.id, r.name);
        }
      }

      // Build supplier name map
      const supplierMap = new Map<string, string>();
      for (const s of fetchedSuppliers) supplierMap.set(s.id, s.name);

      // Build PO info map: purchase_order_id → { status, vendor_name, total }
      const poInfoMap = new Map<string, PurchaseOrderInfo>();
      const poStatusMap = new Map<string, string>();
      if (!purchaseOrdersRes.error) {
        for (const po of purchaseOrdersRes.data || []) {
          poStatusMap.set(po.id, po.status);
          poInfoMap.set(po.id, {
            status: po.status,
            vendor: po.vendor_name,
            total: po.total ?? 0,
            rotAmount: (po as Record<string, unknown>).rot_amount as number ?? 0,
          });
        }
      }
      setPurchaseOrderInfo(poInfoMap);

      // Phase helper for purchase/material rows
      const derivePurchasePhase = (m: { paid_amount?: number | null; status?: string | null; purchase_order_id?: string | null }): "budget" | "ordered" | "actual" => {
        const poStatus = m.purchase_order_id ? poStatusMap.get(m.purchase_order_id) : undefined;
        if ((m.paid_amount ?? 0) > 0) return "actual";
        if (poStatus === "delivered") return "actual";
        if (m.status === "delivered" || m.status === "paid" || m.status === "billed") return "actual";
        if (poStatus === "ordered") return "ordered";
        if (m.status === "ordered" || m.status === "approved" || m.status === "submitted" || m.status === "to_order") return "ordered";
        return "budget";
      };

      // --- P&L row construction ---
      // Split materials into budget posts (planned) vs purchases (actual)
      const allMaterials = materialsRes.data || [];
      const plannedMaterials = allMaterials.filter(m => m.status === "planned");
      const purchaseMaterials = allMaterials.filter(m => m.status !== "planned");

      // Build consumed-by-source map: source_material_id → sum of purchase costs
      const consumedBySourceId = new Map<string, number>();
      for (const m of purchaseMaterials) {
        if (m.source_material_id) {
          const cost = m.price_total ?? (((m.quantity || 0) * (m.price_per_unit || 0)) || 0);
          consumedBySourceId.set(m.source_material_id, (consumedBySourceId.get(m.source_material_id) || 0) + cost);
        }
      }

      // Track which tasks have planned materials (for synthetic budget post fallback)
      const tasksWithPlannedMaterials = new Set(plannedMaterials.filter(m => m.task_id).map(m => m.task_id));

      // Keep legacy materialPlannedMap for computeTaskEstimatedCost (used in evidence calc)
      const materialPlannedMap = new Map<string, number>();
      for (const m of plannedMaterials) {
        if (m.task_id) {
          const cost = m.price_total ?? (((m.quantity || 0) * (m.price_per_unit || 0)) || 0);
          materialPlannedMap.set(m.task_id, (materialPlannedMap.get(m.task_id) || 0) + cost);
        }
      }

      // 1. Task rows (work budget posts) — labor cost only, materials are separate rows
      const taskRows: BudgetRow[] = (tasksRes.data || []).filter((tt) => !tt.is_ata).map((tt) => {
        const attachmentCount = taskDocCounts.get(tt.id) || 0;
        const laborCost = computeTaskLaborCost(tt, defaultLaborCostPercent);
        const fullEstCost = computeTaskEstimatedCost(tt, defaultLaborCostPercent, materialPlannedMap.get(tt.id));
        const taskPhase: "budget" | "ordered" | "actual" =
          (tt.paid_amount ?? 0) > 0 ? "actual"
          : (tt.ordered_amount ?? 0) > 0 ? "ordered"
          : "budget";
        return {
          id: tt.id,
          name: tt.title,
          type: "task" as const,
          budget: tt.budget ?? 0,
          paid: tt.paid_amount ?? 0,
          estimatedCost: laborCost,
          isEstimated: (tt.paid_amount ?? 0) <= 0,
          taskCostType: (tt as Record<string, unknown>).task_cost_type as string | null ?? null,
          room: tt.room_id ? roomMap.get(tt.room_id) : undefined,
          roomId: tt.room_id ?? undefined,
          assignee: undefined,
          assigneeId: undefined,
          costCenter: tt.cost_center ?? undefined,
          startDate: tt.start_date ?? undefined,
          finishDate: tt.finish_date ?? undefined,
          hasAttachment: attachmentCount > 0,
          attachmentCount,
          materialBudget: computeMaterialBudget(tt, materialPlannedMap.get(tt.id)),
          materialConsumed: 0,
          status: tt.status ?? undefined,
          estimatedHours: tt.estimated_hours ?? undefined,
          hourlyRate: tt.hourly_rate ?? undefined,
          subcontractorCost: tt.subcontractor_cost ?? undefined,
          markupPercent: tt.markup_percent ?? undefined,
          materialMarkupPercent: tt.material_markup_percent ?? undefined,
          laborCostPercent: tt.labor_cost_percent ?? undefined,
          paymentStatus: tt.payment_status ?? undefined,
          orderedAmount: tt.ordered_amount ?? undefined,
          supplierId: (tt as Record<string, unknown>).supplier_id as string ?? undefined,
          supplierName: (tt as Record<string, unknown>).supplier_id ? supplierMap.get((tt as Record<string, unknown>).supplier_id as string) : undefined,
          rotAmount: (tt as Record<string, unknown>).rot_amount as number ?? undefined,
          evidenceStatus: computeEvidenceStatus({
            rowType: "task",
            status: tt.status,
            budget: tt.budget ?? 0,
            paid: tt.paid_amount ?? 0,
            cost: fullEstCost,
            hasQualifyingFile: taskHasInvoice.get(tt.id) ?? false,
            fileCount: attachmentCount,
          }),
          phase: taskPhase,
        };
      });

      // 2. Material budget post rows (planned materials as own rows)
      const materialBudgetRows: BudgetRow[] = plannedMaterials.map((m) => {
        const attachmentCount = materialDocCounts.get(m.id) || 0;
        const budgetAmount = m.price_total ?? (((m.quantity || 0) * (m.price_per_unit || 0)) || 0);
        const consumed = consumedBySourceId.get(m.id) || 0;
        return {
          id: m.id,
          name: m.name,
          type: "material" as const,
          isBudgetPost: true,
          budget: budgetAmount,
          paid: m.paid_amount ?? 0,
          estimatedCost: budgetAmount,
          isEstimated: true,
          room: m.room_id ? roomMap.get(m.room_id) : undefined,
          roomId: m.room_id ?? undefined,
          hasAttachment: attachmentCount > 0,
          attachmentCount,
          isUnlinked: !m.task_id,
          taskId: m.task_id ?? undefined,
          materialBudget: budgetAmount,
          materialConsumed: consumed,
          consumedTotal: consumed,
          status: m.status ?? undefined,
          quantity: m.quantity ?? undefined,
          pricePerUnit: m.price_per_unit ?? undefined,
          orderedAmount: m.ordered_amount ?? undefined,
          vendor: m.vendor_name ?? undefined,
          evidenceStatus: computeEvidenceStatus({
            rowType: "material",
            status: m.status,
            budget: budgetAmount,
            paid: m.paid_amount ?? 0,
            cost: budgetAmount,
            hasQualifyingFile: materialHasInvoice.get(m.id) ?? false,
            fileCount: attachmentCount,
          }),
          phase: "budget",
        };
      });

      // 3. Synthetic material budget posts for tasks with material_estimate but no planned rows
      const syntheticBudgetRows: BudgetRow[] = [];
      for (const tt of tasksRes.data || []) {
        if (tt.is_ata) continue;
        if (tasksWithPlannedMaterials.has(tt.id)) continue;
        const matEst = tt.material_estimate || 0;
        if (matEst <= 0) continue;
        syntheticBudgetRows.push({
          id: `__synthetic_mat_${tt.id}`,
          name: `${tt.title} — materialbudget`,
          type: "material" as const,
          isBudgetPost: true,
          budget: matEst,
          paid: 0,
          estimatedCost: matEst,
          isEstimated: true,
          room: tt.room_id ? roomMap.get(tt.room_id) : undefined,
          roomId: tt.room_id ?? undefined,
          hasAttachment: false,
          attachmentCount: 0,
          isUnlinked: false,
          taskId: tt.id,
          materialBudget: matEst,
          materialConsumed: 0,
          consumedTotal: 0,
          status: "planned",
          phase: "budget",
        });
      }

      // 4. Purchase rows (actual orders/invoices that consume budget posts)
      // A purchase order's ROT deduction is attributed once — to the first line
      // row of that order — so the budget's ROT column shows it exactly once per
      // order, not per line (Carl 2026-07-12).
      const poRotSeen = new Set<string>();
      const purchaseRows: BudgetRow[] = purchaseMaterials.map((m) => {
        const attachmentCount = materialDocCounts.get(m.id) || 0;
        const purchaseTotal = m.price_total ?? (((m.quantity || 0) * (m.price_per_unit || 0)) || 0);
        const poId = m.purchase_order_id ?? undefined;
        const poRot = poId ? (poInfoMap.get(poId)?.rotAmount ?? 0) : 0;
        let rowRot = 0;
        if (poId && poRot > 0 && !poRotSeen.has(poId)) {
          poRotSeen.add(poId);
          rowRot = poRot;
        }
        return {
          id: m.id,
          name: m.name,
          type: "purchase" as const,
          budget: 0,
          paid: m.paid_amount ?? 0,
          estimatedCost: purchaseTotal,
          isEstimated: (m.paid_amount ?? 0) <= 0,
          room: m.room_id ? roomMap.get(m.room_id) : undefined,
          roomId: m.room_id ?? undefined,
          hasAttachment: attachmentCount > 0,
          attachmentCount,
          isUnlinked: !m.task_id,
          taskId: m.task_id ?? undefined,
          materialBudget: 0,
          materialConsumed: 0,
          sourceMaterialId: m.source_material_id ?? undefined,
          parentBudgetPostId: m.source_material_id ?? undefined,
          status: m.status ?? undefined,
          quantity: m.quantity ?? undefined,
          pricePerUnit: m.price_per_unit ?? undefined,
          orderedAmount: m.ordered_amount ?? undefined,
          vendor: m.vendor_name ?? undefined,
          evidenceStatus: computeEvidenceStatus({
            rowType: "material",
            status: m.status,
            budget: 0,
            paid: m.paid_amount ?? 0,
            cost: purchaseTotal,
            hasQualifyingFile: materialHasInvoice.get(m.id) ?? false,
            fileCount: attachmentCount,
          }),
          phase: derivePurchasePhase(m),
          purchaseOrderId: m.purchase_order_id ?? undefined,
          rotAmount: rowRot || undefined,
        };
      });

      // 5. ÄTA task rows
      const ataTaskRows: BudgetRow[] = ataTasks.map((tt) => {
        const attachmentCount = taskDocCounts.get(tt.id) || 0;
        return {
          id: tt.id,
          name: tt.title,
          type: "task" as const,
          isAta: true,
          budget: tt.budget ?? 0,
          paid: tt.paid_amount ?? 0,
          estimatedCost: computeTaskLaborCost(tt, defaultLaborCostPercent),
          isEstimated: (tt.paid_amount ?? 0) <= 0,
          taskCostType: (tt as Record<string, unknown>).task_cost_type as string | null ?? null,
          room: tt.room_id ? roomMap.get(tt.room_id) : undefined,
          roomId: tt.room_id ?? undefined,
          assignee: undefined,
          assigneeId: undefined,
          costCenter: tt.cost_center ?? undefined,
          hasAttachment: attachmentCount > 0,
          attachmentCount,
          materialBudget: 0,
          materialConsumed: 0,
          status: tt.status ?? undefined,
          subcontractorCost: tt.subcontractor_cost ?? undefined,
          paymentStatus: tt.payment_status ?? undefined,
          phase: (tt.paid_amount ?? 0) > 0 ? "actual"
            : (tt.ordered_amount ?? 0) > 0 ? "ordered"
            : "budget",
        };
      });

      // 6. ÄTA material rows — split planned vs purchases same as main
      const ataPlanned = ataMaterials.filter(m => m.status === "planned");
      const ataPurchases = ataMaterials.filter(m => m.status !== "planned");

      const ataConsumedBySource = new Map<string, number>();
      for (const m of ataPurchases) {
        if (m.source_material_id) {
          const cost = m.price_total ?? (((m.quantity || 0) * (m.price_per_unit || 0)) || 0);
          ataConsumedBySource.set(m.source_material_id, (ataConsumedBySource.get(m.source_material_id) || 0) + cost);
        }
      }

      const ataMaterialBudgetRows: BudgetRow[] = ataPlanned.map((m) => {
        const budgetAmount = m.price_total ?? (((m.quantity || 0) * (m.price_per_unit || 0)) || 0);
        return {
          id: m.id,
          name: m.name,
          type: "material" as const,
          isAta: true,
          isBudgetPost: true,
          budget: budgetAmount,
          paid: m.paid_amount ?? 0,
          estimatedCost: budgetAmount,
          isEstimated: true,
          room: m.room_id ? roomMap.get(m.room_id) : undefined,
          roomId: m.room_id ?? undefined,
          hasAttachment: false,
          attachmentCount: 0,
          isUnlinked: !m.task_id,
          taskId: m.task_id ?? undefined,
          materialBudget: budgetAmount,
          materialConsumed: ataConsumedBySource.get(m.id) || 0,
          consumedTotal: ataConsumedBySource.get(m.id) || 0,
          status: m.status ?? undefined,
          quantity: m.quantity ?? undefined,
          pricePerUnit: m.price_per_unit ?? undefined,
          vendor: m.vendor_name ?? undefined,
          phase: "budget",
        };
      });

      const ataPurchaseRows: BudgetRow[] = ataPurchases.map((m) => {
        const purchaseTotal = m.price_total ?? (((m.quantity || 0) * (m.price_per_unit || 0)) || 0);
        return {
          id: m.id,
          name: m.name,
          type: "purchase" as const,
          isAta: true,
          budget: 0,
          paid: m.paid_amount ?? 0,
          estimatedCost: purchaseTotal,
          isEstimated: (m.paid_amount ?? 0) <= 0,
          room: m.room_id ? roomMap.get(m.room_id) : undefined,
          roomId: m.room_id ?? undefined,
          hasAttachment: false,
          attachmentCount: 0,
          taskId: m.task_id ?? undefined,
          materialBudget: 0,
          materialConsumed: 0,
          sourceMaterialId: m.source_material_id ?? undefined,
          parentBudgetPostId: m.source_material_id ?? undefined,
          status: m.status ?? undefined,
          quantity: m.quantity ?? undefined,
          pricePerUnit: m.price_per_unit ?? undefined,
          vendor: m.vendor_name ?? undefined,
          phase: derivePurchasePhase(m),
          purchaseOrderId: m.purchase_order_id ?? undefined,
        };
      });

      setRows([...taskRows, ...materialBudgetRows, ...syntheticBudgetRows, ...purchaseRows, ...ataTaskRows, ...ataMaterialBudgetRows, ...ataPurchaseRows]);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('budget.failedToLoadData');
      toast({ title: t('common.error'), description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [projectId, toast, defaultLaborCostPercent, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch all rooms for the inline add dropdown
  const fetchRooms = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, name")
        .eq("project_id", projectId)
        .order("name");
      if (error) throw error;
      setAllRooms(data || []);
    } catch (error: unknown) {
      console.error("Failed to fetch rooms:", error);
    }
  }, [projectId]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  return {
    rows,
    extraTotal,
    projectBudget,
    loading,
    defaultLaborCostPercent,
    currentProfileId,
    suppliers,
    purchaseOrderInfo,
    allRooms,
    refetch: fetchData,
    refetchRooms: fetchRooms,
  };
}
