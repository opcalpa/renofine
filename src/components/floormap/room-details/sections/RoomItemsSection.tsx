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
import { Plus, Pencil, Trash2, Check, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ELECTRICAL_ITEM_SUBTYPE_OPTIONS } from "../constants";

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
}

// Categories rendered top-to-bottom. Electrical first (E2); others follow as
// the model is generalised. Subtype options per category drive the type select.
const CATEGORY_ORDER = ["electrical"] as const;
const SUBTYPE_OPTIONS: Record<string, { value: string; labelKey: string }[]> = {
  electrical: ELECTRICAL_ITEM_SUBTYPE_OPTIONS,
};

interface RoomItemsSectionProps {
  roomId?: string;
  projectId: string;
  /** Category to manage; defaults to electrical (E2). */
  category?: string;
}

interface EditorState {
  id: string | null;
  subtype: string;
  title: string;
  quantity: string;
  productLink: string;
}

const emptyEditor: EditorState = { id: null, subtype: "", title: "", quantity: "", productLink: "" };

export function RoomItemsSection({ roomId, projectId, category = "electrical" }: RoomItemsSectionProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<RoomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<EditorState>(emptyEditor);

  const subtypeOptions = SUBTYPE_OPTIONS[category] ?? [];
  const labelForSubtype = useCallback(
    (subtype: string | null) => {
      const opt = subtypeOptions.find((o) => o.value === subtype);
      return opt ? t(opt.labelKey) : "";
    },
    [subtypeOptions, t]
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
      .select("id, category, subtype, title, detail, install_status, representation_kind")
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
      subtype: item.subtype ?? "",
      title: item.title,
      quantity: item.detail.quantity != null ? String(item.detail.quantity) : "",
      productLink: item.detail.product_link ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubtypeChange = (value: string) => {
    // Auto-fill the title from the subtype label unless the user has typed a custom one.
    const currentLabel = labelForSubtype(editor.subtype);
    const shouldAutofill = !editor.title.trim() || editor.title === currentLabel;
    setEditor((prev) => ({
      ...prev,
      subtype: value,
      title: shouldAutofill ? labelForSubtype(value) : prev.title,
    }));
  };

  const handleSave = async () => {
    if (!roomId) return;
    const title = editor.title.trim() || labelForSubtype(editor.subtype);
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
          .update({ subtype: editor.subtype || null, title, detail })
          .eq("id", editor.id);
        if (error) throw error;
        toast.success(t("roomItems.updated", "Objekt uppdaterat"));
      } else {
        const { error } = await supabase.from("room_items").insert({
          project_id: projectId,
          room_id: roomId,
          category,
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

  // E2 manages a single category; group rendering kept generic for future categories.
  const grouped = CATEGORY_ORDER.filter((c) => c === category).map((c) => ({
    category: c,
    items: items.filter((i) => i.category === c),
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={openCreate}>
          <Plus className="mr-1 h-3 w-3" />
          {t("roomItems.addItem", "Lägg till")}
        </Button>
      </div>

      {grouped.map(({ category: cat, items: catItems }) => (
        <div key={cat}>
          {catItems.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              {t("roomItems.empty", "Inga objekt loggade än")}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {catItems.map((item) => {
                const installed = item.install_status === "installed";
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
                    <div className="ml-auto flex shrink-0 items-center gap-0.5">
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
          )}
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
              <Label>{t("roomItems.type", "Typ")}</Label>
              <Select value={editor.subtype} onValueChange={handleSubtypeChange}>
                <SelectTrigger>
                  <SelectValue placeholder={t("roomItems.selectType", "Välj typ")} />
                </SelectTrigger>
                <SelectContent>
                  {subtypeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {t(opt.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
