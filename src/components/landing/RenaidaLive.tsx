import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, ArrowUp, Sparkles } from "lucide-react";

/**
 * RenaidaLive — a scripted, zero-token public demo of Renaida on the landing
 * page. Visitors tap a suggested prompt (or type) and watch Renaida "build" a
 * project / read a receipt in front of them. No LLM, no backend: every beat is
 * authored copy played on a timer, fully i18n so it speaks the visitor's
 * language. The star of the hero — far more convincing than a static shot.
 */

interface RenaidaLiveProps {
  onCta: () => void;
}

type ProjectCard = {
  kind: "project";
  titleKey: string;
  rooms: string[];
  tasks: string[];
  budget: string;
};
type ReceiptCard = {
  kind: "receipt";
  vendor: string;
  lines: { name: string; amount: string; matchKey?: string }[];
  total: string;
};
type Artifact = ProjectCard | ReceiptCard;

type Beat =
  | { t: "renaida"; key: string }
  | { t: "artifact"; card: Artifact }
  | { t: "cta" };

type Message =
  | { role: "user"; text: string }
  | { role: "renaida"; text: string }
  | { role: "artifact"; card: Artifact }
  | { role: "cta" };

interface Flow {
  id: string;
  chipKey: string;
  beats: Beat[];
}

