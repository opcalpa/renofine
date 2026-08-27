import { useMemo } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n/config";
import { RenaidaLive } from "@/components/landing/RenaidaLive";

/**
 * /embed/renaida — Renaida's scripted landing demo as a bare, frame-friendly
 * page. carlpalmquist.com embeds it in an <iframe> so the portfolio shows the
 * LIVE component: every improvement to RenaidaLive ships there automatically,
 * with no code to copy. Nothing else from the landing page renders here (no
 * nav, no sections), and the CTA opens renofine.com in a new tab, since the
 * frame itself is not the place to sign up.
 *
 * Zero backend, zero tokens — same as the landing hero. Safe to expose.
 */
const SUPPORTED = ["en", "sv", "de", "fr", "es", "pl", "uk"]; // = resources i i18n/config.ts

const EmbedRenaida = () => {
  const openSite = () => window.open("https://renofine.com/", "_blank", "noopener");
  // ?lng=en lets the embedding site pick the language (carlpalmquist.com is English).
  // A CLONED i18n instance keeps that choice inside the frame: the detector never caches it,
  // so a visitor's renofine.com language (shared localStorage, same origin) is left alone.
  const framed = useMemo(() => {
    const want = new URLSearchParams(window.location.search).get("lng") || "";
    if (!SUPPORTED.includes(want)) return i18n;
    return i18n.cloneInstance({ lng: want, initImmediate: false });
  }, []);
  return (
    <I18nextProvider i18n={framed}>
    <div
      data-page="landing"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        boxSizing: "border-box",
        background: "var(--lp-bg)",
        fontFamily: '"Inter Tight", "Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <div style={{ width: "100%", maxWidth: 700 }}>
        <RenaidaLive onCta={openSite} />
      </div>
    </div>
    </I18nextProvider>
  );
};

export default EmbedRenaida;
