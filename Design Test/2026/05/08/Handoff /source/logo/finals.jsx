/* global React, MarkSkara, MarkRf, Wordmark, Lockup */

const FINALS = {
  ink: "#1A1A1A",
  green: "oklch(38% 0.08 155)",
  paper: "#FAFAF7",
  cream: "#F4EFE6",
  hairline: "rgba(20, 20, 20, 0.10)",
};

function FFrame({ width = 1200, height = 760, bg = FINALS.paper, children, padding = 56 }) {
  return (
    <div style={{
      width, height, background: bg, padding,
      fontFamily: "'Inter Tight', system-ui, sans-serif",
      color: FINALS.ink, boxSizing: "border-box", overflow: "hidden",
    }}>{children}</div>
  );
}

function FKick({ children }) {
  return <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(20,20,20,0.5)", marginBottom: 6 }}>{children}</div>;
}

function FH({ children, size = 34 }) {
  return <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: size, fontWeight: 400, letterSpacing: "-0.025em", lineHeight: 1.05, margin: "0 0 8px" }}>{children}</h2>;
}

function FNote({ children }) {
  return <p style={{ fontSize: 13, lineHeight: 1.55, color: "rgba(20,20,20,0.65)", margin: 0, maxWidth: 480 }}>{children}</p>;
}

function FAppIcon({ Mark, bg = FINALS.green, fg = FINALS.paper, size = 80, radius = 18 }) {
  const isRf = Mark === window.MarkRf;
  return (
    <div style={{ width: size, height: size, borderRadius: radius, background: bg, display: "grid", placeItems: "center", boxShadow: "0 1px 2px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06)" }}>
      {isRf
        ? <Mark size={size * 0.92} color={fg} onSurface={true}/>
        : <Mark size={size * 0.52} color={fg}/>}
    </div>
  );
}

function FTile({ label, bg = FINALS.paper, children, h = 130, border = true }) {
  return (
    <div>
      <div style={{ height: h, background: bg, border: border ? `1px solid ${FINALS.hairline}` : "none", borderRadius: 6, display: "grid", placeItems: "center", overflow: "hidden" }}>{children}</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(20,20,20,0.45)", marginTop: 6 }}>{label}</div>
    </div>
  );
}

function FHeaderMock({ Mark }) {
  return (
    <div style={{ width: "100%", height: 56, background: FINALS.paper, borderBottom: `1px solid ${FINALS.hairline}`, display: "flex", alignItems: "center", padding: "0 18px", gap: 20 }}>
      <Lockup Mark={Mark} text="Renofine" font="fraunces" markSize={24} textSize={18} gap={9} color={FINALS.ink}/>
      <div style={{ flex: 1 }}/>
      <div style={{ display: "flex", gap: 16, fontSize: 12, color: "rgba(20,20,20,0.55)" }}>
        <span>Projekt</span><span>Inköp</span><span>Tidsplan</span><span>Kunder</span>
      </div>
      <div style={{ width: 28, height: 28, borderRadius: "50%", background: FINALS.cream, marginLeft: 14 }}/>
    </div>
  );
}

function FFavicon({ Mark, label }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 6, background: FINALS.paper, border: `1px solid ${FINALS.hairline}` }}>
        <Mark size={14} color={FINALS.ink}/>
        <span style={{ fontSize: 11, color: "rgba(20,20,20,0.7)" }}>renofine.com / projekt</span>
        <span style={{ marginLeft: 6, fontSize: 10, color: "rgba(20,20,20,0.4)" }}>×</span>
      </div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(20,20,20,0.45)" }}>{label}</div>
    </div>
  );
}

