import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import {
  BookOpen,
  Trash2,
  User,
  AlertTriangle,
  CheckCircle2,
  MessageSquare,
  Home,
} from "lucide-react";

interface ProjectGridCardProps {
  project: {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    description: string | null;
    status: string;
    created_at: string;
    owner_id: string | null;
    cover_image_url: string | null;
    project_type: string | null;
    currency: string | null;
  };
  isDemo: boolean;
  statusLabel: string;
  statusColor: string;
  budget: number;
  ownerName: string;
  isOwnProject: boolean;
  isContractor: boolean;
  profit: number;
  currency: string;
  onDelete: () => void;
}

export function ProjectGridCard({
  project,
  isDemo,
  statusLabel,
  statusColor,
  budget,
  ownerName,
  isOwnProject,
  isContractor,
  profit,
  currency,
  onDelete,
}: ProjectGridCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Fetch mini-stats for this card
  const { data: stats } = useQuery({
    queryKey: ["project-card-stats", project.id],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];

      const [tasksRes, overdueRes, commentsRes] = await Promise.all([
        supabase
          .from("tasks")
          .select("id, status")
          .eq("project_id", project.id),
        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("project_id", project.id)
          .lt("due_date", today)
          .not("status", "eq", "completed"),
        supabase
          .from("comments")
          .select("id", { count: "exact", head: true })
          .eq("project_id", project.id)
          .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()),
      ]);

      const tasks = tasksRes.data || [];
      const total = tasks.length;
      const done = tasks.filter((t) => t.status === "done").length;

      return {
        totalTasks: total,
        doneTasks: done,
        overdue: overdueRes.count ?? 0,
        recentComments: commentsRes.count ?? 0,
      };
    },
    staleTime: 2 * 60 * 1000,
  });

  const taskPct = stats && stats.totalTasks > 0
    ? Math.round((stats.doneTasks / stats.totalTasks) * 100)
    : 0;

  const address = [project.address, project.city].filter(Boolean).join(", ");

  return (
    <Card
      className={`cursor-pointer overflow-hidden hover:shadow-md transition-shadow duration-150 ${isDemo ? "ring-2 ring-primary/30" : ""}`}
      onClick={() => navigate(`/projects/${project.id}`)}
    >
      {/* Demo banner */}
      {isDemo && (
        <div className="bg-primary text-primary-foreground px-4 py-2 flex items-center gap-2 text-sm font-medium">
          <BookOpen className="h-4 w-4" />
          <span>Demo</span>
          <span className="text-primary-foreground/70 font-normal">– {t("demoProject.description")}</span>
        </div>
      )}

      {/* Cover image or gradient placeholder */}
      {project.cover_image_url ? (
        <div className="h-32 overflow-hidden">
          <img
            src={project.cover_image_url}
            alt={project.name}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      ) : (
        <div className="h-32 bg-gradient-to-br from-muted/60 to-muted/30 flex items-center justify-center">
          <Home className="h-8 w-8 text-muted-foreground/20" />
        </div>
      )}

      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold truncate">{project.name}</CardTitle>
            {address && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{address}</p>
            )}
          </div>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 ${statusColor}`}>
            {statusLabel}
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-0 space-y-3">
        {/* Task progress */}
        {stats && stats.totalTasks > 0 && (
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">
                {stats.doneTasks}/{stats.totalTasks} {t("dashboard.tasksComplete", "tasks")}
              </span>
              <span className="font-medium tabular-nums">{taskPct}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${taskPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Budget progress */}
        {budget > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t("dashboard.budget")}</span>
            <span className="font-medium tabular-nums">{formatCurrency(budget, currency)}</span>
          </div>
        )}

        {/* Mini-stats row */}
        {stats && (stats.overdue > 0 || stats.recentComments > 0) && (
          <div className="flex items-center gap-3 text-xs">
            {stats.overdue > 0 && (
              <span className="inline-flex items-center gap-1 text-red-600">
                <AlertTriangle className="h-3 w-3" />
                {stats.overdue} {t("dashboard.overdue").toLowerCase()}
              </span>
            )}
            {stats.recentComments > 0 && (
              <span className="inline-flex items-center gap-1 text-blue-600">
                <MessageSquare className="h-3 w-3" />
                {stats.recentComments}
              </span>
            )}
          </div>
        )}

        {/* Footer: owner + delete */}
        <div className="flex items-center justify-between pt-3 border-t">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <User className="h-3 w-3" />
            {ownerName}
          </span>
          {isOwnProject && !isDemo && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
