import { useState, useRef, useEffect, useCallback } from "react";
import { Send, X, Lightbulb, BookOpen, Wrench, FileText, ArrowLeft, Mic, Sparkles, ChevronDown, MessageCircle } from "lucide-react";
import { useRenaidaStore, type RenaidaAutonomy } from "@/stores/renaidaStore";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { ConfirmDiff } from "@/components/agent/ConfirmDiff";
import { RenaidaAvatar, type RenaidaState } from "@/components/renaida/RenaidaAvatar";
import { routeAgentInput } from "@/services/agent/routeClient";
import { applyProposals, undoProposals } from "@/services/agent/applyProposals";
import { type AgentProposal, type UndoOp, TASK_MATCH_MIN_CONFIDENCE, isActionable } from "@/services/agent/types";
import { recordCorrection, getAutonomyMode, setAutonomyMode } from "@/services/agent/renaidaMemory";
import { fetchProactiveSuggestions, type RenaidaSuggestion } from "@/services/agent/renaidaSuggestions";
import { analytics, AnalyticsEvents } from "@/lib/analytics";

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

interface QuickPrompt {
  icon: React.ReactNode;
  labelKey: string;
  fallback: string;
  message?: string;
  action?: string;
}

type FeedbackMode = null | "bug" | "suggestion" | "other";

/**
 * MessageContent — Renders message text with:
 * - Clickable [text](navigate:target) links
 * - Dismiss buttons [x](dismiss:reminderId)
 */
