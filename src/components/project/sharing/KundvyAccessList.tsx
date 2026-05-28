import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Eye, Mail, Clock, UserPlus, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface KundvyAccessListProps {
  projectId: string;
}

interface AccessEntry {
  id: string;
  name: string;
  email: string | null;
  kind: "active" | "pending";
  expiresAt: string | null;
}

export function KundvyAccessList({ projectId }: KundvyAccessListProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["kundvy-access", projectId],
    queryFn: async (): Promise<AccessEntry[]> => {
      const [sharesRes, invitesRes] = await Promise.all([
        supabase
          .from("project_shares")
          .select(
            "id, display_name, display_email, expires_at, shared_with_user_id, profiles:shared_with_user_id ( name, email )"
          )
          .eq("project_id", projectId)
          .eq("role_type", "client"),
        supabase
          .from("project_invitations")
          .select("id, invited_email, invited_name, expires_at")
          .eq("project_id", projectId)
          .eq("role", "client")
          .eq("status", "pending"),
      ]);

      const active: AccessEntry[] = (sharesRes.data || []).map((row) => {
        const profiles = (row as { profiles?: { name?: string; email?: string } | null }).profiles;
        const r = row as { id: string; display_name: string | null; display_email: string | null; expires_at: string | null };
        return {
          id: r.id,
          name: r.display_name || profiles?.name || t("sharing.kundvy.unnamed", "Namnlös"),
          email: r.display_email || profiles?.email || null,
          kind: "active",
          expiresAt: r.expires_at,
        };
      });

      const pending: AccessEntry[] = (invitesRes.data || []).map((row) => {
        const r = row as { id: string; invited_email: string; invited_name: string | null; expires_at: string };
        return {
          id: r.id,
          name: r.invited_name || r.invited_email,
          email: r.invited_email,
          kind: "pending",
          expiresAt: r.expires_at,
        };
      });

      return [...active, ...pending];
    },
    staleTime: 30_000,
  });

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">
            {t("sharing.kundvy.title", "Inbjudna med kundvy")}
          </h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/projects/${projectId}?tab=team`)}
          className="text-xs gap-1"
        >
          <UserPlus className="h-3.5 w-3.5" />
          {t("sharing.kundvy.invite", "Bjud in")}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">{t("common.loading", "Laddar…")}</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t(
            "sharing.kundvy.empty",
            "Ingen är inbjuden till kundvyn än. Bjud in personer från Team-fliken så ser de projektet via vyn nedan."
          )}
        </p>
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li key={`${e.kind}-${e.id}`} className="flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{e.name}</div>
                {e.email && (
                  <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5 truncate">
                    <Mail className="h-3 w-3 shrink-0" />
                    <span className="truncate">{e.email}</span>
                  </div>
                )}
              </div>
              {e.kind === "pending" ? (
                <Badge variant="outline" className="gap-1 text-gray-500 shrink-0">
                  <Clock className="h-3 w-3 text-gray-400" />
                  {t("sharing.kundvy.statusPending", "Väntar")}
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-gray-500 shrink-0">
                  <Eye className="h-3 w-3 text-gray-400" />
                  {t("sharing.kundvy.statusActive", "Aktiv")}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-muted-foreground pt-1 inline-flex items-center gap-1">
        <ExternalLink className="h-3 w-3" />
        {t(
          "sharing.kundvy.hint",
          "Förhandsvyn nedan visar exakt det dessa personer ser."
        )}
      </p>
    </div>
  );
}
