import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { getDateLocale } from "@/lib/dateFnsLocale";
import { CheckSquare, Home, Package, Users, Map, Sparkles } from "lucide-react";
import { RenaidaAvatar } from "@/components/renaida/RenaidaAvatar";
import type { ActivityLogItem } from "./types";

// Renaida value-proof: applyProposals logs renaida_* actions to activity_log.
// Render those as "Renaida did X" receipt rows so her work stays visible.
const renaidaActionKeys: Record<string, string> = {
  renaida_task_update: "activity.renaida.taskUpdate",
  renaida_task_assign: "activity.renaida.taskAssign",
  renaida_task_create: "activity.renaida.taskCreate",
  renaida_room_create: "activity.renaida.roomCreate",
  renaida_purchase_request: "activity.renaida.purchaseRequest",
  renaida_log_time: "activity.renaida.logTime",
  renaida_checklist: "activity.renaida.checklist",
  renaida_checklist_create: "activity.renaida.checklistCreate",
  renaida_comment: "activity.renaida.comment",
  renaida_undo: "activity.renaida.undo",
};

const entityIcons: Record<string, React.ReactNode> = {
  task: <CheckSquare className="h-3.5 w-3.5 text-blue-500" />,
  room: <Home className="h-3.5 w-3.5 text-green-500" />,
  material: <Package className="h-3.5 w-3.5 text-orange-500" />,
  team_member: <Users className="h-3.5 w-3.5 text-violet-500" />,
  floor_plan: <Map className="h-3.5 w-3.5 text-cyan-500" />,
};

const borderColors: Record<string, string> = {
  task: "border-l-blue-400",
  room: "border-l-green-400",
  material: "border-l-orange-400",
  team_member: "border-l-violet-400",
  floor_plan: "border-l-cyan-400",
};

const statusKey = (s: string) => {
  const map: Record<string, string> = {
    to_do: "toDo",
    in_progress: "inProgress",
    on_hold: "onHold",
    new_construction: "newConstruction",
    to_be_renovated: "toBeRenovated",
    not_paid: "notPaid",
    partially_paid: "partiallyPaid",
  };
  return map[s] || s;
};

interface ActivityCardProps {
  activity: ActivityLogItem;
  onAvatarClick?: (profileId: string, name: string) => void;
}

export const ActivityCard = ({ activity, onAvatarClick }: ActivityCardProps) => {
  const { t, i18n } = useTranslation();
  const actorName = activity.actor?.name || t("common.unassigned");
  const entityName = activity.entity_name || "";

  // Renaida receipt row — her avatar, her name, a warm phrase per action.
  if (activity.action.startsWith("renaida_")) {
    const phraseKey = renaidaActionKeys[activity.action] ?? "activity.renaida.generic";
    return (
      <div className="flex items-start gap-3 px-3 py-2 rounded-lg border-l-2 border-l-primary bg-primary/5">
        <RenaidaAvatar state="idle" size={24} className="flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm">
            <span className="font-medium">Renaida</span>{" "}
            {t(phraseKey, { name: entityName })}
            <span className="text-muted-foreground"> · {t("activity.renaida.forUser", { name: actorName.split(" ")[0] })}</span>
          </p>
          <div className="flex items-center gap-1.5 mt-1 md:hidden">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true, locale: getDateLocale(i18n.language) })}
            </span>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-1.5 flex-shrink-0 mt-0.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true, locale: getDateLocale(i18n.language) })}
          </span>
        </div>
      </div>
    );
  }

  const actionText = t(`activity.${activity.action === "status_changed" ? "statusChanged" : activity.action === "member_added" ? "memberAdded" : activity.action === "member_removed" ? "memberRemoved" : activity.action}`);
  const entityTypeText = t(`activity.entityTypes.${activity.entity_type === "floor_plan" ? "floorPlan" : activity.entity_type === "team_member" ? "teamMember" : activity.entity_type}`);

  return (
    <div className={`flex items-start gap-3 px-3 py-2 rounded-lg border-l-2 bg-muted/40 ${borderColors[activity.entity_type] || "border-l-gray-400"}`}>
      <Avatar
        className={`h-6 w-6 flex-shrink-0 mt-0.5 ${onAvatarClick && activity.actor?.id ? "cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all" : ""}`}
        onClick={() => {
          if (onAvatarClick && activity.actor?.id) {
            onAvatarClick(activity.actor.id, actorName);
          }
        }}
      >
        <AvatarFallback className="text-[10px]">
          {actorName.charAt(0)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm">
          <span className="font-medium">{actorName}</span>
          {" "}
          {actionText}
          {" "}
          {entityTypeText}
          {entityName && (
            <>
              {" "}
              <span className="font-medium">{entityName}</span>
            </>
          )}
          {activity.action === "status_changed" && activity.changes?.old && activity.changes?.new && (
            <span className="text-muted-foreground">
              {" "}
              {t("activity.statusChange", {
                old: t(`statuses.${statusKey(String(activity.changes.old))}`, String(activity.changes.old)),
                new: t(`statuses.${statusKey(String(activity.changes.new))}`, String(activity.changes.new)),
              })}
            </span>
          )}
        </p>
        <div className="flex items-center gap-1.5 mt-1 md:hidden">
          {entityIcons[activity.entity_type]}
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(activity.created_at), {
              addSuffix: true,
              locale: getDateLocale(i18n.language),
            })}
          </span>
        </div>
      </div>
      <div className="hidden md:flex items-center gap-1.5 flex-shrink-0 mt-0.5">
        {entityIcons[activity.entity_type]}
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {formatDistanceToNow(new Date(activity.created_at), {
            addSuffix: true,
            locale: getDateLocale(i18n.language),
          })}
        </span>
      </div>
    </div>
  );
};
