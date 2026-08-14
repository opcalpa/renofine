/* global React, Ico, icons */
const { useState: useS_co } = React;

// =================================================================
// HOME — CONTRACTOR
// 3 states: empty (no projects yet) · active (busy day) · quiet (calm day)
// Visual language identical to Homeowner home.
// =================================================================

const CO_DATA = {
  user: { name: "Markus", initials: "MA", company: "Bygg & Måleri Stockholm AB" },
  jobs: [
    { id:"j1", name:"Vasastan Totalrenovering", addr:"Odengatan 57", task:"Mont. bänkskivor", crew:"Erik + 2", urgent:false, started:"08:30", status:"pågår" },
    { id:"j2", name:"Brf Linden — Badrum", addr:"Linnégatan 12", task:"Tätskikt påbörjas", crew:"Mikael", urgent:true, started:"07:45", status:"väntar material" },
    { id:"j3", name:"Södermalm Altan", addr:"Katarina Bangata 22", task:"Virke-leverans 14:00", crew:"Anna", urgent:false, status:"planerat" },
  ],
  approvals: [
    { who:"Elin (Brf Linden)", what:"Inköp · Schönox tätskikt", value:8200, age:"3h" },
    { who:"Anna Lindqvist", what:"ATA · Isolering yttervägg", value:12000, age:"i går" },
    { who:"Per Bergström", what:"Offert · Köksrenovering", value:184500, age:"2 dagar" },
  ],
  pipeline: [
    { stage:"Lead", count:3, value:"4.2 Mkr" },
    { stage:"Offert utkast", count:2, value:"1.8 Mkr" },
    { stage:"Skickad", count:4, value:"3.1 Mkr" },
    { stage:"Vunnen v.17", count:6, value:"2.4 Mkr" },
  ],
  invoices: [
    { client:"Brf Linden", amt:42000, age:5, status:"väntar" },
    { client:"P. Bergström", amt:18500, age:12, status:"påminnelse" },
    { client:"Anna L.", amt:6800, age:32, status:"förfallen" },
  ],
};

// Reuse Kicker pattern from homeowner file
function CoKicker({ children, c }) {
  return <div className="mono" style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.1em", color:c||"var(--fg-subtle)", marginBottom:10 }}>{children}</div>;
}

