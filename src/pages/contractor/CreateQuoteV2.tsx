import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronUp, Eye, GripVertical, Maximize2, Plus, Settings2, ZoomIn, ZoomOut } from "lucide-react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { AppHeader } from "@/components/AppHeader";
import { QuoteItemRow, type QuoteItem } from "@/components/quotes/QuoteItemRow";
import { QuoteSummary } from "@/components/quotes/QuoteSummary";
import { QuotePreview } from "@/components/quotes/QuotePreview";
import { QuoteDocument } from "@/components/quotes/QuoteDocument";
import { ImportRoomDialog } from "@/components/quotes/ImportRoomDialog";
import { CreateClientDialog, type Client } from "@/components/quotes/CreateClientDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createQuote, addQuoteItem, updateQuoteDraft, replaceQuoteItems, generateQuoteNumber, recalculateQuoteTotals, calculateRotDeduction } from "@/services/quoteService";
import { cn } from "@/lib/utils";

interface SimpleProject {
  id: string;
  name: string;
}

function newItem(): QuoteItem {
  return {
    id: crypto.randomUUID(),
    description: "",
    quantity: 1,
    unit: "st",
    unitPrice: 0,
    isRotEligible: false,
    comment: "",
    discountPercent: 0,
  };
}

/**
 * CreateQuoteV2 — paper-warm editor with audit-gap fixes:
 *   • Prepopulate banner shows imported task/material counts
 *   • ÄTA-mode badge surfaces when ?is_ata=true
 *   • Settings chips display active gruppering / prisformat / ROT inline
 *   • Settings panel default-open when prepopulating (audit asks: must be discoverable)
 *
 * Reuses all hooks/handlers/services from V1. Feature-flagged in App.tsx.
 * Once V2 is verified in production, delete V1 and rename this back to CreateQuote.
 */
