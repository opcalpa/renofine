/* global React, AppHeader, SectionHeader, Ico, icons */
const { useState: useS_t } = React;

// ════════════════════════════════════════════════════════════════════
// Team v2 — design components
// 4 personas × 3 ekonomi-modes + projekt-level toggles
// ════════════════════════════════════════════════════════════════════

// ─── Brand tokens (used inline) ────────────────────────────────────
const T = {
  green: "#2F5D4E",
  greenSoft: "rgba(47,93,78,.10)",
  greenMid: "rgba(47,93,78,.30)",
  gold: "#A8845C",
  goldSoft: "rgba(168,132,92,.18)",
  rust: "#B5341E",
  rustSoft: "#FCE7E3",
  paper: "#FFFFFC",
  paper2: "#F4F1EA",
  paper3: "#EFEAE0",
  ink: "#1A140A",
  mut: "#6B6357",
  subtle: "#9C948A",
  line: "rgba(20,15,5,.10)",
};

// ─── Persona definitions ───────────────────────────────────────────
const PERSONAS = {
  worker: {
    key: "worker",
    name: "Hantverkare med jobb",
    short: "Worker",
    icon: icons.handle || icons.task,
    color: T.gold,
    surface: "WorkerView",
    surfaceNote: "Token-länk · ingen inlogg",
    mode: "Ingen ekonomi",
    description: "Får ett dagsjobb via SMS-länk. Behöver inget konto. Ser bara sina tilldelade tasks.",
    examples: ["UE-elektriker för ett kök", "Målare för ett rum", "Plattsättare för 2 dagar"],
  },
  client: {
    key: "client",
    name: "Klient / hemägare",
    short: "Klient",
    icon: icons.users,
    color: T.green,
    surface: "CustomerView",
    surfaceNote: "Curated klientvy · inloggat",
    mode: "Egen sida av bordet",
    description: "Slutkund som PM bjuder in. Ser progress, foton, milstolpar, ROT, fakturor som ska betalas. Aldrig påslag eller andra UE:s priser.",
    examples: ["Hemägaren när en proffs-PM driver projektet", "Sambo till hemägaren"],
  },
  member: {
    key: "member",
    name: "UE-medlem · specialist",
    short: "UE",
    icon: icons.tag,
    color: "oklch(50% 0.1 230)",
    surface: "Full app",
    surfaceNote: "Login · scope:assigned (default)",
    mode: "Default: Egna belopp · kan sättas till None",
    description: "Återkommande UE eller specialist (designer/arkitekt) som behöver konto för att tracka sina tasks, foton, egna inköp.",
    examples: ["Elektriker som driver flera projekt i appen", "Arkitekt under planeringsfasen", "Måleri-firma med 3 anställda"],
  },
  pm: {
    key: "pm",
    name: "PM / Co-owner",
    short: "PM",
    icon: icons.layers,
    color: T.rust,
    surface: "Full app · admin",
    surfaceNote: "Login · scope:all",
    mode: "Default: Full ekonomi · kan sättas till Egna eller None",
    description: "Projektledare eller partner med full operativ kontroll. Två sub-typer (etiketter): 'Co-owner' (jämbördig partner) eller 'Anlitad PM' (fakturerande motpart).",
    examples: ["Min partner i firman", "Den entreprenör jag anlitat", "Min sambo som äger projektet med mig"],
  },
};

const MODES = {
  none: { label: "Inga belopp", color: T.mut, soft: T.paper2, desc: "Inga ekonomi-fält visas någonstans" },
  own: { label: "Egna belopp", color: T.green, soft: T.greenSoft, desc: "Ser bara sina egna materials och timrapporter — inga task-budgetar, ingen totalbudget" },
  full: { label: "Full ekonomi", color: T.rust, soft: T.rustSoft, desc: "Allt — totalbudget, task-budgetar, andra UE:s timpriser, marginal" },
};

