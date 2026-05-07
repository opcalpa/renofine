import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
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

  // Fetch contractor shares for the dropdown
  const { data: contractors } = useQuery({
    queryKey: ["sharing-contractors", projectId],
    enabled: !isClient,
    queryFn: async () => {
      const { data } = await supabase
        .from("project_shares")
        .select("id, shared_with_user_id, display_name, display_email, contractor_category, company")
        .eq("project_id", projectId)
        .eq("role_type", "contractor");
      return data || [];
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

  const selectedContractor = contractors?.find((c) => c.shared_with_user_id === selectedView);
  const hasContractors = contractors && contractors.length > 0;

  return (
    <div className="space-y-6">
      {/* View selector */}
      {hasContractors && (
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
              {contractors.map((c) => (
                <SelectItem key={c.shared_with_user_id} value={c.shared_with_user_id}>
                  {c.display_name || c.display_email || t("common.unnamed", "Unnamed")}
                  {c.contractor_category ? ` (${c.contractor_category})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

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
      ) : selectedContractor ? (
        <InstructionsView
          projectId={projectId}
          profileId={selectedContractor.shared_with_user_id}
          displayName={selectedContractor.display_name || selectedContractor.display_email || ""}
          contractorCategory={selectedContractor.contractor_category}
        />
      ) : null}
    </div>
  );
}
