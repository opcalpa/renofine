/* global React, AppHeader, SectionHeader, Ico, icons */

// ————————————————————————————————————————————————————————————————
// Tasks — Kanban (variant A) and dense list (variant B)
// ————————————————————————————————————————————————————————————————
window.Tasks = function Tasks({ variant = "A" }) {
  if (variant === "B") return <TasksList />;
  return <TasksKanban />;
};

const TASKS = {
  "Att göra": [
    { id: "T-082", title: "Leverans parkett ek 15 mm", room: "Vardagsrum", due: "24 apr", who: "EL", whoColor: "oklch(55% 0.12 75)", priority: "hög", tags: ["material"] },
    { id: "T-086", title: "Grundmålning sovrum", room: "Sovrum", due: "27 apr", who: "JO", whoColor: "oklch(58% 0.12 25)", priority: "medium", tags: ["måleri"] },
    { id: "T-091", title: "Fönsterkarm — slipning", room: "Vardagsrum", due: "29 apr", who: null, priority: "låg", tags: ["snickeri"] },
    { id: "T-095", title: "Ny taklist vardagsrum", room: "Vardagsrum", due: "2 maj", who: "AN", whoColor: "oklch(55% 0.12 75)", priority: "låg", tags: [] },
  ],
  "Pågår": [
    { id: "T-078", title: "Elinstallation kök — ny ringledning", room: "Kök", due: "i dag", who: "MK", whoColor: "oklch(52% 0.09 230)", priority: "hög", tags: ["el"], progress: 60, blocked: false },
    { id: "T-080", title: "VVS badrum — tätskikt", room: "Badrum", due: "25 apr", who: "PK", whoColor: "oklch(55% 0.1 155)", priority: "hög", tags: ["vvs"], progress: 40 },
    { id: "T-084", title: "Bänkskivor — kalksten Öland", room: "Kök", due: "22 apr", who: "IN", whoColor: "oklch(58% 0.08 300)", priority: "hög", tags: ["material"], progress: 15, blocked: true, blockReason: "Leverans försenad" },
  ],
  "Granska": [
    { id: "T-070", title: "Grundmålning vardagsrum", room: "Vardagsrum", due: "klar 24 apr", who: "JO", whoColor: "oklch(58% 0.12 25)", priority: "medium", tags: ["måleri"], review: "Elin" },
    { id: "T-075", title: "Rivning kök", room: "Kök", due: "klar 21 apr", who: "AN", whoColor: "oklch(55% 0.12 75)", priority: "medium", tags: ["bygg"], review: "Elin" },
  ],
  "Klar": [
    { id: "T-050", title: "Platsbesök & uppmätning", room: "Alla", due: "3 mar", who: "EL", whoColor: "oklch(55% 0.12 75)", priority: "medium", tags: [] },
    { id: "T-055", title: "Rivningslov ansökt", room: "Alla", due: "12 mar", who: "EL", whoColor: "oklch(55% 0.12 75)", priority: "medium", tags: ["admin"] },
    { id: "T-061", title: "Offert måleri godkänd", room: "Alla", due: "28 mar", who: "EL", whoColor: "oklch(55% 0.12 75)", priority: "medium", tags: ["admin"] },
  ],
};

function TaskCard({ t, compact = false }) {
  return (
    <div className="rf-card" style={{ padding: 12, cursor: "grab", background: "var(--surface)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span className="mono" style={{ fontSize: 10, color: "var(--fg-subtle)", letterSpacing: "0.04em" }}>{t.id}</span>
        <span style={{ flex: 1 }} />
        {t.priority === "hög" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--warn)" }} title="Hög prioritet" />}
        {t.blocked && <span className="rf-chip chip-warn" style={{ fontSize: 10, padding: "1px 6px" }}>Blockerad</span>}
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.35, marginBottom: 8, letterSpacing: "-0.003em" }}>{t.title}</div>
      {t.progress !== undefined && (
        <div style={{ height: 3, background: "var(--surface-2)", borderRadius: 1.5, overflow: "hidden", marginBottom: 8 }}>
          <div style={{ width: `${t.progress}%`, height: "100%", background: t.blocked ? "var(--warn)" : "var(--primary)" }} />
        </div>
      )}
      {t.blocked && <div style={{ fontSize: 11, color: "var(--warn)", marginBottom: 8 }}><Ico d={icons.alert} size={11} /> {t.blockReason}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--fg-muted)" }}>
        <span className="rf-chip chip-muted" style={{ fontSize: 10, padding: "1px 6px" }}>{t.room}</span>
        <span style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 10 }}>{t.due}</span>
        {t.who ? (
          <div style={{ width: 20, height: 20, borderRadius: "50%", background: t.whoColor, color: "white", display: "grid", placeItems: "center", fontSize: 9, fontWeight: 600 }}>{t.who}</div>
        ) : (
          <div style={{ width: 20, height: 20, borderRadius: "50%", border: "1px dashed var(--border-strong)" }} />
        )}
      </div>
    </div>
  );
}

