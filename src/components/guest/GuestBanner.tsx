/**
 * GuestBanner Component
 * Shows a slim banner for guest users indicating local storage mode with login CTA.
 * Warns via toast when storage usage reaches 90%.
 */

import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { HardDrive } from "lucide-react";
import { useGuestMode } from "@/hooks/useGuestMode";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface GuestBannerProps {
  className?: string;
  compact?: boolean;
}

export function GuestBanner({ className }: GuestBannerProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { storageUsage, refreshStorageUsage } = useGuestMode();
  const hasWarnedRef = useRef(false);

  // Refresh storage usage on mount
  useEffect(() => {
    refreshStorageUsage();
  }, [refreshStorageUsage]);

  // Warn once via toast when storage reaches 90%
  useEffect(() => {
    if (storageUsage.percentage >= 90 && !hasWarnedRef.current) {
      hasWarnedRef.current = true;
      toast.warning(
        t('guest.limitWarning', "You're approaching the storage limit. Sign in for more space."),
        { duration: 8000 }
      );
    }
  }, [storageUsage.percentage, t]);

  return (
    <div
      className={cn(
        "bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-4 py-2 flex items-center justify-center gap-2 text-sm",
        className
      )}
    >
      {/* min-w-0: without it this flex item refuses to shrink and the truncate
          never kicks in → the whole row overflows the mobile viewport. */}
      <div className="flex min-w-0 items-center gap-2 text-amber-800 dark:text-amber-200">
        <HardDrive className="h-4 w-4 shrink-0" />
        <span className="truncate">{t('guest.banner', 'Your project is saved locally. Sign in to save permanently.')}</span>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 h-7 text-xs border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900"
        onClick={() => navigate("/auth")}
      >
        {t('guest.bannerAction', 'Sign in')}
      </Button>
    </div>
  );
}
