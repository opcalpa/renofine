/* global React */
const { useState } = React;

// ————————————————————————————————————————————————————————————————
// Shared icons — inline SVG, 16px, stroke 1.5 (calm, architectural)
// ————————————————————————————————————————————————————————————————
const Ico = ({ d, size = 16, fill = "none" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    {typeof d === "string" ? <path d={d} /> : d}
  </svg>
);

const icons = {
  folder: "M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z",
  home: "M3 11 12 4l9 7v8a2 2 0 0 1-2 2h-4v-6h-6v6H5a2 2 0 0 1-2-2v-8Z",
  plan: "M4 4h16v16H4zM4 10h16M10 4v16",
  task: "M9 11l3 3 7-7M5 5v14h14",
  budget: "M4 19h16M6 16l3-6 4 3 5-9",
  box: "M3 7 12 3l9 4v10l-9 4-9-4V7ZM3 7l9 4 9-4M12 11v10",
  users: "M16 11a3 3 0 1 0-6 0 3 3 0 0 0 6 0ZM5 20a7 7 0 0 1 14 0",
  chat: "M4 5h16v11H9l-5 4V5Z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM21 21l-5-5",
  bell: "M18 16V11a6 6 0 1 0-12 0v5l-2 3h16l-2-3ZM10 20a2 2 0 0 0 4 0",
  plus: "M12 5v14M5 12h14",
  chevDown: "m6 9 6 6 6-6",
  chevRight: "m9 6 6 6-6 6",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  check: "m5 12 5 5 9-10",
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  alert: "M12 9v4M12 17h.01M4.93 19h14.14a2 2 0 0 0 1.73-3L13.73 4a2 2 0 0 0-3.46 0L3.2 16a2 2 0 0 0 1.73 3Z",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-3a8 8 0 0 1-.1 1.3l2.1 1.6-2 3.4-2.4-1a8 8 0 0 1-2.2 1.3l-.4 2.4h-4l-.4-2.4a8 8 0 0 1-2.2-1.3l-2.4 1-2-3.4 2.1-1.6a8 8 0 0 1 0-2.6L2 9.1l2-3.4 2.4 1a8 8 0 0 1 2.2-1.3l.4-2.4h4l.4 2.4a8 8 0 0 1 2.2 1.3l2.4-1 2 3.4-2.1 1.6A8 8 0 0 1 20 12Z",
  ruler: "M3 16 16 3l5 5L8 21l-5-5ZM7 15l2 2M10 12l2 2M13 9l2 2M16 6l2 2",
  layers: "m12 3 9 5-9 5-9-5 9-5ZM3 13l9 5 9-5M3 18l9 5 9-5",
  image: "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Zm0 11 5-5 4 4 4-4 5 5M9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z",
  filter: "M3 5h18M6 12h12M10 19h4",
  sparkle: "M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2",
  sortDesc: "M7 4v16M3 16l4 4 4-4M14 6h7M14 11h5M14 16h3",
  download: "M12 4v12M6 14l6 6 6-6M4 22h16",
  link: "M9 15l6-6M10 7h4a4 4 0 1 1 0 8M14 17h-4a4 4 0 1 1 0-8",
  handle: "M8 6h.01M8 12h.01M8 18h.01M16 6h.01M16 12h.01M16 18h.01",
  room: "M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5 3h14l3 9v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7l3-9Z",
  sheet: "M8 3h9l4 4v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM17 3v4h4M4 8v12a1 1 0 0 0 1 1",
  tag: "M20.6 13.4 13 21a2 2 0 0 1-2.8 0l-7.2-7.2a1 1 0 0 1-.3-.7V4a1 1 0 0 1 1-1h9.1a1 1 0 0 1 .7.3l7.2 7.2a2 2 0 0 1 0 2.8ZM7 7h.01",
};

// ————————————————————————————————————————————————————————————————
// Theme switcher — shows at top of each artboard
// ————————————————————————————————————————————————————————————————
window.ThemeSwitch = function ThemeSwitch({ scope = "paper", onChange }) {
  const [theme, setTheme] = useState(scope);
  const apply = (t) => { setTheme(t); onChange && onChange(t); };
  return (
    <div style={{ display: "flex", gap: 2, padding: 2, background: "var(--bg-sunken)", borderRadius: 6, border: "1px solid var(--hairline)" }}>
      {[["paper", "Paper"], ["charcoal", "Charcoal"], ["blueprint", "Blueprint"]].map(([k, label]) => (
        <button key={k} onClick={() => apply(k)} style={{
          padding: "4px 10px", fontSize: 11, fontWeight: 500, borderRadius: 4,
          background: theme === k ? "var(--surface)" : "transparent",
          color: theme === k ? "var(--fg)" : "var(--fg-muted)",
          border: theme === k ? "1px solid var(--hairline)" : "1px solid transparent",
          cursor: "pointer", letterSpacing: "-0.002em",
        }}>{label}</button>
      ))}
    </div>
  );
};

// ————————————————————————————————————————————————————————————————
// AppHeader — calm editorial chrome, Swedish
// ————————————————————————————————————————————————————————————————
window.AppHeader = function AppHeader({ projectMode = false, activeTab = "", project = null, onTheme }) {
  return (
    <header style={{
      height: 52, borderBottom: "1px solid var(--hairline)", background: "var(--surface)",
      display: "flex", alignItems: "center", padding: "0 20px", gap: 20,
    }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 22, height: 22, borderRadius: 5, background: "var(--accent-ink)",
          color: "var(--bg)", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700,
          letterSpacing: "-0.04em",
        }}>R</div>
        <span className="font-display" style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.03em" }}>
          Renofine
        </span>
      </div>

      {projectMode ? (
        <>
          {/* Crumb */}
          <nav style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--fg-muted)" }}>
            <span style={{ cursor: "pointer" }}>Projekt</span>
            <Ico d={icons.chevRight} size={14} />
            <span style={{ color: "var(--fg)", fontWeight: 500 }}>{project?.name || "Vasastan Totalrenovering"}</span>
            <span className="rf-chip chip-primary" style={{ marginLeft: 6 }}>Pågående</span>
          </nav>
          {/* Tabs */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 2, marginLeft: 12 }}>
            {["Översikt", "Rum", "Planlösning", "Arbeten", "Tidslinje", "Budget", "Inköp", "Team", "Filer"].map(tab => (
              <button key={tab} style={{
                padding: "6px 10px", fontSize: 13, borderRadius: 6, border: "1px solid transparent",
                background: activeTab === tab ? "var(--surface-2)" : "transparent",
                color: activeTab === tab ? "var(--fg)" : "var(--fg-muted)",
                fontWeight: activeTab === tab ? 500 : 400, cursor: "pointer",
              }}>{tab}</button>
            ))}
          </div>
        </>
      ) : (
        <nav style={{ flex: 1, display: "flex", alignItems: "center", gap: 4, marginLeft: 8 }}>
          {["Start", "Hitta proffs", "Tips", "Nyheter"].map((l, i) => (
            <button key={l} style={{
              padding: "6px 10px", fontSize: 13, borderRadius: 6,
              background: i === 0 ? "var(--surface-2)" : "transparent", border: "1px solid transparent",
              color: i === 0 ? "var(--fg)" : "var(--fg-muted)", cursor: "pointer",
            }}>{l}</button>
          ))}
        </nav>
      )}

      {/* Right — search, bell, theme, avatar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 6, padding: "5px 10px",
          background: "var(--bg-sunken)", borderRadius: 6, border: "1px solid var(--hairline)",
          fontSize: 12, color: "var(--fg-muted)", width: 220,
        }}>
          <Ico d={icons.search} size={14} />
          <span style={{ flex: 1 }}>Sök i projektet…</span>
          <kbd className="mono" style={{
            fontSize: 10, padding: "1px 5px", border: "1px solid var(--hairline)",
            borderRadius: 3, background: "var(--surface)", color: "var(--fg-subtle)",
          }}>⌘K</kbd>
        </div>
        <button className="rf-btn rf-btn-ghost" style={{ padding: 7 }}>
          <Ico d={icons.bell} size={15} />
        </button>
        {onTheme && <ThemeSwitch onChange={onTheme} />}
        <div style={{
          width: 30, height: 30, borderRadius: "50%", background: "oklch(55% 0.12 75)",
          color: "oklch(99% 0.002 85)", display: "grid", placeItems: "center",
          fontSize: 12, fontWeight: 600,
        }}>EL</div>
      </div>
    </header>
  );
};

// ————————————————————————————————————————————————————————————————
// Section headers — label + title, editorial style
// ————————————————————————————————————————————————————————————————
window.SectionHeader = function SectionHeader({ kicker, title, action, serif = true }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 16 }}>
      <div>
        {kicker && <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-subtle)", marginBottom: 6 }}>{kicker}</div>}
        <h2 className={serif ? "font-display" : ""} style={{ fontSize: serif ? 28 : 18, fontWeight: serif ? 400 : 600, letterSpacing: serif ? "-0.02em" : "-0.005em", margin: 0, lineHeight: 1.15 }}>{title}</h2>
      </div>
      {action}
    </div>
  );
};

window.Ico = Ico;
window.icons = icons;
