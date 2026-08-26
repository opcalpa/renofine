import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { X, ChevronRight, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "guest_planning_tour_completed";

interface PlanningTourProps {
  /**
   * Whether the guest is ready for a tutorial. It used to auto-start the moment
   * a guest landed in the project, which put a six-step walkthrough of an empty
   * task table on top of the renovation plan they had just been shown — and in
   * three of five recorded guest journeys that tour was the last thing they did
   * before leaving. A tour answers "how do I add more of this?", which is only
   * a question once someone has added one. So the caller decides when.
   */
  enabled?: boolean;
}

interface TourStep {
  target: string; // data-tour attribute value
  titleKey: string;
  descriptionKey: string;
  placement: "top" | "bottom" | "left" | "right";
}

const TOUR_STEPS: TourStep[] = [
  {
    target: "task-table",
    titleKey: "planningTour.taskTable.title",
    descriptionKey: "planningTour.taskTable.description",
    placement: "bottom",
  },
  {
    target: "add-task",
    titleKey: "planningTour.addTask.title",
    descriptionKey: "planningTour.addTask.description",
    placement: "top",
  },
  {
    target: "room-table",
    titleKey: "planningTour.roomTable.title",
    descriptionKey: "planningTour.roomTable.description",
    placement: "bottom",
  },
  {
    target: "add-room",
    titleKey: "planningTour.addRoom.title",
    descriptionKey: "planningTour.addRoom.description",
    placement: "top",
  },
  {
    target: "task-columns",
    titleKey: "planningTour.columns.title",
    descriptionKey: "planningTour.columns.description",
    placement: "top",
  },
  {
    target: "signup-nudge",
    titleKey: "planningTour.signUp.title",
    descriptionKey: "planningTour.signUp.description",
    placement: "top",
  },
];

interface TooltipPosition {
  top: number;
  left: number;
  arrowSide: "top" | "bottom" | "left" | "right";
}

function getTooltipPosition(
  targetRect: DOMRect,
  placement: TourStep["placement"],
  tooltipWidth: number,
  tooltipHeight: number
): TooltipPosition {
  const gap = 12;
  let top = 0;
  let left = 0;

  switch (placement) {
    case "bottom":
      top = targetRect.bottom + gap;
      left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
      break;
    case "top":
      top = targetRect.top - tooltipHeight - gap;
      left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
      break;
    case "left":
      top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
      left = targetRect.left - tooltipWidth - gap;
      break;
    case "right":
      top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
      left = targetRect.right + gap;
      break;
  }

  // Clamp to viewport
  left = Math.max(12, Math.min(left, window.innerWidth - tooltipWidth - 12));
  top = Math.max(12, Math.min(top, window.innerHeight - tooltipHeight - 12));

  const arrowSide =
    placement === "bottom" ? "top" : placement === "top" ? "bottom" : placement === "left" ? "right" : "left";

  return { top, left, arrowSide };
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function PlanningTour({ enabled = true }: PlanningTourProps = {}) {
  const { t } = useTranslation();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Start for first-time guests, but only once the caller says they are ready.
  useEffect(() => {
    if (!enabled) return;
    const completed = localStorage.getItem(STORAGE_KEY) === "true";
    if (!completed) {
      // Small delay so DOM has rendered
      const timer = setTimeout(() => setActive(true), 800);
      return () => clearTimeout(timer);
    }
  }, [enabled]);

  const currentStep = TOUR_STEPS[step];

  const positionTooltip = useCallback(() => {
    if (!currentStep || !active) return;

    const el = document.querySelector(`[data-tour="${currentStep.target}"]`);
    if (!el) {
      // Skip missing step
      if (step < TOUR_STEPS.length - 1) {
        setStep((s) => s + 1);
      } else {
        finish();
      }
      return;
    }

    const rect = el.getBoundingClientRect();
    const padding = 6;

    setSpotlight({
      top: rect.top - padding,
      left: rect.left - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    });

    // Scroll element into view
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });

    // Wait a frame for tooltip to render, then measure
    requestAnimationFrame(() => {
      const tooltipEl = tooltipRef.current;
      const tw = tooltipEl?.offsetWidth ?? 320;
      const th = tooltipEl?.offsetHeight ?? 120;
      setTooltipPos(getTooltipPosition(rect, currentStep.placement, tw, th));
    });
  }, [currentStep, step, active]);

  useEffect(() => {
    if (!active) return;
    positionTooltip();

    const handleResize = () => positionTooltip();
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
    };
  }, [active, step, positionTooltip]);

  const finish = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "true");
    setActive(false);
  }, []);

  const next = useCallback(() => {
    if (step < TOUR_STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      finish();
    }
  }, [step, finish]);

  const prev = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
  }, [step]);

  if (!active || !currentStep) return null;

  return (
    <div className="fixed inset-0 z-[9999]" role="dialog" aria-modal="true">
      {/* Overlay with spotlight cutout using CSS clip-path */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <mask id="tour-spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {spotlight && (
              <rect
                x={spotlight.left}
                y={spotlight.top}
                width={spotlight.width}
                height={spotlight.height}
                rx="8"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.5)"
          mask="url(#tour-spotlight-mask)"
        />
      </svg>

      {/* Spotlight ring */}
      {spotlight && (
        <div
          className="absolute rounded-lg ring-2 ring-primary ring-offset-2 pointer-events-none transition-all duration-300 ease-out"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
          }}
        />
      )}

      {/* Click overlay (dismiss on click outside) */}
      <div className="absolute inset-0" onClick={finish} />

      {/* Tooltip */}
      {tooltipPos && (
        <div
          ref={tooltipRef}
          className={cn(
            "absolute z-10 w-[320px] bg-background border rounded-xl shadow-xl p-4 transition-all duration-300 ease-out"
          )}
          style={{ top: tooltipPos.top, left: tooltipPos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Arrow */}
          <div
            className={cn(
              "absolute w-3 h-3 bg-background border rotate-45",
              tooltipPos.arrowSide === "top" && "-top-1.5 left-1/2 -translate-x-1/2 border-b-0 border-r-0",
              tooltipPos.arrowSide === "bottom" && "-bottom-1.5 left-1/2 -translate-x-1/2 border-t-0 border-l-0",
              tooltipPos.arrowSide === "left" && "-left-1.5 top-1/2 -translate-y-1/2 border-t-0 border-r-0",
              tooltipPos.arrowSide === "right" && "-right-1.5 top-1/2 -translate-y-1/2 border-b-0 border-l-0"
            )}
          />

          {/* Close button */}
          <button
            className="absolute top-2 right-2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            onClick={finish}
          >
            <X className="h-4 w-4" />
          </button>

          {/* Content */}
          <div className="pr-6">
            <p className="font-semibold text-sm mb-1">
              {t(currentStep.titleKey)}
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t(currentStep.descriptionKey)}
            </p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t">
            <span className="text-xs text-muted-foreground">
              {step + 1} / {TOUR_STEPS.length}
            </span>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={prev}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                  {t("common.back", "Back")}
                </Button>
              )}
              <Button size="sm" className="h-7 text-xs gap-1" onClick={next}>
                {step < TOUR_STEPS.length - 1 ? (
                  <>
                    {t("common.next", "Next")}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </>
                ) : (
                  t("planningTour.finish", "Get started!")
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
