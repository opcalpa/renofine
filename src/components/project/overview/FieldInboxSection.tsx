import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Check,
  Clock,
  HelpCircle,
  Languages,
  MessageSquare,
  Send,
  ShoppingCart,
  Timer,
  UserRound,
  X,
} from "lucide-react";
import { useCommentTranslation } from "@/hooks/useCommentTranslation";
import {
  useFieldInbox,
  type FieldInboxCard,
  type FieldInboxPart,
  type FieldInboxSettledItem,
} from "@/hooks/useFieldInbox";
import { useCurrentProfileId } from "@/hooks/useCurrentProfileId";
import { formatCurrency } from "@/lib/currency";
import { analytics, AnalyticsEvents } from "@/lib/analytics";

/**
 * "Från fältet" — the builder's inbox for what has stopped somebody on site.
 *
 * One card per report, because that is how it was said: a worker's "8 timmar,
 * kaklet 70 %, behöver fog, vilken fog?" is one thing said with several parts,
 * and splitting it into three unrelated rows would hand over the pieces while
 * keeping the sentence to ourselves.
 *
 * The rules the design does not bend on:
 *   1. The picture IS the message — a column, never a thumbnail.
 *   2. One tap is enough, per part. Nothing opens a form.
 *   3. Waiting time is information; past an hour it turns warn-coloured,
 *      because a blocked tradesperson costs more than an unanswered
 *      notification.
 *   4. Translated by default, with a quiet way to the original.
 *   5. Settled work sinks into "Klart idag" instead of disappearing.
 *
 * Renders nothing at all when nothing is waiting.
 */

interface FieldInboxSectionProps {
  projectId: string;
  /** Only the builder side sees the field. Off for the customer view. */
  enabled: boolean;
  currency?: string | null;
  /** Project address — the eyebrow, so a builder with several sites knows where. */
  addressLabel?: string | null;
  onNavigateToPurchases?: (materialId?: string) => void;
}

type Filter = "all" | "questions" | "purchases" | "hours";

const HOUR_MS = 60 * 60 * 1000;

function useWaitLabel() {
  const { t } = useTranslation();
  return useCallback(
    (createdAt: string) => {
      const ms = Date.now() - new Date(createdAt).getTime();
      const minutes = Math.max(0, Math.round(ms / 60000));
      const urgent = ms >= HOUR_MS;
      if (minutes < 60) {
        return { label: t("fieldInbox.minutes", "{{count}} min", { count: minutes }), urgent };
      }
      const hours = Math.floor(minutes / 60);
      if (hours < 24) {
        return { label: t("fieldInbox.hours", "{{count}} tim", { count: hours }), urgent };
      }
      return { label: t("fieldInbox.days", "{{count}} d", { count: Math.floor(hours / 24) }), urgent };
    },
    [t]
  );
}

function PhotoPanel({ card, className }: { card: FieldInboxCard; className: string }) {
  const { t } = useTranslation();
  if (card.image) {
    return (
      <div className={`${className} relative overflow-hidden bg-[var(--rf-stone)]`}>
        <img
          src={card.image.url}
          alt={card.image.caption ?? card.text}
          className="h-full w-full object-cover"
          loading="lazy"
        />
        <span className="absolute left-2.5 top-2.5 rounded-md bg-[rgba(20,15,5,0.62)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-white">
          {t("fieldInbox.photo", "Foto")}
        </span>
      </div>
    );
  }
  // No photo: a calm placeholder on desktop, where it is a narrow column. On
  // mobile it would be a screenful of nothing, so it is dropped — the rule is
  // that the picture is the message, not that there is a frame.
  const first = card.parts[0]?.kind;
  return (
    <div
      className={`${className} hidden items-center justify-center bg-[var(--rf-surface-2)] md:flex`}
      aria-hidden
    >
      {first === "purchase" ? (
        <ShoppingCart className="h-10 w-10 text-[var(--rf-fg-subtle)] opacity-50" strokeWidth={1.4} />
      ) : first === "hours" ? (
        <Timer className="h-10 w-10 text-[var(--rf-fg-subtle)] opacity-50" strokeWidth={1.4} />
      ) : (
        <MessageSquare className="h-10 w-10 text-[var(--rf-fg-subtle)] opacity-50" strokeWidth={1.4} />
      )}
    </div>
  );
}

