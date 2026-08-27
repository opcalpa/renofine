import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { X, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISSED_KEY = "beta-banner-dismissed-v1";

export function BetaBanner() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [isLoaded, setIsLoaded] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISSED_KEY);
    setIsDismissed(dismissed === "true");
    setIsLoaded(true);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "true");
    setIsDismissed(true);
  };

  // Don't render until we've checked localStorage (prevents flash).
  // Embedded demos (/embed/*) live inside an iframe on another site: no banner there.
  if (!isLoaded || isDismissed || pathname.startsWith("/embed/")) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200 text-amber-900 text-sm py-2.5 px-3 sm:px-4">
      <div className="container mx-auto flex items-center justify-center relative">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 flex-shrink-0 text-amber-600" />
          <span>
            <strong className="text-amber-700">{t("beta.title", "Public Beta")}</strong>
            <span className="hidden sm:inline">
              {" — "}
              {t("beta.message", "Help us improve!")}
            </span>
            {" "}
            <Link
              to="/feedback"
              className="text-amber-700 underline underline-offset-2 hover:text-amber-900 font-medium"
            >
              {t("beta.feedbackLink", "Give feedback")}
            </Link>
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-0 h-7 w-7 text-amber-600 hover:text-amber-800 hover:bg-amber-100/50"
          onClick={handleDismiss}
          aria-label={t("common.dismiss", "Dismiss")}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
