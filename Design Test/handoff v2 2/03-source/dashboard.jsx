/* global React, AppHeader, SectionHeader, Ico, icons */
const { useState: useState_d } = React;

// ————————————————————————————————————————————————————————————————
// Dashboard / project overview — editorial, data-rich but calm
// ————————————————————————————————————————————————————————————————
window.Dashboard = function Dashboard({ variant = "A" }) {
  // A = "Editorial Paper" — warm neutrals, display serif moments, dense info
  // B = "Ops Console" — dense table-first, Linear-style, no serif
  // C = "Portfolio" — card-led, imagery-forward, for architects with many clients
  if (variant === "B") return <DashboardOps />;
  if (variant === "C") return <DashboardPortfolio />;
  return <DashboardEditorial />;
};

function Stat({ label, value, sub, unit }) {
  return (
    <div style={{ padding: "18px 20px", borderRight: "1px solid var(--hairline)" }}>
      <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-subtle)", marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span className="font-display tnum" style={{ fontSize: 30, fontWeight: 400, letterSpacing: "-0.022em", lineHeight: 1 }}>{value}</span>
        {unit && <span className="mono" style={{ fontSize: 12, color: "var(--fg-subtle)" }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function DashboardEditorial() {
  return (
    <div style={{ background: "var(--bg)", minHeight: "100%" }}>
      <AppHeader />
      <main style={{ padding: "32px 40px", maxWidth: 1280, margin: "0 auto" }}>
        {/* Editorial hero */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 32, paddingBottom: 24, borderBottom: "1px solid var(--hairline)" }}>
          <div>
            <div className="mono" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-subtle)", marginBottom: 12 }}>
              Min start · Torsdag 24 april 2026
            </div>
            <h1 className="font-display" style={{ fontSize: 48, fontWeight: 400, letterSpacing: "-0.025em", margin: 0, lineHeight: 1.05 }}>
              God morgon, Elin.
            </h1>
            <p style={{ fontSize: 15, color: "var(--fg-muted)", marginTop: 10, maxWidth: 540, lineHeight: 1.5 }}>
              Du har <strong style={{ color: "var(--fg)" }}>3 arbeten</strong> som behöver uppmärksamhet idag och en materialbeställning som väntar på godkännande.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="rf-btn rf-btn-ghost"><Ico d={icons.inbox} size={14} /> Inkorg (7)</button>
            <button className="rf-btn rf-btn-primary"><Ico d={icons.plus} size={14} /> Nytt projekt</button>
          </div>
        </div>

        {/* Today strip */}
        <div className="rf-card" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 32, overflow: "hidden" }}>
          <Stat label="Aktiva projekt" value="6" sub="2 på tidsplan · 1 försenat" />
          <Stat label="Arbeten denna vecka" value="23" sub="8 klara · 12 pågår · 3 att göra" />
          <Stat label="Budget kvar" value="842" unit="tkr" sub="av 1 240 tkr total" />
          <div style={{ padding: "18px 20px" }}>
            <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-subtle)", marginBottom: 8 }}>Inköp att godkänna</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span className="font-display tnum" style={{ fontSize: 30, fontWeight: 400, letterSpacing: "-0.022em", lineHeight: 1 }}>4</span>
              <span className="mono" style={{ fontSize: 12, color: "var(--fg-subtle)" }}>st</span>
            </div>
            <a style={{ fontSize: 12, color: "var(--primary)", marginTop: 6, display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none", fontWeight: 500 }}>
              Granska <Ico d={icons.arrowRight} size={12} />
            </a>
          </div>
        </div>

        {/* Two-column: projects list + activity */}
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 32 }}>
          {/* Projects */}
          <section>
            <SectionHeader kicker="Projekt" title="Dina renoveringar" serif={true}
              action={<div style={{ display: "flex", gap: 6 }}>
                <button className="rf-btn rf-btn-ghost" style={{ padding: "5px 9px", fontSize: 12 }}>Alla</button>
                <button className="rf-btn rf-btn-ghost" style={{ padding: "5px 9px", fontSize: 12, color: "var(--fg-muted)", borderColor: "transparent" }}>Pågående</button>
                <button className="rf-btn rf-btn-ghost" style={{ padding: "5px 9px", fontSize: 12, color: "var(--fg-muted)", borderColor: "transparent" }}>Avslutade</button>
              </div>}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 1, background: "var(--hairline)", border: "1px solid var(--hairline)", borderRadius: 12, overflow: "hidden" }}>
              {[
                { name: "Vasastan Totalrenovering", addr: "Odengatan 57 · 3 rok", tasks: "18 / 42", budget: "580 / 820 tkr", progress: 0.62, status: "Pågående", accent: "primary" },
                { name: "Brf Linden — Badrum", addr: "Linnégatan 12 · 1 rok", tasks: "5 / 9", budget: "87 / 140 tkr", progress: 0.38, status: "Pågående", accent: "primary" },
                { name: "Kungsholmen Köksbyte", addr: "Fleminggatan 34", tasks: "12 / 12", budget: "210 / 210 tkr", progress: 1, status: "Klar", accent: "muted" },
                { name: "Villa Djursholm", addr: "Ekbacksvägen 8 · 7 rok", tasks: "0 / 27", budget: "Offert skickad", progress: 0, status: "Lead", accent: "warn" },
              ].map((p, i) => (
                <div key={i} style={{ background: "var(--surface)", padding: "16px 20px", display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1.2fr auto", gap: 16, alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.005em" }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: "var(--fg-subtle)", marginTop: 2 }}>{p.addr}</div>
                  </div>
                  <div style={{ fontSize: 12 }}>
                    <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-subtle)" }}>Arbeten</div>
                    <div className="tnum" style={{ marginTop: 2 }}>{p.tasks}</div>
                  </div>
                  <div style={{ fontSize: 12 }}>
                    <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-subtle)" }}>Budget</div>
                    <div className="tnum" style={{ marginTop: 2 }}>{p.budget}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1, height: 4, background: "var(--surface-2)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${p.progress * 100}%`, height: "100%", background: p.accent === "warn" ? "var(--warn)" : p.progress === 1 ? "var(--fg-muted)" : "var(--primary)" }} />
                    </div>
                    <span className={`rf-chip chip-${p.accent}`}>{p.status}</span>
                  </div>
                  <Ico d={icons.chevRight} size={14} />
                </div>
              ))}
            </div>
          </section>

          {/* Activity */}
          <aside>
            <SectionHeader kicker="I dag" title="Aktivitet" serif={true}
              action={<button className="rf-btn rf-btn-ghost" style={{ padding: "5px 9px", fontSize: 12 }}>Allt</button>} />
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {[
                { who: "Jonas (Måleri)", what: "rapporterade klart", target: "Vardagsrum — Grundmålning", when: "kl 09:12", color: "oklch(55% 0.12 75)", dot: "check" },
                { who: "Elin", what: "godkände inköp", target: "Parkett ek · 42 m²", when: "kl 08:55", color: "oklch(52% 0.09 155)", dot: "tag" },
                { who: "Markus (VVS)", what: "skickade offertförfrågan", target: "Badrum — nytt golvbrunn", when: "i går 17:40", color: "oklch(45% 0.05 230)", dot: "chat" },
                { who: "Anna", what: "laddade upp ritning", target: "Vasastan — plan 3 v2", when: "i går 14:20", color: "oklch(58% 0.14 25)", dot: "image" },
                { who: "System", what: "flaggade försening", target: "Kök — bänkskivor 3 dagar sen", when: "i går 09:00", color: "var(--warn)", dot: "alert" },
              ].map((a, i) => (
                <div key={i} style={{ display: "flex", gap: 12 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", background: a.color, color: "white",
                    display: "grid", placeItems: "center", flexShrink: 0,
                  }}>
                    <Ico d={icons[a.dot]} size={13} />
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.5, flex: 1 }}>
                    <span style={{ fontWeight: 500 }}>{a.who}</span>{" "}
                    <span style={{ color: "var(--fg-muted)" }}>{a.what}</span>{" "}
                    <span style={{ fontWeight: 500 }}>{a.target}</span>
                    <div className="mono" style={{ fontSize: 10.5, color: "var(--fg-subtle)", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>{a.when}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rf-card" style={{ marginTop: 28, padding: 16, background: "var(--surface-2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Ico d={icons.sparkle} size={14} />
                <span style={{ fontSize: 12, fontWeight: 500 }}>Förslag</span>
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--fg-muted)", margin: 0 }}>
                <strong style={{ color: "var(--fg)" }}>Brf Linden</strong> saknar start­datum på 3 arbeten. Lägger du till dem syns projektet korrekt i tidslinjen.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function DashboardOps() {
  // Linear-style, dense, mono-heavy numerics
  return (
    <div style={{ background: "var(--bg)", minHeight: "100%" }}>
      <AppHeader />
      <main style={{ padding: "20px 28px", maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, letterSpacing: "-0.01em" }}>Start</h1>
            <span className="mono" style={{ fontSize: 11, color: "var(--fg-subtle)" }}>6 projekt · 23 arbeten v. 17</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="rf-btn rf-btn-ghost"><Ico d={icons.filter} size={13} /> Filter</button>
            <button className="rf-btn rf-btn-ghost"><Ico d={icons.sortDesc} size={13} /> Sortera</button>
            <button className="rf-btn rf-btn-ink"><Ico d={icons.plus} size={13} /> Nytt projekt</button>
          </div>
        </div>

        {/* Tight stat row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 1, background: "var(--hairline)", border: "1px solid var(--hairline)", borderRadius: 8, marginBottom: 20 }}>
          {[
            { l: "Aktiva", v: "6", d: "+1 v/v" },
            { l: "Arbeten klara", v: "128", d: "av 312" },
            { l: "Försenade", v: "3", d: "-2 v/v", warn: true },
            { l: "Budget använt", v: "58%", d: "av 2.4 Mkr" },
            { l: "Inköp", v: "4", d: "väntar" },
            { l: "Team", v: "12", d: "aktiva" },
          ].map((s, i) => (
            <div key={i} style={{ background: "var(--surface)", padding: "12px 14px" }}>
              <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-subtle)" }}>{s.l}</div>
              <div className="tnum" style={{ fontSize: 20, fontWeight: 600, marginTop: 4, letterSpacing: "-0.01em", color: s.warn ? "var(--warn)" : "var(--fg)" }}>{s.v}</div>
              <div className="mono" style={{ fontSize: 10, color: "var(--fg-subtle)", marginTop: 2 }}>{s.d}</div>
            </div>
          ))}
        </div>

        {/* Projects table */}
        <div style={{ border: "1px solid var(--hairline)", borderRadius: 8, overflow: "hidden", background: "var(--surface)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "30px 2fr 1fr 1fr 1.2fr 1fr 100px 28px", padding: "10px 14px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-subtle)", background: "var(--bg-sunken)", borderBottom: "1px solid var(--hairline)", fontWeight: 500 }} className="mono">
            <span></span><span>Projekt</span><span>Status</span><span>Framsteg</span><span>Budget</span><span>Nästa milstolpe</span><span style={{ textAlign: "right" }}>Uppdaterat</span><span></span>
          </div>
          {[
            { name: "Vasastan Totalrenovering", client: "Karlsson · Odengatan 57", status: "Pågående", progress: 62, budget: "580 / 820 tkr", used: 0.71, milestone: "Kök – mont. bänkskivor", due: "29 apr", updated: "2h" },
            { name: "Brf Linden — Badrum", client: "Brf Linden · Linnégatan 12", status: "Pågående", progress: 38, budget: "87 / 140 tkr", used: 0.62, milestone: "Tätskikt", due: "6 maj", updated: "1d" },
            { name: "Villa Djursholm", client: "Ekström · Ekbacksvägen 8", status: "Lead", progress: 0, budget: "Offert ej skickad", used: 0, milestone: "Platsbesök inbokat", due: "28 apr", updated: "3d", lead: true },
            { name: "Kungsholmen Köksbyte", client: "Nilsson · Fleminggatan 34", status: "Klar", progress: 100, budget: "210 / 210 tkr", used: 1, milestone: "Slutbesiktning", due: "klar", updated: "5d", done: true },
            { name: "Södermalm Altan", client: "Berg · Katarina Bangata 22", status: "Pågående", progress: 24, budget: "45 / 180 tkr", used: 0.25, milestone: "Leverans virke", due: "2 maj", updated: "1h" },
            { name: "Enskede Fasadputs", client: "Holm · Nynäsvägen 12", status: "Försenad", progress: 78, budget: "96 / 110 tkr", used: 0.87, milestone: "Besiktning utomhus", due: "21 apr (3d)", updated: "30m", late: true },
          ].map((p, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "30px 2fr 1fr 1fr 1.2fr 1fr 100px 28px", padding: "12px 14px", fontSize: 13, alignItems: "center", borderBottom: i < 5 ? "1px solid var(--hairline)" : "none" }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: p.late ? "var(--warn)" : p.done ? "var(--fg-subtle)" : p.lead ? "var(--info)" : "var(--primary)" }} />
              <div>
                <div style={{ fontWeight: 500 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 2 }}>{p.client}</div>
              </div>
              <span className={`rf-chip ${p.late ? "chip-warn" : p.done ? "chip-muted" : "chip-primary"}`} style={{ width: "fit-content" }}>{p.status}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, height: 3, background: "var(--surface-2)", borderRadius: 1.5, overflow: "hidden" }}>
                  <div style={{ width: `${p.progress}%`, height: "100%", background: p.late ? "var(--warn)" : p.done ? "var(--fg-subtle)" : "var(--primary)" }} />
                </div>
                <span className="mono tnum" style={{ fontSize: 11, color: "var(--fg-muted)", width: 32, textAlign: "right" }}>{p.progress}%</span>
              </div>
              <span className="mono tnum" style={{ fontSize: 12 }}>{p.budget}</span>
              <div>
                <div style={{ fontSize: 12 }}>{p.milestone}</div>
                <div className="mono" style={{ fontSize: 10, color: p.late ? "var(--warn)" : "var(--fg-subtle)", marginTop: 2 }}>{p.due}</div>
              </div>
              <span className="mono" style={{ fontSize: 11, color: "var(--fg-subtle)", textAlign: "right" }}>{p.updated}</span>
              <Ico d={icons.chevRight} size={13} />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

function DashboardPortfolio() {
  const projects = [
    { name: "Vasastan Totalrenovering", type: "Totalrenovering · 118 m²", status: "Pågående", progress: 62, tag: "primary" },
    { name: "Brf Linden — Badrum", type: "Badrum · 6 m²", status: "Pågående", progress: 38, tag: "primary" },
    { name: "Villa Djursholm", type: "Nyproduktion · 240 m²", status: "Lead", progress: 0, tag: "warn" },
    { name: "Kungsholmen Köksbyte", type: "Kök · 14 m²", status: "Klar", progress: 100, tag: "muted" },
    { name: "Södermalm Altan", type: "Uterum · 22 m²", status: "Pågående", progress: 24, tag: "primary" },
    { name: "Enskede Fasadputs", type: "Fasad · 180 m²", status: "Försenad", progress: 78, tag: "warn" },
  ];
  return (
    <div style={{ background: "var(--bg)", minHeight: "100%" }}>
      <AppHeader />
      <main style={{ padding: "32px 40px", maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-subtle)", marginBottom: 10 }}>Portfölj · 24 apr 2026</div>
            <h1 className="font-display" style={{ fontSize: 40, fontWeight: 400, letterSpacing: "-0.025em", margin: 0 }}>
              Sex aktiva projekt<span style={{ color: "var(--fg-subtle)" }}>.</span>
            </h1>
          </div>
          <button className="rf-btn rf-btn-primary"><Ico d={icons.plus} size={14} /> Nytt projekt</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {projects.map((p, i) => (
            <div key={i} className="rf-card" style={{ overflow: "hidden" }}>
              <div className="img-placeholder" style={{ aspectRatio: "4 / 3" }}>
                {["foto-rumsplan-kök", "foto-badrum", "render-fasad", "foto-kök-klar", "foto-altan", "foto-fasad"][i]}
              </div>
              <div style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 500, letterSpacing: "-0.005em" }}>{p.name}</div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>{p.type}</div>
                  </div>
                  <span className={`rf-chip chip-${p.tag}`}>{p.status}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
                  <div style={{ flex: 1, height: 3, background: "var(--surface-2)", borderRadius: 1.5, overflow: "hidden" }}>
                    <div style={{ width: `${p.progress}%`, height: "100%", background: p.tag === "warn" ? "var(--warn)" : p.progress === 100 ? "var(--fg-subtle)" : "var(--primary)" }} />
                  </div>
                  <span className="mono tnum" style={{ fontSize: 11, color: "var(--fg-muted)" }}>{p.progress}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