function FSocial({ Mark }) {
  return (
    <div style={{ width: 380, height: 200, borderRadius: 10, background: FINALS.green, color: FINALS.paper, padding: 24, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <Lockup Mark={Mark} text="Renofine" font="fraunces" markSize={28} textSize={22} gap={10} color={FINALS.paper}/>
      <div>
        <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 22, fontWeight: 400, letterSpacing: "-0.02em", lineHeight: 1.15 }}>Projektkontoret för byggare.</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(250,250,247,0.6)", marginTop: 8 }}>renofine.com</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Final: Renofine (kapitäl R, Fraunces) + chosen Mark
// One artboard per choice — full presentation
// ─────────────────────────────────────────────────────────────────
window.FinalDirection = function FinalDirection({ Mark, name, descriptor, rationale, kicker }) {
  return (
    <FFrame width={1200} height={780}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 32 }}>
        <div>
          <FKick>{kicker}</FKick>
          <FH>Renofine + <em style={{ fontStyle: "italic", color: FINALS.green }}>{name}</em></FH>
          <FNote>{rationale}</FNote>
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(20,20,20,0.4)", letterSpacing: "0.1em", textTransform: "uppercase" }}>{descriptor}</div>
      </div>

      {/* Hero lockup */}
      <div style={{ background: FINALS.paper, border: `1px solid ${FINALS.hairline}`, borderRadius: 8, padding: "60px 40px", display: "grid", placeItems: "center", marginBottom: 24 }}>
        <Lockup Mark={Mark} text="Renofine" font="fraunces" markSize={68} textSize={56} gap={20} color={FINALS.ink}/>
      </div>

      {/* Variants row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 22 }}>
        <FTile label="Mark · ink"><Mark size={70} color={FINALS.ink}/></FTile>
        <FTile label="Mark · grön"><Mark size={70} color={FINALS.green}/></FTile>
        <FTile label="App-ikon · grön" bg="transparent" border={false}><FAppIcon Mark={Mark} bg={FINALS.green} fg={FINALS.paper}/></FTile>
        <FTile label="App-ikon · ink" bg="transparent" border={false}><FAppIcon Mark={Mark} bg={FINALS.ink} fg={FINALS.paper}/></FTile>
      </div>

      {/* Sizes + favicons */}
      <div style={{ background: FINALS.cream, borderRadius: 8, padding: "16px 22px", display: "flex", alignItems: "center", gap: 28, marginBottom: 22 }}>
        <div style={{ flexShrink: 0 }}>
          <FKick>Skalbarhet</FKick>
          <div style={{ fontSize: 11, color: "rgba(20,20,20,0.55)" }}>Från 16px favicon till poster</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <Mark size={16} color={FINALS.ink}/>
          <Mark size={24} color={FINALS.ink}/>
          <Mark size={32} color={FINALS.ink}/>
          <Mark size={48} color={FINALS.ink}/>
        </div>
        <div style={{ flex: 1 }}/>
        <FFavicon Mark={Mark} label="Browser-tab · 16px"/>
      </div>

      {/* In-context */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 16 }}>
        <div style={{ border: `1px solid ${FINALS.hairline}`, borderRadius: 8, overflow: "hidden" }}>
          <FHeaderMock Mark={Mark}/>
          <div style={{ height: 96, background: FINALS.paper, padding: 18 }}>
            <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 22, fontWeight: 400, letterSpacing: "-0.02em" }}>God morgon, Marcus.</div>
            <div style={{ fontSize: 12, color: "rgba(20,20,20,0.55)", marginTop: 4 }}>7 projekt aktiva · 2 godkännanden väntar</div>
          </div>
        </div>
        <FSocial Mark={Mark}/>
      </div>
    </FFrame>
  );
};

// ─────────────────────────────────────────────────────────────────
// Side-by-side hero comparison
// ─────────────────────────────────────────────────────────────────
window.FinalCompare = function FinalCompare() {
  return (
    <FFrame width={1200} height={560}>
      <FKick>Beslut · sista jämförelse</FKick>
      <FH>Två starka val. Vilken känner sig som <em style={{ fontStyle: "italic", color: FINALS.green }}>Renofine</em>?</FH>
      <FNote>Båda har kapitäl R + Fraunces regular. Skåra ger dig en distinkt geometrisk ikon för app/favicon. Rf-monogrammet är klassiskt och knyter direkt till namnet — mest återhållsamt.</FNote>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 32 }}>
        <div style={{ background: FINALS.paper, border: `1px solid ${FINALS.hairline}`, borderRadius: 8, padding: "44px 32px", display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
          <Lockup Mark={MarkSkara} text="Renofine" font="fraunces" markSize={48} textSize={42} gap={16} color={FINALS.ink}/>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <FAppIcon Mark={MarkSkara} bg={FINALS.green} fg={FINALS.paper} size={56} radius={12}/>
            <FAppIcon Mark={MarkSkara} bg={FINALS.ink} fg={FINALS.paper} size={56} radius={12}/>
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: FINALS.green }}>Alt A · Skåra</div>
          <div style={{ fontSize: 12, color: "rgba(20,20,20,0.65)", textAlign: "center", maxWidth: 320 }}>Distinkt geometrisk ikon — refererar precision. Ingen kollision med kända loggor.</div>
        </div>
        <div style={{ background: FINALS.paper, border: `1px solid ${FINALS.hairline}`, borderRadius: 8, padding: "44px 32px", display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
          <Lockup Mark={MarkRf} text="Renofine" font="fraunces" markSize={48} textSize={42} gap={16} color={FINALS.ink}/>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <FAppIcon Mark={MarkRf} bg={FINALS.green} fg={FINALS.paper} size={56} radius={12}/>
            <FAppIcon Mark={MarkRf} bg={FINALS.ink} fg={FINALS.paper} size={56} radius={12}/>
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: FINALS.green }}>Alt B · Rf-monogram</div>
          <div style={{ fontSize: 12, color: "rgba(20,20,20,0.65)", textAlign: "center", maxWidth: 320 }}>Klassiskt monogram — 'Rf' i Fraunces i en rundad ruta. Direkt läsbart, mest återhållsamt.</div>
        </div>
      </div>
    </FFrame>
  );
};
