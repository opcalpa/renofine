import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { Send, X, Lightbulb, BookOpen, Wrench, FileText, ArrowLeft, Mic, Sparkles, ChevronDown, MessageCircle, Square, Loader2, Paperclip } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { useVoiceRecorder, isRecorderSupported } from "@/hooks/useVoiceRecorder";
import { useVisualViewportHeight } from "@/hooks/useVisualViewportHeight";
import { useRenaidaStore, type RenaidaAutonomy } from "@/stores/renaidaStore";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { ConfirmDiff, actionDetails } from "@/components/agent/ConfirmDiff";
import { RenaidaAvatar, type RenaidaState } from "@/components/renaida/RenaidaAvatar";
import { routeAgentInput } from "@/services/agent/routeClient";
import { captureDocument } from "@/services/agent/documentCapture";
import { applyProposals, undoProposals, fetchLatestUndoable } from "@/services/agent/applyProposals";
import { type AgentProposal, type UndoOp, TASK_MATCH_MIN_CONFIDENCE, isActionable } from "@/services/agent/types";
import { recordCorrection, getAutonomyMode, setAutonomyMode } from "@/services/agent/renaidaMemory";
import { fetchProactiveSuggestions, type RenaidaSuggestion } from "@/services/agent/renaidaSuggestions";
import { resolveFallbackProject } from "@/services/agent/defaultProject";
import { analytics, AnalyticsEvents } from "@/lib/analytics";
import { QuoteReviewDialog } from "@/components/project/QuoteReviewDialog";
import { PlanningSmartImportDialog } from "@/components/project/overview/PlanningSmartImportDialog";

/** Action-type histogram + task-target ids, for the Renaida learning-loop sensor events. */
function summarizeProposals(proposals: AgentProposal[]) {
  const actionTypes = proposals.map((p) => p.action.type);
  const taskTargets = proposals
    .map((p) => ("taskId" in p.action ? p.action.taskId : undefined))
    .filter(Boolean) as string[];
  const hasLowConfidence = proposals.some(
    (p) => typeof p.matchConfidence === "number" && p.matchConfidence < TASK_MATCH_MIN_CONFIDENCE,
  );
  return { count: proposals.length, actionTypes, taskTargets, hasLowConfidence };
}

// Progressive trust (Fas 2): when Renaida is very sure about a SINGLE action, apply
// it straight away with a prominent Undo instead of taxing the user with a confirm
// click. Bars are well above the re-pick threshold — anything uncertain, or any
// multi-action note, still goes through ConfirmDiff. Everything is reversible.
const AUTO_APPLY_MIN_CONFIDENCE = 0.9;
const AUTO_APPLY_MIN_MATCH = 0.85;

function qualifiesForAutoApply(p: AgentProposal): boolean {
  if (!isActionable(p)) return false;
  // Scanned documents write MONEY (an order + its amounts) — always confirmed
  // by a human, even on autopilot.
  if (p.action.type === "import_purchase") return false;
  if ((p.confidence ?? 0) < AUTO_APPLY_MIN_CONFIDENCE) return false;
  // Task-targeting actions must ALSO clear a high match bar (right task, not just right intent).
  const taskId = "taskId" in p.action ? p.action.taskId : undefined;
  if (taskId && (p.matchConfidence ?? 0) < AUTO_APPLY_MIN_MATCH) return false;
  return true;
}

// Proactive Renaida (Fas 3): first-run autonomy intro + a one-time nudge to try
// autopilot once she's proven herself. Small device-local flags/counters.
const AUTONOMY_INTRODUCED_KEY = "renaida-autonomy-introduced";
const AUTOPILOT_NUDGED_KEY = "renaida-autopilot-nudged";
const CONFIRM_COUNT_KEY = "renaida-confirm-count";
const NUDGE_AFTER_CONFIRMS = 3;

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, val: string): void {
  try { localStorage.setItem(key, val); } catch { /* ignore */ }
}

interface Message {
  role: "user" | "assistant";
  content: string;
  /** Optional inline quick-action buttons rendered below this message */
  actions?: InlineAction[];
  /** When present, the message renders an agentic ConfirmDiff instead of a text bubble */
  proposals?: AgentProposal[];
  /** When present, the message shows an "Undo" button that reverses these ops */
  undo?: UndoOp[];
  /** Marks a proactively-surfaced suggestion message (Fas 3b) — shown once per open. */
  suggestion?: boolean;
  /** Project the proposals/undo in this message act on. Set when capture ran
   *  against a resolved fallback project (panel opened outside a project) —
   *  apply/undo must NOT fall back to the store's (null) projectId then. */
  projectId?: string;
  /** The user utterance that produced this proposals bubble. NOT messages[i-1]
   *  — the fallback-project announce can sit between the two. */
  sourcePhrase?: string;
  /** Persisted undo-stack row backing this message's undo ops (survives reloads). */
  undoStackId?: string | null;
}

/** Build ConfirmDiff proposals from proactive suggestions, with localized summaries. */
function buildSuggestionProposals(
  suggestions: RenaidaSuggestion[],
  t: (key: string, opts?: Record<string, unknown>) => string,
): AgentProposal[] {
  return suggestions.map((s) => ({
    id: crypto.randomUUID(),
    summary: t("helpBot.suggest.checklistDone", { title: s.title, defaultValue: `Alla punkter klara i "${s.title}" — markera som klar?` }),
    confidence: 0.9,
    // status explicit: the OWNER confirms this, so complete outright — the
    // awaiting_review default on progress=100 is the worker-flow gate, and it
    // makes the overview "Avslutad" count (which counts completed) sit still.
    action: { type: "set_progress", taskId: s.taskId, progress: 100, status: "completed" },
  }));
}

interface InlineAction {
  labelKey: string;
  fallback: string;
  action: string;
  icon?: React.ReactNode;
}

/**
 * The conversation must survive component remounts — route changes can unmount
 * the panel, and with it every Undo button mid-errand (loop-varv 14, bugg 1).
 * Module-scoped and session-only: a page reload intentionally starts fresh.
 */
let messagesCache: Message[] = [];

/** Remove the first-run autonomy chips once a mode has been picked — stale
 * "choose a mode" buttons after the choice read as a bug. */
function stripAutonomyIntro(messages: Message[]): Message[] {
  return messages.map((m) =>
    m.actions?.some((a) => a.action.startsWith("set_autonomy"))
      ? { ...m, actions: undefined }
      : m,
  );
}

interface QuickPrompt {
  icon: React.ReactNode;
  labelKey: string;
  fallback: string;
  message?: string;
  action?: string;
}

type FeedbackMode = null | "bug" | "suggestion" | "other";

/**
 * Inline light-markdown: renders **bold** segments as <strong> (the model
 * writes markdown; raw asterisks in the bubbles read as a bug). Lists and
 * line breaks already render fine via whitespace-pre-wrap.
 */
function renderBold(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((seg, i) => {
    const bold = seg.match(/^\*\*([^*]+)\*\*$/);
    return bold
      ? <strong key={`${keyPrefix}-${i}`}>{bold[1]}</strong>
      : <span key={`${keyPrefix}-${i}`}>{seg}</span>;
  });
}

/**
 * MessageContent — Renders message text with:
 * - Clickable [text](navigate:target) links (tab targets via OverviewTab)
 * - Clickable [text](open:/path) links (router paths — e.g. receipt bullets)
 * - Dismiss buttons [x](dismiss:reminderId)
 * - **bold** inline formatting
 */
