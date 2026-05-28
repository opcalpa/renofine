import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { Pill } from "../Pill";
import { Shot } from "../Shot";

interface BuilderFeaturesProps {
  onDemoTab: (tab: string) => void;
}

export function BuilderFeatures({ onDemoTab }: BuilderFeaturesProps) {
  const { t } = useTranslation();

  const items = [
    {
      kicker: t("landingV2.features.quoteKicker", "Offert & avtal"),
      title: t("landingV2.features.quoteTitle", "Skicka offert p\u00e5 10 min"),
      desc: t("landingV2.features.quoteDesc", "Skapa offerter med inbyggd ROT-ber\u00e4kning. L\u00e4gg till rader, se PDF-f\u00f6rhandsgranskning direkt, skicka till kund."),
      src: "/screenshots/Quote.png",
      alt: "offert-vy",
      tab: "overview",
    },
    {
      kicker: t("landingV2.features.timelineKicker", "Tidsplan"),
      title: t("landingV2.features.timelineTitle", "Schema som faktiskt h\u00e4nger med"),
      desc: t("landingV2.features.timelineDesc", "Drag-and-drop Gantt med beroenden mellan arbeten. Flytta ett arbete s\u00e5 f\u00f6ljer resten med automatiskt."),
      src: "/screenshots/Timeline.png",
      alt: "tidsplan-vy",
      tab: "tasks",
    },
    {
      kicker: t("landingV2.features.budgetKicker", "Ink\u00f6p & ROT"),
      title: t("landingV2.features.budgetTitle", "En kassabok f\u00f6r bygget"),
      desc: t("landingV2.features.budgetDesc", "Registrera ink\u00f6p, koppla till arbeten, l\u00e5t kunden godk\u00e4nna i appen. Allt p\u00e5 ett st\u00e4lle ist\u00e4llet f\u00f6r i mejlen."),
      src: "/screenshots/Budget.png",
      alt: "ink\u00f6p-vy",
      tab: "budget",
    },
  ];

  return (
    <section id="features">
      {/* Desktop */}
      <div className="hidden md:block" style={{ padding: "80px 40px", maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ marginBottom: 48, maxWidth: 680 }}>
          <Pill tone="primary">{t("landingV2.features.pill", "Funktioner")}</Pill>
          <h2
            style={{
              fontFamily: '"Fraunces", ui-serif, Georgia, serif',
              fontSize: 42,
              fontWeight: 300,
              letterSpacing: "-0.025em",
              margin: "16px 0 12px",
              lineHeight: 1.1,
            }}
          >
            {t("landingV2.features.h2", "Allt fr\u00e5n f\u00f6rsta kundkontakt till slutbesiktning.")}
          </h2>
          <p style={{ fontSize: 15, color: "var(--lp-fg-muted)", lineHeight: 1.55, margin: 0 }}>
            {t("landingV2.features.sub", "Inte ett verktyg som \u201dst\u00f6djer\u201d ditt arbete. Verktyget som \u00e4r ditt arbete.")}
          </p>
        </div>
        <div className="flex flex-col gap-10">
          {items.map((f, i) => (
            <div
              key={i}
              className="grid items-center"
              style={{ gridTemplateColumns: i % 2 === 0 ? "1fr 1.4fr" : "1.4fr 1fr", gap: 48 }}
            >
              <div style={{ order: i % 2 === 0 ? 1 : 2 }}>
                <div
                  style={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: 10,
                    color: "var(--lp-fg-subtle)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 10,
                  }}
                >
                  {f.kicker}
                </div>
                <h3
                  style={{
                    fontFamily: '"Fraunces", ui-serif, Georgia, serif',
                    fontSize: 30,
                    fontWeight: 400,
                    margin: "0 0 12px",
                    letterSpacing: "-0.02em",
                    lineHeight: 1.15,
                  }}
                >
                  {f.title}
                </h3>
                <p style={{ fontSize: 15, color: "var(--lp-fg-muted)", lineHeight: 1.6, margin: "0 0 16px" }}>{f.desc}</p>
                <button
                  onClick={() => onDemoTab(f.tab)}
                  className="inline-flex items-center gap-1.5 bg-transparent border-none cursor-pointer"
                  style={{ fontSize: 13, color: "var(--lp-primary)", fontWeight: 500 }}
                >
                  {t("landingV2.features.readMore", "L\u00e4s mer")} <ArrowRight size={13} />
                </button>
              </div>
              <div style={{ order: i % 2 === 0 ? 2 : 1 }}>
                <Shot src={f.src} alt={f.alt} ratio="4/3" chrome fit="cover" onClick={() => onDemoTab(f.tab)} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mobile: stacked */}
      <div className="md:hidden" style={{ padding: "40px 20px" }}>
        <div
          style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 10,
            color: "var(--lp-fg-subtle)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 8,
          }}
        >
          {t("landingV2.features.pill", "Funktioner")}
        </div>
        <h2
          style={{
            fontFamily: '"Fraunces", ui-serif, Georgia, serif',
            fontSize: 30,
            fontWeight: 300,
            letterSpacing: "-0.022em",
            margin: "0 0 24px",
            lineHeight: 1.1,
          }}
        >
          {t("landingV2.features.h2", "Allt fr\u00e5n f\u00f6rsta kundkontakt till slutbesiktning.")}
        </h2>
        <div className="flex flex-col gap-6">
          {items.map((f, i) => (
            <div key={i}>
              <div className="mb-2.5">
                <Shot src={f.src} alt={f.alt} ratio="4/3" chrome onClick={() => onDemoTab(f.tab)} />
              </div>
              <div
                style={{
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 9,
                  color: "var(--lp-fg-subtle)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                {f.kicker}
              </div>
              <h3
                style={{
                  fontFamily: '"Fraunces", ui-serif, Georgia, serif',
                  fontSize: 20,
                  fontWeight: 400,
                  margin: "6px 0 0",
                  letterSpacing: "-0.015em",
                }}
              >
                {f.title}
              </h3>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
