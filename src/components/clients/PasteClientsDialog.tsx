import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, ClipboardPaste } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { parsePastedClients } from "@/lib/pasteTable";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerId: string;
  companyId?: string | null;
  onImported: () => void;
}

/**
 * "Klistra in kunder" — the import that matches what a switcher actually has.
 *
 * Bygglet publishes no CSV export and its terms put extraction on the customer,
 * so the person moving over has rows selected in Excel or dragged off a screen.
 * That pastes as tab-separated text. A file picker would ask them for something
 * they cannot produce; a box they can paste into asks for what they already hold.
 *
 * Nothing is written until they have seen the table we read out of it — the same
 * rule as the folder import: preview first, then commit.
 */
export function PasteClientsDialog({ open, onOpenChange, ownerId, companyId, onImported }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const parsed = useMemo(() => parsePastedClients(text), [text]);

  const save = async () => {
    if (parsed.rows.length === 0) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("clients").insert(
        parsed.rows.map((r) => ({
          owner_id: ownerId,
          company_id: companyId ?? null,
          name: r.name,
          email: r.email,
          phone: r.phone,
          address: r.address,
          postal_code: r.postal_code,
          city: r.city,
        }))
      );
      if (error) throw error;
      toast.success(
        t("clients.pasteImported", "{{count}} kunder tillagda", { count: parsed.rows.length })
      );
      setText("");
      onOpenChange(false);
      onImported();
    } catch (err) {
      console.error("Paste import failed:", err);
      toast.error(t("clients.pasteFailed", "Kunde inte lägga till kunderna"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("clients.pasteTitle", "Klistra in kunder")}</DialogTitle>
          <DialogDescription>
            {t(
              "clients.pasteHelp",
              "Markera raderna i Excel eller ditt gamla system och klistra in dem här. Rubrikrad hjälper, men behövs inte."
            )}
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          placeholder={"Namn\tE-post\tTelefon\tOrt\nEk Bygg AB\tanna@ekbygg.se\t070-123 45 67\tStockholm"}
          className="font-mono text-xs"
        />

        {text.trim() && (
          <div className="rounded-lg border">
            <div className="flex items-baseline justify-between border-b px-3 py-2 text-sm">
              <span className="font-medium">
                {t("clients.pastePreview", "{{count}} kunder att lägga till", {
                  count: parsed.rows.length,
                })}
              </span>
              {parsed.skipped > 0 && (
                <span className="text-xs text-muted-foreground">
                  {t("clients.pasteSkipped", "{{count}} rader utan namn hoppas över", {
                    count: parsed.skipped,
                  })}
                </span>
              )}
            </div>
            <div className="max-h-56 overflow-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  {parsed.rows.slice(0, 20).map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 font-medium">{r.name}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{r.email ?? ""}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{r.phone ?? ""}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {[r.address, r.postal_code, r.city].filter(Boolean).join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.rows.length > 20 && (
              <div className="border-t px-3 py-1.5 text-xs text-muted-foreground">
                {t("clients.pasteMore", "+ {{count}} till", { count: parsed.rows.length - 20 })}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("common.cancel", "Avbryt")}
          </Button>
          <Button onClick={save} disabled={saving || parsed.rows.length === 0}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ClipboardPaste className="mr-2 h-4 w-4" />
            )}
            {t("clients.pasteConfirm", "Lägg till {{count}} kunder", { count: parsed.rows.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
