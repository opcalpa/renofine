import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Clock, PiggyBank, MessageSquare, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { KonvaTimeline } from "@/components/project/timeline/KonvaTimeline";
import { TasksCalendarView } from "@/components/project/calendar";
import { ProjectDocumentsCard } from "@/components/project/overview/ProjectDocumentsCard";
import { ProjectChatSection } from "@/components/project/overview/ProjectChatSection";
import { ClientTaskSheet } from "@/components/project/ClientTaskSheet";
import { supabase } from "@/integrations/supabase/client";

interface CustomerViewTabProps {
  projectId: string;
  projectName: string;
  projectStartDate?: string | null;
  projectFinishDate?: string | null;
  currency?: string | null;
  userType?: string | null;
}

interface SectionProps {
  icon: React.ElementType;
  title: string;
  description: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({ icon: Icon, title, description, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border rounded-lg">
      <CollapsibleTrigger className="flex items-center gap-3 w-full p-4 hover:bg-muted/50 transition-colors">
        <Icon className="h-5 w-5 text-primary shrink-0" />
        <div className="flex-1 text-left">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t">
        <div className="p-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

type ScheduleView = "timeline" | "calendar";

interface CalendarTask {
  id: string;
  title: string;
  status: string;
  start_date: string | null;
  finish_date: string | null;
}

interface CalendarMilestone {
  id: string;
  title: string;
  date: string;
  color: string | null;
}

export default function CustomerViewTab({
  projectId,
  projectName,
  projectStartDate,
  projectFinishDate,
  currency,
  userType,
}: CustomerViewTabProps) {
  const { t } = useTranslation();
  const [scheduleView, setScheduleView] = useState<ScheduleView>(() => {
    const saved = localStorage.getItem(`customer-schedule-view-${projectId}`);
    return saved === "calendar" ? "calendar" : "timeline";
  });
  const [tasks, setTasks] = useState<CalendarTask[]>([]);
  const [milestones, setMilestones] = useState<CalendarMilestone[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskSheetOpen, setTaskSheetOpen] = useState(false);

  // Fetch tasks + milestones for calendar view
  useEffect(() => {
    supabase
      .from("tasks")
      .select("id, title, status, start_date, finish_date")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .then(({ data }) => { if (data) setTasks(data); });

    supabase
      .from("milestones")
      .select("id, title, date, color")
      .eq("project_id", projectId)
      .order("date")
      .then(({ data }) => { if (data) setMilestones(data); });
  }, [projectId]);

  const handleViewChange = (view: ScheduleView) => {
    setScheduleView(view);
    localStorage.setItem(`customer-schedule-view-${projectId}`, view);
  };

  const handleTaskClick = (taskId: string) => {
    setSelectedTaskId(taskId);
    setTaskSheetOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Schedule section with Timeline/Calendar toggle */}
      <div className="border rounded-lg">
        <div className="flex items-center gap-3 p-4">
          <Clock className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1 text-left min-w-0">
            <h3 className="text-sm font-semibold">{t("customerView.timeline")}</h3>
            <p className="text-xs text-muted-foreground hidden sm:block">{t("customerView.timelineDescription")}</p>
          </div>
          {/* View toggle */}
          <div className="flex rounded-md bg-muted/40 border border-border/60 p-0.5 shrink-0">
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
        </div>
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
                tasks={tasks}
                milestones={milestones}
                onTaskClick={handleTaskClick}
              />
            </div>
          )}
        </div>
      </div>

      <div id="project-chat">
        <CollapsibleSection
          icon={MessageSquare}
          title={t("customerView.messages")}
          description={t("customerView.messagesDescription")}
        >
          <ProjectChatSection
            projectId={projectId}
            userType={userType}
          />
        </CollapsibleSection>
      </div>

      <CollapsibleSection
        icon={PiggyBank}
        title={t("customerView.budget")}
        description={t("customerView.budgetDescription")}
      >
        <ProjectDocumentsCard
          projectId={projectId}
          currency={currency}
          embedded
          excludeDrafts
        />
      </CollapsibleSection>

      {/* Task detail — read-only sheet for customers */}
      <ClientTaskSheet
        taskId={selectedTaskId}
        projectId={projectId}
        open={taskSheetOpen}
        onOpenChange={setTaskSheetOpen}
      />
    </div>
  );
}
