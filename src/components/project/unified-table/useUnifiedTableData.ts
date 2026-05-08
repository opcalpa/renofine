import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { RowType, UnifiedRow } from "./types";

interface Room {
  id: string;
  name: string;
}

interface Stakeholder {
  id: string;
  name: string;
}

interface UseUnifiedTableDataResult {
  rows: UnifiedRow[];
  rooms: Room[];
  stakeholders: Stakeholder[];
  teamMembers: Stakeholder[];
  projectBudget: number;
  extraTotal: number;
  loading: boolean;
  refetch: () => Promise<void>;
}

export function useUnifiedTableData(projectId: string): UseUnifiedTableDataResult {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [teamMembers, setTeamMembers] = useState<Stakeholder[]>([]);
  const [projectBudget, setProjectBudget] = useState(0);
  const [extraTotal, setExtraTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [
        tasksRes,
        materialsRes,
        extraMaterialsRes,
        projectRes,
        roomsRes,
        stakeholdersRes,
        teamRes,
        taskDocsRes,
        materialDocsRes,
      ] = await Promise.all([
        supabase
          .from("tasks")
          .select(
            "id, title, budget, ordered_amount, paid_amount, payment_status, status, priority, progress, room_id, cost_center, start_date, finish_date, due_date, assigned_to_stakeholder_id, estimated_hours, hourly_rate, subcontractor_cost, material_estimate, markup_percent, is_ata"
          )
          .eq("project_id", projectId),
        supabase
          .from("materials")
          .select(
            "id, name, price_total, ordered_amount, paid_amount, status, room_id, task_id, vendor_name, quantity, unit"
          )
          .eq("project_id", projectId)
          .eq("exclude_from_budget", false),
        supabase
          .from("materials")
          .select("price_total")
          .eq("project_id", projectId)
          .eq("exclude_from_budget", true),
        supabase
          .from("projects")
          .select("contract_value")
          .eq("id", projectId)
          .single(),
        supabase
          .from("rooms")
          .select("id, name")
          .eq("project_id", projectId)
          .order("name"),
        supabase
          .from("stakeholders" as never)
          .select("id, name")
          .eq("project_id", projectId),
        supabase
          .from("project_shares")
          .select("shared_with_user_id, role, profiles!project_shares_shared_with_user_id_fkey(id, name)")
          .eq("project_id", projectId),
        supabase
          .from("task_file_links")
          .select("task_id")
          .eq("project_id", projectId)
          .not("task_id", "is", null),
        supabase
          .from("task_file_links")
          .select("material_id")
          .eq("project_id", projectId)
          .not("material_id", "is", null),
      ]);

      if (tasksRes.error) throw tasksRes.error;
      if (materialsRes.error) throw materialsRes.error;
      if (extraMaterialsRes.error) throw extraMaterialsRes.error;

      setProjectBudget(projectRes.data?.contract_value ?? 0);

      // ATA total
      const materialAtaTotal = (extraMaterialsRes.data || []).reduce(
        (sum, m) => sum + (m.price_total || 0),
        0
      );
      const taskAtaTotal = (tasksRes.data || [])
        .filter((t) => t.is_ata)
        .reduce((sum, t) => sum + (t.budget || 0), 0);
      setExtraTotal(materialAtaTotal + taskAtaTotal);

      // Room map
      const roomList = roomsRes.data || [];
      setRooms(roomList);
      const roomMap = new Map(roomList.map((r) => [r.id, r.name]));

      // Stakeholder map
      const stakeList: Stakeholder[] = ((stakeholdersRes.data || []) as unknown as { id: string; name: string }[]).map((s) => ({
        id: s.id,
        name: s.name,
      }));
      setStakeholders(stakeList);
      const stakeholderMap = new Map(stakeList.map((s) => [s.id, s.name]));

      // Team member map (from project_shares → profiles)
      const teamList: Stakeholder[] = [];
      const seenIds = new Set(stakeList.map((s) => s.id));
      for (const share of (teamRes.data || []) as unknown[]) {
        const s = share as { profiles?: { id: string; name: string | null } };
        if (s.profiles && !seenIds.has(s.profiles.id)) {
          seenIds.add(s.profiles.id);
          teamList.push({ id: s.profiles.id, name: s.profiles.name || "Unknown" });
        }
      }
      setTeamMembers(teamList);

      // Document counts
      const taskDocCounts = new Map<string, number>();
      if (!taskDocsRes.error) {
        for (const d of taskDocsRes.data || []) {
          if (d.task_id) {
            taskDocCounts.set(d.task_id, (taskDocCounts.get(d.task_id) || 0) + 1);
          }
        }
      }
      const materialDocCounts = new Map<string, number>();
      if (!materialDocsRes.error) {
        for (const d of materialDocsRes.data || []) {
          if (d.material_id) {
            materialDocCounts.set(d.material_id, (materialDocCounts.get(d.material_id) || 0) + 1);
          }
        }
      }

      // Build task rows (exclude ATA from main list)
      const taskRows: UnifiedRow[] = (tasksRes.data || [])
        .filter((t) => !t.is_ata)
        .map((t) => {
          const attachmentCount = taskDocCounts.get(t.id) || 0;
          const assigneeName = t.assigned_to_stakeholder_id
            ? stakeholderMap.get(t.assigned_to_stakeholder_id)
            : undefined;
          return {
            id: t.id,
            rowType: "task" as RowType,
            name: t.title,
            budget: t.budget ?? 0,
            ordered: t.ordered_amount ?? 0,
            paid: t.paid_amount ?? 0,
            status: t.payment_status || "not_paid",
            taskStatus: t.status ?? "to_do",
            room: t.room_id ? roomMap.get(t.room_id) : undefined,
            roomId: t.room_id ?? undefined,
            costCenter: t.cost_center ?? undefined,
            startDate: t.start_date ?? undefined,
            finishDate: t.finish_date ?? undefined,
            hasAttachment: attachmentCount > 0,
            attachmentCount,
            priority: t.priority ?? undefined,
            progress: t.progress ?? undefined,
            dueDate: t.due_date,
            assignee: assigneeName,
            assigneeId: t.assigned_to_stakeholder_id ?? undefined,
            paymentStatus: t.payment_status ?? undefined,
            estimatedHours: t.estimated_hours,
            hourlyRate: t.hourly_rate,
            subcontractorCost: t.subcontractor_cost,
            materialEstimate: t.material_estimate,
            markupPercent: t.markup_percent,
          };
        });

      // Build material rows
      const materialRows: UnifiedRow[] = (materialsRes.data || []).map((m) => {
        const attachmentCount = materialDocCounts.get(m.id) || 0;
        return {
          id: m.id,
          rowType: "material" as RowType,
          name: m.name,
          budget: m.price_total ?? 0,
          ordered: m.ordered_amount ?? 0,
          paid: m.paid_amount ?? 0,
          status: m.status || "submitted",
          room: m.room_id ? roomMap.get(m.room_id) : undefined,
          roomId: m.room_id ?? undefined,
          hasAttachment: attachmentCount > 0,
          attachmentCount,
          isUnlinked: !m.task_id,
          taskId: m.task_id ?? undefined,
          vendorName: m.vendor_name,
          quantity: m.quantity,
          unit: m.unit,
        };
      });

      setRows([...taskRows, ...materialRows]);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t("unifiedTable.failedToLoadData");
      toast({ title: t("common.error"), description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [projectId, toast, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    rows,
    rooms,
    stakeholders,
    teamMembers,
    projectBudget,
    extraTotal,
    loading,
    refetch: fetchData,
  };
}
