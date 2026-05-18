import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, Edit3, Plus, UserPlus, Ban } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface FeatureAccess {
  customerView: "none" | "view";
  timeline: "none" | "view" | "edit";
  tasks: "none" | "view" | "edit";
  tasksScope: "all" | "assigned";
  spacePlanner: "none" | "view" | "edit";
  purchases: "none" | "view" | "create" | "edit";
  purchasesScope: "all" | "assigned";
  overview: "none" | "view" | "edit";
  teams: "none" | "view" | "invite";
  budget: "none" | "view" | "edit";
  files: "none" | "view" | "upload" | "edit";
}

export interface FeatureConfig {
  key: keyof FeatureAccess;
  labelKey: string;
  options: string[];
  scope?: {
    key: keyof FeatureAccess;
    labelKey: string;
    showWhen: string[];
    options: { value: string; labelKey: string }[];
  };
}

export const OPTION_ICONS: Record<string, LucideIcon> = {
  none: Ban,
  view: Eye,
  edit: Edit3,
  create: Plus,
  upload: Plus,
  invite: UserPlus,
};

export const OPTION_LABEL_KEYS: Record<string, string> = {
  none: "roles.accessNone",
  view: "roles.accessView",
  edit: "roles.accessEdit",
  create: "roles.accessCreate",
  upload: "roles.accessUpload",
  invite: "roles.accessInvite",
};

export const FEATURES: FeatureConfig[] = [
  { key: "customerView", labelKey: "roles.featureCustomerView", options: ["none", "view"] },
  { key: "overview", labelKey: "roles.featureOverview", options: ["none", "view", "edit"] },
  { key: "timeline", labelKey: "roles.featureTimeline", options: ["none", "view", "edit"] },
  {
    key: "tasks",
    labelKey: "roles.featureTasks",
    options: ["none", "view", "edit"],
    scope: {
      key: "tasksScope",
      labelKey: "roles.taskScope",
      showWhen: ["view", "edit"],
      options: [
        { value: "all", labelKey: "roles.allTasks" },
        { value: "assigned", labelKey: "roles.assignedOnly" },
      ],
    },
  },
  { key: "spacePlanner", labelKey: "roles.featureSpacePlanner", options: ["none", "view", "edit"] },
  {
    key: "purchases",
    labelKey: "roles.featurePurchaseOrders",
    options: ["none", "view", "create", "edit"],
    scope: {
      key: "purchasesScope",
      labelKey: "roles.orderScope",
      showWhen: ["view", "create", "edit"],
      options: [
        { value: "all", labelKey: "roles.allOrders" },
        { value: "assigned", labelKey: "roles.assignedCreatedOnly" },
      ],
    },
  },
  { key: "budget", labelKey: "roles.featureBudget", options: ["none", "view", "edit"] },
  { key: "files", labelKey: "roles.featureFiles", options: ["none", "view", "upload", "edit"] },
  { key: "teams", labelKey: "roles.featureTeamManagement", options: ["none", "view", "invite"] },
];

interface FeatureAccessEditorProps {
  featureAccess: FeatureAccess;
  onChange: (updates: Partial<FeatureAccess>) => void;
  idPrefix: string;
  readOnly?: boolean;
}

export function FeatureAccessEditor({ featureAccess, onChange, readOnly }: FeatureAccessEditorProps) {
  const { t } = useTranslation();

  return (
    <div className="divide-y">
      {FEATURES.map((feature) => {
        const currentValue = featureAccess[feature.key];
        const Icon = OPTION_ICONS[currentValue] || Ban;
        const isNone = currentValue === "none";

        return (
          <div key={feature.key} className="py-2 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-3">
              <span className={`text-sm ${isNone ? "text-muted-foreground" : "text-foreground font-medium"}`}>
                {t(feature.labelKey)}
              </span>
              {readOnly ? (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Icon className="h-3 w-3" />
                  {t(OPTION_LABEL_KEYS[currentValue])}
                </span>
              ) : (
                <Select
                  value={currentValue}
                  onValueChange={(value) => onChange({ [feature.key]: value } as Partial<FeatureAccess>)}
                >
                  <SelectTrigger className={`h-7 w-[110px] text-xs ${isNone ? "text-muted-foreground" : ""}`}>
                    <div className="flex items-center gap-1.5">
                      <Icon className="h-3 w-3" />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {feature.options.map((opt) => {
                      const OptIcon = OPTION_ICONS[opt] || Ban;
                      return (
                        <SelectItem key={opt} value={opt}>
                          <span className="flex items-center gap-1.5">
                            <OptIcon className="h-3 w-3" />
                            {t(OPTION_LABEL_KEYS[opt])}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Scope sub-option — shown in both edit and read-only modes
                so the team table reveals own/assigned vs all, not just level. */}
            {feature.scope && feature.scope.showWhen.includes(currentValue) && (
              <div className="ml-4 mt-1 flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">{t(feature.scope.labelKey)}:</span>
                {readOnly ? (
                  <span className="text-[11px] text-foreground">
                    {t(
                      feature.scope.options.find(
                        (o) => o.value === featureAccess[feature.scope!.key],
                      )?.labelKey ?? feature.scope.options[0].labelKey,
                    )}
                  </span>
                ) : (
                  <Select
                    value={featureAccess[feature.scope.key]}
                    onValueChange={(value) => onChange({ [feature.scope!.key]: value } as Partial<FeatureAccess>)}
                  >
                    <SelectTrigger className="h-6 w-auto text-[11px] px-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {feature.scope.options.map((scopeOpt) => (
                        <SelectItem key={scopeOpt.value} value={scopeOpt.value}>
                          {t(scopeOpt.labelKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
