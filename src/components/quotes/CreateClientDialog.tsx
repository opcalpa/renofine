import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export interface Client {
  id: string;
  owner_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  reference: string | null;
  /** Säljer kunden byggtjänster mer än tillfälligt? Villkoret för omvänd byggmoms. */
  sells_construction?: boolean | null;
  /** Köparens momsregistreringsnummer — obligatoriskt vid omvänd byggmoms. */
  vat_number?: string | null;
}

interface CreateClientDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: (client: Client) => void;
  editClient?: Client;
  ownerId: string;
}

export function CreateClientDialog({ open, onClose, onSaved, editClient, ownerId }: CreateClientDialogProps) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [reference, setReference] = useState("");

  useEffect(() => {
    if (editClient) {
      setName(editClient.name);
      setEmail(editClient.email ?? "");
      setPhone(editClient.phone ?? "");
      setAddress(editClient.address ?? "");
      setPostalCode(editClient.postal_code ?? "");
      setCity(editClient.city ?? "");
      setReference(editClient.reference ?? "");
    } else {
      setName("");
      setEmail("");
      setPhone("");
      setAddress("");
      setPostalCode("");
      setCity("");
      setReference("");
    }
  }, [editClient, open]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);

    const payload = {
      owner_id: ownerId,
      name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      address: address.trim() || null,
      postal_code: postalCode.trim() || null,
      city: city.trim() || null,
      reference: reference.trim() || null,
    };

    if (editClient) {
      const { data, error } = await supabase
        .from("clients")
        .update(payload)
        .eq("id", editClient.id)
        .select()
        .single();
      setSaving(false);
      if (error) {
        console.error("Failed to update client:", error);
        toast.error(t("errors.generic"));
        return;
      }
      toast.success(t("clients.clientSaved"));
      onSaved(data as Client);
    } else {
      const { data, error } = await supabase
        .from("clients")
        .insert(payload)
        .select()
        .single();
      setSaving(false);
      if (error) {
        console.error("Failed to create client:", error);
        toast.error(t("errors.generic"));
        return;
      }
      toast.success(t("clients.clientSaved"));
      onSaved(data as Client);
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editClient ? t("clients.editClient") : t("clients.createNew")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{t("clients.name")} *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="min-h-[44px]" />
          </div>
          <div>
            <Label>{t("clients.address")}</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} className="min-h-[44px]" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>{t("clients.postalCode")}</Label>
              <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className="min-h-[44px]" />
            </div>
            <div>
              <Label>{t("clients.city")}</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} className="min-h-[44px]" />
            </div>
          </div>
          <div>
            <Label>{t("clients.email")}</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="min-h-[44px]" />
          </div>
          <div>
            <Label>{t("clients.phone")}</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="min-h-[44px]" />
          </div>
          <div>
            <Label>{t("clients.reference")}</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} className="min-h-[44px]" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1 min-h-[44px]" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button className="flex-1 min-h-[44px]" onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
