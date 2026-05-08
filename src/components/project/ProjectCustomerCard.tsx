import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { User, Mail, Phone, Plus, X, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
}

interface ProjectCustomerCardProps {
  projectId: string;
}

/**
 * Minimal CRM surface: link a client (from the existing `clients` table) to
 * this project and show their name/email/phone. Owner-only — relies on the
 * existing RLS on `clients` (creator_id-based) and `projects.client_id`.
 */
export function ProjectCustomerCard({ projectId }: ProjectCustomerCardProps) {
  const { t } = useTranslation();
  const [linkedClient, setLinkedClient] = useState<Client | null>(null);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [projRes, clientsRes] = await Promise.all([
      supabase.from("projects").select("client_id").eq("id", projectId).single(),
      supabase.from("clients").select("id, name, email, phone, city").order("name"),
    ]);
    setAllClients((clientsRes.data || []) as Client[]);
    const linkedId = (projRes.data as { client_id?: string | null } | null)?.client_id ?? null;
    setLinkedClient(linkedId ? (clientsRes.data || []).find((c) => c.id === linkedId) || null : null);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const handleSelect = async (clientId: string) => {
    setSaving(true);
    const { error } = await supabase
      .from("projects")
      .update({ client_id: clientId })
      .eq("id", projectId);
    if (error) {
      toast.error(t("customer.linkError", "Kunde inte koppla kund"));
    } else {
      toast.success(t("customer.linked", "Kund kopplad"));
      await load();
    }
    setSaving(false);
  };

  const handleUnlink = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("projects")
      .update({ client_id: null })
      .eq("id", projectId);
    if (error) toast.error(t("customer.unlinkError", "Kunde inte avkoppla kund"));
    else {
      toast.success(t("customer.unlinked", "Kund avkopplad"));
      await load();
    }
    setSaving(false);
  };

  if (loading) return null;

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{t("customer.projectCustomer", "Projektets kund")}</h3>
        </div>
        <Link
          to="/contractor/clients"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ExternalLink className="h-3 w-3" />
          {t("customer.manageRegistry", "Hantera kundregister")}
        </Link>
      </div>

      {linkedClient ? (
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0 space-y-0.5">
            <p className="text-sm font-medium">{linkedClient.name}</p>
            {linkedClient.email && (
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <Mail className="h-3 w-3" />
                <a href={`mailto:${linkedClient.email}`} className="hover:underline">{linkedClient.email}</a>
              </p>
            )}
            {linkedClient.phone && (
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <Phone className="h-3 w-3" />
                <a href={`tel:${linkedClient.phone}`} className="hover:underline">{linkedClient.phone}</a>
              </p>
            )}
            {linkedClient.city && (
              <p className="text-xs text-muted-foreground">{linkedClient.city}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleUnlink}
            disabled={saving}
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Select onValueChange={handleSelect} disabled={saving}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder={t("customer.selectPlaceholder", "Välj en kund från registret…")} />
            </SelectTrigger>
            <SelectContent>
              {allClients.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  {t("customer.noClients", "Inga kunder registrerade än")}
                </div>
              ) : (
                allClients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.email && <span className="text-muted-foreground ml-1.5">· {c.email}</span>}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <Button asChild variant="outline" size="sm">
            <Link to="/contractor/clients">
              <Plus className="h-3.5 w-3.5 mr-1" />
              {t("customer.newClient", "Ny kund")}
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
