import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { analytics } from "@/lib/analytics";

const DISMISS_KEY = "renofine.pwaInstallDismissed";

/**
 * Dismissible "Install Renofine" banner. Only appears once the browser has
 * fired `beforeinstallprompt` (Android / desktop Chrome) and the app is not
 * already running standalone. Sits above the mobile bottom nav.
 */
export function InstallPwaBanner() {
  const { t } = useTranslation();
  const { canInstall, promptInstall } = usePwaInstall();
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(DISMISS_KEY) === "1",
  );

  if (!canInstall || dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  const install = async () => {
    const outcome = await promptInstall();
    analytics.capture("pwa_install_prompt", { outcome });
    if (outcome !== "unavailable") dismiss();
  };

  return (
    <div className="fixed inset-x-3 bottom-20 z-40 mx-auto max-w-sm rounded-xl border bg-card p-3 shadow-lg md:inset-x-auto md:left-4 md:bottom-4 md:mx-0">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Download className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t("pwa.installTitle", "Installera Renofine")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("pwa.installBody", "Lägg till på hemskärmen för snabb åtkomst och delning direkt till Renaida.")}
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" className="h-8 px-3 text-xs" onClick={install}>
              {t("pwa.installButton", "Installera")}
            </Button>
            <Button variant="ghost" size="sm" className="h-8 px-3 text-xs" onClick={dismiss}>
              {t("pwa.installDismiss", "Inte nu")}
            </Button>
          </div>
        </div>
        <button
          onClick={dismiss}
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground"
          aria-label={t("pwa.installDismiss", "Inte nu")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
