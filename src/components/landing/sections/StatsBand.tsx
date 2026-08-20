import { useTranslation } from "react-i18next";

export function StatsBand() {
  const { t } = useTranslation();

  const stats = [
    { v: "1", l: t("landingV2.stats.oneAppLabel", "App istället för Excel, mejl och pärmar"), s: t("landingV2.stats.oneAppSource", "Allt på ett ställe") },
    { v: "0 kr", l: t("landingV2.stats.freeLabel", "Att testa under hela beta"), s: t("landingV2.stats.freeSource", "Inga kort, inga krångel") },
    { v: "47", l: t("landingV2.stats.featuresLabel", "Inbyggda funktioner"), s: t("landingV2.stats.featuresSource", "Och fler varje vecka") },
    { v: "7", l: t("landingV2.stats.langLabel", "Språk — arbetaren får instruktioner på sitt"), s: t("landingV2.stats.langSource", "Översätts automatiskt i appen") },
  ];

  return (
    <section style={{ borderBottom: "1px solid var(--lp-hairline)" }}>
      {/* Desktop */}
      <div
        className="hidden md:grid"
        style={{ maxWidth: 1280, margin: "0 auto", padding: "56px 40px", gridTemplateColumns: "repeat(4, 1fr)", gap: 60 }}
      >
        {stats.map((s, i) => (
          <div key={i}>
            <div
              style={{
                fontFamily: '"Fraunces", ui-serif, Georgia, serif',
                fontSize: 42,
                fontWeight: 300,
                letterSpacing: "-0.025em",
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {s.v}
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, marginTop: 10, letterSpacing: "-0.005em" }}>{s.l}</div>
            <div style={{ fontSize: 12, color: "var(--lp-fg-subtle)", marginTop: 4 }}>{s.s}</div>
          </div>
        ))}
      </div>

      {/* Mobile: 2x2 */}
      <div className="md:hidden grid grid-cols-2 gap-6" style={{ padding: "32px 20px" }}>
        {stats.map((s, i) => (
          <div key={i}>
            <div
              style={{
                fontFamily: '"Fraunces", ui-serif, Georgia, serif',
                fontSize: 30,
                fontWeight: 300,
                letterSpacing: "-0.025em",
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {s.v}
            </div>
            <div style={{ fontSize: 12, marginTop: 6, color: "var(--lp-fg-muted)" }}>{s.l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
