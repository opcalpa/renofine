/* global React, AppHeader, Ico, icons */

// ————————————————————————————————————————————————————————————————
// Client-facing progress view — read-only, warm, confidence-building
// ————————————————————————————————————————————————————————————————
window.ClientView = function ClientView() {
  return (
    <div style={{ background: "var(--bg)", minHeight: "100%" }}>
      {/* Minimal client chrome */}
      <header style={{ height: 56, borderBottom: "1px solid var(--hairline)", background: "var(--surface)", display: "flex", alignItems: "center", padding: "0 32px", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 22, height: 22, borderRadius: 5, background: "var(--accent-ink)", color: "var(--bg)", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700 }}>R</div>
          <span className="font-display" style={{ fontSize: 17, fontWeight: 500, letterSpacing: "-0.03em" }}>Renofine</span>
        </div>
        <span style={{ width: 1, height: 18, background: "var(--hairline)" }} />
        <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
          Delad med <strong style={{ color: "var(--fg)" }}>Familjen Karlsson</strong>
        </span>
        <div style={{ flex: 1 }} />
        <button className="rf-btn rf-btn-ghost"><Ico d={icons.chat} size={13} /> Meddela projektledare</button>
        <button className="rf-btn rf-btn-ghost"><Ico d={icons.download} size={13} /> PDF-rapport</button>
      </header>

      <main style={{ padding: "40px 48px", maxWidth: 980, margin: "0 auto" }}>
        {/* Hero */}
        <div style={{ marginBottom: 40 }}>
          <div className="mono" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-subtle)", marginBottom: 12 }}>
            Rapport · vecka 17 · 24 april 2026
          </div>
          <h1 className="font-display" style={{ fontSize: 56, fontWeight: 400, letterSpacing: "-0.028em", margin: 0, lineHeight: 1 }}>
            Odengatan 57<span style={{ color: "var(--fg-subtle)" }}>.</span>
          </h1>
          <p style={{ fontSize: 17, color: "var(--fg-muted)", marginTop: 16, lineHeight: 1.55, maxWidth: 620 }}>
            Vi är <strong style={{ color: "var(--fg)" }}>62%</strong> igenom er renovering och ligger <strong style={{ color: "var(--fg)" }}>tre dagar före plan</strong>.
            Köket har fått sina nya stommar och badrummets tätskikt pågår i veckan.
          </p>
        </div>

        {/* Progress ribbon */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <span className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-subtle)" }}>Tidslinje</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--fg-muted)" }}>Dag 52 / 150 · klart 31 juli</span>
          </div>
          <div style={{ position: "relative", height: 6, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: "62%", height: "100%", background: "var(--primary)", borderRadius: 3 }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
            {[
              { n: "Planering", done: true, d: "mar" },
              { n: "Rivning", done: true, d: "mar" },
              { n: "Stomme & VVS", done: true, d: "apr" },
              { n: "Ytskikt", done: false, d: "nu", current: true },
              { n: "Inredning", done: false, d: "jun" },
              { n: "Besiktning", done: false, d: "jul" },
            ].map((m, i) => (
              <div key={i} style={{ textAlign: "center", flex: 1 }}>
                <div style={{
                  width: 12, height: 12, borderRadius: "50%", margin: "0 auto",
                  background: m.current ? "var(--primary)" : m.done ? "var(--fg)" : "var(--surface-2)",
                  border: m.current ? "2px solid var(--bg)" : "none",
                  boxShadow: m.current ? "0 0 0 2px var(--primary)" : "none",
                }} />
                <div style={{ fontSize: 12, fontWeight: m.current ? 600 : 500, marginTop: 8, color: m.done || m.current ? "var(--fg)" : "var(--fg-subtle)" }}>{m.n}</div>
                <div className="mono" style={{ fontSize: 10, color: "var(--fg-subtle)", marginTop: 2, textTransform: "uppercase" }}>{m.d}</div>
              </div>
            ))}
          </div>
        </div>

        {/* This week + photos */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 48 }}>
          <div>
            <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-subtle)", marginBottom: 12 }}>Denna vecka</div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { t: "Grundmålning vardagsrum klar", who: "Jonas, måleri", done: true },
                { t: "Elinstallation kök — ny ringledning", who: "Markus, el", done: false },
                { t: "VVS badrum — tätskikt", who: "Patrik, VVS", done: false },
                { t: "Parkett ek anländer torsdag", who: "Leverans #082", done: false, highlight: true },
              ].map((x, i) => (
                <li key={i} style={{ display: "flex", gap: 12, padding: "12px 14px", background: x.highlight ? "var(--surface-2)" : "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 8 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                    background: x.done ? "var(--fg)" : "var(--surface-2)",
                    color: x.done ? "var(--bg)" : "var(--fg-muted)",
                    display: "grid", placeItems: "center", marginTop: 1,
                    border: x.done ? "none" : "1px solid var(--hairline)",
                  }}>
                    {x.done && <Ico d={icons.check} size={12} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.003em" }}>{x.t}</div>
                    <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>{x.who}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-subtle)", marginBottom: 12 }}>Bilder från platsen</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {["Kök före", "Kök · ny stomme", "Badrum · innan tätskikt", "Vardagsrum · färdigmålat"].map((l, i) => (
                <div key={i} className="rf-card img-placeholder" style={{ aspectRatio: "4/3", borderRadius: 8 }}>{l}</div>
              ))}
            </div>
          </div>
        </div>

        {/* Budget summary */}
        <div style={{ padding: "28px 0", borderTop: "1px solid var(--hairline)", borderBottom: "1px solid var(--hairline)", marginBottom: 40 }}>
          <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-subtle)", marginBottom: 16 }}>Er budget</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 24, marginBottom: 14 }}>
            <div>
              <div className="font-display tnum" style={{ fontSize: 44, fontWeight: 400, letterSpacing: "-0.025em", lineHeight: 1 }}>580<span style={{ color: "var(--fg-subtle)" }}> / 820</span></div>
              <div className="mono" style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 6 }}>tkr använda av total</div>
            </div>
            <div style={{ flex: 1, paddingLeft: 24, borderLeft: "1px solid var(--hairline)" }}>
              <p style={{ fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.6, margin: 0, maxWidth: 480 }}>
                Budgeten är i fas. Vi har ännu <strong style={{ color: "var(--fg)" }}>240 tkr kvar</strong> för resterande ytskikt, inredning och slutbesiktning.
                Inga oförutsedda tillägg denna vecka.
              </p>
            </div>
          </div>
          <div style={{ height: 4, background: "var(--surface-2)", borderRadius: 2, overflow: "hidden", marginTop: 12 }}>
            <div style={{ width: "71%", height: "100%", background: "var(--primary)" }} />
          </div>
        </div>

        {/* Message from PM */}
        <div style={{ display: "flex", gap: 16, padding: "20px 0" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "oklch(55% 0.12 75)", color: "white", display: "grid", placeItems: "center", fontSize: 15, fontWeight: 600, flexShrink: 0 }}>AK</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Anders Karlsson <span style={{ color: "var(--fg-subtle)", fontWeight: 400 }}>· Projektledare · onsdag 17:40</span></div>
            <p className="font-display" style={{ fontSize: 17, lineHeight: 1.5, margin: 0, fontWeight: 400, letterSpacing: "-0.005em" }}>
              "Vi ligger tre dagar före plan. Parketten landar på torsdag — därefter kan ni komma förbi och se vardagsrummet i sitt rätta ljus. Ni har varit underbara beställare."
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};
