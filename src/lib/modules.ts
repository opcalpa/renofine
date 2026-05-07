/**
 * Feature Module Registry
 *
 * Adding a new module:
 *   1. Add an entry to MODULE_REGISTRY below
 *   2. Add i18n keys: modules.<id>.name + modules.<id>.description
 *   3. Reference the module id in tab/section rendering guards
 *
 * Module ids are stable strings stored in user preferences — never rename them.
 */

export interface ModuleDefinition {
  /** Stable key persisted in user preferences */
  id: string;
  /** i18n key for display name */
  labelKey: string;
  /** i18n key for short description */
  descriptionKey: string;
  /** Lucide icon name (rendered by consumer) */
  icon: string;
  /** Which audiences can see this module in settings */
  audience: "contractor" | "homeowner" | "both";
  /** ISO country code if region-specific (e.g. "SE"). Null = universal. */
  region: string | null;
  /** Project-detail tab ids this module controls (tab hidden when module off) */
  tabs: string[];
  /** Start-page section ids this module controls */
  sections: string[];
  /** Nav-level route paths this module controls */
  routes: string[];
  /** Default on/off per profile type */
  defaults: {
    solo: boolean;       // enskild hantverkare
    small: boolean;      // liten firma (2-10)
    company: boolean;    // byggföretag (10+)
    homeowner: boolean;
  };
}

export const MODULE_REGISTRY: ModuleDefinition[] = [
  // ── Universal modules (all regions) ──────────────────────────
  {
    id: "purchases",
    labelKey: "modules.purchases.name",
    descriptionKey: "modules.purchases.description",
    icon: "ShoppingCart",
    audience: "contractor",
    region: null,
    tabs: ["purchases"],
    sections: [],
    routes: [],
    defaults: { solo: true, small: true, company: true, homeowner: false },
  },
  {
    id: "time_tracking",
    labelKey: "modules.timeTracking.name",
    descriptionKey: "modules.timeTracking.description",
    icon: "Clock",
    audience: "contractor",
    region: null,
    tabs: ["timetracking"],
    sections: [],
    routes: [],
    defaults: { solo: false, small: true, company: true, homeowner: false },
  },
  {
    id: "quotes",
    labelKey: "modules.quotes.name",
    descriptionKey: "modules.quotes.description",
    icon: "FileText",
    audience: "contractor",
    region: null,
    tabs: [],
    sections: ["pipeline"],
    routes: ["/quotes/new", "/invoices/new"],
    defaults: { solo: true, small: true, company: true, homeowner: false },
  },
  {
    id: "customer_portal",
    labelKey: "modules.customerPortal.name",
    descriptionKey: "modules.customerPortal.description",
    icon: "Users",
    audience: "contractor",
    region: null,
    tabs: ["sharing"],
    sections: [],
    routes: [],
    defaults: { solo: false, small: true, company: true, homeowner: false },
  },
  {
    id: "floor_plan",
    labelKey: "modules.floorPlan.name",
    descriptionKey: "modules.floorPlan.description",
    icon: "PencilRuler",
    audience: "both",
    region: null,
    tabs: [],
    sections: [],
    routes: [],
    defaults: { solo: false, small: false, company: false, homeowner: false },
  },
  {
    id: "quality_control",
    labelKey: "modules.qualityControl.name",
    descriptionKey: "modules.qualityControl.description",
    icon: "ClipboardCheck",
    audience: "contractor",
    region: null,
    tabs: ["inspections"],
    sections: [],
    routes: [],
    defaults: { solo: false, small: false, company: true, homeowner: false },
  },
  {
    id: "resource_planning",
    labelKey: "modules.resourcePlanning.name",
    descriptionKey: "modules.resourcePlanning.description",
    icon: "CalendarRange",
    audience: "contractor",
    region: null,
    tabs: [],
    sections: ["resource_planning"],
    routes: [],
    defaults: { solo: false, small: false, company: true, homeowner: false },
  },
  {
    id: "client_registry",
    labelKey: "modules.clientRegistry.name",
    descriptionKey: "modules.clientRegistry.description",
    icon: "Contact",
    audience: "contractor",
    region: null,
    tabs: [],
    sections: [],
    routes: ["/clients"],
    defaults: { solo: false, small: true, company: true, homeowner: false },
  },
  {
    id: "financial_analysis",
    labelKey: "modules.financialAnalysis.name",
    descriptionKey: "modules.financialAnalysis.description",
    icon: "TrendingUp",
    audience: "contractor",
    region: null,
    tabs: [],
    sections: ["financial_analysis"],
    routes: [],
    defaults: { solo: false, small: true, company: true, homeowner: false },
  },

  // ── Sweden-specific modules (region: "SE") ───────────────────
  {
    id: "attendance",
    labelKey: "modules.attendance.name",
    descriptionKey: "modules.attendance.description",
    icon: "QrCode",
    audience: "contractor",
    region: "SE",
    tabs: [],
    sections: ["attendance"],
    routes: [],
    defaults: { solo: false, small: false, company: true, homeowner: false },
  },
  {
    id: "rot_deduction",
    labelKey: "modules.rotDeduction.name",
    descriptionKey: "modules.rotDeduction.description",
    icon: "Receipt",
    audience: "both",
    region: "SE",
    tabs: [],
    sections: ["rot"],
    routes: [],
    defaults: { solo: true, small: true, company: true, homeowner: true },
  },
  {
    id: "payroll_export",
    labelKey: "modules.payrollExport.name",
    descriptionKey: "modules.payrollExport.description",
    icon: "FileDown",
    audience: "contractor",
    region: "SE",
    tabs: [],
    sections: ["payroll_export"],
    routes: [],
    defaults: { solo: false, small: true, company: true, homeowner: false },
  },
];

