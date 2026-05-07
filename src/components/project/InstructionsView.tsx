import { useTranslation } from "react-i18next";
import { HardHat, Loader2 } from "lucide-react";
import { useRoomInstructionsData } from "@/components/room-instructions/useRoomInstructionsData";
import { SwipeableRoomInstructions } from "@/components/room-instructions/SwipeableRoomInstructions";

interface InstructionsViewProps {
  projectId: string;
  profileId: string;
  displayName: string;
  contractorCategory?: string | null;
}

export function InstructionsView({
  projectId,
  profileId,
  displayName,
  contractorCategory,
}: InstructionsViewProps) {
  const { t } = useTranslation();
  const { rooms, floorPlanShapes, isLoading } = useRoomInstructionsData(projectId, profileId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
          <HardHat className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">
            {t("sharing.instructionsFor", { name: displayName })}
          </h2>
          {contractorCategory && (
            <p className="text-sm text-muted-foreground">{contractorCategory}</p>
          )}
        </div>
      </div>

      {/* Room instructions (read-only preview) */}
      {rooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <HardHat className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            {t("sharing.noAssignedTasks", "No tasks assigned to this person")}
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden min-h-[400px]">
          <SwipeableRoomInstructions
            rooms={rooms}
            floorPlanShapes={floorPlanShapes}
            canToggleChecklist={false}
            canUploadPhotos={false}
          />
        </div>
      )}
    </div>
  );
}
