import { useTranslation } from "react-i18next";

export function TestimonialSection() {
  const { t } = useTranslation();

  return (
    <section>
      {/* Desktop */}
      <div className="hidden md:block" style={{ padding: "100px 40px" }}>
        <div style={{ maxWidth: 880, margin: "0 auto", textAlign: "center" }}>
          <div
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 11,
              color: "var(--lp-fg-subtle)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: 24,
            }}
          >
            {t("landingV2.testimonial.kicker", "Från grundaren")}
          </div>
          <blockquote
            style={{
              fontFamily: '"Fraunces", ui-serif, Georgia, serif',
              fontSize: 32,
              fontWeight: 300,
              lineHeight: 1.25,
              letterSpacing: "-0.018em",
              margin: "0 0 32px",
              fontStyle: "italic",
              textWrap: "pretty",
            }}
          >
            {t(
              "landingV2.testimonial.quote",
              "\u201cJag byggde Renofine för att jag var trött på att jaga kvitton i mejlen och budgetar i Excel. Om du känner igen dig — välkommen, vi är inte många än, men verktyget finns här.\u201d"
            )}
          </blockquote>
          <div className="flex items-center justify-center gap-3.5">
            <img
              src="/images/carl-palmquist-bw.jpg"
              loading="lazy"
              decoding="async"
              alt="Carl Palmquist"
              className="rounded-full object-cover"
              style={{ width: 48, height: 48, filter: "grayscale(1)" }}
            />
            <div className="text-left">
              <div style={{ fontSize: 14, fontWeight: 500 }}>Carl Palmquist</div>
              <div style={{ fontSize: 12, color: "var(--lp-fg-muted)" }}>{t("landingV2.testimonial.role", "Grundare · Renofine")}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile */}
      <div
        className="md:hidden"
        style={{ padding: "40px 20px", borderTop: "1px solid var(--lp-hairline)", background: "var(--lp-bg-sunken)" }}
      >
        <div
          style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 10,
            color: "var(--lp-fg-subtle)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 14,
          }}
        >
          {t("landingV2.testimonial.kicker", "Från grundaren")}
        </div>
        <blockquote
          style={{
            fontFamily: '"Fraunces", ui-serif, Georgia, serif',
            fontSize: 22,
            fontWeight: 300,
            lineHeight: 1.3,
            letterSpacing: "-0.012em",
            margin: "0 0 20px",
            fontStyle: "italic",
          }}
        >
          {t("landingV2.testimonial.quoteMobile", "\u201cJag byggde det här för att jag var trött på Excel och mejl. Välkommen — verktyget finns här.\u201d")}
        </blockquote>
        <div className="flex items-center gap-2.5">
          <img
            src="/images/carl-palmquist-bw.jpg"
            loading="lazy"
            decoding="async"
            alt="Carl Palmquist"
            className="rounded-full object-cover shrink-0"
            style={{ width: 40, height: 40, filter: "grayscale(1)" }}
          />
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Carl Palmquist</div>
            <div style={{ fontSize: 11, color: "var(--lp-fg-muted)" }}>{t("landingV2.testimonial.role", "Grundare · Renofine")}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
