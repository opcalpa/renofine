/**
 * Analytics service using PostHog
 *
 * Usage:
 *   import { analytics } from '@/lib/analytics';
 *   analytics.capture('event_name', { property: 'value' });
 *
 * Events are only sent if VITE_POSTHOG_KEY is configured.
 * All tracking is anonymous by default (no PII).
 */

import posthog from "posthog-js";

interface GtagWindow extends Window {
  gtag?: (...args: unknown[]) => void;
}

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const IS_PRODUCTION = import.meta.env.PROD;

// Current user id (set on identify), so activation fires once PER USER, not per
// device/session. Cleared on logout.
let currentUserId: string | null = null;

// Event names as constants for type safety and consistency
export const AnalyticsEvents = {
  // Onboarding & Activation
  ONBOARDING_STARTED: "onboarding_started",
  ONBOARDING_STEP_VIEWED: "onboarding_step_viewed",
  ONBOARDING_STEP_COMPLETED: "onboarding_step_completed",
  ONBOARDING_COMPLETED: "onboarding_completed",
  ONBOARDING_DISMISSED: "onboarding_dismissed",

  // Project lifecycle
  PROJECT_CREATED: "project_created",
  PROJECT_OPENED: "project_opened",
  PROJECT_DELETED: "project_deleted",

  // Room management
  ROOM_CREATED: "room_created",
  ROOM_DRAWN: "room_drawn",
  ROOM_DETAILS_VIEWED: "room_details_viewed",
  ROOM_DETAILS_UPDATED: "room_details_updated",

  // Canvas / Space Planner
  CANVAS_OPENED: "canvas_opened",
  CANVAS_TOOL_USED: "canvas_tool_used",
  CANVAS_SHAPE_CREATED: "canvas_shape_created",
  CANVAS_VIEW_CHANGED: "canvas_view_changed",

  // Tasks
  TASK_CREATED: "task_created",
  TASK_COMPLETED: "task_completed",
  TASK_ASSIGNED: "task_assigned",

  // Purchases / Materials
  PURCHASE_ORDER_CREATED: "purchase_order_created",
  RECEIPT_CAPTURED: "receipt_captured",
  RECEIPT_ANALYZED: "receipt_analyzed",

  // Collaboration
  TEAM_MEMBER_INVITED: "team_member_invited",
  COMMENT_ADDED: "comment_added",

  // Files
  FILE_UPLOADED: "file_uploaded",
  PHOTO_TAKEN: "photo_taken",

  // Navigation & Engagement
  TAB_VIEWED: "tab_viewed",
  FEATURE_USED: "feature_used",
  HELP_BOT_OPENED: "help_bot_opened",
  FEEDBACK_SUBMITTED: "feedback_submitted",

  // Renaida agent (capture → propose → confirm). Sensor layer for the learning loop.
  RENAIDA_PROPOSED: "renaida_proposed",
  RENAIDA_APPLIED: "renaida_applied",
  RENAIDA_CORRECTED: "renaida_corrected",
  RENAIDA_UNDONE: "renaida_undone",
  RENAIDA_DISMISSED: "renaida_dismissed",
  RENAIDA_AUTONOMY_CHANGED: "renaida_autonomy_changed",
  RENAIDA_SUGGESTED: "renaida_suggested",

  // Renaida-led project creation (Phase 3 funnel). Measures the conversational
  // dialog's drop-off and lets us compare it against the guided free-text flow
  // all the way to `activation_reached` (both flows tag `project_created` with
  // `creation_method`).
  RENAIDA_PROJECT_STARTED: "renaida_project_started",
  RENAIDA_PROJECT_DESCRIBE_USED: "renaida_project_describe_used",
  RENAIDA_PROJECT_ADDONS_SHOWN: "renaida_project_addons_shown",
  RENAIDA_PROJECT_CRITIC_SHOWN: "renaida_project_critic_shown",
  RENAIDA_PROJECT_COMPLETED: "renaida_project_completed",
  RENAIDA_PROJECT_ABANDONED: "renaida_project_abandoned",
  RENAIDA_QUOTE_OFFER: "renaida_quote_offer",
  RENAIDA_ACCEPT_NEWS: "renaida_accept_news",

  // Quotes
  QUOTE_CREATED: "quote_created",
  QUOTE_SENT: "quote_sent",
  QUOTE_ACCEPTED: "quote_accepted",
  QUOTE_VIEWED_BY_CLIENT: "quote_viewed_by_client",

  // Invoices
  INVOICE_CREATED: "invoice_created",
  INVOICE_SENT: "invoice_sent",

  // Auth
  SIGNUP_COMPLETED: "signup_completed",

  // Activation — fired ONCE per user the first time they cross into real value
  // (see VALUE_EVENTS). Turns "signed up" into a measurable "actually used it".
  ACTIVATION_REACHED: "activation_reached",

  // Errors (supplement to Sentry)
  ERROR_BOUNDARY_TRIGGERED: "error_boundary_triggered",
} as const;

/**
 * The first of these a user fires marks activation (empty account → real value).
 * Chosen from the drop-off analysis: signups complete onboarding but rarely take
 * a first meaningful action. One of these = they crossed that gap.
 */
