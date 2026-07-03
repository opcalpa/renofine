import { useState, useRef, useEffect, useCallback } from "react";
import { Send, X, Lightbulb, BookOpen, Wrench, FileText, Bug, MessageSquarePlus, ArrowLeft, Mic } from "lucide-react";
import { useJuniorStore } from "@/stores/juniorStore";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { ConfirmDiff } from "@/components/agent/ConfirmDiff";
import { routeAgentInput } from "@/services/agent/routeClient";
import { applyProposals } from "@/services/agent/applyProposals";
import type { AgentProposal } from "@/services/agent/types";

interface Message {
  role: "user" | "assistant";
  content: string;
  /** Optional inline quick-action buttons rendered below this message */
  actions?: InlineAction[];
  /** When present, the message renders an agentic ConfirmDiff instead of a text bubble */
  proposals?: AgentProposal[];
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

export function HelpBot() {
  const { t, i18n } = useTranslation();
  const reminderCount = useJuniorStore((s) => s.reminderCount);
  const juniorReminders = useJuniorStore((s) => s.reminders);
  const juniorProjectName = useJuniorStore((s) => s.projectName);
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

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
    const page = getPageContext();
    const nameGreeting = userName ? `, ${userName}` : "";

    // Time-based hello
    const hello = t(`helpBot.timeGreeting.${timeKey}`, {
      defaultValue: timeKey === "morning" ? "God morgon" : timeKey === "afternoon" ? "Hej" : "God kväll",
    });

    // Role-specific flavor
    const roleIntro = userType === "homeowner"
      ? t("helpBot.roleIntro.homeowner", "I'm your personal renovation sidekick — here to help with everything from planning to punch list.")
      : userType === "contractor"
        ? t("helpBot.roleIntro.contractor", "I'm your project assistant — ready to help with quotes, scheduling, and keeping things on track.")
        : t("helpBot.roleIntro.default", "I'm your renovation expert and platform guide.");

    // Project reminders — shown as clickable links with dismiss buttons
    let reminderText = "";
    if (page === "project" && juniorReminders.length > 0) {
      const items = juniorReminders.slice(0, 4).map(r => {
        const dismiss = `[](dismiss:${r.id})`;
        if (r.actionTarget) {
          return `• [${t(r.titleKey)}](navigate:${r.actionTarget}) ${dismiss}`;
        }
        return `• ${t(r.titleKey)} ${dismiss}`;
      }).join("\n");
      reminderText = `\n\n${t("helpBot.reminderIntro", "I noticed a few things in your project:")}\n${items}`;
    }

    // Page-specific nudge (only if no reminders)
    let nudge = "";
    if (!reminderText) {
      if (page === "projects") {
        nudge = t("helpBot.nudge.projects", "Pick a project to dive into, or ask me anything about renovations!");
      } else if (page === "project") {
        nudge = t("helpBot.nudge.project", "I can see you're working on a project — ask me about next steps, building regulations, or how to use any feature.");
      }
    }

    const disclaimer = t("helpBot.disclaimerShort", "PS: For building regs I give general guidance — always double-check with your municipality.");

    return {
      content: `${hello}${nameGreeting}! 👋\n\n${roleIntro}${reminderText}\n\n${nudge ? nudge + "\n\n" : ""}${disclaimer}`,
    };
  }, [t, userType, userName, juniorReminders]);

  // Reset conversation when language changes
  const currentLang = i18n.language;
  useEffect(() => {
    setMessages([]);
    setFeedbackMode(null);
  }, [currentLang]);

  useEffect(() => {
    if (open && messages.length === 0) {
      const greeting = buildGreeting();
      setMessages([
        {
          role: "assistant",
          content: greeting.content,
          actions: greeting.actions,
        },
      ]);
    }
    if (open) {
      inputRef.current?.focus();
    }
  }, [open, messages.length, buildGreeting]);

  // Update greeting when reminders change (if user hasn't sent any messages yet)
  useEffect(() => {
    if (open && messages.length === 1 && messages[0].role === "assistant") {
      const greeting = buildGreeting();
      if (greeting.content !== messages[0].content) {
        setMessages([{ role: "assistant", content: greeting.content, actions: greeting.actions }]);
      }
    }
  }, [juniorReminders.length]);

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

      const projectCountry = useJuniorStore.getState().projectCountry;
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
  }, [loading, messages, t, i18n.language, userType, feedbackMode, submitFeedback]);

  const handleSend = useCallback(() => {
    sendMessage(input);
  }, [input, sendMessage]);

  // --- Agentic capture: route a quick update → proposals → ConfirmDiff ---
  const captureUpdate = useCallback(async (text: string, kind: "text" | "voice_transcript") => {
    if (!text.trim() || capturing || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: text.trim() }]);
    setInput("");

    const projectId = useJuniorStore.getState().projectId;
    if (!projectId) {
      setMessages((prev) => [...prev, { role: "assistant", content: t("helpBot.agent.noProject") }]);
      return;
    }

    setCapturing(true);
    try {
      const res = await routeAgentInput({ kind, content: text.trim() }, projectId, i18n.language);
      if (!res.proposals.length) {
        setMessages((prev) => [...prev, { role: "assistant", content: t("helpBot.agent.noProposals") }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: "", proposals: res.proposals }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: t("helpBot.agent.routeError") }]);
    } finally {
      setCapturing(false);
    }
  }, [capturing, loading, t, i18n.language]);

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

  const handleApplyProposals = useCallback(async (msgIndex: number, accepted: AgentProposal[]) => {
    const projectId = useJuniorStore.getState().projectId;
    if (!projectId) return;

    setApplying(true);
    const result = await applyProposals(accepted, projectId);
    setApplying(false);

    const content = result.failed.length === 0
      ? t("helpBot.agent.applied", { count: result.applied.length })
      : result.applied.length === 0
        ? t("helpBot.agent.allFailed")
        : t("helpBot.agent.partialFailed", { applied: result.applied.length, failed: result.failed.length });

    setMessages((prev) =>
      prev
        .map((m, i) => (i === msgIndex ? { ...m, proposals: undefined } : m))
        .concat({ role: "assistant", content }),
    );
  }, [t]);

  const handleDismissProposals = useCallback((msgIndex: number) => {
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

  const handleInlineAction = useCallback((action: string) => {
    if (action === "bug") {
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
      window.dispatchEvent(new CustomEvent("junior-navigate", { detail: target }));
      setOpen(false);
    }
  }, [startFeedbackMode, t, buildGreeting]);

  const handleDismissReminder = useCallback((reminderId: string) => {
    // Dispatch event to OverviewTab to dismiss the reminder
    window.dispatchEvent(new CustomEvent("junior-dismiss-reminder", { detail: reminderId }));
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
      icon: <FileText className="h-3.5 w-3.5 shrink-0" />,
      labelKey: "helpBot.quick.permits",
      fallback: "Building permits & regulations",
      message: t("helpBot.quickMessage.permits"),
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
  ];

  // Feedback entry point
  const feedbackPrompts: QuickPrompt[] = [
    {
      icon: <Bug className="h-3.5 w-3.5 shrink-0" />,
      labelKey: "helpBot.quick.reportBug",
      fallback: "Report a bug",
      action: "bug",
    },
    {
      icon: <MessageSquarePlus className="h-3.5 w-3.5 shrink-0" />,
      labelKey: "helpBot.quick.suggestion",
      fallback: "Suggestion",
      action: "suggestion",
    },
  ];

  const showQuickPrompts = messages.length <= 1 && !loading && !feedbackMode;

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
          <img src="/chatbot-avatar.jpg" alt="Renaida" className="h-10 w-10 rounded-full object-cover" />
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
              <img src="/chatbot-avatar.jpg" alt="Renaida" className="h-7 w-7 rounded-full object-cover" />
              <h3 className="font-semibold text-sm">
                {t("helpBot.title", "Renaida")}
              </h3>
            </div>
            <div className="flex items-center gap-1">
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
                    <img src="/chatbot-avatar.jpg" alt="Renaida" className="h-6 w-6 rounded-full object-cover shrink-0 mt-1" />
                    <div className="max-w-[85%] flex-1">
                      <ConfirmDiff
                        proposals={msg.proposals}
                        applying={applying}
                        onConfirm={(accepted) => handleApplyProposals(i, accepted)}
                        onDismiss={() => handleDismissProposals(i)}
                      />
                    </div>
                  </div>
                ) : (
                <div className={`flex items-end gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <img src="/chatbot-avatar.jpg" alt="Renaida" className="h-6 w-6 rounded-full object-cover shrink-0 mb-0.5" />
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
              </div>
            ))}

            {/* Quick prompt buttons */}
            {showQuickPrompts && (
              <div className="flex flex-wrap gap-2 pt-1">
                {quickPrompts.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => handleQuickPrompt(prompt)}
                    className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    {prompt.icon}
                    {t(prompt.labelKey, prompt.fallback)}
                  </button>
                ))}
                <div className="w-full" />
                {feedbackPrompts.map((prompt, i) => (
                  <button
                    key={`fb-${i}`}
                    onClick={() => handleQuickPrompt(prompt)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-dashed bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    {prompt.icon}
                    {t(prompt.labelKey, prompt.fallback)}
                  </button>
                ))}
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
