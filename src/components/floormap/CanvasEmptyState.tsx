/**
 * CanvasEmptyState
 *
 * Shown when the current plan has no shapes.
 * Disappears the moment anything is added to the canvas.
 *
 * Personalised to: plan name, builder vs. homeowner role.
 */

import { useRef } from "react";
import { Home, ImagePlus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useFloorMapStore } from "./store";

interface CanvasEmptyStateProps {
  /** Switches the copy / CTAs to homeowner-mode */
  simplified?: boolean;
  /** Trigger the AI import dialog (fires the CustomEvent) */
  onAIImport: () => void;
  /** Trigger the room draw tool */
  onDrawRoom: () => void;
  /** Called when the user picks a file; the file has already been validated */
  onImageFile: (file: File) => void;
}

export function CanvasEmptyState({
  simplified,
  onAIImport,
  onDrawRoom,
  onImageFile,
}: CanvasEmptyStateProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plans = useFloorMapStore((s) => s.plans);
  const currentPlanId = useFloorMapStore((s) => s.currentPlanId);
  const plan = plans.find((p) => p.id === currentPlanId);
  const planName = plan?.name;

  const heading = simplified
    ? "Kom igång med din planritning"
    : planName
    ? `Kom igång med "${planName}"`
    : "Kom igång med din planlösning";

  const subheading = simplified
    ? "Ladda upp en bild på din bostad eller låt AI tolka din ritning"
    : "Importera ett underlag, tolka med AI, eller börja rita direkt";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Vänligen välj en bildfil"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Max 10MB per bild"); return; }
    onImageFile(file);
    e.target.value = "";
  };

  return (
    // pb-36 on mobile shifts the card stack up, clear of the fixed zoom pill
    // (bottom-24) that otherwise overlaps the bottom card + hint text
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-10 pb-36 sm:pb-0">
      <div className="pointer-events-auto flex flex-col items-center gap-5 max-w-sm w-full mx-4">
        {/* Heading */}
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-700">{heading}</h2>
          <p className="text-sm text-gray-400 mt-1">{subheading}</p>
        </div>

        {/* Action cards */}
        <div className="flex flex-col gap-2 w-full">
          {/* Image import — label wraps the input so click is always trusted */}
          <label className="group cursor-pointer">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white/90 backdrop-blur-sm px-4 py-3.5 shadow-sm group-hover:border-blue-300 group-hover:bg-blue-50/60 transition-all">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                <ImagePlus className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {simplified ? "Ladda upp bild på bostaden" : "Importera planlösning"}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {simplified
                    ? "JPG, PNG — vi lägger den som bakgrund"
                    : "JPG, PNG — tracka över befintlig ritning"}
                </p>
              </div>
            </div>
          </label>

          {/* AI import */}
          <button
            onClick={onAIImport}
            className="group flex items-center gap-4 rounded-xl border border-gray-200 bg-white/90 backdrop-blur-sm px-4 py-3.5 shadow-sm hover:border-purple-300 hover:bg-purple-50/60 transition-all text-left w-full"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-100 text-purple-600">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">
                {simplified ? "AI tolkar din ritning" : "AI-tolka skannad ritning"}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {simplified
                  ? "Ta ett foto av ritningen — AI ritar upp rummen"
                  : "Ladda upp PDF eller foto — AI konverterar till vektorer"}
              </p>
            </div>
          </button>

          {/* Draw room */}
          <button
            onClick={onDrawRoom}
            className="group flex items-center gap-4 rounded-xl border border-gray-200 bg-white/90 backdrop-blur-sm px-4 py-3.5 shadow-sm hover:border-green-300 hover:bg-green-50/60 transition-all text-left w-full"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-600">
              <Home className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">
                {simplified ? "Rita ett rum" : "Rita planlösning från grunden"}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {simplified
                  ? "Klicka och dra för att definiera ett rum"
                  : "Börja med väggar och rum — bygg upp i din takt"}
              </p>
            </div>
          </button>
        </div>

        {/* Soft hint */}
        <p className="text-xs text-gray-300 text-center">
          {simplified
            ? "Allt du ritar delas automatiskt med din hantverkare"
            : "Du kan alltid byta metod — ritverktyg finns i vänster panel"}
        </p>
      </div>
    </div>
  );
}
