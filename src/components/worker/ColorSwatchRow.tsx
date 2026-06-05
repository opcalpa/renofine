import { useTranslation } from "react-i18next";

interface WallSpec {
  main_color?: string;
  accent_wall_color?: string;
  has_accent_wall?: boolean;
  treatments?: string[];
}

interface CeilingSpec {
  color?: string;
  material?: string;
}

interface FloorSpec {
  material?: string;
  skirting_color?: string;
}

interface ColorSwatchRowProps {
  wallSpec: WallSpec | null;
  ceilingSpec: CeilingSpec | null;
  floorSpec: FloorSpec | null;
}

interface SwatchItem {
  label: string;
  color: string;
}

/** Detect if a string can be used as CSS backgroundColor */
function isCssColor(val: string): boolean {
  if (/^#([0-9a-f]{3,8})$/i.test(val)) return true;
  if (/^(rgb|hsl)/i.test(val)) return true;
  // Common CSS named colors used in renovation context
  const namedColors = new Set(["white", "black", "gray", "grey", "red", "blue", "green", "yellow", "brown", "beige", "cream", "ivory",
    "vit", "svart", "grå", "röd", "blå", "grön", "gul", "brun", "бiлий", "білий", "чорний"]);
  return namedColors.has(val.toLowerCase().trim());
}

export function ColorSwatchRow({ wallSpec, ceilingSpec, floorSpec }: ColorSwatchRowProps) {
  const { t } = useTranslation();

  const swatches: SwatchItem[] = [];

  if (wallSpec?.main_color) {
    swatches.push({ label: t("worker.walls", "Walls"), color: wallSpec.main_color });
  }
  if (wallSpec?.has_accent_wall && wallSpec?.accent_wall_color) {
    swatches.push({ label: t("worker.accentWall", "Accent wall"), color: wallSpec.accent_wall_color });
  }
  if (ceilingSpec?.color) {
    swatches.push({ label: t("worker.ceiling", "Ceiling"), color: ceilingSpec.color });
  }
  if (floorSpec?.skirting_color) {
    swatches.push({ label: t("worker.skirting", "Skirting"), color: floorSpec.skirting_color });
  }

  if (swatches.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {swatches.map((s, i) => {
        const hex = isCssColor(s.color);
        return (
          <div
            key={i}
            className="flex items-center gap-2 rounded-lg border border-[var(--rf-hairline)] bg-[var(--rf-surface)] px-2.5 py-1.5"
          >
            {hex ? (
              <div
                className="h-6 w-6 rounded-md border border-[var(--rf-hairline)] shadow-sm shrink-0"
                style={{ backgroundColor: s.color }}
              />
            ) : (
              <div className="h-6 w-6 rounded-md bg-[var(--rf-sand)] shrink-0 flex items-center justify-center text-[10px]">
                🎨
              </div>
            )}
            <div className="min-w-0">
              <p className="rf-section-label leading-none">{s.label}</p>
              {/* Only surface a human-readable value (material/named colour);
                  a raw hex is noise for the worker — the swatch already shows it. */}
              {!hex && (
                <p className="text-xs font-medium text-[var(--rf-ink)] truncate max-w-[140px]">{s.color}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
