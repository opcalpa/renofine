/**
 * /admin — plattformsöversikten.
 *
 * Det här är vad is_system_admin egentligen var till för: hur många konton
 * finns, hur många projekt, vilka är aktiva, och en kontolista med e-post.
 * Flaggan gav i stället ambient synlighet i varje RLS-fråga — det var den som
 * fyllde projektväljarna med andras projekt (2026-08-26).
 *
 * Servern är gränsen: admin_platform_stats() och admin_user_list() kontrollerar
 * själva is_system_admin() och kastar 42501 annars. Sidan behöver därför inte
 * lita på klientens uppfattning om rollen — en icke-admin som surfar hit får
 * felet från databasen, inte en tom sida som råkar se trasig ut.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, ShieldAlert, Users, FolderKanban, Image, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface Stats {
  users_total: number;
  users_homeowners: number;
  users_contractors: number;
  users_last_7d: number;
  users_last_30d: number;
  projects_total: number;
  projects_active: number;
  projects_last_30d: number;
  photos_total: number;
  tasks_total: number;
  quotes_total: number;
}

interface UserRow {
  profile_id: string;
  email: string | null;
  name: string | null;
  user_type: string | null;
  created_at: string;
  project_count: number;
  last_project_activity: string | null;
}

export default function Admin() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [statsRes, usersRes] = await Promise.all([
        supabase.rpc("admin_platform_stats"),
        supabase.rpc("admin_user_list"),
      ]);
      if (cancelled) return;
      if (statsRes.error || usersRes.error) {
        // 42501 = inte admin. Säg det rakt ut i stället för en tom sida.
        setDenied(true);
        return;
      }
      setStats(statsRes.data as unknown as Stats);
      setUsers((usersRes.data as unknown as UserRow[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (denied) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {t("admin.denied", "Den här sidan kräver systemadmin.")}
        </p>
      </div>
    );
  }

  if (!stats || !users) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const q = filter.trim().toLowerCase();
  const shown = q
    ? users.filter(
        (u) =>
          (u.email ?? "").toLowerCase().includes(q) ||
          (u.name ?? "").toLowerCase().includes(q),
      )
    : users;

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("sv-SE") : "—";

  const tiles = [
    {
      icon: Users,
      label: t("admin.users", "Användare"),
      value: stats.users_total,
      sub: `${stats.users_homeowners} ${t("admin.homeowners", "hemägare")} · ${stats.users_contractors} ${t("admin.contractors", "proffs")}`,
    },
    {
      icon: FolderKanban,
      label: t("admin.projects", "Projekt"),
      value: stats.projects_total,
      sub: `${stats.projects_active} ${t("admin.active", "aktiva")} · ${stats.projects_last_30d} ${t("admin.newLast30", "nya på 30 dagar")}`,
    },
    {
      icon: Image,
      label: t("admin.photos", "Bilder"),
      value: stats.photos_total,
      sub: `${stats.tasks_total} ${t("admin.tasks", "arbeten")}`,
    },
    {
      icon: FileText,
      label: t("admin.quotes", "Offerter"),
      value: stats.quotes_total,
      sub: `${stats.users_last_30d} ${t("admin.signupsLast30", "nya konton på 30 dagar")}`,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8" data-testid="admin-page">
      <div>
        <h1 className="font-display text-2xl">{t("admin.title", "Plattformen")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("admin.subtitle", "Vad som finns på Renofine just nu.")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <tile.icon className="h-4 w-4" />
                <span className="text-xs">{tile.label}</span>
              </div>
              <p className="mt-1 text-2xl font-semibold">{tile.value}</p>
              <p className="text-[11px] text-muted-foreground">{tile.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">
            {t("admin.accounts", "Konton")} ({shown.length})
          </CardTitle>
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("admin.searchPlaceholder", "Sök namn eller e-post…")}
            className="h-8 w-56 text-xs"
            data-testid="admin-user-search"
          />
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">{t("admin.colName", "Namn")}</th>
                  <th className="py-2 pr-3 font-medium">{t("admin.colEmail", "E-post")}</th>
                  <th className="py-2 pr-3 font-medium">{t("admin.colRole", "Roll")}</th>
                  <th className="py-2 pr-3 font-medium text-right">{t("admin.colProjects", "Projekt")}</th>
                  <th className="py-2 pr-3 font-medium">{t("admin.colCreated", "Skapad")}</th>
                  <th className="py-2 font-medium">{t("admin.colActivity", "Senast aktiv")}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((u) => (
                  <tr key={u.profile_id} className="border-b last:border-0">
                    <td className="py-2 pr-3">{u.name || "—"}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{u.email || "—"}</td>
                    <td className="py-2 pr-3">
                      {u.user_type ? (
                        <Badge variant="secondary" className="text-[10px]">
                          {u.user_type === "homeowner"
                            ? t("admin.homeowner", "Hemägare")
                            : u.user_type === "contractor"
                              ? t("admin.contractor", "Proffs")
                              : u.user_type}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right">{u.project_count}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{fmtDate(u.created_at)}</td>
                    <td className="py-2 text-xs text-muted-foreground">{fmtDate(u.last_project_activity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
