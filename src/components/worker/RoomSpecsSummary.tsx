import { useTranslation } from "react-i18next";
import { Paintbrush, DoorOpen, Layers } from "lucide-react";

interface WallSpec {
  treatments?: string[];
  main_color?: string;
  has_accent_wall?: boolean;
  accent_wall_color?: string;
}

interface FloorSpec {
  material?: string;
  specification?: string;
  treatments?: string[];
  skirting_type?: string;
  skirting_color?: string;
}

interface CeilingSpec {
  material?: string;
  color?: string;
  molding_type?: string;
}

interface JoinerySpec {
  door_type?: string;
  trim_type?: string;
}

interface RoomSpecsSummaryProps {
  wallSpec: WallSpec | null;
  floorSpec: FloorSpec | null;
  ceilingSpec: CeilingSpec | null;
  joinerySpec: JoinerySpec | null;
}

interface SpecLine {
  icon: React.ReactNode;
  label: string;
  value: string;
}

export function RoomSpecsSummary({ wallSpec, floorSpec, ceilingSpec, joinerySpec }: RoomSpecsSummaryProps) {
  const { t } = useTranslation();
  const lines: SpecLine[] = [];

  // Wall treatments
  if (wallSpec?.treatments?.length) {
    lines.push({
      icon: <Paintbrush className="h-3.5 w-3.5" />,
      label: t("worker.walls", "Walls"),
      value: wallSpec.treatments.map((tr) => t(`treatments.${tr}`, tr)).join(", "),
    });
  }

  // Floor material
  if (floorSpec?.material) {
    const parts = [t(`materials.${floorSpec.material}`, floorSpec.material)];
    if (floorSpec.specification) parts.push(floorSpec.specification);
    lines.push({
      icon: <Layers className="h-3.5 w-3.5" />,
      label: t("worker.floor", "Floor"),
      value: parts.join(" — "),
    });
  }

  // Ceiling material and/or molding — a taklist without a material still
  // matters to the worker (the ceiling colour is shown separately as a swatch).
  if (ceilingSpec?.material || ceilingSpec?.molding_type) {
    const parts: string[] = [];
    if (ceilingSpec.material) parts.push(t(`materials.${ceilingSpec.material}`, ceilingSpec.material));
    if (ceilingSpec.molding_type) parts.push(t(`materials.${ceilingSpec.molding_type}`, ceilingSpec.molding_type));
    lines.push({
      icon: <Layers className="h-3.5 w-3.5" />,
      label: t("worker.ceiling", "Ceiling"),
      value: parts.join(", "),
    });
  }

  // Door/trim
  if (joinerySpec?.door_type || joinerySpec?.trim_type) {
    const parts: string[] = [];
    if (joinerySpec.door_type) parts.push(t(`materials.${joinerySpec.door_type}`, joinerySpec.door_type));
    if (joinerySpec.trim_type) parts.push(t(`materials.${joinerySpec.trim_type}`, joinerySpec.trim_type));
    lines.push({
      icon: <DoorOpen className="h-3.5 w-3.5" />,
      label: t("worker.doorsAndTrim", "Doors/Trim"),
      value: parts.join(", "),
    });
  }

  // Skirting
  if (floorSpec?.skirting_type) {
    const parts = [t(`materials.${floorSpec.skirting_type}`, floorSpec.skirting_type)];
    if (floorSpec.skirting_color) parts.push(floorSpec.skirting_color);
    lines.push({
      icon: <Layers className="h-3.5 w-3.5" />,
      label: t("worker.skirting", "Skirting"),
      value: parts.join(" — "),
    });
  }

  if (lines.length === 0) return null;

  return (
    <div className="space-y-1">
      {lines.map((line, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground shrink-0">{line.icon}</span>
          <span className="text-muted-foreground shrink-0 w-16 text-xs">{line.label}</span>
          <span className="text-foreground/90 truncate">{line.value}</span>
        </div>
      ))}
    </div>
  );
}
