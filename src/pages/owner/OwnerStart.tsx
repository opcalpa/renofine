/**
 * OwnerStart — Homeowner start page (zero-state).
 *
 * Rendered from Projects.tsx when a homeowner has no real (non-demo)
 * projects — mirrors ContractorStart for contractors. Offers three ways in:
 * describe by voice/text (guided wizard), import a quote document, or invite
 * the contractor. A secondary link seeds/opens the personal demo project.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { AppHeader } from "@/components/AppHeader";
import { AppBottomNav } from "@/components/AppBottomNav";
import { GuidedSetupWizard } from "@/components/onboarding/GuidedSetupWizard";
import { AIProjectImportModal } from "@/components/project/AIProjectImportModal";
import { CreateIntakeDialog } from "@/components/intake/CreateIntakeDialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Mic, Sparkles, MessageSquare, ArrowRight, BookOpen } from "lucide-react";
import { getDemoProjectId, seedDemoProject } from "@/services/demoProjectService";

interface OwnerProfile {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export default function OwnerStart() {
  const { user } = useAuthSession();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<OwnerProfile | null>(null);
  const [showGuidedSetup, setShowGuidedSetup] = useState(false);
  const [showAIImport, setShowAIImport] = useState(false);
  const [showInviteContractor, setShowInviteContractor] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  useEffect(() => {
    if (!user) return;

    async function load() {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, name, email, avatar_url")
        .eq("user_id", user!.id)
        .single();

      setProfile(profileData);
      setLoading(false);
    }

    load();
  }, [user]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleProjectCreated = (projectId: string) => {
    navigate(`/projects/${projectId}`);
  };

  const handleExploreDemo = async () => {
    if (!profile?.id || demoLoading) return;
    setDemoLoading(true);
    try {
      const demoId =
        (await getDemoProjectId(profile.id)) ??
        (await seedDemoProject(profile.id, i18n.language));
      if (demoId) navigate(`/projects/${demoId}`);
    } finally {
      setDemoLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const firstName = profile?.name?.split(" ")[0] || "";

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <AppHeader
        userName={profile?.name}
        userEmail={profile?.email || user?.email}
        avatarUrl={profile?.avatar_url}
        onSignOut={handleSignOut}
      />

      <main className="px-4 sm:px-6 md:px-10 py-6 md:py-8 max-w-[980px] mx-auto">
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

          {/* Three start paths */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-3.5 mt-8 sm:mt-10">
            {/* Path 1: Describe by voice/text (primary) */}
            <button
              onClick={() => setShowGuidedSetup(true)}
              className="rounded-xl p-5 sm:p-6 text-left cursor-pointer flex flex-col gap-3.5 min-h-[180px] sm:min-h-[200px] transition-all hover:scale-[1.01] hover:shadow-md bg-accent-ink text-accent-ink-foreground"
              style={{ background: "var(--accent-ink)", color: "var(--bg)" }}
            >
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg grid place-items-center" style={{ background: "oklch(35% 0.01 260)" }}>
                  <Mic className="h-[18px] w-[18px]" />
                </div>
                <ArrowRight className="h-3.5 w-3.5 opacity-60" />
              </div>
              <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "oklch(70% 0.005 85)" }}>
                {t("ownerStart.path1Kicker", "01 · Röst eller text")}
              </span>
              <span className="font-display text-xl sm:text-[22px] font-normal tracking-[-0.018em] leading-tight">
                {t("ownerStart.path1Title", "Beskriv din renovering")}
              </span>
              <span className="text-[13px] leading-relaxed" style={{ color: "oklch(80% 0.005 85)" }}>
                {t("ownerStart.path1Description", "Berätta med egna ord — AI:n föreslår rum och arbeten, du godkänner.")}
              </span>
            </button>

            {/* Path 2: Import a quote/document */}
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
                {t("ownerStart.path2Kicker", "02 · Har du en offert?")}
              </span>
              <span className="font-display text-xl sm:text-[22px] font-normal tracking-[-0.018em] leading-tight">
                {t("ownerStart.path2Title", "Importera en offert")}
              </span>
              <span className="text-[13px] text-muted-foreground leading-relaxed">
                {t("ownerStart.path2Description", "Ladda upp offerten eller dokumentet — vi bygger projektet ur det.")}
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
                {t("ownerStart.path3Kicker", "03 · Samarbeta")}
              </span>
              <span className="font-display text-xl sm:text-[22px] font-normal tracking-[-0.018em] leading-tight">
                {t("ownerStart.path3Title", "Bjud in din entreprenör")}
              </span>
              <span className="text-[13px] text-muted-foreground leading-relaxed">
                {t("ownerStart.path3Description", "Skicka en länk så de fyller i projektet åt dig.")}
              </span>
            </button>
          </div>

          {/* Explore demo — secondary path */}
          <button
            type="button"
            onClick={handleExploreDemo}
            disabled={demoLoading}
            className="inline-flex items-center gap-2 mt-5 text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors disabled:opacity-60"
          >
            {demoLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookOpen className="h-3.5 w-3.5" />}
            {t("ownerStart.exploreDemo", "Eller utforska demoprojektet först")}
          </button>

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
      </main>

      {/* Guided setup dialog */}
      <Dialog open={showGuidedSetup} onOpenChange={setShowGuidedSetup}>
        <DialogContent className="md:max-w-4xl max-h-[90vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{t("guidedSetup.title")}</DialogTitle>
            <DialogDescription>{t("guidedSetup.titleDesc")}</DialogDescription>
          </DialogHeader>
          {profile?.id && (
            <GuidedSetupWizard
              userType="homeowner"
              profileId={profile.id}
              onComplete={(projectId) => {
                setShowGuidedSetup(false);
                handleProjectCreated(projectId);
              }}
              onCancel={() => setShowGuidedSetup(false)}
            />
          )}
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