const FLOWS: Flow[] = [
  {
    id: "bathroom",
    chipKey: "landingV2.renaidaLive.chips.bathroom",
    beats: [
      { t: "renaida", key: "landingV2.renaidaLive.bathroom.r1" },
      {
        t: "artifact",
        card: {
          kind: "project",
          titleKey: "landingV2.renaidaLive.bathroom.title",
          rooms: ["landingV2.renaidaLive.bathroom.room"],
          tasks: [
            "landingV2.renaidaLive.bathroom.task1",
            "landingV2.renaidaLive.bathroom.task2",
            "landingV2.renaidaLive.bathroom.task3",
            "landingV2.renaidaLive.bathroom.task4",
          ],
          budget: "≈ 62 000 kr",
        },
      },
      { t: "renaida", key: "landingV2.renaidaLive.bathroom.r2" },
      { t: "cta" },
    ],
  },
  {
    id: "receipt",
    chipKey: "landingV2.renaidaLive.chips.receipt",
    beats: [
      { t: "renaida", key: "landingV2.renaidaLive.receipt.r1" },
      {
        t: "artifact",
        card: {
          kind: "receipt",
          vendor: "Bauhaus",
          lines: [
            { name: "landingV2.renaidaLive.receipt.l1", amount: "2 400 kr", matchKey: "landingV2.renaidaLive.receipt.match" },
            { name: "landingV2.renaidaLive.receipt.l2", amount: "380 kr" },
            { name: "landingV2.renaidaLive.receipt.l3", amount: "210 kr" },
          ],
          total: "2 990 kr",
        },
      },
      { t: "renaida", key: "landingV2.renaidaLive.receipt.r2" },
      { t: "cta" },
    ],
  },
  {
    id: "quote",
    chipKey: "landingV2.renaidaLive.chips.quote",
    beats: [
      { t: "renaida", key: "landingV2.renaidaLive.quote.r1" },
      {
        t: "artifact",
        card: {
          kind: "project",
          titleKey: "landingV2.renaidaLive.quote.title",
          rooms: ["landingV2.renaidaLive.quote.room"],
          tasks: [
            "landingV2.renaidaLive.quote.task1",
            "landingV2.renaidaLive.quote.task2",
            "landingV2.renaidaLive.quote.task3",
          ],
          budget: "≈ 145 000 kr",
        },
      },
      { t: "renaida", key: "landingV2.renaidaLive.quote.r2" },
      { t: "cta" },
    ],
  },
  {
    id: "capabilities",
    chipKey: "landingV2.renaidaLive.chips.capabilities",
    beats: [
      { t: "renaida", key: "landingV2.renaidaLive.capabilities.r1" },
      { t: "cta" },
    ],
  },
];

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function RenaidaLive({ onCta }: RenaidaLiveProps) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [input, setInput] = useState("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => timers.current.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    // Keep the newest beat in view as the conversation grows.
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      const id = setTimeout(resolve, prefersReducedMotion() ? 0 : ms);
      timers.current.push(id);
    });

  const runFlow = useCallback(
    async (flow: Flow, userText?: string) => {
      if (busy) return;
      setBusy(true);
      setStarted(true);
      setMessages((m) => [...m, { role: "user", text: userText ?? t(flow.chipKey) }]);
      for (const beat of flow.beats) {
        if (beat.t === "renaida") {
          setTyping(true);
          await wait(650);
          setTyping(false);
          setMessages((m) => [...m, { role: "renaida", text: t(beat.key) }]);
          await wait(280);
        } else if (beat.t === "artifact") {
          await wait(360);
          setMessages((m) => [...m, { role: "artifact", card: beat.card }]);
          await wait(280);
        } else {
          await wait(200);
          setMessages((m) => [...m, { role: "cta" }]);
        }
      }
      setBusy(false);
    },
    [busy, t],
  );

  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    // Match the free text to the nearest scripted flow by keyword — still zero
    // tokens. No match → a warm nudge, never a dead end.
    const lower = text.toLowerCase();
    const kw: Record<string, string[]> = {
      bathroom: ["badrum", "bathroom", "bad", "dusch", "kakel", "wc", "toalett"],
      receipt: ["kvitto", "receipt", "faktura", "invoice", "bauhaus", "beleg", "reçu", "recibo"],
      quote: ["offert", "quote", "anbud", "pris", "angebot", "devis", "presupuesto"],
      capabilities: ["kan du", "vad", "what", "hjälp", "help", "können", "aide", "puedes"],
    };
    let matched = FLOWS.find((f) => (kw[f.id] ?? []).some((k) => lower.includes(k)));
    if (!matched) {
      setStarted(true);
      setMessages((m) => [
        ...m,
        { role: "user", text },
        { role: "renaida", text: t("landingV2.renaidaLive.fallback", "Så här går det till på riktigt — skapa ett gratis konto så bygger jag ditt projekt med dig. Prova gärna ett av förslagen så länge.") },
        { role: "cta" },
      ]);
      return;
    }
    // Show the user's own words rather than the chip label.
    void runFlow(matched, text);
  }, [input, busy, runFlow, t]);

  const restart = () => {
    timers.current.forEach(clearTimeout);
    setMessages([]);
    setStarted(false);
    setBusy(false);
    setTyping(false);
  };

  const activeChips = FLOWS.filter((f) => f.id !== "capabilities" || !started);

  return (
    <div
      style={{
        background: "var(--lp-surface)",
        border: "1px solid var(--lp-hairline)",
        borderRadius: 16,
        boxShadow: "var(--lp-shadow-lg)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        minHeight: 420,
        maxHeight: 560,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2.5"
        style={{ padding: "14px 18px", borderBottom: "1px solid var(--lp-hairline)", background: "var(--lp-surface)" }}
      >
        <div
          className="grid place-items-center shrink-0"
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            background: "#DCE5DC",
            color: "var(--lp-primary)",
            fontFamily: '"Fraunces", ui-serif, Georgia, serif',
            fontWeight: 500,
            fontSize: 16,
          }}
          aria-hidden
        >
          R
        </div>
        <div className="flex-1">
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--lp-fg)", letterSpacing: "-0.005em" }}>Renaida</div>
          <div style={{ fontSize: 11, color: "var(--lp-fg-subtle)" }}>
            {t("landingV2.renaidaLive.subtitle", "AI-kollega · svarar direkt")}
          </div>
        </div>
        <div className="flex items-center gap-1.5" aria-hidden>
          <span style={{ width: 7, height: 7, borderRadius: 4, background: "var(--lp-primary)" }} />
          <span style={{ fontSize: 10, color: "var(--lp-fg-subtle)", fontFamily: '"JetBrains Mono", monospace', textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {t("landingV2.renaidaLive.live", "Live-demo")}
          </span>
        </div>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1" style={{ padding: "18px", overflowY: "auto" }}>
        {!started && (
          <div className="flex gap-2.5 mb-4" style={{ alignItems: "flex-start" }}>
            <Bubble role="renaida">
              {t("landingV2.renaidaLive.greeting", "Hej! Jag är Renaida. Beskriv ett jobb — eller välj nedan — så visar jag hur snabbt ett projekt kan bli till.")}
            </Bubble>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {messages.map((m, i) => {
            if (m.role === "cta") {
              return (
                <div key={i} className="flex flex-col gap-2" style={{ marginTop: 2 }}>
                  <button
                    onClick={onCta}
                    className="inline-flex items-center justify-center gap-2 cursor-pointer"
                    style={{
                      padding: "12px 20px",
                      borderRadius: 8,
                      background: "var(--lp-primary)",
                      color: "var(--lp-primary-fg)",
                      fontSize: 14,
                      fontWeight: 500,
                      border: "none",
                      alignSelf: "flex-start",
                    }}
                  >
                    {t("landingV2.renaidaLive.cta", "Skapa mitt projekt — gratis")}
                    <ArrowRight size={14} />
                  </button>
                  <button
                    onClick={restart}
                    className="bg-transparent border-none cursor-pointer"
                    style={{ fontSize: 12, color: "var(--lp-fg-subtle)", alignSelf: "flex-start", padding: "2px 0" }}
                  >
                    {t("landingV2.renaidaLive.restart", "↺ Visa något annat")}
                  </button>
                </div>
              );
            }
            if (m.role === "artifact") {
              return <ArtifactCard key={i} card={m.card} t={t} />;
            }
            return (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <Bubble role={m.role}>{m.text}</Bubble>
              </div>
            );
          })}

          {typing && (
            <div className="flex justify-start">
              <div
                className="flex items-center gap-1"
                style={{
                  padding: "10px 14px",
                  borderRadius: 14,
                  borderTopLeftRadius: 4,
                  background: "var(--lp-bg-sunken)",
                }}
                aria-label={t("landingV2.renaidaLive.typing", "Renaida skriver…")}
              >
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      background: "var(--lp-fg-subtle)",
                      animation: "rl-blink 1.2s infinite",
                      animationDelay: `${d * 0.18}s`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Suggested chips + input */}
      <div style={{ padding: "12px 14px 14px", borderTop: "1px solid var(--lp-hairline)", background: "var(--lp-surface)" }}>
        {!busy && (
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {activeChips.map((f) => (
              <button
                key={f.id}
                onClick={() => runFlow(f)}
                disabled={busy}
                className="cursor-pointer"
                style={{
                  padding: "7px 12px",
                  borderRadius: 999,
                  border: "1px solid var(--lp-hairline)",
                  background: "var(--lp-bg-sunken)",
                  color: "var(--lp-fg)",
                  fontSize: 12.5,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                }}
              >
                {t(f.chipKey)}
              </button>
            ))}
          </div>
        )}
        <div
          className="flex items-center gap-2"
          style={{ border: "1px solid var(--lp-hairline)", borderRadius: 10, padding: "4px 4px 4px 14px", background: "var(--lp-bg)" }}
        >
          <Sparkles size={14} style={{ color: "var(--lp-fg-subtle)", flexShrink: 0 }} aria-hidden />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            placeholder={t("landingV2.renaidaLive.placeholder", "Beskriv ett jobb…")}
            disabled={busy}
            className="flex-1 bg-transparent border-none outline-none"
            style={{ fontSize: 14, color: "var(--lp-fg)", minWidth: 0, padding: "8px 0" }}
          />
          <button
            onClick={handleSubmit}
            disabled={busy || !input.trim()}
            aria-label={t("landingV2.renaidaLive.send", "Skicka")}
            className="grid place-items-center cursor-pointer shrink-0"
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              border: "none",
              background: input.trim() && !busy ? "var(--lp-primary)" : "var(--lp-bg-sunken)",
              color: input.trim() && !busy ? "var(--lp-primary-fg)" : "var(--lp-fg-subtle)",
            }}
          >
            <ArrowUp size={16} />
          </button>
        </div>
      </div>

      <style>{`@keyframes rl-blink { 0%, 60%, 100% { opacity: 0.25 } 30% { opacity: 1 } }`}</style>
    </div>
  );
}

function Bubble({ role, children }: { role: "user" | "renaida"; children: React.ReactNode }) {
  const isUser = role === "user";
  return (
    <div
      style={{
        maxWidth: "85%",
        padding: "10px 14px",
        borderRadius: 14,
        borderTopRightRadius: isUser ? 4 : 14,
        borderTopLeftRadius: isUser ? 14 : 4,
        background: isUser ? "var(--lp-primary)" : "var(--lp-bg-sunken)",
        color: isUser ? "var(--lp-primary-fg)" : "var(--lp-fg)",
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

function ArtifactCard({ card, t }: { card: Artifact; t: (k: string, d?: string) => string }) {
  const label = (s: string) => (
    <div
      style={{
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 9,
        color: "var(--lp-fg-subtle)",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        marginBottom: 6,
      }}
    >
      {s}
    </div>
  );
  const money: React.CSSProperties = { fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: "tabular-nums" };

  return (
    <div
      className="rl-artifact"
      style={{
        border: "1px solid var(--lp-hairline)",
        borderRadius: 12,
        background: "var(--lp-surface)",
        padding: 14,
        boxShadow: "var(--lp-shadow-md)",
        animation: prefersReducedMotion() ? undefined : "rl-rise 0.35s ease both",
      }}
    >
      {card.kind === "project" ? (
        <>
          <div style={{ fontFamily: '"Fraunces", ui-serif, Georgia, serif', fontWeight: 400, fontSize: 17, marginBottom: 12, color: "var(--lp-fg)" }}>
            {t(card.titleKey)}
          </div>
          <div style={{ marginBottom: 12 }}>
            {label(t("landingV2.renaidaLive.labelRooms", "Rum"))}
            <div className="flex flex-wrap gap-1.5">
              {card.rooms.map((r, i) => (
                <span key={i} style={{ padding: "3px 9px", borderRadius: 999, background: "var(--lp-bg-sunken)", fontSize: 12, color: "var(--lp-fg)" }}>
                  {t(r)}
                </span>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            {label(t("landingV2.renaidaLive.labelTasks", "Arbeten") + ` (${card.tasks.length})`)}
            <div className="flex flex-col gap-1">
              {card.tasks.map((tk, i) => (
                <div key={i} className="flex items-center gap-2" style={{ fontSize: 13, color: "var(--lp-fg)" }}>
                  <span style={{ width: 5, height: 5, borderRadius: 3, background: "var(--lp-primary)", flexShrink: 0 }} aria-hidden />
                  {t(tk)}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between" style={{ paddingTop: 10, borderTop: "1px solid var(--lp-hairline)" }}>
            <span style={{ fontSize: 12, color: "var(--lp-fg-muted)" }}>{t("landingV2.renaidaLive.labelBudget", "Budget (riktlinje, inkl. moms)")}</span>
            <span style={{ ...money, fontSize: 15, fontWeight: 500, color: "var(--lp-fg)" }}>{card.budget}</span>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
            <div style={{ fontFamily: '"Fraunces", ui-serif, Georgia, serif', fontWeight: 400, fontSize: 17, color: "var(--lp-fg)" }}>
              {card.vendor}
            </div>
            <span style={{ fontSize: 10, fontFamily: '"JetBrains Mono", monospace', textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--lp-fg-subtle)" }}>
              {t("landingV2.renaidaLive.receiptTag", "Kvitto inläst")}
            </span>
          </div>
          <div className="flex flex-col gap-1.5" style={{ marginBottom: 12 }}>
            {card.lines.map((l, i) => (
              <div key={i}>
                <div className="flex items-center justify-between" style={{ fontSize: 13, color: "var(--lp-fg)" }}>
                  <span>{t(l.name)}</span>
                  <span style={money}>{l.amount}</span>
                </div>
                {l.matchKey && (
                  <div style={{ fontSize: 11, color: "var(--lp-primary)", marginTop: 1 }}>✓ {t(l.matchKey)}</div>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between" style={{ paddingTop: 10, borderTop: "1px solid var(--lp-hairline)" }}>
            <span style={{ fontSize: 12, color: "var(--lp-fg-muted)" }}>{t("landingV2.renaidaLive.receiptTotal", "Bokfört på budgeten")}</span>
            <span style={{ ...money, fontSize: 15, fontWeight: 500, color: "var(--lp-fg)" }}>{card.total}</span>
          </div>
        </>
      )}
      <style>{`@keyframes rl-rise { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }`}</style>
    </div>
  );
}
