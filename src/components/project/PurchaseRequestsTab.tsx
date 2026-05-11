import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePersistedPreference } from "@/hooks/usePersistedPreference";
import { useTaxDeductionVisible } from "@/hooks/useTaxDeduction";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ColumnToggle } from "@/components/shared/ColumnToggle";
import { useToast } from "@/hooks/use-toast";
import {
  ShoppingCart,
  Loader2,
  Plus,
  Filter,
  ChevronDown,
  Store,
  Image,
  MessageSquare,
  Link2,
  Columns3,
  Rows3,
  Layers,
  Trash2,
  ClipboardList,
  CheckSquare,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CommentsSection } from "@/components/comments/CommentsSection";
import { EntityPhotoGallery } from "@/components/shared/EntityPhotoGallery";
import { QuickReceiptCaptureModal } from "./QuickReceiptCaptureModal";
import { QuoteReviewDialog } from "./QuoteReviewDialog";
import { TaskFilesList } from "./TaskFilesList";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
// ToggleGroup replaced with custom handoff-styled toggle buttons
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { getStatusBadgeColor } from "@/lib/statusColors";
import { ProjectLockBanner } from "./ProjectLockBanner";
import { useProjectLock } from "@/hooks/useProjectLock";
import { PUBLIC_DEMO_PROJECT_ID } from "@/constants/publicDemo";
import { NewPurchaseFromBudgetDialog } from "./NewPurchaseFromBudgetDialog";
import { AddMaterialDialog } from "./overview/AddMaterialDialog";
import { PurchasesTableView } from "./purchases/PurchasesTableView";
import { PurchasesKanbanView } from "./purchases/PurchasesKanbanView";
import { usePurchasesTableView } from "./purchases/usePurchasesTableView";
import { EXTRA_COLUMN_KEYS as PURCHASE_EXTRA_COLUMN_KEYS } from "./purchases/purchasesTypes";

interface Material {
  id: string;
  name: string;
  description?: string | null;
  quantity: number;
  unit: string;
  price_per_unit: number | null;
  price_total: number | null;
  ordered_amount: number | null;
  paid_amount: number | null;
  vendor_name: string | null;
  vendor_link: string | null;
  status: string;
  exclude_from_budget: boolean;
  created_at: string;
  task_id: string | null;
  room_id: string | null;
  created_by_user_id: string | null;
  assigned_to_user_id: string | null;
  source_material_id?: string | null;
  purchase_order_id?: string | null;
  rot_amount?: number | null;
  paid_date?: string | null;
  creator?: {
    name: string;
  } | null;
  assigned_to?: {
    name: string;
  } | null;
  task?: {
    title: string;
  } | null;
  room?: {
    name: string;
  } | null;
  hasAttachment?: boolean;
  attachmentCount?: number;
}

interface PurchaseOrder {
  id: string;
  vendor_name: string;
  total: number;
  status: string;
  ordered_at: string | null;
  delivered_at: string | null;
  receipt_total: number | null;
  receipt_matched_at: string | null;
  source: string | null;
  notes: string | null;
  created_at: string;
}

interface PurchaseRequestsTabProps {
  projectId: string;
  openEntityId?: string | null;
  onEntityOpened?: () => void;
  currency?: string | null;
}

