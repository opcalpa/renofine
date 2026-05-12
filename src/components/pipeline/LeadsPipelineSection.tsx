import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, FileEdit, Send, CheckCircle, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { useLeadsPipelineData } from "@/hooks/useLeadsPipelineData";
import { AllIntakeRequestsDialog } from "./AllIntakeRequestsDialog";
import { AllQuotesDialog } from "./AllQuotesDialog";
import type { ProjectBucket } from "./types";

interface LeadsPipelineSectionProps {
  onRefetch?: () => void;
  userType?: string | null;
}

export function LeadsPipelineSection({ onRefetch, userType }: LeadsPipelineSectionProps) {
  // Hide pipeline for homeowners - they receive quotes, not create them
  if (userType === "homeowner") {
    return null;
  }

  const { t } = useTranslation();
  const { data, intakeRequests, projectBuckets } = useLeadsPipelineData();

  // Dialog states
  const [intakesDialogOpen, setIntakesDialogOpen] = useState(false);
  const [activeBucketDialog, setActiveBucketDialog] = useState<ProjectBucket | null>(null);

  const handleCreateProjectFromIntake = (intakeId: string) => {
    window.location.href = `/intake-requests/${intakeId}?action=create-project`;
  };

  if (data.loading) {
    return (
      <div className="mb-8">
        <Skeleton className="h-[88px] w-full rounded-xl" />
      </div>
    );
  }

  const { projectQuotes } = data;
  const hasIntakes = data.intakeRequests.total > 0;
  const hasDrafts = projectQuotes.draft.count > 0;
  const hasSent = projectQuotes.sent.count > 0;
  const hasAccepted = projectQuotes.accepted.count > 0;

  // Hide pipeline entirely if no data
  if (!hasIntakes && !hasDrafts && !hasSent && !hasAccepted) {
    return null;
  }

  const dialogQuotes = activeBucketDialog ? (projectBuckets.get(activeBucketDialog) || []) : [];
  const dialogAcceptedTotal = activeBucketDialog === "accepted" ? projectQuotes.accepted.totalAmount : 0;

  const bucketTitles: Record<ProjectBucket, string> = {
    draft: t("pipeline.drafts"),
    sent: t("pipeline.sentQuotes"),
    accepted: t("pipeline.accepted"),
  };

  return (
    <div className="mb-6">
      <h2 className="text-2xl font-display font-normal tracking-tight mb-4">{t("pipeline.myQuotes", "Mina offerter")}</h2>
      <Card>
        <CardContent className="pt-4 pb-4 px-4">
          <div className="flex items-stretch divide-x">
            {/* Förfrågningar */}
            {hasIntakes && (
              <button
                onClick={() => setIntakesDialogOpen(true)}
                className="group flex-1 text-left px-3 first:pl-0 last:pr-0 hover:bg-accent/50 rounded-l transition-colors"
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <Mail className="h-3.5 w-3.5 text-blue-600" />
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("pipeline.intakeRequests")}
                  </span>
                  <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground/30 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-lg font-display font-normal">{data.intakeRequests.total}</p>
                <div className="text-xs text-muted-foreground mt-1 space-y-1 min-h-[2.25rem]">
                  {data.intakeRequests.pending > 0 ? (
                    <p>
                      {data.intakeRequests.pending} {t("pipeline.awaitingResponse")}
                    </p>
                  ) : null}
                  {data.intakeRequests.submitted > 0 ? (
                    <p>
                      {data.intakeRequests.submitted} {t("pipeline.needsAction")}
                    </p>
                  ) : null}
                  {data.intakeRequests.pending === 0 && data.intakeRequests.submitted === 0 && (
                    <p className="text-muted-foreground/60 italic">{t("pipeline.allHandled", "Alla hanterade")}</p>
                  )}
                </div>
              </button>
            )}

            {/* Utkast */}
            {hasDrafts && (
              <button
                onClick={() => setActiveBucketDialog("draft")}
                className="group flex-1 text-left px-3 first:pl-0 last:pr-0 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <FileEdit className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("pipeline.drafts")}
                  </span>
                  <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground/30 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-lg font-display font-normal">{projectQuotes.draft.count}</p>
                <div className="text-xs text-muted-foreground mt-1 space-y-1 min-h-[2.25rem]">
                  {projectQuotes.draft.totalAmount > 0 ? (
                    <>
                      <p>{t("planningTasks.estimatedBudget", "Estimated budget")}: <span className="font-medium text-foreground">{formatCurrency(projectQuotes.draft.totalAmount)}</span></p>
                      <p>{t("planningTasks.estimatedProfit", "Est. profit")}: <span className="font-medium text-green-600">{formatCurrency(projectQuotes.draft.totalAfterRot)}</span></p>
                    </>
                  ) : (
                    <p className="text-muted-foreground/60 italic">{t("pipeline.noBudgetYet", "Ingen budget än")}</p>
                  )}
                </div>
              </button>
            )}

            {/* Skickade */}
            {hasSent && (
              <button
                onClick={() => setActiveBucketDialog("sent")}
                className="group flex-1 text-left px-3 first:pl-0 last:pr-0 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <Send className="h-3.5 w-3.5 text-blue-600" />
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("pipeline.sentQuotes")}
                  </span>
                  <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground/30 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-lg font-display font-normal">{projectQuotes.sent.count}</p>
                <div className="text-xs text-muted-foreground mt-1 space-y-1 min-h-[2.25rem]">
                  {projectQuotes.sent.totalAmount > 0 ? (
                    <>
                      <p>{t("planningTasks.estimatedBudget", "Estimated budget")}: <span className="font-medium text-foreground">{formatCurrency(projectQuotes.sent.totalAmount)}</span></p>
                      <p>{t("planningTasks.estimatedProfit", "Est. profit")}: <span className="font-medium text-green-600">{formatCurrency(projectQuotes.sent.totalAfterRot)}</span></p>
                    </>
                  ) : (
                    <p className="text-muted-foreground/60 italic">{t("pipeline.noBudgetYet", "Ingen budget än")}</p>
                  )}
                </div>
              </button>
            )}

            {/* Godkända */}
            {hasAccepted && (
              <button
                onClick={() => setActiveBucketDialog("accepted")}
                className="group flex-1 text-left px-3 first:pl-0 last:pr-0 hover:bg-accent/50 rounded-r transition-colors"
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("pipeline.accepted")}
                  </span>
                  <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground/30 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-lg font-display font-normal">{projectQuotes.accepted.count}</p>
                <div className="text-xs text-muted-foreground mt-1 space-y-1 min-h-[2.25rem]">
                  {projectQuotes.accepted.totalAmount > 0 ? (
                    <>
                      <p>{t("planningTasks.estimatedBudget", "Estimated budget")}: <span className="font-medium text-foreground">{formatCurrency(projectQuotes.accepted.totalAmount)}</span></p>
                      <p>{t("planningTasks.estimatedProfit", "Est. profit")}: <span className="font-medium text-green-600">{formatCurrency(projectQuotes.accepted.totalAfterRot)}</span></p>
                    </>
                  ) : (
                    <p className="text-muted-foreground/60 italic">{t("pipeline.noBudgetYet", "Ingen budget än")}</p>
                  )}
                </div>
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <AllIntakeRequestsDialog
        open={intakesDialogOpen}
        onOpenChange={setIntakesDialogOpen}
        intakeRequests={intakeRequests}
        onCreateProject={handleCreateProjectFromIntake}
      />

      <AllQuotesDialog
        open={activeBucketDialog !== null}
        onOpenChange={(open) => { if (!open) setActiveBucketDialog(null); }}
        quotes={dialogQuotes}
        acceptedTotal={dialogAcceptedTotal}
        title={activeBucketDialog ? bucketTitles[activeBucketDialog] : undefined}
      />
    </div>
  );
}
