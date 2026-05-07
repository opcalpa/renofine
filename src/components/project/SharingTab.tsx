import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Eye, Users } from "lucide-react";
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
import { InstructionsView } from "./InstructionsView";

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

interface ShareEntry {
  id: string;
  profileId: string;
  displayName: string;
  detail: string | null;
  source: "share" | "invitation";
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

  // Fetch contractor shares + pending invitations for the dropdown
  const { data: shareEntries } = useQuery({
    queryKey: ["sharing-entries", projectId],
    enabled: !isClient,
    queryFn: async () => {
      const [sharesRes, invitesRes] = await Promise.all([
        supabase
          .from("project_shares")
          .select("id, shared_with_user_id, role_type, display_name, display_email, contractor_category, company")
          .eq("project_id", projectId),
        supabase
          .from("project_invitations")
          .select("id, invited_email, invited_name, contractor_role, role_type, status")
          .eq("project_id", projectId)
          .eq("status", "pending"),
      ]);

      // Exclude clients and co-owners — they don't get instruction views
      const excludedRoleTypes = new Set(["client", "co_owner", "planning_contributor"]);

      const entries: ShareEntry[] = [];
      const seenProfileIds = new Set<string>();

      // Active shares first
      for (const s of sharesRes.data || []) {
        if (!s.shared_with_user_id) continue;
        if (s.role_type && excludedRoleTypes.has(s.role_type)) continue;
        seenProfileIds.add(s.shared_with_user_id);
        entries.push({
          id: s.id,
          profileId: s.shared_with_user_id,
          displayName: s.display_name || s.display_email || "",
          detail: s.contractor_category || s.company || null,
          source: "share",
        });
      }

      // Pending invitations (not yet accepted)
      for (const inv of invitesRes.data || []) {
        if (inv.role_type && excludedRoleTypes.has(inv.role_type)) continue;
        entries.push({
          id: inv.id,
          profileId: `invite_${inv.id}`,
          displayName: inv.invited_name || inv.invited_email || "",
          detail: inv.contractor_role || null,
          source: "invitation",
        });
      }

      return entries;
    },
    staleTime: 60_000,
  });

  // Clients see CustomerViewTab directly — no dropdown
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

  const activeShares = shareEntries?.filter((e) => e.source === "share") || [];
  const pendingInvites = shareEntries?.filter((e) => e.source === "invitation") || [];
  const selectedEntry = activeShares.find((e) => e.profileId === selectedView);

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

            {activeShares.length > 0 && (
              <>
                <SelectSeparator />
                {activeShares.map((e) => (
                  <SelectItem key={e.profileId} value={e.profileId}>
                    {e.displayName || t("common.unnamed", "Unnamed")}
                    {e.detail ? ` (${e.detail})` : ""}
                  </SelectItem>
                ))}
              </>
            )}

            {pendingInvites.length > 0 && (
              <>
                <SelectSeparator />
                <div className="px-2 py-1.5 text-xs text-muted-foreground flex items-center gap-1.5">
                  <Users className="h-3 w-3" />
                  {t("sharing.pendingInvites", "Pending invitations")}
                </div>
                {pendingInvites.map((e) => (
                  <SelectItem key={e.profileId} value={e.profileId} disabled>
                    {e.displayName || t("common.unnamed", "Unnamed")}
                    {e.detail ? ` (${e.detail})` : ""}
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
      ) : selectedEntry ? (
        <InstructionsView
          projectId={projectId}
          profileId={selectedEntry.profileId}
          displayName={selectedEntry.displayName}
          contractorCategory={selectedEntry.detail}
        />
      ) : null}
    </div>
  );
}