// ────────────────────────────────────────────────────────────────────
// 1 · STRATEGY ARTBOARD
// ────────────────────────────────────────────────────────────────────
window.TeamV2Strategy = function TeamV2Strategy() {
  return (
    <div style={{ background: "var(--bg)", height: "100%", padding: "44px 56px", overflow: "auto" }}>
      <div className="mono" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: T.rust, marginBottom: 14 }}>
        Team v2 · designramverk
      </div>
      <h1 className="font-display" style={{ fontSize: 52, fontWeight: 300, letterSpacing: "-.025em", margin: 0, lineHeight: 1.02, maxWidth: 920 }}>
        Fyra personor, tre ekonomi-modes. Två projekt-toggles fångar resten.
      </h1>
      <p style={{ fontSize: 16, color: T.mut, marginTop: 16, maxWidth: 760, lineHeight: 1.55 }}>
        Flytta wizardens första fråga från "<em>worker eller member?</em>" (datakontrakt) till "<em>vem är personen?</em>" (mänsklig). Datakontrakt och permission-matris härledds från valet — istället för att tvinga inviteraren att hantera matrisen själv.
      </p>

      {/* Three columns: personas / modes / projekt-toggles */}
      <div style={{ marginTop: 40, display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 24 }}>

        {/* Personas */}
        <div>
          <div className="mono" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: T.mut, marginBottom: 12 }}>
            4 personor
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {Object.values(PERSONAS).map(p => (
              <div key={p.key} style={{ padding: 16, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 12, borderLeft: `4px solid ${p.color}` }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
                  <div className="font-display" style={{ fontSize: 18, fontWeight: 400, letterSpacing: "-.01em" }}>{p.name}</div>
                  <span className="mono" style={{ fontSize: 10, color: p.color, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600 }}>{p.short}</span>
                </div>
                <div style={{ fontSize: 12, color: T.mut, lineHeight: 1.5, marginBottom: 6 }}>{p.description}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  <span className="mono" style={{ fontSize: 9.5, padding: "2px 7px", background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 999, color: p.color, textTransform: "uppercase", letterSpacing: ".06em" }}>{p.surface}</span>
                  <span className="mono" style={{ fontSize: 9.5, padding: "2px 7px", background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 999, color: T.mut }}>{p.mode}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Modes */}
        <div>
          <div className="mono" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: T.mut, marginBottom: 12 }}>
            3 ekonomi-modes (för inloggade)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {Object.entries(MODES).map(([k, m]) => (
              <div key={k} style={{ padding: 16, background: m.soft, border: `1px solid ${T.line}`, borderRadius: 12 }}>
                <div className="font-display" style={{ fontSize: 19, fontWeight: 400, letterSpacing: "-.01em", color: m.color, marginBottom: 6 }}>{m.label}</div>
                <div style={{ fontSize: 12.5, color: T.ink, lineHeight: 1.5 }}>{m.desc}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, padding: 14, background: T.paper2, border: `1px dashed ${T.line}`, borderRadius: 10 }}>
            <div className="mono" style={{ fontSize: 10, color: T.mut, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>Notera</div>
            <div style={{ fontSize: 12, color: T.ink, lineHeight: 1.5 }}>Worker har sin egen surface (WorkerView) som <em>aldrig</em> visar pengar. Klient har sin egen surface (CustomerView) som visar sin egen sida av bordet. Mode-axeln gäller bara UE-medlem och PM.</div>
          </div>
        </div>

        {/* Projekt-toggles */}
        <div>
          <div className="mono" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: T.mut, marginBottom: 12 }}>
            2 projekt-toggles
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ padding: 16, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 12 }}>
              <div className="font-display" style={{ fontSize: 17, fontWeight: 400, letterSpacing: "-.01em", marginBottom: 6 }}>
                <code style={{ background: T.paper2, padding: "1px 6px", borderRadius: 4, fontSize: 13, fontFamily: "JetBrains Mono, monospace" }}>tracks_economy</code>
              </div>
              <div style={{ fontSize: 12.5, color: T.mut, lineHeight: 1.5 }}>
                <strong style={{ color: T.ink }}>På:</strong> Budget-tab synlig, Mode Full meningsfull. Fakturor och offerter trackas i appen.<br/>
                <strong style={{ color: T.ink }}>Av:</strong> Budget-tab göms helt. Bara operativ tracking. För projekt där ekonomi sker utanför appen.
              </div>
            </div>
            <div style={{ padding: 16, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 12 }}>
              <div className="font-display" style={{ fontSize: 17, fontWeight: 400, letterSpacing: "-.01em", marginBottom: 6 }}>
                <code style={{ background: T.paper2, padding: "1px 6px", borderRadius: 4, fontSize: 13, fontFamily: "JetBrains Mono, monospace" }}>tracks_rot</code>
              </div>
              <div style={{ fontSize: 12.5, color: T.mut, lineHeight: 1.5 }}>
                <strong style={{ color: T.ink }}>På:</strong> ROT-fält finns i offert/faktura. Personnummer samlas in. Skatteverket-export tillgänglig.<br/>
                <strong style={{ color: T.ink }}>Av:</strong> Ingen ROT i UI. Appen är agnostic.<br/>
                <em>Default: av — användaren får aktivt välja in.</em>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 14, padding: 14, background: "#FFF7E8", borderLeft: `3px solid ${T.gold}`, borderRadius: 8 }}>
            <div className="mono" style={{ fontSize: 10, color: T.gold, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>Princip</div>
            <div style={{ fontSize: 12, color: "#5a3e0c", lineHeight: 1.5 }}>Appen är agnostic mot hur parterna gör affärer. Tracking är opt-in på projekt-nivå, inte påtvingat.</div>
          </div>
        </div>
      </div>

      {/* Bottom: anti-patterns */}
      <div style={{ marginTop: 36, padding: 22, background: T.paper2, borderRadius: 14, border: `1px solid ${T.line}` }}>
        <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", color: T.mut, marginBottom: 10 }}>Vad vi <em>inte</em> bygger</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, fontSize: 12.5, color: T.ink, lineHeight: 1.5 }}>
          <div><strong style={{ color: T.rust }}>Ingen påtvingad transparens.</strong> Hemägare och PM kan välja att tracka noll ekonomi i appen.</div>
          <div><strong style={{ color: T.rust }}>Ingen konflikt-flagga för svart arbete.</strong> Appen avgör inte vad parterna gör.</div>
          <div><strong style={{ color: T.rust }}>Ingen automatisk migration.</strong> Modes kan ändras, men befintliga data konverteras inte retroaktivt.</div>
          <div><strong style={{ color: T.rust }}>Ingen tvångsuppgradering worker→medlem.</strong> Senare runda. Just nu: dup-check tillåter cross-flow.</div>
        </div>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────
// 2 · WIZARD STEP 1 — Persona selection
// ────────────────────────────────────────────────────────────────────
window.TeamV2WizardStep1 = function TeamV2WizardStep1() {
  return (
    <ModalShell title="Bjud in person" step="1 / 3">
      <div style={{ marginBottom: 18 }}>
        <h3 className="font-display" style={{ fontSize: 24, fontWeight: 400, letterSpacing: "-.015em", margin: 0, lineHeight: 1.15 }}>
          Vem bjuder du in till projektet?
        </h3>
        <p style={{ fontSize: 13.5, color: T.mut, margin: "6px 0 0", lineHeight: 1.55 }}>
          Personens roll avgör vad de ser. Du kan finjustera ekonomi-åtkomst i nästa steg.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {Object.values(PERSONAS).map((p, i) => (
          <button key={p.key} style={{
            textAlign: "left", padding: 16, background: i === 2 ? T.greenSoft : T.paper,
            border: i === 2 ? `2px solid ${T.green}` : `1px solid ${T.line}`,
            borderRadius: 12, cursor: "pointer", display: "flex", gap: 12, alignItems: "flex-start",
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, background: i === 2 ? "#fff" : T.paper2,
              border: `1px solid ${T.line}`, display: "grid", placeItems: "center", color: p.color, flexShrink: 0,
            }}>
              <Ico d={p.icon} size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
                <div className="font-display" style={{ fontSize: 16, fontWeight: 500, letterSpacing: "-.01em", lineHeight: 1.2 }}>{p.name}</div>
                {i === 2 && <span className="mono" style={{ fontSize: 9, padding: "2px 6px", background: T.green, color: "#fff", borderRadius: 4, textTransform: "uppercase", letterSpacing: ".06em" }}>Vald</span>}
              </div>
              <div style={{ fontSize: 11.5, color: T.mut, marginTop: 4, lineHeight: 1.45 }}>{p.description}</div>
              <div className="mono" style={{ fontSize: 10, color: p.color, marginTop: 6, textTransform: "uppercase", letterSpacing: ".06em" }}>
                {p.surface}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* PM sub-type selector (visible only when PM selected — shown here as preview) */}
      <div style={{ marginTop: 16, padding: 14, background: T.paper2, border: `1px dashed ${T.line}`, borderRadius: 10, display: "flex", alignItems: "center", gap: 12 }}>
        <Ico d={icons.sparkle} size={14} />
        <div style={{ fontSize: 12, color: T.mut, lineHeight: 1.5 }}>
          <strong style={{ color: T.ink }}>För PM/Co-owner</strong> kan du också välja relation: <em>min partner</em> · <em>min anlitade projektledare</em>. Bara etikett — påverkar inte rättigheter, bara hur personen syns i UI.
        </div>
      </div>

      <ModalFooter primary="Nästa" disabled={false} />
    </ModalShell>
  );
};

// ────────────────────────────────────────────────────────────────────
// 3 · WIZARD STEP 2 — UE-medlem variant (with mode toggle)
// ────────────────────────────────────────────────────────────────────
window.TeamV2WizardStep2_UE = function TeamV2WizardStep2_UE() {
  const [mode, setMode] = useS_t("own");
  return (
    <ModalShell title="UE-medlem · Markus Lind" step="2 / 3" subtitle="Konfigurera åtkomst">
      {/* Yrkesetikett */}
      <Field label="Yrke (etikett, påverkar ej åtkomst)">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["Elektriker", "VVS", "Snickeri", "Måleri", "Plattsättning", "Designer", "Arkitekt", "Annat"].map((y, i) => (
            <button key={y} style={{
              padding: "6px 12px", fontSize: 12, borderRadius: 999,
              background: i === 0 ? T.green : T.paper, color: i === 0 ? "#fff" : T.ink,
              border: i === 0 ? "1px solid transparent" : `1px solid ${T.line}`,
              cursor: "pointer", fontWeight: 500,
            }}>{y}</button>
          ))}
        </div>
      </Field>

      {/* Vilka tasks/rum */}
      <Field label="Vilka delar av projektet?" hint="Default: bara där personen är tilldelad">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            { l: "Mina tasks", d: "Bara där tilldelad", sel: true },
            { l: "Alla tasks", d: "Hela projektet" },
            { l: "Specifika rum", d: "Välj rum…" },
            { l: "Hela rum-tag", d: "Bara tasks med tag" },
          ].map((o, i) => (
            <button key={i} style={{
              textAlign: "left", padding: "10px 12px",
              background: o.sel ? T.greenSoft : T.paper,
              border: o.sel ? `1.5px solid ${T.green}` : `1px solid ${T.line}`,
              borderRadius: 8, cursor: "pointer",
            }}>
              <div style={{ fontSize: 12.5, fontWeight: 500 }}>{o.l}</div>
              <div style={{ fontSize: 11, color: T.mut, marginTop: 2 }}>{o.d}</div>
            </button>
          ))}
        </div>
      </Field>

      {/* Ekonomi-mode — THE KEY UI */}
      <Field label="Ekonomi-åtkomst" hint="Default för UE-medlem är 'Egna belopp'. Hela Full ekonomi är inte tillgänglig — då blir personen Co-owner istället.">
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { k: "none", l: "Inga belopp", desc: "Operativ data bara — tasks, rum, foton, meddelanden", icon: icons.eye },
            { k: "own", l: "Egna belopp", desc: "Egna materials, leverantörer, timrapporter — inga andra UE eller totalbudget", icon: icons.tag },
          ].map(o => {
            const sel = mode === o.k;
            return (
              <button key={o.k} onClick={() => setMode(o.k)} style={{
                flex: 1, textAlign: "left", padding: 14,
                background: sel ? T.greenSoft : T.paper,
                border: sel ? `2px solid ${T.green}` : `1px solid ${T.line}`,
                borderRadius: 10, cursor: "pointer",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <Ico d={o.icon} size={14} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{o.l}</span>
                  {sel && <span style={{ marginLeft: "auto", fontSize: 10, color: T.green, fontFamily: "JetBrains Mono", textTransform: "uppercase", letterSpacing: ".06em" }}>Vald</span>}
                </div>
                <div style={{ fontSize: 11.5, color: T.mut, lineHeight: 1.4 }}>{o.desc}</div>
              </button>
            );
          })}
        </div>
      </Field>

      {/* Tilläggsrättigheter */}
      <Field label="Inköpsbehörigheter">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Toggle label="Kan föreslå inköp (skickar för godkännande)" checked />
          <Toggle label="Kan logga utförda inköp direkt (utan godkännande)" />
          {mode === "own" && <Toggle label="Kan se andra UE:s leverantörsnamn (utan priser)" />}
        </div>
      </Field>

      <ModalFooter primary="Nästa" secondary="Tillbaka" disabled={false} />
    </ModalShell>
  );
};

// ────────────────────────────────────────────────────────────────────
// 4 · WIZARD STEP 2 — PM/Co-owner variant
// ────────────────────────────────────────────────────────────────────
window.TeamV2WizardStep2_PM = function TeamV2WizardStep2_PM() {
  return (
    <ModalShell title="PM / Co-owner · Anders Karlsson" step="2 / 3" subtitle="Konfigurera åtkomst">

      {/* Sub-type */}
      <Field label="Vilken relation?" hint="Bara etikett — funktionellt likvärdiga. Påverkar copy i appen.">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button style={{ textAlign: "left", padding: 14, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 10, cursor: "pointer" }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Min partner / co-owner</div>
            <div style={{ fontSize: 11.5, color: T.mut, lineHeight: 1.4 }}>Jämbördig — vi äger projektet tillsammans. Visas som <em>"Anders Karlsson · Partner"</em> i UI.</div>
          </button>
          <button style={{ textAlign: "left", padding: 14, background: T.rustSoft, border: `2px solid ${T.rust}`, borderRadius: 10, cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Min anlitade projektledare</span>
              <span style={{ fontSize: 10, color: T.rust, fontFamily: "JetBrains Mono", textTransform: "uppercase", letterSpacing: ".06em" }}>Vald</span>
            </div>
            <div style={{ fontSize: 11.5, color: T.mut, lineHeight: 1.4 }}>De driver projektet åt mig. Visas som <em>"Anders Karlsson · Anlitad PM"</em>. Fakturor kommer från dem.</div>
          </button>
        </div>
      </Field>

      {/* Ekonomi-mode */}
      <Field label="Ekonomi-åtkomst" hint="Full är default för PM/Co-owner. Sänk om du vill behålla ekonomin själv.">
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { k: "none", l: "Inga belopp", desc: "Driver projektet operativt. Du håller hela ekonomin själv.", icon: icons.eye },
            { k: "own", l: "Egna belopp", desc: "Ser sina egna inköp/fakturor. Inte totalbudget.", icon: icons.tag },
            { k: "full", l: "Full ekonomi", desc: "Allt — totalbudget, alla UE-priser, marginaler.", icon: icons.budget, sel: true },
          ].map(o => (
            <button key={o.k} style={{
              flex: 1, textAlign: "left", padding: 14,
              background: o.sel ? T.rustSoft : T.paper,
              border: o.sel ? `2px solid ${T.rust}` : `1px solid ${T.line}`,
              borderRadius: 10, cursor: "pointer",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Ico d={o.icon} size={14} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{o.l}</span>
                {o.sel && <span style={{ marginLeft: "auto", fontSize: 10, color: T.rust, fontFamily: "JetBrains Mono", textTransform: "uppercase", letterSpacing: ".06em" }}>Vald</span>}
              </div>
              <div style={{ fontSize: 11.5, color: T.mut, lineHeight: 1.4 }}>{o.desc}</div>
            </button>
          ))}
        </div>
      </Field>

      {/* Extended permissions */}
      <Field label="Övriga rättigheter">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Toggle label="Kan bjuda in andra till projektet" checked />
          <Toggle label="Kan ändra projektets grundläggande info" checked />
          <Toggle label="Kan se interna team-meddelanden" checked />
          <Toggle label="Får notiser om allt i projektet" />
        </div>
      </Field>

      {/* Time-bound */}
      <Field label="Tidsbegränsning" hint="Lämna tomt för att gälla tills du tar bort åtkomsten.">
        <div style={{ display: "flex", gap: 8 }}>
          {["Permanent", "Hela projektet", "90 dagar", "Egen datum"].map((d, i) => (
            <button key={d} style={{
              padding: "6px 12px", fontSize: 12, borderRadius: 999,
              background: i === 1 ? T.green : T.paper, color: i === 1 ? "#fff" : T.ink,
              border: i === 1 ? "1px solid transparent" : `1px solid ${T.line}`,
              cursor: "pointer", fontWeight: 500,
            }}>{d}</button>
          ))}
        </div>
      </Field>

      <ModalFooter primary="Nästa" secondary="Tillbaka" disabled={false} />
    </ModalShell>
  );
};

// ────────────────────────────────────────────────────────────────────
// 5 · WIZARD STEP 3 — Contact + förhandsvisning
// ────────────────────────────────────────────────────────────────────
window.TeamV2WizardStep3 = function TeamV2WizardStep3() {
  return (
    <ModalShell title="UE-medlem · Markus Lind" step="3 / 3" subtitle="Kontakt och förhandsvisning" wide>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

        {/* Left: contact form */}
        <div>
          <Field label="Namn"><Input value="Markus Lind" /></Field>
          <Field label="E-post"><Input value="markus@nordel.se" /></Field>
          <Field label="Telefon" hint="frivilligt"><Input placeholder="+46…" /></Field>
          <Field label="Språk">
            <select style={{ width: "100%", padding: "9px 12px", fontSize: 13.5, border: `1px solid ${T.line}`, borderRadius: 7, background: T.paper }}>
              <option>🇸🇪 Svenska</option>
              <option>🇬🇧 English</option>
            </select>
          </Field>
          <Field label="Välkomstmeddelande" hint="Visas när Markus loggar in första gången">
            <textarea
              defaultValue="Hej Markus! Härmed har du access till el-jobben på Vasastans-projektet. Hör av dig om något är oklart!"
              style={{
                width: "100%", padding: "9px 12px", fontSize: 13, border: `1px solid ${T.line}`,
                borderRadius: 7, background: T.paper, resize: "none", fontFamily: "inherit", lineHeight: 1.55,
              }} rows={3}
            />
          </Field>
        </div>

        {/* Right: preview as persona */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div className="mono" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: T.mut }}>
              Förhandsgranska som Markus
            </div>
            <button style={{ fontSize: 11, padding: "4px 9px", background: T.green, color: "#fff", border: "none", borderRadius: 6, fontFamily: "JetBrains Mono", cursor: "pointer", letterSpacing: ".04em", fontWeight: 500 }}>
              ÖPPNA FULL
            </button>
          </div>
          {/* Mini preview iframe-ish */}
          <div style={{ background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 10, padding: 12, height: 360, overflow: "hidden", display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Tab bar */}
            <div style={{ display: "flex", gap: 4, fontSize: 9.5, color: T.mut }}>
              {["Översikt", "Arbeten", "Mina inköp", "Filer"].map((t, i) => (
                <span key={t} style={{ padding: "3px 7px", background: i === 0 ? T.paper : "transparent", border: i === 0 ? `1px solid ${T.line}` : "1px solid transparent", borderRadius: 4, fontWeight: i === 0 ? 600 : 400 }}>{t}</span>
              ))}
            </div>
            {/* Cover */}
            <div style={{ height: 50, borderRadius: 6, background: `linear-gradient(135deg, ${T.gold}, ${T.green})` }} />
            {/* Pulse cards — only relevant ones for UE Mode "Egna" */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <div style={{ padding: 8, background: T.paper, borderRadius: 6, border: `1px solid ${T.line}` }}>
                <div style={{ fontSize: 8.5, color: T.subtle, fontFamily: "JetBrains Mono", textTransform: "uppercase" }}>Mina arbeten</div>
                <div className="font-display" style={{ fontSize: 18 }}>6 / 8</div>
              </div>
              <div style={{ padding: 8, background: T.paper, borderRadius: 6, border: `1px solid ${T.line}` }}>
                <div style={{ fontSize: 8.5, color: T.subtle, fontFamily: "JetBrains Mono", textTransform: "uppercase" }}>Egna inköp</div>
                <div className="font-display" style={{ fontSize: 18 }}>3 öppna</div>
              </div>
            </div>
            <div style={{ padding: 8, background: T.greenSoft, borderRadius: 6, border: `1px dashed ${T.greenMid}` }}>
              <div style={{ fontSize: 10, color: T.green, fontWeight: 600, marginBottom: 2 }}>Mode: Egna belopp</div>
              <div style={{ fontSize: 10.5, color: T.ink, lineHeight: 1.5 }}>
                Ser <em>sina egna</em> materials &amp; timrapporter. <strong>Ser inte:</strong> task-budgetar, totalbudget, andra UE:s priser, fakturor.
              </div>
            </div>
            {/* Hidden things */}
            <div style={{ marginTop: "auto", fontSize: 10, color: T.mut, fontStyle: "italic", padding: "4px 8px", background: T.paper, borderRadius: 4, border: `1px solid ${T.line}` }}>
              Dolda flikar: Budget, Tidlinje (visas om "Egna" innehåller tidsspår), Team (vald: ej synlig för UE)
            </div>
          </div>
        </div>
      </div>

      <ModalFooter primary="Skicka inbjudan" secondary="Tillbaka" disabled={false} />
    </ModalShell>
  );
};

// ────────────────────────────────────────────────────────────────────
// 6 · TEAM TABLE v2
// ────────────────────────────────────────────────────────────────────
window.TeamV2Table = function TeamV2Table() {
  const rows = [
    {
      name: "Elin Lindqvist", role: "Projektägare", company: "—",
      persona: "owner", personaColor: T.ink, mode: "full",
      contact: "elin@email.com", lastActive: "Nu", joined: "12 dec 2025",
      avatar: "EL", avatarColor: T.green,
    },
    {
      name: "Anders Karlsson", role: "Anlitad PM", company: "Karlsson Bygg AB",
      persona: "pm-hired", personaColor: T.rust, mode: "full",
      contact: "anders@karlsson.se", lastActive: "12 min sedan", joined: "14 dec 2025",
      avatar: "AK", avatarColor: "oklch(50% 0.1 200)",
    },
    {
      name: "Markus Lind", role: "Elektriker", company: "Nord El AB",
      persona: "member", personaColor: "oklch(50% 0.1 230)", mode: "own",
      contact: "markus@nordel.se", lastActive: "2 dagar sedan", joined: "8 jan 2026",
      avatar: "ML", avatarColor: "oklch(52% 0.09 230)",
    },
    {
      name: "Patrik Söder", role: "VVS", company: "Söder VVS",
      persona: "member", personaColor: "oklch(50% 0.1 230)", mode: "own",
      contact: "patrik@vvs.se", lastActive: "Igår", joined: "8 jan 2026",
      avatar: "PS", avatarColor: "oklch(55% 0.1 155)",
    },
    {
      name: "Jonas Berg", role: "Måleri (UE-jobb)", company: "JB Måleri",
      persona: "worker", personaColor: T.gold, mode: "none",
      contact: "+46 70 123 45 67", lastActive: "9 min sedan", joined: "1 mars 2026",
      avatar: "JB", avatarColor: "oklch(58% 0.12 25)",
    },
    {
      name: "Mikael Nordin", role: "Klient (hemägar­vy)", company: "—",
      persona: "client", personaColor: T.green, mode: "client-view",
      contact: "mikael@gmail.com", lastActive: "1 timme sedan", joined: "14 dec 2025",
      avatar: "MN", avatarColor: "oklch(55% 0.12 75)",
    },
    {
      name: "Sofia Holm", role: "Designer", company: "Holm Studios",
      persona: "member", personaColor: "oklch(50% 0.1 230)", mode: "none",
      contact: "sofia@holmstudios.se", lastActive: "3 veckor sedan", joined: "1 nov 2025",
      avatar: "SH", avatarColor: "oklch(60% 0.08 60)", expires: "Slutar 1 jul 2026",
    },
  ];

  const personaLabels = {
    "owner": { l: "Projektägare", short: "Owner" },
    "pm-hired": { l: "Anlitad PM", short: "PM" },
    "pm-partner": { l: "Partner", short: "Co-owner" },
    "member": { l: "UE-medlem", short: "UE" },
    "client": { l: "Klient", short: "Klient" },
    "worker": { l: "Worker (token)", short: "Worker" },
  };
  const modeLabels = {
    "full": { l: "Full ekonomi", color: T.rust },
    "own": { l: "Egna belopp", color: T.green },
    "none": { l: "Inga belopp", color: T.mut },
    "client-view": { l: "Klientvy", color: T.green },
  };

  return (
    <div style={{ background: "var(--bg)", height: "100%", overflow: "auto" }}>
      <AppHeader projectMode activeTab="Team" project={{ name: "Vasastan Totalrenovering" }} />
      <main style={{ padding: "24px 36px 48px", maxWidth: 1280, margin: "0 auto" }}>
        <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", color: T.subtle }}>
          Projekt · Odengatan 57 · v2
        </div>
        <h1 className="font-display" style={{ fontSize: 38, fontWeight: 400, letterSpacing: "-.02em", margin: "10px 0 24px", lineHeight: 1.05 }}>
          Team · 7 personer
        </h1>

        {/* Top action bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <button className="rf-btn rf-btn-primary"><Ico d={icons.plus} size={13} /> Bjud in</button>
          <button className="rf-btn rf-btn-ghost"><Ico d={icons.eye} size={13} /> Förhandsgranska som…</button>
          <span style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 4, padding: 3, background: T.paper2, borderRadius: 7, border: `1px solid ${T.line}` }}>
            {["Alla 7", "Aktiva 6", "Workers 1", "Utgångna 0"].map((t, i) => (
              <button key={t} style={{
                padding: "5px 11px", fontSize: 12, borderRadius: 5,
                background: i === 0 ? T.paper : "transparent",
                border: i === 0 ? `1px solid ${T.line}` : "1px solid transparent",
                color: i === 0 ? T.ink : T.mut, fontWeight: 500, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div style={{ background: T.paper, border: `1px solid ${T.line}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "minmax(220px,1.5fr) 140px 130px 1.2fr 130px 80px",
            padding: "10px 16px", background: T.paper2, borderBottom: `1px solid ${T.line}`,
            fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".06em", color: T.mut, fontWeight: 600,
          }}>
            <span>Namn · roll</span>
            <span>Persona</span>
            <span>Mode</span>
            <span>Kontakt</span>
            <span>Senast aktiv</span>
            <span></span>
          </div>
          {rows.map((r, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "minmax(220px,1.5fr) 140px 130px 1.2fr 130px 80px",
              padding: "12px 16px", borderBottom: i < rows.length - 1 ? `1px solid ${T.line}` : "none",
              alignItems: "center", gap: 8,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: r.avatarColor, color: "#fff", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{r.avatar}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: T.mut, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.role} {r.company !== "—" && <>· {r.company}</>}</div>
                </div>
              </div>
              {/* Persona pill */}
              <div>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "3px 9px 3px 7px", fontSize: 11, fontWeight: 600,
                  background: r.personaColor === T.ink ? T.paper2 : `${r.personaColor}1A`,
                  color: r.personaColor, borderRadius: 999, border: `1px solid ${r.personaColor === T.ink ? T.line : `${r.personaColor}40`}`,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: r.personaColor }} />
                  {personaLabels[r.persona]?.l}
                </span>
              </div>
              {/* Mode pill */}
              <div>
                <span className="mono" style={{
                  fontSize: 10.5, padding: "3px 8px", borderRadius: 999,
                  background: `${modeLabels[r.mode].color}14`, color: modeLabels[r.mode].color,
                  border: `1px solid ${modeLabels[r.mode].color}40`, fontWeight: 600, letterSpacing: ".02em",
                }}>
                  {modeLabels[r.mode].l}
                </span>
              </div>
              <div style={{ fontSize: 12, color: T.mut, fontFamily: "JetBrains Mono", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.contact}</div>
              <div style={{ fontSize: 11.5, color: T.mut }}>
                {r.lastActive}
                {r.expires && <div style={{ fontSize: 10, color: T.gold, fontFamily: "JetBrains Mono", marginTop: 2 }}>{r.expires}</div>}
              </div>
              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                <button style={{ padding: 6, background: "transparent", border: "none", color: T.mut, cursor: "pointer" }} title="Visa som"><Ico d={icons.eye} size={13} /></button>
                <button style={{ padding: 6, background: "transparent", border: "none", color: T.mut, cursor: "pointer" }} title="Mer"><Ico d={icons.more} size={13} /></button>
              </div>
            </div>
          ))}
        </div>

        {/* Footnote */}
        <div style={{ marginTop: 14, padding: "10px 14px", background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 8, fontSize: 11.5, color: T.mut, lineHeight: 1.55 }}>
          <strong style={{ color: T.ink }}>Tre nya kolumner mot v1:</strong> persona-pill (synlig identitet), mode-pill (vad de ser av pengar), senast aktiv (vem är levande, vem är borta).
        </div>
      </main>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────
// 7 · PROJECT CREATION — with new toggles
// ────────────────────────────────────────────────────────────────────
window.TeamV2ProjectCreate = function TeamV2ProjectCreate() {
  return (
    <ModalShell title="Nytt projekt" step="" subtitle="Sätt upp projektets struktur. Du kan ändra detta senare." wide>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div>
          <Field label="Projektnamn"><Input value="Vasastan Totalrenovering" /></Field>
          <Field label="Adress"><Input value="Odengatan 57, 113 22 Stockholm" /></Field>
          <Field label="Storlek"><Input value="3 rok · 118 m²" /></Field>
          <Field label="Beskrivning">
            <textarea
              defaultValue="Totalrenovering av 3:a i sekelskifteshus. Bevarar originaldetaljer, nytt kök och badrum."
              style={{ width: "100%", padding: "9px 12px", fontSize: 13, border: `1px solid ${T.line}`, borderRadius: 7, background: T.paper, fontFamily: "inherit", lineHeight: 1.5, resize: "none" }} rows={3}
            />
          </Field>
        </div>

        <div>
          <div className="mono" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: T.mut, marginBottom: 12 }}>
            Vad ska trackas i appen?
          </div>

          {/* Track economy toggle */}
          <div style={{ padding: 16, background: T.greenSoft, border: `1px solid ${T.greenMid}`, borderRadius: 10, marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ marginTop: 2 }}>
                <ToggleSwitch checked />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.green, marginBottom: 4 }}>Tracka ekonomi i Renofine</div>
                <div style={{ fontSize: 12, color: T.ink, lineHeight: 1.55 }}>
                  Budget, fakturor, offerter, inköp med belopp lever inne i appen. Stäng av om någon part hellre håller ekonomin i Excel eller separat — projektet körs då bara operativt.
                </div>
              </div>
            </div>
          </div>

          {/* Track ROT toggle */}
          <div style={{ padding: 16, background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 10, marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ marginTop: 2 }}>
                <ToggleSwitch />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, marginBottom: 4 }}>Använd ROT-avdrag</div>
                <div style={{ fontSize: 12, color: T.mut, lineHeight: 1.55 }}>
                  ROT-fält på offerter och fakturor, personnummer på hushållet, Skatteverket-export. Default <strong>av</strong> — aktivera bara om båda parter vill deklarera formellt.
                </div>
              </div>
            </div>
          </div>

          <Field label="Vem äger projektet?">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button style={{ textAlign: "left", padding: 12, background: T.paper, border: `1px solid ${T.line}`, borderRadius: 8, cursor: "pointer" }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Jag (proffs)</div>
                <div style={{ fontSize: 11, color: T.mut }}>Påslag-modeller och fakturering aktiv</div>
              </button>
              <button style={{ textAlign: "left", padding: 12, background: T.greenSoft, border: `2px solid ${T.green}`, borderRadius: 8, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Jag (hemägare)</span>
                  <span style={{ fontSize: 9.5, color: T.green, fontFamily: "JetBrains Mono", textTransform: "uppercase" }}>Vald</span>
                </div>
                <div style={{ fontSize: 11, color: T.mut }}>Inga påslag — direkt kostnad till UE</div>
              </button>
            </div>
          </Field>
        </div>
      </div>

      <ModalFooter primary="Skapa projekt" secondary="Avbryt" disabled={false} />
    </ModalShell>
  );
};

// ────────────────────────────────────────────────────────────────────
// 8 · PREVIEW MATRIX — Översikt sett av olika personor
// ────────────────────────────────────────────────────────────────────
window.TeamV2PreviewMatrix = function TeamV2PreviewMatrix() {
  return (
    <div style={{ background: "var(--bg)", height: "100%", padding: "32px 40px", overflow: "auto" }}>
      <div className="mono" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: T.rust, marginBottom: 10 }}>
        Förhandsvisning · samma projekt sett av olika personor
      </div>
      <h1 className="font-display" style={{ fontSize: 36, fontWeight: 400, letterSpacing: "-.02em", margin: "0 0 8px", lineHeight: 1.1 }}>
        Översikt-tabben · 4 vyer
      </h1>
      <p style={{ fontSize: 13.5, color: T.mut, margin: "0 0 24px", maxWidth: 78 + "ch" }}>
        Samma projekt ("Vasastan Totalrenovering"), fyra olika invitiade. Lägg märke till vad som <em>är där</em> och vad som inte är.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>

        {/* PM · Full */}
        <PreviewCard
          persona="PM / Co-owner"
          mode="Full ekonomi"
          color={T.rust}
          sees={["Tot. budget 580 tkr", "Vinst est. 168 tkr", "Alla UE-priser", "Marginaler", "Alla fakturor"]}
          hides={[]}
        />

        {/* UE · Egna */}
        <PreviewCard
          persona="UE-medlem"
          mode="Egna belopp"
          color={T.green}
          sees={["Mina tasks (3 av 12)", "Mina inköp (5)", "Egna timrapporter"]}
          hides={["Tot. budget", "Andra UE:s priser", "Marginal", "Fakturor"]}
        />

        {/* UE · None */}
        <PreviewCard
          persona="UE / Specialist"
          mode="Inga belopp"
          color={T.mut}
          sees={["Mina tasks", "Mina rum", "Foton & meddelanden", "Planritning"]}
          hides={["Allt om pengar", "Inköp-tab göms", "Budget-tab göms", "Timpriser"]}
        />

        {/* Klient · CustomerView */}
        <PreviewCard
          persona="Klient"
          mode="Klientvy"
          color={T.green}
          sees={["Kontrakt 580 tkr", "Betalt 412 tkr", "ROT använt", "Foton & progress", "Min sida"]}
          hides={["Andra UE:s priser", "Marginaler", "Interna meddelanden"]}
          isClientView
        />
      </div>

      {/* Comparison strip */}
      <div style={{ marginTop: 28 }}>
        <div className="mono" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: T.mut, marginBottom: 12 }}>
          Vad <em>aldrig</em> visas för någon utom PM/Co-owner med Full mode
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {[
            { f: "tasks.budget", t: "Slutkundskostnad per task" },
            { f: "materials.markup_implicit", t: "Skillnad mellan inköpspris och fakturapris" },
            { f: "projects.total_budget", t: "Hela projektets budget" },
            { f: "time_logs.contractor_rate", t: "UE-timpriser" },
          ].map(i => (
            <div key={i.f} style={{ padding: 12, background: T.rustSoft, border: `1px solid rgba(181,52,30,.2)`, borderRadius: 8 }}>
              <div className="mono" style={{ fontSize: 10.5, color: T.rust, fontWeight: 600 }}>{i.f}</div>
              <div style={{ fontSize: 11.5, color: T.ink, marginTop: 3, lineHeight: 1.4 }}>{i.t}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

function PreviewCard({ persona, mode, color, sees, hides, isClientView }) {
  return (
    <div style={{ background: T.paper, border: `1px solid ${T.line}`, borderRadius: 12, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${T.line}`, background: T.paper2 }}>
        <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", color: T.mut }}>{persona}</div>
        <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: color, marginTop: 2 }}>{mode}</div>
      </div>
      {/* Mock preview */}
      <div style={{ padding: 12, minHeight: 240, display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 3, fontSize: 8.5, color: T.mut, flexWrap: "wrap" }}>
          {(isClientView
            ? ["Översikt", "Foton", "Meddelanden"]
            : mode === "Inga belopp"
              ? ["Översikt", "Arbeten", "Rum", "Filer"]
              : mode === "Egna belopp"
                ? ["Översikt", "Arbeten", "Mina inköp", "Filer"]
                : ["Översikt", "Arbeten", "Tidplan", "Budget", "Inköp", "Filer", "Team"]
          ).map((t, i) => (
            <span key={t} style={{ padding: "2px 6px", background: i === 0 ? color : "transparent", color: i === 0 ? "#fff" : T.mut, borderRadius: 3, fontWeight: i === 0 ? 600 : 400 }}>{t}</span>
          ))}
        </div>
        {/* Mock content */}
        <div style={{ height: 30, borderRadius: 4, background: `linear-gradient(135deg, ${T.gold}, ${T.green})` }} />
        <div style={{ fontSize: 9, color: T.mut, fontWeight: 600 }}>Vasastan Totalrenovering</div>
        {/* Sees */}
        <div style={{ marginTop: 4 }}>
          <div className="mono" style={{ fontSize: 8.5, color: T.green, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>SER</div>
          {sees.map((s, i) => (
            <div key={i} style={{ fontSize: 10, color: T.ink, padding: "2px 0", display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: T.green }}>✓</span> {s}
            </div>
          ))}
        </div>
        {/* Hides */}
        {hides.length > 0 && (
          <div>
            <div className="mono" style={{ fontSize: 8.5, color: T.rust, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>SER INTE</div>
            {hides.map((h, i) => (
              <div key={i} style={{ fontSize: 10, color: T.mut, padding: "2px 0", display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ color: T.rust }}>✕</span> {h}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// 9 · AUDIT LOG VIEW
// ────────────────────────────────────────────────────────────────────
window.TeamV2AuditLog = function TeamV2AuditLog() {
  const events = [
    { who: "Markus Lind", action: "Loggade in", target: "—", ago: "12 min sedan", icon: icons.users, color: T.green },
    { who: "Anders Karlsson", action: "Öppnade", target: "Budget · Faktura #2024-031", ago: "23 min sedan", icon: icons.budget, color: T.rust },
    { who: "Mikael Nordin", action: "Öppnade", target: "Klientvy · ROT-sektion", ago: "1 timme sedan", icon: icons.eye, color: T.green },
    { who: "Sofia Holm", action: "Försökte se", target: "Budget · NEKAD (åtkomst saknas)", ago: "i går 16:40", icon: icons.alert, color: T.rust, denied: true },
    { who: "Markus Lind", action: "Laddade ner", target: "Fil · Ritningar v3.pdf", ago: "i går 14:10", icon: icons.download, color: T.green },
    { who: "Jonas Berg", action: "Öppnade länk", target: "WorkerView · token #JB-2024", ago: "i går 09:15", icon: icons.task, color: T.gold },
    { who: "Anders Karlsson", action: "Ändrade inställning", target: "Markus · Mode: None → Egna", ago: "2 dagar sedan", icon: icons.settings, color: T.green },
    { who: "Elin Lindqvist", action: "Bjöd in", target: "Sofia Holm · UE-medlem, Mode None", ago: "1 vecka sedan", icon: icons.plus, color: T.green },
  ];

  return (
    <div style={{ background: "var(--bg)", height: "100%", overflow: "auto" }}>
      <AppHeader projectMode activeTab="Team" project={{ name: "Vasastan Totalrenovering" }} />
      <main style={{ padding: "24px 36px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", color: T.subtle }}>
          Team › Audit
        </div>
        <h1 className="font-display" style={{ fontSize: 36, fontWeight: 400, letterSpacing: "-.02em", margin: "10px 0 20px", lineHeight: 1.05 }}>
          Vem har sett vad
        </h1>

        <div style={{ marginBottom: 18, display: "flex", gap: 8 }}>
          {["Alla", "Sidvisningar", "Filer", "Inställningar", "Nekad åtkomst"].map((f, i) => (
            <button key={f} style={{
              padding: "6px 12px", fontSize: 12, borderRadius: 999,
              background: i === 0 ? T.ink : T.paper, color: i === 0 ? "#fff" : T.mut,
              border: `1px solid ${i === 0 ? T.ink : T.line}`, cursor: "pointer", fontWeight: 500,
            }}>{f}</button>
          ))}
        </div>

        <div style={{ background: T.paper, border: `1px solid ${T.line}`, borderRadius: 12, overflow: "hidden" }}>
          {events.map((e, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "32px 1fr 130px",
              gap: 14, padding: "14px 18px",
              borderBottom: i < events.length - 1 ? `1px solid ${T.line}` : "none", alignItems: "center",
              background: e.denied ? T.rustSoft : "transparent",
            }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: `${e.color}14`, color: e.color, display: "grid", placeItems: "center" }}>
                <Ico d={e.icon} size={13} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, lineHeight: 1.4 }}>
                  <strong>{e.who}</strong> <span style={{ color: T.mut }}>{e.action}</span> <span style={{ color: e.denied ? T.rust : T.ink, fontFamily: e.target.includes("·") ? "JetBrains Mono, monospace" : "inherit", fontSize: e.target.includes("·") ? 11.5 : 13, fontWeight: 500 }}>{e.target}</span>
                </div>
              </div>
              <div className="mono" style={{ fontSize: 10.5, color: T.mut, textTransform: "uppercase", letterSpacing: ".06em", textAlign: "right" }}>
                {e.ago}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 12, padding: "10px 14px", background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 8, fontSize: 11.5, color: T.mut, lineHeight: 1.55 }}>
          <strong style={{ color: T.ink }}>Default visa-period:</strong> senaste 30 dagarna. Klick på en rad öppnar detaljvy. <strong>Nekade åtkomstförsök</strong> markeras rost-färgade — användbart för säkerhets-audit.
        </div>
      </main>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════
// SHARED PRIMITIVES
// ════════════════════════════════════════════════════════════════════

function ModalShell({ title, step, subtitle, children, wide }) {
  return (
    <div style={{
      width: "100%", height: "100%", background: "rgba(20,15,5,.35)",
      display: "grid", placeItems: "center", padding: 24,
    }}>
      <div style={{
        width: wide ? 720 : 540, maxHeight: "100%", background: T.paper, borderRadius: 16,
        boxShadow: "0 24px 64px rgba(0,0,0,.18)", overflow: "hidden",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: "20px 24px 14px", borderBottom: `1px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", color: T.mut, marginBottom: 3 }}>{title}</div>
            {subtitle && <div className="font-display" style={{ fontSize: 18, fontWeight: 400, letterSpacing: "-.01em", lineHeight: 1.2 }}>{subtitle}</div>}
          </div>
          {step && (
            <div className="mono" style={{ fontSize: 10, color: T.mut, textTransform: "uppercase", letterSpacing: ".08em" }}>
              Steg {step}
            </div>
          )}
          <button style={{ background: "transparent", border: "none", color: T.mut, cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>
        <div style={{ padding: 24, overflowY: "auto" }}>{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({ primary, secondary, disabled }) {
  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${T.line}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
      {secondary && <button className="rf-btn rf-btn-ghost">{secondary}</button>}
      <button className="rf-btn rf-btn-primary" disabled={disabled}>{primary}</button>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: T.ink, display: "block", marginBottom: 5 }}>{label}</label>
      {hint && <div style={{ fontSize: 11, color: T.mut, marginBottom: 7, lineHeight: 1.45 }}>{hint}</div>}
      {children}
    </div>
  );
}

function Input({ value, placeholder }) {
  return (
    <input
      defaultValue={value}
      placeholder={placeholder}
      style={{
        width: "100%", padding: "9px 12px", fontSize: 13.5, color: T.ink,
        border: `1px solid ${T.line}`, borderRadius: 7, background: T.paper,
        fontFamily: "inherit",
      }}
    />
  );
}

function Toggle({ label, checked }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 12.5 }}>
      <span style={{
        width: 32, height: 18, borderRadius: 999,
        background: checked ? T.green : T.paper3,
        position: "relative", transition: "all .15s",
      }}>
        <span style={{
          position: "absolute", top: 2, left: checked ? 16 : 2,
          width: 14, height: 14, borderRadius: "50%", background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,.2)", transition: "all .15s",
        }} />
      </span>
      <span style={{ flex: 1 }}>{label}</span>
    </label>
  );
}

function ToggleSwitch({ checked }) {
  return (
    <span style={{
      display: "inline-block", width: 44, height: 24, borderRadius: 999,
      background: checked ? T.green : T.paper3, position: "relative",
    }}>
      <span style={{
        position: "absolute", top: 3, left: checked ? 23 : 3,
        width: 18, height: 18, borderRadius: "50%", background: "#fff",
        boxShadow: "0 1px 3px rgba(0,0,0,.25)", transition: "all .15s",
      }} />
    </span>
  );
}
