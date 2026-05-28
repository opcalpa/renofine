import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Menu, X, Globe } from "lucide-react";
import { Logo } from "./Logo";

const LANGUAGES = [
  { code: 'en', flag: '\u{1F1EC}\u{1F1E7}', label: 'English' },
  { code: 'sv', flag: '\u{1F1F8}\u{1F1EA}', label: 'Svenska' },
  { code: 'de', flag: '\u{1F1E9}\u{1F1EA}', label: 'Deutsch' },
  { code: 'fr', flag: '\u{1F1EB}\u{1F1F7}', label: 'Fran\u00e7ais' },
  { code: 'es', flag: '\u{1F1EA}\u{1F1F8}', label: 'Espa\u00f1ol' },
  { code: 'pl', flag: '\u{1F1F5}\u{1F1F1}', label: 'Polski' },
  { code: 'uk', flag: '\u{1F1FA}\u{1F1E6}', label: '\u0423\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u0430' },
  { code: 'ro', flag: '\u{1F1F7}\u{1F1F4}', label: 'Rom\u00e2n\u0103' },
  { code: 'lt', flag: '\u{1F1F1}\u{1F1F9}', label: 'Lietuvi\u0173' },
  { code: 'et', flag: '\u{1F1EA}\u{1F1EA}', label: 'Eesti' },
];

interface PublicNavProps {
  onCta: () => void;
  onLogin: () => void;
  onScrollTo?: (id: string) => void;
}

export function PublicNav({ onCta, onLogin, onScrollTo }: PublicNavProps) {
  const { t, i18n } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  // Close lang dropdown on outside click
  useEffect(() => {
    if (!langOpen) return;
    const handler = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [langOpen]);

  const currentLang = LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0];

  const links = [
    { label: t("landingV2.nav.features", "Funktioner"), id: "features" },
    { label: t("landingV2.nav.pricing", "Priser"), id: "pricing" },
    { label: t("landingV2.nav.homeowner", "Kundvy"), id: "homeowner" },
  ];

  const handleLink = (id: string) => {
    setMobileOpen(false);
    onScrollTo?.(id);
  };

  return (
    <header
      className="sticky top-0 z-50"
      style={{
        padding: "0 40px",
        borderBottom: "1px solid var(--lp-hairline)",
        background: "var(--lp-surface)",
      }}
    >
      {/* Desktop nav */}
      <div className="hidden md:flex items-center justify-between" style={{ height: 64 }}>
        <Logo />
        <nav className="flex items-center gap-8">
          {links.map((l) => (
            <button
              key={l.id}
              onClick={() => handleLink(l.id)}
              className="bg-transparent border-none cursor-pointer"
              style={{ fontSize: 13, color: "var(--lp-fg-muted)", fontWeight: 450 }}
            >
              {l.label}
            </button>
          ))}
          {/* Language switcher */}
          <div ref={langRef} className="relative">
            <button
              onClick={() => setLangOpen(!langOpen)}
              className="bg-transparent border-none cursor-pointer flex items-center gap-1.5"
              style={{ fontSize: 13, color: "var(--lp-fg-muted)", fontWeight: 450 }}
            >
              <Globe size={14} />
              <span>{currentLang.flag}</span>
            </button>
            {langOpen && (
              <div
                className="absolute right-0 mt-2 py-1 rounded-lg shadow-lg border"
                style={{
                  background: "var(--lp-surface)",
                  borderColor: "var(--lp-hairline)",
                  minWidth: 160,
                  zIndex: 100,
                }}
              >
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => { i18n.changeLanguage(lang.code); setLangOpen(false); }}
                    className="w-full text-left bg-transparent border-none cursor-pointer flex items-center gap-2 hover:bg-black/5 transition-colors"
                    style={{
                      padding: "8px 14px",
                      fontSize: 13,
                      color: lang.code === i18n.language ? "var(--lp-fg)" : "var(--lp-fg-muted)",
                      fontWeight: lang.code === i18n.language ? 500 : 400,
                    }}
                  >
                    <span>{lang.flag}</span>
                    <span>{lang.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={onLogin}
            className="bg-transparent border-none cursor-pointer"
            style={{ fontSize: 13, color: "var(--lp-fg)", fontWeight: 500 }}
          >
            {t("landingV2.nav.login", "Logga in")}
          </button>
          <button
            onClick={onCta}
            className="border-none cursor-pointer"
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              background: "var(--lp-accent-ink)",
              color: "var(--lp-bg)",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            {t("landingV2.nav.cta", "Kom ig\u00e5ng \u2014 gratis")}
          </button>
        </nav>
      </div>

      {/* Mobile nav */}
      <div className="flex md:hidden items-center justify-between" style={{ height: 56, padding: "0 16px", margin: "0 -40px" }}>
        <Logo />
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="grid place-items-center cursor-pointer"
          style={{
            width: 36,
            height: 36,
            border: "1px solid var(--lp-hairline)",
            background: "transparent",
            borderRadius: 6,
          }}
        >
          {mobileOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {mobileOpen && (
        <nav
          className="md:hidden flex flex-col absolute left-0 right-0"
          style={{
            top: 56,
            background: "var(--lp-surface)",
            borderBottom: "1px solid var(--lp-hairline)",
            padding: "12px 16px",
            zIndex: 9,
          }}
        >
          {links.map((l) => (
            <button
              key={l.id}
              onClick={() => handleLink(l.id)}
              className="text-left bg-transparent border-none"
              style={{
                padding: "14px 4px",
                fontSize: 15,
                color: "var(--lp-fg)",
                borderBottom: "1px solid var(--lp-hairline)",
                cursor: "pointer",
              }}
            >
              {l.label}
            </button>
          ))}
          {/* Language selector — mobile */}
          <div
            className="flex items-center gap-2 flex-wrap"
            style={{ padding: "10px 4px", borderBottom: "1px solid var(--lp-hairline)" }}
          >
            <Globe size={14} style={{ color: "var(--lp-fg-muted)" }} />
            {LANGUAGES.slice(0, 6).map((lang) => (
              <button
                key={lang.code}
                onClick={() => i18n.changeLanguage(lang.code)}
                className="bg-transparent border-none cursor-pointer"
                style={{
                  fontSize: 13,
                  padding: "4px 6px",
                  borderRadius: 4,
                  color: lang.code === i18n.language ? "var(--lp-fg)" : "var(--lp-fg-muted)",
                  fontWeight: lang.code === i18n.language ? 500 : 400,
                  background: lang.code === i18n.language ? "var(--lp-bg-sunken, rgba(0,0,0,0.05))" : "transparent",
                }}
              >
                {lang.flag}
              </button>
            ))}
          </div>
          <button
            onClick={() => { setMobileOpen(false); onLogin(); }}
            className="text-left bg-transparent border-none"
            style={{
              padding: "14px 4px",
              fontSize: 15,
              color: "var(--lp-fg)",
              borderBottom: "1px solid var(--lp-hairline)",
              cursor: "pointer",
            }}
          >
            {t("landingV2.nav.login", "Logga in")}
          </button>
          <button
            onClick={() => { setMobileOpen(false); onCta(); }}
            className="border-none cursor-pointer"
            style={{
              marginTop: 14,
              padding: "13px 18px",
              borderRadius: 6,
              background: "var(--lp-accent-ink)",
              color: "var(--lp-bg)",
              fontSize: 14,
              fontWeight: 500,
              minHeight: 44,
            }}
          >
            {t("landingV2.nav.cta", "Kom ig\u00e5ng \u2014 gratis")}
          </button>
        </nav>
      )}
    </header>
  );
}
