import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";

const BOOK_DEMO_URL = "https://calendar.app.google/cpD1Z1Qb6VQBhSAL9";

interface FinalCTAProps {
  onCta: () => void;
}

export function FinalCTA({ onCta }: FinalCTAProps) {
  const { t } = useTranslation();

  return (
    <section
      style={{
        borderTop: "1px solid var(--lp-hairline)",
        background: "var(--lp-bg-sunken)",
      }}
    >
      {/* Desktop */}
      <div className="hidden md:block text-center" style={{ padding: "100px 40px", maxWidth: 760, margin: "0 auto" }}>
        <h2
          style={{
            fontFamily: '"Fraunces", ui-serif, Georgia, serif',
            fontSize: 54,
            fontWeight: 300,
            letterSpacing: "-0.028em",
            margin: "0 0 18px",
            lineHeight: 1.05,
          }}
        >
          {t("landingV2.finalCta.h2", "Bygg branschens vassaste projektkontor.")}
        </h2>
        <p style={{ fontSize: 16, color: "var(--lp-fg-muted)", margin: "0 0 32px", lineHeight: 1.55 }}>
          {t("landingV2.finalCta.body", "Gratis under hela beta. Inga kontokrav. Importera ditt f\u00f6rsta projekt p\u00e5 tv\u00e5 minuter.")}
        </p>
        <div className="flex gap-2.5 justify-center">
          <button
            onClick={onCta}
            className="inline-flex items-center gap-2 border-none cursor-pointer"
            style={{
              padding: "14px 26px",
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
          <a
            href={BOOK_DEMO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center cursor-pointer"
            style={{
              padding: "14px 22px",
              borderRadius: 6,
              background: "transparent",
              color: "var(--lp-fg)",
              fontSize: 14,
              fontWeight: 500,
              border: "1px solid var(--lp-hairline)",
              textDecoration: "none",
            }}
          >
            {t("landingV2.finalCta.demo", "Boka 15 min demo")}
          </a>
        </div>
      </div>

      {/* Mobile */}
      <div className="md:hidden text-center" style={{ padding: "56px 20px" }}>
        <h2
          style={{
            fontFamily: '"Fraunces", ui-serif, Georgia, serif',
            fontSize: 32,
            fontWeight: 300,
            letterSpacing: "-0.025em",
            margin: "0 0 14px",
            lineHeight: 1.05,
          }}
        >
          {t("landingV2.finalCta.h2", "Bygg branschens vassaste projektkontor.")}
        </h2>
        <p style={{ fontSize: 14, color: "var(--lp-fg-muted)", margin: "0 0 22px", lineHeight: 1.55 }}>
          {t("landingV2.finalCta.bodyMobile", "Gratis under hela beta. Inga kontokrav.")}
        </p>
        <div className="flex flex-col items-center gap-2.5">
          <button
            onClick={onCta}
            className="inline-flex items-center justify-center gap-2 border-none cursor-pointer"
            style={{
              padding: "14px 26px",
              borderRadius: 6,
              background: "var(--lp-accent-ink)",
              color: "var(--lp-bg)",
              fontSize: 14,
              fontWeight: 500,
              minHeight: 48,
            }}
          >
            {t("landingV2.finalCta.ctaMobile", "Kom ig\u00e5ng")}
            <ArrowRight size={14} />
          </button>
          <a
            href={BOOK_DEMO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center cursor-pointer"
            style={{
              padding: "14px 22px",
              borderRadius: 6,
              background: "transparent",
              color: "var(--lp-fg)",
              fontSize: 14,
              fontWeight: 500,
              minHeight: 48,
              border: "1px solid var(--lp-hairline)",
              textDecoration: "none",
            }}
          >
            {t("landingV2.finalCta.demo", "Boka 15 min demo")}
          </a>
        </div>
      </div>
    </section>
  );
}
