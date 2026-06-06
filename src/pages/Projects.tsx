import { useEffect, useState, useCallback, useMemo, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useGuestMode } from "@/hooks/useGuestMode";
import { analytics, AnalyticsEvents } from "@/lib/analytics";
import { useProfileLanguage } from "@/hooks/useProfileLanguage";
import { AppHeader } from "@/components/AppHeader";
import { AppBottomNav } from "@/components/AppBottomNav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Plus, Users, User, BookOpen, Trash2, Loader2, Sparkles, ChevronDown, LayoutGrid, List, Settings2, ShieldCheck, GanttChart, EyeOff } from "lucide-react";
import { PortfolioTimeline } from "@/components/project/PortfolioTimeline";
import { TaskEditDialog } from "@/components/project/TaskEditDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { WelcomeModal, QuickStartChoice } from "@/components/onboarding/WelcomeModal";
import { ColumnToggle } from "@/components/shared/ColumnToggle";
import { GuidedSetupWizard } from "@/components/onboarding/GuidedSetupWizard";
import { PageLoadingSkeleton } from "@/components/ui/skeleton-screens";
import { isDemoProject } from "@/services/demoProjectService";
import { normalizeStatus, STATUS_META } from "@/lib/projectStatus";
import { formatCurrency } from "@/lib/currency";
import { LeadsPipelineSection } from "@/components/pipeline";
import { FinancialAnalysisSection } from "@/components/project/FinancialAnalysisSection";
import { AIProjectImportModal } from "@/components/project/AIProjectImportModal";
import { HomeownerYearlyAnalysis } from "@/components/project/HomeownerYearlyAnalysis";
import { DashboardStrip } from "@/components/project/DashboardStrip";
import { ProjectGridCard } from "@/components/project/ProjectGridCard";
import { GuestBanner } from "@/components/guest";
import { CreateIntakeDialog } from "@/components/intake/CreateIntakeDialog";
import {
  getGuestProjects,
  deleteGuestProject,
} from "@/services/guestStorageService";

import { lazyWithRetry } from "@/lib/lazyWithRetry";
// On permanent chunk-load failure (stale build), clear the A/B sticky flag so
// the user isn't trapped in a broken redesigned dashboard after page reload.
const DashboardRedesign = lazyWithRetry(
  () => import("@/components/dashboard/DashboardRedesign"),
  () => localStorage.removeItem("rf_dashboard_v2"),
);
import { CreateProjectDialog } from "@/components/project/CreateProjectDialog";
import { useProjectsData } from "@/hooks/useProjectsData";
const ContractorStart = lazyWithRetry(() => import("@/pages/contractor/ContractorStart"));
import { ResourcePlanningView } from "@/components/project/ResourcePlanningView";
import { useEnabledModules } from "@/hooks/useEnabledModules";
import { useTaxDeductionVisible } from "@/hooks/useTaxDeduction";
import { useMarket } from "@/hooks/useMarket";

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  project_type?: string | null;
  owner_id?: string | null;
  cover_image_url?: string | null;
}