export function FieldInboxSection({
  projectId,
  enabled,
  currency,
  addressLabel,
  onNavigateToPurchases,
}: FieldInboxSectionProps) {
  const { t } = useTranslation();
  const profileId = useCurrentProfileId();
  const { cards, settled, counts, reload, removePart, markForwarded } = useFieldInbox(
    projectId,
    enabled
  );
  const { ensureTranslations, getTranslatedContent } = useCommentTranslation();
  const waitLabel = useWaitLabel();

  const [filter, setFilter] = useState<Filter>("all");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [showOriginal, setShowOriginal] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  // Translated by default — the builder should never have to ask for it.
  useEffect(() => {
    const withWords = cards
      .filter((c) => c.textId && c.text.trim())
      .map((c) => ({ id: c.textId as string, content: c.text }));
    if (withWords.length > 0) void ensureTranslations(withWords);
  }, [cards, ensureTranslations]);

  const visible = useMemo(() => {
    if (filter === "all") return cards;
    const kind = filter === "questions" ? "question" : filter === "purchases" ? "purchase" : "hours";
    return cards
      .map((c) => ({ ...c, parts: c.parts.filter((p) => p.kind === kind) }))
      .filter((c) => c.parts.length > 0);
  }, [cards, filter]);

  /**
   * Time-to-answer is the one number that says whether the builder actually
   * got faster. Everything else about this surface is a vanity count.
   */
  const trackAnswered = useCallback((kind: string, createdAt: string, decision: string) => {
    analytics.capture(AnalyticsEvents.FIELD_REPORT_ANSWERED, {
      part: kind,
      decision,
      seconds_to_answer: Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 1000)),
    });
  }, []);

  const answerQuestion = useCallback(
    async (part: FieldInboxPart, answer: string, createdAt: string) => {
      if (!profileId) return;
      setBusy(part.id);
      const { error } = await supabase.from("comments").insert({
        content: answer,
        parent_comment_id: part.id,
        project_id: projectId,
        created_by_user_id: profileId,
        is_resolved: true,
        // An answer to an internal question stays internal.
        visible_to_client: false,
      });
      if (!error) {
        const { error: resolveError } = await supabase
          .from("comments")
          .update({ is_resolved: true })
          .eq("id", part.id);
        if (resolveError) {
          setBusy(null);
          console.error("Failed to resolve:", resolveError);
          toast.error(t("fieldInbox.answerFailed", "Kunde inte skicka svaret"));
          return;
        }
      }
      setBusy(null);
      if (error) {
        console.error("Failed to answer:", error);
        toast.error(t("fieldInbox.answerFailed", "Kunde inte skicka svaret"));
        return;
      }
      trackAnswered("question", createdAt, answer);
      removePart(part.id);
      setReplyingTo(null);
      setReplyText("");
      toast.success(t("fieldInbox.answerSent", "Svar skickat"));
      void reload();
    },
    [profileId, projectId, removePart, reload, t, trackAnswered]
  );

  const decidePurchase = useCallback(
    async (part: FieldInboxPart, decision: "approved" | "declined", createdAt: string) => {
      if (!part.purchase) return;
      setBusy(part.id);
      const { error } = await supabase
        .from("materials")
        .update({ status: decision })
        .eq("id", part.purchase.materialId);
      setBusy(null);
      if (error) {
        console.error("Failed to decide purchase:", error);
        toast.error(t("fieldInbox.decisionFailed", "Kunde inte spara beslutet"));
        return;
      }
      trackAnswered("purchase", createdAt, decision);
      removePart(part.id);
      toast.success(
        decision === "approved"
          ? t("fieldInbox.purchaseApproved", "Inköpet godkänt")
          : t("fieldInbox.purchaseDeclined", "Inköpet avslaget")
      );
      void reload();
    },
    [removePart, reload, t, trackAnswered]
  );

  /**
   * Hours are what the invoice is built from, so a NO is recorded rather than
   * deleted: a claim that was made stays visible.
   */
  const decideHours = useCallback(
    async (part: FieldInboxPart, decision: "approved" | "declined", createdAt: string) => {
      setBusy(part.id);
      const patch =
        decision === "approved"
          ? { approved: true, approved_by: profileId, approved_at: new Date().toISOString() }
          : { declined_at: new Date().toISOString(), declined_by: profileId };
      const { error } = await supabase.from("time_entries").update(patch).eq("id", part.id);
      setBusy(null);
      if (error) {
        console.error("Failed to decide hours:", error);
        toast.error(t("fieldInbox.decisionFailed", "Kunde inte spara beslutet"));
        return;
      }
      trackAnswered("hours", createdAt, decision);
      removePart(part.id);
      toast.success(
        decision === "approved"
          ? t("fieldInbox.hoursApproved", "Timmarna godkända")
          : t("fieldInbox.hoursDeclined", "Timmarna avslagna")
      );
      void reload();
    },
    [profileId, removePart, reload, t, trackAnswered]
  );

  /**
   * Pass a question on to the customer. The field talks to the builder; when a
   * question is genuinely the customer's call (a tile choice, a variation
   * order) the builder forwards it with one tap instead of retyping it.
   */
  const askClient = useCallback(
    async (part: FieldInboxPart) => {
      setBusy(part.id);
      const { error } = await supabase
        .from("comments")
        .update({ visible_to_client: true })
        .eq("id", part.id);
      setBusy(null);
      if (error) {
        console.error("Failed to forward question:", error);
        toast.error(t("fieldInbox.forwardFailed", "Kunde inte skicka vidare"));
        return;
      }
      markForwarded(part.id);
      toast.success(t("fieldInbox.forwarded", "Frågan syns nu för kunden"));
    },
    [markForwarded, t]
  );

  if (!enabled || (cards.length === 0 && settled.length === 0)) return null;

  const filters: { key: Filter; label: string; count: number; icon: JSX.Element | null }[] = [
    { key: "all", label: t("fieldInbox.filterAll", "Allt"), count: counts.total, icon: null },
    {
      key: "questions",
      label: t("fieldInbox.filterQuestions", "Frågor"),
      count: counts.questions,
      icon: <HelpCircle className="h-3.5 w-3.5 text-[var(--rf-warn)]" />,
    },
    {
      key: "purchases",
      label: t("fieldInbox.filterPurchases", "Inköp"),
      count: counts.purchases,
      icon: <ShoppingCart className="h-3.5 w-3.5 text-[var(--rf-green)]" />,
    },
    {
      key: "hours",
      label: t("fieldInbox.filterHours", "Timmar"),
      count: counts.hours,
      icon: <Timer className="h-3.5 w-3.5 text-[var(--rf-green)]" />,
    },
  ];

  const btnPrimary =
    "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[10px] bg-[var(--rf-green)] px-4 text-sm font-medium text-[var(--rf-paper-2)] disabled:opacity-50 md:min-h-[44px]";
  const btnSecondary =
    "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[10px] border border-[var(--rf-hairline)] bg-[var(--rf-surface)] px-4 text-sm font-medium disabled:opacity-50 md:min-h-[44px]";

  return (
    <section className="rf-paper rounded-xl border border-[var(--rf-hairline)] bg-[var(--rf-paper)] p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {addressLabel && <div className="rf-eyebrow">{addressLabel}</div>}
          <h2 className="rf-display mt-1 text-2xl leading-tight md:text-[32px]">
            {t("fieldInbox.title", "Från fältet")}
          </h2>
        </div>
        {counts.total > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--rf-warn-soft)] px-3 py-1.5 text-[13px] font-medium text-[var(--rf-warn-soft-fg)]">
            <Clock className="h-3.5 w-3.5" />
            <span className="rf-num">{counts.total}</span>{" "}
            {t("fieldInbox.waitingOnYou", "väntar på dig")}
          </span>
        )}
      </div>

      <p className="mt-2.5 max-w-[52ch] text-sm leading-relaxed text-[var(--rf-fg-muted)]">
        {counts.total > 0
          ? t(
              "fieldInbox.subtitle",
              "Frågor och inköp som stannat upp någon på plats. Svara här, så går arbetet vidare."
            )
          : t("fieldInbox.subtitleClear", "Ingen på plats väntar på dig just nu.")}
      </p>

      {counts.total > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {filters
            .filter((f) => f.key === "all" || f.count > 0)
            .map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                  filter === f.key
                    ? "border-[var(--rf-green)] bg-[var(--rf-green)] text-[var(--rf-paper-2)]"
                    : "border-[var(--rf-hairline)] bg-[var(--rf-surface)] text-[var(--rf-ink)]"
                }`}
              >
                {filter !== f.key && f.icon}
                {f.label}
                <span className={`rf-num ${filter === f.key ? "opacity-75" : "text-[var(--rf-fg-muted)]"}`}>
                  {f.count}
                </span>
              </button>
            ))}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3.5">
        {visible.map((card) => {
          const wait = waitLabel(card.createdAt);
          const original = card.text;
          const translated = card.textId ? getTranslatedContent(card.textId, original) : original;
          const isTranslated = !!card.textId && !!original.trim() && translated !== original;
          const showingOriginal = showOriginal.has(card.id);
          const body = showingOriginal ? original : translated;

          return (
            <article
              key={card.id}
              className="flex flex-col overflow-hidden rounded-xl border border-[var(--rf-hairline)] bg-[var(--rf-surface)] md:flex-row"
            >
              <PhotoPanel card={card} className="h-[152px] w-full md:h-auto md:w-[168px] md:shrink-0" />

              <div className="flex min-w-0 flex-grow flex-col gap-3 p-4 md:p-5">
                {/* Who, when, where */}
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    {card.context && (
                      <div className="mb-1 text-xs text-[var(--rf-fg-subtle)]">{card.context}</div>
                    )}
                    {body.trim() ? (
                      <div className="rf-display text-lg leading-snug md:text-[22px]">{body}</div>
                    ) : null}
                    {isTranslated && (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <Languages className="h-3 w-3 text-[var(--rf-fg-subtle)]" />
                        <span className="text-xs text-[var(--rf-fg-subtle)]">
                          {showingOriginal
                            ? t("fieldInbox.showingOriginal", "Originalet ·")
                            : t("fieldInbox.translated", "Översatt ·")}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setShowOriginal((prev) => {
                              const next = new Set(prev);
                              if (next.has(card.id)) next.delete(card.id);
                              else next.add(card.id);
                              return next;
                            })
                          }
                          className="border-b border-dotted border-[var(--rf-green)] text-xs text-[var(--rf-green)]"
                        >
                          {showingOriginal
                            ? t("fieldInbox.showTranslation", "visa översättning")
                            : t("fieldInbox.showOriginal", "visa original")}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    {card.authorName && (
                      <div className="text-[13px] font-medium">{card.authorName}</div>
                    )}
                    <div
                      className={`rf-num mt-0.5 text-xs ${
                        wait.urgent ? "font-medium text-[var(--rf-warn)]" : "text-[var(--rf-fg-subtle)]"
                      }`}
                    >
                      {wait.label}
                    </div>
                  </div>
                </div>

                {/* One action row per part — the report stays one thing said */}
                {card.parts.map((part) => {
                  const disabled = busy === part.id;

                  if (part.kind === "hours" && part.hours) {
                    return (
                      <div
                        key={part.id}
                        className="flex flex-col gap-2 rounded-[10px] bg-[var(--rf-surface-2)] p-3"
                      >
                        <div className="flex items-baseline gap-2">
                          <Timer className="h-4 w-4 shrink-0 self-center text-[var(--rf-fg-muted)]" />
                          <span className="rf-num text-lg font-medium">
                            {t("fieldInbox.hoursValue", "{{count}} h", { count: part.hours.value })}
                          </span>
                          {part.hours.note && (
                            <span className="min-w-0 truncate text-xs text-[var(--rf-fg-subtle)]">
                              {part.hours.note}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 md:flex">
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => void decideHours(part, "approved", card.createdAt)}
                            className={`${btnPrimary} md:flex-grow`}
                          >
                            <Check className="h-4 w-4" />
                            {t("fieldInbox.approveHours", "Godkänn timmarna")}
                          </button>
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => void decideHours(part, "declined", card.createdAt)}
                            className={btnSecondary}
                          >
                            {t("common.no", "Nej")}
                          </button>
                        </div>
                      </div>
                    );
                  }

                  if (part.kind === "purchase" && part.purchase) {
                    const p = part.purchase;
                    return (
                      <div
                        key={part.id}
                        className="flex flex-col gap-2 rounded-[10px] bg-[var(--rf-surface-2)] p-3"
                      >
                        <div className="flex items-center gap-2">
                          <ShoppingCart className="h-4 w-4 shrink-0 text-[var(--rf-green-soft-fg)]" />
                          <span className="min-w-0 truncate font-medium">
                            {p.quantity ? `${p.quantity}${p.unit ? ` ${p.unit}` : ""} × ` : ""}
                            {p.name}
                          </span>
                          {p.priceTotal ? (
                            <span className="rf-num ml-auto shrink-0 text-sm text-[var(--rf-fg-muted)]">
                              {formatCurrency(p.priceTotal, currency)}
                            </span>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-2 gap-2 md:flex">
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => void decidePurchase(part, "approved", card.createdAt)}
                            className={`${btnPrimary} col-span-2 md:col-span-1 md:flex-grow`}
                          >
                            <Check className="h-4 w-4" />
                            {t("fieldInbox.approvePurchase", "Godkänn inköpet")}
                          </button>
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => void decidePurchase(part, "declined", card.createdAt)}
                            className={btnSecondary}
                          >
                            {t("common.no", "Nej")}
                          </button>
                          {onNavigateToPurchases && (
                            <button
                              type="button"
                              onClick={() => onNavigateToPurchases(p.materialId)}
                              className={`${btnSecondary} text-[var(--rf-fg-muted)]`}
                            >
                              {t("fieldInbox.openInPurchases", "Öppna i Inköp")}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  }

                  // question
                  if (replyingTo === part.id) {
                    return (
                      <div key={part.id} className="flex flex-col gap-2">
                        <textarea
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          rows={2}
                          autoFocus
                          placeholder={t("fieldInbox.replyPlaceholder", "Skriv ditt svar…")}
                          className="w-full resize-none rounded-[10px] border border-[var(--rf-hairline)] bg-[var(--rf-paper-2)] p-3 text-sm outline-none focus:border-[var(--rf-green)]"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={disabled || !replyText.trim()}
                            onClick={() => void answerQuestion(part, replyText.trim(), card.createdAt)}
                            className={`${btnPrimary} flex-grow`}
                          >
                            <Send className="h-4 w-4" />
                            {t("fieldInbox.send", "Skicka")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setReplyingTo(null);
                              setReplyText("");
                            }}
                            className={btnSecondary}
                          >
                            {t("common.cancel", "Avbryt")}
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={part.id} className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => void answerQuestion(part, t("common.yes", "Ja"), card.createdAt)}
                        className={btnPrimary}
                      >
                        <Check className="h-4 w-4" />
                        {t("common.yes", "Ja")}
                      </button>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => void answerQuestion(part, t("common.no", "Nej"), card.createdAt)}
                        className={btnSecondary}
                      >
                        <X className="h-4 w-4" />
                        {t("common.no", "Nej")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setReplyingTo(part.id)}
                        className={`${btnSecondary} col-span-2 text-[var(--rf-fg-muted)] md:col-span-1 md:flex-grow`}
                      >
                        <MessageSquare className="h-4 w-4" />
                        {t("fieldInbox.answer", "Svara")}
                      </button>
                      {part.visibleToClient ? (
                        <span className="col-span-2 inline-flex items-center gap-1 text-xs text-[var(--rf-fg-subtle)] md:col-span-1">
                          <UserRound className="h-3 w-3" />
                          {t("fieldInbox.forwardedBadge", "Skickad till kunden")}
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => void askClient(part)}
                          className={`${btnSecondary} col-span-2 text-[var(--rf-fg-muted)] md:col-span-1`}
                        >
                          <UserRound className="h-4 w-4" />
                          {t("fieldInbox.askClient", "Fråga kunden")}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>

      {settled.length > 0 && (
        <div className="mt-7 border-t border-[var(--rf-hairline)] pt-5">
          <div className="rf-eyebrow mb-3">
            {t("fieldInbox.settledToday", "Klart idag · inget att göra")}
          </div>
          <div className="flex flex-col gap-2">
            {settled.map((s: FieldInboxSettledItem) => (
              <div
                key={s.id}
                className="flex items-center gap-3 rounded-[10px] bg-[var(--rf-surface-2)] px-3.5 py-2.5"
              >
                {s.intent === "klart" ? (
                  <Check className="h-4 w-4 shrink-0 text-[var(--rf-green-soft-fg)]" />
                ) : (
                  <MessageSquare className="h-4 w-4 shrink-0 text-[var(--rf-fg-muted)]" />
                )}
                <span className="min-w-0 flex-grow truncate text-sm">
                  {s.authorName ? `${s.authorName}: ` : ""}
                  <span className="text-[var(--rf-fg-muted)]">{s.content}</span>
                </span>
                {s.context && (
                  <span className="hidden shrink-0 text-xs text-[var(--rf-fg-subtle)] sm:inline">
                    {s.context}
                  </span>
                )}
                <span className="rf-num shrink-0 text-xs text-[var(--rf-fg-subtle)]">
                  {new Date(s.createdAt).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
