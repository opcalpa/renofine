import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { useFloorMapStore } from "./store";
import { calculateFitToContent } from "./canvas/utils";

export const ZoomControls = () => {
  const { t } = useTranslation();
  const { viewState, setViewState } = useFloorMapStore();

  const handleZoomIn = () => {
    const newZoom = Math.min(viewState.zoom * 1.2, 5);
    setViewState({ zoom: newZoom });
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(viewState.zoom / 1.2, 0.2);
    setViewState({ zoom: newZoom });
  };

  const handleResetView = () => {
    const shapes = useFloorMapStore.getState().shapes;
    const fitView = calculateFitToContent(shapes, window.innerWidth, window.innerHeight - 70);
    if (fitView) {
      setViewState(fitView);
    } else {
      setViewState({ zoom: 1, panX: 0, panY: 0 });
    }
  };

  return (
    <div className="fixed bottom-24 right-4 z-30 flex gap-2 bg-background/95 backdrop-blur-sm rounded-lg p-2 shadow-lg border border-border">
      <Button
        variant="ghost"
        size="icon"
        onClick={handleZoomOut}
        title={t('controls.zoomOutShortcut')}
        className="h-8 w-8 hover:bg-accent transition-colors"
      >
        <ZoomOut className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleResetView}
        title={t('controls.resetViewShortcut')}
        className="h-8 w-8 hover:bg-accent transition-colors"
      >
        <Maximize2 className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleZoomIn}
        title={t('controls.zoomInShortcut')}
        className="h-8 w-8 hover:bg-accent transition-colors"
      >
        <ZoomIn className="h-4 w-4" />
      </Button>
      <div className="flex items-center px-2 text-xs font-mono text-muted-foreground min-w-[3rem] justify-center">
        {Math.round(viewState.zoom * 100)}%
      </div>
    </div>
  );
};
