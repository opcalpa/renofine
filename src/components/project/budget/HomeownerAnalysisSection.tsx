import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/currency";
import { RotIdentifiersBlock } from "../overview/RotIdentifiersBlock";
import { useRotIdentifiers } from "@/hooks/useRotIdentifiers";
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  FileText,
  Receipt,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Shield,
  UserPlus,
  X,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { DeclarationTable, type DeclarationRow } from "./DeclarationTable";
import { type EvidenceStatus } from "@/lib/evidenceStatus";

// --- Interfaces ---

interface AnalysisProps {
  projectId: string;
  currency?: string | null;
}

interface InvoiceRow {
  id: string;
  title: string | null;
  invoice_number: string | null;
  total_amount: number;
  total_rot_deduction: number;
  paid_amount: number;
  status: string;
  is_ata: boolean;
  notes: string | null;
  paid_at: string | null;
  sent_at: string | null;
  created_at: string;
}

interface InvoiceItemRow {
  invoice_id: string;
  description: string;
  total_price: number;
  is_rot_eligible: boolean;
  rot_deduction: number;
  room_id: string | null;
  source_task_id: string | null;
}

interface MaterialRow {
  id: string;
  name: string;
  description: string | null;
  price_total: number;
  paid_amount: number;
  vendor_name: string | null;
  room_id: string | null;
  created_at: string;
}

interface RoomRow { id: string; name: string }
interface TaskRow { id: string; cost_center: string | null; rot_eligible: boolean | null; rot_amount: number | null }

interface FileLinkRow {
  file_type: string;
  task_id: string | null;
  material_id: string | null;
}

interface RotPersonRow {
  id: string;
  name: string;
  personnummer: string | null;
}

interface RotAllocationRow {
  material_id: string;
  rot_person_id: string;
  amount: number;
}

interface ProjectInfo {
  name: string;
  address: string | null;
  property_designation: string | null;
}

// --- Component ---

