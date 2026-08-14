/* global React, AppHeader, SectionHeader, Ico, icons */

// ————————————————————————————————————————————————————————————————
// Timeline / Gantt
// ————————————————————————————————————————————————————————————————
window.Timeline = function Timeline() {
  const weeks = ["v13", "v14", "v15", "v16", "v17", "v18", "v19", "v20", "v21", "v22"];
  const phases = [
    { name: "Rivning", start: 0, len: 2, color: "oklch(62% 0.06 260)", tasks: ["Kök, badrum", "Innerväggar"] },
    { name: "Stomkomplettering", start: 1.5, len: 2.5, color: "oklch(62% 0.08 155)" },
    { name: "El & VVS", start: 3, len: 3, color: "oklch(55% 0.09 230)" },
    { name: "Ytskikt — kök", start: 4.5, len: 2, color: "oklch(72% 0.08 75)" },
    { name: "Ytskikt — badrum", start: 5, len: 2.5, color: "oklch(55% 0.1 25)" },
    { name: "Parkett & måleri", start: 4, len: 3.5, color: "oklch(52% 0.09 155)" },
    { name: "Inredning", start: 7, len: 2, color: "oklch(52% 0.06 300)" },
    { name: "Besiktning", start: 8.5, len: 1, color: "oklch(35% 0.03 260)" },
  ];
  const today = 4.2; // between v17 and v18
  return (
    <div style={{ background: "var(--bg)", minHeight: "100%" }}>
      <AppHeader projectMode activeTab="Tidslinje" project={{ name: "Vasastan Totalrenovering" }} />
      <main style={{ padding: "24px 40px" }}>
        <SectionHeader kicker="Tidslinje" title="Mars — juli 2026" serif
          action={<div style={{ display: "flex", gap: 2, padding: 2, background: "var(--bg-sunken)", borderRadius: 6, border: "1px solid var(--hairline)" }}>
            {["Dag", "Vecka", "Månad"].map((v, i) => (
              <button key={v} style={{
                padding: "4px 10px", fontSize: 12, borderRadius: 4,
                background: i === 1 ? "var(--surface)" : "transparent",
                color: i === 1 ? "var(--fg)" : "var(--fg-muted)",
                border: i === 1 ? "1px solid var(--hairline)" : "1px solid transparent",
                cursor: "pointer", fontWeight: i === 1 ? 500 : 400,
              }}>{v}</button>
            ))}
          </div>} />

        <div className="rf-card" style={{ padding: 0, overflow: "hidden" }}>
          {/* Header — week scale */}
          <div style={{ display: "grid", gridTemplateColumns: `240px repeat(${weeks.length}, 1fr)`, borderBottom: "1px solid var(--hairline)", background: "var(--bg-sunken)" }}>
            <div style={{ padding: "10px 16px", fontSize: 11, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.06em" }} className="mono">Fas</div>
            {weeks.map((w, i) => (
              <div key={w} className="mono" style={{ padding: "10px 0", fontSize: 11, color: "var(--fg-subtle)", textAlign: "center", borderLeft: "1px solid var(--hairline)", fontWeight: i === 4 ? 600 : 400 }}>{w}</div>
            ))}
          </div>

          {/* Rows */}
          {phases.map((ph, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: `240px repeat(${weeks.length}, 1fr)`, borderBottom: i < phases.length - 1 ? "1px solid var(--hairline)" : "none", position: "relative", minHeight: 44 }}>
              <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, borderRight: "1px solid var(--hairline)" }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: ph.color }} />
                <span style={{ fontSize: 13, fontWeight: 500 }}>{ph.name}</span>
              </div>
              <div style={{ gridColumn: `2 / span ${weeks.length}`, position: "relative" }}>
                {/* Grid lines */}
                {weeks.map((_, wi) => (
                  <div key={wi} style={{ position: "absolute", left: `${(wi / weeks.length) * 100}%`, top: 0, bottom: 0, width: 1, background: "var(--hairline)" }} />
                ))}
                {/* Today line */}
                <div style={{ position: "absolute", left: `${(today / weeks.length) * 100}%`, top: 0, bottom: 0, width: 1, background: "var(--warn)", zIndex: 2 }} />
                {/* Bar */}
                <div style={{
                  position: "absolute", top: 10, bottom: 10,
                  left: `${(ph.start / weeks.length) * 100}%`,
                  width: `${(ph.len / weeks.length) * 100}%`,
                  background: ph.color,
                  borderRadius: 4, opacity: 0.85,
                  display: "flex", alignItems: "center", padding: "0 10px",
                  color: "white", fontSize: 11, fontWeight: 500,
                  minWidth: 0, overflow: "hidden",
                  whiteSpace: "nowrap",
                }}>{ph.name}</div>
              </div>
            </div>
          ))}

          {/* Today footer */}
          <div style={{ padding: "10px 16px", fontSize: 11, color: "var(--fg-muted)", background: "var(--bg-sunken)", borderTop: "1px solid var(--hairline)", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 2, height: 10, background: "var(--warn)" }} />
            <span>Idag · 24 april 2026 · dag 52 av 150</span>
          </div>
        </div>
      </main>
    </div>
  );
};
