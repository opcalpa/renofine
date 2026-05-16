import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useProjectReminders } from "@/hooks/useProjectReminders";
import { useJuniorStore } from "@/stores/juniorStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Settings2, ShoppingCart, FileText, Mail, ChevronDown, ChevronRight, ExternalLink, UserPlus, Bell, Info, X, Play, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { useTranslation } from "react-i18next";
import { useOverviewData } from "./overview/useOverviewData";
import { PulseCards } from "./overview/PulseCards";
import { UpcomingPaymentsWidget } from "./overview/UpcomingPaymentsWidget";
import { ProjectDocumentsCard } from "./overview/ProjectDocumentsCard";
// OverviewFeedSection removed — unified into ProjectChatSection
import { ProjectSettingsDialog } from "./overview/ProjectSettingsDialog";
import { QuickReceiptCaptureModal } from "./QuickReceiptCaptureModal";
import { RegisterPaymentDialog } from "./RegisterPaymentDialog";
import { CreateQuoteDialog } from "./CreateQuoteDialog";
import { SendCustomerFormDialog } from "./SendCustomerFormDialog";
import { InvoiceMethodDialog } from "@/components/invoices/InvoiceMethodDialog";
import { useProjectLock } from "@/hooks/useProjectLock";
import { CommentsSection } from "@/components/comments/CommentsSection";
import { ProjectChatSection } from "./overview/ProjectChatSection";
import { PlanningTaskList } from "./overview/PlanningTaskList";
import { PlanningRoomList } from "./overview/PlanningRoomList";
import { HomeownerPlanningView } from "./overview/HomeownerPlanningView";
import { GuestPlanningSection } from "./overview/GuestPlanningSection";
import { ProjectHeader } from "./overview/ProjectHeader";
import { HouseholdRotDialog } from "./overview/HouseholdRotDialog";
import { useTaxDeductionVisible } from "@/hooks/useTaxDeduction";
import { ReminderSection } from "./overview/ReminderSection";
import { InspirationSection } from "./overview/InspirationSection";
import { normalizeStatus, isQuotePhase } from "@/lib/projectStatus";
import { isTeamV2MaskingEnabled } from "@/lib/featureFlags";
import { supabase } from "@/integrations/supabase/client";
import { updateGuestProject } from "@/services/guestStorageService";
import { useContextualTips } from "@/hooks/useContextualTips";
import { TipList } from "@/components/ui/TipCard";
import type { TipContext } from "@/lib/contextualTips";
import { InviteCustomerPlanningDialog } from "./overview/InviteCustomerPlanningDialog";
import type { OverviewProject, OverviewNavigation } from "./overview/types";
import type { FeedComment } from "./feed/types";

