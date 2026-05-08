import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Logo } from "../Logo";

export function LandingFooter() {
  const { t } = useTranslation();

  // Only ship links that actually work. No placeholder labels.
  const columns = [
    {
      title: t("landingV2.footer.product", "Produkt"),
      links: [
        { label: t("landingV2.footer.features", "Funktioner"), href: "#features" },
        { label: t("landingV2.footer.whatsNew", "Vad \u00e4r nytt"), href: "/changelog" },
      ],
    },
    {
      title: t("landingV2.footer.company", "F\u00f6retag"),
      links: [
        { label: t("landingV2.footer.about", "Om oss"), href: "/about" },
        { label: t("landingV2.footer.contact", "Kontakt"), href: "/contact" },
      ],
    },
    {
      title: t("landingV2.footer.legal", "Juridik"),
      links: [
        { label: t("landingV2.footer.terms", "Villkor"), href: "/terms" },
        { label: t("landingV2.footer.privacy", "Integritet"), href: "/privacy" },
      ],
    },
  ];

  return (
    <footer style={{ borderTop: "1px solid var(--lp-hairline)" }}>
      <div
        className="hidden md:grid"
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "40px 40px 32px",
          gridTemplateColumns: "2fr 1fr 1fr 1fr",
          gap: 40,
        }}
      >
        <div>
          <Logo />
          <p style={{ fontSize: 13, color: "var(--lp-fg-muted)", margin: "16px 0 0", maxWidth: 280, lineHeight: 1.5 }}>
            {t("landingV2.footer.tagline", "Projektkontoret som byggare faktiskt vill anv\u00e4nda. Gjort i Stockholm.")}
          </p>
        </div>
        {columns.map((col) => (
          <div key={col.title}>
            <div
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 10,
                color: "var(--lp-fg-subtle)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: 12,
              }}
            >
              {col.title}
            </div>
            <div className="flex flex-col gap-2">
              {col.links.map((l) => (
                l.href.startsWith("#") || l.href.startsWith("http") ? (
                  <a key={l.label} href={l.href} className="cursor-pointer hover:underline" style={{ fontSize: 13, color: "var(--lp-fg-muted)" }}>
                    {l.label}
                  </a>
                ) : (
                  <Link key={l.label} to={l.href} className="cursor-pointer hover:underline" style={{ fontSize: 13, color: "var(--lp-fg-muted)" }}>
                    {l.label}
                  </Link>
                )
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Mobile footer */}
      <div className="md:hidden" style={{ padding: "32px 20px" }}>
        <Logo />
        <p style={{ fontSize: 12, color: "var(--lp-fg-muted)", margin: "12px 0 0", lineHeight: 1.5 }}>
          {t("landingV2.footer.tagline", "Projektkontoret som byggare faktiskt vill anv\u00e4nda. Gjort i Stockholm.")}
        </p>
      </div>

      {/* Bottom bar */}
      <div
        className="flex justify-between items-center"
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "24px 40px",
          borderTop: "1px solid var(--lp-hairline)",
          fontSize: 11,
          color: "var(--lp-fg-subtle)",
        }}
      >
        <span>&copy; 2026 Renofine AB</span>
        <span
          style={{
            fontFamily: '"JetBrains Mono", monospace',
            letterSpacing: "0.08em",
          }}
        >
          RENOFINE.COM
        </span>
      </div>
    </footer>
  );
}
