/* global React, AppHeader, SectionHeader, Ico, icons */
const { useState: useState_ds } = React;

// ————————————————————————————————————————————————————————————————
// Dashboard — full-spec states for Path A (Paper theme, production-ready)
// Exports: DashEmpty, DashLoading, DashHover, DashMobile, DashOnboarding,
// DashModalNewProject, DashModalInvite, DashNotifications
// ————————————————————————————————————————————————————————————————

// ——— Empty state (new user, no projects yet)
window.DashEmpty = function DashEmpty() {
  return (
    <div style={{ background: "var(--bg)", minHeight: "100%" }}>
      <AppHeader />
      <main style={{ padding: "32px 40px", maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 40, paddingBottom: 24, borderBottom: "1px solid var(--hairline)" }}>
          <div>
            <div className="mono" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-subtle)", marginBottom: 12 }}>
              Min start · Torsdag 24 april 2026
            </div>
            <h1 className="font-display" style={{ fontSize: 48, fontWeight: 400, letterSpacing: "-0.025em", margin: 0, lineHeight: 1.08 }}>
              Välkommen, Elin.
            </h1>
            <p style={{ fontSize: 15, color: "var(--fg-muted)", marginTop: 10, maxWidth: 540, lineHeight: 1.5 }}>
              Börja med att skapa ditt första projekt. Du kan alltid bjuda in team och klient senare.
            </p>
          </div>
        </div>

        {/* Empty hero card */}
        <div className="rf-card" style={{ padding: "56px 18px", position: "relative", overflow: "hidden" }}>
          {/* Blueprint accent */}
          <div className="blueprint-grid" style={{ position: "absolute", inset: 0, opacity: 0.4, maskImage: "radial-gradient(ellipse at 30% 50%, black 0%, transparent 70%)", WebkitMaskImage: "radial-gradient(ellipse at 30% 50%, black 0%, transparent 70%)" }} />
          <div style={{ position: "relative", maxWidth: 520 }}>
            <div style={{ width: 56, height: 56, marginBottom: 20, borderRadius: 14, background: "var(--surface-2)", border: "1px solid var(--hairline)", display: "grid", placeItems: "center" }}>
              <Ico d={icons.plan} size={22} />
            </div>
            <h2 className="font-display" style={{ fontSize: 28, fontWeight: 400, letterSpacing: "-0.02em", margin: "0 0 10px" }}>
              Inga projekt ännu
            </h2>
            <p style={{ fontSize: 14, color: "var(--fg-muted)", margin: "0 0 24px", maxWidth: 420, lineHeight: 1.55 }}>
              Starta med en planlösning, importera från tidigare projekt, eller lägg till ett lead från en offertförfrågan.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="rf-btn rf-btn-primary"><Ico d={icons.plus} size={13} /> Nytt projekt</button>
              <button className="rf-btn rf-btn-ghost"><Ico d={icons.sparkle} size={13} /> AI från foto</button>
              <button className="rf-btn rf-btn-ghost"><Ico d={icons.download} size={13} /> Importera</button>
            </div>
          </div>
        </div>

        {/* Onboarding next-steps */}
        <div style={{ marginTop: 28, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
          { n: "01", t: "Skapa projekt", d: "Adress, yta, uppskattad budget.", done: false },
          { n: "02", t: "Bjud in team", d: "Projektledare, hantverkare, klient.", done: false },
          { n: "03", t: "Lägg till planlösning", d: "Ladda upp ritning eller foto.", done: false }].
          map((s, i) =>
          <div key={i} className="rf-card" style={{ padding: 18, opacity: 0.75 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span className="mono" style={{ fontSize: 10, color: "var(--fg-subtle)", letterSpacing: "0.08em" }}>{s.n}</span>
                <span style={{ width: 16, height: 16, borderRadius: "50%", border: "1px solid var(--hairline)" }} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{s.t}</div>
              <div style={{ fontSize: 12, color: "var(--fg-muted)", lineHeight: 1.5 }}>{s.d}</div>
            </div>
          )}
        </div>
      </main>
    </div>);

};

// ——— Loading state (skeleton)
function Skel({ w, h = 14, r = 4, style }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: "linear-gradient(90deg, var(--surface-2) 0%, var(--bg-sunken) 50%, var(--surface-2) 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s linear infinite", ...style }} />;
}
window.DashLoading = function DashLoading() {
  return (
    <div style={{ background: "var(--bg)", minHeight: "100%" }}>
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>
      <AppHeader />
      <main style={{ padding: "32px 40px", maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: "1px solid var(--hairline)" }}>
          <Skel w={180} h={10} style={{ marginBottom: 14 }} />
          <Skel w={420} h={44} r={6} style={{ marginBottom: 14 }} />
          <Skel w={520} h={14} />
        </div>
        <div className="rf-card" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 32, overflow: "hidden" }}>
          {[0, 1, 2, 3].map((i) =>
          <div key={i} style={{ padding: "18px 20px", borderRight: i < 3 ? "1px solid var(--hairline)" : "none" }}>
              <Skel w={80} h={8} style={{ marginBottom: 12 }} />
              <Skel w={60} h={28} r={6} style={{ marginBottom: 10 }} />
              <Skel w={120} h={10} />
            </div>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 32 }}>
          <div>
            <Skel w={200} h={22} r={4} style={{ marginBottom: 16 }} />
            <div className="rf-card" style={{ overflow: "hidden" }}>
              {[0, 1, 2, 3].map((i) =>
              <div key={i} style={{ padding: "16px 20px", borderBottom: i < 3 ? "1px solid var(--hairline)" : "none", display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1.2fr", gap: 16 }}>
                  <div><Skel w={200} h={14} style={{ marginBottom: 6 }} /><Skel w={130} h={10} /></div>
                  <div><Skel w={60} h={8} style={{ marginBottom: 6 }} /><Skel w={40} h={12} /></div>
                  <div><Skel w={60} h={8} style={{ marginBottom: 6 }} /><Skel w={90} h={12} /></div>
                  <Skel w="100%" h={4} r={2} style={{ alignSelf: "center" }} />
                </div>
              )}
            </div>
          </div>
          <div>
            <Skel w={180} h={22} r={4} style={{ marginBottom: 16 }} />
            {[0, 1, 2, 3].map((i) =>
            <div key={i} style={{ display: "flex", gap: 12, marginBottom: 18 }}>
                <Skel w={28} h={28} r={14} />
                <div style={{ flex: 1 }}><Skel w="90%" h={13} style={{ marginBottom: 6 }} /><Skel w="40%" h={10} /></div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>);

};

// ——— Hover/focus state — annotated to show the interaction vocabulary
window.DashHover = function DashHover() {
  return (
    <div style={{ background: "var(--bg)", minHeight: "100%", position: "relative" }}>
      <AppHeader />
      <main style={{ padding: "32px 40px", maxWidth: 1280, margin: "0 auto" }}>
        <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-subtle)", marginBottom: 12 }}>Stater</div>
        <h1 className="font-display" style={{ fontSize: 36, fontWeight: 400, letterSpacing: "-0.025em", margin: "0 0 24px", lineHeight: 1.08 }}>Hover, focus & aktiva tillstånd</h1>

        {/* Row 1: buttons */}
        <div className="rf-card" style={{ padding: 20, marginBottom: 16 }}>
          <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-subtle)", marginBottom: 12 }}>Knappar · primary</div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button className="rf-btn rf-btn-primary">default</button>
            <button className="rf-btn rf-btn-primary" style={{ background: "var(--primary-hover)" }}>hover</button>
            <button className="rf-btn rf-btn-primary" style={{ background: "var(--primary-hover)", boxShadow: "0 0 0 3px color-mix(in oklab, var(--primary) 25%, transparent)" }}>focus</button>
            <button className="rf-btn rf-btn-primary" style={{ opacity: 0.5, cursor: "not-allowed" }}>disabled</button>
            <button className="rf-btn rf-btn-primary" style={{ opacity: 0.7 }}><span style={{ width: 10, height: 10, border: "1.5px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> loading</button>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        </div>

        <div className="rf-card" style={{ padding: 20, marginBottom: 16 }}>
          <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-subtle)", marginBottom: 12 }}>Knappar · ghost</div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button className="rf-btn rf-btn-ghost">default</button>
            <button className="rf-btn rf-btn-ghost" style={{ background: "var(--surface-2)" }}>hover</button>
            <button className="rf-btn rf-btn-ghost" style={{ background: "var(--surface-2)", boxShadow: "0 0 0 3px color-mix(in oklab, var(--primary) 25%, transparent)", borderColor: "var(--primary)" }}>focus</button>
            <button className="rf-btn rf-btn-ghost" style={{ opacity: 0.5 }}>disabled</button>
          </div>
        </div>

        {/* Row 2: input */}
        <div className="rf-card" style={{ padding: 20, marginBottom: 16 }}>
          <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-subtle)", marginBottom: 12 }}>Textfält</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <div><label style={{ fontSize: 11, color: "var(--fg-muted)" }}>default</label><input className="rf-input" placeholder="Ange namn…" style={{ marginTop: 4 }} /></div>
            <div><label style={{ fontSize: 11, color: "var(--fg-muted)" }}>hover</label><input className="rf-input" placeholder="Ange namn…" style={{ marginTop: 4, borderColor: "var(--border-strong)" }} /></div>
            <div><label style={{ fontSize: 11, color: "var(--fg-muted)" }}>focus</label><input className="rf-input" defaultValue="Vasastan Totalrenovering" style={{ marginTop: 4, borderColor: "var(--primary)", boxShadow: "0 0 0 3px color-mix(in oklab, var(--primary) 20%, transparent)" }} autoFocus /></div>
            <div><label style={{ fontSize: 11, color: "var(--fg-muted)", color: "var(--danger)" }}>error</label><input className="rf-input" defaultValue="abc" style={{ marginTop: 4, borderColor: "var(--danger)" }} /><div style={{ fontSize: 11, color: "var(--danger)", marginTop: 4 }}>Måste vara minst 4 tecken</div></div>
          </div>
        </div>

        {/* Row 3: table row states */}
        <div className="rf-card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--hairline)", background: "var(--bg-sunken)", display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1.2fr 90px", gap: 16, alignItems: "center" }} className="mono">
            <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-subtle)" }}>Projekt</span>
            <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-subtle)" }}>Arbeten</span>
            <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-subtle)" }}>Budget</span>
            <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-subtle)" }}>Framsteg</span>
            <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-subtle)", textAlign: "right" }}>State</span>
          </div>
          {[
          { label: "default", bg: "var(--surface)", note: null },
          { label: "hover", bg: "var(--surface-2)", note: "subtle surface lift" },
          { label: "selected", bg: "color-mix(in oklab, var(--primary) 6%, var(--surface))", note: "primary tint", accent: true },
          { label: "focus", bg: "var(--surface)", note: "2px focus ring on navigation", focus: true }].
          map((r, i) =>
          <div key={i} style={{
            padding: "14px 20px", background: r.bg, borderBottom: i < 3 ? "1px solid var(--hairline)" : "none",
            display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1.2fr auto", gap: 16, alignItems: "center",
            position: "relative"
          }}>
              {r.accent && <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: "var(--primary)" }} />}
              {r.focus && <span style={{ position: "absolute", inset: 4, borderRadius: 6, boxShadow: "0 0 0 2px var(--primary)", pointerEvents: "none" }} />}
              <div style={{ width: "100px" }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>Vasastan Totalrenovering</div>
                <div style={{ fontSize: 12, color: "var(--fg-subtle)", marginTop: 2 }}>Odengatan 57 · 3 rok</div>
              </div>
              <div className="mono tnum" style={{ fontSize: 12 }}>18 / 42</div>
              <div className="mono tnum" style={{ fontSize: 12 }}>580 / 820 tkr</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, height: 4, background: "var(--bg-sunken)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: "62%", height: "100%", background: "var(--primary)" }} />
                </div>
                <span className="rf-chip chip-primary">Pågående</span>
              </div>
              <span className="mono" style={{ fontSize: 10, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "right" }}>{r.label}</span>
            </div>
          )}
        </div>
      </main>
    </div>);

};

