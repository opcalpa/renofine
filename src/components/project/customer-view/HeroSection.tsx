import { useTranslation } from "react-i18next";
import { getWeek, format } from "date-fns";
import { sv, enUS } from "date-fns/locale";
import type { TaskStats, TimelineStats } from "../overview/types";

interface HeroSectionProps {
  projectName: string;
  address?: string | null;
  description?: string | null;
  taskStats: TaskStats;
  timelineStats: TimelineStats;
}

export function HeroSection({ projectName, address, description, taskStats, timelineStats }: HeroSectionProps) {
  const { t, i18n } = useTranslation();
  const now = new Date();
  const locale = i18n.language === "sv" ? sv : enUS;
  const week = getWeek(now, { weekStartsOn: 1 });
  const dateStr = format(now, "d MMMM yyyy", { locale });

  const displayName = address || projectName;
  const pct = taskStats.percentage;
  const days = timelineStats.daysRemaining;

  let daysStatus: string;
  if (days === null) {
    daysStatus = "";
  } else if (days > 0) {
    daysStatus = t("customerView.hero.onSchedule", "enligt plan");
  } else if (days < 0) {
    daysStatus = t("customerView.hero.daysBehind", { count: Math.abs(days), defaultValue: "{{count}} dagar efter plan" });
  } else {
    daysStatus = t("customerView.hero.onSchedule", "enligt plan");
  }

  return (
    <div>
      <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground mb-3">
        {t("customerView.hero.kicker", { week, date: dateStr, defaultValue: "Rapport . vecka {{week}} . {{date}}" })}
      </div>
      <h1 className="font-display text-4xl sm:text-5xl md:text-[56px] font-normal tracking-[-0.028em] leading-[1] mb-0">
        {displayName}<span className="text-muted-foreground/40">.</span>
      </h1>
      {pct > 0 && (
        <p className="text-base sm:text-[17px] text-muted-foreground mt-4 leading-relaxed max-w-[620px]">
          {t("customerView.hero.progressSummary", {
            percentage: pct,
            daysStatus,
            defaultValue: "Vi \u00e4r {{percentage}}% igenom ert projekt och ligger {{daysStatus}}.",
          }).split(/(\{\{percentage\}\}|\{\{daysStatus\}\})/g).length > 1
            ? (
              <>
                {t("customerView.hero.progressPrefix", { defaultValue: "Vi \u00e4r" })}{" "}
                <strong className="text-foreground">{pct}%</strong>{" "}
                {t("customerView.hero.progressMid", { defaultValue: "igenom ert projekt" })}
                {daysStatus && (
                  <>
                    {" "}{t("customerView.hero.progressAnd", { defaultValue: "och ligger" })}{" "}
                    <strong className="text-foreground">{daysStatus}</strong>
                  </>
                )}
                {"."}
              </>
            )
            : null}
        </p>
      )}
      {!pct && description && (
        <p className="text-base sm:text-[17px] text-muted-foreground mt-4 leading-relaxed max-w-[620px]">
          {description}
        </p>
      )}
    </div>
  );
}
