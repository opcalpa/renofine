/**
 * Project status system — drives CTAs, tab visibility, and badges.
 *
 * `project_type` = what the project IS (renovation, demo, etc.)
 * `status`       = where the project IS in its lifecycle
 */

// ---------------------------------------------------------------------------
// Status constants
// ---------------------------------------------------------------------------

export const PROJECT_STATUSES = [
  "planning",
  "quote_created",
  "quote_sent",
  "quote_rejected",
  "active",
  "on_hold",
  "completed",
  "cancelled",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

// ---------------------------------------------------------------------------
// Status metadata
// ---------------------------------------------------------------------------

interface StatusMeta {
  labelKey: string;
  descriptionKey: string;
  color: string;        // Tailwind badge color class
  iconName: string;     // lucide icon name hint (used in components)
  sortOrder: number;
}

export const STATUS_META: Record<ProjectStatus, StatusMeta> = {
  planning: {
    labelKey: "projectStatus.planning",
    descriptionKey: "projectStatus.planningDesc",
    color: "bg-blue-100 text-blue-700",
    iconName: "ClipboardList",
    sortOrder: 0,
  },
  quote_created: {
    labelKey: "projectStatus.quoteCreated",
    descriptionKey: "projectStatus.quoteCreatedDesc",
    color: "bg-amber-100 text-amber-700",
    iconName: "FileText",
    sortOrder: 1,
  },
  quote_sent: {
    labelKey: "projectStatus.quoteSent",
    descriptionKey: "projectStatus.quoteSentDesc",
    color: "bg-orange-100 text-orange-700",
    iconName: "Send",
    sortOrder: 2,
  },
  quote_rejected: {
    labelKey: "projectStatus.quoteRejected",
    descriptionKey: "projectStatus.quoteRejectedDesc",
    color: "bg-red-100 text-red-700",
    iconName: "XCircle",
    sortOrder: 3,
  },
  active: {
    labelKey: "projectStatus.active",
    descriptionKey: "projectStatus.activeDesc",
    color: "bg-green-100 text-green-700",
    iconName: "Hammer",
    sortOrder: 4,
  },
  on_hold: {
    labelKey: "projectStatus.onHold",
    descriptionKey: "projectStatus.onHoldDesc",
    color: "bg-yellow-100 text-yellow-700",
    iconName: "PauseCircle",
    sortOrder: 5,
  },
  completed: {
    labelKey: "projectStatus.completed",
    descriptionKey: "projectStatus.completedDesc",
    color: "bg-emerald-100 text-emerald-700",
    iconName: "CheckCircle2",
    sortOrder: 6,
  },
  cancelled: {
    labelKey: "projectStatus.cancelled",
    descriptionKey: "projectStatus.cancelledDesc",
    color: "bg-gray-100 text-gray-500",
    iconName: "XCircle",
    sortOrder: 7,
  },
};

// ---------------------------------------------------------------------------
// Allowed manual transitions (what the user can switch to from current)
// ---------------------------------------------------------------------------

export const ALLOWED_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  planning:       ["quote_created", "active", "on_hold", "cancelled"],
  quote_created:  ["planning", "quote_sent", "active", "on_hold", "cancelled"],
  quote_sent:     ["planning", "quote_created", "active", "on_hold", "cancelled"],
  quote_rejected: ["quote_created", "planning", "cancelled"],
  active:         ["on_hold", "completed", "cancelled"],
  on_hold:        ["active", "cancelled"],
  completed:      ["active"],   // reopen
  cancelled:      ["planning"], // restart
};

// ---------------------------------------------------------------------------
// CTA configuration per status
// ---------------------------------------------------------------------------

export interface StatusCTA {
  messageKey: string;
  primaryAction: {
    labelKey: string;
    action: "navigate_tasks" | "create_quote" | "send_quote" | "view_quote" | "revise_quote" | "navigate_overview" | "export" | "create_invoice";
  };
  secondaryAction?: {
    labelKey: string;
    action: "navigate_tasks" | "create_quote" | "edit_quote" | "send_reminder" | "revise_quote" | "navigate_overview" | "archive" | "create_invoice";
  };
}

