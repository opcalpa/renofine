/**
 * ContractorStart — Contractor start page (handoff design).
 *
 * - 0 projects → welcome with 3 CTAs + 4-step setup checklist
 * - 1 project → redirect straight into it
 * - 2+ projects → redirect to main Projects dashboard
 */

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { AppHeader } from "@/components/AppHeader";
import { AppBottomNav } from "@/components/AppBottomNav";
import { AIProjectImportModal } from "@/components/project/AIProjectImportModal";
import { CreateIntakeDialog } from "@/components/intake/CreateIntakeDialog";
import {
  Loader2,
  Sparkles,
  FolderOpen,
  MessageSquare,
  ArrowRight,
  Check,
  Mic,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GuidedSetupWizard } from "@/components/onboarding/GuidedSetupWizard";

interface ContractorProfile {
  id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  company_name: string | null;
  org_number: string | null;
  is_professional: boolean;
}

const CHECKLIST_STORAGE_KEY = "rf_contractor_setup_done";

function getCompletedSteps(): Set<string> {
  try {
    const raw = localStorage.getItem(CHECKLIST_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveCompletedSteps(steps: Set<string>) {
  localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify([...steps]));
}

export default function ContractorStart() {
  const { user } = useAuthSession();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [projectCount, setProjectCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ContractorProfile | null>(null);
  const [showAIImport, setShowAIImport] = useState(false);
  const [showIntake, setShowIntake] = useState(false);
  const [showVoiceSetup, setShowVoiceSetup] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(getCompletedSteps);

  useEffect(() => {
    if (!user) return;

    async function load() {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, name, email, avatar_url, company_name, org_number, is_professional")
        .eq("user_id", user!.id)
        .single();

      setProfile(profileData);

      const profileId = profileData?.id;
      if (profileId) {
        const { count } = await supabase
          .from("projects")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", profileId)
          .is("deleted_at", null);

        setProjectCount(count ?? 0);

        // Auto-mark company step if already filled
        if (profileData?.company_name && profileData?.org_number) {
          const updated = new Set(completedSteps);
          if (!updated.has("company")) {
            updated.add("company");
            setCompletedSteps(updated);
            saveCompletedSteps(updated);
          }
        }
      }

      setLoading(false);
    }

    load();
  }, [user]);

  const handleProjectCreated = useCallback((projectId: string) => {
    navigate(`/projects/${projectId}`);
  }, [navigate]);

  const toggleStep = useCallback((stepId: string) => {
    setCompletedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      saveCompletedSteps(next);
      return next;
    });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // 1 project → go straight in
  if (projectCount === 1) {
    return <RedirectToFirstProject profileId={profile?.id} />;
  }

  // 2+ projects → main dashboard handles it
  if (projectCount && projectCount > 1) {
    return null; // Projects.tsx will render its normal view
  }

  const firstName = profile?.name?.split(" ")[0] || "";
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const checklistSteps = [
    {
      id: "company",
      number: "01",
      titleKey: "contractorStart.step1Title",
      title: "Företagsuppgifter",
      descKey: "contractorStart.step1Desc",
      desc: "Org.nummer, F-skatt, fakturaadress — för fakturor & ROT-anmälan",
      time: "3 min",
      action: () => navigate("/profile"),
    },
    {
      id: "team",
      number: "02",
      titleKey: "contractorStart.step2Title",
      title: "Lägg till medarbetare",
      descKey: "contractorStart.step2Desc",
      desc: "Bjud in dina snickare så de kan stämpla in på rätt projekt",
      time: "2 min",
      action: () => navigate("/profile"),
    },
    {
      id: "clients",
      number: "03",
      titleKey: "contractorStart.step3Title",
      title: "Importera kundregister",
      descKey: "contractorStart.step3Desc",
      desc: "CSV från ditt nuvarande system, eller börja från noll",
      time: "5 min",
      optional: true,
      action: () => navigate("/clients"),
    },
    {
      id: "accounting",
      number: "04",
      titleKey: "contractorStart.step4Title",
      title: "Anslut bokföring",
      descKey: "contractorStart.step4Desc",
      desc: "Fortnox, Visma eller Bokio — fakturor flödar automatiskt",
      time: "2 min",
      optional: true,
      action: () => navigate("/profile"),
    },
  ];

  const doneCount = checklistSteps.filter(s => completedSteps.has(s.id)).length;

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <AppHeader
        userName={profile?.name}
        userEmail={profile?.email || user?.email}
        avatarUrl={profile?.avatar_url}
        onSignOut={handleSignOut}
      />

      <main className="px-4 sm:px-6 md:px-10 py-6 md:py-8 max-w-[1080px] mx-auto">
        <div className="py-8 sm:py-12 md:py-16">
          <span className="kicker">
            {t("contractorStart.welcomeKicker", "Välkommen, {{name}} · Inga projekt ännu", { name: firstName || t("contractorStart.defaultName", "du") })}
          </span>
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-normal tracking-tight mt-2 max-w-[820px] leading-[1.02]">
            {t("contractorStart.heroTitle", "Bygg")}{" "}
            <em className="italic text-primary">{t("contractorStart.heroEmphasis", "en plats")}</em>
            {" "}{t("contractorStart.heroEnd", "för dina kunder, dina jobb, och pengarna som rör sig.")}
          </h1>
          <p className="text-[15px] sm:text-base text-muted-foreground mt-4 max-w-[640px] leading-relaxed">
            {t("contractorStart.heroDescription", "Renofine ersätter den e-postkedja, det Excel-ark och den WhatsApp-grupp du har för varje projekt. Börja med en kund, en offert eller importera en pågående pärm.")}
          </p>

          {/* Voice-first strip — same promise as the homeowner side: press,
              talk, and the project scaffolds itself (Carl-kön decision C12). */}
          <button
            onClick={() => setShowVoiceSetup(true)}
            className="mt-8 sm:mt-10 w-full flex items-center gap-3 rounded-xl bg-primary px-4 py-4 text-left text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15">
              <Mic className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{t("contractorStart.voiceCta", "Beskriv jobbet med rösten")}</span>
              <span className="block text-xs text-primary-foreground/70">{t("contractorStart.voiceCtaDesc", "Prata in projektet — rum och arbetsmoment föreslås åt dig")}</span>
            </span>
          </button>

          {/* Three entry CTAs — equal weight */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-3.5 mt-4">
            {/* CTA 1: AI quote */}
            <button
              onClick={() => setShowAIImport(true)}
              className="rounded-xl p-5 sm:p-6 text-left cursor-pointer flex flex-col gap-3.5 min-h-[180px] sm:min-h-[200px] transition-all hover:scale-[1.01] hover:shadow-md"
              style={{ background: "var(--accent-ink)", color: "var(--bg)" }}
            >
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg grid place-items-center" style={{ background: "oklch(35% 0.01 260)" }}>
                  <Sparkles className="h-[18px] w-[18px]" />
                </div>
                <ArrowRight className="h-3.5 w-3.5 opacity-60" />
              </div>
              <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "oklch(70% 0.005 85)" }}>
                {t("contractorStart.cta1Kicker", "01 · Snabbast")}
              </span>
              <span className="font-display text-xl sm:text-[22px] font-normal tracking-[-0.018em] leading-tight">
                {t("contractorStart.cta1Title", "Skapa offert med AI")}
              </span>
              <span className="text-[13px] leading-relaxed" style={{ color: "oklch(80% 0.005 85)" }}>
                {t("contractorStart.cta1Desc", "Skriv vad jobbet ska innehålla — vi strukturerar poster, ROT-grundande arbete och pris.")}
              </span>
            </button>

            {/* CTA 2: Add customer */}
            <button
              onClick={() => navigate("/clients")}
              className="rounded-xl border border-border/60 bg-card p-5 sm:p-6 text-left cursor-pointer flex flex-col gap-3.5 min-h-[180px] sm:min-h-[200px] transition-all hover:scale-[1.01] hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-muted grid place-items-center">
                  <FolderOpen className="h-[18px] w-[18px] text-muted-foreground" />
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {t("contractorStart.cta2Kicker", "02 · Klassiskt")}
              </span>
              <span className="font-display text-xl sm:text-[22px] font-normal tracking-[-0.018em] leading-tight">
                {t("contractorStart.cta2Title", "Lägg till en kund")}
              </span>
              <span className="text-[13px] text-muted-foreground leading-relaxed">
                {t("contractorStart.cta2Desc", "Bygg upp ditt klientregister. Alla projekt knyts till rätt kund och faktureringsadress.")}
              </span>
            </button>

            {/* CTA 3: Intake form */}
            <button
              onClick={() => setShowIntake(true)}
              className="rounded-xl border border-border/60 bg-card p-5 sm:p-6 text-left cursor-pointer flex flex-col gap-3.5 min-h-[180px] sm:min-h-[200px] transition-all hover:scale-[1.01] hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-muted grid place-items-center">
                  <MessageSquare className="h-[18px] w-[18px] text-muted-foreground" />
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {t("contractorStart.cta3Kicker", "03 · Inkommande")}
              </span>
              <span className="font-display text-xl sm:text-[22px] font-normal tracking-[-0.018em] leading-tight">
                {t("contractorStart.cta3Title", "Skicka kund-intag")}
              </span>
              <span className="text-[13px] text-muted-foreground leading-relaxed">
                {t("contractorStart.cta3Desc", "Länk till formulär — kunden fyller i vad som ska göras, du tar över.")}
              </span>
            </button>
          </div>

          {/* Setup checklist */}
          <section className="mt-14 sm:mt-16 pt-10 sm:pt-12 border-t border-border/60">
            <span className="kicker">{t("contractorStart.checklistKicker", "Kom igång snabbare")}</span>
            <h2 className="font-display text-2xl sm:text-[26px] font-normal tracking-[-0.02em] mt-1 mb-5 sm:mb-6">
              {t("contractorStart.checklistTitle", "Lite uppstartsjobb · ungefär 12 min")}
              {doneCount > 0 && (
                <span className="font-mono text-sm text-muted-foreground ml-3">
                  {doneCount}/{checklistSteps.length}
                </span>
              )}
            </h2>
            <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
              {checklistSteps.map((step, i) => {
                const isDone = completedSteps.has(step.id);
                return (
                  <div
                    key={step.id}
                    className={`flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 sm:py-4 ${i < checklistSteps.length - 1 ? "border-b border-border/60" : ""} ${isDone ? "opacity-60" : ""}`}
                  >
                    <span className="font-mono text-[11px] text-muted-foreground w-5 shrink-0">{step.number}</span>

                    {/* Checkbox */}
                    <button
                      onClick={() => toggleStep(step.id)}
                      className={`w-[22px] h-[22px] rounded-full border-[1.5px] shrink-0 grid place-items-center transition-colors ${isDone ? "bg-primary border-primary text-primary-foreground" : "border-border hover:border-foreground/40"}`}
                    >
                      {isDone && <Check className="h-3 w-3" />}
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${isDone ? "line-through" : ""}`}>
                          {t(step.titleKey, step.title)}
                        </span>
                        {step.optional && (
                          <span className="font-mono text-[9.5px] text-muted-foreground uppercase tracking-wider px-1.5 py-px border border-border/60 rounded">
                            {t("contractorStart.optional", "valfritt")}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                        {t(step.descKey, step.desc)}
                      </p>
                    </div>

                    <span className="font-mono text-[10.5px] text-muted-foreground hidden sm:block shrink-0">{step.time}</span>

                    {!isDone && (
                      <button
                        onClick={step.action}
                        className="rf-btn rf-btn-ghost shrink-0"
                        style={{ fontSize: 12, padding: "5px 10px" }}
                      >
                        {t("contractorStart.start", "Starta")}
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </main>

      {/* AI import dialog */}
      <AIProjectImportModal
        open={showAIImport}
        onOpenChange={setShowAIImport}
        onProjectCreated={(projectId) => {
          setShowAIImport(false);
          handleProjectCreated(projectId);
        }}
      />

      {/* Intake dialog */}
      <CreateIntakeDialog
        open={showIntake}
        onOpenChange={setShowIntake}
        onCreated={() => setShowIntake(false)}
      />

      {/* Voice-first guided setup */}
      <Dialog open={showVoiceSetup} onOpenChange={setShowVoiceSetup}>
        <DialogContent className="md:max-w-4xl max-h-[90vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{t("guidedSetup.title", "Berätta om din renovering")}</DialogTitle>
            <DialogDescription>{t("guidedSetup.titleDesc", "Vi skapar ditt projekt med rum och arbeten baserat på dina svar")}</DialogDescription>
          </DialogHeader>
          {profile?.id && (
            <GuidedSetupWizard
              userType="contractor"
              profileId={profile.id}
              autoStartVoice
              onComplete={(projectId) => {
                setShowVoiceSetup(false);
                navigate(`/projects/${projectId}`);
              }}
              onCancel={() => setShowVoiceSetup(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      <AppBottomNav />
    </div>
  );
}

/** Helper: redirect to the single project */
function RedirectToFirstProject({ profileId }: { profileId?: string }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!profileId) return;
    supabase
      .from("projects")
      .select("id")
      .eq("owner_id", profileId)
      .is("deleted_at", null)
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) navigate(`/projects/${data.id}`, { replace: true });
      });
  }, [profileId, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