const Projects = () => {
  const { user, signOut } = useAuthSession();
  const { isGuest, refreshStorageUsage } = useGuestMode();
  useProfileLanguage();
  const { t, i18n } = useTranslation();
  const [market] = useMarket();
  const {
    profile, projects, sharedProjectIds, ownerNames, projectFinancials,
    loading, authLoading, needsWelcomeModal, refetch,
  } = useProjectsData();
  const [showAdminProjects, setShowAdminProjects] = useState(false);

  const [guestRole, setGuestRole] = useState<string | null>(() =>
    isGuest ? localStorage.getItem("guest_user_type") : null
  );

  const handleGuestRoleChange = useCallback((role: string) => {
    localStorage.setItem("guest_user_type", role);
    setGuestRole(role);
  }, []);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);

  // Sync welcome modal trigger from data hook
  useEffect(() => {
    if (needsWelcomeModal) setShowWelcomeModal(true);
  }, [needsWelcomeModal]);
  const [showGuidedSetup, setShowGuidedSetup] = useState(false);
  const [showAIImport, setShowAIImport] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteCounts, setDeleteCounts] = useState<{
    quotes: number;
    invoices: number;
    teamMembers: number;
    hasNonDraftInvoices: boolean;
  } | null>(null);
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "completed">("all");
  const [viewMode, setViewMode] = useState<"grid" | "list" | "resource" | "timeline">(() => {
    const saved = localStorage.getItem("projects_view_mode");
    if (saved === "grid") return "grid";
    if (saved === "timeline") return "timeline";
    if (saved === "resource") return "resource"; // will be clamped to "list" for homeowners below
    return "list";
  });
  const [editorialDashboard, setEditorialDashboard] = useState(() =>
    localStorage.getItem("rf_dashboard_v2") === "true"
  );
  const [hideDemo, setHideDemo] = useState(() =>
    localStorage.getItem("rf_hide_demo") === "true"
  );
  // Task drawer from timeline
  const [drawerTask, setDrawerTask] = useState<{ projectId: string; taskId: string } | null>(null);
  const ALL_LIST_COLS = ["status", "tasks", "budget", "progress", "date", "description", "owner", "address"] as const;
  const DEFAULT_HIDDEN_COLS: ListColKey[] = ["description", "owner", "address"];
  type ListColKey = typeof ALL_LIST_COLS[number];
  const [listColumnOrder, setListColumnOrder] = useState<ListColKey[]>(() => {
    try {
      const saved = localStorage.getItem("projects_list_cols_v2");
      if (saved) {
        const parsed = JSON.parse(saved) as { order: string[]; hidden: string[] };
        const order = (parsed.order || []).filter((k: string) => ALL_LIST_COLS.includes(k as ListColKey)) as ListColKey[];
        // Append any new keys not in saved order
        ALL_LIST_COLS.forEach((k) => { if (!order.includes(k)) order.push(k); });
        return order;
      }
    } catch { /* ignore */ }
    return [...ALL_LIST_COLS];
  });
  const [hiddenListCols, setHiddenListCols] = useState<Set<ListColKey>>(() => {
    try {
      const saved = localStorage.getItem("projects_list_cols_v2");
      if (saved) {
        const parsed = JSON.parse(saved) as { order: string[]; hidden: string[] };
        return new Set((parsed.hidden || []).filter((k: string) => ALL_LIST_COLS.includes(k as ListColKey)) as ListColKey[]);
      }
    } catch { /* ignore */ }
    return new Set<ListColKey>(DEFAULT_HIDDEN_COLS);
  });
  const [draggedCol, setDraggedCol] = useState<ListColKey | null>(null);

  const saveListColPrefs = (order: ListColKey[], hidden: Set<ListColKey>) => {
    localStorage.setItem("projects_list_cols_v2", JSON.stringify({ order, hidden: [...hidden] }));
  };

  const visibleListCols = listColumnOrder.filter((k) => !hiddenListCols.has(k));

  const colLabels: Record<ListColKey, string> = useMemo(() => ({
    address: t("projects.address"),
    description: t("projects.colDescription", "Beskrivning"),
    budget: t("projects.totalBudget"),
    tasks: t("projects.colTasks", "Arbeten"),
    progress: t("projects.colProgress", "Framsteg"),
    status: t("projects.colStatus", "Status"),
    date: t("projects.colDate", "Skapad"),
    owner: t("projects.colOwner", "Ägare"),
  }), [t]);

  const isAdmin = !!(profile as Record<string, unknown> | null)?.is_system_admin;
  const profileId = (profile as Record<string, unknown> | null)?.id as string | undefined;

  const visibleProjects = useMemo(() => {
    if (!isAdmin || showAdminProjects) return projects;
    // Filter to only own + shared projects
    return projects.filter(
      (p) => p.owner_id === profileId || sharedProjectIds.has(p.id)
    );
  }, [projects, isAdmin, showAdminProjects, profileId, sharedProjectIds]);

  const hasDemoProject = visibleProjects.some((p) => isDemoProject(p.project_type));

  // Projects actually shown in the list (respects hideDemo toggle)
  const displayProjects = useMemo(
    () => hideDemo ? visibleProjects.filter((p) => !isDemoProject(p.project_type)) : visibleProjects,
    [visibleProjects, hideDemo]
  );

  const filteredProjects = useMemo(() => {
    if (statusFilter === "all") return displayProjects;
    if (statusFilter === "active") return displayProjects.filter((p) => p.status !== "completed" && p.status !== "archived");
    return displayProjects.filter((p) => p.status === "completed");
  }, [displayProjects, statusFilter]);

  // Exclude demo projects from financial/tax aggregations
  const nonDemoProjects = useMemo(
    () => visibleProjects.filter((p) => !isDemoProject(p.project_type)),
    [visibleProjects]
  );

  const [createIntakeOpen, setCreateIntakeOpen] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Data fetching handled by useProjectsData hook

  // Show welcome toast after email confirmation, or auth error toast
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace("#", "?"));

    if (params.get("confirmed") === "true") {
      toast({
        title: "✅ Email verified — welcome to Renofine!",
        description: "Your account is ready. Let's get started!",
      });
      window.history.replaceState({}, "", "/start");
    }

    // Handle OAuth errors (e.g. Google sign-in failure)
    const error = params.get("error") || hashParams.get("error");
    const errorDesc = params.get("error_description") || hashParams.get("error_description");
    if (error) {
      toast({
        title: t("auth.loginFailed", "Sign in failed"),
        description: errorDesc
          ? decodeURIComponent(errorDesc)
          : t("auth.tryAgain", "Please try again or use email sign in."),
        variant: "destructive",
      });
      window.history.replaceState({}, "", "/start");
    }
  }, []);


  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const handleWelcomeComplete = async (userType: "homeowner" | "contractor", quickStart?: QuickStartChoice) => {
    setShowWelcomeModal(false);

    if (isGuest) {
      // Guest mode: refresh guest projects
      refetch();
    } else {
      // Refresh projects - refetch() already handles demo seeding
      await refetch();
    }

    // Handle quick start choice
    if (quickStart === "guided") {
      // Open the guided setup wizard
      setShowGuidedSetup(true);
    } else if (quickStart === "blank") {
      // Open the create project dialog
      setDialogOpen(true);
    } else if (quickStart === "import") {
      // Open AI project import modal directly
      setShowAIImport(true);
    } else {
      // "explore" - just show toast about demo project
      toast({
        title: t("demoProject.badge"),
        description: t("demoProject.description"),
      });
    }
  };

  // Fetch entity counts when delete target is set
  useEffect(() => {
    if (!deleteTarget || isGuest) {
      setDeleteCounts(null);
      return;
    }
    setLoadingCounts(true);
    setDeleteCounts(null);

    Promise.all([
      supabase.from("quotes").select("id", { count: "exact", head: true }).eq("project_id", deleteTarget.id),
      supabase.from("invoices").select("id, status").eq("project_id", deleteTarget.id),
      supabase.from("project_shares").select("id", { count: "exact", head: true }).eq("project_id", deleteTarget.id),
    ]).then(([quotesRes, invoicesRes, sharesRes]) => {
      const invoices = invoicesRes.data || [];
      const hasNonDraft = invoices.some((inv) => inv.status !== "draft");
      setDeleteCounts({
        quotes: quotesRes.count ?? 0,
        invoices: invoices.length,
        teamMembers: sharesRes.count ?? 0,
        hasNonDraftInvoices: hasNonDraft,
      });
      setLoadingCounts(false);
    });
  }, [deleteTarget, isGuest]);

  const handleDeleteProject = async () => {
    if (!deleteTarget) return;
    // Block deletion if non-draft invoices exist
    if (deleteCounts?.hasNonDraftInvoices) return;
    setDeleting(true);
    try {
      // Guest mode: delete from localStorage
      if (isGuest) {
        const success = deleteGuestProject(deleteTarget.id);
        if (!success) throw new Error("Failed to delete project");

        toast({
          title: t("projects.deleteSuccess"),
          description: t("projects.deleteSuccessDescription", { name: deleteTarget.name }),
        });
        setDeleteTarget(null);
        refetch();
        return;
      }

      // Authenticated mode: soft delete (set deleted_at)
      const { error } = await supabase
        .from("projects")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", deleteTarget.id);

      if (error) throw error;

      toast({
        title: t("projects.deleteSuccess"),
        description: t("projects.deleteSuccessDescription", { name: deleteTarget.name }),
      });
      setDeleteTarget(null);
      refetch();
    } catch (error: unknown) {
      toast({
        title: t("common.error"),
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const isContractor = (profile?.onboarding_user_type as string) === "contractor";
  const { isSectionEnabled } = useEnabledModules(isContractor ? "small" : "homeowner", market);
  const { showTaxDeduction } = useTaxDeductionVisible();

  // Homeowners should never see resource planning — clamp to list
  const effectiveViewMode = (!isContractor && viewMode === "resource") || (viewMode === "resource" && !isSectionEnabled("resource_planning")) ? "list" : viewMode;

  // Show loading while auth or data is loading
  if (authLoading || loading) {
    return <PageLoadingSkeleton />;
  }

  // Dispatch: contractors with 0 projects get setup start page.
  // Homeowners share this same body — gated sections (LeadsPipeline,
  // FinancialAnalysis, ResourcePlanning) already check isContractor/module
  // visibility, and HomeownerYearlyAnalysis renders for them below.
  if (!isGuest && isContractor && profile && nonDemoProjects.length === 0) {
    return (
      <Suspense fallback={<PageLoadingSkeleton />}>
        <ContractorStart />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        userName={isGuest ? t('guest.guestUser', 'Guest') : profile?.name}
        userEmail={isGuest ? t('guest.localMode', 'Local mode') : (profile?.email || user?.email)}
        avatarUrl={isGuest ? undefined : profile?.avatar_url}
        onSignOut={isGuest ? undefined : handleSignOut}
        isGuest={isGuest}
        guestUserType={isGuest ? guestRole : null}
        onGuestRoleChange={isGuest ? handleGuestRoleChange : undefined}
      />

      {/* Guest mode banner - sticky below header */}
      {isGuest && <GuestBanner compact />}

      {/* A/B: Editorial dashboard */}
      {editorialDashboard && !isGuest && user?.id && (
        <Suspense fallback={<div className="container py-8 text-center text-muted-foreground">Laddar ny design...</div>}>
          <DashboardRedesign
            userId={user.id}
            userName={profile?.name as string | undefined}
            onNewProject={() => setDialogOpen(true)}
            onToggleBack={() => {
              setEditorialDashboard(false);
              localStorage.setItem("rf_dashboard_v2", "false");
            }}
          />
        </Suspense>
      )}

      <main className={`container py-4 sm:py-8 ${editorialDashboard && !isGuest ? "hidden" : ""}`}>

        {/* Personal greeting */}
        {!isGuest && profile?.name && (
          <section className="mb-8 pb-6 border-b border-border">
            <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground mb-3">
              {t("dashboard.myStart", "My start")} · {new Date().toLocaleDateString(i18n.language === "sv" ? "sv-SE" : i18n.language, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
            <h1 className="font-display text-4xl sm:text-5xl font-normal tracking-tight leading-[1.05] mb-2.5">
              {(() => {
                const h = new Date().getHours();
                const key = h < 5 ? "night" : h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
                return t(`dashboard.greeting.${key}`);
              })()}, {(profile.name as string).split(" ")[0]}.
            </h1>
            <p className="text-[15px] text-muted-foreground leading-relaxed">
              {t("dashboard.summaryPrefix", "You have")}{" "}
              <strong className="text-foreground">{nonDemoProjects.length} {t("dashboard.summaryProjects", "active projects")}</strong>
              {" "}{t("dashboard.summaryAnd", "and")}{" "}
              <strong className="text-foreground">0 {t("dashboard.summaryTasks", "tasks")}</strong>
              {" "}{t("dashboard.summarySuffix", "this week")}.
            </p>
          </section>
        )}

        {/* Pipeline Section - Leads & Quotes (hidden in guest mode, for homeowners, or when quotes module disabled) */}
        {!isGuest && isSectionEnabled("pipeline") && (
          <section id="pipeline">
            <LeadsPipelineSection
              onRefetch={refetch}
              userType={profile?.onboarding_user_type as string | null}
            />
          </section>
        )}

        <section id="projekt" className="scroll-mt-20">
        <div className="mb-4">
          <h2 className="text-2xl font-display font-normal tracking-tight">{t('projects.title')}</h2>
        </div>

        {/* Dashboard strip — reminders, right below header (excludes demo project) */}
        {nonDemoProjects.length > 0 && (
          <DashboardStrip
            projectIds={nonDemoProjects.map((p) => p.id)}
            currency={nonDemoProjects[0]?.currency || "SEK"}
          />
        )}

        {/* View controls + new project — directly above the project list */}
        <div className="flex items-center gap-2 flex-wrap mb-4">
              {/* Status filter tabs */}
              {displayProjects.length > 0 && (
                <div className="flex items-center border rounded-md mr-auto">
                  {([
                    { key: "all" as const, label: t("projects.filterAll", "Alla") },
                    { key: "active" as const, label: t("projects.filterActive", "Pågående") },
                    { key: "completed" as const, label: t("projects.filterCompleted", "Avslutade") },
                  ]).map((f, i, arr) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setStatusFilter(f.key)}
                      className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${i === 0 ? "rounded-l-md" : ""} ${i === arr.length - 1 ? "rounded-r-md" : ""} ${statusFilter === f.key ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
              {displayProjects.length > 0 && !editorialDashboard && (
                <div className="flex items-center border rounded-md">
                  <button
                    type="button"
                    onClick={() => { setViewMode("grid"); localStorage.setItem("projects_view_mode", "grid"); }}
                    className={`p-1.5 rounded-l-md transition-colors ${effectiveViewMode === "grid" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    title={t("projects.gridView", "Card view")}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setViewMode("list"); localStorage.setItem("projects_view_mode", "list"); }}
                    className={`p-1.5 transition-colors ${effectiveViewMode === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    title={t("projects.listView", "List view")}
                  >
                    <List className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setViewMode("timeline"); localStorage.setItem("projects_view_mode", "timeline"); }}
                    className={`p-1.5 transition-colors ${!isContractor || !isSectionEnabled("resource_planning") ? "rounded-r-md" : ""} ${effectiveViewMode === "timeline" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    title={t("projects.timelineView", "Timeline")}
                  >
                    <GanttChart className="h-4 w-4" />
                  </button>
                  {isContractor && isSectionEnabled("resource_planning") && (
                    <button
                      type="button"
                      onClick={() => { setViewMode("resource"); localStorage.setItem("projects_view_mode", "resource"); }}
                      className={`p-1.5 rounded-r-md transition-colors ${viewMode === "resource" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      title={t("resourcePlanning.title", "Resource planning")}
                    >
                      <Users className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    const next = !editorialDashboard;
                    setEditorialDashboard(next);
                    localStorage.setItem("rf_dashboard_v2", String(next));
                  }}
                  className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    editorialDashboard
                      ? "bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                  title="Testa ny dashboard (A/B)"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Ny design</span>
                </button>
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowAdminProjects((v) => !v)}
                  className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    showAdminProjects
                      ? "bg-amber-100 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                  title={t("projects.adminToggle", "Show all projects (admin)")}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{showAdminProjects ? t("projects.adminOn", "Admin") : t("projects.adminOff", "Admin")}</span>
                </button>
              )}
              {hasDemoProject && (
                <button
                  type="button"
                  onClick={() => {
                    const next = !hideDemo;
                    setHideDemo(next);
                    localStorage.setItem("rf_hide_demo", String(next));
                  }}
                  className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    hideDemo
                      ? "bg-muted border-border text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                  title={t("projects.hideDemo", "Hide demo project")}
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Demo</span>
                </button>
              )}
              {effectiveViewMode === "list" && (
                <ColumnToggle
                  columns={listColumnOrder}
                  labels={colLabels}
                  visible={new Set(listColumnOrder.filter(k => !hiddenListCols.has(k)))}
                  onChange={(vis) => {
                    const hidden = new Set(listColumnOrder.filter(k => !vis.has(k)));
                    setHiddenListCols(hidden);
                    saveListColPrefs(listColumnOrder, hidden);
                  }}
                  trigger={
                    <Button variant="ghost" size="icon" className="h-7 w-7" title={t("declaration.columns", "Kolumner")}>
                      <Settings2 className="h-3.5 w-3.5" />
                    </Button>
                  }
                />
              )}
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">
                  {t('projects.newProject')}
                </span>
                <span className="sm:hidden">{t('common.create', 'Skapa')}</span>
              </Button>
              <CreateProjectDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                isGuest={isGuest}
                isContractor={isContractor}
                refreshStorageUsage={refreshStorageUsage}
                onOpenAIImport={() => setShowAIImport(true)}
                onOpenIntake={() => setCreateIntakeOpen(true)}
              />
          </div>

        {displayProjects.length === 0 && !showAdminProjects ? (
          <div className="max-w-lg mx-auto text-center py-12 space-y-8">
            <div>
              <h3 className="text-2xl font-semibold mb-2">{t('onboarding.welcome')}</h3>
              <p className="text-muted-foreground">{t('onboarding.welcomeDescription')}</p>
            </div>
            <div className="space-y-3">
              <Button
                className="w-full h-14 text-left justify-start px-6"
                onClick={() => setDialogOpen(true)}
              >
                <Plus className="h-5 w-5 mr-3 flex-shrink-0" />
                <div>
                  <div className="font-medium">{t('onboarding.createProject')}</div>
                  <div className="text-xs text-primary-foreground/70">{t('onboarding.createProjectDesc')}</div>
                </div>
              </Button>
              <Button
                variant="outline"
                className="w-full h-14 text-left justify-start px-6"
                disabled
              >
                <Users className="h-5 w-5 mr-3 flex-shrink-0" />
                <div>
                  <div className="font-medium">{t('onboarding.hasInvitation')}</div>
                  <div className="text-xs text-muted-foreground">{t('onboarding.hasInvitationDesc')}</div>
                </div>
              </Button>
            </div>
          </div>
        ) : effectiveViewMode === "timeline" ? (
          /* ---- Timeline view ---- */
          <div className="rounded-lg border bg-card overflow-hidden">
            <PortfolioTimeline
              projectIds={filteredProjects.map((p) => p.id)}
              onProjectClick={(id) => navigate(`/projects/${id}`)}
              onTaskClick={(projectId, taskId) => setDrawerTask({ projectId, taskId })}
            />
          </div>
        ) : effectiveViewMode === "resource" ? (
          /* ---- Resource planning view ---- */
          <ResourcePlanningView projectIds={filteredProjects.map(p => p.id)} />
        ) : effectiveViewMode === "list" ? (
          /* ---- List view ---- */
          (() => {
            const colAlign: Partial<Record<ListColKey, "right">> = { budget: "right", tasks: "right" };

            const renderListCell = (col: ListColKey, project: Project) => {
              const fin = projectFinancials[project.id];
              const projectStatus = normalizeStatus(project.status);
              const statusMeta = STATUS_META[projectStatus];
              switch (col) {
                case "address":
                  return <span className="truncate block max-w-[180px]">{[project.address, project.city].filter(Boolean).join(", ") || "—"}</span>;
                case "description":
                  return (
                    <span className="truncate block max-w-[200px] text-muted-foreground">
                      {project.description ? (project.description.length > 60 ? project.description.slice(0, 60).trim() + "..." : project.description) : "—"}
                    </span>
                  );
                case "tasks":
                  return fin ? (
                    <span className="tabular-nums text-sm">
                      <span className="font-medium">{fin.tasksDone}</span>
                      <span className="text-muted-foreground"> / {fin.tasksTotal}</span>
                    </span>
                  ) : <span className="text-muted-foreground">—</span>;
                case "budget":
                  if (!fin || fin.budget === 0) return <span className="text-muted-foreground">—</span>;
                  return (
                    <span className="tabular-nums text-sm">
                      <span className="font-medium">{fin.spentAmount > 0 ? formatCurrency(fin.spentAmount) : "0"}</span>
                      <span className="text-muted-foreground"> / {formatCurrency(fin.budget)}</span>
                    </span>
                  );
                case "progress": {
                  const progress = fin && fin.tasksTotal > 0 ? Math.round((fin.tasksDone / fin.tasksTotal) * 100) : 0;
                  return (
                    <div className="flex items-center gap-2 min-w-[80px]">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${progress === 100 ? "bg-muted-foreground" : "bg-primary"}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="tabular-nums text-xs text-muted-foreground min-w-[28px] text-right">{progress}%</span>
                    </div>
                  );
                }
                case "status":
                  return (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusMeta.color}`}>
                      {t(statusMeta.labelKey)}
                    </span>
                  );
                case "date":
                  return <span className="tabular-nums text-muted-foreground">{new Date(project.created_at).toLocaleDateString()}</span>;
                case "owner":
                  return (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      {project.owner_id === profileId ? t("projects.ownerYou", "You") : project.owner_id ? ownerNames[project.owner_id] || "..." : "—"}
                    </span>
                  );
                default: return null;
              }
            };

            const handleColDragStart = (col: ListColKey) => { setDraggedCol(col); };
            const handleColDragOver = (e: React.DragEvent) => { e.preventDefault(); };
            const handleColDrop = (targetCol: ListColKey) => {
              if (!draggedCol || draggedCol === targetCol) { setDraggedCol(null); return; }
              const newOrder = listColumnOrder.filter((k) => k !== draggedCol);
              const targetIdx = newOrder.indexOf(targetCol);
              newOrder.splice(targetIdx, 0, draggedCol);
              setListColumnOrder(newOrder);
              saveListColPrefs(newOrder, hiddenListCols);
              setDraggedCol(null);
            };

            return (
              <div className="rounded-lg border bg-card overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-muted border-b">
                        <th className="px-3 py-2.5 text-left kicker whitespace-nowrap">{t("projects.colName", "Namn")}</th>
                        {visibleListCols.map((col) => {
                          // Hide less important columns on smaller viewports
                          const responsiveHide =
                            col === "owner" ? "hidden xl:table-cell" :
                            col === "date" ? "hidden lg:table-cell" :
                            col === "description" ? "hidden md:table-cell" :
                            col === "address" ? "hidden lg:table-cell" : "";
                          return (
                            <th
                              key={col}
                              draggable
                              onDragStart={() => handleColDragStart(col)}
                              onDragOver={handleColDragOver}
                              onDrop={() => handleColDrop(col)}
                              onDragEnd={() => setDraggedCol(null)}
                              className={`px-3 py-2.5 kicker whitespace-nowrap select-none ${
                                colAlign[col] === "right" ? "text-right" : "text-left"
                              } ${draggedCol === col ? "opacity-40" : ""} ${responsiveHide}`}
                            >
                              {colLabels[col]}
                            </th>
                          );
                        })}
                        <th className="px-2 py-2.5 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProjects.map((project) => {
                        const isDemo = isDemoProject(project.project_type);
                        return (
                          <tr
                            key={project.id}
                            className={`border-b last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer ${isDemo ? "bg-primary/5" : ""}`}
                            onClick={() => navigate(`/projects/${project.id}`)}
                          >
                            <td className="px-3 py-2.5 max-w-[240px]">
                              <div className="flex items-center gap-2 min-w-0">
                                {isDemo && <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />}
                                <span className="font-medium truncate">{project.name}</span>
                              </div>
                            </td>
                            {visibleListCols.map((col) => {
                              const responsiveHide =
                                col === "owner" ? "hidden xl:table-cell" :
                                col === "date" ? "hidden lg:table-cell" :
                                col === "description" ? "hidden md:table-cell" :
                                col === "address" ? "hidden lg:table-cell" : "";
                              return (
                                <td
                                  key={col}
                                  className={`px-3 py-2.5 whitespace-nowrap ${colAlign[col] === "right" ? "text-right" : "text-left"} ${responsiveHide}`}
                                >
                                  {renderListCell(col, project)}
                                </td>
                              );
                            })}
                            <td className="px-2 py-2.5">
                              {(isGuest || (profileId && project.owner_id === profileId)) && !isDemo && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteTarget(project);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
            );
          })()
        ) : (
          /* ---- Grid / card view ---- */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {filteredProjects.map((project) => {
              const isDemo = isDemoProject(project.project_type);
              const projectStatus = normalizeStatus(project.status);
              const statusMeta = STATUS_META[projectStatus];
              const fin = projectFinancials[project.id];
              return (
                <ProjectGridCard
                  key={project.id}
                  project={project}
                  isDemo={isDemo}
                  statusLabel={t(statusMeta.labelKey)}
                  statusColor={statusMeta.color}
                  budget={fin?.budget ?? 0}
                  profit={fin?.profit ?? 0}
                  ownerName={
                    project.owner_id === profileId
                      ? t("projects.ownerYou", "You")
                      : ownerNames[project.owner_id ?? ""] || t("common.loading")
                  }
                  isOwnProject={!!(isGuest || (profileId && project.owner_id === profileId))}
                  isContractor={isContractor}
                  currency={project.currency || "SEK"}
                  onDelete={() => setDeleteTarget(project)}
                />
              );
            })}
          </div>
        )}
        </section>

        {/* Financial Analysis - contractors only, at the bottom */}
        {isContractor && !isGuest && nonDemoProjects.length > 0 && isSectionEnabled("financial_analysis") && (
          <section className="mt-6 sm:mt-8">
            <FinancialAnalysisSection
              projects={nonDemoProjects}
              financials={projectFinancials}
              currency={(profile?.currency as string) ?? null}
            />
          </section>
        )}

        {!isGuest && !isContractor && showTaxDeduction && nonDemoProjects.length > 0 && (
          <section id="deklaration" className="mt-10 sm:mt-14 scroll-mt-20">
            <HomeownerYearlyAnalysis
              projects={nonDemoProjects}
              currency={(profile?.currency as string) ?? null}
            />
          </section>
        )}
      </main>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("projects.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <span className="block">
                  {t("projects.deleteWarning", { name: deleteTarget?.name })}
                </span>
                {loadingCounts && (
                  <span className="block text-muted-foreground text-sm">
                    {t("projects.deleteCountsLoading", "Checking project contents...")}
                  </span>
                )}
                {deleteCounts && (deleteCounts.quotes > 0 || deleteCounts.invoices > 0 || deleteCounts.teamMembers > 0) && (
                  <span className="block text-sm">
                    {t("projects.deleteCounts", {
                      quotes: deleteCounts.quotes,
                      invoices: deleteCounts.invoices,
                      members: deleteCounts.teamMembers,
                    })}
                  </span>
                )}
                {deleteCounts?.hasNonDraftInvoices ? (
                  <span className="block font-medium text-destructive">
                    {t("projects.deleteBlockedByInvoices", "Cannot delete: this project has sent or paid invoices. Cancel or revert them to draft first.")}
                  </span>
                ) : (
                  <span className="block text-sm text-muted-foreground">
                    {t("projects.deleteConfirmSoftDelete", "The project will be archived and hidden from all views.")}
                  </span>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProject}
              disabled={deleting || loadingCounts || !!deleteCounts?.hasNonDraftInvoices}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? t("common.loading") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Welcome modal for new users (authenticated & guests) */}
      <WelcomeModal
        open={showWelcomeModal}
        profileId={profile?.id as string | undefined}
        onComplete={handleWelcomeComplete}
      />

      {/* Create Intake Dialog (send customer form) */}
      <CreateIntakeDialog open={createIntakeOpen} onOpenChange={setCreateIntakeOpen} onCreated={() => { /* intake created from dialog */ }} />

      {/* Guided Setup Wizard */}
      <Dialog open={showGuidedSetup} onOpenChange={setShowGuidedSetup}>
        <DialogContent className="md:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("guidedSetup.title")}</DialogTitle>
            <DialogDescription>
              {t("guidedSetup.titleDesc")}
            </DialogDescription>
          </DialogHeader>
          {(profile?.id || isGuest) && (
            <GuidedSetupWizard
              userType={((isGuest ? guestRole : profile?.onboarding_user_type) as "homeowner" | "contractor") || "homeowner"}
              profileId={profile?.id as string | undefined}
              isGuest={isGuest}
              onComplete={(projectId) => {
                setShowGuidedSetup(false);
                refreshStorageUsage?.();
                navigate(`/projects/${projectId}`);
              }}
              onCancel={() => setShowGuidedSetup(false)}
            />
          )}
        </DialogContent>
      </Dialog>
      {/* AI Project Import Modal */}
      <AIProjectImportModal
        open={showAIImport}
        onOpenChange={setShowAIImport}
        onProjectCreated={(projectId) => {
          setShowAIImport(false);
          navigate(`/projects/${projectId}`);
        }}
      />
      {/* Task drawer from timeline */}
      <TaskEditDialog
        taskId={drawerTask?.taskId ?? null}
        projectId={drawerTask?.projectId ?? ""}
        open={drawerTask !== null}
        onOpenChange={(open) => { if (!open) setDrawerTask(null); }}
        variant="sheet"
      />

      {/* Mobile bottom navigation */}
      <AppBottomNav />
    </div>
  );
};

export default Projects;