// ——— Notifications panel (opens from bell)
window.DashNotifications = function DashNotifications() {
  return (
    <div style={{ background: "var(--bg)", minHeight: "100%", position: "relative" }}>
      <AppHeader />
      <main style={{ padding: "32px 40px", maxWidth: 1280, margin: "0 auto", filter: "blur(0.5px)", opacity: 0.6 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 32, paddingBottom: 24, borderBottom: "1px solid var(--hairline)" }}>
          <div>
            <div className="mono" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-subtle)", marginBottom: 12 }}>Min start</div>
            <h1 className="font-display" style={{ fontSize: 48, fontWeight: 400, letterSpacing: "-0.025em", margin: 0, lineHeight: 1.08 }}>God morgon, Elin.</h1>
          </div>
        </div>
      </main>

      {/* Panel */}
      <aside style={{ position: "absolute", top: 60, right: 24, width: 400, background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 12, boxShadow: "var(--shadow-lg)", overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--hairline)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>Inkorg</span>
            <span className="rf-chip chip-primary">7 nya</span>
          </div>
          <div style={{ display: "flex", gap: 2, fontSize: 11 }}>
            <button style={{ padding: "3px 8px", background: "var(--surface-2)", border: "1px solid var(--hairline)", borderRadius: 4, fontSize: 11, cursor: "pointer" }}>Alla</button>
            <button style={{ padding: "3px 8px", background: "transparent", border: "1px solid transparent", borderRadius: 4, fontSize: 11, cursor: "pointer", color: "var(--fg-muted)" }}>Nämnda</button>
            <button style={{ padding: "3px 8px", background: "transparent", border: "1px solid transparent", borderRadius: 4, fontSize: 11, cursor: "pointer", color: "var(--fg-muted)" }}>Varningar</button>
          </div>
        </div>
        <div style={{ maxHeight: 480, overflow: "auto" }}>
          {[
          { t: "Bänkskivor försenade 3 dagar", p: "Vasastan · Kök", time: "nu", dot: "alert", warn: true, unread: true },
          { t: "Jonas markerade Grundmålning klar", p: "Vasastan · Vardagsrum", time: "9 min", dot: "check", unread: true },
          { t: "Ny inköpsbegäran från Markus", p: "Vasastan · El", time: "42 min", dot: "tag", unread: true },
          { t: "Klient kommenterade rapport", p: "Brf Linden", time: "2 h", dot: "chat", unread: true },
          { t: "Offert accepterad — Djursholm", p: "Villa Djursholm", time: "i går", dot: "check" },
          { t: "Leverans anländer torsdag", p: "Vasastan · Parkett", time: "i går", dot: "box" }].
          map((n, i) =>
          <div key={i} style={{
            padding: "12px 18px", borderBottom: "1px solid var(--hairline)", display: "flex", gap: 10,
            background: n.unread ? "color-mix(in oklab, var(--primary) 3%, transparent)" : "transparent",
            cursor: "pointer", position: "relative"
          }}>
              {n.unread && <span style={{ position: "absolute", left: 6, top: 18, width: 5, height: 5, borderRadius: "50%", background: "var(--primary)" }} />}
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: n.warn ? "var(--warn)" : "var(--surface-2)", color: n.warn ? "white" : "var(--fg-muted)", display: "grid", placeItems: "center", flexShrink: 0, border: !n.warn ? "1px solid var(--hairline)" : "none" }}>
                <Ico d={icons[n.dot]} size={13} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: n.unread ? 500 : 400, lineHeight: 1.3, marginBottom: 2 }}>{n.t}</div>
                <div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{n.p}</div>
              </div>
              <span className="mono" style={{ fontSize: 10, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>{n.time}</span>
            </div>
          )}
        </div>
        <div style={{ padding: "10px 18px", borderTop: "1px solid var(--hairline)", background: "var(--bg-sunken)", display: "flex", justifyContent: "space-between", fontSize: 11 }}>
          <button style={{ background: "none", border: "none", color: "var(--fg-muted)", cursor: "pointer", fontSize: 11 }}>Markera alla lästa</button>
          <button style={{ background: "none", border: "none", color: "var(--primary)", cursor: "pointer", fontSize: 11, fontWeight: 500 }}>Inställningar →</button>
        </div>
      </aside>
    </div>);

};

