import { useTranslation } from "react-i18next";
import { Check, Sparkles } from "lucide-react";
import { Pill } from "../Pill";
import { Shot } from "../Shot";

export function HomeownerSection() {
  const { t } = useTranslation();

  const benefits = [
    {
      title: t("landingV2.homeowner.b1Title", "Realtids-progress"),
      desc: t("landingV2.homeowner.b1Desc", "Ser exakt hur l\u00e5ngt bygget har kommit, utan att ringa dig"),
    },
    {
      title: t("landingV2.homeowner.b2Title", "ROT-saldo i realtid"),
      desc: t("landingV2.homeowner.b2Desc", "Hur mycket av \u00e5rets 50 000 kr som kvarst\u00e5r \u2014 alltid synkat"),
    },
    {
      title: t("landingV2.homeowner.b3Title", "Ink\u00f6p-godk\u00e4nnanden"),
      desc: t("landingV2.homeowner.b3Desc", "Ett knapptryck ist\u00e4llet f\u00f6r l\u00e5nga mejltr\u00e5dar"),
    },
    {
      title: t("landingV2.homeowner.b4Title", "S\u00e4ljv\u00e4rde-dokumentation"),
      desc: t("landingV2.homeowner.b4Desc", "Renoveringshistorik per adress, perfekt vid framtida f\u00f6rs\u00e4ljning"),
    },
  ];

  return (
    <section
      id="homeowner"
      style={{
        background: "var(--lp-bg-sunken)",
        borderTop: "1px solid var(--lp-hairline)",
        borderBottom: "1px solid var(--lp-hairline)",
      }}
    >
      <div
        className="hidden md:grid"
        style={{ maxWidth: 1280, margin: "0 auto", padding: "80px 40px", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center" }}
      >
        <div>
          <Pill tone="paper">{t("landingV2.homeowner.pill", "Kundvy")}</Pill>
          <h2
            style={{
              fontFamily: '"Fraunces", ui-serif, Georgia, serif',
              fontSize: 38,
              fontWeight: 300,
              letterSpacing: "-0.025em",
              margin: "16px 0 16px",
              lineHeight: 1.1,
            }}
          >
            {t("landingV2.homeowner.h2", "Din kund f\u00e5r en egen vy. Det \u00e4r d\u00e4r du vinner n\u00e4sta kund.")}
          </h2>
          <p style={{ fontSize: 15, color: "var(--lp-fg-muted)", lineHeight: 1.6, margin: "0 0 20px" }}>
            {t(
              "landingV2.homeowner.body",
              "N\u00e4r du bjuder in din kund till Renofine f\u00e5r de n\u00e5got ingen byggare i Sverige har gett dem f\u00f6rut: insyn utan att st\u00f6ra dig."
            )}
          </p>
          <ul className="flex flex-col gap-3.5" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {benefits.map((b, i) => (
              <li key={i} className="flex gap-3 items-start">
                <div
                  className="grid place-items-center shrink-0"
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    background: "var(--lp-primary)",
                    color: "var(--lp-bg)",
                    marginTop: 1,
                  }}
                >
                  <Check size={12} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{b.title}</div>
                  <div style={{ fontSize: 13, color: "var(--lp-fg-muted)", marginTop: 2 }}>{b.desc}</div>
                </div>
              </li>
            ))}
          </ul>
          <div
            className="flex items-center gap-2.5"
            style={{
              padding: "14px 16px",
              marginTop: 24,
              background: "var(--lp-surface)",
              border: "1px solid var(--lp-hairline)",
              borderRadius: 8,
              fontSize: 13,
              color: "var(--lp-fg-muted)",
            }}
          >
            <Sparkles size={14} />
            <span>
              {t("landingV2.homeowner.cta", "\u00c4r du hem\u00e4gare?")}{" "}
              <span style={{ color: "var(--lp-primary)", fontWeight: 500, textDecoration: "underline", textUnderlineOffset: 3 }}>
                {t("landingV2.homeowner.ctaLink", "Be din byggare bjuda in dig")}
              </span>{" "}
              {t("landingV2.homeowner.ctaSuffix", "till Renofine.")}
            </span>
          </div>
        </div>
        <Shot src={null} alt="kundvy (kommer snart)" ratio="3/4" chrome={false} />
      </div>

      {/* Mobile: simplified, no shot */}
      <div className="md:hidden" style={{ padding: "40px 20px" }}>
        <Pill tone="paper">{t("landingV2.homeowner.pill", "Kundvy")}</Pill>
        <h2
          style={{
            fontFamily: '"Fraunces", ui-serif, Georgia, serif',
            fontSize: 28,
            fontWeight: 300,
            letterSpacing: "-0.022em",
            margin: "12px 0 12px",
            lineHeight: 1.1,
          }}
        >
          {t("landingV2.homeowner.h2", "Din kund f\u00e5r en egen vy. Det \u00e4r d\u00e4r du vinner n\u00e4sta kund.")}
        </h2>
        <p style={{ fontSize: 14, color: "var(--lp-fg-muted)", lineHeight: 1.55, margin: "0 0 16px" }}>
          {t("landingV2.homeowner.body", "N\u00e4r du bjuder in din kund till Renofine f\u00e5r de insyn utan att st\u00f6ra dig.")}
        </p>
        <ul className="flex flex-col gap-3" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {benefits.map((b, i) => (
            <li key={i} className="flex gap-2.5 items-start">
              <div
                className="grid place-items-center shrink-0"
                style={{ width: 20, height: 20, borderRadius: 10, background: "var(--lp-primary)", color: "var(--lp-bg)", marginTop: 1 }}
              >
                <Check size={11} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{b.title}</div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
