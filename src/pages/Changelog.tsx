import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AppHeader } from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import { changelog } from "@/data/changelog";

const TAG_COLORS: Record<string, string> = {
  UX: "bg-purple-100 text-purple-700 border-purple-200",
  Design: "bg-pink-100 text-pink-700 border-pink-200",
  AI: "bg-blue-100 text-blue-700 border-blue-200",
  Budget: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Arbeten: "bg-amber-100 text-amber-700 border-amber-200",
  Inköp: "bg-orange-100 text-orange-700 border-orange-200",
  Offert: "bg-cyan-100 text-cyan-700 border-cyan-200",
  ROT: "bg-green-100 text-green-700 border-green-200",
  Filer: "bg-slate-100 text-slate-700 border-slate-200",
  Planering: "bg-indigo-100 text-indigo-700 border-indigo-200",
  Produktivitet: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Synk: "bg-teal-100 text-teal-700 border-teal-200",
  Projektvy: "bg-violet-100 text-violet-700 border-violet-200",
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" });
}

export default function Changelog() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { data: profile } = useQuery({
    queryKey: ["profile-for-header"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("name, avatar_url")
        .eq("user_id", user.id)
        .single();
      return { ...data, email: user.email };
    },
  });

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  // Group entries by date
  const grouped = useMemo(() => {
    const map = new Map<string, typeof changelog>();
    for (const entry of changelog) {
      const group = map.get(entry.date) || [];
      group.push(entry);
      map.set(entry.date, group);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, []);

  return (
    <div className="min-h-screen bg-muted/20">
      <AppHeader
        userName={profile?.name ?? undefined}
        userEmail={profile?.email ?? undefined}
        avatarUrl={profile?.avatar_url ?? undefined}
        onSignOut={handleSignOut}
      />

      {/* Page header */}
      <div className="border-b bg-background">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t("nav.changelog", "What's new")}</h1>
              <p className="text-muted-foreground text-sm mt-0.5">{t("changelog.subtitle", "Senaste uppdateringarna i Renofine")}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="space-y-10">
          {grouped.map(([date, entries]) => (
            <div key={date} className="relative">
              {/* Date header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="h-2.5 w-2.5 rounded-full bg-primary shrink-0" />
                <time className="text-sm font-semibold text-muted-foreground">{formatDate(date)}</time>
              </div>

              {/* Entries for this date */}
              <div className="ml-[17px] border-l-2 border-muted pl-6 space-y-4">
                {entries.map((entry, i) => (
                  <div
                    key={i}
                    className="rounded-xl border bg-background p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <h3 className="text-base font-semibold leading-snug">{entry.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{entry.description}</p>
                    <div className="flex items-center flex-wrap gap-1.5 mt-3">
                      {entry.tags?.map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 font-medium ${TAG_COLORS[tag] || "bg-muted text-muted-foreground"}`}
                        >
                          {tag}
                        </Badge>
                      ))}
                      {entry.demoPath && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline ml-auto"
                          onClick={() => navigate(entry.demoPath!)}
                        >
                          Testa i demo <ExternalLink className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-16 text-center text-sm text-muted-foreground">
          <p>Fler uppdateringar kommer löpande.</p>
        </div>
      </div>
    </div>
  );
}
