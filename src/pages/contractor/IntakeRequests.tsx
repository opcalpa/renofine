import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Loader2, FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/AppHeader";
import { useAuthSession } from "@/hooks/useAuthSession";
import {
  getMyIntakeRequests,
  type IntakeRequest,
} from "@/services/intakeService";
import { IntakeRequestCard } from "@/components/intake/IntakeRequestCard";
import { CreateIntakeDialog } from "@/components/intake/CreateIntakeDialog";
import { IntakeRequestDetail } from "@/components/intake/IntakeRequestDetail";

export default function IntakeRequests() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuthSession();

  const [requests, setRequests] = useState<IntakeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<IntakeRequest | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Auth + role check handled by RequireAuth + RequireRole wrappers in App.tsx

  useEffect(() => {
    if (user) {
      loadRequests();
    }
  }, [user]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const data = await getMyIntakeRequests();
      setRequests(data);
      // Deep-link (?open=<id>): the pipeline's intake dialog points here to
      // open a specific request's detail (its old /intake-requests/:id link 404:ed).
      const openId = new URLSearchParams(window.location.search).get("open");
      if (openId) {
        const match = data.find((r) => r.id === openId);
        if (match) {
          setSelectedRequest(match);
          setDetailOpen(true);
        }
      }
    } catch (error) {
      console.error("Failed to load intake requests:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestCreated = (newRequest: IntakeRequest) => {
    setRequests((prev) => [newRequest, ...prev]);
    setCreateDialogOpen(false);
  };

  const handleRequestUpdated = (updatedRequest: IntakeRequest) => {
    setRequests((prev) =>
      prev.map((r) => (r.id === updatedRequest.id ? updatedRequest : r))
    );
  };

  const handleRequestDeleted = (requestId: string) => {
    setRequests((prev) => prev.filter((r) => r.id !== requestId));
    setDetailOpen(false);
    setSelectedRequest(null);
  };

  const handleViewDetail = (request: IntakeRequest) => {
    setSelectedRequest(request);
    setDetailOpen(true);
  };

  // Group requests by status
  const submittedRequests = requests.filter((r) => r.status === "submitted");
  const pendingRequests = requests.filter((r) => r.status === "pending");
  const otherRequests = requests.filter(
    (r) => !["submitted", "pending"].includes(r.status)
  );

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="container max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">{t("intake.requests")}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {t("intake.createRequestDescription")}
            </p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            {t("intake.newRequest")}
          </Button>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Empty state */}
        {!loading && requests.length === 0 && (
          <div className="text-center py-12">
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                <FileQuestion className="h-8 w-8 text-muted-foreground" />
              </div>
            </div>
            <h3 className="text-lg font-medium mb-2">{t("intake.noRequests")}</h3>
            <p className="text-muted-foreground mb-6">
              {t("intake.noRequestsDescription")}
            </p>
            <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              {t("intake.createRequest")}
            </Button>
          </div>
        )}

        {/* Request lists */}
        {!loading && requests.length > 0 && (
          <div className="space-y-8">
            {/* Submitted (needs attention) */}
            {submittedRequests.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                  {t("intake.statusSubmitted")} ({submittedRequests.length})
                </h2>
                <div className="space-y-3">
                  {submittedRequests.map((request) => (
                    <IntakeRequestCard
                      key={request.id}
                      request={request}
                      onView={() => handleViewDetail(request)}
                      onUpdated={handleRequestUpdated}
                      highlight
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Pending (awaiting customer) */}
            {pendingRequests.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                  {t("intake.statusPending")} ({pendingRequests.length})
                </h2>
                <div className="space-y-3">
                  {pendingRequests.map((request) => (
                    <IntakeRequestCard
                      key={request.id}
                      request={request}
                      onView={() => handleViewDetail(request)}
                      onUpdated={handleRequestUpdated}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Other (converted, expired, cancelled) */}
            {otherRequests.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                  {t("common.other")} ({otherRequests.length})
                </h2>
                <div className="space-y-3">
                  {otherRequests.map((request) => (
                    <IntakeRequestCard
                      key={request.id}
                      request={request}
                      onView={() => handleViewDetail(request)}
                      onUpdated={handleRequestUpdated}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {/* Create dialog */}
      <CreateIntakeDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={handleRequestCreated}
      />

      {/* Detail view */}
      {selectedRequest && (
        <IntakeRequestDetail
          request={selectedRequest}
          open={detailOpen}
          onOpenChange={setDetailOpen}
          onUpdated={handleRequestUpdated}
          onDeleted={() => handleRequestDeleted(selectedRequest.id)}
        />
      )}
    </div>
  );
}
