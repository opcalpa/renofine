import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, PiggyBank, MessageSquare, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import ProjectTimeline from "@/components/project/ProjectTimeline";
import { ProjectDocumentsCard } from "@/components/project/overview/ProjectDocumentsCard";
import { ProjectChatSection } from "@/components/project/overview/ProjectChatSection";

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

export default function CustomerViewTab({
  projectId,
  projectName,
  projectStartDate,
  projectFinishDate,
  currency,
  userType,
}: CustomerViewTabProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <CollapsibleSection
        icon={Clock}
        title={t("customerView.timeline")}
        description={t("customerView.timelineDescription")}
      >
        <ProjectTimeline
          projectId={projectId}
          projectName={projectName}
          projectStartDate={projectStartDate}
          projectFinishDate={projectFinishDate}
          currency={currency}
          userType={userType}
        />
      </CollapsibleSection>

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
    </div>
  );
}