function MessageContent({ content, onNavigate, onDismiss }: {
  content: string;
  onNavigate: (action: string) => void;
  onDismiss?: (id: string) => void;
}) {
  // Parse [text](navigate:target), [text](open:path) and [x](dismiss:id) patterns
  const parts = content.split(/(\[[^\]]*\]\((?:navigate|open|dismiss):[^)]+\))/g);

  return (
    <>
      {parts.map((part, i) => {
        const navMatch = part.match(/^\[([^\]]+)\]\((navigate|open):([^)]+)\)$/);
        if (navMatch) {
          return (
            <span key={i} className="inline-flex items-center gap-1">
              <button
                className="text-primary hover:underline font-medium inline"
                onClick={() => onNavigate(`${navMatch[2]}:${navMatch[3]}`)}
              >
                {navMatch[1]}
              </button>
              {/* Extract dismiss ID from the reminder id embedded after navigate */}
            </span>
          );
        }
        const dismissMatch = part.match(/^\[\]\(dismiss:([^)]+)\)$/);
        if (dismissMatch && onDismiss) {
          return (
            <button
              key={i}
              className="inline-flex items-center justify-center h-4 w-4 rounded text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted transition-colors ml-1"
              onClick={() => onDismiss(dismissMatch[1])}
              title="Dismiss"
            >
              <span className="text-[10px] leading-none">✕</span>
            </button>
          );
        }
        return <span key={i}>{renderBold(part, String(i))}</span>;
      })}
    </>
  );
}

