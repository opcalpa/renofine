import { useTranslation } from "react-i18next";
import { Camera } from "lucide-react";
import type { SitePhoto } from "./useClientViewData";

interface SitePhotosGridProps {
  photos: SitePhoto[];
}

export function SitePhotosGrid({ photos }: SitePhotosGridProps) {
  const { t } = useTranslation();

  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground mb-3">
        {t("customerView.sitePhotos.label", "Bilder fr\u00e5n platsen")}
      </div>
      {photos.length === 0 ? (
        <div className="flex flex-col items-center justify-center aspect-[4/3] bg-muted/30 rounded-lg border border-dashed border-border">
          <Camera className="h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-xs text-muted-foreground">
            {t("customerView.sitePhotos.noPhotos", "Inga bilder \u00e4nnu.")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {photos.map((photo) => (
            <div key={photo.id} className="relative aspect-[4/3] rounded-lg overflow-hidden bg-muted">
              <img
                src={photo.url}
                alt={photo.caption || ""}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              {photo.caption && (
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-4">
                  <span className="text-[11px] text-white/90 line-clamp-1">{photo.caption}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
