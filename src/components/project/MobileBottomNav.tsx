import { useMemo, useRef, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { LayoutDashboard, PenTool, CheckSquare, ShoppingCart, FolderOpen, PiggyBank, Users, MessageSquare, ClipboardList, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TabConfig {
  tab: string;
  icon: React.ElementType;
  labelKey: string;
  subTab?: string;
}

interface MobileBottomNavProps {
  activeTab: string;
  activeSubTab?: string | null;
  onTabChange: (tab: string, subTab?: string | null) => void;
  isTabBlocked: (tab: string) => boolean;
  userRole?: "owner" | "editor" | "viewer" | "client";
  /** Planering is a primary tab only during the quote phase, mirroring desktop. */
  isQuotePhase?: boolean;
}

const ALL_TABS: TabConfig[] = [
  { tab: "planning", icon: ClipboardList, labelKey: "nav.mobileNav.planning" },
  { tab: "overview", icon: LayoutDashboard, labelKey: "nav.mobileNav.overview" },
  { tab: "chat", icon: MessageSquare, labelKey: "nav.mobileNav.chat" },
  { tab: "tasks", icon: CheckSquare, labelKey: "nav.mobileNav.tasks" },
  { tab: "purchases", icon: ShoppingCart, labelKey: "nav.mobileNav.purchases" },
  { tab: "budget", icon: PiggyBank, labelKey: "nav.mobileNav.budget" },
  { tab: "spaceplanner", icon: PenTool, labelKey: "nav.mobileNav.plans", subTab: "floorplan" },
  { tab: "files", icon: FolderOpen, labelKey: "nav.mobileNav.files" },
  { tab: "team", icon: Users, labelKey: "nav.mobileNav.team" },
  { tab: "sharing", icon: Share2, labelKey: "nav.mobileNav.sharing" },
];

const CLIENT_TABS: TabConfig[] = [
  { tab: "sharing", icon: LayoutDashboard, labelKey: "nav.mobileNav.sharing" },
  { tab: "chat", icon: MessageSquare, labelKey: "nav.mobileNav.chat" },
  { tab: "files", icon: FolderOpen, labelKey: "nav.mobileNav.files" },
];

export function MobileBottomNav({ activeTab, onTabChange, isTabBlocked, userRole, isQuotePhase }: MobileBottomNavProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showFadeRight, setShowFadeRight] = useState(false);
  const [showFadeLeft, setShowFadeLeft] = useState(false);

  const isClientRole = userRole === "client";
  const baseTabs = isClientRole ? CLIENT_TABS : ALL_TABS;
  const tabs = useMemo(
    () =>
      baseTabs.filter(
        (item) =>
          !isTabBlocked(item.tab) &&
          // Planering folds away once the project is active (desktop parity).
          (item.tab !== "planning" || isQuotePhase),
      ),
    [baseTabs, isTabBlocked, isQuotePhase],
  );

  // Scroll active tab into view on mount/tab change
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const activeEl = el.querySelector("[data-active='true']") as HTMLElement;
    if (activeEl) {
      activeEl.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }
  }, [activeTab]);

  // Update fade indicators on scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      setShowFadeLeft(el.scrollLeft > 8);
      setShowFadeRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => { el.removeEventListener("scroll", update); observer.disconnect(); };
  }, [tabs]);

  return (
    <>
      <div aria-hidden="true" className="fixed inset-x-0 bottom-0 bg-card md:hidden z-[49] h-24 pointer-events-none" />
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card md:hidden pb-[env(safe-area-inset-bottom)]">
        <div className="relative">
          {/* Fade indicators */}
          {showFadeLeft && (
            <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-card to-transparent z-10 pointer-events-none" />
          )}
          {showFadeRight && (
            <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-card to-transparent z-10 pointer-events-none" />
          )}

          {/* Scrollable tab bar */}
          <div
            ref={scrollRef}
            className="flex overflow-x-auto scrollbar-hide h-16 px-1"
          >
            {tabs.map(({ tab, icon: Icon, labelKey, subTab }) => {
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  data-active={active}
                  onClick={() => onTabChange(tab, subTab || null)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 min-w-[64px] px-3 flex-shrink-0 transition-colors",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-[10px] font-medium whitespace-nowrap">{t(labelKey)}</span>
                  {active && <div className="w-4 h-0.5 rounded-full bg-primary mt-0.5" />}
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}