export default function CreateQuoteV2() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuthSession();

  // Read URL params
  const urlProjectId = searchParams.get("projectId");
  const editQuoteId = searchParams.get("editQuoteId");
  const urlClientId = searchParams.get("clientId");
  const shouldPrepopulate = searchParams.get("prepopulate") === "true";
  const fromQuickQuote = searchParams.get("fromQuickQuote") === "true";
  const fromIntake = searchParams.get("fromIntake") === "true";
  const isAta = searchParams.get("is_ata") === "true";
  const taskIds = searchParams.get("taskIds")?.split(",").filter(Boolean) || [];
  const materialIds = searchParams.get("materialIds")?.split(",").filter(Boolean) || [];

  // Presentation settings — live-editable from the settings panel in the editor
  const [groupByType, setGroupByType] = useState<"grouped" | "byRoom" | "mixed">("grouped");
  const [pricingFormat, setPricingFormat] = useState<"detailed" | "combined" | "fixed">("combined");
  const [applyRot, setApplyRot] = useState(true);
  const [compactMode, setCompactMode] = useState(false);
  // V2: default-open when prepopulating so users discover the settings.
  const [settingsOpen, setSettingsOpen] = useState(searchParams.get("prepopulate") === "true");
  const [hasManualEdits, setHasManualEdits] = useState(false);

  // V2: counts for prepopulate banner — "X arbeten + Y material från projekt"
  const [importedTaskCount, setImportedTaskCount] = useState(0);
  const [importedMaterialCount, setImportedMaterialCount] = useState(0);

  const [projectId, setProjectId] = useState<string>("");
  const [projects, setProjects] = useState<SimpleProject[]>([]);
  const [items, setItems] = useState<QuoteItem[]>([newItem()]);

  // Display items: add room section headers for "byRoom" mode
  const displayItems = useMemo(() => {
    // Filter out any old section headers from stored items
    const cleanItems = items.filter((i) => !i.sectionHeader);
    if (groupByType !== "byRoom") return cleanItems;

    const roomGroups = new Map<string, QuoteItem[]>();
    const noRoom: QuoteItem[] = [];
    for (const item of cleanItems) {
      if (item.roomId) {
        const group = roomGroups.get(item.roomId) || [];
        group.push(item);
        roomGroups.set(item.roomId, group);
      } else {
        noRoom.push(item);
      }
    }

    const result: QuoteItem[] = [];
    for (const [roomId, group] of roomGroups) {
      const roomName = group[0]?.roomName || roomId;
      result.push({
        id: `header-${roomId}`,
        description: "",
        quantity: 0,
        unit: "",
        unitPrice: 0,
        isRotEligible: false,
        sectionHeader: roomName,
      });
      result.push(...group);
    }
    result.push(...noRoom);
    return result;
  }, [items, groupByType]);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [importRoomItemId, setImportRoomItemId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // V2 drag-reorder state — used to manually reorder line items in the editor.
  // Disabled when grouping by room (section headers would break the index math).
  const [dragItemIdx, setDragItemIdx] = useState<number | null>(null);
  const [dragOverItemIdx, setDragOverItemIdx] = useState<number | null>(null);
  const [companyName, setCompanyName] = useState<string | undefined>();
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | undefined>();
  const [companyInfo, setCompanyInfo] = useState<{
    address?: string;
    postalCode?: string;
    city?: string;
    phone?: string;
    email?: string;
    website?: string;
    orgNumber?: string;
    bankgiro?: string;
  }>({});
  const [userName, setUserName] = useState<string | undefined>();
  const [userEmail, setUserEmail] = useState<string | undefined>();
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string>("");
  const [clients, setClients] = useState<Client[]>([]);
  const [createClientOpen, setCreateClientOpen] = useState(false);
  const [freeText, setFreeText] = useState("");
  const [quoteNumber, setQuoteNumber] = useState("");
  // ÄTA-specific fields — only persisted when isAta=true. Stored as plain
  // strings here so the inputs feel natural; coerced to typed values on save.
  const [ataReason, setAtaReason] = useState("");
  const [ataTimeShiftDays, setAtaTimeShiftDays] = useState("");
  const [objectDescription, setObjectDescription] = useState("");
  const [previewScale, setPreviewScale] = useState(0.75);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const isMobile = useRef(typeof window !== "undefined" && window.innerWidth < 1024).current;
  // Scale the A4 document (794px wide) to fit the mobile screen width
  const mobilePreviewScale = isMobile
    ? Math.round(Math.max(0.3, (window.innerWidth - 48) / 794) * 100) / 100
    : 1;

  // Pinch-zoom and Ctrl+wheel zoom on preview scroll area
  useEffect(() => {
    const el = previewScrollRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      setPreviewScale((s) => Math.min(1.5, Math.max(0.3, Math.round((s + delta) * 100) / 100)));
    };
    let lastDist = 0;
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (lastDist > 0) {
        const delta = (dist - lastDist) * 0.003;
        setPreviewScale((s) => Math.min(1.5, Math.max(0.3, Math.round((s + delta) * 100) / 100)));
      }
      lastDist = dist;
    };
    const handleTouchEnd = () => { lastDist = 0; };
    el.addEventListener("wheel", handleWheel, { passive: false });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd);
    return () => {
      el.removeEventListener("wheel", handleWheel);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  const fitToWidth = useCallback(() => {
    const container = previewContainerRef.current;
    if (!container) return;
    // A4 width = 210mm. The QuoteDocument renders at max-w-[210mm] ≈ 794px.
    const containerWidth = container.clientWidth - 32; // subtract padding (p-4 = 16px * 2)
    const a4Width = 794;
    const scale = Math.min(containerWidth / a4Width, 1);
    setPreviewScale(Math.round(scale * 100) / 100);
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("projects")
      .select("id, name")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setProjects(data);
      });
    supabase
      .from("profiles")
      .select("id, name, company_name, avatar_url, company_logo_url, company_address, company_postal_code, company_city, phone, email, company_website, bankgiro")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setCompanyName(data.company_name ?? undefined);
          setCompanyLogoUrl((data as Record<string, unknown>).company_logo_url as string | undefined);
          setUserName(data.name ?? undefined);
          setAvatarUrl(data.avatar_url ?? undefined);
          setProfileId(data.id);
          // Generate next quote number (editable by user)
          if (!editQuoteId) {
            generateQuoteNumber(data.id).then((num) => setQuoteNumber(num));
          }
          setCompanyInfo({
            address: data.company_address ?? undefined,
            postalCode: data.company_postal_code ?? undefined,
            city: data.company_city ?? undefined,
            phone: data.phone ?? undefined,
            email: data.email ?? undefined,
            website: data.company_website ?? undefined,
            bankgiro: data.bankgiro ?? undefined,
          });
          supabase
            .from("clients")
            .select("*")
            .eq("owner_id", data.id)
            .order("name")
            .then(({ data: clientData }) => {
              if (clientData) setClients(clientData as Client[]);
            });
        }
      });
    setUserEmail(user.email);
  }, [user]);

  // Handle URL params for projectId and prepopulation
  useEffect(() => {
    if (urlProjectId && !projectId) {
      setProjectId(urlProjectId);
    }
  }, [urlProjectId, projectId]);

  // Handle URL param for clientId
  useEffect(() => {
    if (urlClientId && !clientId) {
      setClientId(urlClientId);
    }
  }, [urlClientId, clientId]);

  // Load existing quote for editing
  useEffect(() => {
    if (!editQuoteId) return;

    const loadQuote = async () => {
      const [quoteRes, itemsRes] = await Promise.all([
        supabase
          .from("quotes")
          .select("title, free_text, client_id_ref, project_id, quote_number, ata_reason, ata_time_shift_days")
          .eq("id", editQuoteId)
          .single(),
        supabase
          .from("quote_items")
          .select("*")
          .eq("quote_id", editQuoteId)
          .order("sort_order", { ascending: true }),
      ]);

      if (quoteRes.data) {
        setFreeText(quoteRes.data.free_text || "");
        if (quoteRes.data.client_id_ref) setClientId(quoteRes.data.client_id_ref);
        if (quoteRes.data.project_id) setProjectId(quoteRes.data.project_id);
        const qn = (quoteRes.data as Record<string, unknown>).quote_number as string | null;
        if (qn) setQuoteNumber(qn);
        const ar = (quoteRes.data as Record<string, unknown>).ata_reason as string | null;
        if (ar) setAtaReason(ar);
        const ts = (quoteRes.data as Record<string, unknown>).ata_time_shift_days as number | null;
        if (ts != null) setAtaTimeShiftDays(String(ts));
      }

      if (itemsRes.data && itemsRes.data.length > 0) {
        setItems(
          itemsRes.data.map((item) => ({
            id: item.id,
            description: item.description || "",
            quantity: item.quantity ?? 1,
            unit: item.unit || "st",
            unitPrice: item.unit_price ?? 0,
            isRotEligible: item.is_rot_eligible ?? false,
            roomId: item.room_id ?? undefined,
            comment: item.comment || "",
            discountPercent: item.discount_percent ?? 0,
            sourceTaskId: (item as Record<string, unknown>).source_task_id as string | undefined,
            source: (item as Record<string, unknown>).source_type as QuoteItem["source"],
          }))
        );
      }
    };

    loadQuote();
  }, [editQuoteId]);

  // Handle AI-generated items from QuickQuote
  useEffect(() => {
    if (!fromQuickQuote) return;

    const storedItems = sessionStorage.getItem("quickQuoteItems");
    if (storedItems) {
      try {
        const aiItems = JSON.parse(storedItems);
        if (Array.isArray(aiItems) && aiItems.length > 0) {
          const quoteItems: QuoteItem[] = aiItems.map((item: {
            description: string;
            quantity: number;
            unit: string;
            estimatedPrice: number | null;
            isLabor: boolean;
          }) => ({
            id: crypto.randomUUID(),
            description: item.description,
            quantity: item.quantity || 1,
            unit: item.unit || "st",
            unitPrice: item.estimatedPrice || 0,
            isRotEligible: item.isLabor === true, // ROT only for labor
            aiGenerated: true,
          }));
          setItems(quoteItems);
          toast.success(t("quotes.itemsImportedAi", { count: quoteItems.length, defaultValue: `${quoteItems.length} rader importerade från AI` }));
        }
      } catch (e) {
        console.error("Failed to parse quickQuoteItems:", e);
      }
      // Clear the stored items after reading
      sessionStorage.removeItem("quickQuoteItems");
    }
  }, [fromQuickQuote, t]);

  // Handle items from intake conversion
  useEffect(() => {
    if (!fromIntake) return;

    const storedItems = sessionStorage.getItem("intakeQuoteItems");
    if (storedItems) {
      try {
        const intakeItems = JSON.parse(storedItems);
        if (Array.isArray(intakeItems) && intakeItems.length > 0) {
          const quoteItems: QuoteItem[] = intakeItems.map((item: {
            description: string;
            quantity: number;
            unit: string;
            estimatedPrice: number | null;
            isLabor: boolean;
          }) => ({
            id: crypto.randomUUID(),
            description: item.description,
            quantity: item.quantity || 1,
            unit: item.unit || "st",
            unitPrice: item.estimatedPrice || 0,
            isRotEligible: item.isLabor === true, // Labor items are ROT-eligible
            aiGenerated: true,
          }));
          setItems(quoteItems);
          toast.success(t("quotes.itemsImportedFromIntake", { count: quoteItems.length, defaultValue: `${quoteItems.length} rader importerade från inkommen förfrågan` }));
        }
      } catch (e) {
        console.error("Failed to parse intakeQuoteItems:", e);
      }
      // Clear the stored items after reading
      sessionStorage.removeItem("intakeQuoteItems");
    }
  }, [fromIntake, t]);

  // Pre-populate items from project tasks and materials
  useEffect(() => {
    if (!shouldPrepopulate || !urlProjectId) return;
    if (taskIds.length === 0 && materialIds.length === 0) return;

    const fetchProjectData = async () => {
      const taskItems: (QuoteItem & { roomName: string | null })[] = [];
      const materialItems: (QuoteItem & { roomName: string | null })[] = [];

      // Fetch and convert selected tasks to labor items
      if (taskIds.length > 0) {
        const { data: tasks } = await supabase
          .from("tasks")
          .select("id, title, description, budget, room_id, rooms(name), task_cost_type, estimated_hours, hourly_rate, subcontractor_cost, markup_percent, material_estimate, material_markup_percent")
          .in("id", taskIds)
          .order("created_at");

        // Fetch planned materials for these tasks so we can use them as the material line item.
        // This is the canonical source; material_estimate is a fallback for unmigrated tasks.
        const { data: plannedMaterialRows } = await supabase
          .from("materials")
          .select("task_id, price_total, quantity, price_per_unit, markup_percent")
          .in("task_id", taskIds)
          .eq("status", "planned");

        // Sum base material cost per task (without per-row markup — markup applied separately)
        const plannedMaterialTotals = new Map<string, number>();
        // Sum material cost WITH per-row markup applied
        const plannedMaterialWithMarkup = new Map<string, number>();
        for (const m of plannedMaterialRows || []) {
          if (!m.task_id) continue;
          const baseCost = m.price_total ?? ((m.quantity || 0) * (m.price_per_unit || 0));
          const withMarkup = baseCost * (1 + (m.markup_percent || 0) / 100);
          plannedMaterialTotals.set(m.task_id, (plannedMaterialTotals.get(m.task_id) || 0) + baseCost);
          plannedMaterialWithMarkup.set(m.task_id, (plannedMaterialWithMarkup.get(m.task_id) || 0) + withMarkup);
        }

        if (tasks && tasks.length > 0) {
          for (const task of tasks) {
            const roomName = (task.rooms as { name: string } | null)?.name || null;
            // Material cost: prefer actual planned materials linked to this task.
            // Only fall back to material_estimate if NO planned materials exist for this task.
            const hasLinkedPlannedMaterials = plannedMaterialTotals.has(task.id) && plannedMaterialTotals.get(task.id)! > 0;
            const hasPerRowMarkup = plannedMaterialWithMarkup.has(task.id);
            let materialCostForQuote: number;
            let materialCostBase: number;

            if (hasLinkedPlannedMaterials) {
              // Use actual planned materials (with their markup)
              materialCostBase = plannedMaterialTotals.get(task.id)!;
              materialCostForQuote = hasPerRowMarkup
                ? Math.round(plannedMaterialWithMarkup.get(task.id)!)
                : Math.round(materialCostBase * (1 + (task.material_markup_percent || 0) / 100));
            } else if (task.material_estimate && task.material_estimate > 0) {
              // Flat estimate — but only if no standalone materials are selected
              // (to avoid double-counting when material_estimate conceptually includes standalone items)
              materialCostBase = task.material_estimate;
              materialCostForQuote = Math.round(materialCostBase * (1 + (task.material_markup_percent || 0) / 100));
            } else {
              materialCostBase = 0;
              materialCostForQuote = 0;
            }

            if (pricingFormat === "detailed") {
              const hasOwnLabor = !!(task.estimated_hours && task.hourly_rate);
              const hasSub = !!(task.subcontractor_cost && task.subcontractor_cost > 0);
              const hasMaterial = materialCostBase > 0;
              const hasAnyDetail = hasOwnLabor || hasSub || hasMaterial;

              // Own labor row — carries task description as comment
              if (hasOwnLabor) {
                taskItems.push({
                  id: crypto.randomUUID(),
                  description: task.title,
                  quantity: task.estimated_hours,
                  unit: "h",
                  unitPrice: task.hourly_rate,
                  isRotEligible: applyRot,
                  roomId: task.room_id || undefined,
                  roomName,
                  source: "hours",
                  sourceTaskId: task.id,
                  comment: task.description || "",
                });
              }

              // Subcontractor row (incl. markup, without revealing breakdown)
              if (hasSub) {
                const markup = task.markup_percent || 0;
                const adjustedPrice = task.subcontractor_cost * (1 + markup / 100);
                taskItems.push({
                  id: crypto.randomUUID(),
                  description: hasOwnLabor ? `${task.title} — UE` : task.title,
                  quantity: 1,
                  unit: "st",
                  unitPrice: Math.round(adjustedPrice * 100) / 100,
                  isRotEligible: applyRot,
                  roomId: task.room_id || undefined,
                  roomName,
                  source: "subcontractor",
                  sourceTaskId: task.id,
                });
              }

              // Material row
              if (hasMaterial) {
                taskItems.push({
                  id: crypto.randomUUID(),
                  description: `${task.title} — material`,
                  quantity: 1,
                  unit: "st",
                  unitPrice: materialCostForQuote,
                  isRotEligible: false,
                  roomId: task.room_id || undefined,
                  roomName,
                  source: "material",
                  sourceTaskId: task.id,
                });
              }

              // Fallback: budget only or no data
              if (!hasAnyDetail) {
                if (task.budget && task.budget > 0) {
                  taskItems.push({
                    id: crypto.randomUUID(),
                    description: task.title,
                    quantity: 1,
                    unit: "st",
                    unitPrice: task.budget,
                    isRotEligible: applyRot,
                    roomId: task.room_id || undefined,
                    roomName,
                    source: "fixed",
                    sourceTaskId: task.id,
                    comment: task.description || "",
                  });
                } else {
                  taskItems.push({
                    id: crypto.randomUUID(),
                    description: task.title,
                    quantity: 1,
                    unit: "st",
                    unitPrice: 0,
                    isRotEligible: applyRot,
                    roomId: task.room_id || undefined,
                    roomName,
                    source: "missing",
                    sourceTaskId: task.id,
                    comment: task.description || "",
                  });
                }
              }
            } else if (pricingFormat === "combined") {
              // Combined: one row per cost type, customer-friendly names, all markups baked in
              const laborTotal = (task.estimated_hours || 0) * (task.hourly_rate || 0);
              const subMarkup = task.markup_percent || 0;
              const subTotal = (task.subcontractor_cost || 0) * (1 + subMarkup / 100);
              const hasLabor = laborTotal > 0;
              const hasSub = subTotal > 0;
              const hasMat = materialCostBase > 0;
              const partCount = (hasLabor ? 1 : 0) + (hasSub ? 1 : 0) + (hasMat ? 1 : 0);

              if (partCount <= 1) {
                // Single component or budget-only — show as one line
                const total = hasLabor ? laborTotal : hasSub ? Math.round(subTotal) : hasMat ? materialCostForQuote : (task.budget || 0);
                taskItems.push({
                  id: crypto.randomUUID(),
                  description: task.title,
                  quantity: 1,
                  unit: "st",
                  unitPrice: total,
                  isRotEligible: applyRot && (hasLabor || hasSub),
                  roomId: task.room_id || undefined,
                  roomName,
                  source: "fixed",
                  sourceTaskId: task.id,
                  comment: task.description || "",
                });
              } else {
                // Multiple components — show each as "{Title}: Arbete / Material / Underentreprenör"
                if (hasLabor) {
                  taskItems.push({
                    id: crypto.randomUUID(),
                    description: `${task.title}: Arbete`,
                    quantity: 1,
                    unit: "st",
                    unitPrice: laborTotal,
                    isRotEligible: applyRot,
                    roomId: task.room_id || undefined,
                    roomName,
                    source: "hours",
                    sourceTaskId: task.id,
                    comment: task.description || "",
                  });
                }
                if (hasMat) {
                  taskItems.push({
                    id: crypto.randomUUID(),
                    description: `${task.title}: Material`,
                    quantity: 1,
                    unit: "st",
                    unitPrice: materialCostForQuote,
                    isRotEligible: false,
                    roomId: task.room_id || undefined,
                    roomName,
                    source: "material",
                    sourceTaskId: task.id,
                  });
                }
                if (hasSub) {
                  taskItems.push({
                    id: crypto.randomUUID(),
                    description: `${task.title}: Underentreprenör`,
                    quantity: 1,
                    unit: "st",
                    unitPrice: Math.round(subTotal),
                    isRotEligible: applyRot,
                    roomId: task.room_id || undefined,
                    roomName,
                    source: "subcontractor",
                    sourceTaskId: task.id,
                  });
                }
              }
            } else {
              // Fixed price: lump sum per task
              taskItems.push({
                id: crypto.randomUUID(),
                description: task.title,
                quantity: 1,
                unit: "st",
                unitPrice: task.budget || 0,
                isRotEligible: applyRot,
                roomId: task.room_id || undefined,
                roomName,
                source: "fixed",
                sourceTaskId: task.id,
                comment: task.description || "",
              });
            }
          }
        }
      }

      // Fetch and convert selected materials (exclude planned materials linked to tasks — already in task materialCost)
      if (materialIds.length > 0) {
        const { data: materials } = await supabase
          .from("materials")
          .select("id, name, quantity, unit, price_per_unit, price_total, room_id, task_id, description, status, rooms(name)")
          .in("id", materialIds)
          .order("created_at");

        if (materials && materials.length > 0) {
          // Build set of task IDs that are being expanded into detail rows
          const expandedTaskIds = new Set(taskIds);
          for (const material of materials) {
            // Skip planned materials linked to selected tasks — already included in task's material row
            if (material.status === "planned" && material.task_id && expandedTaskIds.has(material.task_id)) continue;
            const roomName = (material.rooms as { name: string } | null)?.name || null;
            const isSubcontractor = material.description === "__subcontractor__";
            const hasBreakdown = (material.quantity ?? 0) > 0 && (material.price_per_unit ?? 0) > 0;
            materialItems.push({
              id: crypto.randomUUID(),
              description: material.name,
              quantity: hasBreakdown ? material.quantity! : 1,
              unit: material.unit || "st",
              unitPrice: hasBreakdown ? material.price_per_unit! : (material.price_total || 0),
              isRotEligible: false,
              roomId: material.room_id || undefined,
              roomName,
              source: isSubcontractor ? "subcontractor" : "material",
              sourceTaskId: material.task_id || undefined,
            });
          }
        }
      }

      // Combine items based on grouping preference
      let newItems: QuoteItem[];

      if (groupByType === "byRoom") {
        // Sort by room — section headers are added by displayItems useMemo
        const withRoom = [...taskItems, ...materialItems].filter((i) => i.roomId);
        const noRoom = [...taskItems, ...materialItems].filter((i) => !i.roomId);
        newItems = [...withRoom, ...noRoom];
      } else if (groupByType === "grouped") {
        // Labor first, then materials — no room suffix (clean descriptions)
        newItems = [...taskItems, ...materialItems];
      } else {
        // Mixed - interleave by creation order
        const allItems = [];
        let ti = 0, mi = 0;
        while (ti < taskItems.length || mi < materialItems.length) {
          if (ti < taskItems.length) allItems.push(taskItems[ti++]);
          if (mi < materialItems.length) allItems.push(materialItems[mi++]);
        }
        newItems = allItems;
      }

      if (newItems.length > 0) {
        // V2: count what was imported for the prepopulate banner
        setImportedTaskCount(taskItems.length > 0 ? taskIds.length : 0);
        setImportedMaterialCount(materialItems.length);
        // Preserve manually-set roomIds from current items
        setItems((prev) => {
          // Collect roomId overrides from previous state
          const roomByTaskId = new Map<string, string>();
          const roomByDesc = new Map<string, string>();
          for (const item of prev) {
            if (item.roomId && !item.sectionHeader) {
              if (item.sourceTaskId) roomByTaskId.set(item.sourceTaskId, item.roomId);
              roomByDesc.set(item.description, item.roomId);
            }
          }
          if (roomByTaskId.size === 0 && roomByDesc.size === 0) return newItems;
          return newItems.map((item) => {
            if (item.sectionHeader) return item;
            if (item.roomId) return item;
            const saved = (item.sourceTaskId && roomByTaskId.get(item.sourceTaskId))
              || roomByDesc.get(item.description);
            return saved ? { ...item, roomId: saved } : item;
          });
        });
        setHasManualEdits(false);
      }
    };

    fetchProjectData();
  }, [shouldPrepopulate, urlProjectId, taskIds.join(","), materialIds.join(","), groupByType, pricingFormat, applyRot, t]);

  const handleChange = useCallback((id: string, updates: Partial<QuoteItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...updates } : i)));
    setHasManualEdits(true);
  }, []);

  const handleDelete = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== id);
      return next.length === 0 ? [newItem()] : next;
    });
    setHasManualEdits(true);
  }, []);

  const handleImportRoom = useCallback((itemId: string) => {
    if (!projectId) {
      toast.error(t("quotes.selectProject"));
      return;
    }
    setImportRoomItemId(itemId);
  }, [projectId, t]);

  // Drag-reorder handlers — operate on items array indices (not displayItems
  // which contains generated section-headers). sort_order is recomputed from
  // array position on save, so no extra persistence is needed here.
  const handleItemDragStart = useCallback((idx: number) => {
    setDragItemIdx(idx);
  }, []);

  const handleItemDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverItemIdx(idx);
  }, []);

  const handleItemDrop = useCallback(() => {
    if (dragItemIdx === null || dragOverItemIdx === null || dragItemIdx === dragOverItemIdx) {
      setDragItemIdx(null);
      setDragOverItemIdx(null);
      return;
    }
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragItemIdx, 1);
      next.splice(dragOverItemIdx, 0, moved);
      return next;
    });
    setHasManualEdits(true);
    setDragItemIdx(null);
    setDragOverItemIdx(null);
  }, [dragItemIdx, dragOverItemIdx]);

  const handleItemDragEnd = useCallback(() => {
    setDragItemIdx(null);
    setDragOverItemIdx(null);
  }, []);

  const handleRoomSelect = useCallback((roomId: string, _areaSqm: number, roomName: string) => {
    if (!importRoomItemId) return;
    setItems((prev) =>
      prev.map((i) =>
        i.id === importRoomItemId ? { ...i, roomId, roomName } : i
      )
    );
    setImportRoomItemId(null);
    setHasManualEdits(true);
  }, [importRoomItemId]);

  const handleSaveDraft = async () => {
    if (!user) return;
    if (!projectId) {
      toast.error(t("quotes.selectProject"));
      return;
    }
    setSaving(true);

    const itemPayloads = items
      .filter((item) => !item.sectionHeader && (item.description || item.unitPrice > 0))
      .map((item, idx) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        unit: item.unit,
        is_rot_eligible: item.isRotEligible,
        room_id: item.roomId,
        sort_order: idx,
        comment: item.comment || null,
        discount_percent: item.discountPercent || null,
        source_task_id: item.sourceTaskId || null,
        source_type: item.source || null,
      }));

    const titlePrefix = isAta
      ? t("quotes.changeOrderLabel", "Tillägg")
      : t("quotes.quoteLabel", "Offert");
    const autoTitle = `${titlePrefix} — ${projectName || t("quotes.newQuote")}`;

    if (editQuoteId) {
      // Update existing quote
      const updated = await updateQuoteDraft(editQuoteId, {
        title: autoTitle,
        free_text: freeText.trim() || null,
        client_id_ref: clientId || null,
        ...(isAta
          ? {
              ata_reason: ataReason.trim() || null,
              ata_time_shift_days: ataTimeShiftDays ? parseInt(ataTimeShiftDays, 10) || null : null,
            }
          : {}),
      });
      if (!updated) {
        setSaving(false);
        return;
      }
      const ok = await replaceQuoteItems(editQuoteId, itemPayloads);
      if (!ok) {
        setSaving(false);
        return;
      }
      setSaving(false);
      toast.success(t("quotes.saveDraft"));
      const returnTo = projectId ? `?returnTo=${encodeURIComponent(`/projects/${projectId}`)}` : "";
      navigate(`/quotes/${editQuoteId}${returnTo}`);
    } else {
      // Create new quote
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (!profile) {
        toast.error("Profile not found");
        setSaving(false);
        return;
      }
      const quote = await createQuote(projectId, autoTitle, profile.id, clientId || undefined, freeText.trim() || undefined, quoteNumber || undefined, isAta || undefined);
      if (!quote) {
        setSaving(false);
        return;
      }
      // Persist ÄTA-specific fields after creation (createQuote doesn't take them)
      if (isAta) {
        await updateQuoteDraft(quote.id, {
          ata_reason: ataReason.trim() || null,
          ata_time_shift_days: ataTimeShiftDays ? parseInt(ataTimeShiftDays, 10) || null : null,
        });
      }
      for (const item of itemPayloads) {
        await addQuoteItem(quote.id, item);
      }
      // Recalculate and persist quote totals
      const computedItems = itemPayloads.map((item) => {
        const total_price = item.quantity * item.unit_price * (1 - (item.discount_percent ?? 0) / 100);
        return {
          total_price,
          is_rot_eligible: item.is_rot_eligible ?? false,
          rot_deduction: calculateRotDeduction(total_price, item.is_rot_eligible ?? false),
        };
      });
      const totals = recalculateQuoteTotals(computedItems);
      await supabase.from("quotes").update(totals).eq("id", quote.id);
      setSaving(false);
      toast.success(t("quotes.saveDraft"));
      const returnTo = projectId ? `?returnTo=${encodeURIComponent(`/projects/${projectId}`)}` : "";
      navigate(`/quotes/${quote.id}${returnTo}`);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  // Auth + role check handled by RequireAuth + RequireRole wrappers in App.tsx
  if (authLoading || !user) return null;

  const projectName = projects.find((p) => p.id === projectId)?.name ?? "";

  return (
    <div className="rf-paper min-h-screen" style={{ background: "var(--rf-paper, #FAFAF7)" }}>
      <AppHeader
        userName={userName}
        userEmail={userEmail}
        avatarUrl={avatarUrl}
        onSignOut={handleSignOut}
      />

      <main className="container mx-auto px-4 py-6 lg:px-0 lg:py-0 lg:h-[calc(100vh-4rem)] lg:max-w-none">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel defaultSize={isMobile ? 100 : 42} minSize={25} maxSize={70} className="overflow-auto lg:!overflow-auto">
          {/* ── Left column: form fields ── */}
          <div className="max-w-2xl lg:max-w-none space-y-5 mx-auto lg:mx-0 lg:px-6 lg:py-6 bg-gradient-to-b from-muted/30 to-muted/10">
            {urlProjectId && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 -ml-2 text-muted-foreground hover:text-foreground"
                onClick={() => navigate(`/projects/${urlProjectId}`)}
              >
                <ArrowLeft className="h-4 w-4" />
                {t("quotes.backToPlanning")}
              </Button>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">
                {isAta
                  ? t("quotes.changeOrderTitle", "Tillägg")
                  : editQuoteId
                    ? t("quotes.editQuote", "Redigera offert")
                    : t("quotes.newQuote")}
              </h1>
              {/* V2: ÄTA-badge — surfaces is_ata=true mode prominently */}
              {isAta && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{ background: "var(--rf-warn-soft, #F2E2DA)", color: "var(--rf-warn-soft-fg, #7A3D26)" }}
                >
                  <AlertTriangle className="h-3 w-3" />
                  {t("quotes.ataMode", "ÄTA-läge — sparas som tillägg, inte ny offert")}
                </span>
              )}
            </div>

            {/* V2: ÄTA-specific fields — reason + time-shift, only shown when isAta */}
            {isAta && (
              <div
                className="rounded-lg p-4 space-y-3"
                style={{
                  background: "var(--rf-green-soft, #DCE5DC)",
                  borderLeft: "3px solid var(--rf-green, #2F5D4E)",
                }}
              >
                <div className="space-y-1.5">
                  <Label
                    className="text-[11px] font-medium uppercase tracking-wide"
                    style={{ color: "var(--rf-green)" }}
                  >
                    {t("quotes.ataReason", "Skäl till ändring")}
                  </Label>
                  <Textarea
                    value={ataReason}
                    onChange={(e) => setAtaReason(e.target.value)}
                    rows={2}
                    placeholder={t("quotes.ataReasonPlaceholder", "Varför uppstod detta tillägg?")}
                    className="rounded-md text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    className="text-[11px] font-medium uppercase tracking-wide"
                    style={{ color: "var(--rf-green)" }}
                  >
                    {t("quotes.ataTimeShiftLabel", "Tidsförskjutning (dagar)")}
                  </Label>
                  <Input
                    type="number"
                    value={ataTimeShiftDays}
                    onChange={(e) => setAtaTimeShiftDays(e.target.value)}
                    placeholder="0"
                    min={0}
                    className="h-10 max-w-[120px]"
                  />
                </div>
              </div>
            )}

            {/* V2: Prepopulate banner — shows what was imported from project */}
            {shouldPrepopulate && (importedTaskCount > 0 || importedMaterialCount > 0) && (
              <div
                className="flex items-start gap-3 rounded-lg border p-3"
                style={{
                  borderColor: "var(--rf-green-soft, #DCE5DC)",
                  background: "var(--rf-green-soft, #DCE5DC)",
                  color: "var(--rf-green-soft-fg, #3F5A3F)",
                }}
              >
                <div className="mt-0.5 flex-shrink-0 rounded-full p-1" style={{ background: "rgba(255,255,255,0.5)" }}>
                  <Settings2 className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 text-sm">
                  <p className="font-medium">
                    {t("quotes.prepopulatedFromProject", "Importerat från projekt")}
                  </p>
                  <p className="mt-0.5 text-xs opacity-80">
                    {[
                      importedTaskCount > 0
                        ? t("quotes.prepopulatedTasksCount", { count: importedTaskCount, defaultValue: `${importedTaskCount} arbeten` })
                        : null,
                      importedMaterialCount > 0
                        ? t("quotes.prepopulatedMaterialsCount", { count: importedMaterialCount, defaultValue: `${importedMaterialCount} material` })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" + ")}
                    {" · "}
                    {t("quotes.prepopulatedHint", "Justera prisformat och gruppering nedan om du vill.")}
                  </p>
                </div>
              </div>
            )}

            {/* Quote details card */}
            <div className="rounded-xl border border-border/60 bg-background p-4 shadow-sm space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("quotes.quoteDetails", "Offertuppgifter")}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{t("quotes.project", "Projekt")}</Label>
                  <Select value={projectId} onValueChange={setProjectId}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder={t("quotes.selectProject")} />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{t("quotes.recipient", "Mottagare")}</Label>
                  <Select
                    value={clientId}
                    onValueChange={(val) => {
                      if (val === "__new__") {
                        setCreateClientOpen(true);
                      } else {
                        setClientId(val);
                      }
                    }}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder={t("quotes.selectRecipient")} />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                      <SelectItem value="__new__">{t("quotes.createNewClient")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{t("quotes.quoteNumberLabel", "Offertnr")}</Label>
                <Input
                  value={quoteNumber}
                  onChange={(e) => setQuoteNumber(e.target.value)}
                  placeholder="OFF-2026-001"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{t("quotes.objectDescription", "Objekt")}</Label>
                <Input
                  value={objectDescription}
                  onChange={(e) => setObjectDescription(e.target.value)}
                  placeholder={t("quotes.objectPlaceholder", "t.ex. Lägenhet 80 kvm på Kungsholmen")}
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{t("quotes.notes", "Villkor / anteckningar")}</Label>
                <Textarea
                  placeholder={t("quotes.freeTextPlaceholder")}
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  rows={2}
                  className="rounded-lg"
                />
              </div>
            </div>

            {/* Settings panel — only shown when prepopulating from a project */}
            {shouldPrepopulate && (
              <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
                <div className="flex flex-wrap items-center gap-2">
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2 h-8 text-xs">
                      <Settings2 className="h-3.5 w-3.5" />
                      {t("quotes.presentationSettings", "Presentationsinställningar")}
                      {settingsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </Button>
                  </CollapsibleTrigger>
                  {/* V2: manual-edits warning surfaced outside the panel so it stays visible
                      even when the settings collapsible is closed. Click opens the panel. */}
                  {hasManualEdits && (
                    <button
                      type="button"
                      onClick={() => setSettingsOpen(true)}
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium hover:opacity-90 transition-opacity"
                      style={{
                        background: "var(--rf-amber-soft, #F0E7D7)",
                        color: "var(--rf-amber-soft-fg, #6B5A3A)",
                      }}
                      title={t("quotes.settingsResetWarning", "Ändring av inställningar återställer de importerade raderna")}
                    >
                      <AlertTriangle className="h-3 w-3" />
                      {t("quotes.manualEdits", "Manuella ändringar")}
                    </button>
                  )}
                  {/* V2: chips showing active config — visible without expanding */}
                  {!settingsOpen && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5"
                        style={{ background: "var(--rf-bg-sunken, #EFEAE0)", color: "var(--rf-fg-muted, #6B6357)" }}
                      >
                        {pricingFormat === "combined"
                          ? t("quotes.pricingCombined", "Samlat")
                          : pricingFormat === "detailed"
                            ? t("quotes.pricingDetailed", "Timspec")
                            : t("quotes.pricingFixed", "Fast pris")}
                      </span>
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5"
                        style={{ background: "var(--rf-bg-sunken, #EFEAE0)", color: "var(--rf-fg-muted, #6B6357)" }}
                      >
                        {groupByType === "byRoom"
                          ? t("quotes.byRoom", "Per rum")
                          : groupByType === "grouped"
                            ? t("quotes.grouped", "Per typ")
                            : t("quotes.mixed", "Blandad")}
                      </span>
                      {applyRot && (
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5"
                          style={{ background: "var(--rf-green-soft, #DCE5DC)", color: "var(--rf-green-soft-fg, #3F5A3F)" }}
                        >
                          ROT
                        </span>
                      )}
                      {compactMode && (
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5"
                          style={{ background: "var(--rf-bg-sunken, #EFEAE0)", color: "var(--rf-fg-muted, #6B6357)" }}
                        >
                          {t("quotes.compact", "Kompakt")}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <CollapsibleContent>
                  <div className="mt-2 p-4 rounded-xl border border-border/60 bg-background shadow-sm space-y-4">
                    {/* Presentation */}
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {t("quotes.presentation")}
                      </p>
                      <RadioGroup
                        value={groupByType}
                        onValueChange={(v) => setGroupByType(v as typeof groupByType)}
                        className="space-y-1.5"
                      >
                        {(["grouped", "byRoom", "mixed"] as const).map((v) => (
                          <div key={v} className="flex items-center gap-2">
                            <RadioGroupItem value={v} id={`gbt-${v}`} />
                            <Label htmlFor={`gbt-${v}`} className="text-sm font-normal cursor-pointer">
                              {v === "grouped" ? t("quotes.groupedByType") : v === "byRoom" ? t("quotes.groupedByRoom") : t("quotes.mixedList")}
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    </div>

                    <div className="h-px bg-border" />

                    {/* Pricing format */}
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {t("quotes.pricingFormat", "Prisformat")}
                      </p>
                      <RadioGroup
                        value={pricingFormat}
                        onValueChange={(v) => setPricingFormat(v as typeof pricingFormat)}
                        className="space-y-1.5"
                      >
                        <div className="flex items-start gap-2">
                          <RadioGroupItem value="combined" id="pf-combined" className="mt-0.5" />
                          <div>
                            <Label htmlFor="pf-combined" className="text-sm font-normal cursor-pointer">
                              {t("quotes.pricingCombined", "Samlat per arbete")}
                            </Label>
                            <p className="text-xs text-muted-foreground">{t("quotes.pricingCombinedHint", "Arbete, material och UE som separata poster — inga timmar eller påslag synliga")}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <RadioGroupItem value="detailed" id="pf-detailed" className="mt-0.5" />
                          <div>
                            <Label htmlFor="pf-detailed" className="text-sm font-normal cursor-pointer">
                              {t("quotes.pricingDetailed", "Timspecifikation")}
                            </Label>
                            <p className="text-xs text-muted-foreground">{t("quotes.pricingDetailedHint")}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <RadioGroupItem value="fixed" id="pf-fixed" className="mt-0.5" />
                          <div>
                            <Label htmlFor="pf-fixed" className="text-sm font-normal cursor-pointer">
                              {t("quotes.pricingFixed", "Fast pris")}
                            </Label>
                            <p className="text-xs text-muted-foreground">{t("quotes.pricingFixedHint")}</p>
                          </div>
                        </div>
                      </RadioGroup>
                    </div>

                    <div className="h-px bg-border" />

                    {/* ROT */}
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="rot-toggle"
                        checked={applyRot}
                        onCheckedChange={(c) => setApplyRot(c === true)}
                      />
                      <Label htmlFor="rot-toggle" className="text-sm font-normal cursor-pointer">
                        {t("quotes.applyRotDeduction")}
                      </Label>
                    </div>

                    <div className="h-px bg-border" />

                    {/* Compact mode */}
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="compact-toggle"
                        checked={compactMode}
                        onCheckedChange={(c) => setCompactMode(c === true)}
                      />
                      <Label htmlFor="compact-toggle" className="text-sm font-normal cursor-pointer">
                        {t("quotes.compactMode", "Kompakt layout")}
                      </Label>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Line items */}
            <div className="rounded-xl border border-border/60 bg-background shadow-sm overflow-hidden">
              <div className="px-4 pt-4 pb-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("quotes.lineItems", "Offertrader")}</p>
              </div>
              <div className="px-4 pb-3 space-y-3">
                {items.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">{t("quotes.noItems")}</p>
                )}
                {displayItems.map((item) => {
                  // Section header — paper-warm Fraunces green (matches DocumentLines.tsx
                  // pattern). Auto-generated by displayItems for byRoom mode; not a real
                  // line item, so no delete button.
                  if (item.sectionHeader) {
                    return (
                      <div key={item.id} className="flex items-center gap-3 pt-3 first:pt-0">
                        <span
                          className="text-sm font-medium tracking-tight"
                          style={{
                            fontFamily: "var(--ff-display, 'Fraunces', Georgia, serif)",
                            color: "var(--rf-green, #2F5D4E)",
                          }}
                        >
                          {item.sectionHeader}
                        </span>
                        <div
                          className="flex-1 h-px"
                          style={{ background: "var(--rf-hairline, rgba(20, 15, 5, 0.10))" }}
                        />
                      </div>
                    );
                  }
                  // Drag is disabled in byRoom mode because section headers in
                  // displayItems would force the user to figure out cross-room moves.
                  const dragEnabled = groupByType !== "byRoom";
                  const itemsIdx = items.findIndex((i) => i.id === item.id);
                  const isDragging = dragItemIdx === itemsIdx;
                  const isDragTarget =
                    dragOverItemIdx === itemsIdx &&
                    dragItemIdx !== null &&
                    dragItemIdx !== itemsIdx;
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "group flex items-stretch gap-1.5",
                        isDragging && "opacity-40",
                      )}
                      onDragOver={dragEnabled ? (e) => handleItemDragOver(e, itemsIdx) : undefined}
                      onDrop={dragEnabled ? handleItemDrop : undefined}
                    >
                      {dragEnabled && (
                        <div
                          draggable
                          onDragStart={() => handleItemDragStart(itemsIdx)}
                          onDragEnd={handleItemDragEnd}
                          className="flex items-center cursor-grab active:cursor-grabbing px-1 rounded opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity"
                          style={{ color: "var(--rf-fg-muted, #6B6357)" }}
                          title={t("quotes.dragToReorder", "Drag to reorder")}
                          aria-label={t("quotes.dragToReorder", "Drag to reorder")}
                        >
                          <GripVertical className="h-4 w-4" />
                        </div>
                      )}
                      <div
                        className={cn(
                          "flex-1 transition-shadow",
                          isDragTarget && "rounded-lg ring-2",
                        )}
                        style={isDragTarget ? { boxShadow: "0 0 0 2px var(--rf-green, #2F5D4E)" } : undefined}
                      >
                        <QuoteItemRow
                          item={item}
                          onChange={handleChange}
                          onDelete={handleDelete}
                          onImportRoom={handleImportRoom}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="px-4 pb-4">
                <Button
                  variant="outline"
                  className="w-full h-10 border-dashed border-border/60 text-muted-foreground hover:text-foreground"
                  onClick={() => { setItems((prev) => [...prev, newItem()]); setHasManualEdits(true); }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t("quotes.addItem")}
                </Button>
              </div>
            </div>

            <QuoteSummary items={items} />

            <div className="flex gap-2 pb-8">
              <Button
                className="flex-1 h-11 text-base font-medium shadow-sm"
                onClick={handleSaveDraft}
                disabled={saving}
              >
                {saving ? t("common.saving") : t("quotes.saveDraft")}
              </Button>
            </div>
          </div>

          </ResizablePanel>

          {!isMobile && <ResizableHandle withHandle />}

          {!isMobile && <ResizablePanel defaultSize={58} minSize={30} maxSize={75}>
          {/* ── Right column: live preview (desktop only) ── */}
          <div
            ref={previewContainerRef}
            className="hidden lg:flex lg:flex-col h-full bg-neutral-100 dark:bg-neutral-900"
          >
            {/* Toolbar — paper-warm: sunken surface + hairline border, no blur */}
            <div
              className="flex items-center gap-1.5 px-4 py-2 rounded-t-lg flex-shrink-0"
              style={{
                background: "var(--rf-bg-sunken, #EFEAE0)",
                borderBottom: "1px solid var(--rf-hairline, rgba(20, 15, 5, 0.10))",
              }}
            >
              <span
                className="inline-block w-2 h-2 rounded-full animate-pulse"
                style={{ background: "var(--rf-green, #2F5D4E)" }}
              />
              <span className="text-xs mr-auto" style={{ color: "var(--rf-fg-muted, #6B6357)" }}>
                {t("quotes.livePreview", "Förhandsgranskning")}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setPreviewScale((s) => Math.max(0.3, Math.round((s - 0.1) * 100) / 100))}
                title={t("common.zoomOut", "Zoom out")}
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <span
                className="text-xs tabular-nums w-10 text-center"
                style={{ color: "var(--rf-fg-muted, #6B6357)", fontFamily: "var(--ff-mono)" }}
              >
                {Math.round(previewScale * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setPreviewScale((s) => Math.min(1.5, Math.round((s + 0.1) * 100) / 100))}
                title={t("common.zoomIn", "Zoom in")}
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <div
                className="w-px h-4 mx-1"
                style={{ background: "var(--rf-hairline, rgba(20, 15, 5, 0.10))" }}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={fitToWidth}
                title={t("quotes.fitPage", "Fyll sida")}
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Scrollable preview area */}
            <div ref={previewScrollRef} className="flex-1 overflow-auto p-4">
              <div
                style={{
                  transform: `scale(${previewScale})`,
                  transformOrigin: "top left",
                  width: `${100 / previewScale}%`,
                }}
              >
                <QuoteDocument
                  projectName={projectName}
                  objectDescription={objectDescription}
                  items={items}
                  freeText={freeText}
                  company={{
                    name: companyName,
                    logoUrl: companyLogoUrl,
                    ...companyInfo,
                  }}
                  clientName={clients.find((c) => c.id === clientId)?.name}
                  quoteNumber={quoteNumber}
                  compactMode={compactMode}
                />
              </div>
            </div>
          </div>
          </ResizablePanel>}
        </ResizablePanelGroup>

        {/* Mobile-only inline preview, shown below the form */}
        {isMobile && (
          <div className="mt-6 pb-8">
            <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
              <Eye className="h-4 w-4" />
              <span className="font-medium">{t("quotes.livePreview", "Förhandsgranskning")}</span>
              <span className="text-xs">{t("quotes.previewSubtitle", "Så här ser offerten ut för kund")}</span>
            </div>
            <div className="rounded-lg bg-neutral-100 dark:bg-neutral-900 p-2 overflow-hidden">
              <div style={{ zoom: mobilePreviewScale }}>
                <QuoteDocument
                  projectName={projectName}
                  objectDescription={objectDescription}
                  items={items}
                  freeText={freeText}
                  company={{ name: companyName, logoUrl: companyLogoUrl, ...companyInfo }}
                  clientName={clients.find((c) => c.id === clientId)?.name}
                  quoteNumber={quoteNumber}
                  compactMode={compactMode}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      <QuotePreview
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        projectName={projectName}
        objectDescription={objectDescription}
        items={items}
        freeText={freeText}
        company={{
          name: companyName,
          logoUrl: companyLogoUrl,
          ...companyInfo,
        }}
        clientName={clients.find((c) => c.id === clientId)?.name}
        quoteNumber={quoteNumber}
      />

      <ImportRoomDialog
        open={importRoomItemId !== null}
        onClose={() => setImportRoomItemId(null)}
        projectId={projectId || null}
        onSelect={handleRoomSelect}
        selectedRoomId={importRoomItemId ? items.find((i) => i.id === importRoomItemId)?.roomId : undefined}
      />

      {profileId && (
        <CreateClientDialog
          open={createClientOpen}
          onClose={() => setCreateClientOpen(false)}
          onSaved={(client) => {
            setClients((prev) => [...prev, client].sort((a, b) => a.name.localeCompare(b.name)));
            setClientId(client.id);
          }}
          ownerId={profileId}
        />
      )}
    </div>
  );
}
