import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PiggyBank, MessageSquare, ChevronDown, ChevronUp, Calendar } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { KonvaTimeline } from "@/components/project/timeline/KonvaTimeline";
import { TasksCalendarView } from "@/components/project/calendar";
import { ProjectDocumentsCard } from "@/components/project/overview/ProjectDocumentsCard";
import { ProjectChatSection } from "@/components/project/overview/ProjectChatSection";
import { ClientTaskSheet } from "@/components/project/ClientTaskSheet";
import { useOverviewData } from "@/components/project/overview/useOverviewData";
import { useClientViewData } from "@/components/project/customer-view/useClientViewData";
import { HeroSection } from "@/components/project/customer-view/HeroSection";
import { ProgressRibbon } from "@/components/project/customer-view/ProgressRibbon";
import { ThisWeekTasks } from "@/components/project/customer-view/ThisWeekTasks";
import { SitePhotosGrid } from "@/components/project/customer-view/SitePhotosGrid";
import { ClientBudgetSummary } from "@/components/project/customer-view/ClientBudgetSummary";
import type { OverviewProject } from "@/components/project/overview/types";

interface CustomerViewTabProps {
  projectId: string;
  projectName: string;
  projectStartDate?: string | null;
  projectFinishDate?: string | null;
  currency?: string | null;
  userType?: string | null;
  address?: string | null;
  description?: string | null;
  status?: string | null;
  totalBudget?: number | null;
  coverImageUrl?: string | null;
}

type ScheduleView = "timeline" | "calendar";

export default function CustomerViewTab({
  projectId,
  projectName,
  projectStartDate,
  projectFinishDate,
  currency,
  userType,
  address,
  description,
  status,
  totalBudget,
  coverImageUrl,
}: CustomerViewTabProps) {
  const { t } = useTranslation();

  // Schedule view toggle
  const [scheduleView, setScheduleView] = useState<ScheduleView>(() => {
    const saved = localStorage.getItem(`customer-schedule-view-${projectId}`);
    return saved === "calendar" ? "calendar" : "timeline";
  });
  const [scheduleOpen, setScheduleOpen] = useState(false);

  // Task detail sheet
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskSheetOpen, setTaskSheetOpen] = useState(false);

  // Data
  const overviewProject: OverviewProject = {
    id: projectId,
    name: projectName,
    status: status || "active",
    total_budget: totalBudget ?? null,
    spent_amount: null,
    start_date: projectStartDate ?? null,
    finish_goal_date: projectFinishDate ?? null,
    currency,
    address,
  };
  const { taskStats, budgetStats, timelineStats } = useOverviewData(overviewProject);
  const { milestones, activeTasks, recentPhotos } = useClientViewData(projectId);

  const handleViewChange = (view: ScheduleView) => {
    setScheduleView(view);
    setScheduleOpen(true);
    localStorage.setItem(`customer-schedule-view-${projectId}`, view);
  };

  const handleTaskClick = (taskId: string) => {
    setSelectedTaskId(taskId);
    setTaskSheetOpen(true);
  };

  return (
    <div className="space-y-10 md:space-y-12">
      {/* 1. Hero */}
      <HeroSection
        projectName={projectName}
        address={address}
        description={description}
        taskStats={taskStats}
        timelineStats={timelineStats}
      />

      {/* 2. Progress ribbon */}
      <ProgressRibbon
        percentage={taskStats.percentage}
        milestones={milestones}
        startDate={projectStartDate}
        finishDate={projectFinishDate}
      />

      {/* 3. This week + Site photos (2-col) */}
      {(activeTasks.length > 0 || recentPhotos.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ThisWeekTasks tasks={activeTasks} onTaskClick={handleTaskClick} />
          <SitePhotosGrid photos={recentPhotos} />
        </div>
      )}

      {/* 4. Budget summary */}
      <ClientBudgetSummary budgetStats={budgetStats} currency={currency} />

      {/* 5. Messages */}
      <div id="project-chat">
        <ProjectChatSection projectId={projectId} userType={userType} />
      </div>

      {/* 6. Detailed timeline (collapsible) */}
      <div className="border rounded-lg">
        <div
          role="button"
          tabIndex={0}
          className="flex items-center gap-3 w-full p-4 hover:bg-muted/50 transition-colors cursor-pointer"
          onClick={() => setScheduleOpen((prev) => !prev)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setScheduleOpen((prev) => !prev); }}
        >
          <Calendar className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1 text-left min-w-0">
            <h3 className="text-sm font-semibold">
              {t("customerView.detailedTimeline", "Detaljerad tidslinje")}
            </h3>
          </div>
          {/* View toggle */}
          <div
            className="flex rounded-md bg-muted/40 border border-border/60 p-0.5 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {(["timeline", "calendar"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => handleViewChange(v)}
                className={cn(
                  "px-2 sm:px-2.5 py-1 rounded text-xs transition-colors",
                  scheduleView === v
                    ? "bg-card shadow-sm font-medium text-foreground border border-border/60"
                    : "text-muted-foreground hover:text-foreground border border-transparent"
                )}
              >
                {v === "timeline"
                  ? t("projectDetail.timeline", "Tidslinje")
                  : t("timeline.calendar", "Kalender")}
              </button>
            ))}
          </div>
          {scheduleOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
        </div>
        {scheduleOpen && (
          <div className="border-t">
            {scheduleView === "timeline" ? (
              <KonvaTimeline
                projectId={projectId}
                projectName={projectName}
                projectStartDate={projectStartDate}
                projectFinishDate={projectFinishDate}
                currency={currency}
                userType={userType}
                onTaskClick={handleTaskClick}
              />
            ) : (
              <div className="p-4">
                <TasksCalendarView
                  tasks={activeTasks.map((t) => ({
                    ...t,
                    start_date: null,
                    finish_date: null,
                  }))}
                  milestones={milestones}
                  onTaskClick={handleTaskClick}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* 7. Documents (collapsible) */}
      <Collapsible className="border rounded-lg">
        <CollapsibleTrigger className="flex items-center gap-3 w-full p-4 hover:bg-muted/50 transition-colors">
          <PiggyBank className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1 text-left">
            <h3 className="text-sm font-semibold">{t("customerView.budget")}</h3>
            <p className="text-xs text-muted-foreground">{t("customerView.budgetDescription")}</p>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t">
          <div className="p-4">
            <ProjectDocumentsCard
              projectId={projectId}
              currency={currency}
              embedded
              excludeDrafts
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Task detail sheet */}
      <ClientTaskSheet
        taskId={selectedTaskId}
        projectId={projectId}
        open={taskSheetOpen}
        onOpenChange={setTaskSheetOpen}
      />
    </div>
  );
}