function CoHeader({ active="Hem" }) {
  return (
    <header style={{ height:52, borderBottom:"1px solid var(--hairline)", background:"var(--surface)", display:"flex", alignItems:"center", padding:"0 24px", gap:24 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <div style={{ width:22, height:22, borderRadius:5, background:"var(--accent-ink)", color:"var(--bg)", display:"grid", placeItems:"center", fontSize:11, fontWeight:700, fontFamily:'"Fraunces", serif', letterSpacing:"-0.04em" }}>Rf</div>
        <span className="font-display" style={{ fontSize:18, fontWeight:500, letterSpacing:"-0.03em" }}>Renofine</span>
      </div>
      <nav style={{ display:"flex", alignItems:"center", gap:2 }}>
        {["Hem","Projekt","Pipeline","Kunder","Inkorg"].map((l,i)=>(
          <button key={l} style={{ padding:"6px 11px", fontSize:13, borderRadius:6, background:l===active?"var(--surface-2)":"transparent", border:"1px solid transparent", color:l===active?"var(--fg)":"var(--fg-muted)", fontWeight:l===active?500:400, cursor:"pointer", position:"relative" }}>
            {l}
            {l==="Inkorg" && <span style={{ position:"absolute", top:3, right:3, width:6, height:6, borderRadius:"50%", background:"var(--warn)" }}/>}
          </button>
        ))}
      </nav>
      <div style={{ flex:1 }}/>
      <button className="rf-btn rf-btn-ghost" style={{ padding:7 }}><Ico d={icons.bell} size={15}/></button>
      <div style={{ width:30, height:30, borderRadius:"50%", background:"oklch(45% 0.05 230)", color:"var(--bg)", display:"grid", placeItems:"center", fontSize:12, fontWeight:600 }}>{CO_DATA.user.initials}</div>
    </header>
  );
}

// ─── A. EMPTY — first run, three equally-weighted CTAs ─────────────
function CoEmpty() {
  return (
    <div style={{ background:"var(--bg)", minHeight:"100%" }}>
      <CoHeader/>
      <main style={{ maxWidth:1080, margin:"0 auto", padding:"60px 40px 80px" }}>
        <CoKicker>Välkommen, Markus · Inga projekt ännu</CoKicker>
        <h1 className="font-display" style={{ fontSize:54, fontWeight:400, letterSpacing:"-0.028em", margin:0, lineHeight:1.02, maxWidth:820 }}>
          Bygg <em style={{ fontStyle:"italic", color:"var(--primary)" }}>en plats</em> för dina kunder, dina jobb, och pengarna som rör sig.
        </h1>
        <p style={{ fontSize:16, color:"var(--fg-muted)", marginTop:18, maxWidth:640, lineHeight:1.55 }}>
          Renofine ersätter den e-postkedja, det Excel-ark och den WhatsApp-grupp du har för varje projekt. Börja med en kund, en offert eller importera en pågående pärm.
        </p>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:14, marginTop:40 }}>
          {[
            { i:"sparkle", k:"01 · Snabbast", t:"Skapa offert med AI", s:"Skriv vad jobbet ska innehålla — vi strukturerar poster, ROT-grundande arbete och pris." , primary:true },
            { i:"folder", k:"02 · Klassiskt", t:"Lägg till en kund", s:"Bygg upp ditt klientregister. Alla projekt knyts till rätt kund och faktureringsadress." },
            { i:"chat", k:"03 · Inkommande", t:"Skicka kund-intag", s:"Länk till formulär — kunden fyller i vad som ska göras, du tar över." },
          ].map((o,i)=>(
            <button key={i} className="rf-card" style={{ padding:24, textAlign:"left", cursor:"pointer", border:"1px solid var(--hairline)", background:o.primary?"var(--accent-ink)":"var(--surface)", color:o.primary?"var(--bg)":"var(--fg)", display:"flex", flexDirection:"column", gap:14, minHeight:200 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div style={{ width:36, height:36, borderRadius:8, background:o.primary?"oklch(35% 0.01 260)":"var(--surface-2)", display:"grid", placeItems:"center", color:o.primary?"var(--bg)":"var(--fg-muted)" }}>
                  <Ico d={icons[o.i]} size={18}/>
                </div>
                <Ico d={icons.arrowRight} size={14}/>
              </div>
              <div className="mono" style={{ fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em", color:o.primary?"oklch(70% 0.005 85)":"var(--fg-subtle)" }}>{o.k}</div>
              <div className="font-display" style={{ fontSize:22, fontWeight:400, letterSpacing:"-0.018em", lineHeight:1.15 }}>{o.t}</div>
              <div style={{ fontSize:13, color:o.primary?"oklch(80% 0.005 85)":"var(--fg-muted)", lineHeight:1.5 }}>{o.s}</div>
            </button>
          ))}
        </div>

        {/* Setup checklist */}
        <section style={{ marginTop:60, paddingTop:40, borderTop:"1px solid var(--hairline)" }}>
          <CoKicker>Kom igång snabbare</CoKicker>
          <h2 className="font-display" style={{ fontSize:26, fontWeight:400, letterSpacing:"-0.02em", margin:"4px 0 24px" }}>Lite uppstartsjobb · ungefär 12 min</h2>
          <div className="rf-card" style={{ overflow:"hidden" }}>
            {[
              { n:"01", t:"Företagsuppgifter", s:"Org.nummer, F-skatt, fakturaadress — för fakturor & ROT-anmälan", time:"3 min", done:false },
              { n:"02", t:"Lägg till medarbetare", s:"Bjud in dina snickare så de kan stämpla in på rätt projekt", time:"2 min", done:false },
              { n:"03", t:"Importera kundregister", s:"CSV från ditt nuvarande system, eller börja från noll", time:"5 min", done:false, optional:true },
              { n:"04", t:"Anslut bokföring", s:"Fortnox, Visma eller Bokio — fakturor flödar automatiskt", time:"2 min", done:false, optional:true },
            ].map((s,i)=>(
              <div key={i} style={{ padding:"16px 22px", display:"flex", alignItems:"center", gap:16, borderBottom:i<3?"1px solid var(--hairline)":"none" }}>
                <span className="mono" style={{ fontSize:11, color:"var(--fg-subtle)", width:20 }}>{s.n}</span>
                <div style={{ width:22, height:22, borderRadius:"50%", border:"1.5px solid var(--border-strong)", flexShrink:0 }}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:500, display:"flex", alignItems:"center", gap:8 }}>
                    {s.t}
                    {s.optional && <span className="mono" style={{ fontSize:9.5, color:"var(--fg-subtle)", textTransform:"uppercase", letterSpacing:"0.06em", padding:"1px 6px", border:"1px solid var(--hairline)", borderRadius:3 }}>valfritt</span>}
                  </div>
                  <div style={{ fontSize:12, color:"var(--fg-muted)", marginTop:2 }}>{s.s}</div>
                </div>
                <span className="mono" style={{ fontSize:10.5, color:"var(--fg-subtle)" }}>{s.time}</span>
                <button className="rf-btn rf-btn-ghost" style={{ fontSize:12 }}>Starta<Ico d={icons.arrowRight} size={11}/></button>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

// ─── B. ACTIVE — busy work day ─────────────────────────────────────
function CoActive() {
  return (
    <div style={{ background:"var(--bg)", minHeight:"100%" }}>
      <CoHeader/>
      <main style={{ maxWidth:1320, margin:"0 auto", padding:"32px 40px 60px" }}>
        {/* Top row: greeting + day-summary */}
        <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", gap:32, paddingBottom:24, borderBottom:"1px solid var(--hairline)" }}>
          <div>
            <CoKicker>Tor 24 apr · 09:14</CoKicker>
            <h1 className="font-display" style={{ fontSize:42, fontWeight:400, letterSpacing:"-0.026em", margin:0, lineHeight:1.05 }}>God morgon, Markus.</h1>
            <p style={{ fontSize:14.5, color:"var(--fg-muted)", marginTop:8, maxWidth:560 }}>
              <strong style={{ color:"var(--fg)" }}>3 jobb</strong> körs idag · <strong style={{ color:"var(--fg)" }}>3 godkännanden</strong> ligger på dig · <strong style={{ color:"var(--warn)" }}>1 faktura</strong> är förfallen sedan v.16
            </p>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button className="rf-btn rf-btn-ghost"><Ico d={icons.inbox} size={14}/>Inkorg (7)</button>
            <button className="rf-btn rf-btn-primary"><Ico d={icons.plus} size={14}/>Nytt projekt</button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="rf-card" style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", margin:"24px 0 32px", overflow:"hidden" }}>
          {[
            { l:"Aktiva projekt", v:"6", s:"+1 v/v" },
            { l:"Pipeline-värde", v:"9.1", u:"Mkr", s:"15 i pipeline" },
            { l:"Faktureras v.17", v:"148", u:"tkr", s:"5 utkast klara" },
            { l:"Förfallna fordringar", v:"6.8", u:"tkr", s:"1 kund · 32 dgr", warn:true },
            { l:"Vinst hittills", v:"+174", u:"tkr", s:"12% marg." },
          ].map((s,i)=>(
            <div key={i} style={{ padding:"16px 20px", borderRight:i<4?"1px solid var(--hairline)":"none" }}>
              <div className="mono" style={{ fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em", color:s.warn?"var(--warn)":"var(--fg-subtle)", marginBottom:8 }}>{s.l}</div>
              <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                <span className="font-display tnum" style={{ fontSize:26, fontWeight:400, lineHeight:1, letterSpacing:"-0.022em", color:s.warn?"var(--warn)":"var(--fg)" }}>{s.v}</span>
                {s.u && <span className="mono" style={{ fontSize:11, color:"var(--fg-subtle)" }}>{s.u}</span>}
              </div>
              <div style={{ fontSize:11.5, color:"var(--fg-muted)", marginTop:6 }}>{s.s}</div>
            </div>
          ))}
        </div>

        {/* Two columns: today's jobs + approvals */}
        <div style={{ display:"grid", gridTemplateColumns:"1.4fr 1fr", gap:32, marginBottom:40 }}>
          {/* Today's jobs */}
          <section>
            <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:14 }}>
              <div>
                <CoKicker>Idag · 24 apr</CoKicker>
                <h2 className="font-display" style={{ fontSize:24, fontWeight:400, margin:0, letterSpacing:"-0.018em" }}>Dagens arbeten</h2>
              </div>
              <button className="rf-btn rf-btn-ghost" style={{ fontSize:12 }}>Veckoplan<Ico d={icons.arrowRight} size={11}/></button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:1, background:"var(--hairline)", border:"1px solid var(--hairline)", borderRadius:8, overflow:"hidden" }}>
              {CO_DATA.jobs.map((j,i)=>(
                <div key={j.id} style={{ background:"var(--surface)", padding:"16px 18px", display:"flex", alignItems:"center", gap:16 }}>
                  <div style={{ width:8, height:8, borderRadius:2, background:j.urgent?"var(--warn)":"var(--primary)", flexShrink:0 }}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"baseline", gap:10 }}>
                      <span style={{ fontSize:14, fontWeight:500 }}>{j.name}</span>
                      <span className="mono" style={{ fontSize:10.5, color:"var(--fg-subtle)", textTransform:"uppercase", letterSpacing:"0.06em" }}>{j.addr}</span>
                    </div>
                    <div style={{ fontSize:12.5, color:"var(--fg-muted)", marginTop:4, display:"flex", gap:14 }}>
                      <span><strong style={{ color:"var(--fg)", fontWeight:500 }}>{j.task}</strong></span>
                      <span>· {j.crew}</span>
                      {j.started && <span>· stämplade in {j.started}</span>}
                    </div>
                  </div>
                  <span className={`rf-chip ${j.urgent?"chip-warn":j.status==="planerat"?"chip-muted":"chip-primary"}`}>{j.status}</span>
                  <button className="rf-btn rf-btn-ghost" style={{ fontSize:12, padding:7 }}><Ico d={icons.arrowRight} size={12}/></button>
                </div>
              ))}
            </div>
            <div style={{ marginTop:10, fontSize:11.5, color:"var(--fg-subtle)" }}>3 av 6 aktiva projekt har arbete idag · <a style={{ color:"var(--primary)", cursor:"pointer" }}>se alla</a></div>
          </section>

          {/* Approvals */}
          <section>
            <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:14 }}>
              <div>
                <CoKicker>Väntar på dig</CoKicker>
                <h2 className="font-display" style={{ fontSize:24, fontWeight:400, margin:0, letterSpacing:"-0.018em" }}>Att godkänna</h2>
              </div>
              <span className="mono" style={{ fontSize:11, color:"var(--fg-subtle)" }}>{CO_DATA.approvals.length} st</span>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {CO_DATA.approvals.map((a,i)=>(
                <div key={i} className="rf-card" style={{ padding:"14px 16px" }}>
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div className="mono" style={{ fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em", color:"var(--fg-subtle)" }}>Från {a.who} · {a.age}</div>
                      <div style={{ fontSize:13.5, fontWeight:500, marginTop:4 }}>{a.what}</div>
                      <div className="mono tnum" style={{ fontSize:14, marginTop:6, color:"var(--fg)" }}>{a.value.toLocaleString("sv-SE")} kr</div>
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:6, marginTop:10 }}>
                    <button className="rf-btn rf-btn-ghost" style={{ fontSize:11.5, flex:1, justifyContent:"center" }}>Avvisa</button>
                    <button className="rf-btn rf-btn-primary" style={{ fontSize:11.5, flex:2, justifyContent:"center" }}>Godkänn</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Pipeline strip */}
        <section style={{ marginBottom:40 }}>
          <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:14 }}>
            <div>
              <CoKicker>Pipeline</CoKicker>
              <h2 className="font-display" style={{ fontSize:24, fontWeight:400, margin:0, letterSpacing:"-0.018em" }}>Leads &amp; offerter</h2>
            </div>
            <div style={{ display:"flex", gap:6 }}>
              <span className="mono" style={{ fontSize:11, color:"var(--fg-subtle)", alignSelf:"center" }}>9.1 Mkr · 15 st</span>
              <button className="rf-btn rf-btn-ghost" style={{ fontSize:12 }}>Se alla</button>
              <button className="rf-btn rf-btn-ghost" style={{ fontSize:12 }}><Ico d={icons.plus} size={11}/>Ny lead</button>
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
            {CO_DATA.pipeline.map((s,i)=>(
              <div key={i} className="rf-card" style={{ padding:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <span style={{ fontSize:12, fontWeight:500 }}>{s.stage}</span>
                  <span className="mono" style={{ fontSize:11, color:"var(--fg-subtle)" }}>{s.count}</span>
                </div>
                <div className="font-display tnum" style={{ fontSize:22, fontWeight:400, letterSpacing:"-0.02em" }}>{s.value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Invoices to chase + Cash forecast */}
        <section>
          <div style={{ display:"grid", gridTemplateColumns:"1.2fr 1fr", gap:32 }}>
            <div>
              <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:14 }}>
                <div>
                  <CoKicker>Pengar in</CoKicker>
                  <h2 className="font-display" style={{ fontSize:22, fontWeight:400, margin:0, letterSpacing:"-0.015em" }}>Fakturor att jaga</h2>
                </div>
                <button className="rf-btn rf-btn-ghost" style={{ fontSize:12 }}>Skicka påminnelser</button>
              </div>
              <div className="rf-card" style={{ overflow:"hidden" }}>
                {CO_DATA.invoices.map((inv,i)=>(
                  <div key={i} style={{ padding:"12px 16px", display:"grid", gridTemplateColumns:"1.4fr 1fr 1fr 100px", gap:14, alignItems:"center", borderBottom:i<CO_DATA.invoices.length-1?"1px solid var(--hairline)":"none", fontSize:13 }}>
                    <span style={{ fontWeight:500 }}>{inv.client}</span>
                    <span className="mono tnum">{inv.amt.toLocaleString("sv-SE")} kr</span>
                    <span className="mono" style={{ fontSize:11.5, color:inv.age>30?"var(--warn)":"var(--fg-muted)" }}>{inv.age} dagar</span>
                    <span className={`rf-chip ${inv.status==="förfallen"?"chip-warn":inv.status==="påminnelse"?"chip-warn":"chip-muted"}`}>{inv.status}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Cash forecast next 30 days */}
            <div>
              <CoKicker>Nästa 30 dagar</CoKicker>
              <h2 className="font-display" style={{ fontSize:22, fontWeight:400, margin:"4px 0 14px", letterSpacing:"-0.015em" }}>Likviditetsprognos</h2>
              <div className="rf-card" style={{ padding:18 }}>
                <div style={{ display:"flex", alignItems:"baseline", gap:8 }}>
                  <span className="font-display tnum" style={{ fontSize:30, fontWeight:400, letterSpacing:"-0.022em", lineHeight:1, color:"var(--primary)" }}>+382</span>
                  <span className="mono" style={{ fontSize:12, color:"var(--fg-subtle)" }}>tkr nettoflöde</span>
                </div>
                {/* Mini bar timeline */}
                <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:60, marginTop:18 }}>
                  {[18,28,42,12,22,38,15,30].map((h,i)=>(
                    <div key={i} style={{ flex:1, height:`${h}%`, background:i>=4?"var(--primary)":"var(--surface-2)", borderRadius:2, opacity:i>=4?1:0.7 }} title={`v.${17+i}`}/>
                  ))}
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", marginTop:8, fontSize:9.5, color:"var(--fg-subtle)" }} className="mono">
                  <span>v.17</span><span>v.21</span><span>v.24</span>
                </div>
                <div style={{ height:1, background:"var(--hairline)", margin:"14px 0" }}/>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"var(--fg-muted)" }}>
                  <span>Inflöde fakturor</span>
                  <span className="mono tnum" style={{ color:"var(--fg)" }}>+520 tkr</span>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"var(--fg-muted)", marginTop:6 }}>
                  <span>Utflöde löner & material</span>
                  <span className="mono tnum" style={{ color:"var(--fg)" }}>−138 tkr</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

// ─── C. QUIET — calm day, things under control ─────────────────────
function CoQuiet() {
  return (
    <div style={{ background:"var(--bg)", minHeight:"100%" }}>
      <CoHeader/>
      <main style={{ maxWidth:1180, margin:"0 auto", padding:"40px 40px 80px" }}>
        <div style={{ display:"grid", gridTemplateColumns:"1.3fr 1fr", gap:48, alignItems:"flex-start" }}>
          <section>
            <CoKicker>Fre 25 apr · 08:42</CoKicker>
            <h1 className="font-display" style={{ fontSize:46, fontWeight:400, letterSpacing:"-0.026em", margin:0, lineHeight:1.05 }}>
              Lugn dag, Markus. <em style={{ fontStyle:"italic", color:"var(--primary)" }}>Inget brådskar.</em>
            </h1>
            <p style={{ fontSize:15, color:"var(--fg-muted)", marginTop:12, maxWidth:560, lineHeight:1.55 }}>
              Inga ATA-arbeten väntar. Inga förfallna fakturor. Två offerter att färdigställa när du har tid — kanske idag är dagen för pipeline-jobbet?
            </p>

            {/* All-clear cards */}
            <div style={{ marginTop:32, display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              {[
                { i:"check", t:"Inga godkännanden", s:"Allt material och alla ATA är klarmarkerade", green:true },
                { i:"check", t:"Inga förfallna fakturor", s:"Senaste betalning kom in i går", green:true },
                { i:"clock", t:"2 jobb körs idag", s:"Båda i fas — inga incidenter rapporterade" },
                { i:"alert", t:"Slutbesiktning på torsdag", s:"Brf Linden — bekräfta tid med kund", soft:true },
              ].map((c,i)=>(
                <div key={i} className="rf-card" style={{ padding:16, display:"flex", gap:12, alignItems:"flex-start", borderLeft:c.green?"3px solid var(--primary)":c.soft?"3px solid var(--warn)":"3px solid var(--hairline)" }}>
                  <div style={{ width:28, height:28, borderRadius:"50%", background:c.green?"color-mix(in oklab, var(--primary) 14%, transparent)":c.soft?"color-mix(in oklab, var(--warn) 14%, transparent)":"var(--surface-2)", color:c.green?"var(--primary)":c.soft?"var(--warn)":"var(--fg-muted)", display:"grid", placeItems:"center", flexShrink:0 }}>
                    <Ico d={icons[c.i]} size={14}/>
                  </div>
                  <div>
                    <div style={{ fontSize:13.5, fontWeight:500 }}>{c.t}</div>
                    <div style={{ fontSize:12, color:"var(--fg-muted)", marginTop:3, lineHeight:1.5 }}>{c.s}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Suggestion: do the work that ISN'T an emergency */}
            <div style={{ marginTop:40 }}>
              <CoKicker>Bra dag att göra</CoKicker>
              <h2 className="font-display" style={{ fontSize:24, fontWeight:400, margin:"4px 0 16px", letterSpacing:"-0.018em" }}>Sakerna som annars hamnar längst ner</h2>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {[
                  { kicker:"2 offerter i utkast", t:"Färdigställ Lägenhet Östermalm", s:"480 tkr · väntar på materialspec från leverantören. Ring Henrik på Kakeldax?", cta:"Öppna offert" },
                  { kicker:"Nästa kvartal", t:"Lägg in semestervecka i juni", s:"Brf Linden går in i slutbesiktning v.21 — bra läge för en paus efter det.", cta:"Planera frånvaro" },
                  { kicker:"Klientregister", t:"Be Anna L. om Google-omdöme", s:"Hon var nöjd med altanen — nu är det 6 veckor sedan slutbesiktning.", cta:"Skicka mall" },
                ].map((x,i)=>(
                  <div key={i} className="rf-card" style={{ padding:"14px 18px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:14 }}>
                      <div style={{ flex:1 }}>
                        <div className="mono" style={{ fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em", color:"var(--fg-subtle)", marginBottom:4 }}>{x.kicker}</div>
                        <div style={{ fontSize:14, fontWeight:500 }}>{x.t}</div>
                        <div style={{ fontSize:12.5, color:"var(--fg-muted)", marginTop:4, lineHeight:1.5 }}>{x.s}</div>
                      </div>
                      <button className="rf-btn rf-btn-ghost" style={{ fontSize:12, flexShrink:0 }}>{x.cta}<Ico d={icons.arrowRight} size={11}/></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Right column — week summary + stats */}
          <aside style={{ display:"flex", flexDirection:"column", gap:18, position:"sticky", top:24 }}>
            <div className="rf-card" style={{ padding:20 }}>
              <CoKicker>Vecka 17 · sammanställning</CoKicker>
              <div style={{ display:"flex", flexDirection:"column", gap:12, marginTop:8 }}>
                {[
                  { l:"Slutförda arbeten", v:"4", c:"var(--primary)" },
                  { l:"Fakturerat", v:"148 tkr", },
                  { l:"Betalt in", v:"96 tkr", },
                  { l:"Nya leads", v:"2" },
                  { l:"Vunnen pipeline", v:"680 tkr", c:"var(--primary)" },
                ].map((r,i)=>(
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", paddingBottom:i<4?10:0, borderBottom:i<4?"1px solid var(--hairline)":"none" }}>
                    <span style={{ fontSize:13, color:"var(--fg-muted)" }}>{r.l}</span>
                    <span className="mono tnum" style={{ fontSize:14, fontWeight:500, color:r.c||"var(--fg)" }}>{r.v}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rf-card" style={{ padding:18 }}>
              <CoKicker>Crew · just nu</CoKicker>
              {[
                { n:"Erik Holm", w:"Vasastan · bänkskivor", in:"07:42" },
                { n:"Mikael Sjö", w:"Brf Linden · väntar material", in:"07:45" },
                { n:"Anna Strand", w:"Rast", in:"08:55" },
              ].map((c,i)=>(
                <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderTop:i>0?"1px solid var(--hairline)":"none" }}>
                  <div style={{ width:28, height:28, borderRadius:"50%", background:"var(--surface-2)", display:"grid", placeItems:"center", fontSize:11, fontWeight:600, flexShrink:0 }}>{c.n.split(" ").map(s=>s[0]).join("")}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12.5, fontWeight:500 }}>{c.n}</div>
                    <div style={{ fontSize:11, color:"var(--fg-subtle)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{c.w}</div>
                  </div>
                  <span className="mono" style={{ fontSize:10.5, color:"var(--fg-subtle)" }}>in {c.in}</span>
                </div>
              ))}
            </div>

            <div style={{ padding:"16px 18px", background:"color-mix(in oklab, var(--primary) 6%, transparent)", border:"1px solid color-mix(in oklab, var(--primary) 25%, transparent)", borderRadius:8 }}>
              <div className="mono" style={{ fontSize:9.5, textTransform:"uppercase", letterSpacing:"0.08em", color:"var(--primary)" }}>Insikt · Q2</div>
              <div style={{ fontSize:13, marginTop:6, lineHeight:1.5 }}>Din genomsnittliga marginal har stigit från 9% till 12% sedan du började prissätta ROT-arbete separat.</div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

window.CoEmpty = CoEmpty;
window.CoActive = CoActive;
window.CoQuiet = CoQuiet;
