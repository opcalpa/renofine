/**
 * OwnerStart — Homeowner start page (handoff design).
 *
 * - 1 project → redirect straight into it
 * - 0 projects → welcome with onboarding CTA
 * - 2+ projects → editorial cards with progress + ROT summary
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { AppHeader } from "@/components/AppHeader";
import { AppBottomNav } from "@/components/AppBottomNav";
import { HomeownerYearlyAnalysis } from "@/components/project/HomeownerYearlyAnalysis";
import { GuidedSetupWizard } from "@/components/onboarding/GuidedSetupWizard";
import { AIProjectImportModal } from "@/components/project/AIProjectImportModal";
import { CreateIntakeDialog } from "@/components/intake/CreateIntakeDialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loader2, Plus, Home, Sparkles, MessageSquare, ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/currency";

interface OwnerProject {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  status: string | null;
  contract_value: number | null;
  created_at: string;
}

interface ProjectProgress {
  done: number;
  total: number;
}

function chipClass(status: string | null): string {
  if (!status) return "rf-chip";
  if (status === "completed") return "rf-chip chip-muted";
  if (status === "on_hold") return "rf-chip chip-warn";
  return "rf-chip chip-primary";
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "God natt";
  if (hour < 12) return "God morgon";
  if (hour < 17) return "God eftermiddag";
  return "God kväll";
}

export default function OwnerStart() {
  const { user } = useAuthSession();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [projects, setProjects] = useState<OwnerProject[]>([]);
  const [progress, setProgress] = useState<Record<string, ProjectProgress>>({});
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<{ id: string; name: string; email: string | null; avatar_url: string | null } | null>(null);
  const [showGuidedSetup, setShowGuidedSetup] = useState(false);
  const [showAIImport, setShowAIImport] = useState(false);
  const [showInviteContractor, setShowInviteContractor] = useState(false);

  useEffect(() => {
    if (!user) return;

    async function load() {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("name, email, avatar_url, id")
        .eq("user_id", user!.id)
        .single();

      setProfile(profileData);

      const profileId = profileData?.id;
      const { data: ownProjects } = await supabase
        .from("projects")
        .select("id, name, address, city, status, contract_value, created_at")
        .eq("owner_id", profileId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      let sharedProjects: OwnerProject[] = [];
      if (profileId) {
        const { data: shares } = await supabase
          .from("project_shares")
          .select("project_id")
          .eq("shared_with_user_id", profileId);

        if (shares && shares.length > 0) {
          const sharedIds = shares.map(s => s.project_id);
          const { data: sp } = await supabase
            .from("projects")
            .select("id, name, address, city, status, contract_value, created_at")
            .in("id", sharedIds)
            .is("deleted_at", null);
          sharedProjects = sp || [];
        }
      }

      const allProjects = [...(ownProjects || [])];
      for (const sp of sharedProjects) {
        if (!allProjects.some(p => p.id === sp.id)) allProjects.push(sp);
      }

      setProjects(allProjects);

      if (allProjects.length > 0) {
        const projectIds = allProjects.map(p => p.id);
        const { data: tasks } = await supabase
          .from("tasks")
          .select("project_id, status")
          .in("project_id", projectIds);

        if (tasks) {
          const prog: Record<string, ProjectProgress> = {};
          for (const task of tasks) {
            if (!prog[task.project_id]) prog[task.project_id] = { done: 0, total: 0 };
            prog[task.project_id].total++;
            if (task.status === "completed" || task.status === "done") prog[task.project_id].done++;
          }
          setProgress(prog);
        }
      }

      setLoading(false);
    }

    load();
  }, [user]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // 1 project → redirect
  if (projects.length === 1) {
    navigate(`/projects/${projects[0].id}`, { replace: true });
    return null;
  }

  const firstName = profile?.name?.split(" ")[0] || "";
  const activeProjects = projects.filter(p => p.status !== "completed" && p.status !== "archived");
  const completedProjects = projects.filter(p => p.status === "completed");
  const totalInvested = projects.reduce((s, p) => s + (p.contract_value || 0), 0);

  const handleProjectCreated = (projectId: string) => {
    navigate(`/projects/${projectId}`);
  };

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <AppHeader
        userName={profile?.name}
        userEmail={profile?.email || user?.email}
        avatarUrl={profile?.avatar_url}
        onSignOut={handleSignOut}
      />

      <main className="px-4 sm:px-6 md:px-10 py-6 md:py-8 max-w-[980px] mx-auto">
        {/* 0 projects → welcome with 3 onboarding paths */}
        {projects.length === 0 && (
          <div className="py-8 sm:py-12 md:py-16">
            <span className="kicker">
              {t("ownerStart.welcomeKicker", "Välkommen, {{name}} · Inga projekt ännu", { name: firstName || t("ownerStart.defaultName", "du") })}
            </span>
            <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-normal tracking-tight mt-2 max-w-[780px] leading-[1.02]">
              {t("ownerStart.heroTitle", "Renoveringen blir")}{" "}
              <em className="italic text-primary">{t("ownerStart.heroTitleEmphasis", "din historia")}</em>
              {" — "}{t("ownerStart.heroTitleEnd", "vi håller koll på tider, pengar och ROT.")}
            </h1>
            <p className="text-[15px] sm:text-base text-muted-foreground mt-4 max-w-[620px] leading-relaxed">
              {t("ownerStart.heroDescription", "Lägg till din första adress eller starta direkt med projektet du vill göra. När entreprenören är ansluten flyter alla beslut, foton och fakturor in på ett ställe.")}
            </p>

            {/* Three start paths — equal weight */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-3.5 mt-8 sm:mt-10">
              {/* Path 1: Step-by-step */}
              <button
                onClick={() => setShowGuidedSetup(true)}
                className="rounded-xl p-5 sm:p-6 text-left cursor-pointer flex flex-col gap-3.5 min-h-[180px] sm:min-h-[200px] transition-all hover:scale-[1.01] hover:shadow-md bg-accent-ink text-accent-ink-foreground"
                style={{ background: "var(--accent-ink)", color: "var(--bg)" }}
              >
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-lg grid place-items-center" style={{ background: "oklch(35% 0.01 260)" }}>
                    <Home className="h-[18px] w-[18px]" />
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 opacity-60" />
                </div>
                <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "oklch(70% 0.005 85)" }}>
                  {t("ownerStart.path1Kicker", "01 · Steg-för-steg")}
                </span>
                <span className="font-display text-xl sm:text-[22px] font-normal tracking-[-0.018em] leading-tight">
                  {t("ownerStart.path1Title", "Lägg till en adress")}
                </span>
                <span className="text-[13px] leading-relaxed" style={{ color: "oklch(80% 0.005 85)" }}>
                  {t("ownerStart.path1Description", "Börja med var du bor. Bra om du planerar flera projekt över tid.")}
                </span>
              </button>

              {/* Path 2: AI quick start */}
              <button
                onClick={() => setShowAIImport(true)}
                className="rounded-xl border border-border/60 p-5 sm:p-6 text-left cursor-pointer flex flex-col gap-3.5 min-h-[180px] sm:min-h-[200px] transition-all hover:scale-[1.01] hover:shadow-md"
                style={{ background: "color-mix(in oklab, oklch(60% 0.18 305) 6%, hsl(var(--card)))" }}
              >
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-lg grid place-items-center" style={{ background: "color-mix(in oklab, oklch(60% 0.18 305) 18%, transparent)" }}>
                    <Sparkles className="h-[18px] w-[18px]" style={{ color: "oklch(50% 0.2 305)" }} />
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {t("ownerStart.path2Kicker", "02 · Snabbast")}
                </span>
                <span className="font-display text-xl sm:text-[22px] font-normal tracking-[-0.018em] leading-tight">
                  {t("ownerStart.path2Title", "Beskriv din renovering")}
                </span>
                <span className="text-[13px] text-muted-foreground leading-relaxed">
                  {t("ownerStart.path2Description", "Skriv ett par meningar — vi förbereder beslutspunkter, ROT-kalkyl och offertmall.")}
                </span>
              </button>

              {/* Path 3: Invite contractor */}
              <button
                onClick={() => setShowInviteContractor(true)}
                className="rounded-xl border border-border/60 bg-card p-5 sm:p-6 text-left cursor-pointer flex flex-col gap-3.5 min-h-[180px] sm:min-h-[200px] transition-all hover:scale-[1.01] hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-lg bg-muted grid place-items-center">
                    <MessageSquare className="h-[18px] w-[18px] text-muted-foreground" />
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {t("ownerStart.path3Kicker", "03 · Har du en offert?")}
                </span>
                <span className="font-display text-xl sm:text-[22px] font-normal tracking-[-0.018em] leading-tight">
                  {t("ownerStart.path3Title", "Bjud in din entreprenör")}
                </span>
                <span className="text-[13px] text-muted-foreground leading-relaxed">
                  {t("ownerStart.path3Description", "Skicka en länk så de fyller i projektet åt dig.")}
                </span>
              </button>
            </div>

            {/* What you'll see — preview strip */}
            <section className="mt-14 sm:mt-18 pt-10 sm:pt-12 border-t border-border/60">
              <span className="kicker">{t("ownerStart.previewKicker", "När du är igång ser du")}</span>
              <h2 className="font-display text-2xl sm:text-[28px] font-normal tracking-[-0.02em] mt-1 mb-6 sm:mb-7">
                {t("ownerStart.previewTitle", "Allt på ett ställe — utan att jaga din entreprenör.")}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-3.5">
                {[
                  { kickerKey: "previewTimeline", titleKey: "previewTimelineTitle", bodyKey: "previewTimelineBody", kicker: "Tidslinje", title: "Vad händer i veckan", body: "Dagliga foton från arbetsplatsen, leveranser, milstolpar." },
                  { kickerKey: "previewDecisions", titleKey: "previewDecisionsTitle", bodyKey: "previewDecisionsBody", kicker: "Beslut", title: "Bara det som väntar på dig", body: "Kakelval, materialgodkännanden, ATA-arbeten — utan e-postkedjor." },
                  { kickerKey: "previewBudget", titleKey: "previewBudgetTitle", bodyKey: "previewBudgetBody", kicker: "Budget", title: "Pengar i klartext", body: "Betalt, fakturerat, kvar till mål. Inga överraskningar." },
                  { kickerKey: "previewRot", titleKey: "previewRotTitle", bodyKey: "previewRotBody", kicker: "ROT", title: "Avdraget räknas live", body: "Vi separerar arbete från material så Skatteverket-grejen bara funkar." },
                ].map((c) => (
                  <div key={c.kickerKey} className="rounded-xl border border-border/60 bg-card p-4 sm:p-[18px] flex flex-col gap-2 min-h-[140px] sm:min-h-[160px]">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {t(`ownerStart.${c.kickerKey}`, c.kicker)}
                    </span>
                    <span className="text-sm font-medium">
                      {t(`ownerStart.${c.titleKey}`, c.title)}
                    </span>
                    <span className="text-[12.5px] text-muted-foreground leading-relaxed">
                      {t(`ownerStart.${c.bodyKey}`, c.body)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* 2+ projects */}
        {projects.length > 1 && (
          <>
            {/* Greeting */}
            <div className="mb-6 md:mb-8 pb-5 border-b border-border/60">
              <span className="kicker">
                {t("ownerStart.kicker", "Mina renoveringar")}
              </span>
              <h1 className="font-display text-3xl sm:text-4xl font-normal tracking-tight mt-1">
                {getGreeting()}, {firstName}.
              </h1>
              {totalInvested > 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  {t("ownerStart.summary", "{{active}} aktiva projekt · {{invested}} investerat", {
                    active: activeProjects.length,
                    invested: formatCurrency(totalInvested),
                  })}
                </p>
              )}
            </div>

            {/* Active project cards */}
            {activeProjects.length > 0 && (
              <section className="mb-8">
                <div className="flex flex-col gap-3">
                  {activeProjects.map(project => {
                    const prog = progress[project.id];
                    const pct = prog && prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : 0;
                    const budgetTkr = project.contract_value ? Math.round(project.contract_value / 1000) : 0;

                    return (
                      <div
                        key={project.id}
                        onClick={() => navigate(`/projects/${project.id}`)}
                        className="rounded-xl border border-border/60 bg-card p-4 sm:p-5 cursor-pointer hover:shadow-md transition-all"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="text-[15px] font-medium tracking-[-0.003em]">{project.name}</h3>
                            {(project.address || project.city) && (
                              <p className="font-mono text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">
                                {[project.address, project.city].filter(Boolean).join(", ")}
                                {budgetTkr > 0 && ` · ${budgetTkr}k kr`}
                              </p>
                            )}
                          </div>
                          <span className={chipClass(project.status)} style={{ flexShrink: 0 }}>
                            {t(`projectStatus.${project.status}`, project.status || "")}
                          </span>
                        </div>

                        {prog && prog.total > 0 && (
                          <div className="flex items-center gap-3 mt-3">
                            <div className="flex-1 h-[3px] bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-primary transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="font-mono text-[11px] text-muted-foreground tnum">
                              {prog.done}/{prog.total}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Completed projects */}
            {completedProjects.length > 0 && (
              <section className="mb-8">
                <span className="kicker">{t("ownerStart.completedKicker", "Avslutade")}</span>
                <div className="flex flex-col gap-2 mt-3">
                  {completedProjects.map(project => (
                    <div
                      key={project.id}
                      onClick={() => navigate(`/projects/${project.id}`)}
                      className="rounded-xl border border-border/60 bg-card/60 p-3 sm:p-4 cursor-pointer hover:bg-card transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <span className="text-sm font-medium">{project.name}</span>
                        {project.contract_value && project.contract_value > 0 && (
                          <span className="font-mono text-[10px] text-muted-foreground ml-2 tnum">
                            {formatCurrency(project.contract_value)}
                          </span>
                        )}
                      </div>
                      <span className="rf-chip chip-muted">{t("projectStatus.completed", "Klar")}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ROT/cost yearly analysis */}
            {projects.filter(p => p.status !== "demo").length > 0 && (
              <HomeownerYearlyAnalysis
                projects={projects.filter(p => p.status !== "demo").map(p => ({ id: p.id, name: p.name }))}
              />
            )}
          </>
        )}
      </main>

      {/* Guided setup dialog */}
      <Dialog open={showGuidedSetup} onOpenChange={setShowGuidedSetup}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <GuidedSetupWizard
            userType="homeowner"
            profileId={profile?.id || ""}
            onComplete={(projectId) => {
              setShowGuidedSetup(false);
              handleProjectCreated(projectId);
            }}
            onCancel={() => setShowGuidedSetup(false)}
          />
        </DialogContent>
      </Dialog>

      {/* AI import dialog */}
      <AIProjectImportModal
        open={showAIImport}
        onOpenChange={setShowAIImport}
        onProjectCreated={(projectId) => {
          setShowAIImport(false);
          handleProjectCreated(projectId);
        }}
      />

      {/* Invite contractor dialog */}
      <CreateIntakeDialog
        open={showInviteContractor}
        onOpenChange={setShowInviteContractor}
        onCreated={() => setShowInviteContractor(false)}
      />

      <AppBottomNav />
    </div>
  );
}
