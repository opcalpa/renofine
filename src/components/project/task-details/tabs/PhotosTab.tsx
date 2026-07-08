import { EntityPhotoGallery } from "@/components/shared/EntityPhotoGallery";

interface PhotosTabProps {
  taskId: string;
  projectId: string;
  onPhotoCount: (count: number) => void;
}

export function PhotosTab({ taskId, projectId, onPhotoCount }: PhotosTabProps) {
  return (
    <div className="px-6 py-5">
      <EntityPhotoGallery entityId={taskId} entityType="task" projectId={projectId} onPhotoCount={onPhotoCount} />
    </div>
  );
}
