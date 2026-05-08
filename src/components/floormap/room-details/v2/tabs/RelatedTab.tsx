import { useTranslation } from "react-i18next";
import { RelatedTasksSection } from "../../sections/RelatedTasksSection";
import { RelatedPurchaseOrdersSection } from "../../sections/RelatedPurchaseOrdersSection";

interface RelatedTabProps {
  roomId: string;
  projectId: string;
}

export function RelatedTab({ roomId, projectId }: RelatedTabProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-5 px-6 py-5">
      <div>
        <span className="rf-section-label mb-2 block">{t("rooms.tasks", "Arbeten")}</span>
        <RelatedTasksSection roomId={roomId} projectId={projectId} />
      </div>
      <div>
        <span className="rf-section-label mb-2 block">{t("rooms.purchases", "Inköp")}</span>
        <RelatedPurchaseOrdersSection roomId={roomId} projectId={projectId} />
      </div>
    </div>
  );
}
