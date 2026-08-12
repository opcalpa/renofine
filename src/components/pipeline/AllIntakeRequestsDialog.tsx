import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Mail,
  ChevronRight,
  Clock,
  CheckCircle,
  Send,
  XCircle,
  AlertCircle,
  FolderPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { sv, enUS } from "date-fns/locale";
import type { IntakeRequestSummary } from "./types";

interface AllIntakeRequestsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  intakeRequests: IntakeRequestSummary[];
  onCreateProject?: (intakeId: string) => void;
}

const statusConfig: Record<
  string,
  { icon: React.ElementType; color: string; bgColor: string; labelKey: string }
> = {
  pending: {
    icon: Clock,
    color: "text-amber-600",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    labelKey: "statuses.pending",
  },
  submitted: {
    icon: Send,
    color: "text-blue-600",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    labelKey: "statuses.submitted",
  },
  converted: {
    icon: CheckCircle,
    color: "text-green-600",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    labelKey: "statuses.converted",
  },
  cancelled: {
    icon: XCircle,
    color: "text-red-600",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    labelKey: "statuses.cancelled",
  },
  expired: {
    icon: AlertCircle,
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    labelKey: "statuses.expired",
  },
};

export function AllIntakeRequestsDialog({
  open,
  onOpenChange,
  intakeRequests,
  onCreateProject,
}: AllIntakeRequestsDialogProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const getLocale = () => (i18n.language === "sv" ? sv : enUS);

  const handleIntakeClick = (intake: IntakeRequestSummary) => {
    // Both /intake-requests/:id and /projects/:id/intake/:id are dead routes
    // (404). The list page opens any request's detail via ?open=<id>.
    navigate(`/intake-requests?open=${intake.id}`);
    onOpenChange(false);
  };

  const handleCreateProject = (e: React.MouseEvent, intakeId: string) => {
    e.stopPropagation();
    if (onCreateProject) {
      onCreateProject(intakeId);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {t("pipeline.allIntakeRequests")}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          {intakeRequests.length === 0 ? (
            <div className="text-center py-8">
              <Mail className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">{t("pipeline.emptyIntakes")}</p>
            </div>
          ) : (
            <div className="space-y-2 pb-4">
              {intakeRequests.map((intake) => {
                const config = statusConfig[intake.status] || statusConfig.pending;
                const StatusIcon = config.icon;
                const isUnlinked = !intake.project_id && intake.status !== "cancelled" && intake.status !== "converted";

                return (
                  <button
                    key={intake.id}
                    onClick={() => handleIntakeClick(intake)}
                    className="w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium truncate">
                            {intake.customer_name || t("pipeline.noCustomerName")}
                          </span>
                          <Badge
                            variant="secondary"
                            className={cn("text-xs shrink-0", config.bgColor, config.color)}
                          >
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {t(config.labelKey, intake.status)}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground space-y-0.5">
                          {intake.property_address && (
                            <p className="truncate">
                              {intake.property_address}
                              {intake.property_city && `, ${intake.property_city}`}
                            </p>
                          )}
                          <div className="flex items-center gap-2">
                            {intake.project_name ? (
                              <span className="truncate">{intake.project_name}</span>
                            ) : (
                              <span className="italic">{t("pipeline.noProject")}</span>
                            )}
                            <span>·</span>
                            <span className="shrink-0">
                              {formatDistanceToNow(
                                new Date(intake.submitted_at || intake.created_at),
                                { addSuffix: true, locale: getLocale() }
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isUnlinked && intake.status === "submitted" && onCreateProject && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => handleCreateProject(e, intake.id)}
                            className="shrink-0"
                          >
                            <FolderPlus className="h-4 w-4 mr-1" />
                            {t("pipeline.createProject")}
                          </Button>
                        )}
                        <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
