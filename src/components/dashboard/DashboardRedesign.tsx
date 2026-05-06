import { useState } from "react";
import { useTranslation } from "react-i18next";
import "./dashboard-tokens.css";
import { useDashboardData } from "@/hooks/useDashboardData";
import { usePersistedPreference } from "@/hooks/usePersistedPreference";
import { GreetingBlock } from "./GreetingBlock";
import { StatStrip } from "./StatStrip";
import { ProjectsList } from "./ProjectsList";
import { ActivityRail } from "./ActivityRail";
import { EmptyState } from "./EmptyState";
import { ProjectsOpsTable } from "./ProjectsOpsTable";
import { ProjectsPortfolio } from "./ProjectsPortfolio";
import { DaySummary } from "./DaySummary";

type DashboardView = "editorial" | "ops" | "portfolio";

interface DashboardRedesignProps {
  userId: string;
  userName?: string;
  onNewProject: () => void;
  onToggleBack: () => void;
}

export default function DashboardRedesign({ userId, userName, onNewProject, onToggleBack }: DashboardRedesignProps) {
  const { t } = useTranslation();
  const data = useDashboardData(userId);
  const displayName = userName || data.userName;
  const [viewMode, setViewMode] = usePersistedPreference<string>("dashboard-view-mode", "editorial");
  const safeView = (["editorial", "ops", "portfolio"].includes(viewMode) ? viewMode : "editorial") as DashboardView;

  if (data.isLoading) {
    return (
      <div className="rf-dashboard" data-theme="paper">
        <main className="px-4 sm:px-6 md:px-10 py-6 md:py-8 max-w-[1280px] mx-auto">
          {/* Greeting skeleton */}
          <div style={{ marginBottom: 24 }}>
            <div className="animate-pulse rounded bg-muted/60 h-3 w-32 mb-2" />
            <div className="animate-pulse rounded bg-muted/40 h-9 w-72 mb-2" />
            <div className="animate-pulse rounded bg-muted/30 h-4 w-56" />
          </div>
          {/* Stats strip skeleton */}
          <div className="rounded-xl border overflow-hidden mb-8" style={{ borderColor: "var(--hairline, oklch(88% 0.005 85))" }}>
            <div className="grid grid-cols-4 divide-x" style={{ divideColor: "var(--hairline)" }}>
              {[1,2,3,4].map(i => (
                <div key={i} className="p-5">
                  <div className="animate-pulse rounded bg-muted/60 h-2.5 w-16 mb-3" />
                  <div className="animate-pulse rounded bg-muted/40 h-7 w-20 mb-2" />
                  <div className="animate-pulse rounded-full bg-muted/30 h-1.5 w-full" />
                </div>
              ))}
            </div>
          </div>
          {/* Content skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-6 lg:gap-8">
            <div>
              {[1,2,3].map(i => (
                <div key={i} className="flex items-center gap-4 py-4 border-b" style={{ borderColor: "var(--hairline)" }}>
                  <div className="animate-pulse rounded bg-muted/40 h-5 w-5" />
                  <div className="flex-1">
                    <div className="animate-pulse rounded bg-muted/50 h-4 w-48 mb-1.5" />
                    <div className="animate-pulse rounded bg-muted/30 h-3 w-32" />
                  </div>
                  <div className="animate-pulse rounded-full bg-muted/40 h-5 w-16" />
                </div>
              ))}
            </div>
            <div>
              <div className="animate-pulse rounded bg-muted/60 h-2.5 w-12 mb-2" />
              <div className="animate-pulse rounded bg-muted/40 h-7 w-24 mb-5" />
              {[1,2,3].map(i => (
                <div key={i} className="flex gap-3 mb-5">
                  <div className="animate-pulse rounded-full bg-muted/40 h-7 w-7 shrink-0" />
                  <div className="flex-1">
                    <div className="animate-pulse rounded bg-muted/40 h-3.5 w-full mb-1.5" />
                    <div className="animate-pulse rounded bg-muted/30 h-2.5 w-16" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="rf-dashboard" data-theme="paper">
      <main className="px-4 sm:px-6 md:px-10 py-6 md:py-8 max-w-[1280px] mx-auto">
        {/* View mode toggle row */}
        <div className="flex justify-end items-center gap-2 mb-2">
          {/* View switcher */}
          {data.projects.length > 0 && (
            <div className="flex rounded-md bg-muted/40 border border-border/60 p-0.5">
              {([
                { key: "editorial" as DashboardView, icon: "M4 6h16M4 12h16M4 18h7", label: t("dashboard.viewEditorial", "Redaktionell") },
                { key: "ops" as DashboardView, icon: "M3 6h18M3 10h18M3 14h18M3 18h18", label: t("dashboard.viewOps", "Tabell") },
                { key: "portfolio" as DashboardView, icon: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z", label: t("dashboard.viewPortfolio", "Kort") },
              ]).map(v => (
                <button
                  key={v.key}
                  onClick={() => setViewMode(v.key)}
                  title={v.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "4px 10px",
                    borderRadius: 4,
                    fontSize: 12,
                    border: safeView === v.key ? "1px solid var(--hairline)" : "1px solid transparent",
                    background: safeView === v.key ? "var(--surface)" : "transparent",
                    color: safeView === v.key ? "var(--fg)" : "var(--fg-muted)",
                    fontWeight: safeView === v.key ? 500 : 400,
                    cursor: "pointer",
                    transition: "all 120ms ease",
                  }}
                >
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d={v.icon} />
                  </svg>
                  <span className="hidden sm:inline">{v.label}</span>
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={onToggleBack}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
          >
            ← {t("dashboard.classicView", "Klassisk vy")}
          </button>
        </div>

        <GreetingBlock
          userName={displayName}
          stats={data.stats}
          onNewProject={onNewProject}
        />

        {data.projects.length === 0 ? (
          <EmptyState onNewProject={onNewProject} />
        ) : safeView === "ops" ? (
          /* Path B: Ops — dense single-column table */
          <>
            <StatStrip stats={data.stats} />
            <ProjectsOpsTable projects={data.projects} />
          </>
        ) : safeView === "portfolio" ? (
          /* Path C: Portfolio — card grid */
          <ProjectsPortfolio projects={data.projects} />
        ) : (
          /* Path A: Editorial — day summary + 2-col with activity rail (default) */
          <>
            <DaySummary stats={data.stats} projects={data.projects} />
            <StatStrip stats={data.stats} />
            <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-6 lg:gap-8">
              <ProjectsList projects={data.projects} />
              <ActivityRail activities={data.activities} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
