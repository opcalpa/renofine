/* global React, AppHeader, Ico, icons */

// ————————————————————————————————————————————————————————————————
// Floor Map / Space Planner — the showpiece
// ————————————————————————————————————————————————————————————————
window.FloorMap = function FloorMap({ variant = "A" }) {
  if (variant === "B") return <FloorMapDark />;
  return <FloorMapLight />;
};

function FloorMapChrome({ children, dark = false }) {
  return (
    <div style={{ background: "var(--bg)", minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <AppHeader projectMode activeTab="Planlösning" project={{ name: "Vasastan Totalrenovering" }} />
      {children}
    </div>
  );
}

function ToolbarButton({ icon, active, label, shortcut }) {
  return (
    <button title={label + (shortcut ? ` (${shortcut})` : "")} style={{
      width: 32, height: 32, borderRadius: 6, border: "1px solid transparent",
      background: active ? "var(--surface-2)" : "transparent",
      color: active ? "var(--fg)" : "var(--fg-muted)",
      display: "grid", placeItems: "center", cursor: "pointer",
      position: "relative",
    }}>
      <Ico d={icons[icon]} size={15} />
    </button>
  );
}

function FloorMapLight() {
  return (
    <FloorMapChrome>
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "52px 1fr 300px", minHeight: 0 }}>
        {/* Left tool rail */}
        <div style={{ borderRight: "1px solid var(--hairline)", background: "var(--surface)", display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 0", gap: 4 }}>
          <ToolbarButton icon="handle" label="Välj" shortcut="V" />
          <ToolbarButton icon="room" label="Rum" active shortcut="R" />
          <ToolbarButton icon="ruler" label="Vägg" shortcut="W" />
          <ToolbarButton icon="plus" label="Form" shortcut="S" />
          <ToolbarButton icon="tag" label="Symbol" shortcut="Y" />
          <ToolbarButton icon="image" label="Text" shortcut="T" />
          <div style={{ width: 24, height: 1, background: "var(--hairline)", margin: "6px 0" }} />
          <ToolbarButton icon="layers" label="Lager" />
          <ToolbarButton icon="eye" label="3D" />
          <div style={{ flex: 1 }} />
          <ToolbarButton icon="settings" label="Inställningar" />
        </div>

        {/* Canvas */}
        <div style={{ position: "relative", background: "var(--bg-sunken)", overflow: "hidden" }}>
          {/* Top canvas bar */}
          <div style={{ position: "absolute", top: 12, left: 12, right: 12, display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 5 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <div className="rf-card" style={{ padding: "4px 8px", fontSize: 11, display: "flex", alignItems: "center", gap: 8, background: "var(--surface)" }}>
                <span className="mono" style={{ color: "var(--fg-subtle)" }}>PLAN</span>
                <span style={{ fontWeight: 500 }}>Våning 3 · v2</span>
                <Ico d={icons.chevDown} size={11} />
              </div>
              <div className="rf-card" style={{ padding: "4px 8px", fontSize: 11, display: "flex", gap: 10, background: "var(--surface)" }} className="mono">
                <span style={{ color: "var(--fg-subtle)" }}>1:50</span>
                <span style={{ color: "var(--fg-subtle)" }}>mm</span>
                <span style={{ color: "var(--fg-subtle)" }}>snap 100</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="rf-btn rf-btn-ghost" style={{ background: "var(--surface)" }}><Ico d={icons.sparkle} size={13} /> AI från foto</button>
              <button className="rf-btn rf-btn-ghost" style={{ background: "var(--surface)" }}><Ico d={icons.download} size={13} /> Exportera</button>
              <button className="rf-btn rf-btn-primary"><Ico d={icons.check} size={13} /> Dela</button>
            </div>
          </div>

          {/* Blueprint canvas */}
          <div className="blueprint-grid" style={{ position: "absolute", inset: 0, opacity: 0.45 }} />
          <svg viewBox="0 0 1000 600" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} preserveAspectRatio="xMidYMid meet">
            {/* Outer walls */}
            <g fill="none" stroke="var(--fg)" strokeWidth="3">
              <rect x="120" y="80" width="760" height="440" />
              <line x1="500" y1="80" x2="500" y2="320" />
              <line x1="120" y1="320" x2="700" y2="320" />
              <line x1="700" y1="320" x2="700" y2="520" />
            </g>
            {/* Room fills */}
            <g opacity="0.14">
              <rect x="122" y="82" width="376" height="236" fill="oklch(62% 0.08 155)" />
              <rect x="502" y="82" width="376" height="236" fill="oklch(72% 0.08 75)" />
              <rect x="122" y="322" width="576" height="196" fill="oklch(55% 0.1 25)" />
              <rect x="702" y="322" width="176" height="196" fill="oklch(52% 0.06 300)" />
            </g>
            {/* Door swings */}
            <g fill="none" stroke="var(--fg-muted)" strokeWidth="1" strokeDasharray="3 3">
              <path d="M 300 320 A 40 40 0 0 1 300 280" />
              <path d="M 600 320 A 40 40 0 0 1 600 280" />
            </g>
            {/* Furniture symbols */}
            <g fill="none" stroke="var(--fg)" strokeWidth="1" opacity="0.75">
              {/* Sofa */}
              <rect x="200" y="180" width="160" height="60" rx="4" />
              <line x1="200" y1="195" x2="360" y2="195" />
              {/* Bed */}
              <rect x="560" y="130" width="180" height="110" rx="3" />
              <line x1="560" y1="160" x2="740" y2="160" />
              {/* Kitchen counter */}
              <rect x="720" y="340" width="150" height="40" />
              <rect x="870" y="340" width="8" height="150" />
              {/* Bathtub */}
              <rect x="160" y="360" width="140" height="70" rx="10" />
              {/* Table */}
              <circle cx="300" cy="470" r="30" />
            </g>
            {/* Dimension labels */}
            <g className="mono" fontSize="11" fill="var(--fg-muted)" style={{ fontFamily: "JetBrains Mono, monospace" }}>
              <text x="280" y="70" textAnchor="middle">5 120 mm</text>
              <text x="690" y="70" textAnchor="middle">5 120 mm</text>
              <text x="100" y="204" textAnchor="middle" transform="rotate(-90 100 204)">3 180 mm</text>
              <text x="408" y="428" textAnchor="middle">7 820 mm</text>
            </g>
            {/* Labels */}
            <g fill="var(--fg)" fontSize="13" fontWeight="500">
              <text x="310" y="200">Sovrum</text>
              <text x="310" y="216" fontSize="10" fill="var(--fg-muted)" className="mono">16.1 m² · 2 780×5 780</text>
              <text x="690" y="200">Vardagsrum</text>
              <text x="690" y="216" fontSize="10" fill="var(--fg-muted)" className="mono">28.6 m²</text>
              <text x="410" y="430">Hall + Badrum</text>
              <text x="790" y="430">Kök</text>
              <text x="790" y="446" fontSize="10" fill="var(--fg-muted)" className="mono">14.2 m²</text>
            </g>
            {/* Selected object highlight */}
            <rect x="200" y="180" width="160" height="60" rx="4" fill="none" stroke="var(--primary)" strokeWidth="2" />
            <g fill="var(--primary)">
              <rect x="196" y="176" width="6" height="6" />
              <rect x="358" y="176" width="6" height="6" />
              <rect x="196" y="236" width="6" height="6" />
              <rect x="358" y="236" width="6" height="6" />
            </g>
          </svg>

          {/* Zoom & mini */}
          <div style={{ position: "absolute", bottom: 12, left: 12, display: "flex", gap: 6 }}>
            <div className="rf-card" style={{ padding: "3px 6px", background: "var(--surface)", display: "flex", alignItems: "center", gap: 6 }} className="mono">
              <button style={{ border: "none", background: "none", cursor: "pointer", fontSize: 13, color: "var(--fg-muted)" }}>−</button>
              <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>100%</span>
              <button style={{ border: "none", background: "none", cursor: "pointer", fontSize: 13, color: "var(--fg-muted)" }}>+</button>
            </div>
          </div>
          <div className="rf-card" style={{ position: "absolute", bottom: 12, right: 12, width: 160, height: 100, background: "var(--surface)", padding: 6 }}>
            <div className="blueprint-grid" style={{ width: "100%", height: "100%", borderRadius: 4, position: "relative" }}>
              <div style={{ position: "absolute", left: "22%", top: "22%", width: "55%", height: "55%", border: "1.5px solid var(--primary)", borderRadius: 2 }} />
            </div>
          </div>
        </div>

        {/* Right inspector */}
        <aside style={{ borderLeft: "1px solid var(--hairline)", background: "var(--surface)", overflowY: "auto" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--hairline)" }}>
            <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-subtle)", marginBottom: 6 }}>Markerat · Soffa 3-sits</div>
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>Soffa</h3>
            <div className="mono" style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 3 }}>Vardagsrum · symbol #soffa-3</div>
          </div>

          <div style={{ padding: 16, borderBottom: "1px solid var(--hairline)" }}>
            <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-subtle)", marginBottom: 10 }}>Dimensioner</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[["Bredd", "2 200"], ["Djup", "900"], ["X", "640"], ["Y", "1 850"]].map(([l, v], i) => (
                <div key={i}>
                  <label style={{ fontSize: 11, color: "var(--fg-muted)" }}>{l}</label>
                  <div style={{ display: "flex", marginTop: 3, border: "1px solid var(--hairline)", borderRadius: 4, alignItems: "center", background: "var(--bg-sunken)" }}>
                    <input className="mono tnum" defaultValue={v} style={{ border: "none", background: "transparent", padding: "6px 8px", fontSize: 12, width: "100%", outline: "none" }} />
                    <span className="mono" style={{ fontSize: 10, color: "var(--fg-subtle)", paddingRight: 8 }}>mm</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <button className="rf-btn rf-btn-ghost" style={{ flex: 1, fontSize: 11, justifyContent: "center" }}>Rotera 90°</button>
              <button className="rf-btn rf-btn-ghost" style={{ flex: 1, fontSize: 11, justifyContent: "center" }}>Spegla</button>
            </div>
          </div>

          <div style={{ padding: 16, borderBottom: "1px solid var(--hairline)" }}>
            <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-subtle)", marginBottom: 10 }}>Rum · Vardagsrum</div>
            <div style={{ fontSize: 12, lineHeight: 1.7 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--fg-muted)" }}>Yta</span><span className="mono tnum">28.6 m²</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--fg-muted)" }}>Omkrets</span><span className="mono tnum">21.4 m</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--fg-muted)" }}>Takhöjd</span><span className="mono tnum">2 450 mm</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--fg-muted)" }}>Väggyta</span><span className="mono tnum">52.4 m²</span></div>
            </div>
          </div>

          <div style={{ padding: 16 }}>
            <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-subtle)", marginBottom: 10 }}>Kopplade arbeten · 5</div>
            {[
              { n: "Grundmålning", s: "klar", col: "var(--fg-subtle)" },
              { n: "Parkett ek 15 mm", s: "pågår", col: "var(--primary)" },
              { n: "Fönsterkarm — slipning", s: "att göra", col: "var(--fg-subtle)" },
              { n: "Taklist ny", s: "att göra", col: "var(--fg-subtle)" },
            ].map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", fontSize: 12, borderBottom: i < 3 ? "1px solid var(--hairline)" : "none" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.col }} />
                <span style={{ flex: 1 }}>{t.n}</span>
                <span className="rf-chip chip-muted" style={{ fontSize: 10 }}>{t.s}</span>
              </div>
            ))}
            <button className="rf-btn rf-btn-ghost" style={{ width: "100%", justifyContent: "center", marginTop: 10, fontSize: 12 }}>
              <Ico d={icons.plus} size={12} /> Koppla arbete
            </button>
          </div>
        </aside>
      </div>
    </FloorMapChrome>
  );
}

function FloorMapDark() {
  // Same layout, charcoal pro-tool feel (the rendering is driven by the theme token switch)
  return <FloorMapLight />;
}