/** Lookup helpers */
export const MODULE_MAP = new Map(MODULE_REGISTRY.map((m) => [m.id, m]));

/** Get all module ids that control a given project tab */
export function modulesForTab(tabId: string): string[] {
  return MODULE_REGISTRY.filter((m) => m.tabs.includes(tabId)).map((m) => m.id);
}

/** Get all module ids that control a given start-page section */
export function modulesForSection(sectionId: string): string[] {
  return MODULE_REGISTRY.filter((m) => m.sections.includes(sectionId)).map((m) => m.id);
}

/** Get all module ids that control a given route */
export function modulesForRoute(route: string): string[] {
  return MODULE_REGISTRY.filter((m) => m.routes.includes(route)).map((m) => m.id);
}

export type ProfileSize = "solo" | "small" | "company" | "homeowner";

/** Available markets with their display info */
export const MARKETS = [
  { code: null, labelKey: "modules.market.international", flag: "🌍" },
  { code: "SE", labelKey: "modules.market.sweden", flag: "🇸🇪" },
  { code: "NO", labelKey: "modules.market.norway", flag: "🇳🇴" },
  { code: "DE", labelKey: "modules.market.germany", flag: "🇩🇪" },
  { code: "US", labelKey: "modules.market.usa", flag: "🇺🇸" },
  { code: "GB", labelKey: "modules.market.uk", flag: "🇬🇧" },
] as const;

/**
 * Guess initial market from language when user hasn't explicitly chosen.
 * Only used as a fallback — explicit market setting always wins.
 */
export function guessMarketFromLanguage(language?: string | null): string | null {
  if (language === "sv") return "SE";
  return null;
}

/** Filter modules visible for a given region. Universal + matching region. */
export function modulesForRegion(region: string | null): ModuleDefinition[] {
  return MODULE_REGISTRY.filter((m) => m.region === null || m.region === region);
}

/** Return default enabled module ids for a profile type and region */
export function defaultModulesForProfile(size: ProfileSize, region?: string | null): string[] {
  return MODULE_REGISTRY
    .filter((m) => m.defaults[size] && (m.region === null || m.region === region))
    .map((m) => m.id);
}
