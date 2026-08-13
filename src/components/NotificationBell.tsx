import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, MessageSquare, AtSign, CheckSquare, Package, CheckCheck, PartyPopper, XCircle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { useNotifications, NotificationItem } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function NotificationIcon({ type }: { type: NotificationItem["type"] }) {
  const cls = "h-4 w-4 shrink-0";
  switch (type) {
    case "mention":
      return <AtSign className={cn(cls, "text-blue-500")} />;
    case "comment":
      return <MessageSquare className={cn(cls, "text-green-500")} />;
    case "task":
      return <CheckSquare className={cn(cls, "text-orange-500")} />;
    case "material":
      return <Package className={cn(cls, "text-purple-500")} />;
    case "quote_accepted":
      return <PartyPopper className={cn(cls, "text-green-600")} />;
    case "quote_rejected":
      return <XCircle className={cn(cls, "text-red-500")} />;
    case "dm":
      return <Lock className={cn(cls, "text-indigo-500")} />;
  }
}

function notificationLabel(item: NotificationItem, t: (key: string, fallback?: string) => string): string {
  const entitySuffix = item.entityName ? ` — ${item.entityName}` : "";
  switch (item.type) {
    case "mention":
      return `${item.title} ${t("notifications.mentionedYou", "mentioned you")}${entitySuffix}`;
    case "comment":
      return `${t("notifications.newComment", "New comment")} - ${item.title}${entitySuffix}`;
    case "task":
      return `${t("notifications.newTask", "New task assigned")}`;
    case "material":
      return `${t("notifications.newPurchaseOrder", "New purchase order")}`;
    case "quote_accepted":
      return `${t("notifications.quoteAccepted", "Quote accepted!")} — ${item.title}`;
    case "quote_rejected":
      return `${t("notifications.quoteRejected", "Quote declined")} — ${item.title}`;
    case "dm":
      return `${t("notifications.newDm", "Private message")} — ${item.title}`;
  }
}

type FilterTab = "all" | "mentions" | "warnings";

export function NotificationBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { notifications, unreadCount, markAllRead, markOneRead, loading } = useNotifications();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleItemClick = (item: NotificationItem) => {
    markOneRead(item.id);
    setOpen(false);
    // Quote comments → navigate directly to quote page
    if (item.entityType === "quote" && item.entityId) {
      navigate(`/quotes/${item.entityId}`);
      return;
    }
    if (item.type === "dm") {
      navigate(`/projects/${item.projectId}?tab=teams`);
      return;
    }
    const base = `/projects/${item.projectId}`;
    const entityParam = item.entityId ? `&entityId=${item.entityId}` : "";
    if (item.entityType === "task") {
      navigate(`${base}?tab=tasks${entityParam}`);
    } else if (item.entityType === "drawing_object") {
      // Worker question tied to a floor-plan object → open the space planner.
      navigate(`${base}?tab=spaceplanner${entityParam}`);
    } else if (item.entityType === "material") {
      navigate(`${base}?tab=purchases${entityParam}`);
    } else if (item.entityType === "project" && (item.type === "comment" || item.type === "mention")) {
      navigate(`${base}?tab=chat`);
    } else if (item.type === "comment" || item.type === "mention") {
      navigate(`${base}?tab=overview&subtab=feed`);
    } else {
      navigate(`${base}?tab=overview`);
    }
  };

  return (
    <div className="relative">
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon"
        className="relative h-10 w-10 md:h-9 md:w-9"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={t("notifications.title", "Notifications")}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div
          ref={panelRef}
          className="fixed sm:absolute right-2 sm:right-0 left-2 sm:left-auto top-14 sm:top-full sm:mt-2 w-auto sm:w-96 max-h-[70vh] sm:max-h-[32rem] overflow-hidden rounded-xl border border-border/60 bg-card shadow-lg z-50 flex flex-col"
        >
          {/* Header */}
          <div className="px-4 pt-4 pb-3 border-b border-border/60">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="kicker">{t("notifications.kicker", "Aviseringar")}</span>
                <h3 className="font-display text-lg font-normal tracking-tight mt-0.5">
                  {unreadCount > 0
                    ? t("notifications.unreadTitle", "{{count}} olästa", { count: unreadCount })
                    : t("notifications.title", "Aviseringar")}
                </h3>
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {/* Filter tabs */}
            <div className="flex rounded-md bg-muted/40 border border-border/60 p-0.5">
              {([
                { key: "all" as FilterTab, label: t("notifications.tabAll", "Alla") },
                { key: "mentions" as FilterTab, label: t("notifications.tabMentions", "Nämnda") },
                { key: "warnings" as FilterTab, label: t("notifications.tabWarnings", "Varningar") },
              ]).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "flex-1 px-2 py-1 rounded text-xs transition-colors",
                    activeTab === tab.key
                      ? "bg-card shadow-sm font-medium text-foreground border border-border/60"
                      : "text-muted-foreground hover:text-foreground border border-transparent"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {loading && notifications.length === 0 ? (
              <div className="p-6 text-center text-[13px] text-muted-foreground">
                {t("common.loading", "Loading...")}
              </div>
            ) : (() => {
              const filtered = notifications.filter(item => {
                if (activeTab === "mentions") return item.type === "mention";
                if (activeTab === "warnings") return item.type === "task" || item.type === "material" || item.type === "quote_rejected";
                return true;
              });
              return filtered.length === 0 ? (
                <div className="p-6 text-center text-[13px] text-muted-foreground">
                  {t("notifications.noNotifications", "Inga aviseringar")}
                </div>
              ) : (
                filtered.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className={cn(
                      "w-full text-left px-4 py-3 flex gap-3 hover:bg-accent/40 transition-colors border-b border-border/40 last:border-b-0",
                      item.isUnread && "bg-accent/20"
                    )}
                  >
                    <div className="mt-0.5">
                      <NotificationIcon type={item.type} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] leading-snug">
                        <span className={cn(item.isUnread && "font-medium")}>
                          {notificationLabel(item, t)}
                        </span>
                      </p>
                      {item.preview && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {item.preview}
                        </p>
                      )}
                      <p className="font-mono text-[10.5px] text-muted-foreground mt-1 uppercase tracking-wider tnum">
                        {item.projectName && (
                          <span>
                            {item.projectName}
                            {" \u00b7 "}
                          </span>
                        )}
                        {formatRelativeTime(item.createdAt)}
                      </p>
                    </div>
                    {item.isUnread && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                  </button>
                ))
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
