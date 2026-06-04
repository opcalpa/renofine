import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Check, ExternalLink, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { ELECTRICAL_ITEM_SUBTYPE_OPTIONS, ROOM_ITEM_CATEGORIES } from "../constants";

interface RoomItemDetail {
  product_link?: string;
  quantity?: number;
  notes?: string;
}

interface RoomItem {
  id: string;
  category: string;
  subtype: string | null;
  title: string;
  detail: RoomItemDetail;
  install_status: string;
  representation_kind: string;
  floor_map_shape_id: string | null;
}

// Subtype catalogs per category. Only electrical has one today (it maps to the
// canvas object library); other categories are free-text list entries.
const SUBTYPE_OPTIONS: Record<string, { value: string; labelKey: string }[]> = {
  electrical: ELECTRICAL_ITEM_SUBTYPE_OPTIONS,
};
const subtypesFor = (category: string) => SUBTYPE_OPTIONS[category] ?? [];

interface RoomItemsSectionProps {
  roomId?: string;
  projectId: string;
  /** E3: hand off to the floor planner to place this item as a canvas object. */
  onPlaceOnPlan?: (args: { itemId: string; roomId: string; subtype: string }) => void;
}

interface EditorState {
  id: string | null;
  category: string;
  subtype: string;
  title: string;
  quantity: string;
  productLink: string;
}

const emptyEditor: EditorState = {
  id: null,
  category: ROOM_ITEM_CATEGORIES[0].value,
  subtype: "",
  title: "",
  quantity: "",
  productLink: "",
};