function CollapsibleSection({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-2 w-full text-left py-2 group">
          <ChevronRight
            className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
          />
          {icon}
          <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
            {title}
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 sm:space-y-6 pt-2">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

interface OverviewTabProps {
  project: OverviewProject;
  userType?: string | null;
  isGuest?: boolean;
  isProjectOwner?: boolean;
  isPlanningContributor?: boolean;
  purchasesAccess?: string;
  overviewAccess?: string;
  onProjectUpdate?: () => void;
  onNavigateToEntity?: (comment: FeedComment) => void;
  onNavigateToPurchases?: (materialId?: string) => void;
  onNavigateToTasks?: (taskId?: string) => void;
  onNavigateToFeed?: () => void;
  onNavigateToBudget?: () => void;
  onNavigateToFiles?: () => void;
  onNavigateToRoom?: (roomId: string) => void;
}

const OverviewTab = ({
  project,
  userType,
  isGuest,
  isProjectOwner = false,
  isPlanningContributor = false,
  purchasesAccess = 'none',
  overviewAccess = 'none',
  onProjectUpdate,
  onNavigateToEntity,
  onNavigateToPurchases,
  onNavigateToTasks,
  onNavigateToFeed,
  onNavigateToBudget,
  onNavigateToFiles,
  onNavigateToRoom,
}: OverviewTabProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { lockStatus } = useProjectLock(isGuest ? undefined : project.id);
  const { showTaxDeduction } = useTaxDeductionVisible(project.country);
  const isHomeowner = userType === "homeowner";
  const [roomsVersion, setRoomsVersion] = useState(0);
  const isInvitedClient = isHomeowner && !isProjectOwner;
  const projectStatus = normalizeStatus(project.status);
  const isPlanning = projectStatus === "planning" || isQuotePhase(projectStatus);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleStatusChange = useCallback(async (newStatus: string) => {
    const { error } = await supabase.from("projects").update({ status: newStatus }).eq("id", project.id);
    if (error) {
      toast.error(t("common.error"));
      return;
    }
    toast.success(t("projectStatus.statusUpdated", "Status uppdaterad"));
    onProjectUpdate?.();
  }, [project.id, onProjectUpdate, t]);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [customerFormOpen, setCustomerFormOpen] = useState(false);
  const [invoiceMethodOpen, setInvoiceMethodOpen] = useState(false);
  const [inviteCustomerOpen, setInviteCustomerOpen] = useState(false);
  const [rotPersonnummer, setRotPersonnummer] = useState<string | null>(null);
  const [hasClient, setHasClient] = useState(false);
  const [householdDialogOpen, setHouseholdDialogOpen] = useState(false);
  const [planningActions, setPlanningActions] = useState<React.ReactNode>(null);

  // Check if household ROT dialog should show (once for homeowners)
  useEffect(() => {
    if (!isHomeowner || !isProjectOwner || isGuest) return;
    const checkHousehold = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_asked_household")
        .eq("user_id", user.id)
        .single();
      if (profile && !(profile as Record<string, unknown>).onboarding_asked_household) {
        setHouseholdDialogOpen(true);
      }
    };
    checkHousehold();
  }, [isHomeowner, isProjectOwner, isGuest]);

  // Fetch personnummer for ROT card
  useEffect(() => {
    if (isGuest) return;
    const fetchRotData = async () => {
      if (isHomeowner) {
        // Homeowner: fetch own personnummer
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) return;
        const { data: ownProfile } = await supabase
          .from("profiles")
          .select("personnummer")
          .eq("user_id", authUser.id)
          .maybeSingle();
        if (ownProfile?.personnummer) {
          setRotPersonnummer(ownProfile.personnummer);
        }
      } else {
        // Builder: fetch client's personnummer
        const { data: shares } = await supabase
          .from("project_shares")
          .select("shared_with_user_id")
          .eq("project_id", project.id)
          .eq("role", "client")
          .limit(1);

        const clientProfileId = shares?.[0]?.shared_with_user_id;
        if (clientProfileId) {
          setHasClient(true);
          const { data: clientProfile } = await supabase
            .from("profiles")
            .select("personnummer")
            .eq("id", clientProfileId)
            .maybeSingle();
          if (clientProfile?.personnummer) {
            setRotPersonnummer(clientProfile.personnummer);
          }
        }
      }
    };
    fetchRotData();
  }, [project.id, isHomeowner, isGuest]);

  const {
    taskStats,
    budgetStats,
    orderStats,
    timelineStats,
    viewerMode,
    loading: overviewLoading,
    refetch,
  } = useOverviewData(project, isGuest);

  // L9: economy quick-actions (invoice/quote/purchase/payment) must not
  // show to masked viewers. Flag off → unchanged. Flag on → only "full"
  // (owner/co-owner); hidden while viewerMode resolves (fail safe).
  const economyActionsAllowed = !isTeamV2MaskingEnabled() || viewerMode === "full";

  const navigation: OverviewNavigation = {
    onNavigateToTasks: (taskId?: string) => onNavigateToTasks?.(taskId),
    onNavigateToPurchases: () => onNavigateToPurchases?.(),
    onNavigateToFeed: () => onNavigateToFeed?.(),
    onNavigateToBudget: () => onNavigateToBudget?.(),
    onOpenSettings: () => setSettingsOpen(true),
  };

  const handleProjectUpdate = () => {
    onProjectUpdate?.();
    refetch();
  };

  // ----- Guest: show planning tools (localStorage-backed) -----
  if (isGuest) {
    const handleActivateProject = () => {
      updateGuestProject(project.id, { status: "active" });
      handleProjectUpdate();
    };

    return (
      <div className="space-y-4 sm:space-y-6">
        <ProjectHeader project={project} onOpenSettings={() => setSettingsOpen(true)} />
        <GuestPlanningSection
          projectId={project.id}
          projectStatus={project.status}
          onActivate={handleActivateProject}
        />
        <ProjectSettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          project={project}
          isGuest={isGuest}
          onProjectUpdate={handleProjectUpdate}
        />
      </div>
    );
  }

  // ----- Contextual tips -----
  const tipContext: TipContext = {
    projectStatus: projectStatus || undefined,
    userRole: isHomeowner ? "homeowner" : "contractor",
    contexts: isPlanning ? ["planningPhase"] : [],
    showTaxDeduction,
    taskCount: taskStats?.total ?? 0,
    completionPct: taskStats?.percentage ?? 0,
    hasBudget: (project.contract_value ?? 0) > 0,
    hasDeadline: !!project.finish_goal_date,
    hasTeam: hasClient,
  };
  const { tips, dismiss, isDismissed } = useContextualTips(tipContext);

  // ----- Project reminders (grundfunktioner) -----
  const reminderCtx = useMemo(() => ({
    projectId: project.id,
    taskCount: taskStats?.total ?? 0,
    completionPct: taskStats?.percentage ?? 0,
    hasBudget: (project.contract_value ?? 0) > 0,
    budgetPct: budgetStats?.percentage ?? 0,
    hasStartDate: !!project.start_date,
    hasFinishDate: !!project.finish_goal_date,
    hasTeam: hasClient,
    isPlanning,
    isHomeowner,
    propertyDesignation: project.property_designation,
    rotPersonnummer,
    showTaxDeduction,
  }), [project, taskStats, budgetStats, hasClient, isPlanning, isHomeowner, rotPersonnummer, showTaxDeduction]);

  const { reminders, dismissReminder, dismissAll: dismissAllReminders } = useProjectReminders(reminderCtx);

  // Sync reminders to Junior store
  useEffect(() => {
    useJuniorStore.getState().setReminders(reminders, project.name, project.country);
    return () => useJuniorStore.getState().clear();
  }, [reminders, project.name, project.country]);

  const handleTipAction = useCallback((target: string) => {
    switch (target) {
      case "tasks": onNavigateToTasks?.(); break;
      case "budget": onNavigateToBudget?.(); break;
      case "chat": onNavigateToFeed?.(); break;
      case "settings": setSettingsOpen(true); break;
      case "floormap": onNavigateToRoom?.(""); break;
    }
  }, [onNavigateToTasks, onNavigateToBudget, onNavigateToFeed, onNavigateToRoom]);

  // Listen for Junior navigation and dismiss events
  useEffect(() => {
    const navHandler = (e: Event) => {
      handleTipAction((e as CustomEvent).detail);
    };
    const dismissHandler = (e: Event) => {
      dismissReminder((e as CustomEvent).detail);
    };
    window.addEventListener("junior-navigate", navHandler);
    window.addEventListener("junior-dismiss-reminder", dismissHandler);
    return () => {
      window.removeEventListener("junior-navigate", navHandler);
      window.removeEventListener("junior-dismiss-reminder", dismissHandler);
    };
  }, [handleTipAction, dismissReminder]);

  const isRfqProject = !!project.source_rfq_project_id;

  // ----- Scope / Planning section (always available for authenticated users) -----
  const planningSection = (isHomeowner && isProjectOwner) || isPlanningContributor ? (
    <HomeownerPlanningView
      projectId={project.id}
      projectName={project.name}
      projectAddress={project.address}
      currency={project.currency}
      onActivate={isPlanningContributor ? undefined : handleProjectUpdate}
      contributorMode={isPlanningContributor}
      reminders={reminders}
      onDismissReminder={dismissReminder}
      onDismissAllReminders={dismissAllReminders}
      onHeaderActions={setPlanningActions}
    />
  ) : (
    <>
      <PlanningTaskList
        projectId={project.id}
        currency={project.currency}
        isHomeowner={isHomeowner}
        onNavigateToTasks={(taskId) => onNavigateToTasks?.(taskId)}
        onCreateQuote={() => setQuoteDialogOpen(true)}
        onActivateProject={handleProjectUpdate}
        locked={lockStatus.isLocked}
        roomsVersion={roomsVersion}
      />
      <PlanningRoomList
        projectId={project.id}
        locked={lockStatus.isLocked}
        onRoomChange={() => setRoomsVersion((v) => v + 1)}
      />
    </>
  );

  // ----- All phases: unified dashboard view -----
  return (
    <div className="space-y-6">
      <ProjectHeader project={project} onOpenSettings={(isProjectOwner || overviewAccess === 'edit') ? () => setSettingsOpen(true) : undefined} onStatusChange={isProjectOwner ? handleStatusChange : undefined} actions={isPlanning ? planningActions : undefined} />

      {/* RFQ banner — builder working on a homeowner's quote request */}
      {isRfqProject && !isHomeowner && isPlanning && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-3 px-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                {t("rfqBanner.title", "Quote request from homeowner")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("rfqBanner.description", "Review the scope below, add your pricing, then create a quote.")}
              </p>
            </div>
            <Button
              size="sm"
              className="gap-1.5 shrink-0"
              onClick={() => setQuoteDialogOpen(true)}
            >
              <FileText className="h-3.5 w-3.5" />
              {t("rfqBanner.createQuote", "Create quote")}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Planning content moved to dedicated Planering tab */}

      {/* Reminders/tips + settings — kept above PulseCards */}
      <div className="flex items-center gap-2 flex-wrap">
              {/* Reminders + tips popover — compact button */}
              {(reminders.length > 0 || tips.length > 0) && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Bell className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{t("reminders.sectionTitle", "Reminders")}</span>
                      <span className="h-4 min-w-4 px-1 rounded-full bg-blue-500 text-white text-[10px] font-medium flex items-center justify-center">
                        {reminders.length + tips.length}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 p-3 max-h-[400px] overflow-y-auto">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium">{t("reminders.sectionTitle", "Reminders")}</p>
                      {reminders.length > 0 && (
                        <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={dismissAllReminders}>
                          {t("reminders.dismissAll", "Clear all")}
                        </Button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {reminders.map((r) => (
                        <div key={r.id} className="flex items-start gap-2 text-sm p-2 rounded-md bg-muted/50">
                          <Info className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-xs">{t(r.titleKey)}</p>
                            <p className="text-xs text-muted-foreground">{t(r.bodyKey)}</p>
                          </div>
                          <button onClick={() => dismissReminder(r.id)} className="text-muted-foreground hover:text-foreground shrink-0">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      {tips.map((tip) => (
                        <div key={tip.id} className="flex items-start gap-2 text-sm p-2 rounded-md bg-blue-50/50 dark:bg-blue-950/20">
                          <Info className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-xs">{t(tip.titleKey)}</p>
                            <p className="text-xs text-muted-foreground">{t(tip.bodyKey)}</p>
                          </div>
                          <button onClick={() => dismiss(tip.id)} className="text-muted-foreground hover:text-foreground shrink-0">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
              {(isProjectOwner || overviewAccess === 'edit') && (
              <Button
                variant="ghost"
                size="icon"
                className="hidden md:flex"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings2 className="h-5 w-5" />
              </Button>
              )}
      </div>

      <PulseCards
          taskStats={taskStats}
          budgetStats={budgetStats}
          orderStats={orderStats}
          timelineStats={timelineStats}
          navigation={navigation}
          currency={project.currency}
          isBuilder={!isHomeowner}
          loading={overviewLoading}
      />

      <UpcomingPaymentsWidget
        projectId={project.id}
        currency={project.currency}
        onNavigateToPurchases={onNavigateToPurchases ? (poId) => onNavigateToPurchases(poId) : undefined}
      />

      {/* Quick action buttons — contractor only */}
      {!isHomeowner && economyActionsAllowed && (
        <div className="flex items-center gap-2 flex-wrap -mt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setInvoiceMethodOpen(true)}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("overview.quickInvoice", "Faktura")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (isPlanning) {
                setQuoteDialogOpen(true);
              } else {
                navigate(`/quotes/new?projectId=${project.id}&is_ata=true`);
              }
            }}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            {isPlanning ? t("overview.quickQuote", "Offert") : t("overview.quickNewQuote", "Ny offert")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setReceiptModalOpen(true)}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("overview.quickPurchase", "Inköp")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPaymentDialogOpen(true)}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("overview.quickPayment", "Inbetalning")}
          </Button>
        </div>
      )}

      {isHomeowner && isProjectOwner && showTaxDeduction && (
        <HouseholdRotDialog
          projectId={project.id}
          open={householdDialogOpen}
          onOpenChange={setHouseholdDialogOpen}
          onInviteCoOwner={() => onNavigateToEntity?.("teams", "")}
        />
      )}

      <h2 className="font-display text-xl font-normal tracking-tight mt-6 mb-3">{t("overview.messagesHeading", "Meddelanden")}</h2>
      <ProjectChatSection
        projectId={project.id}
        userType={userType}
        onNavigateToEntity={onNavigateToEntity}
        onNavigateToFiles={onNavigateToFiles}
      />

      {/* Inspiration — room photos, Pinterest, material images */}
      <h2 className="font-display text-xl font-normal tracking-tight mt-6 mb-3">{t("overview.imagesHeading", "Bilder")}</h2>
      <InspirationSection
        projectId={project.id}
        currency={project.currency || "SEK"}
      />

      {/* Documents card removed from Overview — lives on Budget tab.
         Quick action buttons above replace the create buttons. */}

      {/* Planning reference removed from active phase — data already migrated
         to Tasks, Purchases, and Rooms tabs via quote acceptance. Original
         planning is accessible via the accepted quote in Documents section. */}

      <ProjectSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        project={project}
        onProjectUpdate={handleProjectUpdate}
      />

      <QuickReceiptCaptureModal
        projectId={project.id}
        open={receiptModalOpen}
        onOpenChange={setReceiptModalOpen}
        onSuccess={() => {
          refetch();
          onNavigateToPurchases?.();
        }}
      />

      <CreateQuoteDialog
        projectId={project.id}
        open={quoteDialogOpen}
        onOpenChange={setQuoteDialogOpen}
      />

      <RegisterPaymentDialog
        projectId={project.id}
        currency={project.currency}
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        onSuccess={refetch}
      />

      <SendCustomerFormDialog
        projectId={project.id}
        projectName={project.name}
        open={customerFormOpen}
        onOpenChange={setCustomerFormOpen}
        onSuccess={() => refetch()}
      />

      <InvoiceMethodDialog
        projectId={project.id}
        open={invoiceMethodOpen}
        onOpenChange={setInvoiceMethodOpen}
      />

      <InviteCustomerPlanningDialog
        projectId={project.id}
        projectName={project.name}
        open={inviteCustomerOpen}
        onOpenChange={setInviteCustomerOpen}
      />
    </div>
  );
};

export default OverviewTab;
