import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isTeamV2MaskingEnabled } from "@/lib/featureFlags";
import { getViewerMode, type ViewerMode } from "@/services/projectDataService";
import { createRequestPurchase } from "@/lib/createRequestPurchase";
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
  Camera,
  Pencil,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { EditPurchaseOrderDialog } from "./EditPurchaseOrderDialog";
import { AddPurchaseLineDialog } from "./AddPurchaseLineDialog";
import { NewPurchaseOrderDialog } from "./NewPurchaseOrderDialog";
import { PurchaseOrdersTableView } from "./PurchaseOrdersTableView";
import { PurchaseOrdersGridV2 } from "./po-list-v2/PurchaseOrdersGridV2";
import type { PO, POMaterial } from "./po-list-v2/types";
import { AddMaterialDialog } from "./overview/AddMaterialDialog";
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
    avatar_url?: string | null;
    isWorker?: boolean;
  } | null;
  submitted_by_worker_token_id?: string | null;
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
  vendor_name: string | null;
  total: number;
  status: string;
  ordered_at: string | null;
  delivered_at: string | null;
  receipt_total: number | null;
  receipt_matched_at: string | null;
  receipt_file_path: string | null;
  source: string | null;
  notes: string | null;
  created_at: string;
  invoice_number?: string | null;
  ocr_number?: string | null;
  invoice_due_date?: string | null;
  paid_at?: string | null;
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
  // Edit PO dialog
  const [editingPO, setEditingPO] = useState<PurchaseOrder | null>(null);
  // Detail drawer state (lifted from PurchaseOrdersGridV2 so deep-links can open it)
  const [openPOId, setOpenPOId] = useState<string | null>(null);
  // Add-line dialog target (the PO we're adding a row to)
  const [addLinePO, setAddLinePO] = useState<PurchaseOrder | null>(null);
  // New PO ("Skapa beställning") dialog
  const [newPODialogOpen, setNewPODialogOpen] = useState(false);
  // PO view mode: cards or flat table
  const [poViewMode, setPoViewMode] = usePersistedPreference<'cards' | 'table'>(`po-view-mode-${projectId}`, 'cards');
  const [showOnlyUnpaidInvoices, setShowOnlyUnpaidInvoices] = useState(false);
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
  // P0#2/L3: mask supplier prices+vendor for non-"full" viewers. Flag off →
  // false (byte-identical). Fail-safe: masked while viewerMode resolves.
  const [viewerMode, setViewerMode] = useState<ViewerMode | null>(null);
  const maskEconomy = isTeamV2MaskingEnabled() && viewerMode !== "full";

  useEffect(() => {
    if (!isTeamV2MaskingEnabled()) return;
    let alive = true;
    getViewerMode(projectId)
      .then((m) => { if (alive) setViewerMode(m); })
      .catch(() => { if (alive) setViewerMode("none"); });
    return () => { alive = false; };
  }, [projectId]);

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

  // Auto-open a specific entity (material OR purchase order) from a deep link
  useEffect(() => {
    if (!openEntityId) return;
    // PO match takes precedence — widgets like UpcomingPaymentsWidget pass po.id
    const po = purchaseOrders.find((p) => p.id === openEntityId);
    if (po) {
      if (poViewMode === 'table') {
        setEditingPO(po);
      } else {
        setOpenPOId(po.id);
      }
      onEntityOpened?.();
      return;
    }
    if (materials.length === 0) return;
    const material = materials.find((m) => m.id === openEntityId);
    if (material) {
      openEditDialog(material);
      onEntityOpened?.();
    }
  }, [openEntityId, materials, purchaseOrders, poViewMode]);

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
        // Matcha canEditMaterial-semantik: assigned = både skapade och tilldelade rader
        query = query.or(`created_by_user_id.eq.${currentProfileId},assigned_to_user_id.eq.${currentProfileId}`);
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
      const creatorAvatarMap = new Map<string, string | null>();
      if (creatorIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, name, avatar_url")
          .in("id", creatorIds);

        (profiles || []).forEach(p => {
          if (p.name) creatorMap.set(p.id, p.name);
          creatorAvatarMap.set(p.id, p.avatar_url ?? null);
        });
      }

      // Batch fetch worker-token submitters (workers via /w/:token har inget profile.id)
      const workerTokenIds = [...new Set(
        (materialsRes.data || [])
          .map(m => m.submitted_by_worker_token_id)
          .filter((id): id is string => id !== null && id !== undefined)
      )];

      const workerTokenNameMap = new Map<string, string>();
      if (workerTokenIds.length > 0) {
        const { data: tokens } = await supabase
          .from("worker_access_tokens")
          .select("id, worker_name")
          .in("id", workerTokenIds);

        (tokens || []).forEach(tk => {
          if (tk.worker_name) workerTokenNameMap.set(tk.id, tk.worker_name);
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
        // Worker-token submitter trumfar profile-creator (workern föreslog faktiskt)
        const workerName = material.submitted_by_worker_token_id
          ? workerTokenNameMap.get(material.submitted_by_worker_token_id)
          : null;
        const profileCreatorName = material.created_by_user_id
          ? creatorMap.get(material.created_by_user_id)
          : null;
        const creatorName = workerName || profileCreatorName;
        const creatorAvatar = workerName
          ? null  // workers har ingen avatar — initial-fallback i UI
          : (material.created_by_user_id ? creatorAvatarMap.get(material.created_by_user_id) ?? null : null);
        const assignedName = material.assigned_to_user_id
          ? assignedMap.get(material.assigned_to_user_id)
          : null;
        const attachmentCount = docCounts.get(material.id) || 0;
        return {
          ...material,
          creator: creatorName ? { name: creatorName, avatar_url: creatorAvatar, isWorker: !!workerName } : null,
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
        .select("id, vendor_name, total, status, ordered_at, delivered_at, receipt_total, receipt_matched_at, receipt_file_path, source, notes, created_at, invoice_number, ocr_number, invoice_due_date, paid_at")
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
    try {
      await createRequestPurchase({
        projectId,
        createdByUserId: currentProfileId,
        material: {
          task_id: planned.task_id,
          room_id: planned.room_id,
          name: planned.name,
          quantity: planned.quantity,
          unit: planned.unit,
          price_per_unit: planned.price_per_unit,
          price_total: planned.price_total ?? 0,
          source_material_id: planned.id,
          status: "to_order",
        },
      });
      toast({ description: t("purchases.orderCreatedFromPlan", "Inköpsorder skapad från offertrad") });
      fetchMaterials();
    } catch {
      toast({ variant: "destructive", description: t("purchases.createOrderFailed", "Kunde inte skapa inköpsorder") });
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

  // Split planned (budget references) from real orders — exclude subcontractor rows from budget
  const plannedMaterials = materials.filter(m => m.status === "planned" && m.description !== "__subcontractor__");
  // All real orders (non-planned). After PO-invariant Fas C (2026-05-13),
  // every non-planned material is guaranteed to have a purchase_order_id
  // (DB CHECK enforces it), so they're all rendered grouped under their PO.
  const allOrderMaterials = materials.filter(m => m.status !== "planned");

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

  // Paid/ordered spend per planned row — iterates ALL non-planned materials
  // (post-Fas-C, this is the correct source for budget-tracking; previously
  // only summed orphans, which Fas C eliminates).
  const paidByPlannedId = new Map<string, number>();
  const orderedByPlannedId = new Map<string, number>();
  for (const m of allOrderMaterials) {
    if (!m.source_material_id) continue;
    if (m.status === "paid") {
      paidByPlannedId.set(m.source_material_id,
        (paidByPlannedId.get(m.source_material_id) || 0) + (m.price_total || 0));
    } else {
      orderedByPlannedId.set(m.source_material_id,
        (orderedByPlannedId.get(m.source_material_id) || 0) + (m.price_total || 0));
    }
  }

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
            {allOrderMaterials.length} {t('purchases.orders', 'inköp')} · {allOrderMaterials.filter(m => m.status === 'paid').length} {t('materialStatuses.paid', 'betalda')}
          </h2>
        </div>
        {(isProjectOwner || userPurchasesAccess === 'edit' || userPurchasesAccess === 'create') && (
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  {t('purchases.newPurchase', 'Nytt inköp')}
                  <ChevronDown className="h-4 w-4 ml-1 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem onClick={() => setReceiptModalOpen(true)}>
                  <Camera className="h-4 w-4 mr-2 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>{t('purchases.scanReceiptQuote', 'Skanna kvitto/offert')}</span>
                    <span className="text-[10px] text-muted-foreground">{t('purchases.scanReceiptQuoteHint', 'AI extraherar rader och belopp')}</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setNewPODialogOpen(true)}>
                  <Pencil className="h-4 w-4 mr-2 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>{t('purchases.createOrderManual', 'Skapa beställning manuellt')}</span>
                    <span className="text-[10px] text-muted-foreground">{t('purchases.createOrderManualHint', 'Antal-först, pris valfritt')}</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setAddPlannedDialogOpen(true)}>
                  <ClipboardList className="h-4 w-4 mr-2 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>{t('purchases.materialBudgetEntry', 'Materialbudget')}</span>
                    <span className="text-[10px] text-muted-foreground">{t('purchases.materialBudgetEntryHint', 'Lägg in en planerad post — inte en order')}</span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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

      {/* Inköpsorder — grid of cards + drawer */}
      {purchaseOrders.length > 0 && (() => {
        const unpaidInvoiceCount = purchaseOrders.filter(
          (po) => po.source === 'ai_invoice' && !po.paid_at,
        ).length;
        const filteredPOs = showOnlyUnpaidInvoices
          ? purchaseOrders.filter((po) => po.source === 'ai_invoice' && !po.paid_at)
          : purchaseOrders;
        return (
        <div className="space-y-3">
          {/* Section heading + view toggle */}
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div className="flex items-baseline gap-2">
              <ShoppingCart className="h-4 w-4 self-center" style={{ color: 'var(--rf-fg-muted)' }} />
              <h3 className="font-display text-lg font-normal tracking-tight" style={{ color: 'var(--rf-ink)' }}>
                {t('purchases.purchaseOrdersTitle', 'Inköpsorder')}
              </h3>
              <span className="rf-num text-xs" style={{ color: 'var(--rf-fg-muted)' }}>
                {showOnlyUnpaidInvoices ? `${filteredPOs.length}/${purchaseOrders.length}` : purchaseOrders.length}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {unpaidInvoiceCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowOnlyUnpaidInvoices((v) => !v)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs transition-colors',
                    showOnlyUnpaidInvoices
                      ? 'font-medium'
                      : 'hover:bg-accent/50'
                  )}
                  style={
                    showOnlyUnpaidInvoices
                      ? { background: 'var(--rf-warn-bg, #FEF3C7)', color: 'var(--rf-warn, #92400E)', border: '1px solid var(--rf-warn, #92400E)' }
                      : { border: '1px solid var(--rf-hairline)', color: 'var(--rf-fg-muted)' }
                  }
                  title={t('purchases.filterUnpaidInvoicesTitle', 'Visa endast obetalda fakturor')}
                >
                  <span>
                    {t('purchases.filterUnpaidInvoices', 'Obetalda fakturor')}
                  </span>
                  <span className="rf-num">{unpaidInvoiceCount}</span>
                </button>
              )}
              <div
                className="flex p-0.5 rounded-md"
                style={{ background: 'var(--rf-bg-sunken)', border: '1px solid var(--rf-hairline)' }}
              >
                {(['cards', 'table'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setPoViewMode(v)}
                    className={cn(
                      'px-2.5 py-0.5 rounded text-xs transition-colors',
                      poViewMode === v
                        ? 'font-medium'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                    style={
                      poViewMode === v
                        ? { background: 'var(--rf-surface)', border: '1px solid var(--rf-hairline)', color: 'var(--rf-ink)' }
                        : { border: '1px solid transparent' }
                    }
                  >
                    {v === 'cards' ? t('purchases.cardsView', 'Kort') : t('purchases.tableView', 'Tabell')}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {poViewMode === 'table' ? (
            <PurchaseOrdersTableView
              projectId={projectId}
              purchaseOrders={filteredPOs}
              materialsByPOId={materialsByPOId}
              tasks={tasks}
              rooms={rooms}
              currency={currency}
              maskEconomy={maskEconomy}
              canEdit={isProjectOwner || userPurchasesAccess === 'edit'}
              onEditPO={(po) => setEditingPO(po as PurchaseOrder)}
              onDeletePO={(po) => setPOToDelete(po as PurchaseOrder)}
              onAddLine={(po) => setAddLinePO(po as PurchaseOrder)}
              onEditLine={(lineId) => {
                const mat = materials.find((m) => m.id === lineId);
                if (mat) openEditDialog(mat);
              }}
            />
          ) : (
            <PurchaseOrdersGridV2
              purchaseOrders={filteredPOs as unknown as PO[]}
              materialsByPOId={materialsByPOId as unknown as Map<string, POMaterial[]>}
              tasks={tasks.map((tt) => ({ id: tt.id, title: tt.title }))}
              rooms={rooms.map((r) => ({ id: r.id, name: r.name }))}
              projectId={projectId}
              currency={currency}
              maskEconomy={maskEconomy}
              openPOId={openPOId}
              onOpenPOIdChange={setOpenPOId}
              canEdit={isProjectOwner || userPurchasesAccess === 'edit'}
              onEditMeta={(po) => setEditingPO(po as unknown as PurchaseOrder)}
              onDelete={(po) => setPOToDelete(po as unknown as PurchaseOrder)}
              allocatingPOId={allocatingPOId}
              onAllocateAllToTask={allocateOrderToTask}
              onAllocateAllToRoom={allocateOrderToRoom}
              selectModePoId={selectModePoId}
              selectedLineIds={selectedLineIds}
              bulkActionLoading={bulkActionLoading}
              onEnterSelectMode={(poId) => {
                setSelectModePoId(poId);
                setSelectedLineIds(new Set());
              }}
              onExitSelectMode={exitSelectMode}
              onToggleLineSelection={toggleLineSelection}
              onBulkUpdate={bulkUpdateSelectedLines}
              onBulkDelete={bulkDeleteSelectedLines}
              onEditLine={(mat) => openEditDialog(mat as unknown as Material)}
              onAddLine={(po) => setAddLinePO(po as unknown as PurchaseOrder)}
            />
          )}
        </div>
        );
      })()}

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
          ) : (
            <p className="text-xs text-muted-foreground text-center py-6 italic">
              {t('purchases.allOrdersAreGrouped', 'Alla inköp visas grupperade ovanför.')}
            </p>
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
      <EditPurchaseOrderDialog
        open={editingPO !== null}
        onOpenChange={(o) => { if (!o) setEditingPO(null); }}
        purchaseOrder={editingPO}
        currency={currency}
        onSaved={() => { fetchPurchaseOrders(); fetchMaterials(); }}
      />
      {addLinePO && (
        <AddPurchaseLineDialog
          open={addLinePO !== null}
          onOpenChange={(o) => { if (!o) setAddLinePO(null); }}
          projectId={projectId}
          purchaseOrderId={addLinePO.id}
          defaultVendorName={addLinePO.vendor_name}
          defaultMaterialStatus={
            addLinePO.status === "ordered" ? "ordered"
            : addLinePO.status === "delivered" ? "ordered"
            : "new"
          }
          currency={currency}
          tasks={tasks}
          rooms={rooms}
          onAdded={fetchMaterials}
        />
      )}
      <NewPurchaseOrderDialog
        open={newPODialogOpen}
        onOpenChange={setNewPODialogOpen}
        projectId={projectId}
        currency={currency}
        tasks={tasks}
        rooms={rooms}
        onCreated={() => { fetchPurchaseOrders(); fetchMaterials(); }}
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