export function getStatusCTA(status: ProjectStatus): StatusCTA | null {
  switch (status) {
    case "planning":
      return {
        messageKey: "projectStatus.cta.planningMessage",
        primaryAction: {
          labelKey: "projectStatus.cta.addTasks",
          action: "navigate_tasks",
        },
        secondaryAction: {
          labelKey: "projectStatus.cta.generateQuote",
          action: "create_quote",
        },
      };
    case "quote_created":
      return {
        messageKey: "projectStatus.cta.quoteCreatedMessage",
        primaryAction: {
          labelKey: "projectStatus.cta.sendToCustomer",
          action: "send_quote",
        },
        secondaryAction: {
          labelKey: "projectStatus.cta.editQuote",
          action: "edit_quote",
        },
      };
    case "quote_sent":
      return {
        messageKey: "projectStatus.cta.quoteSentMessage",
        primaryAction: {
          labelKey: "projectStatus.cta.viewQuote",
          action: "view_quote",
        },
        secondaryAction: {
          labelKey: "projectStatus.cta.sendReminder",
          action: "send_reminder",
        },
      };
    case "quote_rejected":
      return {
        messageKey: "projectStatus.cta.quoteRejectedMessage",
        primaryAction: {
          labelKey: "projectStatus.cta.reviseQuote",
          action: "revise_quote",
        },
        secondaryAction: {
          labelKey: "projectStatus.cta.viewQuote",
          action: "view_quote",
        },
      };
    case "active":
      return {
        messageKey: "projectStatus.cta.activeMessage",
        primaryAction: {
          labelKey: "projectStatus.cta.viewTasks",
          action: "navigate_tasks",
        },
        secondaryAction: {
          labelKey: "projectStatus.cta.createInvoice",
          action: "create_invoice",
        },
      };
    case "completed":
      return {
        messageKey: "projectStatus.cta.completedMessage",
        primaryAction: {
          labelKey: "projectStatus.cta.exportProject",
          action: "export",
        },
      };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Tab visibility per status
// ---------------------------------------------------------------------------

/**
 * NOTE (2026-08-23): getTabVisibility has no callers — ProjectDetail gates tabs
 * on member permissions + enabled modules, not on status. Kept (and kept honest)
 * as the declared intent, but changing it changes nothing on its own.
 */
type TabVisibility = "show" | "hide" | "readonly";

export interface TabConfig {
  overview: TabVisibility;
  tasks: TabVisibility;
  spacePlanner: TabVisibility;
  files: TabVisibility;
  purchases: TabVisibility;
  budget: TabVisibility;
  teams: TabVisibility;
}

const FULL_ACCESS: TabConfig = {
  overview: "show",
  tasks: "show",
  spacePlanner: "show",
  files: "show",
  purchases: "show",
  budget: "show",
  teams: "show",
};

export function getTabVisibility(status: ProjectStatus): TabConfig {
  switch (status) {
    case "planning":
      return {
        ...FULL_ACCESS,
        purchases: "hide",
        budget: "hide",
        teams: "hide",
      };
    case "quote_created":
    case "quote_sent":
    case "quote_rejected":
      return {
        ...FULL_ACCESS,
        purchases: "hide",
        budget: "hide",
      };
    case "active":
    case "on_hold":
      return FULL_ACCESS;
    case "completed":
      // Skiva 3: a finished project is still a living archive. Receipts arrive
      // late (declaration, sale), files keep being added, and the drawing is
      // where the next small job gets sketched — shelves, benches, built-ins.
      // Tasks stay read-only: new work means reopening the project or starting
      // a new one, which keeps "completed" an honest statement.
      return {
        overview: "show",
        tasks: "readonly",
        spacePlanner: "show",
        files: "show",
        purchases: "show",
        budget: "show",
        teams: "readonly",
      };
    case "cancelled":
      return {
        overview: "show",
        tasks: "readonly",
        spacePlanner: "readonly",
        files: "readonly",
        purchases: "readonly",
        budget: "readonly",
        teams: "readonly",
      };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise legacy / null status values to a valid ProjectStatus */
export function normalizeStatus(raw: string | null | undefined): ProjectStatus {
  if (!raw) return "planning";
  const lower = raw.toLowerCase().trim();
  if (lower === "lead") return "planning";
  if ((PROJECT_STATUSES as readonly string[]).includes(lower)) {
    return lower as ProjectStatus;
  }
  // Fallback: treat unknown values as active (existing projects)
  return "active";
}

/** Check whether a status is in the quoting phase */
export function isQuotePhase(status: ProjectStatus): boolean {
  return status === "quote_created" || status === "quote_sent" || status === "quote_rejected";
}

/** Check whether a project is editable (not completed/cancelled) */
export function isProjectEditable(status: ProjectStatus): boolean {
  return status !== "completed" && status !== "cancelled";
}
