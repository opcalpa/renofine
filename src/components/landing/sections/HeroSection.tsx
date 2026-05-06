import { useTranslation } from "react-i18next";
import { ArrowRight, Eye } from "lucide-react";
import { Pill } from "../Pill";
import { Shot } from "../Shot";
import { Anno } from "../Anno";

interface HeroSectionProps {
  onCta: () => void;
  onDemo: () => void;
  onScreenshotClick: () => void;
}

export function HeroSection({ onCta, onDemo, onScreenshotClick }: HeroSectionProps) {
  const { t } = useTranslation();

  return (
    <section style={{ padding: "80px 40px 60px", maxWidth: 1280, margin: "0 auto" }}>
      {/* Desktop: 2 columns */}
      <div className="hidden md:grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center" }}>
        <div>
          <Pill tone="primary">{t("landingV2.hero.pill", "F\u00f6r renoveringsbranschen")}</Pill>
          <h1
            style={{
              fontFamily: '"Fraunces", ui-serif, Georgia, serif',
              fontSize: 68,
              fontWeight: 300,
              letterSpacing: "-0.03em",
              lineHeight: 1.02,
              margin: "24px 0 24px",
              color: "var(--lp-fg)",
            }}
          >
            {t("landingV2.hero.h1", "Hela renoveringen i en app.")}
          </h1>
          <p
            style={{
              fontFamily: '"Inter Tight", Inter, sans-serif',
              fontSize: 17,
              color: "var(--lp-fg-muted)",
              lineHeight: 1.55,
              maxWidth: 480,
              margin: "0 0 32px",
            }}
          >
            {t(
              "landingV2.hero.body",
              "Offerter, ROT, tidsplan, ink\u00f6p och kund\u00adkommunikation \u2014 i ett verktyg byggt f\u00f6r dig som faktiskt utf\u00f6r jobbet, inte f\u00f6r Excel-konsulten."
            )}
          </p>
          <div className="flex gap-2.5 items-center">
            <button
              onClick={onCta}
              className="inline-flex items-center gap-2 border-none cursor-pointer"
              style={{
                padding: "12px 22px",
                borderRadius: 6,
                background: "var(--lp-accent-ink)",
                color: "var(--lp-bg)",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              {t("landingV2.hero.cta", "Kom ig\u00e5ng \u2014 gratis")}
              <ArrowRight size={14} />
            </button>
            <button
              onClick={onDemo}
              className="inline-flex items-center gap-2 cursor-pointer"
              style={{
                padding: "12px 18px",
                borderRadius: 6,
                background: "transparent",
                color: "var(--lp-fg)",
                fontSize: 14,
                fontWeight: 500,
                border: "1px solid var(--lp-hairline)",
              }}
            >
              <Eye size={14} />
              {t("landingV2.hero.ctaSecondary", "Se demoprojekt")}
            </button>
          </div>
          <div style={{ marginTop: 32, fontSize: 12, color: "var(--lp-fg-subtle)" }}>
            {t("landingV2.hero.micro", "Inga kontokrav \u00b7 Importera projekt p\u00e5 2 minuter \u00b7 Avsluta n\u00e4r du vill")}
          </div>
        </div>
        <Shot src="/screenshots/Timeline.png" alt="Tidsplan" ratio="4/3" fit="cover" onClick={onScreenshotClick}>
          <Anno pos="top-right" kicker="ROT 2026" dx={-20} dy={56}>
            32 400 kr kvar
          </Anno>
          <Anno pos="bottom-left" kicker="Aktivt" dx={-24} dy={64}>
            <span style={{ fontWeight: 500 }}>Kök bänkskivor</span> klart imorgon
          </Anno>
        </Shot>
      </div>

      {/* Mobile: stacked */}
      <div className="md:hidden" style={{ padding: "0" }}>
        <Pill tone="primary">{t("landingV2.hero.pill", "F\u00f6r renoveringsbranschen")}</Pill>
        <h1
          style={{
            fontFamily: '"Fraunces", ui-serif, Georgia, serif',
            fontSize: 36,
            fontWeight: 300,
            letterSpacing: "-0.025em",
            lineHeight: 1.05,
            margin: "18px 0 14px",
            color: "var(--lp-fg)",
          }}
        >
          {t("landingV2.hero.h1", "Hela renoveringen i en app.")}
        </h1>
        <p style={{ fontSize: 15, color: "var(--lp-fg-muted)", lineHeight: 1.55, margin: "0 0 20px" }}>
          {t(
            "landingV2.hero.bodyMobile",
            "Offerter, ROT, tidsplan, ink\u00f6p och kund\u00adkommunikation \u2014 i ett verktyg byggt f\u00f6r dig som faktiskt utf\u00f6r jobbet."
          )}
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onCta}
            className="inline-flex items-center justify-center gap-2 border-none cursor-pointer"
            style={{
              padding: "14px 22px",
              borderRadius: 6,
              background: "var(--lp-accent-ink)",
              color: "var(--lp-bg)",
              fontSize: 15,
              fontWeight: 500,
              minHeight: 48,
            }}
          >
            {t("landingV2.hero.cta", "Kom ig\u00e5ng \u2014 gratis")}
            <ArrowRight size={15} />
          </button>
          <button
            onClick={onDemo}
            className="inline-flex items-center justify-center gap-2 cursor-pointer"
            style={{
              padding: "14px 18px",
              borderRadius: 6,
              background: "transparent",
              color: "var(--lp-fg)",
              fontSize: 15,
              fontWeight: 500,
              border: "1px solid var(--lp-hairline)",
              minHeight: 48,
            }}
          >
            <Eye size={14} />
            {t("landingV2.hero.ctaSecondary", "Se demoprojekt")}
          </button>
        </div>
        <div className="mt-6">
          <Shot src="/screenshots/Timeline.png" alt="tidsplan" ratio="4/3" chrome onClick={onScreenshotClick}>
            <Anno pos="top-right" kicker="ROT" dx={14} dy={42}>
              32 400 kr kvar
            </Anno>
          </Shot>
        </div>
      </div>
    </section>
  );
}
