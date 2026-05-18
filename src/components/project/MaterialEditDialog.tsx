import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { SupplierAutocomplete } from "@/components/shared/SupplierAutocomplete";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Loader2, Info, Split, Plus, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CommentsSection } from "@/components/comments/CommentsSection";
import { EntityPhotoGallery } from "@/components/shared/EntityPhotoGallery";
import { TaskFilesList } from "./TaskFilesList";

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
  supplier_id: string | null;
  status: string;
  exclude_from_budget: boolean;
  task_id: string | null;
  room_id: string | null;
  assigned_to_user_id: string | null;
  project_id: string;
}

interface MaterialEditDialogProps {
  materialId: string | null;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  currency?: string | null;
}

export const MaterialEditDialog = ({
  materialId,
  projectId,
  open,
  onOpenChange,
  onSaved,
  currency,
}: MaterialEditDialogProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [material, setMaterial] = useState<Material | null>(null);
  // Full raw row (Material interface is a narrow subset; split needs the
  // link fields purchase_order_id / source_material_id / created_by_user_id).
  const [rawRow, setRawRow] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [splitMode, setSplitMode] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [splitParts, setSplitParts] = useState<{ amount: string; taskId: string }[]>([]);
  const [rooms, setRooms] = useState<{ id: string; name: string }[]>([]);
  const [tasks, setTasks] = useState<{ id: string; title: string }[]>([]);
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string }[]>([]);
  const [matProfileId, setMatProfileId] = useState<string | null>(null);
  const [matSuppliers, setMatSuppliers] = useState<{ id: string; name: string }[]>([]);

  const fetchMaterial = useCallback(async () => {
    if (!materialId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("materials")
        .select("*")
        .eq("id", materialId)
        .single();

      if (error) throw error;
      setMaterial(data);
      setRawRow(data as unknown as Record<string, unknown>);
      setSplitMode(false);
      setSplitParts([]);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to load material";
      toast({ title: t("common.error"), description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [materialId, toast, t]);

  const fetchSupportingData = useCallback(async () => {
    try {
      // Fetch rooms and tasks in parallel
      const [roomsRes, tasksRes] = await Promise.all([
        supabase.from("rooms").select("id, name").eq("project_id", projectId).order("name"),
        supabase.from("tasks").select("id, title").eq("project_id", projectId).order("title"),
      ]);

      setRooms(roomsRes.data || []);
      setTasks(tasksRes.data || []);

      // Fetch team members in two steps (no FK relationship)
      const { data: sharesData } = await supabase
        .from("project_shares")
        .select("profile_id")
        .eq("project_id", projectId);

      const profileIds = (sharesData || [])
        .map((s) => s.profile_id)
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

      // Fetch suppliers for autocomplete
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: prof } = await supabase.from("profiles").select("id").eq("user_id", user.id).single();
        if (prof) {
          setMatProfileId(prof.id);
          const { data: suppData } = await supabase.from("suppliers").select("id, name").eq("profile_id", prof.id).order("name");
          setMatSuppliers(suppData || []);
        }
      }
    } catch (error) {
      console.error("Failed to fetch supporting data:", error);
    }
  }, [projectId]);

  useEffect(() => {
    if (open && materialId) {
      fetchMaterial();
      fetchSupportingData();
    }
  }, [open, materialId, fetchMaterial, fetchSupportingData]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!material) return;

    setSaving(true);
    try {
      const computedTotal = (material.quantity || 0) * (material.price_per_unit || 0);
      const { error } = await supabase
        .from("materials")
        .update({
          name: material.name,
          description: material.description || null,
          quantity: material.quantity,
          unit: material.unit,
          price_per_unit: material.price_per_unit,
          price_total: computedTotal || null,
          status: material.status || "submitted",
          vendor_name: material.vendor_name,
          vendor_link: material.vendor_link,
          supplier_id: material.supplier_id || null,
          exclude_from_budget: material.exclude_from_budget,
          ordered_amount: material.ordered_amount || null,
          paid_amount: material.paid_amount || null,
          room_id: material.room_id === "none" ? null : material.room_id,
          task_id: material.task_id === "none" ? null : material.task_id,
          assigned_to_user_id: material.assigned_to_user_id === "none" ? null : material.assigned_to_user_id,
        })
        .eq("id", material.id);

      if (error) throw error;

      toast({
        title: t("common.success"),
        description: t("purchases.orderUpdated"),
      });

      onOpenChange(false);
      onSaved?.();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to update";
      toast({ title: t("common.error"), description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const originalTotal = material
    ? (material.price_total ?? ((material.quantity || 0) * (material.price_per_unit || 0)) ?? 0)
    : 0;
  // Splitting a line that's already been ordered/paid would desync the
  // payment records — only allow it on a clean line with a known total.
  const canSplit =
    !!material &&
    originalTotal > 0 &&
    (material.ordered_amount ?? 0) === 0 &&
    (material.paid_amount ?? 0) === 0;
  const splitSum = splitParts.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const splitRemaining = Math.round((originalTotal - splitSum) * 100) / 100;
  const splitValid =
    splitParts.length >= 2 &&
    splitParts.every((p) => (parseFloat(p.amount) || 0) > 0) &&
    Math.abs(splitRemaining) < 0.01;

  const startSplit = () => {
    if (!material) return;
    setSplitParts([
      { amount: String(originalTotal), taskId: material.task_id || "none" },
      { amount: "", taskId: "none" },
    ]);
    setSplitMode(true);
  };

  const handleSplit = async () => {
    if (!material || !rawRow || !splitValid) return;
    setSplitting(true);
    try {
      const origQty = material.quantity || 0;
      const children = splitParts.map((p) => {
        const amount = parseFloat(p.amount) || 0;
        const ratio = originalTotal > 0 ? amount / originalTotal : 0;
        return {
          project_id: material.project_id,
          purchase_order_id: (rawRow.purchase_order_id as string | null) ?? null,
          source_material_id: (rawRow.source_material_id as string | null) ?? null,
          name: material.name,
          description: material.description || null,
          quantity: origQty > 0 ? Math.round(origQty * ratio * 1000) / 1000 : null,
          unit: material.unit,
          price_per_unit: material.price_per_unit,
          price_total: amount,
          status: material.status,
          vendor_name: material.vendor_name,
          vendor_link: material.vendor_link,
          supplier_id: material.supplier_id || null,
          exclude_from_budget: material.exclude_from_budget,
          room_id: material.room_id || null,
          task_id: p.taskId === "none" ? null : p.taskId,
          assigned_to_user_id: material.assigned_to_user_id || null,
          created_by_user_id: (rawRow.created_by_user_id as string | null) ?? null,
        };
      });

      // Insert children first so a failure leaves the original intact
      // (no money lost); only then delete the original.
      const { data: inserted, error: insErr } = await supabase
        .from("materials")
        .insert(children)
        .select("id");
      if (insErr) throw insErr;

      const { error: delErr } = await supabase
        .from("materials")
        .delete()
        .eq("id", material.id);
      if (delErr) {
        // Roll back the just-created children to avoid double-counting.
        const ids = (inserted || []).map((r) => r.id);
        if (ids.length) await supabase.from("materials").delete().in("id", ids);
        throw delErr;
      }

      toast({
        title: t("common.success"),
        description: t("purchases.splitDone", "Raden delades"),
      });
      onOpenChange(false);
      onSaved?.();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to split";
      toast({ title: t("common.error"), description: msg, variant: "destructive" });
    } finally {
      setSplitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl lg:max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{t("purchases.editOrder")}</DialogTitle>
          <DialogDescription>{t("purchases.editOrderDescription")}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : material ? (
          <form onSubmit={handleSave} className="flex flex-col flex-1 overflow-hidden">
            <div className="space-y-4 overflow-y-auto flex-1 pr-2">
              <div className="space-y-2">
                <Label htmlFor="edit-status">{t("common.status")}</Label>
                <Select
                  value={material.status || "submitted"}
                  onValueChange={(value) => setMaterial({ ...material, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("common.selectStatus")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="submitted">{t("materialStatuses.submitted")}</SelectItem>
                    <SelectItem value="declined">{t("materialStatuses.declined")}</SelectItem>
                    <SelectItem value="approved">{t("materialStatuses.approved")}</SelectItem>
                    <SelectItem value="billed">{t("materialStatuses.billed")}</SelectItem>
                    <SelectItem value="paid">{t("materialStatuses.paid")}</SelectItem>
                    <SelectItem value="paused">{t("materialStatuses.paused")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-material-name">{t("purchases.materialName")}*</Label>
                <Input
                  id="edit-material-name"
                  value={material.name}
                  onChange={(e) => setMaterial({ ...material, name: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-description">{t("common.description")}</Label>
                <Textarea
                  id="edit-description"
                  value={material.description || ""}
                  onChange={(e) => setMaterial({ ...material, description: e.target.value })}
                  placeholder="Additional details..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-quantity">{t("common.quantity")}*</Label>
                  <Input
                    id="edit-quantity"
                    type="number"
                    step="0.01"
                    value={material.quantity}
                    onChange={(e) => setMaterial({ ...material, quantity: parseFloat(e.target.value) || 0 })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-unit">{t("common.unit")}*</Label>
                  <Input
                    id="edit-unit"
                    value={material.unit}
                    onChange={(e) => setMaterial({ ...material, unit: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-price-per-unit">{t("purchases.pricePerUnit")}</Label>
                <Input
                  id="edit-price-per-unit"
                  type="number"
                  step="0.01"
                  value={material.price_per_unit || ""}
                  onChange={(e) =>
                    setMaterial({ ...material, price_per_unit: e.target.value ? parseFloat(e.target.value) : null })
                  }
                />
                {material.quantity && material.price_per_unit && (
                  <p className="text-sm text-muted-foreground">
                    {t("purchases.priceTotal")}:{" "}
                    {formatCurrency(material.quantity * material.price_per_unit, currency, { decimals: 2 })}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-ordered-amount">{t("purchases.orderedAmount")}</Label>
                  <Input
                    id="edit-ordered-amount"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={material.ordered_amount?.toString() || ""}
                    onChange={(e) =>
                      setMaterial({ ...material, ordered_amount: e.target.value ? parseFloat(e.target.value) : null })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-paid-amount">{t("purchases.paidAmount")}</Label>
                  <Input
                    id="edit-paid-amount"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={material.paid_amount?.toString() || ""}
                    onChange={(e) =>
                      setMaterial({ ...material, paid_amount: e.target.value ? parseFloat(e.target.value) : null })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t("purchases.vendorName")}</Label>
                <SupplierAutocomplete
                  profileId={matProfileId}
                  suppliers={matSuppliers}
                  value={matSuppliers.find(s => s.id === material.supplier_id)?.name || material.vendor_name || ""}
                  onChange={(suppId, name) => setMaterial({ ...material, supplier_id: suppId, vendor_name: name || null })}
                  onCreated={async () => {
                    if (!matProfileId) return;
                    const { data } = await supabase.from("suppliers").select("id, name").eq("profile_id", matProfileId).order("name");
                    setMatSuppliers(data || []);
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-vendor-link">{t("purchases.vendorLink")}</Label>
                <Input
                  id="edit-vendor-link"
                  type="url"
                  value={material.vendor_link || ""}
                  onChange={(e) => setMaterial({ ...material, vendor_link: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-room">
                  {t("purchases.room")} ({t("common.optional")})
                </Label>
                <Select
                  value={material.room_id || "none"}
                  onValueChange={(value) => setMaterial({ ...material, room_id: value === "none" ? null : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("purchases.selectRoom")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("purchases.noRoom")}</SelectItem>
                    {rooms.map((room) => (
                      <SelectItem key={room.id} value={room.id}>
                        {room.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-task">
                  {t("purchases.linkToTask")} ({t("common.optional")})
                </Label>
                <Select
                  value={material.task_id || "none"}
                  onValueChange={(value) => setMaterial({ ...material, task_id: value === "none" ? null : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("purchases.selectTask")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("purchases.noTask")}</SelectItem>
                    {tasks.map((task) => (
                      <SelectItem key={task.id} value={task.id}>
                        {task.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-assigned-to">
                  {t("purchases.assignTo")} ({t("common.optional")})
                </Label>
                <Select
                  value={material.assigned_to_user_id || "none"}
                  onValueChange={(value) =>
                    setMaterial({ ...material, assigned_to_user_id: value === "none" ? null : value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("purchases.selectTeamMember")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("common.unassigned")}</SelectItem>
                    {teamMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="edit-exclude-from-budget"
                  checked={material.exclude_from_budget}
                  onChange={(e) => setMaterial({ ...material, exclude_from_budget: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="edit-exclude-from-budget" className="text-sm font-normal cursor-pointer">
                  {t("purchases.excludeFromBudget")}
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[240px]">
                      <p className="text-xs">{t("purchases.ataTooltip")}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {/* Photos & Documents */}
              <Separator className="my-4" />
              <EntityPhotoGallery entityId={material.id} entityType="material" projectId={projectId} />
              <TaskFilesList materialId={material.id} projectId={projectId} />

              {/* Comments Section */}
              <Separator className="my-4" />
              <CommentsSection materialId={material.id} projectId={projectId} />

              {splitMode && (
                <>
                  <Separator className="my-4" />
                  <div className="space-y-3 rounded-md border p-3">
                    <div className="flex items-center gap-2">
                      <Split className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        {t("purchases.splitTitle", "Dela raden")}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "purchases.splitHint",
                        "Dela upp beloppet på flera delar — varje del kan kopplas till olika uppgift. Summan måste matcha radens totala belopp.",
                      )}
                    </p>
                    {splitParts.map((part, idx) => (
                      <div key={idx} className="flex items-end gap-2">
                        <div className="flex-1 space-y-1">
                          <Label className="text-xs">
                            {t("purchases.splitAmount", "Belopp")} {idx + 1}
                          </Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={part.amount}
                            onChange={(e) =>
                              setSplitParts((prev) =>
                                prev.map((p, i) =>
                                  i === idx ? { ...p, amount: e.target.value } : p,
                                ),
                              )
                            }
                          />
                        </div>
                        <div className="flex-1 space-y-1">
                          <Label className="text-xs">{t("purchases.linkToTask", "Koppla till uppgift")}</Label>
                          <Select
                            value={part.taskId}
                            onValueChange={(v) =>
                              setSplitParts((prev) =>
                                prev.map((p, i) => (i === idx ? { ...p, taskId: v } : p)),
                              )
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">{t("purchases.noTask", "Ingen uppgift")}</SelectItem>
                              {tasks.map((task) => (
                                <SelectItem key={task.id} value={task.id}>
                                  {task.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          disabled={splitParts.length <= 2}
                          onClick={() =>
                            setSplitParts((prev) => prev.filter((_, i) => i !== idx))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <div className="flex items-center justify-between">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() =>
                          setSplitParts((prev) => [...prev, { amount: "", taskId: "none" }])
                        }
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        {t("purchases.splitAddPart", "Lägg till del")}
                      </Button>
                      <span
                        className={cn(
                          "text-xs tabular-nums",
                          Math.abs(splitRemaining) < 0.01
                            ? "text-muted-foreground"
                            : "text-destructive",
                        )}
                      >
                        {t("purchases.splitRemaining", "Kvar att fördela")}:{" "}
                        {formatCurrency(splitRemaining, currency, { decimals: 2 })}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Fixed footer */}
            <div className="flex-shrink-0 pt-4 border-t mt-4 bg-background sticky bottom-0 space-y-2">
              {splitMode ? (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    disabled={splitting}
                    onClick={() => {
                      setSplitMode(false);
                      setSplitParts([]);
                    }}
                  >
                    {t("common.cancel", "Avbryt")}
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    disabled={!splitValid || splitting}
                    onClick={handleSplit}
                  >
                    {splitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        {t("purchases.splitting", "Delar…")}
                      </>
                    ) : (
                      t("purchases.splitConfirm", "Bekräfta delning")
                    )}
                  </Button>
                </div>
              ) : (
                <>
                  <Button type="submit" className="w-full" disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        {t("purchases.updating")}
                      </>
                    ) : (
                      t("purchases.updateOrder")
                    )}
                  </Button>
                  {canSplit && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full h-8 text-xs text-muted-foreground"
                      onClick={startSplit}
                    >
                      <Split className="mr-1.5 h-3.5 w-3.5" />
                      {t("purchases.splitLine", "Dela raden")}
                    </Button>
                  )}
                </>
              )}
            </div>
          </form>
        ) : (
          <p className="text-muted-foreground py-8 text-center">{t("budget.noData")}</p>
        )}
      </DialogContent>
    </Dialog>
  );
};
