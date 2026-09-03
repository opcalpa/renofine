import { useEffect, useState } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import i18n, { SUPPORTED_LANGUAGES } from "@/i18n/config";
import { Logo } from "@/components/landing/Logo";
import { Pill } from "@/components/landing/Pill";
import { RenaidaLive } from "@/components/landing/RenaidaLive";

/**
 * /embed/renaida — Renaida's scripted landing demo as a frame-friendly page.
 * carlpalmquist.com embeds it in an <iframe> so the portfolio shows the LIVE
 * component: every improvement to RenaidaLive ships there automatically,
 * with no code to copy.
 *
 * Composed like a miniature of the hero (brand on the left, Renaida on the
 * right) rather than a bare chat box on an empty page, so the frame reads as
 * "this is Renofine" at a glance. No nav, no sections, no banners; the CTA
 * opens renofine.com in a new tab, since the frame is a window, not the door.
 *
 * Zero backend, zero tokens — same as the landing hero. Safe to expose.
 */
const SITE = "https://renofine.com/";

function EmbedBody() {
  const { t } = useTranslation();
  const openSite = () => window.open(SITE, "_blank", "noopener");
  return (
    <div
      data-page="landing"
      style={{
        minHeight: "100vh",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        background:
          "radial-gradient(900px 520px at 88% 10%, color-mix(in oklab, var(--lp-primary) 10%, transparent), transparent 62%), var(--lp-bg)",
        fontFamily: '"Inter Tight", "Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <div
        className="grid grid-cols-1 md:grid-cols-[0.9fr_1.1fr] gap-7 md:gap-12 items-center w-full"
        style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 24px" }}
      >
        {/* Brand column — the hero in miniature. */}
        <div className="order-2 md:order-1">
          <a href={SITE} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginBottom: 22 }}>
            <Logo size={32} />
          </a>
          <div>
            <Pill tone="primary">{t("landingV2.hero.pill", "För renoveringsbranschen")}</Pill>
          </div>
          <h1
            style={{
              fontFamily: '"Fraunces", ui-serif, Georgia, serif',
              fontSize: "clamp(30px, 3.4vw, 46px)",
              fontWeight: 300,
              letterSpacing: "-0.03em",
              lineHeight: 1.04,
              margin: "16px 0 14px",
              color: "var(--lp-fg)",
            }}
          >
            {t("landingV2.hero.h1", "Hela renoveringen i en app.")}
          </h1>
          <p style={{ fontSize: 15, color: "var(--lp-fg-muted)", lineHeight: 1.55, maxWidth: 420, margin: "0 0 20px" }}>
            {t(
              "landingV2.hero.body",
              "Offerter, ROT, tidsplan, inköp och kundkommunikation — i ett verktyg byggt för dig som faktiskt utför jobbet, inte för Excel-konsulten."
            )}
          </p>
          <a
            href={SITE}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 13, color: "var(--lp-primary)", textDecoration: "none", fontWeight: 500 }}
          >
            renofine.com ↗
          </a>
        </div>
        {/* Renaida — the star, to the right with air around her. */}
        <div className="order-1 md:order-2" style={{ width: "100%", maxWidth: 620, justifySelf: "end" }}>
          <RenaidaLive onCta={openSite} />
        </div>
      </div>
    </div>
  );
}

const EmbedRenaida = () => {
  // ?lng=en lets the embedding site pick the language (carlpalmquist.com is English).
  // A CLONED i18n instance keeps that choice inside the frame: the detector never caches it,
  // so a visitor's renofine.com language (shared localStorage, same origin) is left alone.
  const [framed, setFramed] = useState<typeof i18n | null>(null);
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get("lng") || "";
    if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(want)) {
      setFramed(i18n);
      return;
    }
    // Locales load on demand, so pull the framed language into the shared store
    // before cloning — a clone of an unloaded language paints raw keys.
    let cancelled = false;
    i18n
      .loadLanguages(want)
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) setFramed(i18n.cloneInstance({ lng: want, initImmediate: false }));
      });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!framed) return null;
  return (
    <I18nextProvider i18n={framed}>
      <EmbedBody />
    </I18nextProvider>
  );
};

export default EmbedRenaida;