// ——— Modal shell
function Modal({ title, kicker, children, footer, width = 560 }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ position: "absolute", inset: 0, background: "oklch(22% 0.01 260 / 0.4)", backdropFilter: "blur(2px)" }} />
      <div style={{ position: "relative", width, maxWidth: "100%", background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 14, boxShadow: "var(--shadow-lg)", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--hairline)" }}>
          {kicker && <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-subtle)", marginBottom: 6 }}>{kicker}</div>}
          <h2 className="font-display" style={{ fontSize: 22, fontWeight: 400, letterSpacing: "-0.02em", margin: 0 }}>{title}</h2>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
        {footer && <div style={{ padding: "14px 24px", borderTop: "1px solid var(--hairline)", background: "var(--bg-sunken)", display: "flex", justifyContent: "flex-end", gap: 8 }}>{footer}</div>}
      </div>
    </div>);

}

window.DashModalNewProject = function DashModalNewProject() {
  return (
    <div style={{ background: "var(--bg)", minHeight: "100%", position: "relative" }}>
      <AppHeader />
      <main style={{ padding: "32px 40px", maxWidth: 1280, margin: "0 auto", filter: "blur(1px)", opacity: 0.5 }}>
        <div style={{ height: 240 }} />
      </main>
      <Modal
        kicker="Nytt projekt · steg 1 av 3"
        title="Starta ett nytt renoveringsprojekt"
        width={580}
        footer={<>
          <button className="rf-btn rf-btn-ghost">Avbryt</button>
          <button className="rf-btn rf-btn-primary">Fortsätt <Ico d={icons.arrowRight} size={13} /></button>
        </>}>
        
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500 }}>Projektnamn</label>
            <input className="rf-input" placeholder="T.ex. Vasastan Totalrenovering" style={{ marginTop: 6 }} autoFocus />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500 }}>Adress</label>
            <input className="rf-input" placeholder="Gatan 12, 113 22 Stockholm" style={{ marginTop: 6 }} />
            <div style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 4 }}>Används för leveranser och besiktningar.</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500 }}>Typ</label>
              <select className="rf-input" style={{ marginTop: 6 }}>
                <option>Totalrenovering</option><option>Kök</option><option>Badrum</option><option>Fasad</option><option>Annat</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500 }}>Yta</label>
              <div style={{ display: "flex", marginTop: 6, border: "1px solid var(--hairline)", borderRadius: 6, alignItems: "center" }}>
                <input defaultValue="118" className="mono tnum" style={{ border: "none", background: "transparent", padding: "7px 10px", fontSize: 13, width: "100%", outline: "none" }} />
                <span className="mono" style={{ fontSize: 11, color: "var(--fg-subtle)", paddingRight: 10 }}>m²</span>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500 }}>Budget</label>
              <div style={{ display: "flex", marginTop: 6, border: "1px solid var(--hairline)", borderRadius: 6, alignItems: "center" }}>
                <input placeholder="820" className="mono tnum" style={{ border: "none", background: "transparent", padding: "7px 10px", fontSize: 13, width: "100%", outline: "none" }} />
                <span className="mono" style={{ fontSize: 11, color: "var(--fg-subtle)", paddingRight: 10 }}>tkr</span>
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500 }}>Start</label>
              <input className="rf-input" type="date" defaultValue="2026-05-01" style={{ marginTop: 6 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500 }}>Mål</label>
              <input className="rf-input" type="date" defaultValue="2026-09-30" style={{ marginTop: 6 }} />
            </div>
          </div>
        </div>
      </Modal>
    </div>);

};