function TasksKanban() {
  const cols = Object.entries(TASKS);
  return (
    <div style={{ background: "var(--bg)", minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <AppHeader projectMode activeTab="Arbeten" project={{ name: "Vasastan Totalrenovering" }} />
      {/* Sub-toolbar */}
      <div style={{ padding: "14px 24px", borderBottom: "1px solid var(--hairline)", display: "flex", alignItems: "center", gap: 12, background: "var(--surface)" }}>
        <div style={{ display: "flex", gap: 2, padding: 2, background: "var(--bg-sunken)", borderRadius: 6, border: "1px solid var(--hairline)" }}>
          {["Tavla", "Lista", "Gantt", "Kalender"].map((v, i) => (
            <button key={v} style={{
              padding: "4px 10px", fontSize: 12, borderRadius: 4, cursor: "pointer",
              background: i === 0 ? "var(--surface)" : "transparent",
              color: i === 0 ? "var(--fg)" : "var(--fg-muted)",
              border: i === 0 ? "1px solid var(--hairline)" : "1px solid transparent",
              fontWeight: i === 0 ? 500 : 400,
            }}>{v}</button>
          ))}
        </div>
        <div style={{ height: 20, width: 1, background: "var(--hairline)" }} />
        <button className="rf-btn rf-btn-ghost"><Ico d={icons.filter} size={12} /> Rum: alla</button>
        <button className="rf-btn rf-btn-ghost"><Ico d={icons.users} size={12} /> Tilldelad: alla</button>
        <button className="rf-btn rf-btn-ghost"><Ico d={icons.tag} size={12} /> Taggar</button>
        <div style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 11, color: "var(--fg-subtle)" }}>42 arbeten · 26 klara · 3 försenade</span>
        <button className="rf-btn rf-btn-primary"><Ico d={icons.plus} size={13} /> Nytt arbete</button>
      </div>

      {/* Board */}
      <div style={{ flex: 1, padding: "20px 24px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, overflow: "auto", alignItems: "start" }}>
        {cols.map(([name, tasks]) => (
          <div key={name} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px" }}>
              <span style={{
                width: 7, height: 7, borderRadius: "50%",
                background: name === "Att göra" ? "var(--fg-subtle)" : name === "Pågår" ? "var(--primary)" : name === "Granska" ? "var(--warn)" : "oklch(60% 0.1 155)",
              }} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>{name}</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{tasks.length}</span>
              <span style={{ flex: 1 }} />
              <button style={{ background: "none", border: "none", color: "var(--fg-subtle)", cursor: "pointer", padding: 2 }}>
                <Ico d={icons.more} size={14} />
              </button>
            </div>
            {tasks.map(t => <TaskCard key={t.id} t={t} />)}
            <button style={{ padding: "8px 10px", background: "transparent", border: "1px dashed var(--border)", borderRadius: 8, color: "var(--fg-muted)", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
              <Ico d={icons.plus} size={12} /> Lägg till
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TasksList() {
  const rows = [].concat(...Object.entries(TASKS).map(([status, ts]) => ts.map(t => ({ ...t, status }))));
  return (
    <div style={{ background: "var(--bg)", minHeight: "100%" }}>
      <AppHeader projectMode activeTab="Arbeten" project={{ name: "Vasastan Totalrenovering" }} />
      <main style={{ padding: "24px 40px", maxWidth: 1280, margin: "0 auto" }}>
        <SectionHeader kicker="Arbeten" title="42 arbeten i projektet" serif
          action={<button className="rf-btn rf-btn-primary"><Ico d={icons.plus} size={13} /> Nytt arbete</button>} />
        <div style={{ border: "1px solid var(--hairline)", borderRadius: 12, overflow: "hidden", background: "var(--surface)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 110px 110px 90px 100px 40px 40px", padding: "10px 16px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-subtle)", background: "var(--bg-sunken)", borderBottom: "1px solid var(--hairline)", fontWeight: 500 }} className="mono">
            <span>ID</span><span>Arbete</span><span>Status</span><span>Rum</span><span>Deadline</span><span>Framsteg</span><span></span><span></span>
          </div>
          {rows.map((t, i) => (
            <div key={t.id} style={{
              display: "grid", gridTemplateColumns: "60px 1fr 110px 110px 90px 100px 40px 40px",
              padding: "11px 16px", fontSize: 13, alignItems: "center",
              borderBottom: i < rows.length - 1 ? "1px solid var(--hairline)" : "none",
              opacity: t.status === "Klar" ? 0.6 : 1,
            }}>
              <span className="mono" style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{t.id}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {t.priority === "hög" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--warn)" }} />}
                <span style={{ textDecoration: t.status === "Klar" ? "line-through" : "none" }}>{t.title}</span>
                {t.blocked && <span className="rf-chip chip-warn" style={{ fontSize: 10 }}>Blockerad</span>}
              </div>
              <span className={`rf-chip ${t.status === "Pågår" ? "chip-primary" : t.status === "Granska" ? "chip-warn" : "chip-muted"}`}>{t.status}</span>
              <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>{t.room}</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--fg-muted)" }}>{t.due}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ flex: 1, height: 3, background: "var(--surface-2)", borderRadius: 1.5, overflow: "hidden" }}>
                  <div style={{ width: `${t.progress || (t.status === "Klar" ? 100 : 0)}%`, height: "100%", background: t.blocked ? "var(--warn)" : "var(--primary)" }} />
                </div>
              </div>
              {t.who ? (
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: t.whoColor, color: "white", display: "grid", placeItems: "center", fontSize: 9, fontWeight: 600 }}>{t.who}</div>
              ) : <span />}
              <Ico d={icons.chevRight} size={13} />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
