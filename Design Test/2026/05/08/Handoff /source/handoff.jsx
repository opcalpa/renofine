/* global React, AppHeader, Ico, icons */

// ——— Dev handoff sheet (design tokens + component contracts)
window.Handoff = function Handoff() {
  const Token = ({ name, v, sample }) => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr 40px", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--hairline)", fontSize: 12, alignItems: "center" }}>
      <code className="mono" style={{ fontSize: 11 }}>{name}</code>
      <code className="mono" style={{ fontSize: 10, color: "var(--fg-muted)" }}>{v}</code>
      <div style={{ width: 24, height: 18, borderRadius: 3, background: sample, border: "1px solid var(--hairline)" }} />
    </div>
  );
  const Row = ({ k, v }) => (
    <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12, padding: "6px 0", fontSize: 12, borderBottom: "1px solid var(--hairline)" }}>
      <code className="mono" style={{ fontSize: 11, color: "var(--fg-muted)" }}>{k}</code>
      <span>{v}</span>
    </div>
  );
  return (
    <div style={{ background: "var(--bg)", minHeight: "100%" }}>
      <main style={{ padding: "40px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <div className="mono" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-subtle)", marginBottom: 10 }}>
          Handoff · Dashboard · Paper theme
        </div>
        <h1 className="font-display" style={{ fontSize: 40, fontWeight: 400, letterSpacing: "-0.025em", margin: 0, lineHeight: 1.08 }}>
          Utvecklingsanteckningar
        </h1>
        <p style={{ fontSize: 14, color: "var(--fg-muted)", maxWidth: 560, marginTop: 10, lineHeight: 1.55 }}>
          Allt som behövs för att bygga Dashboard produktionsfärdig i er React-stack. Tokens lyfts direkt in i <code>src/index.css</code>.
        </p>

        {/* Tokens */}
        <section style={{ marginTop: 36 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 12px", letterSpacing: "-0.005em" }}>1 · Design tokens</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
            <div>
              <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-subtle)", marginBottom: 6 }}>Color</div>
              <Token name="--bg" v="oklch(97.4% 0.004 85)" sample="oklch(97.4% 0.004 85)" />
              <Token name="--surface" v="oklch(99.5% 0.002 85)" sample="oklch(99.5% 0.002 85)" />
              <Token name="--fg" v="oklch(22% 0.01 260)" sample="oklch(22% 0.01 260)" />
              <Token name="--fg-muted" v="oklch(48% 0.01 260)" sample="oklch(48% 0.01 260)" />
              <Token name="--primary" v="oklch(52% 0.09 155)" sample="oklch(52% 0.09 155)" />
              <Token name="--warn" v="oklch(72% 0.12 75)" sample="oklch(72% 0.12 75)" />
              <Token name="--danger" v="oklch(58% 0.14 25)" sample="oklch(58% 0.14 25)" />
              <Token name="--hairline" v="oklch(88% 0.005 85)" sample="oklch(88% 0.005 85)" />
            </div>
            <div>
              <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-subtle)", marginBottom: 6 }}>Type</div>
              <Row k="UI" v={<span>Inter Tight — 400 / 500 / 600</span>} />
              <Row k="Display" v={<span className="font-display">Fraunces — variable, opsz 144</span>} />
              <Row k="Mono" v={<span className="mono">JetBrains Mono — 400 / 500</span>} />
              <Row k="Base size" v="14px body, 13px UI dense" />
              <Row k="Letter-spacing" v="-0.003em body, -0.025em display" />

              <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-subtle)", margin: "18px 0 6px" }}>Radius / shadow</div>
              <Row k="--radius-sm / md / lg" v="6 · 8 · 12 px" />
              <Row k="--shadow-md" v="0 2px 8px -2px ink/8%, 0 1px 2px 0 ink/4%" />
              <Row k="Grid" v="8px base · 4px fine" />
            </div>
          </div>
        </section>

        {/* Component contracts */}
        <section style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 12px", letterSpacing: "-0.005em" }}>2 · Component contracts</h2>
          {[
            { n: "<AppHeader />", p: "activeTab?, projectMode?, project?: { name }", note: "Sticky, 52px. Top-level nav + user. Same component for app/project — switches on projectMode." },
            { n: "<StatCard />", p: "label, value, unit?, sub?", note: "Used in KPI row. Borders come from parent grid-gap, not the card itself." },
            { n: "<ProjectRow />", p: "name, addr, tasks, budget, progress (0–1), status, accent: 'primary'|'warn'|'muted'", note: "Click → project detail. Keyboard ↑↓ to navigate, Enter opens." },
            { n: "<ActivityItem />", p: "who, what, target, when, icon", note: "Composes Ico — colors come from role, not passed in." },
            { n: "<Modal />", p: "title, kicker?, footer?, onClose, width?", note: "Portal to document.body. ESC closes. Focus-trap required." },
            { n: "<Skel />", p: "w, h?, r?", note: "Use any time data is fetching. Matches the element being replaced in size." },
          ].map((c, i) => (
            <div key={i} style={{ padding: "12px 0", borderBottom: "1px solid var(--hairline)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <code className="mono" style={{ fontSize: 13, fontWeight: 500 }}>{c.n}</code>
                <code className="mono" style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{c.p}</code>
              </div>
              <div style={{ fontSize: 12, color: "var(--fg-muted)", lineHeight: 1.5 }}>{c.note}</div>
            </div>
          ))}
        </section>

        {/* Interaction & a11y */}
        <section style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 12px", letterSpacing: "-0.005em" }}>3 · Interaction & tillgänglighet</h2>
          <Row k="Focus ring" v="3px box-shadow, color-mix primary @ 25%. Visible only on :focus-visible." />
          <Row k="Hit area" v="≥32px height for clickable rows; ≥44px för knappar." />
          <Row k="Kontrast" v="Body text ≥ WCAG AA (4.5:1). --fg mot --bg = 11.8:1. --fg-muted mot --bg = 5.2:1." />
          <Row k="Motion" v="≤200ms ease for hovers. Respect prefers-reduced-motion — disable skeleton shimmer." />
          <Row k="Keyboard" v="Tab order följer visuell. / fokuserar sök. n öppnar nytt projekt. g+p → projekt." />
          <Row k="Data-testid" v="Alla tabellrader och modaler har data-testid för Playwright." />
        </section>

        {/* Ship list */}
        <section style={{ marginTop: 40, padding: 20, background: "var(--surface-2)", borderRadius: 10, border: "1px solid var(--hairline)" }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 12px" }}>4 · Vecka 1–2 ship list</h2>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "var(--fg)", lineHeight: 1.8 }}>
            <li>Lägg in <code className="mono">tokens.css</code> i <code>src/index.css</code> under <code>:root</code>. Ersätt befintliga färgtoken 1:1 efter matris ovan.</li>
            <li>Ladda Inter Tight + Fraunces + JetBrains Mono via Google Fonts eller självvärd.</li>
            <li>Bygg <code>&lt;AppHeader&gt;</code>, <code>&lt;StatCard&gt;</code>, <code>&lt;ProjectRow&gt;</code>, <code>&lt;ActivityItem&gt;</code> — allt annat är komposition.</li>
            <li>Hook upp <code>GET /api/projects?active=true</code> till projektlistan. Skeleton tills svar ≥150ms annars hoppa den.</li>
            <li>Empty state: visa när <code>projects.length === 0</code>. Onboarding-steg kopplas till user flags.</li>
            <li>Modalen "Nytt projekt" 3-stegad: Grund · Rum · Team. Mobile = full screen overlay.</li>
            <li>Notis-panel drivs av <code>/api/inbox</code>; bell-badge räknas från unread.</li>
            <li>Mobile breakpoint vid 640px. Bottom tab bar ersätter top-nav. Samma data.</li>
          </ol>
        </section>
      </main>
    </div>
  );
};