export function RoomItemsSection({ roomId, projectId, onPlaceOnPlan }: RoomItemsSectionProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<RoomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<EditorState>(emptyEditor);

  const editorSubtypes = subtypesFor(editor.category);
  const labelForSubtype = useCallback(
    (category: string, subtype: string | null) => {
      const opt = subtypesFor(category).find((o) => o.value === subtype);
      return opt ? t(opt.labelKey) : "";
    },
    [t]
  );

  const fetchItems = useCallback(async () => {
    if (!roomId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("room_items")
      .select("id, category, subtype, title, detail, install_status, representation_kind, floor_map_shape_id")
      .eq("room_id", roomId)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to load room items:", error);
      toast.error(t("roomItems.loadError", "Kunde inte ladda objekt"));
    } else {
      setItems(
        (data ?? []).map((row) => ({
          ...row,
          detail: (row.detail ?? {}) as RoomItemDetail,
        }))
      );
    }
    setLoading(false);
  }, [roomId, t]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const openCreate = () => {
    setEditor(emptyEditor);
    setDialogOpen(true);
  };

  const openEdit = (item: RoomItem) => {
    setEditor({
      id: item.id,
      category: item.category,
      subtype: item.subtype ?? "",
      title: item.title,
      quantity: item.detail.quantity != null ? String(item.detail.quantity) : "",
      productLink: item.detail.product_link ?? "",
    });
    setDialogOpen(true);
  };

  const handleCategoryChange = (value: string) => {
    // Switching category drops a now-irrelevant subtype; if the title still
    // mirrors the old subtype label, clear it so it can re-autofill.
    const oldLabel = labelForSubtype(editor.category, editor.subtype);
    setEditor((prev) => ({
      ...prev,
      category: value,
      subtype: "",
      title: prev.title === oldLabel ? "" : prev.title,
    }));
  };

  const handleSubtypeChange = (value: string) => {
    // Auto-fill the title from the subtype label unless the user has typed a custom one.
    const currentLabel = labelForSubtype(editor.category, editor.subtype);
    const shouldAutofill = !editor.title.trim() || editor.title === currentLabel;
    setEditor((prev) => ({
      ...prev,
      subtype: value,
      title: shouldAutofill ? labelForSubtype(editor.category, value) : prev.title,
    }));
  };

  const handleSave = async () => {
    if (!roomId) return;
    const title = editor.title.trim() || labelForSubtype(editor.category, editor.subtype);
    if (!title) {
      toast.error(t("roomItems.titleRequired", "Välj en typ eller ange en benämning"));
      return;
    }

    const qty = editor.quantity.trim() ? Number(editor.quantity) : undefined;
    const detail: RoomItemDetail = {};
    if (qty != null && !Number.isNaN(qty) && qty > 0) detail.quantity = qty;
    if (editor.productLink.trim()) detail.product_link = editor.productLink.trim();

    setSaving(true);
    try {
      if (editor.id) {
        const { error } = await supabase
          .from("room_items")
          .update({ category: editor.category, subtype: editor.subtype || null, title, detail })
          .eq("id", editor.id);
        if (error) throw error;
        toast.success(t("roomItems.updated", "Objekt uppdaterat"));
      } else {
        const { error } = await supabase.from("room_items").insert({
          project_id: projectId,
          room_id: roomId,
          category: editor.category,
          subtype: editor.subtype || null,
          title,
          detail,
          representation_kind: "none",
        });
        if (error) throw error;
        toast.success(t("roomItems.created", "Objekt loggat"));
      }
      setDialogOpen(false);
      fetchItems();
    } catch (err) {
      console.error("Failed to save room item:", err);
      toast.error(t("roomItems.saveError", "Kunde inte spara objektet"));
    } finally {
      setSaving(false);
    }
  };

  const toggleInstalled = async (item: RoomItem) => {
    const next = item.install_status === "installed" ? "planned" : "installed";
    // Optimistic update
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, install_status: next } : i)));
    const { error } = await supabase.from("room_items").update({ install_status: next }).eq("id", item.id);
    if (error) {
      console.error("Failed to update install status:", error);
      toast.error(t("roomItems.saveError", "Kunde inte spara objektet"));
      fetchItems();
    }
  };

  const handleDelete = async (item: RoomItem) => {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    const { error } = await supabase.from("room_items").delete().eq("id", item.id);
    if (error) {
      console.error("Failed to delete room item:", error);
      toast.error(t("roomItems.deleteError", "Kunde inte ta bort objektet"));
      fetchItems();
    } else {
      toast.success(t("roomItems.deleted", "Objekt borttaget"));
    }
  };

  if (!roomId) {
    return (
      <p className="py-2 text-sm text-muted-foreground">
        {t("roomItems.saveRoomFirst", "Spara rummet först för att logga objekt")}
      </p>
    );
  }

  if (loading) {
    return <p className="py-2 text-sm text-muted-foreground">{t("roomItems.loading", "Laddar objekt…")}</p>;
  }

  // Group by category in the configured order; only show groups that have items.
  const grouped = ROOM_ITEM_CATEGORIES.map((c) => ({
    category: c,
    catItems: items.filter((i) => i.category === c.value),
  })).filter((g) => g.catItems.length > 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={openCreate}>
          <Plus className="mr-1 h-3 w-3" />
          {t("roomItems.addItem", "Lägg till")}
        </Button>
      </div>

      {items.length === 0 && (
        <p className="py-2 text-sm text-muted-foreground">
          {t("roomItems.empty", "Inga objekt loggade än")}
        </p>
      )}

      {grouped.map(({ category: cat, catItems }) => (
        <div key={cat.value}>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t(cat.labelKey)}
          </p>
          <ul className="space-y-1.5">
            {catItems.map((item) => {
                const installed = item.install_status === "installed";
                // Gate on the shape FK, not representation_kind: deleting the object
                // on the canvas nulls this via ON DELETE SET NULL, so the item reverts
                // to placeable automatically (E3.2 deletion sync — no extra code).
                const isPlaced = !!item.floor_map_shape_id;
                const canPlace =
                  !!onPlaceOnPlan &&
                  !!roomId &&
                  !isPlaced &&
                  subtypesFor(item.category).some((o) => o.value === item.subtype);
                return (
                  <li
                    key={item.id}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
                  >
                    <button
                      type="button"
                      onClick={() => toggleInstalled(item)}
                      title={installed ? t("roomItems.installed", "Installerad") : t("roomItems.markInstalled", "Markera installerad")}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                        installed
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-muted-foreground/40 text-transparent hover:border-emerald-400"
                      }`}
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <span className={`truncate font-medium ${installed ? "text-muted-foreground line-through" : ""}`}>
                      {item.title}
                    </span>
                    {item.detail.quantity != null && (
                      <span className="rf-num shrink-0 text-xs text-muted-foreground">×{item.detail.quantity}</span>
                    )}
                    {item.detail.product_link && (
                      <a
                        href={item.detail.product_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        title={t("roomItems.productLink", "Produktlänk")}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {isPlaced && (
                      <span
                        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        title={t("roomItems.placedOnPlan", "Placerad på ritning")}
                      >
                        <MapPin className="h-3 w-3" />
                        {t("roomItems.onPlan", "På ritning")}
                      </span>
                    )}
                    <div className="ml-auto flex shrink-0 items-center gap-0.5">
                      {canPlace && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title={t("roomItems.placeOnPlan", "Placera på ritning")}
                          onClick={() =>
                            onPlaceOnPlan!({ itemId: item.id, roomId: roomId!, subtype: item.subtype! })
                          }
                        >
                          <MapPin className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(item)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editor.id ? t("roomItems.editItem", "Redigera objekt") : t("roomItems.newItem", "Nytt objekt")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div>
              <Label>{t("roomItems.category", "Kategori")}</Label>
              <Select value={editor.category} onValueChange={handleCategoryChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROOM_ITEM_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {t(c.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editorSubtypes.length > 0 && (
              <div>
                <Label>{t("roomItems.type", "Typ")}</Label>
                <Select value={editor.subtype} onValueChange={handleSubtypeChange}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("roomItems.selectType", "Välj typ")} />
                  </SelectTrigger>
                  <SelectContent>
                    {editorSubtypes.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {t(opt.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label htmlFor="room-item-title">{t("roomItems.itemTitle", "Benämning")}</Label>
              <Input
                id="room-item-title"
                value={editor.title}
                onChange={(e) => setEditor((prev) => ({ ...prev, title: e.target.value }))}
                placeholder={t("roomItems.titlePlaceholder", "t.ex. Dubbeluttag vid bänk")}
              />
            </div>
            <div className="grid grid-cols-[1fr_2fr] gap-3">
              <div>
                <Label htmlFor="room-item-qty">{t("roomItems.quantity", "Antal")}</Label>
                <Input
                  id="room-item-qty"
                  type="number"
                  min={1}
                  value={editor.quantity}
                  onChange={(e) => setEditor((prev) => ({ ...prev, quantity: e.target.value }))}
                  placeholder="1"
                />
              </div>
              <div>
                <Label htmlFor="room-item-link">{t("roomItems.productLink", "Produktlänk")}</Label>
                <Input
                  id="room-item-link"
                  type="url"
                  value={editor.productLink}
                  onChange={(e) => setEditor((prev) => ({ ...prev, productLink: e.target.value }))}
                  placeholder="https://…"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
