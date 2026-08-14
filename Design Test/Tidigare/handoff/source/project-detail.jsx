/* global React, AppHeader, SectionHeader, Ico, icons */

// ————————————————————————————————————————————————————————————————
// Project Detail / Overview tab — hub for a single renovation
// ————————————————————————————————————————————————————————————————
window.ProjectDetail = function ProjectDetail({ variant = "A" }) {
  if (variant === "B") return <ProjectDetailSplit />;
  return <ProjectDetailEditorial />;
};

function ProjectDetailEditorial() {
  return (
    <div style={{ background: "var(--bg)", minHeight: "100%" }}>
      <AppHeader projectMode activeTab="Översikt" project={{ name: "Vasastan Totalrenovering" }} />
      <main style={{ padding: "28px 40px", maxWidth: 1280, margin: "0 auto" }}>
        {/* Hero */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 28, marginBottom: 28 }}>
          <div>
            <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-subtle)", marginBottom: 12 }}>
              Projekt · Odengatan 57, 113 22 Stockholm · 3 rok · 118 m²
            </div>
            <h1 className="font-display" style={{ fontSize: 40, fontWeight: 400, letterSpacing: "-0.025em", margin: 0, lineHeight: 1.05 }}>
              Vasastan Totalrenovering
            </h1>
            <p style={{ fontSize: 14, color: "var(--fg-muted)", marginTop: 12, maxWidth: 560, lineHeight: 1.6 }}>
              Totalrenovering av 3:a i sekelskifteshus. Bevarar originaldetaljer, nytt kök och badrum,
              genomgående parkett. Start <strong style={{ color: "var(--fg)" }}>3 mars</strong> · Mål <strong style={{ color: "var(--fg)" }}>31 juli</strong>.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <button className="rf-btn rf-btn-primary"><Ico d={icons.plus} size={13} /> Nytt arbete</button>
              <button className="rf-btn rf-btn-ghost"><Ico d={icons.users} size={13} /> Bjud in</button>
              <button className="rf-btn rf-btn-ghost"><Ico d={icons.download} size={13} /> Exportera</button>
            </div>
          </div>

          {/* KPI stack */}
          <div className="rf-card" style={{ padding: 0, overflow: "hidden" }}>
            {[
              { l: "Framsteg", v: "62%", sub: "26 av 42 arbeten klara" },
              { l: "Budget", v: "580 / 820", unit: "tkr", sub: "71% av budget använd" },
              { l: "Dagar kvar", v: "98", unit: "d", sub: "av 150 dagar total" },
            ].map((k, i) => (
              <div key={i} style={{ padding: "14px 18px", borderBottom: i < 2 ? "1px solid var(--hairline)" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                  <span className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-subtle)" }}>{k.l}</span>
                  <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{k.sub}</span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span className="tnum" style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em" }}>{k.v}</span>
                  {k.unit && <span className="mono" style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{k.unit}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Rooms strip */}
        <SectionHeader kicker="Rum" title="Fem rum i projektet" serif
          action={<button className="rf-btn rf-btn-ghost" style={{ fontSize: 12 }}>Visa alla</button>} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 36 }}>
          {[
            { name: "Kök", area: "14.2", tasks: "8/10", color: "oklch(72% 0.08 75)" },
            { name: "Vardagsrum", area: "28.6", tasks: "5/9", color: "oklch(62% 0.08 155)" },
            { name: "Sovrum", area: "16.1", tasks: "4/6", color: "oklch(58% 0.07 230)" },
            { name: "Badrum", area: "5.4", tasks: "6/12", color: "oklch(55% 0.1 25)" },
            { name: "Hall", area: "8.2", tasks: "3/5", color: "oklch(52% 0.06 300)" },
          ].map((r, i) => (
            <div key={i} className="rf-card" style={{ padding: 14, cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: r.color }} />
                <span style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</span>
              </div>
              <div className="tnum mono" style={{ fontSize: 18, fontWeight: 500 }}>{r.area}<span style={{ fontSize: 11, color: "var(--fg-subtle)", marginLeft: 2 }}>m²</span></div>
              <div style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 6 }}>{r.tasks} arbeten</div>
            </div>
          ))}
        </div>

        {/* Two columns: timeline + budget */}
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 32 }}>
          <section>
            <SectionHeader kicker="Denna vecka" title="Planerat arbete" serif={false} />
            <div className="rf-card" style={{ padding: 0, overflow: "hidden" }}>
              {[
                { day: "MÅN 21", task: "Rivning kök — klar", who: "Anders (Bygg)", pct: 100, done: true },
                { day: "TIS 22", task: "Elinstallation kök", who: "Markus (El)", pct: 60 },
                { day: "ONS 23", task: "VVS badrum — tätskikt", who: "Patrik (VVS)", pct: 40 },
                { day: "TOR 24", task: "Leverans parkett ek", who: "Inköp #082", pct: 0, upcoming: true },
                { day: "FRE 25", task: "Grundmålning vardagsrum", who: "Jonas (Måleri)", pct: 0, upcoming: true },
              ].map((t, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "68px 1fr 110px 80px", gap: 14, padding: "12px 16px", fontSize: 13, alignItems: "center", borderBottom: i < 4 ? "1px solid var(--hairline)" : "none", opacity: t.upcoming ? 0.72 : 1 }}>
                  <span className="mono" style={{ fontSize: 10, color: "var(--fg-subtle)", letterSpacing: "0.06em" }}>{t.day}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {t.done ? <Ico d={icons.check} size={13} /> : <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.upcoming ? "var(--fg-subtle)" : "var(--primary)" }} />}
                    <span>{t.task}</span>
                  </div>
                  <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>{t.who}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ flex: 1, height: 3, background: "var(--surface-2)", borderRadius: 1.5, overflow: "hidden" }}>
                      <div style={{ width: `${t.pct}%`, height: "100%", background: "var(--primary)" }} />
                    </div>
                    <span className="mono tnum" style={{ fontSize: 10, color: "var(--fg-subtle)", width: 24, textAlign: "right" }}>{t.pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <aside>
            <SectionHeader kicker="Budget" title="Kostnadscentra" serif={false} />
            <div className="rf-card" style={{ padding: 16 }}>
              {[
                { cat: "Arbetskraft", spent: 245, budget: 320, color: "var(--chart-1)" },
                { cat: "Material", spent: 198, budget: 280, color: "var(--chart-2)" },
                { cat: "VVS & El", spent: 82, budget: 140, color: "var(--chart-3)" },
                { cat: "Övrigt", spent: 55, budget: 80, color: "var(--chart-5)" },
              ].map((c, i) => (
                <div key={i} style={{ marginBottom: i < 3 ? 14 : 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
                    <span>{c.cat}</span>
                    <span className="mono tnum"><strong>{c.spent}</strong><span style={{ color: "var(--fg-subtle)" }}> / {c.budget} tkr</span></span>
                  </div>
                  <div style={{ height: 4, background: "var(--surface-2)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${(c.spent / c.budget) * 100}%`, height: "100%", background: c.color }} />
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--hairline)", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-subtle)" }}>Summa</span>
                <span className="tnum" style={{ fontSize: 18, fontWeight: 500 }}>580 <span style={{ fontSize: 12, color: "var(--fg-subtle)" }}>/ 820 tkr</span></span>
              </div>
            </div>

            <div className="rf-card" style={{ padding: 16, marginTop: 16, background: "var(--surface-2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Ico d={icons.users} size={14} /><span style={{ fontSize: 12, fontWeight: 500 }}>Team · 6 aktiva</span>
              </div>
              <div style={{ display: "flex", gap: -8, marginTop: 10 }}>
                {["AN", "JO", "MK", "PK", "EL", "+1"].map((n, i) => (
                  <div key={i} style={{
                    width: 28, height: 28, borderRadius: "50%", background: `oklch(60% 0.08 ${i * 60})`,
                    color: "white", fontSize: 10, fontWeight: 600, display: "grid", placeItems: "center",
                    marginLeft: i === 0 ? 0 : -6, border: "2px solid var(--surface-2)",
                  }}>{n}</div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function ProjectDetailSplit() {
  // Split-screen: left summary rail + right wide canvas (floor plan thumbnail + feed)
  return (
    <div style={{ background: "var(--bg)", minHeight: "100%" }}>
      <AppHeader projectMode activeTab="Översikt" project={{ name: "Vasastan Totalrenovering" }} />
      <main style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 0, minHeight: "calc(100% - 52px)" }}>
        {/* Left summary rail */}
        <aside style={{ borderRight: "1px solid var(--hairline)", padding: "24px 20px", background: "var(--surface)" }}>
          <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-subtle)", marginBottom: 10 }}>Projekt</div>
          <h2 className="font-display" style={{ fontSize: 22, fontWeight: 400, letterSpacing: "-0.02em", margin: 0, lineHeight: 1.15 }}>Vasastan Totalrenovering</h2>
          <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 6 }}>Odengatan 57 · 118 m²</div>

          <div style={{ marginTop: 24 }}>
            <div style={{ height: 4, background: "var(--surface-2)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: "62%", height: "100%", background: "var(--primary)" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "var(--fg-muted)" }}>
              <span>62% klar</span><span className="mono">dag 52 av 150</span>
            </div>
          </div>

          <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              { k: "Budget", v: "580 / 820 tkr", pct: 71 },
              { k: "Arbeten", v: "26 / 42", pct: 62 },
              { k: "Inköp", v: "18 / 24", pct: 75 },
              { k: "Filer", v: "142", pct: null },
            ].map((r, i) => (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: "var(--fg-muted)" }}>{r.k}</span>
                  <span className="mono tnum" style={{ fontWeight: 500 }}>{r.v}</span>
                </div>
                {r.pct !== null && (
                  <div style={{ height: 2, background: "var(--surface-2)", borderRadius: 1, overflow: "hidden" }}>
                    <div style={{ width: `${r.pct}%`, height: "100%", background: "var(--primary)" }} />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid var(--hairline)" }}>
            <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-subtle)", marginBottom: 10 }}>Team</div>
            {[
              { n: "Anders Karlsson", r: "Projektledare", c: "oklch(55% 0.12 75)" },
              { n: "Markus Lind", r: "Elektriker", c: "oklch(52% 0.09 230)" },
              { n: "Patrik Söder", r: "VVS", c: "oklch(55% 0.1 155)" },
              { n: "Jonas Berg", r: "Målare", c: "oklch(58% 0.12 25)" },
            ].map((m, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: m.c, color: "white", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 600 }}>{m.n.split(" ").map(w => w[0]).join("")}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{m.n}</div>
                  <div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{m.r}</div>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Right canvas */}
        <div style={{ padding: "24px 32px" }}>
          <div className="rf-card blueprint-grid" style={{ height: 340, position: "relative", display: "grid", placeItems: "center", marginBottom: 24 }}>
            <svg viewBox="0 0 400 240" style={{ width: "88%", height: "86%" }}>
              {/* Simple floor plan schematic */}
              <g stroke="var(--fg)" strokeWidth="2" fill="none">
                <rect x="20" y="20" width="360" height="200" />
                <line x1="160" y1="20" x2="160" y2="140" />
                <line x1="20" y1="140" x2="260" y2="140" />
                <line x1="260" y1="140" x2="260" y2="220" />
              </g>
              <g fill="var(--primary)" opacity="0.08">
                <rect x="22" y="22" width="136" height="116" />
              </g>
              <g fill="oklch(72% 0.08 75)" opacity="0.15"><rect x="162" y="22" width="216" height="116" /></g>
              <g fill="oklch(55% 0.1 25)" opacity="0.12"><rect x="22" y="142" width="236" height="76" /></g>
              <g className="mono" fontSize="9" fill="var(--fg-muted)" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                <text x="90" y="82">Sovrum 16.1 m²</text>
                <text x="260" y="82">Vardagsrum 28.6 m²</text>
                <text x="130" y="184">Hall + Badrum 13.6 m²</text>
                <text x="300" y="184">Kök 14.2 m²</text>
              </g>
            </svg>
            <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: 6 }}>
              <span className="rf-chip chip-muted">Plan 1 · våning 3</span>
              <span className="rf-chip">1:50</span>
            </div>
            <button className="rf-btn rf-btn-ghost" style={{ position: "absolute", top: 12, right: 12 }}>
              <Ico d={icons.plan} size={13} /> Öppna planlösning
            </button>
          </div>

          <SectionHeader kicker="Aktivitet" title="Vad händer just nu" serif={false} />
          <div className="rf-card">
            {[
              { who: "Jonas (Måleri)", what: "markerade", thing: "Grundmålning vardagsrum", status: "klar", when: "kl 09:12", dot: "check" },
              { who: "Elin", what: "godkände inköp", thing: "Parkett ek · 42 m² · 58 400 kr", status: null, when: "kl 08:55", dot: "tag" },
              { who: "Markus (El)", what: "skickade offertförfrågan för", thing: "Extra eluttag × 4", status: null, when: "i går 17:40", dot: "chat" },
              { who: "System", what: "flaggade", thing: "Bänkskivor försenade 3 dagar", status: "varning", when: "i går 09:00", dot: "alert" },
            ].map((a, i) => (
              <div key={i} style={{ display: "flex", gap: 12, padding: "12px 16px", borderBottom: i < 3 ? "1px solid var(--hairline)" : "none", alignItems: "center" }}>
                <Ico d={icons[a.dot]} size={14} />
                <div style={{ flex: 1, fontSize: 13 }}>
                  <strong>{a.who}</strong> <span style={{ color: "var(--fg-muted)" }}>{a.what}</span> <strong>{a.thing}</strong>
                </div>
                <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{a.when}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