export function HomeownerAnalysisSection({ projectId, currency }: AnalysisProps) {
  const { t } = useTranslation();
  // P2: loaded once and shared with the block below, so the readiness check and
  // the list it summarises can never say different things.
  const rotIdentifiers = useRotIdentifiers(projectId);

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItemRow[]>([]);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [fileLinks, setFileLinks] = useState<FileLinkRow[]>([]);
  const [rotPersons, setRotPersons] = useState<RotPersonRow[]>([]);
  const [rotAllocations, setRotAllocations] = useState<RotAllocationRow[]>([]);
  const [rotYearlyLimits, setRotYearlyLimits] = useState<Map<number, number>>(new Map());

  const [expanded, setExpanded] = useState(true);
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");
  const [newPersonPnr, setNewPersonPnr] = useState("");
  const [addingPerson, setAddingPerson] = useState(false);
  const [fetchVersion, setFetchVersion] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [projRes, invRes, matRes, roomsRes, tasksRes, filesRes, personsRes, limitsRes] = await Promise.all([
          supabase.from("projects").select("name, address, property_designation").eq("id", projectId).single(),
          supabase
            .from("invoices")
            .select("id, title, invoice_number, total_amount, total_rot_deduction, paid_amount, status, is_ata, notes, paid_at, sent_at, created_at")
            .eq("project_id", projectId)
            .neq("status", "cancelled")
            .neq("status", "draft")
            .order("created_at", { ascending: false }),
          supabase
            .from("materials")
            .select("id, name, description, price_total, paid_amount, vendor_name, room_id, created_at")
            .eq("project_id", projectId)
            .is("task_id", null),
          supabase.from("rooms").select("id, name").eq("project_id", projectId),
          supabase.from("tasks").select("id, cost_center, rot_eligible, rot_amount").eq("project_id", projectId),
          supabase.from("task_file_links").select("file_type, task_id, material_id").eq("project_id", projectId),
          supabase.from("project_rot_persons").select("id, name, personnummer").eq("project_id", projectId),
          supabase.from("rot_yearly_limits").select("year, max_amount_per_person"),
        ]);

        setProject(projRes.data as ProjectInfo | null);
        const invoicesData = (invRes.data || []) as InvoiceRow[];
        setInvoices(invoicesData);
        setMaterials((matRes.data || []) as MaterialRow[]);
        setRooms((roomsRes.data || []) as RoomRow[]);
        setTasks((tasksRes.data || []) as TaskRow[]);
        setFileLinks((filesRes.data || []) as FileLinkRow[]);
        setRotPersons((personsRes.data || []) as RotPersonRow[]);

        if (limitsRes.data) {
          const map = new Map<number, number>();
          for (const l of limitsRes.data) map.set(l.year, l.max_amount_per_person);
          setRotYearlyLimits(map);
        }

        // Fetch ROT allocations for materials
        const matIds = (matRes.data || []).map((m: { id: string }) => m.id);
        if (matIds.length > 0) {
          const { data: allocs } = await supabase
            .from("material_rot_allocations")
            .select("material_id, rot_person_id, amount")
            .in("material_id", matIds);
          setRotAllocations((allocs || []) as RotAllocationRow[]);
        }

        const invoiceIds = invoicesData.map((i) => i.id);
        if (invoiceIds.length > 0) {
          const { data: items } = await supabase
            .from("invoice_items")
            .select("invoice_id, description, total_price, is_rot_eligible, rot_deduction, room_id, source_task_id")
            .in("invoice_id", invoiceIds);
          setInvoiceItems((items || []) as InvoiceItemRow[]);
        }
      } catch (error) {
        console.error("Failed to load analysis data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [projectId, fetchVersion]);

  // --- Lookup maps ---

  const roomNameMap = useMemo(() => {
    const map = new Map<string, string>();
    rooms.forEach((r) => map.set(r.id, r.name));
    return map;
  }, [rooms]);

  const taskCostCenterMap = useMemo(() => {
    const map = new Map<string, string>();
    tasks.forEach((t) => { if (t.cost_center) map.set(t.id, t.cost_center); });
    return map;
  }, [tasks]);

  // ROT person name map + per-invoice allocation lookup
  const rotPersonNameMap = useMemo(() => {
    const map = new Map<string, string>();
    rotPersons.forEach((p) => map.set(p.id, p.name));
    return map;
  }, [rotPersons]);

  // Build per-invoice ROT person breakdown (invoices don't have direct allocations,
  // so we distribute evenly across persons when ROT exists)
  const invoiceRotPerPerson = useMemo(() => {
    if (rotPersons.length === 0) return new Map<string, { name: string; amount: number }[]>();
    const map = new Map<string, { name: string; amount: number }[]>();
    invoices.forEach((inv) => {
      if (inv.total_rot_deduction > 0) {
        const perPerson = inv.total_rot_deduction / rotPersons.length;
        map.set(inv.id, rotPersons.map((p) => ({ name: p.name, amount: perPerson })));
      }
    });
    return map;
  }, [invoices, rotPersons]);

  // Build per-material ROT person breakdown from allocations
  const materialRotPerPerson = useMemo(() => {
    const map = new Map<string, { name: string; amount: number }[]>();
    const byMaterial = new Map<string, Map<string, number>>();
    rotAllocations.forEach((a) => {
      if (!byMaterial.has(a.material_id)) byMaterial.set(a.material_id, new Map());
      byMaterial.get(a.material_id)!.set(a.rot_person_id, (byMaterial.get(a.rot_person_id) || 0) + a.amount);
    });
    byMaterial.forEach((personMap, matId) => {
      const breakdown: { name: string; amount: number }[] = [];
      personMap.forEach((amount, personId) => {
        breakdown.push({ name: rotPersonNameMap.get(personId) || personId, amount });
      });
      map.set(matId, breakdown);
    });
    return map;
  }, [rotAllocations, rotPersonNameMap]);

  const entityHasFile = useMemo(() => {
    const set = new Set<string>();
    fileLinks.forEach((f) => {
      if (f.file_type === "invoice" || f.file_type === "receipt") {
        if (f.task_id) set.add(`task-${f.task_id}`);
        if (f.material_id) set.add(`material-${f.material_id}`);
        set.add("has-any");
      }
    });
    return set;
  }, [fileLinks]);

  // --- Build rows ---

  const rows = useMemo((): DeclarationRow[] => {
    const result: DeclarationRow[] = [];

    invoices.forEach((inv) => {
      const items = invoiceItems.filter((i) => i.invoice_id === inv.id);
      const laborAmount = items
        .filter((i) => i.is_rot_eligible)
        .reduce((s, i) => s + (i.total_price || 0), 0);

      const itemRoomIds = items.map((i) => i.room_id).filter((id): id is string => !!id);
      const uniqueRooms = [...new Set(itemRoomIds)].map((id) => roomNameMap.get(id)).filter(Boolean);

      const itemTaskIds = items.map((i) => i.source_task_id).filter((id): id is string => !!id);
      const categories = [...new Set(itemTaskIds.map((id) => taskCostCenterMap.get(id)).filter(Boolean))];

      result.push({
        id: inv.id,
        type: "invoice",
        vendor: inv.title || inv.invoice_number || t("invoices.untitled", "Faktura"),
        description: items.length > 0 ? items.map((i) => i.description).join(", ") : inv.title || "",
        category: categories.length > 0 ? categories.join(", ") : null,
        room: uniqueRooms.length > 0 ? uniqueRooms.join(", ") : null,
        invoiceDate: inv.sent_at || inv.created_at,
        paidDate: inv.paid_at || null,
        amount: inv.total_amount || 0,
        laborAmount,
        rotDeduction: inv.total_rot_deduction || 0,
        netCost: (inv.total_amount || 0) - (inv.total_rot_deduction || 0),
        paymentMethod: null,
        hasDocuments: entityHasFile.has("has-any"),
        evidenceStatus: (entityHasFile.has("has-any") && (inv.total_amount || 0) > 0
          ? "verified"
          : (inv.total_amount || 0) > 0 ? "registered" : "missing") as EvidenceStatus,
        rotPerPerson: invoiceRotPerPerson.get(inv.id),
        paymentYear: inv.paid_at ? new Date(inv.paid_at).getFullYear() : undefined,
        notes: inv.notes || (inv.is_ata ? t('budget.addition', 'Tillägg') : null),
      });
    });

    materials.forEach((mat) => {
      const hasDoc = entityHasFile.has(`material-${mat.id}`);
      const roomName = mat.room_id ? roomNameMap.get(mat.room_id) : null;

      result.push({
        id: mat.id,
        type: "material",
        vendor: mat.vendor_name || "—",
        description: mat.name,
        category: t("declaration.categoryMaterial", "Material"),
        room: roomName || null,
        invoiceDate: mat.created_at,
        paidDate: null,
        amount: mat.price_total || 0,
        laborAmount: 0,
        rotDeduction: 0,
        netCost: mat.price_total || 0,
        paymentMethod: null,
        hasDocuments: hasDoc,
        evidenceStatus: (hasDoc && (mat.price_total || 0) > 0
          ? "verified"
          : (mat.price_total || 0) > 0 ? "registered" : "missing") as EvidenceStatus,
        rotPerPerson: materialRotPerPerson.get(mat.id),
        paymentYear: mat.created_at ? new Date(mat.created_at).getFullYear() : undefined,
        notes: mat.description || null,
      });
    });

    // Sort by year (desc) then by date (desc) within year
    result.sort((a, b) => {
      const yearDiff = (b.paymentYear || 0) - (a.paymentYear || 0);
      if (yearDiff !== 0) return yearDiff;
      return (b.invoiceDate || "").localeCompare(a.invoiceDate || "");
    });
    return result;
  }, [invoices, invoiceItems, materials, roomNameMap, taskCostCenterMap, entityHasFile, t]);

  // --- ROT summary per year ---
  const plannedRot = useMemo(() => {
    return tasks.filter((t) => t.rot_eligible).reduce((s, t) => s + (t.rot_amount || 0), 0);
  }, [tasks]);

  const rotByYear = useMemo(() => {
    const map = new Map<number, number>();
    const add = (y: number, v: number) => map.set(y, (map.get(y) || 0) + v);
    invoices.forEach((inv) => { if (inv.total_rot_deduction > 0 && inv.paid_at) add(new Date(inv.paid_at).getFullYear(), inv.total_rot_deduction); });
    return map;
  }, [invoices]);

  const personCount = Math.max(rotPersons.length, 1);

  // --- Person management ---
  const addPerson = useCallback(async () => {
    if (!newPersonName.trim()) return;
    setAddingPerson(true);
    const { error } = await supabase.from("project_rot_persons").insert({
      project_id: projectId,
      name: newPersonName.trim(),
      personnummer: newPersonPnr.trim() || null,
    });
    setAddingPerson(false);
    if (error) { toast.error(t("rot.addError", "Kunde inte lägga till")); return; }
    setNewPersonName("");
    setNewPersonPnr("");
    setShowAddPerson(false);
    setFetchVersion((v) => v + 1);
    toast.success(t("common.saved", "Sparat"));
  }, [projectId, newPersonName, newPersonPnr, t]);

  const removePerson = useCallback(async (personId: string) => {
    const { error } = await supabase.from("project_rot_persons").delete().eq("id", personId);
    if (error) { toast.error(t("common.error", "Fel")); return; }
    setFetchVersion((v) => v + 1);
  }, [t]);

  // --- Totals & checks ---

  const totals = useMemo(() => {
    const amount = rows.reduce((s, r) => s + r.amount, 0);
    const rot = rows.reduce((s, r) => s + r.rotDeduction, 0);
    return { amount, rot, net: amount - rot };
  }, [rows]);

  const checks = useMemo(() => {
    // P2: this used to be `!!project.property_designation` — a check a
    // bostadsrätt owner could never tick, because Skatteverket does not ask
    // them for a fastighetsbeteckning at all. Now it asks what applies to THIS
    // home: the association's org number and lägenhetsnummer for a bostadsrätt,
    // the designation for a småhus, and nothing for a rental (where ROT does
    // not apply, so the check is not a failure).
    const { eligibility, complete } = rotIdentifiers.status;
    const rotOk = eligibility === 'not_applicable' ? true : complete;
    const allPaid = invoices.length === 0 || invoices.every((i) => (i.paid_amount || 0) >= (i.total_amount || 0));
    const hasFiles = fileLinks.length > 0;
    return [
      { key: "rot", label: t("analysis.checkRotDetails"), ok: rotOk },
      { key: "paid", label: t("analysis.checkInvoicesPaid"), ok: allPaid },
      { key: "files", label: t("analysis.checkFilesAttached"), ok: hasFiles },
    ];
  }, [rotIdentifiers.status, invoices, fileLinks, t]);

  // --- Render ---

  if (loading || rows.length === 0) return null;

  const fc = (amount: number) => formatCurrency(amount, currency, { decimals: 0 });

  return (
    <div className="border rounded-lg">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-indigo-600" />
          <span className="text-sm font-semibold">
            {t("analysis.title", "Kostnadssammanställning")}
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{fc(totals.amount)}</span>
            {totals.rot > 0 && (
              <span className="text-xs text-green-600">ROT &minus;{fc(totals.rot)}</span>
            )}
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Project info */}
          {project && (
            <div className="bg-muted/30 rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-2">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">{project.name}</span>
              </div>
              {project.address && (
                <p className="text-xs text-muted-foreground pl-5">{project.address}</p>
              )}
              {/* P2: show the identifier that actually applies here. The
                  designation line stays for småhus and for projects with no
                  address yet, where it is still the only thing we have. */}
              {rotIdentifiers.status.required.map((identifier) =>
                identifier.value ? (
                  <p key={identifier.key} className="text-xs text-muted-foreground pl-5">
                    {t(identifier.labelKey)}: {identifier.value}
                  </p>
                ) : null
              )}
              {rotIdentifiers.status.required.length === 0 && project.property_designation && (
                <p className="text-xs text-muted-foreground pl-5">
                  {t("analysis.propertyDesignation", "Fastighetsbeteckning")}: {project.property_designation}
                </p>
              )}
            </div>
          )}

          {/* P2: which identifiers ROT needs depends on how the home is held —
              ask that before showing fields that may not apply. */}
          <RotIdentifiersBlock projectId={projectId} isHomeowner state={rotIdentifiers} />

          {/* === ROT Header === */}
          {(totals.rot > 0 || plannedRot > 0) && (
            <div className="rounded-lg border bg-green-50/50 dark:bg-green-950/20 p-3 space-y-3">
              {/* Title row with person management */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-1.5">
                  <Shield className="h-4 w-4 text-green-600" />
                  {t("rot.summary", "ROT-avdrag")}
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[11px] gap-1">
                    <Users className="h-3 w-3" />
                    {rotPersons.length} {rotPersons.length === 1 ? t("rot.person") : t("rot.persons")}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => setShowAddPerson(!showAddPerson)}
                  >
                    <UserPlus className="h-3 w-3" />
                    {t("rot.addPerson", "Lägg till")}
                  </Button>
                </div>
              </div>

              {/* Person list (compact) */}
              {rotPersons.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {rotPersons.map((p) => (
                    <Badge key={p.id} variant="secondary" className="text-xs gap-1 pr-1">
                      {p.name}
                      {p.personnummer && <span className="text-muted-foreground">(****-{p.personnummer.slice(-4)})</span>}
                      <button type="button" onClick={() => removePerson(p.id)} className="ml-0.5 hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Add person form */}
              {showAddPerson && (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder={t("rot.namePlaceholder", "Namn")}
                    value={newPersonName}
                    onChange={(e) => setNewPersonName(e.target.value)}
                    className="h-7 text-xs flex-1"
                    onKeyDown={(e) => { if (e.key === "Enter") addPerson(); if (e.key === "Escape") setShowAddPerson(false); }}
                    autoFocus
                  />
                  <Input
                    placeholder={t("rot.pnrPlaceholder", "Personnummer")}
                    value={newPersonPnr}
                    onChange={(e) => setNewPersonPnr(e.target.value)}
                    className="h-7 text-xs w-36"
                    onKeyDown={(e) => { if (e.key === "Enter") addPerson(); }}
                  />
                  <Button size="sm" className="h-7 text-xs" onClick={addPerson} disabled={!newPersonName.trim() || addingPerson}>
                    {t("common.add", "Lägg till")}
                  </Button>
                </div>
              )}

              {/* Planned vs actual ROT */}
              <div className="space-y-2">
                {/* Planned ROT (from tasks) */}
                {plannedRot > 0 && totals.rot === 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{t("rot.plannedTotal", "Planerat ROT-avdrag")}</span>
                    <span className="tabular-nums text-green-600 font-medium">{fc(plannedRot)}</span>
                  </div>
                )}

                {/* Per-year actual ROT with progress bars */}
                {[...rotByYear.entries()].sort((a, b) => b[0] - a[0]).map(([year, actual]) => {
                  const defaultLimit = rotYearlyLimits.get(year) || 50000;
                  const totalLimit = rotPersons.length > 0
                    ? rotPersons.reduce((s) => s + defaultLimit, 0)
                    : defaultLimit;
                  const pct = Math.min((actual / totalLimit) * 100, 100);
                  const isOver = actual > totalLimit;

                  return (
                    <div key={year} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{year}</span>
                          {plannedRot > 0 && actual < plannedRot && (
                            <span className="text-muted-foreground">
                              ({t("rot.plannedShort", "plan")}: {fc(plannedRot)})
                            </span>
                          )}
                        </div>
                        <div>
                          <span className={cn("font-semibold tabular-nums", isOver ? "text-destructive" : "text-green-700")}>
                            {fc(actual)}
                          </span>
                          <span className="text-muted-foreground ml-1">/ {fc(totalLimit)}</span>
                        </div>
                      </div>
                      <div className="w-full h-2 rounded-full bg-muted overflow-hidden relative">
                        {/* Planned (dashed background hint) */}
                        {plannedRot > 0 && plannedRot > actual && (
                          <div
                            className="absolute h-full rounded-full bg-green-200 dark:bg-green-900/40"
                            style={{ width: `${Math.min((plannedRot / totalLimit) * 100, 100)}%` }}
                          />
                        )}
                        {/* Actual */}
                        <div
                          className={cn("h-full rounded-full transition-all relative z-10", isOver ? "bg-destructive" : pct > 80 ? "bg-amber-400" : "bg-green-500")}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {isOver && (
                        <p className="text-[11px] text-destructive flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {t("rot.overLimit", "Överstiger ROT-tak med {{amount}} kr", { amount: fc(actual - totalLimit) })}
                        </p>
                      )}
                    </div>
                  );
                })}

                {/* If only planned, no actual yet — show a placeholder bar */}
                {rotByYear.size === 0 && plannedRot > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{new Date().getFullYear()}</span>
                      <div>
                        <span className="text-muted-foreground tabular-nums">0 kr</span>
                        <span className="text-muted-foreground ml-1">/ {fc((rotYearlyLimits.get(new Date().getFullYear()) || 50000) * personCount)}</span>
                      </div>
                    </div>
                    <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-green-200 dark:bg-green-900/40" style={{ width: `${Math.min((plannedRot / ((rotYearlyLimits.get(new Date().getFullYear()) || 50000) * personCount)) * 100, 100)}%` }} />
                    </div>
                    <p className="text-[11px] text-muted-foreground">{t("rot.noInvoicesYet", "Inga fakturor betalda ännu — planerat avdrag visas")}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Checklist inline */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            {checks.map((c) => (
              <div key={c.key} className="flex items-center gap-1.5 text-sm">
                {c.ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                )}
                <span className={c.ok ? "text-muted-foreground" : ""}>{c.label}</span>
              </div>
            ))}
          </div>

          <Separator />

          {/* Declaration table */}
          <DeclarationTable rows={rows} currency={currency} />
        </div>
      )}
    </div>
  );
}