function MessageContent({ content, onNavigate, onDismiss }: {
  content: string;
  onNavigate: (action: string) => void;
  onDismiss?: (id: string) => void;
}) {
  // Parse [text](navigate:target) and [x](dismiss:id) patterns
  const parts = content.split(/(\[[^\]]*\]\((?:navigate|dismiss):[^)]+\))/g);

  return (
    <>
      {parts.map((part, i) => {
        const navMatch = part.match(/^\[([^\]]+)\]\(navigate:([^)]+)\)$/);
        if (navMatch) {
          return (
            <span key={i} className="inline-flex items-center gap-1">
              <button
                className="text-primary hover:underline font-medium inline"
                onClick={() => onNavigate(`navigate:${navMatch[2]}`)}
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
        return <span key={i}>{part}</span>;
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [userType, setUserType] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode>(null);
  const [capturing, setCapturing] = useState(false);
  const [listening, setListening] = useState(false);
  const [applying, setApplying] = useState(false);
  const [renaidaFlash, setRenaidaFlash] = useState<RenaidaState | null>(null);
  const [renaidaAsleep, setRenaidaAsleep] = useState(false);
  const [remindersExpanded, setRemindersExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const flashTimerRef = useRef<number | undefined>(undefined);
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
    // Confirm the switch in the thread (Cowork: the label alone was too subtle).
    setMessages((prev) => [...prev, {
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

  // Reset conversation when language changes
  const currentLang = i18n.language;
  useEffect(() => {
    setMessages([]);
    setFeedbackMode(null);
  }, [currentLang]);

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
    }
    if (open) {
      inputRef.current?.focus();
    }
  }, [open, messages.length, buildGreeting, t]);

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

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = { role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

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

      const projectCountry = useRenaidaStore.getState().projectCountry;
      const { data, error } = await supabase.functions.invoke("help-bot", {
        body: { messages: conversationMessages, language: i18n.language, userType, projectCountry },
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
  }, [loading, messages, t, i18n.language, userType, feedbackMode, submitFeedback, flashRenaida]);

  const handleSend = useCallback(() => {
    sendMessage(input);
  }, [input, sendMessage]);

  // Apply accepted proposals, emit telemetry, append a result bubble (with Undo),
  // and refresh dependent views. Shared by manual confirm and auto-apply (Fas 2).
  const applyAndReport = useCallback(async (
    accepted: AgentProposal[],
    projectId: string,
    opts: { auto: boolean; corrected?: number; content?: string },
  ) => {
    setApplying(true);
    const result = await applyProposals(accepted, projectId);
    setApplying(false);

    analytics.capture(AnalyticsEvents.RENAIDA_APPLIED, {
      ...summarizeProposals(result.applied),
      failed: result.failed.length,
      corrected: opts.corrected ?? 0,
      auto: opts.auto,
    });

    const content = result.failed.length === 0
      ? (opts.content ?? t("helpBot.agent.applied", { count: result.applied.length }))
      : result.applied.length === 0
        ? t("helpBot.agent.allFailed")
        : t("helpBot.agent.partialFailed", { applied: result.applied.length, failed: result.failed.length });

    setMessages((prev) => [...prev, { role: "assistant", content, undo: result.undo.length ? result.undo : undefined }]);
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
  }, [t, flashRenaida]);

  // --- Agentic capture: route a quick update → proposals → ConfirmDiff (or auto-apply) ---
  const captureUpdate = useCallback(async (text: string, kind: "text" | "voice_transcript") => {
    if (!text.trim() || capturing || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: text.trim() }]);
    setInput("");

    const projectId = useRenaidaStore.getState().projectId;
    if (!projectId) {
      setMessages((prev) => [...prev, { role: "assistant", content: t("helpBot.agent.noProject") }]);
      return;
    }

    setCapturing(true);
    wakeRenaida();
    try {
      const res = await routeAgentInput({ kind, content: text.trim() }, projectId, i18n.language);
      if (!res.proposals.length) {
        analytics.capture(AnalyticsEvents.RENAIDA_PROPOSED, { kind, count: 0, resolved: false });
        setMessages((prev) => [...prev, { role: "assistant", content: t("helpBot.agent.noProposals") }]);
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
            content: t("helpBot.agent.autoApplied", { summary: single.summary }),
          });
          return;
        }
        analytics.capture(AnalyticsEvents.RENAIDA_PROPOSED, { kind, resolved: true, ...s });
        setMessages((prev) => [...prev, { role: "assistant", content: "", proposals: res.proposals }]);
      }
      flashRenaida("talk", 1400);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: t("helpBot.agent.routeError") }]);
    } finally {
      setCapturing(false);
    }
  }, [capturing, loading, t, i18n.language, flashRenaida, wakeRenaida, applyAndReport]);

  const startVoiceCapture = useCallback(() => {
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
      if (transcript.trim()) captureUpdate(transcript, "voice_transcript");
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }, [listening, i18n.language, captureUpdate]);

  // Mic button: typed text → route as action; empty → start voice capture
  const handleCaptureClick = useCallback(() => {
    if (input.trim()) captureUpdate(input, "text");
    else startVoiceCapture();
  }, [input, captureUpdate, startVoiceCapture]);

  const handleApplyProposals = useCallback(async (msgIndex: number, accepted: AgentProposal[], original: AgentProposal[], phrase: string) => {
    const projectId = useRenaidaStore.getState().projectId;
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
    await applyAndReport(accepted, projectId, { auto: false, corrected: corrections.length });
  }, [applyAndReport]);

  const handleUndo = useCallback(async (msgIndex: number, ops: UndoOp[]) => {
    setMessages((prev) => prev.map((m, i) => (i === msgIndex ? { ...m, undo: undefined } : m)));
    await undoProposals(ops);
    analytics.capture(AnalyticsEvents.RENAIDA_UNDONE, { count: ops.length });
    const projectId = useRenaidaStore.getState().projectId;
    window.dispatchEvent(new CustomEvent("renaida-data-changed", { detail: { projectId } }));
    setMessages((prev) => [...prev, { role: "assistant", content: t("helpBot.agent.undone") }]);
  }, [t]);

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
    setMessages((prev) => [...prev, {
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
    }
  }, [startFeedbackMode, t, buildGreeting, setAutonomyChoice]);

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

  const showQuickPrompts = messages.length <= 1 && !loading && !feedbackMode && !capturing;
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
          className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 h-14 w-14 rounded-full shadow-lg bg-white border-2 border-primary/20 hover:border-primary/40 transition-colors flex items-center justify-center"
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
          className="fixed inset-0 z-50 flex flex-col bg-background md:inset-auto md:bottom-6 md:right-6 md:h-[500px] md:w-[400px] md:max-w-[calc(100%-2rem)] md:rounded-xl md:border md:shadow-2xl"
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
                  className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                  onClick={handleToggleAutonomy}
                  title={t(autonomy === "autopilot" ? "helpBot.autonomy.autopilotHint" : "helpBot.autonomy.suggestHint")}
                >
                  {autonomy === "autopilot"
                    ? <Sparkles className="h-3.5 w-3.5 text-primary" />
                    : <MessageCircle className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">
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
                className="h-7 w-7"
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
                        onConfirm={(accepted) => handleApplyProposals(i, accepted, msg.proposals ?? [], messages[i - 1]?.content ?? "")}
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
                        className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
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
                      onClick={() => handleUndo(i, msg.undo!)}
                      className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      <ArrowLeft className="h-3 w-3" />
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
                  className="w-full flex items-center gap-3 rounded-xl bg-primary px-4 py-3 text-left text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15">
                    <Mic className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{t("helpBot.agent.voiceHero", "Berätta vad som hänt")}</span>
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

          {/* Input */}
          <div className="border-t px-3 py-3 flex gap-2">
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
              className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              disabled={loading || capturing}
            />
            <Button
              size="icon"
              variant={listening ? "default" : "outline"}
              className={`h-9 w-9 shrink-0 ${listening ? "animate-pulse" : ""}`}
              onClick={handleCaptureClick}
              disabled={loading || capturing}
              title={t("helpBot.agent.captureButton")}
              aria-label={t("helpBot.agent.captureButton")}
            >
              <Mic className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={handleSend}
              disabled={loading || capturing || !input.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