function getTimeOfDayKey(): "morning" | "afternoon" | "evening" {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

function getPageContext(): "projects" | "project" | "auth" | "other" {
  const path = window.location.pathname;
  if (path.startsWith("/projects/") || path.startsWith("/project/")) return "project";
  if (path === "/start" || path === "/" || path === "/projects") return "projects";
  if (path.startsWith("/auth")) return "auth";
  return "other";
}

// Value ranking for reminders: core project-completeness first, niche ROT config last.
const REMINDER_PRIORITY: Record<string, number> = {
  no_tasks: 1, no_rooms: 2, unlinked_tasks: 3, no_budget: 4, budget_over: 4,
  no_deadline: 5, no_start_date: 7, rot_property: 8, rot_personnummer: 9,
};

export function Renaida() {
  const { t, i18n } = useTranslation();
  const reminderCount = useRenaidaStore((s) => s.reminderCount);
  const renaidaReminders = useRenaidaStore((s) => s.reminders);
  const renaidaProjectName = useRenaidaStore((s) => s.projectName);
  const autonomy = useRenaidaStore((s) => s.autonomy);
  const [open, setOpen] = useState(false);
  const [messages, rawSetMessages] = useState<Message[]>(() => messagesCache);
  // Every write mirrors into the module cache so a remount restores the thread.
  const setMessages = useCallback((updater: Message[] | ((prev: Message[]) => Message[])) => {
    rawSetMessages((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      messagesCache = next;
      return next;
    });
  }, []);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [userType, setUserType] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode>(null);
  const [capturing, setCapturing] = useState(false);
  /** D2: a quote/scope document handed off to its dedicated review dialog, prefilled. */
  const [docHandoff, setDocHandoff] = useState<{ kind: "quote" | "scope"; file: File; projectId: string } | null>(null);
  const [listening, setListening] = useState(false);
  const [applying, setApplying] = useState(false);
  const [renaidaFlash, setRenaidaFlash] = useState<RenaidaState | null>(null);
  const [renaidaAsleep, setRenaidaAsleep] = useState(false);
  const [remindersExpanded, setRemindersExpanded] = useState(false);
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  // Keyboard-aware panel height (iOS overlays fixed elements without resizing).
  const vvBox = useVisualViewportHeight(open && isMobile);

  // Full-screen mobile panel: lock the page behind while open. iOS Safari
  // scrolls the DOCUMENT when the keyboard opens (and lets gestures scroll the
  // page behind the overlay) — after the keyboard closes the page stays offset
  // and this fixed panel's header sits above the visible viewport (Carl's
  // iPhone screenshot 7 Jul: chat bubbles but no header/close button).
  useEffect(() => {
    if (!open || !isMobile) return;
    const body = document.body;
    const scrollY = window.scrollY;
    const prev = {
      position: body.style.position, top: body.style.top,
      left: body.style.left, right: body.style.right, width: body.style.width,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, [open, isMobile]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const flashTimerRef = useRef<number | undefined>(undefined);
  // Fallback project already announced in this panel session (capture outside a project)
  const announcedFallbackRef = useRef<string | null>(null);
  const sleepTimerRef = useRef<number | undefined>(undefined);

  // --- Renaida mood machine: idle → hello/think/talk/happy, sleep when idle ---
  const wakeRenaida = useCallback(() => {
    setRenaidaAsleep(false);
    if (sleepTimerRef.current) window.clearTimeout(sleepTimerRef.current);
    sleepTimerRef.current = window.setTimeout(() => setRenaidaAsleep(true), 45000);
  }, []);

  const flashRenaida = useCallback((mood: RenaidaState, ms = 1800) => {
    wakeRenaida();
    setRenaidaFlash(mood);
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setRenaidaFlash(null), ms);
  }, [wakeRenaida]);

  const renaidaBusy = loading || capturing || applying;
  const renaidaState: RenaidaState = renaidaFlash
    ? renaidaFlash
    : renaidaBusy
      ? "think"
      : (renaidaAsleep && !open) ? "sleep" : "idle";

  // Start the inactivity clock on mount; clean timers on unmount.
  useEffect(() => {
    wakeRenaida();
    return () => {
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
      if (sleepTimerRef.current) window.clearTimeout(sleepTimerRef.current);
    };
  }, [wakeRenaida]);

  // Wave hello when opened; reset inactivity clock when closed.
  useEffect(() => {
    if (open) flashRenaida("hello", 2200);
    else wakeRenaida();
  }, [open, flashRenaida, wakeRenaida]);

  // Load the synced autonomy preference on mount (localStorage cache paints first).
  useEffect(() => {
    let alive = true;
    getAutonomyMode().then((mode) => {
      if (alive) useRenaidaStore.getState().setAutonomy(mode);
    });
    return () => { alive = false; };
  }, []);

  // Proactive suggestions (Fas 3b): once per open, after the user's been introduced,
  // read project state and surface concrete loose ends as a ConfirmDiff to opt into.
  const proactiveShownRef = useRef(false);
  useEffect(() => {
    if (!open) { proactiveShownRef.current = false; return; }
    if (proactiveShownRef.current) return;
    if (getPageContext() !== "project" || !lsGet(AUTONOMY_INTRODUCED_KEY)) return;
    const projectId = useRenaidaStore.getState().projectId;
    if (!projectId) return;
    proactiveShownRef.current = true;
    let alive = true;
    fetchProactiveSuggestions(projectId).then((suggestions) => {
      if (!alive || suggestions.length === 0) return;
      const proposals = buildSuggestionProposals(suggestions, t);
      analytics.capture(AnalyticsEvents.RENAIDA_SUGGESTED, { count: proposals.length, kinds: suggestions.map((s) => s.kind) });
      setMessages((prev) => {
        if (prev.some((m) => m.suggestion) || prev.some((m) => m.role === "user")) return prev;
        return [...prev, {
          role: "assistant",
          content: t("helpBot.suggest.lead", "Jag la märke till några saker vi kan slutföra:"),
          suggestion: true,
          proposals,
        }];
      });
    });
    return () => { alive = false; };
  }, [open, t]);

  const handleToggleAutonomy = useCallback(() => {
    const next: RenaidaAutonomy = useRenaidaStore.getState().autonomy === "autopilot" ? "suggest" : "autopilot";
    useRenaidaStore.getState().setAutonomy(next);
    void setAutonomyMode(next);
    lsSet(AUTONOMY_INTRODUCED_KEY, "1"); // header toggle counts as having met the choice
    analytics.capture(AnalyticsEvents.RENAIDA_AUTONOMY_CHANGED, { mode: next, source: "header" });
    flashRenaida(next === "autopilot" ? "happy" : "idle", 1500);
    // Confirm the switch in the thread (Cowork: the label alone was too subtle),
    // and retire any first-run intro chips — the choice is made.
    setMessages((prev) => [...stripAutonomyIntro(prev), {
      role: "assistant",
      content: t(next === "autopilot" ? "helpBot.autonomy.enabledAutopilot" : "helpBot.autonomy.enabledSuggest",
        next === "autopilot" ? "Autopilot på — jag fixar säkra saker direkt, alltid med Ångra." : "Okej, jag frågar först innan jag ändrar något."),
    }]);
  }, [flashRenaida, t]);

  // Fetch user type and name from profile
  useEffect(() => {
    const fetchUserType = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("onboarding_user_type, name, avatar_url")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.onboarding_user_type) {
        setUserType(data.onboarding_user_type);
      }
      if (data?.name) {
        setUserName(data.name.split(" ")[0]); // first name only
      }
      if (data?.avatar_url) {
        setUserAvatar(data.avatar_url);
      }
    };
    fetchUserType();
  }, []);

  const buildGreeting = useCallback(() => {
    const timeKey = getTimeOfDayKey();
    const nameGreeting = userName ? `, ${userName}` : "";
    const hello = t(`helpBot.timeGreeting.${timeKey}`, {
      defaultValue: timeKey === "morning" ? "God morgon" : timeKey === "afternoon" ? "Hej" : "God kväll",
    });
    // One warm line, name included. Reminders + actions live below as chips (progressive disclosure).
    return {
      content: `${hello}${nameGreeting}! 👋 ${t("helpBot.intro", "Jag är Renaida, din personliga renoveringskompis.")}`,
    };
  }, [t, userName]);

  // Reset conversation when language ACTUALLY changes — this effect also fires
  // on mount, which used to wipe the restored thread on every remount
  // (loop-varv 14, bugg 1: history + Undo gone after tab navigation).
  const currentLang = i18n.language;
  const langRef = useRef(currentLang);
  /** One restorable-undo offer per project per mount — never spam the greeting. */
  const offeredUndoRef = useRef<string | null>(null);
  useEffect(() => {
    if (langRef.current === currentLang) return;
    langRef.current = currentLang;
    setMessages([]);
    setFeedbackMode(null);
  }, [currentLang, setMessages]);

  useEffect(() => {
    if (open && messages.length === 0) {
      const greeting = buildGreeting();
      const initial: Message[] = [
        { role: "assistant", content: greeting.content, actions: greeting.actions },
      ];
      // First-run: proactively introduce the two autonomy modes (project pages only).
      if (getPageContext() === "project" && !lsGet(AUTONOMY_INTRODUCED_KEY)) {
        initial.push({
          role: "assistant",
          content: t("helpBot.autonomy.intro", "Vill du att jag frågar först innan jag ändrar något, eller fixar säkra saker direkt? Du kan byta när som helst."),
          actions: [
            { labelKey: "helpBot.autonomy.suggest", fallback: "Föreslå först", action: "set_autonomy_suggest", icon: <MessageCircle className="h-3 w-3" /> },
            { labelKey: "helpBot.autonomy.chooseAutopilot", fallback: "Slå på Autopilot", action: "set_autonomy_autopilot", icon: <Sparkles className="h-3 w-3" /> },
          ],
        });
      }
      setMessages(initial);

      // Undo survives reloads: a fresh thread means any recent un-undone batch
      // lost its Undo button — offer it back from the persisted stack.
      const pid = useRenaidaStore.getState().projectId;
      if (pid && offeredUndoRef.current !== pid) {
        offeredUndoRef.current = pid;
        void fetchLatestUndoable(pid).then((r) => {
          if (!r) return;
          setMessages((prev) => (prev.length <= 2 ? [...prev, {
            role: "assistant",
            content: t("helpBot.agent.restorableUndo", {
              defaultValue: "Senaste ändringen jag gjorde här: ”{{label}}” — den går fortfarande att ångra.",
              label: r.label,
            }),
            undo: r.ops,
            undoStackId: r.id,
            projectId: pid,
          }] : prev));
        }).catch(() => {});
      }
    }
    // Desktop: focus for immediate typing. Mobile: DON'T — autofocus pops the
    // keyboard over the voice-first entry the moment the panel opens.
    if (open && !isMobile) {
      inputRef.current?.focus();
    }
  }, [open, messages.length, buildGreeting, t, isMobile, setMessages]);

  // Update greeting when reminders change (if user hasn't sent any messages yet)
  useEffect(() => {
    if (open && messages.length === 1 && messages[0].role === "assistant") {
      const greeting = buildGreeting();
      if (greeting.content !== messages[0].content) {
        setMessages([{ role: "assistant", content: greeting.content, actions: greeting.actions }]);
      }
    }
  }, [renaidaReminders.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const submitFeedback = useCallback(async (text: string, type: "bug" | "suggestion" | "other") => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase.functions.invoke("send-feedback", {
        body: {
          message: text,
          email: user?.email,
          type,
          pageUrl: window.location.href,
          userAgent: navigator.userAgent,
          userId: user?.id,
        },
      });

      if (error) throw error;

      const confirmMsg = type === "bug"
        ? t("helpBot.bugSentConfirm")
        : type === "suggestion"
          ? t("helpBot.suggestionSentConfirm")
          : t("helpBot.otherSentConfirm");

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: confirmMsg,
          actions: [
            { labelKey: "helpBot.addMore", fallback: "Add more details", action: "add_more" },
            { labelKey: "helpBot.backToChat", fallback: "Back to chat", action: "back_to_chat" },
          ],
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: t("helpBot.feedbackError"),
        },
      ]);
    } finally {
      setFeedbackMode(null);
      setLoading(false);
    }
  }, [t]);

  const sendMessage = useCallback(async (text: string, opts?: { skipUserMessage?: boolean }) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = { role: "user", content: text.trim() };
    // When falling back from the capture path, the user bubble is already shown.
    if (!opts?.skipUserMessage) {
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
    }

    // If in feedback mode, submit as feedback
    if (feedbackMode) {
      await submitFeedback(text.trim(), feedbackMode);
      return;
    }

    setLoading(true);

    try {
      const allConversation = [...messages.filter((m) => m === messages[0] ? false : true), userMsg]
        .map((m) => ({ role: m.role, content: m.content }));

      if (allConversation.length === 0) {
        allConversation.push({ role: userMsg.role, content: userMsg.content });
      }

      const conversationMessages = allConversation.slice(-8);

      const { projectCountry, projectId } = useRenaidaStore.getState();
      const { data, error } = await supabase.functions.invoke("help-bot", {
        body: { messages: conversationMessages, language: i18n.language?.slice(0, 2) || "sv", userType, projectCountry, userName, projectId },
      });

      if (error) throw error;

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply || t("helpBot.errorMessage"),
          actions: [
            { labelKey: "helpBot.goBack", fallback: "Back", action: "reset_chat", icon: <ArrowLeft className="h-3 w-3" /> },
          ],
        },
      ]);
      flashRenaida("talk", 1600);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: t("helpBot.errorMessage"),
          actions: [
            { labelKey: "helpBot.goBack", fallback: "Back", action: "reset_chat", icon: <ArrowLeft className="h-3 w-3" /> },
          ],
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages, t, i18n.language, userType, userName, feedbackMode, submitFeedback, flashRenaida]);

  // Apply accepted proposals, emit telemetry, append a result bubble (with Undo),
  // and refresh dependent views. Shared by manual confirm and auto-apply (Fas 2).
  const applyAndReport = useCallback(async (
    accepted: AgentProposal[],
    projectId: string,
    opts: { auto: boolean; corrected?: number; sourceText?: string },
  ) => {
    setApplying(true);
    const result = await applyProposals(accepted, projectId, opts.sourceText);
    setApplying(false);

    analytics.capture(AnalyticsEvents.RENAIDA_APPLIED, {
      ...summarizeProposals(result.applied),
      failed: result.failed.length,
      corrected: opts.corrected ?? 0,
      auto: opts.auto,
    });

    // USER_FACING_ errors are written for the user (e.g. the broken-down-budget
    // refusal) — show them verbatim instead of the generic failure line.
    const userFacing = result.failed.find((f) => f.error.startsWith("USER_FACING_"))?.error.replace("USER_FACING_", "");
    // Bullet receipt: what was actually executed, with concrete values (Carl
    // 8 Jul: a bare "genomförde 1 ändring(ar)" says nothing to come back to).
    // Each bullet that created or changed an object IS the link to it (Carl
    // 9 Jul) — created rooms/tasks/orders and edited tasks open on tap.
    const pathForProposal = (p: AgentProposal): string | undefined => {
      const created = result.created.find((c) => c.proposalId === p.id);
      if (created) {
        if (created.type === "room") return `/projects/${projectId}?room=${created.id}`;
        return `/projects/${projectId}?tab=${created.type === "purchase" ? "purchases" : "tasks"}&entityId=${created.id}`;
      }
      const a = p.action;
      const taskId = "taskId" in a && a.taskId
        ? a.taskId
        : a.type === "add_note" && a.target === "task"
          ? a.targetId
          : undefined;
      if (taskId && result.modified.some((m) => m.id === taskId)) {
        return `/projects/${projectId}?tab=tasks&entityId=${taskId}`;
      }
      return undefined;
    };
    const bulletFor = (p: AgentProposal): string => {
      const details = actionDetails(p.action, t, i18n.language);
      const path = pathForProposal(p);
      const summary = path ? `[${p.summary}](open:${path})` : p.summary;
      return `• ${summary}${details.length ? ` — ${details.join(" · ")}` : ""}`;
    };
    const appliedList = result.applied.map(bulletFor).join("\n");
    const content = result.failed.length === 0
      ? (opts.auto && result.applied.length === 1
          ? `${t("helpBot.agent.autoAppliedIntro", "Klart automatiskt — det här fixade jag direkt:")}\n${appliedList}`
          : appliedList
            ? `${t("helpBot.agent.appliedIntro", { count: result.applied.length })}\n${appliedList}`
            : t("helpBot.agent.applied", { count: result.applied.length }))
      : result.applied.length === 0
        ? (userFacing ?? t("helpBot.agent.allFailed"))
        : `${t("helpBot.agent.partialFailed", { applied: result.applied.length, failed: result.failed.length })}${userFacing ? ` ${userFacing}` : ""}${appliedList ? `\n${appliedList}` : ""}`;

    setMessages((prev) => [...prev, { role: "assistant", content, undo: result.undo.length ? result.undo : undefined, undoStackId: result.undoStackId ?? undefined, projectId }]);
    if (result.applied.length > 0) {
      // Overview cards (useOverviewData) are not React Query — nudge them to refetch.
      window.dispatchEvent(new CustomEvent("renaida-data-changed", { detail: { projectId } }));
      flashRenaida("happy", 2000);

      // Progressive-trust nudge: after she's landed a few manual confirms cleanly,
      // proactively offer autopilot — once. Only in suggest mode, only if not auto.
      if (!opts.auto && !opts.corrected && useRenaidaStore.getState().autonomy === "suggest" && !lsGet(AUTOPILOT_NUDGED_KEY)) {
        const count = (parseInt(lsGet(CONFIRM_COUNT_KEY) ?? "0", 10) || 0) + 1;
        lsSet(CONFIRM_COUNT_KEY, String(count));
        if (count >= NUDGE_AFTER_CONFIRMS) {
          lsSet(AUTOPILOT_NUDGED_KEY, "1");
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: t("helpBot.autonomy.nudge", "Jag har landat några uppdateringar rätt nu. Vill du att jag fixar säkra saker direkt istället för att fråga varje gång? (Autopilot — alltid med Ångra.)"),
            actions: [
              { labelKey: "helpBot.autonomy.chooseAutopilot", fallback: "Slå på Autopilot", action: "nudge_enable_autopilot", icon: <Sparkles className="h-3 w-3" /> },
              { labelKey: "helpBot.autonomy.notNow", fallback: "Inte nu", action: "dismiss_nudge" },
            ],
          }]);
        }
      }
    }
    return result;
  }, [t, i18n.language, flashRenaida]);

  // --- Agentic capture: route a quick update → proposals → ConfirmDiff (or auto-apply) ---
  // With fallbackToChat (the unified entry): when the router finds no actionable
  // instruction, the SAME text flows into the regular chat instead of dead-ending
  // in "hittade inget" — one box, one behaviour, no channel to pick wrong.
  const captureUpdate = useCallback(async (text: string, kind: "text" | "voice_transcript", opts?: { fallbackToChat?: boolean }) => {
    if (!text.trim() || capturing || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: text.trim() }]);
    setInput("");

    // Deterministic undo intent (loop-varv 14, bugg 2): "ångra …" must never go
    // to the LLM — the router can only propose forward actions, so it answered
    // in circles. Reverse the latest undoable receipt directly instead.
    if (/^\s*(ångra|angra|undo)\b/i.test(text) && text.trim().length <= 80) {
      const lastUndoable = [...messagesCache]
        .map((m, i) => ({ m, i }))
        .filter(({ m }) => !!m.undo?.length)
        .pop();
      if (lastUndoable) {
        void handleUndoRef.current?.(lastUndoable.i, lastUndoable.m.undo!, lastUndoable.m.projectId, lastUndoable.m.undoStackId);
        return;
      }
      // Reload fallback: the thread is gone but the batch is persisted in the
      // undo stack — "allt går att ångra" must survive a page load.
      const storeProjectId = useRenaidaStore.getState().projectId;
      if (storeProjectId) {
        const restorable = await fetchLatestUndoable(storeProjectId).catch(() => null);
        if (restorable) {
          setCapturing(true);
          try {
            await undoProposals(restorable.ops, storeProjectId, restorable.id);
            analytics.capture(AnalyticsEvents.RENAIDA_UNDONE, { count: restorable.ops.length, restored: true });
            window.dispatchEvent(new CustomEvent("renaida-data-changed", { detail: { projectId: storeProjectId } }));
            setMessages((prev) => [...prev, { role: "assistant", content: t("helpBot.agent.undone") }]);
          } finally {
            setCapturing(false);
          }
          return;
        }
      }
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: t("helpBot.agent.nothingToUndo", "Det finns inget kvar att ångra i den här konversationen — säg vad du vill ändra så fixar jag det."),
      }]);
      return;
    }

    let projectId = useRenaidaStore.getState().projectId;
    if (!projectId) {
      // Outside a project (e.g. the start page): act on the user's most
      // relevant project instead of silently dropping to chat (Carl 2026-07-07,
      // iPhone finding). Announce which project once so it's never implicit.
      const fallback = await resolveFallbackProject().catch(() => null);
      if (fallback) {
        projectId = fallback.id;
        if (announcedFallbackRef.current !== fallback.id) {
          announcedFallbackRef.current = fallback.id;
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: t("helpBot.agent.usingProject", { name: fallback.name }),
          }]);
        }
      }
    }
    if (!projectId) {
      if (opts?.fallbackToChat) {
        void sendMessage(text, { skipUserMessage: true });
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: t("helpBot.agent.noProject") }]);
      return;
    }

    setCapturing(true);
    wakeRenaida();
    try {
      const res = await routeAgentInput({ kind, content: text.trim() }, projectId, i18n.language?.slice(0, 2) || "sv");
      // Pre-Genomför refusals (loop-varv 14, B3/B4): shown BEFORE the card so a
      // partially-refused multi-field update never promises the refused part.
      if (res.refusals?.length) {
        setMessages((prev) => [...prev, { role: "assistant", content: res.refusals!.join("\n\n") }]);
      }
      if (!res.proposals.length) {
        analytics.capture(AnalyticsEvents.RENAIDA_PROPOSED, { kind, count: 0, resolved: false, fellBackToChat: !!opts?.fallbackToChat, refused: !!res.refusals?.length });
        if (res.refusals?.length) {
          // The refusal IS the answer — don't re-ask the chat model.
        } else if (opts?.fallbackToChat) {
          setCapturing(false);
          void sendMessage(text, { skipUserMessage: true });
          return;
        } else {
          setMessages((prev) => [...prev, { role: "assistant", content: t("helpBot.agent.noProposals") }]);
        }
      } else {
        const s = summarizeProposals(res.proposals);
        const single = res.proposals.length === 1 ? res.proposals[0] : null;
        const autopilot = useRenaidaStore.getState().autonomy === "autopilot";
        if (autopilot && single && qualifiesForAutoApply(single)) {
          // Progressive trust: very sure + single action → do it now, offer Undo.
          analytics.capture(AnalyticsEvents.RENAIDA_PROPOSED, { kind, resolved: true, auto: true, ...s });
          flashRenaida("talk", 1400);
          await applyAndReport([single], projectId, {
            auto: true,
            sourceText: text.trim(),
          });
          return;
        }
        analytics.capture(AnalyticsEvents.RENAIDA_PROPOSED, { kind, resolved: true, ...s });
        setMessages((prev) => [...prev, { role: "assistant", content: "", proposals: res.proposals, projectId, sourcePhrase: text.trim() }]);
      }
      flashRenaida("talk", 1400);
    } catch {
      if (opts?.fallbackToChat) {
        setCapturing(false);
        void sendMessage(text, { skipUserMessage: true });
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: t("helpBot.agent.routeError") }]);
    } finally {
      setCapturing(false);
    }
  }, [capturing, loading, t, i18n.language, flashRenaida, wakeRenaida, applyAndReport, sendMessage]);

  // Unified send (Enter / arrow button): capture-first with chat fallback.
  // In feedback mode the text is feedback, never an action.
  const handleSend = useCallback(() => {
    if (feedbackMode) sendMessage(input);
    else captureUpdate(input, "text", { fallbackToChat: true });
  }, [input, feedbackMode, sendMessage, captureUpdate]);

  // Voice error → a spoken-to message in the thread, never a silently dead mic.
  const appendMicError = useCallback((kind: "denied" | "failed") => {
    setMessages((prev) => [...prev, {
      role: "assistant",
      content: kind === "denied"
        ? t("helpBot.agent.micDenied", "Jag får inte använda mikrofonen — kolla webbläsarens mikrofonbehörighet, eller skriv din uppdatering här istället.")
        : t("helpBot.agent.micFailed", "Mikrofonen ville inte riktigt — prova igen, eller skriv din uppdatering här istället."),
    }]);
  }, [t]);

  // Legacy Web Speech path — fallback only, for browsers without MediaRecorder.
  const startWebSpeechCapture = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      inputRef.current?.focus();
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const langMap: Record<string, string> = { sv: "sv-SE", en: "en-US", de: "de-DE", fr: "fr-FR", es: "es-ES" };
    const rec = new SR();
    rec.lang = langMap[i18n.language] || i18n.language;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0]?.[0]?.transcript ?? "";
      setListening(false);
      if (transcript.trim()) captureUpdate(transcript, "voice_transcript", { fallbackToChat: true });
    };
    rec.onerror = (e: Event & { error?: string }) => {
      setListening(false);
      // A silently dying mic reads as a dead button — tell the user what happened.
      if (e.error !== "aborted") {
        appendMicError(e.error === "not-allowed" ? "denied" : "failed");
      }
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }, [listening, i18n.language, captureUpdate, appendMicError]);

  // Primary voice path: MediaRecorder → transcribe-audio edge fn (Whisper).
  // Works on iOS Safari (no Web Speech there) and hears Swedish building
  // terminology far better than the browser recognizer on Android/desktop.
  const recorder = useVoiceRecorder({
    language: i18n.language || "sv",
    onTranscript: (text) => captureUpdate(text, "voice_transcript", { fallbackToChat: true }),
    onError: (kind) => {
      if (kind === "not-allowed") appendMicError("denied");
      else if (kind === "transcribe-failed") appendMicError("failed");
      else startWebSpeechCapture();
    },
  });

  const startVoiceCapture = useCallback(() => {
    if (recorder.state === "recording") { recorder.stop(); return; }
    if (recorder.state === "requesting") { recorder.cancel(); return; }
    if (recorder.state === "transcribing") return;
    if (isRecorderSupported()) { void recorder.start(); return; }
    startWebSpeechCapture();
  }, [recorder, startWebSpeechCapture]);

  // Mic button: typed text → route as action; empty → start voice capture
  const handleCaptureClick = useCallback(() => {
    if (input.trim()) captureUpdate(input, "text", { fallbackToChat: true });
    else startVoiceCapture();
  }, [input, captureUpdate, startVoiceCapture]);

  // --- Document capture (D1): photograph/upload a receipt or invoice → the same
  // propose→confirm→undo loop as voice. Renaida conducts the existing
  // process-document-v2 brain; heavy documents (quotes/scopes) are guided to
  // their dedicated review surface instead of being mangled into an order.
  const handleDocumentSelected = useCallback(async (file: File) => {
    if (capturing || loading) return;

    // D3: words already typed when the file is picked travel WITH the document —
    // "här är kvittot från Bauhaus, lägg det på badrummet" guides extraction
    // and can attribute the order to a room.
    const userNote = input.trim();
    if (userNote) setInput("");
    setMessages((prev) => [...prev, {
      role: "user",
      content: userNote ? `📎 ${file.name} — ”${userNote}”` : `📎 ${file.name}`,
    }]);

    let projectId = useRenaidaStore.getState().projectId;
    if (!projectId) {
      const fallback = await resolveFallbackProject().catch(() => null);
      if (fallback) {
        projectId = fallback.id;
        if (announcedFallbackRef.current !== fallback.id) {
          announcedFallbackRef.current = fallback.id;
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: t("helpBot.agent.usingProject", { name: fallback.name }),
          }]);
        }
      }
    }
    if (!projectId) {
      setMessages((prev) => [...prev, { role: "assistant", content: t("helpBot.agent.noProject") }]);
      return;
    }

    setCapturing(true);
    wakeRenaida();
    try {
      const res = await captureDocument(file, { projectId, userNote: userNote || undefined });
      if (res.kind === "quote" || res.kind === "scope") {
        // D2 (Carl 2026-07-09): heavy documents deserve their full review surface —
        // open it FOR the user, prefilled. Photographed quotes can't ride the
        // text-extraction dialogs, so images keep the wayfinder message instead.
        const isPdf = (file.type || "").toLowerCase().includes("pdf") || file.name.toLowerCase().endsWith(".pdf");
        analytics.capture(AnalyticsEvents.RENAIDA_PROPOSED, { kind: "document", resolved: false, docType: res.kind, handoff: isPdf });
        if (isPdf) {
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: t(
              res.kind === "quote" ? "helpBot.agent.docQuoteHandoff" : "helpBot.agent.docScopeHandoff",
              res.kind === "quote"
                ? "Det här ser ut som en offert — jag öppnar granskningen så att du kan gå igenom rum, arbeten och belopp innan något sparas."
                : "Det här ser ut som en arbetsbeskrivning — jag öppnar planeringsimporten så att du kan granska rum och arbeten innan något sparas.",
            ),
          }]);
          setDocHandoff({ kind: res.kind, file, projectId });
          setOpen(false);
        } else {
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: t("helpBot.agent.docQuoteDetected", {
              defaultValue: "Det här ser ut som en offert eller ett underlag — den granskar du bäst med full genomgång under [Filer](open:/projects/{{projectId}}?tab=files). Ladda upp den där, så tolkas rum och arbeten åt dig.",
              projectId,
            }),
          }]);
        }
      } else if (res.kind === "unreadable") {
        analytics.capture(AnalyticsEvents.RENAIDA_PROPOSED, { kind: "document", resolved: false, docType: "unreadable" });
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: t("helpBot.agent.docUnreadable", "Jag kunde tyvärr inte läsa ut något ur dokumentet — prova ett skarpare foto rakt ovanifrån, en annan fil, eller registrera inköpet manuellt under Inköp."),
        }]);
      } else {
        const proposal: AgentProposal = {
          id: crypto.randomUUID(),
          summary: t(
            res.kind === "invoice" ? "helpBot.agent.docInvoiceSummary" : "helpBot.agent.docReceiptSummary",
            {
              defaultValue: res.kind === "invoice"
                ? "Faktura från {{vendor}} — sparas som inköpsorder (fakturerad)"
                : "Kvitto från {{vendor}} — sparas som inköpsorder (levererad)",
              vendor: res.action.vendorName,
            },
          ),
          confidence: res.confidence,
          action: res.action,
        };
        analytics.capture(AnalyticsEvents.RENAIDA_PROPOSED, { kind: "document", resolved: true, count: 1, actionTypes: ["import_purchase"] });
        setMessages((prev) => [...prev, { role: "assistant", content: "", proposals: [proposal], projectId, sourcePhrase: file.name }]);
      }
      flashRenaida("talk", 1400);
    } catch {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: t("helpBot.agent.docError", "Dokumentläsningen gick fel — prova igen om en stund, eller registrera inköpet manuellt under Inköp."),
      }]);
    } finally {
      setCapturing(false);
    }
  }, [capturing, loading, input, t, wakeRenaida, flashRenaida, setMessages]);

  // D2: the dedicated review dialog finished importing — acknowledge in the feed
  // so the conversation reflects what actually happened, and nudge data consumers.
  const handleDocHandoffComplete = useCallback(() => {
    const handoff = docHandoff;
    analytics.capture(AnalyticsEvents.RENAIDA_APPLIED, { kind: "document_handoff", docType: handoff?.kind });
    if (handoff) {
      window.dispatchEvent(new CustomEvent("renaida-data-changed", { detail: { projectId: handoff.projectId } }));
    }
    setMessages((prev) => [...prev, {
      role: "assistant",
      content: t("helpBot.agent.docHandoffDone", "Klart — dokumentet är inläst och rum, arbeten och belopp ligger nu i projektet."),
    }]);
  }, [docHandoff, t]);

  const handleApplyProposals = useCallback(async (msgIndex: number, accepted: AgentProposal[], original: AgentProposal[], phrase: string, msgProjectId?: string) => {
    const projectId = msgProjectId ?? useRenaidaStore.getState().projectId;
    if (!projectId) return;

    // Correction signal: a task-targeting proposal whose accepted taskId differs
    // from what the router originally proposed = the user re-picked. Prime training
    // data — emit telemetry AND teach Renaida (phrase → intended work) for next time.
    const originalById = new Map(original.map((p) => [p.id, p]));
    const corrections = accepted.filter((a) => {
      const orig = originalById.get(a.id);
      const aTask = "taskId" in a.action ? a.action.taskId : undefined;
      const oTask = orig && "taskId" in orig.action ? orig.action.taskId : undefined;
      return aTask && oTask && aTask !== oTask;
    });
    if (corrections.length > 0) {
      analytics.capture(AnalyticsEvents.RENAIDA_CORRECTED, {
        count: corrections.length,
        actionTypes: corrections.map((c) => c.action.type),
      });
      for (const c of corrections) {
        const chosenId = "taskId" in c.action ? c.action.taskId : undefined;
        const chosenWork = c.candidates?.find((cand) => cand.id === chosenId)?.title;
        if (phrase && chosenWork) {
          void recordCorrection({ projectId, phrase, chosenWork });
        }
      }
    }

    // Clear the source proposals bubble, then apply + append the result.
    setMessages((prev) => prev.map((m, i) => (i === msgIndex ? { ...m, proposals: undefined } : m)));
    await applyAndReport(accepted, projectId, { auto: false, corrected: corrections.length, sourceText: phrase });
  }, [applyAndReport]);

  const handleUndo = useCallback(async (msgIndex: number, ops: UndoOp[], msgProjectId?: string, undoStackId?: string | null) => {
    setMessages((prev) => prev.map((m, i) => (i === msgIndex ? { ...m, undo: undefined } : m)));
    const projectId = msgProjectId ?? useRenaidaStore.getState().projectId;
    await undoProposals(ops, projectId ?? undefined, undoStackId);
    analytics.capture(AnalyticsEvents.RENAIDA_UNDONE, { count: ops.length });
    window.dispatchEvent(new CustomEvent("renaida-data-changed", { detail: { projectId } }));
    setMessages((prev) => [...prev, { role: "assistant", content: t("helpBot.agent.undone") }]);
  }, [t, setMessages]);

  // Lets captureUpdate (declared above) reach the undo path for typed "ångra …".
  const handleUndoRef = useRef<typeof handleUndo>();
  useEffect(() => { handleUndoRef.current = handleUndo; });

  const handleDismissProposals = useCallback((msgIndex: number) => {
    analytics.capture(AnalyticsEvents.RENAIDA_DISMISSED, {});
    setMessages((prev) =>
      prev.map((m, i) =>
        i === msgIndex ? { ...m, proposals: undefined, content: t("helpBot.agent.dismissed") } : m,
      ),
    );
  }, [t]);

  const startFeedbackMode = useCallback((type: FeedbackMode) => {
    if (!type) return;
    setFeedbackMode(type);

    const prompts: Record<string, string> = {
      bug: t("helpBot.bugPrompt"),
      suggestion: t("helpBot.suggestionPrompt"),
      other: t("helpBot.otherPrompt"),
    };

    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: prompts[type],
        actions: [
          { labelKey: "helpBot.goBack", fallback: "Back", action: "reset_chat", icon: <ArrowLeft className="h-3 w-3" /> },
        ],
      },
    ]);
    inputRef.current?.focus();
  }, [t]);

  const setAutonomyChoice = useCallback((mode: RenaidaAutonomy, source: string) => {
    useRenaidaStore.getState().setAutonomy(mode);
    void setAutonomyMode(mode);
    lsSet(AUTONOMY_INTRODUCED_KEY, "1");
    if (mode === "autopilot") lsSet(AUTOPILOT_NUDGED_KEY, "1"); // already on → no future nudge
    analytics.capture(AnalyticsEvents.RENAIDA_AUTONOMY_CHANGED, { mode, source });
    flashRenaida(mode === "autopilot" ? "happy" : "idle", 1500);
    setMessages((prev) => [...stripAutonomyIntro(prev), {
      role: "assistant",
      content: t(mode === "autopilot" ? "helpBot.autonomy.enabledAutopilot" : "helpBot.autonomy.enabledSuggest",
        mode === "autopilot" ? "Autopilot på — jag fixar säkra saker direkt, alltid med Ångra." : "Okej, jag frågar först innan jag ändrar något."),
    }]);
  }, [t, flashRenaida]);

  const handleInlineAction = useCallback((action: string) => {
    if (action === "set_autonomy_suggest") {
      setAutonomyChoice("suggest", "intro");
    } else if (action === "set_autonomy_autopilot") {
      setAutonomyChoice("autopilot", "intro");
    } else if (action === "nudge_enable_autopilot") {
      setAutonomyChoice("autopilot", "nudge");
    } else if (action === "dismiss_nudge") {
      lsSet(AUTOPILOT_NUDGED_KEY, "1");
      setMessages((prev) => [...prev, { role: "assistant", content: t("helpBot.autonomy.nudgeDismissed", "Inga problem — jag frågar först som vanligt.") }]);
    } else if (action === "bug") {
      startFeedbackMode("bug");
    } else if (action === "suggestion") {
      startFeedbackMode("suggestion");
    } else if (action === "other") {
      startFeedbackMode("other");
    } else if (action === "add_more") {
      // Re-enter the same feedback mode type for follow-up
      setFeedbackMode("other");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: t("helpBot.addMorePrompt") },
      ]);
      inputRef.current?.focus();
    } else if (action === "back_to_chat") {
      setFeedbackMode(null);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: t("helpBot.backToChatMsg") },
      ]);
    } else if (action === "reset_chat") {
      // Reset to initial state — show greeting + quick prompts again
      setFeedbackMode(null);
      const greeting = buildGreeting();
      setMessages([
        {
          role: "assistant",
          content: greeting.content,
          actions: greeting.actions,
        },
      ]);
    } else if (action === "start_feedback") {
      // Show the feedback type picker
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: t("helpBot.feedbackTypePicker"),
          actions: [
            { labelKey: "helpBot.quick.reportBug", fallback: "Report a bug", action: "bug" },
            { labelKey: "helpBot.quick.suggestion", fallback: "Suggestion", action: "suggestion" },
            { labelKey: "helpBot.quick.otherFeedback", fallback: "Other", action: "other" },
          ],
        },
      ]);
    } else if (action.startsWith("navigate:")) {
      const target = action.replace("navigate:", "");
      // Dispatch a custom event that OverviewTab listens to for navigation
      window.dispatchEvent(new CustomEvent("renaida-navigate", { detail: target }));
      setOpen(false);
    } else if (action.startsWith("open:")) {
      // Router path — receipt bullets link straight to the object they touched
      navigate(action.replace("open:", ""));
      setOpen(false);
    }
  }, [startFeedbackMode, t, buildGreeting, setAutonomyChoice, navigate]);

  const handleDismissReminder = useCallback((reminderId: string) => {
    // Dispatch event to OverviewTab to dismiss the reminder
    window.dispatchEvent(new CustomEvent("renaida-dismiss-reminder", { detail: reminderId }));
  }, []);

  const handleQuickPrompt = useCallback((prompt: QuickPrompt) => {
    if (prompt.action) {
      handleInlineAction(prompt.action);
    } else if (prompt.message) {
      sendMessage(prompt.message);
    }
  }, [sendMessage, handleInlineAction]);

  // Quick prompts shown before first user message
  const quickPrompts: QuickPrompt[] = userType === "contractor" ? [
    {
      icon: <Lightbulb className="h-3.5 w-3.5 shrink-0" />,
      labelKey: "helpBot.quick.getStarted",
      fallback: "Getting started",
      message: t("helpBot.quickMessage.getStarted"),
    },
    {
      icon: <FileText className="h-3.5 w-3.5 shrink-0" />,
      labelKey: "helpBot.quick.quotesTips",
      fallback: "Quotes & invoicing",
      message: t("helpBot.quickMessage.quotesTips"),
    },
    {
      icon: <Wrench className="h-3.5 w-3.5 shrink-0" />,
      labelKey: "helpBot.quick.spacePlanner",
      fallback: "Space Planner guide",
      message: t("helpBot.quickMessage.spacePlanner"),
    },
    {
      icon: <BookOpen className="h-3.5 w-3.5 shrink-0" />,
      labelKey: "helpBot.quick.budgetTips",
      fallback: "Budget & cost tracking",
      message: t("helpBot.quickMessage.budgetTips"),
    },
  ] : [
    {
      icon: <Lightbulb className="h-3.5 w-3.5 shrink-0" />,
      labelKey: "helpBot.quick.getStarted",
      fallback: "Getting started",
      message: t("helpBot.quickMessage.getStarted"),
    },
    {
      icon: <Wrench className="h-3.5 w-3.5 shrink-0" />,
      labelKey: "helpBot.quick.planningHelp",
      fallback: "Planning & quotes",
      message: t("helpBot.quickMessage.planningHelp"),
    },
    {
      icon: <BookOpen className="h-3.5 w-3.5 shrink-0" />,
      labelKey: "helpBot.quick.budgetTips",
      fallback: "Budget & cost tracking",
      message: t("helpBot.quickMessage.budgetTips"),
    },
    {
      icon: <FileText className="h-3.5 w-3.5 shrink-0" />,
      labelKey: "helpBot.quick.permits",
      fallback: "Building permits & regulations",
      message: t("helpBot.quickMessage.permits"),
    },
  ];

  // Entry chips + voice hero: show until the user has actually said something.
  // <= 2 keeps the hero visible alongside the first-run autonomy intro (before,
  // the intro pushed length past 1 and hid the primary voice entry on first run).
  const showQuickPrompts =
    messages.length <= 2 &&
    !messages.some((m) => m.role === "user" || m.proposals) &&
    !loading && !feedbackMode && !capturing;
  const voiceBusy = recorder.state !== "idle";
  const onProjectPage = getPageContext() === "project";
  const rankedReminders = [...renaidaReminders].sort(
    (a, b) => (REMINDER_PRIORITY[a.id] ?? 6) - (REMINDER_PRIORITY[b.id] ?? 6),
  );

  const placeholderText = feedbackMode === "bug"
    ? t("helpBot.bugPlaceholder")
    : feedbackMode === "suggestion"
      ? t("helpBot.suggestionPlaceholder")
      : feedbackMode === "other"
        ? t("helpBot.otherPlaceholder", "Write your message...")
        : t("helpBot.placeholder");

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 md:bottom-6 md:right-6 z-50 h-14 w-14 rounded-full shadow-lg bg-white border-2 border-primary/20 hover:border-primary/40 transition-colors flex items-center justify-center"
          aria-label={t("helpBot.title", "Renaida")}
        >
          <RenaidaAvatar state={renaidaState} size={50} />
          {reminderCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-orange-500 text-white text-[11px] font-bold flex items-center justify-center shadow-sm">
              {reminderCount}
            </span>
          )}
        </button>
      )}

      {open && (
        <div
          ref={panelRef}
          className="fixed inset-0 z-50 flex flex-col bg-background h-[100dvh] md:inset-auto md:bottom-6 md:right-6 md:h-[500px] md:w-[400px] md:max-w-[calc(100%-2rem)] md:rounded-xl md:border md:shadow-2xl"
          // iOS keyboard overlays fixed elements — size the panel to the visual
          // viewport while the keyboard is up so the input row stays reachable.
          style={vvBox ? { height: vvBox.height, top: vvBox.offsetTop } : undefined}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <RenaidaAvatar state={renaidaState} size={32} />
              <h3 className="font-semibold text-sm">
                {t("helpBot.title", "Renaida")}
              </h3>
            </div>
            <div className="flex items-center gap-1">
              {!feedbackMode && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-1.5 px-2.5 text-xs text-muted-foreground md:h-7 md:gap-1 md:px-2"
                  onClick={handleToggleAutonomy}
                  title={t(autonomy === "autopilot" ? "helpBot.autonomy.autopilotHint" : "helpBot.autonomy.suggestHint")}
                >
                  {autonomy === "autopilot"
                    ? <Sparkles className="h-3.5 w-3.5 text-primary" />
                    : <MessageCircle className="h-3.5 w-3.5" />}
                  {/* Always labeled: an unlabeled icon that silently flips write
                      autonomy is a mis-tap hazard, especially on mobile. */}
                  <span>
                    {t(autonomy === "autopilot" ? "helpBot.autonomy.autopilot" : "helpBot.autonomy.suggest")}
                  </span>
                </Button>
              )}
              {feedbackMode && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={() => {
                    setFeedbackMode(null);
                    setMessages((prev) => [
                      ...prev,
                      { role: "assistant", content: t("helpBot.feedbackCancelled") },
                    ]);
                  }}
                >
                  {t("helpBot.cancelFeedback")}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 md:h-7 md:w-7"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Feedback mode indicator */}
          {feedbackMode && (
            <div className={`px-4 py-1.5 text-xs font-medium flex items-center gap-1.5 ${
              feedbackMode === "bug" ? "bg-red-50 text-red-700" :
              feedbackMode === "suggestion" ? "bg-blue-50 text-blue-700" :
              "bg-amber-50 text-amber-700"
            }`}>
              {feedbackMode === "bug" && "🐛"}
              {feedbackMode === "suggestion" && "💡"}
              {feedbackMode === "other" && "✉️"}
              {feedbackMode === "bug"
                ? t("helpBot.bugModeLabel")
                : feedbackMode === "suggestion"
                  ? t("helpBot.suggestionModeLabel")
                  : t("helpBot.otherModeLabel", "Your message will be sent to the team")}
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((msg, i) => (
              <div key={i}>
                {msg.proposals && msg.proposals.length > 0 ? (
                  <div className="flex items-start gap-2 justify-start">
                    <RenaidaAvatar state="idle" size={28} className="shrink-0 mt-1" />
                    <div className="max-w-[85%] flex-1">
                      <ConfirmDiff
                        proposals={msg.proposals}
                        applying={applying}
                        onConfirm={(accepted) => handleApplyProposals(i, accepted, msg.proposals ?? [], msg.sourcePhrase ?? messages[i - 1]?.content ?? "", msg.projectId)}
                        onDismiss={() => handleDismissProposals(i)}
                      />
                    </div>
                  </div>
                ) : (
                <div className={`flex items-end gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <RenaidaAvatar state="idle" size={28} className="shrink-0 mb-0.5" />
                  )}
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <MessageContent content={msg.content} onNavigate={handleInlineAction} onDismiss={handleDismissReminder} />
                  </div>
                  {msg.role === "user" && (
                    userAvatar
                      ? <img src={userAvatar} alt="" className="h-6 w-6 rounded-full object-cover shrink-0 mb-0.5" />
                      : <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mb-0.5">
                          <span className="text-[10px] font-medium text-primary">{userName?.[0]?.toUpperCase() || "?"}</span>
                        </div>
                  )}
                </div>
                )}
                {/* Inline action buttons below a message */}
                {msg.actions && msg.actions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 ml-1">
                    {msg.actions.map((action, j) => (
                      <button
                        key={j}
                        onClick={() => handleInlineAction(action.action)}
                        className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3.5 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors md:gap-1 md:px-2.5 md:py-1 md:text-xs"
                      >
                        {action.icon}
                        {t(action.labelKey, action.fallback)}
                      </button>
                    ))}
                  </div>
                )}
                {/* Undo button for an applied agentic action */}
                {msg.undo && msg.undo.length > 0 && (
                  <div className="mt-2 ml-1">
                    <button
                      onClick={() => handleUndo(i, msg.undo!, msg.projectId, msg.undoStackId)}
                      className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3.5 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors md:gap-1 md:px-2.5 md:py-1 md:text-xs"
                    >
                      <ArrowLeft className="h-3.5 w-3.5 md:h-3 md:w-3" />
                      {t("helpBot.agent.undo")}
                    </button>
                  </div>
                )}
              </div>
            ))}

            {/* Entry: voice hero + grouped chips + value-ranked reminders */}
            {showQuickPrompts && (
              <div className="space-y-2.5 pt-1">
                {/* Voice hero — the primary way to drive Renaida */}
                <button
                  onClick={startVoiceCapture}
                  disabled={recorder.state === "transcribing"}
                  className={`w-full flex items-center gap-3 rounded-xl px-4 py-4 md:py-3 text-left text-primary-foreground shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                    recorder.state === "recording" ? "bg-red-600 hover:bg-red-600/90" : "bg-primary hover:bg-primary/90"
                  }`}
                >
                  <span className={`flex h-10 w-10 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15 ${recorder.state === "recording" ? "animate-pulse" : ""}`}>
                    {recorder.state === "recording"
                      ? <Square className="h-4 w-4 fill-current" />
                      : recorder.state === "transcribing" || recorder.state === "requesting"
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Mic className="h-5 w-5 md:h-4 md:w-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      {recorder.state === "recording"
                        ? `${t("helpBot.agent.recording", "Spelar in — tryck för att stoppa")} · ${Math.floor(recorder.elapsedSec / 60)}:${String(recorder.elapsedSec % 60).padStart(2, "0")}`
                        : recorder.state === "transcribing"
                          ? t("helpBot.agent.transcribing", "Tolkar rösten…")
                          : recorder.state === "requesting"
                            ? t("helpBot.agent.micRequesting", "Väntar på mikrofonen…")
                            : t("helpBot.agent.voiceHero", "Berätta vad som hänt")}
                    </span>
                    <span className="block text-xs text-primary-foreground/70">{t("helpBot.agent.voiceHeroHint", "Säg eller skriv — jag fixar det i projektet")}</span>
                  </span>
                </button>

                {/* Help topics + a single feedback entry */}
                <div className="flex flex-wrap gap-2">
                  {quickPrompts.slice(0, 3).map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => handleQuickPrompt(prompt)}
                      className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      {prompt.icon}
                      {t(prompt.labelKey, prompt.fallback)}
                    </button>
                  ))}
                  <button
                    onClick={() => handleInlineAction("start_feedback")}
                    className="inline-flex items-center gap-1.5 rounded-full border border-dashed bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                    {t("helpBot.giveFeedback", "Ge feedback")}
                  </button>
                </div>

                {/* Reminders — value-ranked, collapsed by default */}
                {onProjectPage && rankedReminders.length > 0 && (
                  <div className="rounded-lg border bg-background/60">
                    <button
                      onClick={() => setRemindersExpanded((v) => !v)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="flex-1 text-left">
                        {t("helpBot.tipsFound", { count: rankedReminders.length, defaultValue: "Jag såg {{count}} saker att förbättra" })}
                      </span>
                      <ChevronDown className={`h-4 w-4 transition-transform ${remindersExpanded ? "rotate-180" : ""}`} />
                    </button>
                    {remindersExpanded && (
                      <ul className="space-y-1.5 px-3 pb-2.5">
                        {rankedReminders.map((r) => (
                          <li key={r.id} className="flex items-center gap-2 text-xs">
                            {r.actionTarget ? (
                              <button
                                onClick={() => handleInlineAction(`navigate:${r.actionTarget}`)}
                                className="flex-1 text-left text-primary hover:underline"
                              >
                                {t(r.titleKey)}
                              </button>
                            ) : (
                              <span className="flex-1 text-muted-foreground">{t(r.titleKey)}</span>
                            )}
                            <button
                              onClick={() => handleDismissReminder(r.id)}
                              className="shrink-0 text-muted-foreground/50 transition-colors hover:text-muted-foreground"
                              aria-label={t("helpBot.agent.dismiss", "Dismiss")}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            {(loading || capturing) && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground animate-pulse">
                  ...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input — swaps to a full-width recording bar while the mic is live,
              so the recording state is unmissable on a phone in a work glove. */}
          <div className="border-t px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-3 flex gap-2">
            {voiceBusy ? (
              <button
                onClick={() => {
                  if (recorder.state === "recording") recorder.stop();
                  else if (recorder.state === "requesting") recorder.cancel();
                }}
                disabled={recorder.state === "transcribing"}
                className={`flex h-12 md:h-10 flex-1 items-center justify-center gap-2.5 rounded-lg text-sm font-medium text-white transition-colors ${
                  recorder.state === "recording" ? "bg-red-600 hover:bg-red-600/90" : "bg-muted-foreground/60"
                }`}
              >
                {recorder.state === "recording" ? (
                  <>
                    <span className="h-2.5 w-2.5 rounded-full bg-white animate-pulse" />
                    {t("helpBot.agent.recording", "Spelar in — tryck för att stoppa")}
                    <span className="tabular-nums">{Math.floor(recorder.elapsedSec / 60)}:{String(recorder.elapsedSec % 60).padStart(2, "0")}</span>
                  </>
                ) : (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {recorder.state === "requesting"
                      ? t("helpBot.agent.micRequesting", "Väntar på mikrofonen…")
                      : t("helpBot.agent.transcribing", "Tolkar rösten…")}
                  </>
                )}
              </button>
            ) : (
              <>
                {/* Receipt/invoice photo or PDF — capture goes through the same
                    propose→confirm→undo loop as voice (D1/D2). image/* keeps the
                    iOS camera + library picker; PDFs ride the document path. */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void handleDocumentSelected(f);
                  }}
                />
                <Button
                  size="icon"
                  variant="outline"
                  className="h-11 w-11 md:h-9 md:w-9 shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading || capturing}
                  title={t("helpBot.agent.attachDocument", "Fota eller bifoga kvitto, faktura eller offert")}
                  aria-label={t("helpBot.agent.attachDocument", "Fota eller bifoga kvitto, faktura eller offert")}
                >
                  <Paperclip className="h-5 w-5 md:h-4 md:w-4" />
                </Button>
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={listening ? t("helpBot.agent.listening") : placeholderText}
                  className="h-11 md:h-9 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
                  disabled={loading || capturing}
                />
                <Button
                  size="icon"
                  variant={listening ? "default" : "outline"}
                  className={`h-11 w-11 md:h-9 md:w-9 shrink-0 ${listening ? "animate-pulse" : ""}`}
                  onClick={handleCaptureClick}
                  disabled={loading || capturing}
                  title={t("helpBot.agent.captureButton")}
                  aria-label={t("helpBot.agent.captureButton")}
                >
                  <Mic className="h-5 w-5 md:h-4 md:w-4" />
                </Button>
                <Button
                  size="icon"
                  className="h-11 w-11 md:h-9 md:w-9 shrink-0"
                  onClick={handleSend}
                  disabled={loading || capturing || !input.trim()}
                >
                  <Send className="h-5 w-5 md:h-4 md:w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* D2: prefilled handoff — Renaida conducts, the dedicated dialog reviews.
          Rendered outside the panel so the review survives the panel closing. */}
      {docHandoff?.kind === "quote" && (
        <QuoteReviewDialog
          projectId={docHandoff.projectId}
          open
          onOpenChange={(o) => { if (!o) setDocHandoff(null); }}
          file={docHandoff.file}
          onImportComplete={handleDocHandoffComplete}
        />
      )}
      {docHandoff?.kind === "scope" && (
        <PlanningSmartImportDialog
          projectId={docHandoff.projectId}
          open
          onOpenChange={(o) => { if (!o) setDocHandoff(null); }}
          initialFile={docHandoff.file}
          onImportComplete={handleDocHandoffComplete}
        />
      )}
    </>
  );
}