const PurchaseRequestsTab = ({ projectId, openEntityId, onEntityOpened, currency }: PurchaseRequestsTabProps) => {
  const { t } = useTranslation();
  const { showTaxDeduction } = useTaxDeductionVisible();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPOIds, setExpandedPOIds] = useState<Set<string>>(new Set());
  const [allocatingPOId, setAllocatingPOId] = useState<string | null>(null);
  // Subset bulk-select: only one PO can be in select mode at a time
  const [selectModePoId, setSelectModePoId] = useState<string | null>(null);
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [addPlannedDialogOpen, setAddPlannedDialogOpen] = useState(false);
  const [poToDelete, setPOToDelete] = useState<PurchaseOrder | null>(null);
  const [deletingPO, setDeletingPO] = useState(false);
  const [quoteReviewFile, setQuoteReviewFile] = useState<File | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [budgetPurchaseDialog, setBudgetPurchaseDialog] = useState<{ open: boolean; planned: Material | null; usedAmount: number }>({ open: false, planned: null, usedAmount: 0 });
  const [budgetExtraColsArr, setBudgetExtraColsArr] = usePersistedPreference<string[]>(`budget-cols-${projectId}`, []);
  const budgetExtraCols = new Set(budgetExtraColsArr);
  const toggleBudgetCol = (key: string) => {
    const next = new Set(budgetExtraColsArr);
    if (next.has(key)) next.delete(key); else next.add(key);
    setBudgetExtraColsArr([...next]);
  };
  const [creating, setCreating] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [rooms, setRooms] = useState<{ id: string; name: string }[]>([]);
  const [tasks, setTasks] = useState<{ id: string; title: string; budget: number | null; material_estimate: number | null; is_ata: boolean; materialSpent: number }[]>([]);
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string }[]>([]);
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);
  const [isProjectOwner, setIsProjectOwner] = useState<boolean>(false);
  const [userPurchasesAccess, setUserPurchasesAccess] = useState<string>('none');
  const [userPurchasesScope, setUserPurchasesScope] = useState<string>('assigned');
  const [permissionsResolved, setPermissionsResolved] = useState(false);

  // View mode — persisted per project + synced to server
  const [viewMode, handleSetViewMode] = usePersistedPreference<'kanban' | 'table'>(`purchases-view-mode-${projectId}`, 'table');

  // Table view state (lifted so toolbar renders in parent row)
  const purchaseTableViewState = usePurchasesTableView(projectId);

  // Filter state (multi-select sets)
  const [filterStatuses, setFilterStatuses] = useState<Set<string>>(new Set());
  const [filterRooms, setFilterRooms] = useState<Set<string>>(new Set());
  const [filterTasks, setFilterTasks] = useState<Set<string>>(new Set());
  const [filterCreatedBy, setFilterCreatedBy] = useState<Set<string>>(new Set());
  const [filterAttachment, setFilterAttachment] = useState<Set<string>>(new Set());

  const { toast } = useToast();
  const { lockStatus } = useProjectLock(projectId);

  useEffect(() => {
    fetchUserPermissions();
    fetchRooms();
    fetchTasks();
    fetchTeamMembers();

    const channel = supabase
      .channel('purchase_orders_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'materials' },
        () => {
          fetchMaterials();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'purchase_orders' },
        () => {
          fetchPurchaseOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  // Fetch materials when permissions are resolved
  useEffect(() => {
    if (currentProfileId !== null || permissionsResolved) {
      fetchMaterials();
      fetchPurchaseOrders();
    }
  }, [currentProfileId, projectId, isProjectOwner, permissionsResolved]);

  // Auto-open a specific material from notification deep link
  useEffect(() => {
    if (!openEntityId || materials.length === 0) return;
    const material = materials.find((m) => m.id === openEntityId);
    if (material) {
      openEditDialog(material);
      onEntityOpened?.();
    }
  }, [openEntityId, materials]);

  // Safety timeout: clear openEntityId after 5s if material was never found
  useEffect(() => {
    if (!openEntityId) return;
    const timer = setTimeout(() => {
      onEntityOpened?.();
    }, 5000);
    return () => clearTimeout(timer);
  }, [openEntityId]);

  const fetchUserPermissions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setPermissionsResolved(true);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!profile) {
        setPermissionsResolved(true);
        return;
      }
      setCurrentProfileId(profile.id);

      const { data: project } = await supabase
        .from("projects")
        .select("owner_id")
        .eq("id", projectId)
        .single();

      if (project?.owner_id === profile.id) {
        setIsProjectOwner(true);
        setUserPurchasesAccess('edit');
        setUserPurchasesScope('all');
        setPermissionsResolved(true);
        return;
      }

      setIsProjectOwner(false);

      const { data: share } = await supabase
        .from("project_shares")
        .select("purchases_access, purchases_scope")
        .eq("project_id", projectId)
        .eq("shared_with_user_id", profile.id)
        .maybeSingle();

      if (share) {
        setUserPurchasesAccess(share.purchases_access || 'none');
        setUserPurchasesScope(share.purchases_scope || 'assigned');
      }
      setPermissionsResolved(true);
    } catch (error: unknown) {
      console.error("Error fetching user permissions:", error);
      setPermissionsResolved(true);
    }
  };

  const fetchRooms = async () => {
    try {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, name")
        .eq("project_id", projectId)
        .order("name");

      if (error) throw error;
      setRooms(data || []);
    } catch (error: unknown) {
      console.error("Error fetching rooms:", error);
    }
  };

  const fetchTasks = async () => {
    try {
      const [tasksRes, materialsRes] = await Promise.all([
        supabase
          .from("tasks")
          .select("id, title, budget, material_estimate, is_ata")
          .eq("project_id", projectId)
          .order("created_at", { ascending: true }),
        supabase
          .from("materials")
          .select("task_id, price_total")
          .eq("project_id", projectId)
          .eq("exclude_from_budget", false)
          .not("task_id", "is", null),
      ]);

      if (tasksRes.error) throw tasksRes.error;

      const spendMap = new Map<string, number>();
      (materialsRes.data || []).forEach(m => {
        if (m.task_id) {
          spendMap.set(m.task_id, (spendMap.get(m.task_id) || 0) + (m.price_total || 0));
        }
      });

      setTasks((tasksRes.data || []).map(task => ({
        ...task,
        is_ata: task.is_ata ?? false,
        materialSpent: spendMap.get(task.id) || 0,
      })));
    } catch (error: unknown) {
      console.error("Error fetching tasks:", error);
    }
  };

  const fetchTeamMembers = async () => {
    try {
      const { data: projectData } = await supabase
        .from("projects")
        .select(`
          owner_id,
          profiles!projects_owner_id_fkey(id, name)
        `)
        .eq("id", projectId)
        .single();

      const { data: sharesData } = await supabase
        .from("project_shares")
        .select(`
          shared_with_user_id,
          profiles!project_shares_shared_with_user_id_fkey(id, name)
        `)
        .eq("project_id", projectId);

      const members: { id: string; name: string }[] = [];

      if (projectData?.profiles) {
        const profile: unknown = projectData.profiles;
        members.push({ id: (profile as { id: string; name: string }).id, name: (profile as { id: string; name: string }).name || "Owner" });
      }

      if (sharesData) {
        const existingIds = new Set(members.map(m => m.id));
        sharesData.forEach((share: unknown) => {
          const s = share as { profiles?: { id: string; name: string } };
          if (s.profiles && !existingIds.has(s.profiles.id)) {
            existingIds.add(s.profiles.id);
            members.push({
              id: s.profiles.id,
              name: s.profiles.name || "Team Member"
            });
          }
        });
      }

      setTeamMembers(members);
    } catch (error: unknown) {
      console.error("Error fetching team members:", error);
    }
  };

  // FK is ON DELETE SET NULL → deleting a PO leaves its materials in place
  // with purchase_order_id=null. The user can then re-allocate or delete
  // those rows individually if they wish.
  const handleDeletePO = useCallback(async () => {
    if (!poToDelete) return;
    setDeletingPO(true);
    try {
      const { error } = await supabase
        .from("purchase_orders")
        .delete()
        .eq("id", poToDelete.id);
      if (error) {
        toast({ title: t("common.error"), description: error.message, variant: "destructive" });
        return;
      }
      toast({
        title: t("purchases.poDeleted", "Inköpsorder borttagen"),
        description: t("purchases.poDeletedDesc", "Eventuella radnivå-material finns kvar men är inte längre kopplade till ordern."),
      });
      setPOToDelete(null);
      fetchMaterials();
    } finally {
      setDeletingPO(false);
    }
  }, [poToDelete, t, toast]);

  // Mirrors handleAddMaterialSubmit in PlanningTaskList so planned-material
  // creation produces identical DB rows regardless of which surface invoked it.
  const handleAddPlannedSubmit = useCallback(
    async (data: {
      name: string;
      kind: "material" | "subcontractor";
      linkMode: "existing" | "create" | "none";
      existingTaskId?: string;
      newTaskTitle?: string;
      quantity?: number;
      priceTotal?: number;
      markupPercent?: number;
      file?: File;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, default_hourly_rate")
        .eq("user_id", user.id)
        .single();
      if (!profile) return;

      let taskId: string | null = null;
      if (data.linkMode === "existing" && data.existingTaskId) {
        taskId = data.existingTaskId;
      } else if (data.linkMode === "create" && data.newTaskTitle) {
        const { data: newTask, error: taskErr } = await supabase
          .from("tasks")
          .insert({
            project_id: projectId,
            title: data.newTaskTitle,
            status: "planned",
            priority: "medium",
            created_by_user_id: profile.id,
            hourly_rate: profile.default_hourly_rate ?? null,
          })
          .select("id")
          .single();
        if (taskErr || !newTask) {
          toast({ title: t("common.error"), description: taskErr?.message || "Failed", variant: "destructive" });
          return;
        }
        taskId = newTask.id;
      }

      const qty = data.quantity ?? 1;
      const unitPrice = data.priceTotal ?? 0;
      const { data: newMat, error } = await supabase.from("materials").insert({
        project_id: projectId,
        task_id: taskId,
        name: data.name,
        quantity: qty,
        unit: "st",
        price_per_unit: unitPrice,
        price_total: qty * unitPrice || null,
        status: "planned",
        created_by_user_id: profile.id,
        description: data.kind === "subcontractor" ? "__subcontractor__" : null,
        markup_percent: data.markupPercent ?? null,
      }).select("id").single();

      if (error || !newMat) {
        toast({ title: t("common.error"), description: error?.message || "Failed", variant: "destructive" });
        return;
      }

      if (data.file && newMat.id) {
        const ext = data.file.name.split(".").pop() || "pdf";
        const safeName = data.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `projects/${projectId}/underlag/${newMat.id}_${Date.now()}_${safeName}`;
        await supabase.storage.from("project-files").upload(storagePath, data.file, { upsert: true });
        await supabase.from("task_file_links").insert({
          project_id: projectId,
          material_id: newMat.id,
          file_path: storagePath,
          file_name: data.file.name,
          file_type: ext === "pdf" ? "contract" : "other",
          file_size: data.file.size,
          mime_type: data.file.type,
          linked_by_user_id: profile.id,
        });
      }

      fetchMaterials();
    },
    // fetchMaterials is defined below; it's stable enough — re-declare deps minimally
    [projectId, t, toast] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const fetchMaterials = async () => {
    try {
      let query = supabase
        .from("materials")
        .select(`
          *,
          task:tasks(title),
          room:rooms(name)
        `)
        .eq("project_id", projectId);

      const isPublicDemo = projectId === PUBLIC_DEMO_PROJECT_ID;
      if (!isPublicDemo && !isProjectOwner && userPurchasesScope === 'assigned' && currentProfileId) {
        query = query.eq("created_by_user_id", currentProfileId);
      }

      const [materialsRes, docsRes] = await Promise.all([
        query.order("created_at", { ascending: false }),
        supabase
          .from("task_file_links")
          .select("material_id, file_type")
          .eq("project_id", projectId)
          .not("material_id", "is", null),
      ]);

      if (materialsRes.error) throw materialsRes.error;

      const docCounts = new Map<string, number>();
      const fileCatMap = new Map<string, Set<string>>();
      if (!docsRes.error) {
        (docsRes.data || []).forEach((d: { material_id: string | null; file_type: string }) => {
          if (d.material_id) {
            docCounts.set(d.material_id, (docCounts.get(d.material_id) || 0) + 1);
            if (!fileCatMap.has(d.material_id)) fileCatMap.set(d.material_id, new Set());
            fileCatMap.get(d.material_id)!.add(d.file_type);
          }
        });
      }

      const creatorIds = [...new Set(
        (materialsRes.data || [])
          .map(m => m.created_by_user_id)
          .filter((id): id is string => id !== null)
      )];

      const creatorMap = new Map<string, string>();
      if (creatorIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, name")
          .in("id", creatorIds);

        (profiles || []).forEach(p => {
          if (p.name) creatorMap.set(p.id, p.name);
        });
      }

      // Batch fetch assigned-to profiles
      const assignedIds = [...new Set(
        (materialsRes.data || [])
          .map(m => m.assigned_to_user_id)
          .filter((id): id is string => id !== null)
      )];

      const assignedMap = new Map<string, string>();
      if (assignedIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, name")
          .in("id", assignedIds);

        (profiles || []).forEach(p => {
          if (p.name) assignedMap.set(p.id, p.name);
        });
      }

      const materialsWithNames = (materialsRes.data || []).map((material) => {
        const creatorName = material.created_by_user_id
          ? creatorMap.get(material.created_by_user_id)
          : null;
        const assignedName = material.assigned_to_user_id
          ? assignedMap.get(material.assigned_to_user_id)
          : null;
        const attachmentCount = docCounts.get(material.id) || 0;
        return {
          ...material,
          creator: creatorName ? { name: creatorName } : null,
          assigned_to: assignedName ? { name: assignedName } : null,
          hasAttachment: attachmentCount > 0,
          attachmentCount,
          fileCategories: fileCatMap.has(material.id) ? [...fileCatMap.get(material.id)!] : [],
        };
      });

      setMaterials(materialsWithNames);
    } catch (error: unknown) {
      toast({
        title: t('common.error'),
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchPurchaseOrders = async () => {
    try {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, vendor_name, total, status, ordered_at, delivered_at, receipt_total, receipt_matched_at, source, notes, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setPurchaseOrders(data || []);
    } catch (error: unknown) {
      console.error("Error fetching purchase orders:", error);
    }
  };

  const allocateOrderToTask = useCallback(async (poId: string, taskId: string | null) => {
    setAllocatingPOId(poId);
    try {
      const { error } = await supabase
        .from("materials")
        .update({ task_id: taskId })
        .eq("purchase_order_id", poId)
        .eq("project_id", projectId);
      if (error) throw error;
      toast({
        description: taskId
          ? t("purchases.orderAllocated", "Ordern tilldelad")
          : t("purchases.orderUnallocated", "Ordern är nu oallokerad"),
      });
      fetchMaterials();
    } catch (error: unknown) {
      console.error("Allocate error:", error);
      toast({
        variant: "destructive",
        description: t("purchases.allocateFailed", "Kunde inte tilldela ordern"),
      });
    } finally {
      setAllocatingPOId(null);
    }
  }, [projectId, t, toast]);

  // --- Subset bulk-select handlers (scoped to selectedLineIds) ---

  const exitSelectMode = useCallback(() => {
    setSelectModePoId(null);
    setSelectedLineIds(new Set());
  }, []);

  const toggleLineSelection = useCallback((lineId: string) => {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  }, []);

  const bulkUpdateSelectedLines = useCallback(async (patch: { task_id?: string | null; room_id?: string | null; status?: string }) => {
    if (selectedLineIds.size === 0) return;
    setBulkActionLoading(true);
    try {
      const { error } = await supabase
        .from("materials")
        .update(patch)
        .in("id", Array.from(selectedLineIds))
        .eq("project_id", projectId);
      if (error) throw error;
      toast({
        description: t("purchases.bulkUpdated", "{{count}} rader uppdaterade", { count: selectedLineIds.size }),
      });
      exitSelectMode();
      fetchMaterials();
    } catch (error: unknown) {
      console.error("Bulk update error:", error);
      toast({
        variant: "destructive",
        description: t("purchases.bulkUpdateFailed", "Kunde inte uppdatera markerade rader"),
      });
    } finally {
      setBulkActionLoading(false);
    }
  }, [selectedLineIds, projectId, t, toast, exitSelectMode]);

  const bulkDeleteSelectedLines = useCallback(async () => {
    if (selectedLineIds.size === 0) return;
    if (!window.confirm(t("purchases.confirmBulkDelete", "Ta bort {{count}} valda rader?", { count: selectedLineIds.size }))) return;
    setBulkActionLoading(true);
    try {
      const { error } = await supabase
        .from("materials")
        .delete()
        .in("id", Array.from(selectedLineIds))
        .eq("project_id", projectId);
      if (error) throw error;
      toast({
        description: t("purchases.bulkDeleted", "{{count}} rader togs bort", { count: selectedLineIds.size }),
      });
      exitSelectMode();
      fetchMaterials();
    } catch (error: unknown) {
      console.error("Bulk delete error:", error);
      toast({
        variant: "destructive",
        description: t("purchases.bulkDeleteFailed", "Kunde inte ta bort markerade rader"),
      });
    } finally {
      setBulkActionLoading(false);
    }
  }, [selectedLineIds, projectId, t, toast, exitSelectMode]);

  const allocateOrderToRoom = useCallback(async (poId: string, roomId: string | null) => {
    setAllocatingPOId(poId);
    try {
      const { error } = await supabase
        .from("materials")
        .update({ room_id: roomId })
        .eq("purchase_order_id", poId)
        .eq("project_id", projectId);
      if (error) throw error;
      toast({
        description: roomId
          ? t("purchases.orderAllocatedRoom", "Ordern tilldelad rummet")
          : t("purchases.orderUnallocatedRoom", "Ordern är nu utan rumskoppling"),
      });
      fetchMaterials();
    } catch (error: unknown) {
      console.error("Allocate-room error:", error);
      toast({
        variant: "destructive",
        description: t("purchases.allocateRoomFailed", "Kunde inte tilldela rummet"),
      });
    } finally {
      setAllocatingPOId(null);
    }
  }, [projectId, t, toast]);

  const handleEditMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMaterial) return;

    setCreating(true);
    try {
      const { error } = await supabase
        .from("materials")
        .update({
          name: editingMaterial.name,
          description: editingMaterial.description || null,
          quantity: editingMaterial.quantity,
          unit: editingMaterial.unit,
          price_per_unit: editingMaterial.price_per_unit,
          status: editingMaterial.status || "submitted",
          vendor_name: editingMaterial.vendor_name,
          vendor_link: editingMaterial.vendor_link,
          exclude_from_budget: editingMaterial.exclude_from_budget,
          ordered_amount: editingMaterial.ordered_amount || null,
          paid_amount: editingMaterial.paid_amount || null,
          room_id: editingMaterial.room_id === "none" ? null : editingMaterial.room_id,
          task_id: editingMaterial.task_id === "none" ? null : editingMaterial.task_id,
          assigned_to_user_id: editingMaterial.assigned_to_user_id === "none" ? null : editingMaterial.assigned_to_user_id,
          paid_date: editingMaterial.paid_date || null,
        })
        .eq("id", editingMaterial.id);

      if (error) throw error;

      toast({
        title: t('common.success'),
        description: t('purchases.orderUpdatedSuccess'),
      });

      setEditDialogOpen(false);
      setEditingMaterial(null);
      fetchMaterials();
    } catch (error: unknown) {
      toast({
        title: t('common.error'),
        description: (error as Error).message || t('purchases.updateOrderFailed'),
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const canEditMaterial = useCallback((material: Material): boolean => {
    if (isProjectOwner) return true;
    if (!currentProfileId) return false;

    if (userPurchasesAccess === 'edit') {
      if (userPurchasesScope === 'all') return true;
      return material.created_by_user_id === currentProfileId ||
             material.assigned_to_user_id === currentProfileId;
    }

    if (userPurchasesAccess === 'create') {
      return material.created_by_user_id === currentProfileId ||
             material.assigned_to_user_id === currentProfileId;
    }

    if (userPurchasesAccess === 'view') {
      return material.assigned_to_user_id === currentProfileId;
    }

    return false;
  }, [isProjectOwner, currentProfileId, userPurchasesAccess, userPurchasesScope]);

  const getStatusColor = useCallback((status: string) => getStatusBadgeColor(status), []);

  const createOrderFromPlanned = useCallback(async (planned: Material) => {
    if (!currentProfileId) return;
    const { error } = await supabase.from("materials").insert({
      project_id: projectId,
      task_id: planned.task_id,
      room_id: planned.room_id,
      name: planned.name,
      quantity: planned.quantity,
      unit: planned.unit,
      price_per_unit: planned.price_per_unit,
      price_total: planned.price_total,
      status: "to_order",
      source_material_id: planned.id,
      created_by_user_id: currentProfileId,
    });
    if (error) {
      toast({ variant: "destructive", description: t("purchases.createOrderFailed", "Kunde inte skapa inköpsorder") });
    } else {
      toast({ description: t("purchases.orderCreatedFromPlan", "Inköpsorder skapad från offertrad") });
      fetchMaterials();
    }
  }, [currentProfileId, projectId, fetchMaterials, t]);

  const openEditDialog = useCallback((material: Material) => {
    setEditingMaterial({
      ...material,
      description: material.description || null,
      status: material.status || "submitted",
      room_id: material.room_id || "none",
      task_id: material.task_id || "none",
      assigned_to_user_id: material.assigned_to_user_id || "none"
    });
    setEditDialogOpen(true);
  }, []);

  // Filter helpers
  const toggleFilterValue = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) => {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const totalFilterCount = filterStatuses.size + filterRooms.size + filterTasks.size + filterCreatedBy.size + filterAttachment.size;

  const clearAllFilters = () => {
    setFilterStatuses(new Set());
    setFilterRooms(new Set());
    setFilterTasks(new Set());
    setFilterCreatedBy(new Set());
    setFilterAttachment(new Set());
  };

  // Split planned (budget references) from real orders — exclude subcontractor rows from budget
  const plannedMaterials = materials.filter(m => m.status === "planned" && m.description !== "__subcontractor__");
  // Flat orders = non-planned materials NOT linked to a purchase_order
  // (PO-linked materials are rendered under their PO card instead, to avoid duplication)
  const orderMaterials = materials.filter(m => m.status !== "planned" && !m.purchase_order_id);

  // Group PO-linked materials by their purchase_order_id for the PO section
  const materialsByPOId = new Map<string, Material[]>();
  for (const m of materials) {
    if (m.purchase_order_id) {
      const list = materialsByPOId.get(m.purchase_order_id) || [];
      list.push(m);
      materialsByPOId.set(m.purchase_order_id, list);
    }
  }

  const togglePOExpanded = (poId: string) => {
    setExpandedPOIds((prev) => {
      const next = new Set(prev);
      if (next.has(poId)) next.delete(poId);
      else next.add(poId);
      return next;
    });
  };

  // Paid per planned row: only counts when purchase order status = "paid"
  const paidByPlannedId = new Map<string, number>();
  // Ordered (not yet paid) per planned row: to_order + ordered statuses
  const orderedByPlannedId = new Map<string, number>();
  for (const m of orderMaterials) {
    if (!m.source_material_id) continue;
    if (m.status === "paid") {
      paidByPlannedId.set(m.source_material_id,
        (paidByPlannedId.get(m.source_material_id) || 0) + (m.price_total || 0));
    } else {
      orderedByPlannedId.set(m.source_material_id,
        (orderedByPlannedId.get(m.source_material_id) || 0) + (m.price_total || 0));
    }
  }

  // Filter real orders only
  const filteredMaterials = orderMaterials.filter((material) => {
    if (filterStatuses.size > 0 && !filterStatuses.has(material.status)) return false;
    if (filterRooms.size > 0) {
      const roomMatch = material.room_id ? filterRooms.has(material.room_id) : filterRooms.has("none");
      if (!roomMatch) return false;
    }
    if (filterTasks.size > 0) {
      const taskMatch = material.task_id ? filterTasks.has(material.task_id) : filterTasks.has("none");
      if (!taskMatch) return false;
    }
    if (filterCreatedBy.size > 0 && material.created_by_user_id && !filterCreatedBy.has(material.created_by_user_id)) return false;
    if (filterAttachment.size > 0) {
      if (filterAttachment.has("has") && !material.hasAttachment) return false;
      if (filterAttachment.has("missing") && material.hasAttachment) return false;
    }
    return true;
  });

  // Count helpers for filter popover (based on real orders only)
  const getStatusCount = (status: string) => orderMaterials.filter(m => m.status === status).length;
  const getRoomCount = (id: string) => orderMaterials.filter(m => id === "none" ? !m.room_id : m.room_id === id).length;
  const getTaskCount = (id: string) => orderMaterials.filter(m => id === "none" ? !m.task_id : m.task_id === id).length;
  const getCreatorCount = (id: string) => orderMaterials.filter(m => m.created_by_user_id === id).length;

  // Get unique creators (from real orders)
  const uniqueCreators = Array.from(
    new Map(
      orderMaterials
        .filter((m) => m.created_by_user_id && m.creator?.name)
        .map((m) => [m.created_by_user_id, { id: m.created_by_user_id!, name: m.creator!.name }])
    ).values()
  );

  const statusOptions = [
    { value: "submitted", labelKey: "materialStatuses.submitted" },
    { value: "approved", labelKey: "materialStatuses.approved" },
    { value: "billed", labelKey: "materialStatuses.billed" },
    { value: "paid", labelKey: "materialStatuses.paid" },
    { value: "paused", labelKey: "materialStatuses.paused" },
    { value: "declined", labelKey: "materialStatuses.declined" },
  ];

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <ProjectLockBanner lockStatus={lockStatus} />

      {/* Page header — kicker + serif title */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="kicker">{t('purchases.kicker', 'Inköp & material')}</span>
          <h2 className="font-display text-xl font-normal tracking-tight mt-0.5">
            {orderMaterials.length} {t('purchases.orders', 'inköp')} · {orderMaterials.filter(m => m.status === 'paid').length} {t('materialStatuses.paid', 'betalda')}
          </h2>
        </div>
        {(isProjectOwner || userPurchasesAccess === 'edit' || userPurchasesAccess === 'create') && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddPlannedDialogOpen(true)}
            >
              <ClipboardList className="h-4 w-4 mr-2" />
              {t('purchases.addPlannedMaterial', 'Planerat material')}
            </Button>
            <Button size="sm" onClick={() => setReceiptModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('purchases.addOrder')}
            </Button>
            <QuickReceiptCaptureModal
              projectId={projectId}
              open={receiptModalOpen}
              onOpenChange={setReceiptModalOpen}
              onSuccess={() => fetchMaterials()}
              onSwitchToQuoteImport={(file) => setQuoteReviewFile(file)}
            />
            <AddMaterialDialog
              open={addPlannedDialogOpen}
              onOpenChange={setAddPlannedDialogOpen}
              tasks={tasks.map((tt) => ({ id: tt.id, title: tt.title }))}
              hideKindToggle
              currency={currency}
              onAdd={handleAddPlannedSubmit}
            />
          </div>
        )}
      </div>

      {/* Material budget — unified strip with divide-x */}
      {plannedMaterials.length > 0 && (() => {
        const totalBudget = plannedMaterials.reduce((s, m) => s + (m.price_total || 0), 0);
        const totalOrdered = plannedMaterials.reduce((s, m) => s + (orderedByPlannedId.get(m.id) || 0), 0);
        const totalPaid = plannedMaterials.reduce((s, m) => s + (paidByPlannedId.get(m.id) || 0), 0);
        return (
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="grid divide-x divide-border overflow-x-auto" style={{ gridTemplateColumns: `repeat(${plannedMaterials.length + 1}, minmax(150px, 1fr))` }}>
              {plannedMaterials.map((m) => {
                const budget = m.price_total || 0;
                const ordered = orderedByPlannedId.get(m.id) || 0;
                const paid = paidByPlannedId.get(m.id) || 0;
                const spent = paid + ordered;
                const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
                const overBudget = spent > budget;
                return (
                  <button
                    key={m.id}
                    type="button"
                    className="text-left p-4 hover:bg-accent/50 transition-colors cursor-pointer"
                    onClick={() => setBudgetPurchaseDialog({ open: true, planned: m, usedAmount: paid })}
                  >
                    <span className="kicker truncate block">{m.name}</span>
                    <p className={cn("text-2xl font-display font-normal tnum mt-1", overBudget && "text-destructive")}>
                      {formatCurrency(budget, currency)}
                    </p>
                    <div className="h-[3px] mt-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", overBudget ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500")}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1.5 tnum">
                      {t("purchases.ordered", "Beställt")}: {formatCurrency(ordered, currency)}
                    </p>
                  </button>
                );
              })}
              {/* Totals cell */}
              <div className="p-4">
                <span className="kicker">{t("purchases.totalBudget", "Totalbudget")}</span>
                <p className="text-2xl font-display font-normal tnum mt-1">
                  {formatCurrency(totalBudget, currency)}
                </p>
                <div className="flex flex-col gap-0.5 mt-2 text-[11px] tnum">
                  <span className="text-amber-600">{t("purchases.ordered", "Beställt")}: {formatCurrency(totalOrdered, currency)}</span>
                  <span className="text-emerald-600">{t("purchases.paid", "Betalt")}: {formatCurrency(totalPaid, currency)}</span>
                  <span className="font-medium">{t("purchases.remaining", "Kvar")}: {formatCurrency(totalBudget - totalPaid, currency)}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Inköpsorder — grouped by purchase_order_id */}
      {purchaseOrders.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display font-normal flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              {t("purchases.purchaseOrdersTitle", "Inköpsorder")}
              <Badge variant="secondary" className="ml-1 text-xs">{purchaseOrders.length}</Badge>
            </CardTitle>
            <CardDescription className="text-xs">
              {t(
                "purchases.purchaseOrdersDescription",
                "Beställningar från leverantörer. Tilldela rader till tasks för budgetuppföljning.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {purchaseOrders.map((po) => {
              const rows = materialsByPOId.get(po.id) || [];
              const isExpanded = expandedPOIds.has(po.id);
              const isAllocating = allocatingPOId === po.id;
              const allocatedTaskIds = new Set(rows.map(r => r.task_id).filter((id): id is string => !!id));
              const bulkValue = allocatedTaskIds.size === 1
                ? Array.from(allocatedTaskIds)[0]
                : allocatedTaskIds.size > 1 ? "mixed" : "none";
              const allocatedRoomIds = new Set(rows.map(r => r.room_id).filter((id): id is string => !!id));
              const bulkRoomValue = allocatedRoomIds.size === 1
                ? Array.from(allocatedRoomIds)[0]
                : allocatedRoomIds.size > 1 ? "mixed" : "none";
              const statusColor =
                po.status === "delivered" ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                po.status === "ordered" ? "bg-amber-100 text-amber-700 border-amber-200" :
                po.status === "cancelled" ? "bg-red-100 text-red-700 border-red-200" :
                "bg-muted text-muted-foreground border-border";
              return (
                <div key={po.id} className="rounded-lg border bg-card overflow-hidden">
                  <div className="flex items-center gap-3 p-3 hover:bg-accent/30">
                    <button
                      type="button"
                      onClick={() => togglePOExpanded(po.id)}
                      className="flex-shrink-0"
                      title={isExpanded ? t("common.collapse", "Fäll ihop") : t("common.expand", "Expandera")}
                    >
                      <ChevronDown className={cn("h-4 w-4 transition-transform", !isExpanded && "-rotate-90")} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{po.vendor_name}</span>
                        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 capitalize", statusColor)}>
                          {t(`purchaseOrderStatus.${po.status}`, po.status)}
                        </Badge>
                        {po.source && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {t(`purchaseOrderSource.${po.source}`, po.source)}
                          </Badge>
                        )}
                        {po.notes && (
                          <span className="text-[11px] text-muted-foreground">{po.notes}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground tnum">
                        <span className="font-medium text-foreground">{formatCurrency(po.total, currency)}</span>
                        <span>{t("purchases.linesCount", { defaultValue: "{{count}} rader", count: rows.length })}</span>
                        {po.delivered_at && <span>{t("purchases.delivered", "Levererad")}: {new Date(po.delivered_at).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    {/* Allocate-all dropdown */}
                    <div className="flex-shrink-0">
                      <Select
                        value={bulkValue}
                        disabled={isAllocating || rows.length === 0}
                        onValueChange={(v) => allocateOrderToTask(po.id, v === "none" ? null : v)}
                      >
                        <SelectTrigger className="h-8 text-xs w-[200px]">
                          {isAllocating ? (
                            <span className="flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> {t("common.saving", "Sparar...")}</span>
                          ) : (
                            <SelectValue
                              placeholder={t("purchases.allocateAllTo", "Tilldela alla till...")}
                            />
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("purchases.unallocated", "Oallokerat")}</SelectItem>
                          {bulkValue === "mixed" && (
                            <SelectItem value="mixed" disabled>
                              {t("purchases.mixedAllocation", "Olika tasks")}
                            </SelectItem>
                          )}
                          {tasks.map((task) => (
                            <SelectItem key={task.id} value={task.id}>{task.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Allocate-all-to-room dropdown */}
                    {rooms.length > 0 && (
                      <div className="flex-shrink-0">
                        <Select
                          value={bulkRoomValue}
                          disabled={isAllocating || rows.length === 0}
                          onValueChange={(v) => allocateOrderToRoom(po.id, v === "none" ? null : v)}
                        >
                          <SelectTrigger className="h-8 text-xs w-[180px]">
                            {isAllocating ? (
                              <span className="flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> {t("common.saving", "Sparar...")}</span>
                            ) : (
                              <SelectValue
                                placeholder={t("purchases.allocateAllToRoom", "Tilldela alla till rum...")}
                              />
                            )}
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{t("purchases.noRoom", "Inget rum")}</SelectItem>
                            {bulkRoomValue === "mixed" && (
                              <SelectItem value="mixed" disabled>
                                {t("purchases.mixedRoomAllocation", "Olika rum")}
                              </SelectItem>
                            )}
                            {rooms.map((room) => (
                              <SelectItem key={room.id} value={room.id}>{room.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {(isProjectOwner || userPurchasesAccess === 'edit') && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0"
                        onClick={() => setPOToDelete(po)}
                        title={t("purchases.deletePO", "Ta bort inköpsorder")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {isExpanded && rows.length > 0 && (() => {
                    const inSelectMode = selectModePoId === po.id;
                    const rowsInThisPo = new Set(rows.map(r => r.id));
                    const selectedInThisPo = Array.from(selectedLineIds).filter(id => rowsInThisPo.has(id));
                    const allSelected = rows.length > 0 && selectedInThisPo.length === rows.length;
                    const someSelected = selectedInThisPo.length > 0;
                    const canEdit = isProjectOwner || userPurchasesAccess === 'edit';
                    return (
                      <div className="border-t bg-muted/20 px-3 py-2 space-y-1">
                        {/* Toolbar: Välj-toggle or action bar */}
                        {canEdit && (
                          <div className="flex items-center gap-2 pb-1 flex-wrap">
                            {!inSelectMode ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                                onClick={() => { setSelectModePoId(po.id); setSelectedLineIds(new Set()); }}
                              >
                                <CheckSquare className="h-3 w-3 mr-1" />
                                {t("purchases.selectRows", "Välj rader")}
                              </Button>
                            ) : (
                              <>
                                <Checkbox
                                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                                  onCheckedChange={() => {
                                    if (allSelected) {
                                      setSelectedLineIds(prev => {
                                        const next = new Set(prev);
                                        for (const id of rowsInThisPo) next.delete(id);
                                        return next;
                                      });
                                    } else {
                                      setSelectedLineIds(prev => {
                                        const next = new Set(prev);
                                        for (const id of rowsInThisPo) next.add(id);
                                        return next;
                                      });
                                    }
                                  }}
                                />
                                <span className="text-[11px] text-muted-foreground">
                                  {t("purchases.linesSelected", "{{count}} valda", { count: selectedInThisPo.length })}
                                </span>
                                {selectedInThisPo.length > 0 && (
                                  <>
                                    {/* Allocate-subset-to-task */}
                                    <Select
                                      value=""
                                      disabled={bulkActionLoading}
                                      onValueChange={(v) => bulkUpdateSelectedLines({ task_id: v === "none" ? null : v })}
                                    >
                                      <SelectTrigger className="h-7 text-xs w-[160px]">
                                        <SelectValue placeholder={t("purchases.bulkAllocateTask", "Tilldela task...")} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="none">{t("purchases.unallocated", "Oallokerat")}</SelectItem>
                                        {tasks.map((task) => (
                                          <SelectItem key={task.id} value={task.id}>{task.title}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    {/* Allocate-subset-to-room */}
                                    {rooms.length > 0 && (
                                      <Select
                                        value=""
                                        disabled={bulkActionLoading}
                                        onValueChange={(v) => bulkUpdateSelectedLines({ room_id: v === "none" ? null : v })}
                                      >
                                        <SelectTrigger className="h-7 text-xs w-[140px]">
                                          <SelectValue placeholder={t("purchases.bulkAllocateRoom", "Tilldela rum...")} />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="none">{t("purchases.noRoom", "Inget rum")}</SelectItem>
                                          {rooms.map((room) => (
                                            <SelectItem key={room.id} value={room.id}>{room.name}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    )}
                                    {/* Bulk status */}
                                    <Select
                                      value=""
                                      disabled={bulkActionLoading}
                                      onValueChange={(v) => bulkUpdateSelectedLines({ status: v })}
                                    >
                                      <SelectTrigger className="h-7 text-xs w-[120px]">
                                        <SelectValue placeholder={t("purchases.bulkStatus", "Status...")} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {["new", "to_order", "ordered", "paid", "paused", "declined", "done"].map((s) => (
                                          <SelectItem key={s} value={s}>{t(`materialStatuses.${s}`, s)}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    {/* Bulk delete */}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                      disabled={bulkActionLoading}
                                      onClick={bulkDeleteSelectedLines}
                                    >
                                      <Trash2 className="h-3 w-3 mr-1" />
                                      {t("common.delete", "Ta bort")}
                                    </Button>
                                  </>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs ml-auto"
                                  onClick={exitSelectMode}
                                  disabled={bulkActionLoading}
                                >
                                  {t("common.cancel", "Avbryt")}
                                </Button>
                                {bulkActionLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                              </>
                            )}
                          </div>
                        )}
                        {rows.map((row) => {
                          const isSelected = selectedLineIds.has(row.id);
                          if (inSelectMode) {
                            return (
                              <label
                                key={row.id}
                                className={cn(
                                  "w-full grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center text-xs py-1.5 px-2 rounded cursor-pointer transition-colors",
                                  isSelected ? "bg-primary/10" : "hover:bg-accent"
                                )}
                              >
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleLineSelection(row.id)}
                                />
                                <span className="truncate">{row.name}</span>
                                {row.task_id ? (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 whitespace-nowrap">
                                    {row.task?.title || t("purchases.linkedToTask", "Task")}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground whitespace-nowrap">
                                    {t("purchases.unallocated", "Oallokerat")}
                                  </Badge>
                                )}
                                <span className="tnum text-muted-foreground whitespace-nowrap">
                                  {formatCurrency(row.price_total || 0, currency)}
                                </span>
                              </label>
                            );
                          }
                          return (
                            <button
                              key={row.id}
                              type="button"
                              onClick={() => openEditDialog(row)}
                              className="w-full grid grid-cols-[1fr_auto_auto] gap-3 text-left text-xs py-1.5 px-2 rounded hover:bg-accent transition-colors"
                            >
                              <span className="truncate">{row.name}</span>
                              {row.task_id ? (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 whitespace-nowrap">
                                  {row.task?.title || t("purchases.linkedToTask", "Task")}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground whitespace-nowrap">
                                  {t("purchases.unallocated", "Oallokerat")}
                                </Badge>
                              )}
                              <span className="tnum text-muted-foreground whitespace-nowrap">
                                {formatCurrency(row.price_total || 0, currency)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                  {isExpanded && rows.length === 0 && (
                    <div className="border-t bg-muted/20 px-3 py-2 text-xs text-muted-foreground italic">
                      {t("purchases.poNoLines", "Inga radnivå-material — ordern är endast registrerad som totalsumma.")}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Purchase orders section */}
      <Card>
        <CardContent className="pt-4">
          {materials.length === 0 && purchaseOrders.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">{t('purchases.noPurchaseOrders')}</h3>
              <p className="text-muted-foreground mb-2">
                {t('purchases.noPurchaseOrdersDescription')}</p>
              <p className="text-xs text-muted-foreground">
                {t('purchases.emptyStateTip', 'Tip: Link purchases to tasks to track costs per work item')}
              </p>
            </div>
          ) : orderMaterials.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6 italic">
              {t('purchases.allOrdersAreGrouped', 'Alla inköp visas grupperade ovanför.')}
            </p>
          ) : (
            <>
              {/* Toolbar: View Toggle + Filter + Results count */}
              <div className="flex items-center gap-3 flex-wrap mb-4">
                {/* View Toggle */}
                <div className="flex rounded-md bg-muted/40 border border-border/60 p-0.5">
                  {(['table', 'kanban'] as const).map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => handleSetViewMode(v)}
                      className={cn(
                        "px-2.5 py-1 rounded text-xs transition-colors",
                        viewMode === v
                          ? "bg-card shadow-sm font-medium text-foreground border border-border/60"
                          : "text-muted-foreground hover:text-foreground border border-transparent"
                      )}
                    >
                      {v === 'table' ? t('tasks.tableView', 'Tabell') : t('tasks.kanbanView', 'Kanban')}
                    </button>
                  ))}
                </div>

                {/* Filter Popover */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8 relative" title={t('purchases.filters', 'Filter')}>
                      <Filter className="h-4 w-4" />
                      {totalFilterCount > 0 && (
                        <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center font-medium">
                          {totalFilterCount}
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-0" align="start">
                    <div className="max-h-[70vh] overflow-y-auto">
                      {/* Status */}
                      <div className="px-3 pt-3 pb-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('common.status')}</p>
                      </div>
                      <div className="px-1 pb-2">
                        {statusOptions.map(opt => (
                          <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                            <Checkbox
                              checked={filterStatuses.has(opt.value)}
                              onCheckedChange={() => toggleFilterValue(setFilterStatuses, opt.value)}
                            />
                            <span className="flex-1">{t(opt.labelKey)}</span>
                            <span className="text-xs text-muted-foreground">{getStatusCount(opt.value)}</span>
                          </label>
                        ))}
                      </div>

                      <div className="border-t" />

                      {/* Room */}
                      <div className="px-3 pt-3 pb-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('purchases.room')}</p>
                      </div>
                      <div className="px-1 pb-2">
                        <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                          <Checkbox
                            checked={filterRooms.has("none")}
                            onCheckedChange={() => toggleFilterValue(setFilterRooms, "none")}
                          />
                          <span className="flex-1">{t('purchasesTable.noRoom')}</span>
                          <span className="text-xs text-muted-foreground">{getRoomCount("none")}</span>
                        </label>
                        {rooms.map(room => (
                          <label key={room.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                            <Checkbox
                              checked={filterRooms.has(room.id)}
                              onCheckedChange={() => toggleFilterValue(setFilterRooms, room.id)}
                            />
                            <span className="flex-1">{room.name}</span>
                            <span className="text-xs text-muted-foreground">{getRoomCount(room.id)}</span>
                          </label>
                        ))}
                      </div>

                      <div className="border-t" />

                      {/* Task */}
                      <div className="px-3 pt-3 pb-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('purchases.task')}</p>
                      </div>
                      <div className="px-1 pb-2">
                        <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                          <Checkbox
                            checked={filterTasks.has("none")}
                            onCheckedChange={() => toggleFilterValue(setFilterTasks, "none")}
                          />
                          <span className="flex-1">{t('purchasesTable.noTask')}</span>
                          <span className="text-xs text-muted-foreground">{getTaskCount("none")}</span>
                        </label>
                        {tasks.map(task => (
                          <label key={task.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                            <Checkbox
                              checked={filterTasks.has(task.id)}
                              onCheckedChange={() => toggleFilterValue(setFilterTasks, task.id)}
                            />
                            <span className="flex-1 truncate">{task.title}</span>
                            <span className="text-xs text-muted-foreground">{getTaskCount(task.id)}</span>
                          </label>
                        ))}
                      </div>

                      <div className="border-t" />

                      {/* Created by */}
                      {uniqueCreators.length > 0 && (
                        <>
                          <div className="px-3 pt-3 pb-1">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('purchases.addedBy')}</p>
                          </div>
                          <div className="px-1 pb-2">
                            {uniqueCreators.map(creator => (
                              <label key={creator.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                                <Checkbox
                                  checked={filterCreatedBy.has(creator.id)}
                                  onCheckedChange={() => toggleFilterValue(setFilterCreatedBy, creator.id)}
                                />
                                <span className="flex-1">{creator.name}</span>
                                <span className="text-xs text-muted-foreground">{getCreatorCount(creator.id)}</span>
                              </label>
                            ))}
                          </div>
                          <div className="border-t" />
                        </>
                      )}

                      {/* Attachment */}
                      <div className="px-3 pt-3 pb-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('purchasesTable.attachment')}</p>
                      </div>
                      <div className="px-1 pb-2">
                        <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                          <Checkbox
                            checked={filterAttachment.has("has")}
                            onCheckedChange={() => toggleFilterValue(setFilterAttachment, "has")}
                          />
                          <span className="flex-1">{t('budget.hasAttachment')}</span>
                        </label>
                        <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                          <Checkbox
                            checked={filterAttachment.has("missing")}
                            onCheckedChange={() => toggleFilterValue(setFilterAttachment, "missing")}
                          />
                          <span className="flex-1">{t('budget.missingAttachment')}</span>
                        </label>
                      </div>

                      {/* Clear all */}
                      {totalFilterCount > 0 && (
                        <>
                          <div className="border-t" />
                          <div className="p-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full"
                              onClick={clearAllFilters}
                            >
                              {t('purchases.clearFilters', 'Clear filters')}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Table view toolbar items (inline) */}
                {viewMode === 'table' && (
                  <>
                    <ColumnToggle
                      columns={PURCHASE_EXTRA_COLUMN_KEYS}
                      labels={Object.fromEntries(purchaseTableViewState.ALL_COLUMNS.map(c => [c.key, c.label])) as Record<string, string>}
                      visible={purchaseTableViewState.visibleExtras}
                      onChange={(vis) => {
                        for (const key of PURCHASE_EXTRA_COLUMN_KEYS) {
                          const isVisible = vis.has(key);
                          const wasVisible = purchaseTableViewState.visibleExtras.has(key);
                          if (isVisible !== wasVisible) purchaseTableViewState.toggleExtraColumn(key);
                        }
                      }}
                      align="start"
                      trigger={
                        <Button variant="outline" size="icon" className="h-8 w-8" title={t("purchasesTable.columns")}>
                          <Columns3 className="h-4 w-4" />
                        </Button>
                      }
                    />
                    <Button
                      variant={purchaseTableViewState.compactRows ? "default" : "outline"}
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => purchaseTableViewState.setCompactRows(!purchaseTableViewState.compactRows)}
                      title={t("purchasesTable.compactRows")}
                    >
                      <Rows3 className="h-4 w-4" />
                    </Button>
                    {/* Group by */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant={purchaseTableViewState.groupBy !== "none" ? "default" : "outline"}
                          size="icon"
                          className="h-8 w-8"
                          title={t("budget.groupBy")}
                        >
                          <Layers className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-48" align="end">
                        <div className="space-y-1">
                          <p className="text-sm font-medium mb-2">{t("budget.groupBy")}</p>
                          {(["none", "room", "status", "vendor"] as const).map((opt) => (
                            <label
                              key={opt}
                              className={`flex items-center gap-2 text-sm cursor-pointer rounded-md px-2 py-1.5 hover:bg-accent ${purchaseTableViewState.groupBy === opt ? "bg-accent font-medium" : ""}`}
                              onClick={() => purchaseTableViewState.handleGroupByChange(opt)}
                            >
                              {opt === "none" && t("budget.groupNone")}
                              {opt === "room" && t("budget.groupByRoom")}
                              {opt === "status" && t("budget.groupByStatus")}
                              {opt === "vendor" && t("budget.groupByVendor")}
                            </label>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </>
                )}

                {/* Active filter count summary */}
                {totalFilterCount > 0 && (
                  <span className="text-sm text-muted-foreground">
                    {t('purchases.showingResults', 'Showing {{count}} of {{total}} orders', {
                      count: filteredMaterials.length,
                      total: orderMaterials.length,
                    })}
                  </span>
                )}
              </div>

              {/* Views */}
              {viewMode === 'kanban' ? (
                <PurchasesKanbanView
                  materials={filteredMaterials}
                  projectId={projectId}
                  currency={currency}
                  isReadOnly={lockStatus.isLocked || (userPurchasesAccess !== 'edit' && !isProjectOwner)}
                  onMaterialClick={openEditDialog}
                  onMaterialUpdated={fetchMaterials}
                  getStatusColor={getStatusColor}
                />
              ) : (
                <PurchasesTableView
                  materials={filteredMaterials}
                  projectId={projectId}
                  rooms={rooms}
                  tasks={tasks}
                  teamMembers={teamMembers}
                  currency={currency}
                  isReadOnly={lockStatus.isLocked || (userPurchasesAccess !== 'edit' && !isProjectOwner)}
                  onMaterialClick={openEditDialog}
                  onMaterialUpdated={fetchMaterials}
                  canEditMaterial={canEditMaterial}
                  getStatusColor={getStatusColor}
                  tableViewState={purchaseTableViewState}
                  hideToolbar
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-3xl lg:max-w-5xl max-h-[90vh] flex flex-col">
          <DialogHeader className="sr-only">
            <DialogTitle>{t('purchases.editOrder')}</DialogTitle>
          </DialogHeader>
          {editingMaterial && (
            <form onSubmit={handleEditMaterial} className="flex flex-col flex-1 overflow-hidden">
              <div className="space-y-4 overflow-y-auto flex-1 pr-2">
              <div className="sticky top-0 z-10 bg-background pb-3 -mt-2 space-y-2">
                <Input
                  id="edit-material-name"
                  value={editingMaterial.name}
                  onChange={(e) => setEditingMaterial({ ...editingMaterial, name: e.target.value })}
                  required
                  className="text-lg font-semibold h-auto py-1 px-0 border-0 shadow-none focus-visible:ring-0 rounded-none border-b border-transparent focus-visible:border-b-primary"
                  placeholder={t('purchases.materialName')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-status">{t('common.status')}</Label>
                <Select
                  value={editingMaterial.status || "submitted"}
                  onValueChange={(value) => setEditingMaterial({ ...editingMaterial, status: value })}
                  disabled={userPurchasesAccess !== 'edit' && !isProjectOwner}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('common.selectStatus')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="submitted">{t('materialStatuses.submitted')}</SelectItem>
                    <SelectItem value="declined">{t('materialStatuses.declined')}</SelectItem>
                    <SelectItem value="approved">{t('materialStatuses.approved')}</SelectItem>
                    <SelectItem value="billed">{t('materialStatuses.billed')}</SelectItem>
                    <SelectItem value="paid">{t('materialStatuses.paid')}</SelectItem>
                    <SelectItem value="paused">{t('materialStatuses.paused')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">{t('common.description')}</Label>
                <Textarea
                  id="edit-description"
                  value={editingMaterial.description || ""}
                  onChange={(e) => setEditingMaterial({ ...editingMaterial, description: e.target.value })}
                  placeholder="Additional details..."
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-quantity">{t('common.quantity')}*</Label>
                  <Input
                    id="edit-quantity"
                    type="number"
                    step="0.01"
                    value={editingMaterial.quantity ?? ""}
                    onChange={(e) => setEditingMaterial({ ...editingMaterial, quantity: parseFloat(e.target.value) })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-unit">{t('common.unit')}*</Label>
                  <Input
                    id="edit-unit"
                    value={editingMaterial.unit ?? ""}
                    onChange={(e) => setEditingMaterial({ ...editingMaterial, unit: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-price-per-unit">{t('purchases.pricePerUnit')}</Label>
                  <Input
                    id="edit-price-per-unit"
                    type="number"
                    step="0.01"
                    value={editingMaterial.price_per_unit || ""}
                    onChange={(e) => setEditingMaterial({ ...editingMaterial, price_per_unit: e.target.value ? parseFloat(e.target.value) : null })}
                  />
                </div>
              </div>
              {editingMaterial.quantity && editingMaterial.price_per_unit && (
                <p className="text-sm text-muted-foreground">
                  {t('purchases.priceTotal')}: {formatCurrency(editingMaterial.quantity * editingMaterial.price_per_unit, currency, { decimals: 2 })}
                </p>
              )}
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="edit-exclude-from-budget"
                  checked={editingMaterial.exclude_from_budget}
                  onChange={(e) => setEditingMaterial({ ...editingMaterial, exclude_from_budget: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="edit-exclude-from-budget" className="text-sm font-normal cursor-pointer">
                  {t('purchases.excludeFromBudget')}
                </Label>
              </div>

              {/* Betaldat */}
              <div className="grid grid-cols-1 gap-4 mt-3">
                <div className="space-y-2">
                  <Label htmlFor="edit-paid-date">{t("common.paidDate", "Betaldat")}</Label>
                  <Input
                    id="edit-paid-date"
                    type="date"
                    value={editingMaterial.paid_date ?? ""}
                    onChange={(e) => setEditingMaterial({ ...editingMaterial, paid_date: e.target.value || null })}
                  />
                </div>
              </div>

              <Separator className="my-2" />

              {/* Leverantör */}
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-2 w-full py-1.5 text-sm font-semibold cursor-pointer hover:text-foreground text-muted-foreground group">
                  <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=closed]:-rotate-90" />
                  <Store className="h-4 w-4" />
                  {t('purchases.vendorName')}
                  {(editingMaterial.vendor_name || editingMaterial.vendor_link) && (
                    <Badge variant="secondary" className="ml-auto text-xs">{editingMaterial.vendor_name || "1"}</Badge>
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="edit-vendor-name">{t('purchases.vendorName')}</Label>
                      <Input
                        id="edit-vendor-name"
                        value={editingMaterial.vendor_name || ""}
                        onChange={(e) => setEditingMaterial({ ...editingMaterial, vendor_name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-vendor-link">{t('purchases.vendorLink')}</Label>
                      <Input
                        id="edit-vendor-link"
                        type="url"
                        value={editingMaterial.vendor_link || ""}
                        onChange={(e) => setEditingMaterial({ ...editingMaterial, vendor_link: e.target.value })}
                      />
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Kopplingar */}
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-2 w-full py-1.5 text-sm font-semibold cursor-pointer hover:text-foreground text-muted-foreground group">
                  <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=closed]:-rotate-90" />
                  <Link2 className="h-4 w-4" />
                  {t('purchases.connections', 'Connections')}
                  {(editingMaterial.task_id || editingMaterial.room_id || editingMaterial.assigned_to_user_id) && (
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {[editingMaterial.task_id, editingMaterial.room_id, editingMaterial.assigned_to_user_id].filter(Boolean).length}
                    </Badge>
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="edit-task">{t('purchases.linkToTask')} ({t('common.optional')})</Label>
                      <Select
                        value={editingMaterial.task_id || "none"}
                        onValueChange={(value) => setEditingMaterial({ ...editingMaterial, task_id: value === "none" ? null : value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('purchases.selectTask')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t('purchases.noTask')}</SelectItem>
                          {tasks.map((task) => (
                            <SelectItem key={task.id} value={task.id}>
                              {task.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-assigned-to">{t('purchases.assignTo')} ({t('common.optional')})</Label>
                      <Select
                        value={editingMaterial.assigned_to_user_id || "none"}
                        onValueChange={(value) => setEditingMaterial({ ...editingMaterial, assigned_to_user_id: value === "none" ? null : value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('purchases.selectTeamMember')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t('common.unassigned')}</SelectItem>
                          {teamMembers.map((member) => (
                            <SelectItem key={member.id} value={member.id}>
                              {member.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-room">{t('purchases.room')} ({t('common.optional')})</Label>
                      <Select
                        value={editingMaterial.room_id || "none"}
                        onValueChange={(value) => setEditingMaterial({ ...editingMaterial, room_id: value === "none" ? null : value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('purchases.selectRoom')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t('purchases.noRoom')}</SelectItem>
                          {rooms.map((room) => (
                            <SelectItem key={room.id} value={room.id}>
                              {room.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Bilder */}
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-2 w-full py-1.5 text-sm font-semibold cursor-pointer hover:text-foreground text-muted-foreground group">
                  <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=closed]:-rotate-90" />
                  <Image className="h-4 w-4" />
                  {t('purchases.photos', 'Photos')}
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <EntityPhotoGallery entityId={editingMaterial.id} entityType="material" projectId={projectId} />
                  <div className="mt-3">
                    <TaskFilesList materialId={editingMaterial.id} projectId={projectId} />
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Kommentarer */}
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-2 w-full py-1.5 text-sm font-semibold cursor-pointer hover:text-foreground text-muted-foreground group">
                  <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=closed]:-rotate-90" />
                  <MessageSquare className="h-4 w-4" />
                  {t('purchases.comments', 'Comments')}
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <CommentsSection materialId={editingMaterial.id} projectId={projectId} />
                </CollapsibleContent>
              </Collapsible>
              </div>

              {/* Fixed Save Button */}
              <div className="flex-shrink-0 pt-4 border-t mt-4 bg-background sticky bottom-0">
                <Button type="submit" className="w-full" disabled={creating}>
                  {creating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      {t('purchases.updating')}
                    </>
                  ) : (
                    t('purchases.updateOrder')
                  )}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <NewPurchaseFromBudgetDialog
        open={budgetPurchaseDialog.open}
        onOpenChange={(open) => setBudgetPurchaseDialog((prev) => ({ ...prev, open }))}
        planned={budgetPurchaseDialog.planned}
        projectId={projectId}
        currentProfileId={currentProfileId}
        currency={currency}
        usedAmount={budgetPurchaseDialog.usedAmount}
        onCreated={fetchMaterials}
      />
      <QuoteReviewDialog
        projectId={projectId}
        open={quoteReviewFile !== null}
        onOpenChange={(o) => { if (!o) setQuoteReviewFile(null); }}
        file={quoteReviewFile}
        onImportComplete={() => {
          fetchMaterials();
          fetchPurchaseOrders();
          fetchTasks();
        }}
      />
      <AlertDialog open={poToDelete !== null} onOpenChange={(o) => !o && setPOToDelete(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              {t("purchases.deletePOTitle", "Ta bort inköpsorder?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {poToDelete && (() => {
                const lineCount = (materialsByPOId.get(poToDelete.id) || []).length;
                return lineCount > 0
                  ? t(
                      "purchases.deletePODescWithLines",
                      "{{vendor}} ({{total}}) tas bort. {{count}} radnivå-material lossas från ordern men finns kvar i projektet — du kan radera eller koppla om dem separat.",
                      {
                        vendor: poToDelete.vendor_name,
                        total: formatCurrency(poToDelete.total, currency),
                        count: lineCount,
                      },
                    )
                  : t(
                      "purchases.deletePODescNoLines",
                      "{{vendor}} ({{total}}) tas bort. Ordern har inga radnivå-material.",
                      {
                        vendor: poToDelete.vendor_name,
                        total: formatCurrency(poToDelete.total, currency),
                      },
                    );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingPO}>{t("common.cancel", "Avbryt")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePO}
              disabled={deletingPO}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingPO ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                  {t("common.deleting", "Tar bort...")}
                </>
              ) : (
                t("common.delete", "Ta bort")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PurchaseRequestsTab;
