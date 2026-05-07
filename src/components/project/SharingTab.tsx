import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Eye, Wrench } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import CustomerViewTab from "./CustomerViewTab";
import { WorkerInstructionsView } from "./WorkerInstructionsView";

interface SharingTabProps {
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
  isClient?: boolean;
}

interface WorkerEntry {
  id: string;
  token: string;
  displayName: string;
  taskCount: number;
}

const CUSTOMER_VIEW_KEY = "__customer__";

export default function SharingTab({
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
  isClient,
}: SharingTabProps) {
  const { t } = useTranslation();
  const [selectedView, setSelectedView] = useState(CUSTOMER_VIEW_KEY);

  // Fetch active worker tokens for the dropdown
  const { data: workers } = useQuery({
    queryKey: ["sharing-workers", projectId],
    enabled: !isClient,
    queryFn: async () => {
      const { data } = await supabase
        .from("worker_access_tokens")
        .select("id, token, worker_name, assigned_task_ids, expires_at, revoked_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      const entries: WorkerEntry[] = [];
      for (const wt of data || []) {
        const isExpired = new Date(wt.expires_at) < new Date();
        if (wt.revoked_at || isExpired) continue;
        entries.push({
          id: wt.id,
          token: wt.token,
          displayName: wt.worker_name,
          taskCount: wt.assigned_task_ids?.length || 0,
        });
      }
      return entries;
    },
    staleTime: 60_000,
  });

  // Clients see CustomerViewTab directly
  if (isClient) {
    return (
      <CustomerViewTab
        projectId={projectId}
        projectName={projectName}
        projectStartDate={projectStartDate}
        projectFinishDate={projectFinishDate}
        currency={currency}
        userType={userType}
        address={address}
        description={description}
        status={status}
        totalBudget={totalBudget}
        coverImageUrl={coverImageUrl}
      />
    );
  }

  const selectedWorker = workers?.find((w) => w.id === selectedView);

  return (
    <div className="space-y-6">
      {/* View selector — always visible for owners */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap">
          <Eye className="h-4 w-4" />
          {t("sharing.viewAs", "View as")}
        </div>
        <Select value={selectedView} onValueChange={setSelectedView}>
          <SelectTrigger className="w-[280px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={CUSTOMER_VIEW_KEY}>
              {t("sharing.customerView", "Client view")}
            </SelectItem>

            {workers && workers.length > 0 && (
              <>
                <SelectSeparator />
                <div className="px-2 py-1.5 text-xs text-muted-foreground flex items-center gap-1.5">
                  <Wrench className="h-3 w-3" />
                  {t("team.roles.worker", "Workers")}
                </div>
                {workers.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.displayName}
                    <span className="text-muted-foreground ml-1">
                      ({w.taskCount} {t("common.tasks", "tasks")})
                    </span>
                  </SelectItem>
                ))}
              </>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Render selected view */}
      {selectedView === CUSTOMER_VIEW_KEY ? (
        <CustomerViewTab
          projectId={projectId}
          projectName={projectName}
          projectStartDate={projectStartDate}
          projectFinishDate={projectFinishDate}
          currency={currency}
          userType={userType}
          address={address}
          description={description}
          status={status}
          totalBudget={totalBudget}
          coverImageUrl={coverImageUrl}
        />
      ) : selectedWorker ? (
        <WorkerInstructionsView
          projectId={projectId}
          workerToken={selectedWorker.token}
          displayName={selectedWorker.displayName}
        />
      ) : null}
    </div>
  );
}