const VALUE_EVENTS: ReadonlySet<string> = new Set<string>([
  "task_created",
  "renaida_applied",
  "receipt_analyzed",
  "team_member_invited",
]);

export type AnalyticsEvent =
  (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];

/**
 * How a project was created — set as `creation_method` on `project_created` so
 * PostHog can break the activation funnel down by entry flow (e.g. does the
 * Renaida dialog convert to `activation_reached` better than the guided wizard?).
 */
export const ProjectCreationMethod = {
  RENAIDA_DIALOG: "renaida_dialog",
  GUIDED_WIZARD: "guided_wizard",
  MANUAL: "manual",
  QUICK_PLAN: "quick_plan",
} as const;

export type ProjectCreationMethod =
  (typeof ProjectCreationMethod)[keyof typeof ProjectCreationMethod];

interface AnalyticsService {
  init: () => void;
  identify: (userId: string, traits?: Record<string, unknown>) => void;
  capture: (event: AnalyticsEvent | string, properties?: Record<string, unknown>) => void;
  reset: () => void;
  setPersonProperties: (properties: Record<string, unknown>) => void;
  isEnabled: () => boolean;
}

/**
 * Initialize PostHog analytics
 * Call this once at app startup (in main.tsx)
 */
function init(): void {
  if (!POSTHOG_KEY) {
    if (!IS_PRODUCTION) {
      console.log("[Analytics] PostHog disabled (no VITE_POSTHOG_KEY)");
    }
    return;
  }

  posthog.init(POSTHOG_KEY, {
    api_host: "https://eu.i.posthog.com",

    // Capture page views automatically
    capture_pageview: true,
    capture_pageleave: true,

    // Auto-capture clicks, form submissions, etc.
    autocapture: true,

    // Session recording (like Hotjar)
    disable_session_recording: false,
    session_recording: {
      // Mask all text inputs for privacy
      maskAllInputs: true,
      // Don't record passwords, credit cards, etc. Email is masked in replays so
      // it stays in analytics (person roster) but not in raw session recordings.
      maskInputOptions: {
        password: true,
        email: true,
        text: false,
      },
    },

    // Don't track users who have Do Not Track enabled
    respect_dnt: true,

    // Persistence
    persistence: "localStorage+cookie",

    // Load recording and other features only when needed
    loaded: (posthog) => {
      // Optionally disable in development
      if (!IS_PRODUCTION) {
        // posthog.opt_out_capturing(); // Uncomment to disable in dev
      }
    },
  });

  if (!IS_PRODUCTION) {
    console.log("[Analytics] PostHog initialized");
  }
}

/**
 * Identify a user (call after login)
 * @param userId - The user's unique ID (from Supabase auth)
 * @param traits - Optional user properties (role, plan, etc.)
 */
function identify(userId: string, traits?: Record<string, unknown>): void {
  currentUserId = userId;
  if (!POSTHOG_KEY) return;

  posthog.identify(userId, traits);
}

/**
 * Fire `activation_reached` the first time a user does a value action. Guarded
 * per user in localStorage so it fires exactly once (and never re-fires for a
 * returning user). Safe no-op if storage is unavailable.
 */
function maybeTrackActivation(triggerEvent: string): void {
  if (!VALUE_EVENTS.has(triggerEvent)) return;
  const key = `renofine.activation.${currentUserId ?? "anon"}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, new Date().toISOString());
  } catch {
    // Private mode / storage blocked — skip the guard rather than throw.
    return;
  }
  capture(AnalyticsEvents.ACTIVATION_REACHED, { trigger: triggerEvent });
}

/**
 * Track an event
 * @param event - Event name (use AnalyticsEvents constants)
 * @param properties - Optional event properties
 */
function capture(
  event: AnalyticsEvent | string,
  properties?: Record<string, unknown>
): void {
  // Send to PostHog if configured
  if (POSTHOG_KEY) {
    posthog.capture(event, properties);
  }

  // Send to GA4 if gtag is available
  if (typeof window !== "undefined" && (window as GtagWindow).gtag) {
    (window as GtagWindow).gtag("event", event, properties);
  }

  // Derive the one-time activation milestone from value actions (no call sites
  // to touch — every existing value event flows through here).
  maybeTrackActivation(event);
}

/**
 * Reset analytics (call on logout)
 * Clears user identification and starts a new anonymous session
 */
function reset(): void {
  currentUserId = null;
  if (!POSTHOG_KEY) return;

  posthog.reset();
}

/**
 * Set properties on the current user
 * @param properties - User properties to set
 */
function setPersonProperties(properties: Record<string, unknown>): void {
  if (!POSTHOG_KEY) return;

  posthog.setPersonProperties(properties);
}

/**
 * Check if analytics is enabled
 */
function isEnabled(): boolean {
  return Boolean(POSTHOG_KEY) || (typeof window !== "undefined" && !!(window as GtagWindow).gtag);
}

export const analytics: AnalyticsService = {
  init,
  identify,
  capture,
  reset,
  setPersonProperties,
  isEnabled,
};

export default analytics;