window.DashModalInvite = function DashModalInvite() {
  return (
    <div style={{ background: "var(--bg)", minHeight: "100%", position: "relative" }}>
      <AppHeader />
      <main style={{ padding: "32px 40px", maxWidth: 1280, margin: "0 auto", filter: "blur(1px)", opacity: 0.5 }}>
        <div style={{ height: 240 }} />
      </main>
      <Modal
        kicker="Bjud in"
        title="Lägg till team och klient"
        width={560}
        footer={<>
          <button className="rf-btn rf-btn-ghost">Senare</button>
          <button className="rf-btn rf-btn-primary"><Ico d={icons.check} size={13} /> Skicka 3 inbjudningar</button>
        </>}>
        
        <div style={{ fontSize: 13, color: "var(--fg-muted)", marginBottom: 14, lineHeight: 1.5 }}>
          Team-medlemmar ser projektet fullt. Klienter får en begränsad läsvy med framsteg och rapporter.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
          { email: "markus@lind-el.se", role: "Elektriker", status: "team" },
          { email: "patrik@vvs-soder.se", role: "VVS", status: "team" },
          { email: "karlsson@familjen.se", role: "Klient", status: "client" }].
          map((p, i) =>
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: 8, border: "1px solid var(--hairline)", borderRadius: 8, background: "var(--bg-sunken)" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: p.status === "client" ? "oklch(58% 0.12 25)" : "oklch(52% 0.09 155)", color: "white", fontSize: 10, fontWeight: 600, display: "grid", placeItems: "center" }}>{p.email.slice(0, 2).toUpperCase()}</div>
              <input className="rf-input" defaultValue={p.email} style={{ flex: 2, background: "var(--surface)" }} />
              <select className="rf-input" defaultValue={p.role} style={{ flex: 1, background: "var(--surface)" }}>
                <option>Projektledare</option><option>Elektriker</option><option>VVS</option><option>Snickare</option><option>Målare</option><option>Klient</option>
              </select>
              <button style={{ background: "none", border: "none", color: "var(--fg-subtle)", cursor: "pointer", padding: 6 }}><Ico d={icons.more} size={14} /></button>
            </div>
          )}
          <button className="rf-btn rf-btn-ghost" style={{ justifyContent: "center", marginTop: 4 }}>
            <Ico d={icons.plus} size={13} /> Lägg till fler
          </button>
        </div>
      </Modal>
    </div>);

};

