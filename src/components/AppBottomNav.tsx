import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Home, Lightbulb, Sparkles, MessageSquare, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRenaidaStore } from "@/stores/renaidaStore";
import { RenaidaAvatar } from "@/components/renaida/RenaidaAvatar";

interface AppBottomNavProps {
  onProfileClick?: () => void;
}

export function AppBottomNav({ onProfileClick }: AppBottomNavProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const reminderCount = useRenaidaStore((s) => s.reminderCount);

  const tabs = [
    { path: "/start", icon: Home, label: t("nav.start", "Start") },
    { path: "/tips", icon: Lightbulb, label: t("nav.tips", "Tips") },
    { path: "/changelog", icon: Sparkles, label: t("nav.changelog", "Nyheter") },
    { path: "/feedback", icon: MessageSquare, label: t("nav.feedback", "Kontakt") },
    { path: "/profile", icon: User, label: t("nav.profile", "Profil") },
  ];

  // Renaida gets the elevated CENTER slot (mobile = Renaida-first capture
  // surface): opens the panel via the store — the same panel the FAB opens,
  // which hides itself on /start so there is exactly one door here.
  const renaidaSlot = (
    <button
      key="renaida"
      onClick={() => useRenaidaStore.getState().setPanelOpen(true)}
      className="flex-1 flex flex-col items-center justify-end gap-0.5 pb-1"
      aria-label={t("helpBot.title", "Renaida")}
    >
      <span className="relative -mt-5 flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary/25 bg-white shadow-md">
        <RenaidaAvatar state="idle" size={40} />
        {reminderCount > 0 && (
          <span className="absolute -top-1 -right-1 h-4 min-w-4 px-0.5 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
            {reminderCount}
          </span>
        )}
      </span>
      <span className="text-[10px] font-medium text-primary">Renaida</span>
    </button>
  );

  const renderTab = ({ path, icon: Icon, label }: (typeof tabs)[number]) => {
    const active = location.pathname === path;
    return (
      <button
        key={path}
        onClick={() => {
          if (path === "/profile" && onProfileClick) {
            onProfileClick();
          } else {
            navigate(path);
          }
        }}
        className={cn(
          "flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors",
          active ? "text-primary" : "text-muted-foreground"
        )}
      >
        <Icon className="h-5 w-5" />
        <span className="text-[10px] font-medium">{label}</span>
        {active && <div className="w-4 h-0.5 rounded-full bg-primary" />}
      </button>
    );
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/60 bg-card md:hidden pb-[env(safe-area-inset-bottom)]">
      <div className="flex h-14">
        {tabs.slice(0, 2).map(renderTab)}
        {renaidaSlot}
        {tabs.slice(2).map(renderTab)}
      </div>
    </nav>
  );
}