// ——— Mobile breakpoint (375px)
window.DashMobile = function DashMobile() {
  return (
    <div style={{ background: "var(--bg)", minHeight: "100%", width: "100%" }}>
      {/* Mobile header */}
      <header style={{ height: 52, borderBottom: "1px solid var(--hairline)", background: "var(--surface)", display: "flex", alignItems: "center", padding: "0 16px", gap: 12 }}>
        <div style={{ width: 22, height: 22, borderRadius: 5, background: "var(--accent-ink)", color: "var(--bg)", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700 }}>R</div>
        <span className="font-display" style={{ fontSize: 17, fontWeight: 500, letterSpacing: "-0.03em", flex: 1 }}>Renofine</span>
        <button style={{ background: "none", border: "none", cursor: "pointer", padding: 6, color: "var(--fg)" }}>
          <Ico d={icons.bell} size={17} />
        </button>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "oklch(55% 0.12 75)", color: "white", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 600 }}>EL</div>
      </header>

      <main style={{ padding: 20 }}>
        <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-subtle)", marginBottom: 8 }}>Tors 24 apr</div>
        <h1 className="font-display" style={{ fontSize: 30, fontWeight: 400, letterSpacing: "-0.025em", margin: 0, lineHeight: 1.08 }}>God morgon,<br />Elin.</h1>
        <p style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 8, lineHeight: 1.5 }}>
          3 arbeten behöver uppmärksamhet idag.
        </p>

        {/* Stat cards horizontal scroll */}
        <div style={{ display: "flex", gap: 10, overflowX: "auto", margin: "20px -20px 24px", padding: "0 20px" }}>
          {[
          { l: "Projekt", v: "6", d: "2 på plan" },
          { l: "Arbeten", v: "23", d: "v. 17" },
          { l: "Budget", v: "842", u: "tkr", d: "kvar" },
          { l: "Inköp", v: "4", d: "att godkänna" }].
          map((s, i) =>
          <div key={i} className="rf-card" style={{ padding: "12px 14px", minWidth: 130, flexShrink: 0 }}>
              <div className="mono" style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-subtle)", marginBottom: 6 }}>{s.l}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                <span className="font-display tnum" style={{ fontSize: 24, letterSpacing: "-0.02em" }}>{s.v}</span>
                {s.u && <span className="mono" style={{ fontSize: 10, color: "var(--fg-subtle)" }}>{s.u}</span>}
              </div>
              <div style={{ fontSize: 10, color: "var(--fg-muted)", marginTop: 3 }}>{s.d}</div>
            </div>
          )}
        </div>

        {/* Project list */}
        <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-subtle)", marginBottom: 10 }}>Dina projekt</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1, background: "var(--hairline)", border: "1px solid var(--hairline)", borderRadius: 10, overflow: "hidden" }}>
          {[
          { name: "Vasastan Totalrenovering", sub: "Odengatan 57 · 62%", status: "Pågående", color: "primary", pct: 62 },
          { name: "Brf Linden — Badrum", sub: "Linnégatan 12 · 38%", status: "Pågående", color: "primary", pct: 38 },
          { name: "Villa Djursholm", sub: "Offert skickad", status: "Lead", color: "warn", pct: 0 }].
          map((p, i) =>
          <div key={i} style={{ background: "var(--surface)", padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, letterSpacing: "-0.003em" }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 2 }}>{p.sub}</div>
                </div>
                <span className={`rf-chip chip-${p.color}`}>{p.status}</span>
              </div>
              <div style={{ height: 3, background: "var(--surface-2)", borderRadius: 1.5, overflow: "hidden" }}>
                <div style={{ width: `${p.pct}%`, height: "100%", background: p.color === "warn" ? "var(--warn)" : "var(--primary)" }} />
              </div>
            </div>
          )}
        </div>

        {/* Today activity */}
        <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-subtle)", margin: "24px 0 10px" }}>Idag</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[
          { who: "Jonas (Måleri)", what: "rapporterade klart", dot: "check", when: "09:12" },
          { who: "System", what: "flaggade försening", dot: "alert", when: "i går" }].
          map((a, i) =>
          <div key={i} style={{ display: "flex", gap: 10, fontSize: 13, alignItems: "flex-start" }}>
              <Ico d={icons[a.dot]} size={14} />
              <div style={{ flex: 1, lineHeight: 1.4 }}><strong>{a.who}</strong> <span style={{ color: "var(--fg-muted)" }}>{a.what}</span>
                <div className="mono" style={{ fontSize: 10, color: "var(--fg-subtle)", marginTop: 3, textTransform: "uppercase" }}>{a.when}</div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Bottom tab bar */}
      <nav style={{ position: "sticky", bottom: 0, height: 56, borderTop: "1px solid var(--hairline)", background: "var(--surface)", display: "grid", gridTemplateColumns: "repeat(5, 1fr)", alignItems: "center" }}>
        {[
        { i: "home", l: "Start", active: true },
        { i: "folder", l: "Projekt" },
        { i: "task", l: "Arbeten" },
        { i: "box", l: "Inköp" },
        { i: "settings", l: "Mer" }].
        map((t, i) =>
        <button key={i} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: t.active ? "var(--fg)" : "var(--fg-subtle)" }}>
            <Ico d={icons[t.i]} size={17} />
            <span style={{ fontSize: 10, fontWeight: t.active ? 500 : 400 }}>{t.l}</span>
          </button>
        )}
      </nav>
    </div>);

};