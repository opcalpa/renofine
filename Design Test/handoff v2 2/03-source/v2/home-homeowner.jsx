/* global React, Ico, icons */
const { useState: useS_ho } = React;

// =================================================================
// HOME — HOMEOWNER
// 3 states: empty (no project) · single (one active) · multi (several + history)
// =================================================================

const HO_DATA = {
  user: { name: "Elin", initials: "EL" },
  active: {
    id: "p-bath",
    name: "Brf Linden — Badrum",
    addr: "Linnégatan 12 · 1 rok",
    type: "Badrum · 6 m²",
    progress: 0.38,
    daysLeft: 20,
    until: "18 maj 2026",
    contractor: "Bygg & Måleri Stockholm AB",
    pm: "Markus Andersson",
    decisions: 2,
    nextMilestone: "Tätskikt påbörjas i veckan",
    img: "foto-badrum-stomme",
    paid: 62000,
    invoiced: 87000,
    target: 140000,
    rotKvar: 20100,
    rotMax: 50000,
  },
  past: [
    { y: 2024, n: "Köksrenovering", addr: "Linnégatan 12", cost: 187000, rot: 32100, img: "foto-kök-2024" },
    { y: 2023, n: "Tak omläggning", addr: "Sommarstuga, Värmdö", cost: 245000, rot: 48900, img: "foto-tak-2023" },
    { y: 2021, n: "Altan & uterum", addr: "Sommarstuga, Värmdö", cost: 167000, rot: 35200, img: "foto-altan-2021" },
  ],
  rotTotal: 148300,
  rotYear: 50000,
  totalInvested: 739000,
};

// ─── Shared chrome ──────────────────────────────────────────────────
function HoHeader({ active = "Hem" }) {
  return (
    <header style={{ height:52, borderBottom:"1px solid var(--hairline)", background:"var(--surface)", display:"flex", alignItems:"center", padding:"0 24px", gap:24 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <div style={{ width:22, height:22, borderRadius:5, background:"var(--accent-ink)", color:"var(--bg)", display:"grid", placeItems:"center", fontSize:11, fontWeight:700, fontFamily:'"Fraunces", serif', letterSpacing:"-0.04em" }}>Rf</div>
        <span className="font-display" style={{ fontSize:18, fontWeight:500, letterSpacing:"-0.03em" }}>Renofine</span>
      </div>
      <nav style={{ display:"flex", alignItems:"center", gap:2 }}>
        {["Hem","Mina adresser","Hitta proffs","Tips"].map((l,i)=>(
          <button key={l} style={{ padding:"6px 11px", fontSize:13, borderRadius:6, background:l===active?"var(--surface-2)":"transparent", border:"1px solid transparent", color:l===active?"var(--fg)":"var(--fg-muted)", fontWeight:l===active?500:400, cursor:"pointer" }}>{l}</button>
        ))}
      </nav>
      <div style={{ flex:1 }}/>
      <button className="rf-btn rf-btn-ghost" style={{ padding:7 }}><Ico d={icons.bell} size={15}/></button>
      <div style={{ width:30, height:30, borderRadius:"50%", background:"oklch(55% 0.12 75)", color:"var(--bg)", display:"grid", placeItems:"center", fontSize:12, fontWeight:600 }}>{HO_DATA.user.initials}</div>
    </header>
  );
}

function Kicker({ children, c }) {
  return <div className="mono" style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.1em", color:c||"var(--fg-subtle)", marginBottom:10 }}>{children}</div>;
}

// ─── A. EMPTY STATE — onboarding ───────────────────────────────────
function HoEmpty() {
  return (
    <div style={{ background:"var(--bg)", minHeight:"100%" }}>
      <HoHeader/>
      <main style={{ maxWidth:980, margin:"0 auto", padding:"60px 40px 80px" }}>
        <Kicker>Välkommen, Elin · Inga projekt ännu</Kicker>
        <h1 className="font-display" style={{ fontSize:54, fontWeight:400, letterSpacing:"-0.028em", margin:0, lineHeight:1.02, maxWidth:780 }}>
          Renoveringen blir <em style={{ fontStyle:"italic", color:"var(--primary)" }}>din historia</em> — vi håller koll på <span className="tnum">tider</span>, <span className="tnum">pengar</span> och <span className="tnum">ROT</span>.
        </h1>
        <p style={{ fontSize:16, color:"var(--fg-muted)", marginTop:18, maxWidth:620, lineHeight:1.55 }}>
          Lägg till din första adress eller starta direkt med projektet du vill göra. När entreprenören är ansluten flyter alla beslut, foton och fakturor in på ett ställe.
        </p>

        {/* Three start paths — equal weight */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:14, marginTop:40 }}>
          {[
            { i:"home", k:"01 · Steg-för-steg", t:"Lägg till en adress", s:"Börja med var du bor. Bra om du planerar flera projekt över tid.", primary:true },
            { i:"sparkle", k:"02 · Snabbast", t:"Beskriv din renovering", s:"Skriv ett par meningar — vi förbereder beslutspunkter, ROT-kalkyl och offertmall.", purple:true },
            { i:"chat", k:"03 · Har du en offert?", t:"Bjud in din entreprenör", s:"Skicka en länk så de fyller i projektet åt dig.", ghost:true },
          ].map((o,i)=>(
            <button key={i} className="rf-card" style={{ padding:24, textAlign:"left", cursor:"pointer", border:"1px solid var(--hairline)", background:o.primary?"var(--accent-ink)":o.purple?"color-mix(in oklab, oklch(60% 0.18 305) 6%, var(--surface))":"var(--surface)", color:o.primary?"var(--bg)":"var(--fg)", display:"flex", flexDirection:"column", gap:14, minHeight:200 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div style={{ width:36, height:36, borderRadius:8, background:o.primary?"oklch(35% 0.01 260)":o.purple?"color-mix(in oklab, oklch(60% 0.18 305) 18%, transparent)":"var(--surface-2)", display:"grid", placeItems:"center", color:o.primary?"var(--bg)":o.purple?"oklch(50% 0.2 305)":"var(--fg-muted)" }}>
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

        {/* What you'll see — empty state preview strip */}
        <section style={{ marginTop:72, paddingTop:48, borderTop:"1px solid var(--hairline)" }}>
          <Kicker>När du är igång ser du</Kicker>
          <h2 className="font-display" style={{ fontSize:28, fontWeight:400, letterSpacing:"-0.02em", margin:"4px 0 28px" }}>Allt på ett ställe — utan att jaga din entreprenör.</h2>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
            {[
              { kicker:"Tidslinje", t:"Vad händer i veckan", body:"Dagliga foton från arbetsplatsen, leveranser, milstolpar." },
              { kicker:"Beslut", t:"Bara det som väntar på dig", body:"Kakelval, materialgodkännanden, ATA-arbeten — utan e-postkedjor." },
              { kicker:"Budget", t:"Pengar i klartext", body:"Betalt, fakturerat, kvar till mål. Inga överraskningar." },
              { kicker:"ROT", t:"Avdraget räknas live", body:"Vi separerar arbete från material så Skatteverket-grejen bara funkar." },
            ].map((c,i)=>(
              <div key={i} className="rf-card" style={{ padding:18, display:"flex", flexDirection:"column", gap:8, minHeight:160 }}>
                <div className="mono" style={{ fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em", color:"var(--fg-subtle)" }}>{c.kicker}</div>
                <div style={{ fontSize:14, fontWeight:500 }}>{c.t}</div>
                <div style={{ fontSize:12.5, color:"var(--fg-muted)", lineHeight:1.5 }}>{c.body}</div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

// ─── B. SINGLE ACTIVE — focused hero on the one project ────────────
function HoSingle() {
  const p = HO_DATA.active;
  const pct = Math.round(p.progress*100);
  return (
    <div style={{ background:"var(--bg)", minHeight:"100%" }}>
      <HoHeader/>
      <main style={{ maxWidth:1180, margin:"0 auto", padding:"40px 40px 60px" }}>
        <div style={{ display:"grid", gridTemplateColumns:"1.3fr 1fr", gap:40, alignItems:"flex-start" }}>
          {/* LEFT — hero project card */}
          <section>
            <Kicker>Pågående · Tor 24 apr</Kicker>
            <h1 className="font-display" style={{ fontSize:46, fontWeight:400, letterSpacing:"-0.026em", margin:0, lineHeight:1.04 }}>
              Ditt badrum är <span className="tnum" style={{ color:"var(--primary)" }}>{pct}%</span> klart.
            </h1>
            <p style={{ fontSize:15, color:"var(--fg-muted)", marginTop:12, maxWidth:540, lineHeight:1.55 }}>
              <strong style={{ color:"var(--fg)" }}>{p.daysLeft} dagar kvar</strong> till {p.until}. {p.pm} på {p.contractor.replace(/ AB$/,"")} jobbar med {p.nextMilestone.toLowerCase()}.
            </p>

            {/* Big visual card with photo + progress timeline */}
            <div className="rf-card" style={{ marginTop:28, overflow:"hidden" }}>
              <div className="img-placeholder" style={{ aspectRatio:"21/9", borderRadius:0, fontSize:11 }}>{p.img}</div>
              <div style={{ padding:20 }}>
                <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:12 }}>
                  <div>
                    <div style={{ fontSize:16, fontWeight:500 }}>{p.name}</div>
                    <div className="mono" style={{ fontSize:10.5, color:"var(--fg-subtle)", textTransform:"uppercase", letterSpacing:"0.06em", marginTop:3 }}>{p.addr} · {p.type}</div>
                  </div>
                  <button className="rf-btn rf-btn-primary">Öppna projekt<Ico d={icons.arrowRight} size={12}/></button>
                </div>

                {/* Progress timeline */}
                <div style={{ marginTop:22 }}>
                  <div style={{ height:8, background:"var(--surface-2)", borderRadius:4, position:"relative", overflow:"hidden" }}>
                    <div style={{ width:`${pct}%`, height:"100%", background:"var(--primary)" }}/>
                    <div style={{ position:"absolute", left:`${pct}%`, top:-3, bottom:-3, width:2, background:"var(--accent-ink)" }}/>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", marginTop:14, gap:8 }}>
                    {[
                      { d:"Rivning", o:1 },
                      { d:"VVS", o:1 },
                      { d:"Tätskikt", o:0, current:true },
                      { d:"Kakel", o:0 },
                      { d:"Slut­besiktning", o:0 },
                    ].map((m,i)=>(
                      <div key={i} style={{ borderTop:`2px solid ${m.o?"var(--primary)":m.current?"var(--warn)":"var(--hairline)"}`, paddingTop:8 }}>
                        <div className="mono" style={{ fontSize:9.5, textTransform:"uppercase", letterSpacing:"0.06em", color:m.current?"var(--warn)":m.o?"var(--primary)":"var(--fg-subtle)", marginBottom:3 }}>{m.current?"Pågår nu":m.o?"Klar":"Kommande"}</div>
                        <div style={{ fontSize:13, fontWeight:500 }}>{m.d}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Decisions waiting — moved here as the second-most-important block */}
            <div style={{ marginTop:32 }}>
              <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:14 }}>
                <Kicker>Du ska bestämma</Kicker>
                <span className="mono" style={{ fontSize:11, color:"var(--fg-subtle)" }}>{p.decisions} öppna</span>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {[
                  { kicker:"Materialval · 2 dagar kvar", title:"Kakel · golv badrum", body:"Markus har lämnat tre alternativ. Bestäm senast 26 apr — påverkar leveranstiden.", urgent:true },
                  { kicker:"Inköp att godkänna", title:"Tätskikt-system · Schönox · 8 200 kr", body:"ROT-grundande arbete: 3 800 kr.", urgent:false },
                ].map((d,i)=>(
                  <div key={i} className="rf-card" style={{ padding:"14px 18px", borderLeft:d.urgent?"3px solid var(--warn)":"3px solid var(--primary)" }}>
                    <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:14 }}>
                      <div style={{ flex:1 }}>
                        <div className="mono" style={{ fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em", color:d.urgent?"var(--warn)":"var(--fg-subtle)", marginBottom:4 }}>{d.kicker}</div>
                        <div style={{ fontSize:14, fontWeight:500 }}>{d.title}</div>
                        <div style={{ fontSize:12.5, color:"var(--fg-muted)", marginTop:4, lineHeight:1.5 }}>{d.body}</div>
                      </div>
                      <button className="rf-btn rf-btn-primary" style={{ fontSize:12, flexShrink:0 }}>Granska</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* RIGHT — money + ROT + next steps */}
          <aside style={{ display:"flex", flexDirection:"column", gap:18, position:"sticky", top:24 }}>
            {/* Money card */}
            <div className="rf-card" style={{ padding:20 }}>
              <div className="mono" style={{ fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em", color:"var(--fg-subtle)" }}>Din budget</div>
              <div style={{ display:"flex", alignItems:"baseline", gap:6, marginTop:6 }}>
                <span className="font-display tnum" style={{ fontSize:32, fontWeight:400, letterSpacing:"-0.022em", lineHeight:1 }}>{(p.paid/1000).toFixed(0)}</span>
                <span className="mono" style={{ fontSize:12, color:"var(--fg-subtle)" }}>tkr betalt av {(p.target/1000).toFixed(0)} tkr</span>
              </div>
              <div style={{ height:6, background:"var(--surface-2)", borderRadius:3, marginTop:10, position:"relative" }}>
                <div style={{ width:`${(p.paid/p.target)*100}%`, height:"100%", background:"var(--primary)", borderRadius:3 }}/>
                <div style={{ position:"absolute", left:0, top:0, width:`${(p.invoiced/p.target)*100}%`, height:"100%", border:"1px dashed var(--primary)", borderLeft:"none", borderRadius:"0 3px 3px 0", opacity:0.5 }}/>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"var(--fg-muted)", marginTop:6 }}>
                <span>Betalat <span className="tnum">{(p.paid/1000).toFixed(0)}</span></span>
                <span>Fakturerat <span className="tnum">{(p.invoiced/1000).toFixed(0)}</span></span>
                <span>Mål <span className="tnum">{(p.target/1000).toFixed(0)}</span></span>
              </div>
            </div>

            {/* ROT card */}
            <div className="rf-card" style={{ padding:20 }}>
              <div className="mono" style={{ fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em", color:"var(--fg-subtle)" }}>ROT 2026 · kvar att utnyttja</div>
              <div style={{ display:"flex", alignItems:"baseline", gap:6, marginTop:6 }}>
                <span className="font-display tnum" style={{ fontSize:32, fontWeight:400, letterSpacing:"-0.022em", lineHeight:1, color:"var(--primary)" }}>20 100</span>
                <span className="mono" style={{ fontSize:12, color:"var(--fg-subtle)" }}>kr av 50 000 kr</span>
              </div>
              <div style={{ display:"flex", gap:1, marginTop:12, height:8, borderRadius:3, overflow:"hidden", background:"var(--surface-2)" }}>
                <div style={{ flex:17600, background:"var(--primary)" }}/>
                <div style={{ flex:8200, background:"var(--primary)", opacity:0.55 }}/>
                <div style={{ flex:4100, background:"var(--primary)", opacity:0.25 }}/>
                <div style={{ flex:20100, background:"transparent" }}/>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginTop:10, fontSize:11 }}>
                {[
                  { c:"var(--primary)", o:1, l:"utbetalt", v:"17 600" },
                  { c:"var(--primary)", o:0.55, l:"inväntar", v:"8 200" },
                  { c:"var(--primary)", o:0.25, l:"på offert", v:"4 100" },
                  { c:"transparent", o:1, l:"fritt", v:"20 100", border:true },
                ].map((r,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:5 }}>
                    <span style={{ width:8, height:8, background:r.c, opacity:r.o, borderRadius:2, border:r.border?"1px solid var(--hairline)":"none" }}/>
                    <span className="mono tnum">{r.v}</span>
                    <span style={{ color:"var(--fg-subtle)" }}>{r.l}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Contractor */}
            <div className="rf-card" style={{ padding:18 }}>
              <Kicker>Din entreprenör</Kicker>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginTop:6 }}>
                <div style={{ width:42, height:42, borderRadius:"50%", background:"var(--surface-2)", display:"grid", placeItems:"center", fontSize:14, fontWeight:600 }}>BM</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13.5, fontWeight:500, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{p.contractor}</div>
                  <div style={{ fontSize:11.5, color:"var(--fg-muted)", marginTop:2 }}>{p.pm}</div>
                </div>
              </div>
              <div style={{ display:"flex", gap:6, marginTop:14 }}>
                <button className="rf-btn rf-btn-ghost" style={{ flex:1, fontSize:12, justifyContent:"center" }}><Ico d={icons.chat} size={12}/>Chatta</button>
                <button className="rf-btn rf-btn-ghost" style={{ flex:1, fontSize:12, justifyContent:"center" }}>Ring</button>
              </div>
            </div>

            {/* Tip card */}
            <div style={{ padding:"16px 18px", background:"color-mix(in oklab, var(--primary) 6%, transparent)", border:"1px solid color-mix(in oklab, var(--primary) 25%, transparent)", borderRadius:8 }}>
              <div className="mono" style={{ fontSize:9.5, textTransform:"uppercase", letterSpacing:"0.08em", color:"var(--primary)" }}>Tips · ROT</div>
              <div style={{ fontSize:13, marginTop:6, lineHeight:1.5 }}>Du har 20 100 kr ROT-utrymme kvar i år. Att tidigarelägga målningsarbete före årsskiftet kan löna sig.</div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

// ─── C. MULTI — gallery view, active first, history below ──────────
function HoMulti() {
  const a = HO_DATA.active;
  return (
    <div style={{ background:"var(--bg)", minHeight:"100%" }}>
      <HoHeader/>
      <main style={{ maxWidth:1240, margin:"0 auto", padding:"36px 40px 80px" }}>
        {/* Hero strip */}
        <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", gap:32, paddingBottom:24, borderBottom:"1px solid var(--hairline)" }}>
          <div>
            <Kicker>Tor 24 apr · sedan 2019</Kicker>
            <h1 className="font-display" style={{ fontSize:42, fontWeight:400, letterSpacing:"-0.026em", margin:0, lineHeight:1.05, maxWidth:680 }}>
              Du har investerat <span className="tnum">739 tkr</span> i dina hem och fått tillbaka <span className="tnum" style={{ color:"var(--primary)" }}>148 tkr</span> i ROT.
            </h1>
          </div>
          <button className="rf-btn rf-btn-primary"><Ico d={icons.plus} size={14}/>Planera ny renovering</button>
        </div>

        {/* Stat strip */}
        <div className="rf-card" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", margin:"24px 0 36px", overflow:"hidden" }}>
          {[
            { l:"Pågående", v:"1", s:"badrum · Linnégatan" },
            { l:"Avslutade", v:"3", s:"sedan 2021" },
            { l:"ROT 2026 kvar", v:"20 100", u:"kr", s:"av 50 000 kr" },
            { l:"Totalt investerat", v:"739", u:"tkr", s:"över alla år" },
          ].map((s,i)=>(
            <div key={i} style={{ padding:"18px 22px", borderRight:i<3?"1px solid var(--hairline)":"none" }}>
              <div className="mono" style={{ fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em", color:"var(--fg-subtle)", marginBottom:8 }}>{s.l}</div>
              <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                <span className="font-display tnum" style={{ fontSize:28, fontWeight:400, letterSpacing:"-0.022em", lineHeight:1 }}>{s.v}</span>
                {s.u && <span className="mono" style={{ fontSize:12, color:"var(--fg-subtle)" }}>{s.u}</span>}
              </div>
              <div style={{ fontSize:12, color:"var(--fg-muted)", marginTop:6 }}>{s.s}</div>
            </div>
          ))}
        </div>

        {/* Active project — wide card */}
        <section style={{ marginBottom:48 }}>
          <Kicker>Pågående</Kicker>
          <div className="rf-card" style={{ display:"grid", gridTemplateColumns:"320px 1fr", overflow:"hidden", marginTop:8, borderLeft:"3px solid var(--primary)" }}>
            <div className="img-placeholder" style={{ borderRadius:0, fontSize:10 }}>{a.img}</div>
            <div style={{ padding:24, display:"flex", flexDirection:"column", justifyContent:"space-between" }}>
              <div>
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:16 }}>
                  <div>
                    <h2 className="font-display" style={{ fontSize:26, fontWeight:400, margin:0, letterSpacing:"-0.02em" }}>{a.name}</h2>
                    <div className="mono" style={{ fontSize:11, color:"var(--fg-subtle)", textTransform:"uppercase", letterSpacing:"0.06em", marginTop:5 }}>{a.addr} · {a.type}</div>
                  </div>
                  <span className="rf-chip chip-primary">38% · {a.daysLeft} dagar kvar</span>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:24, marginTop:22 }}>
                  <div>
                    <div className="mono" style={{ fontSize:9.5, textTransform:"uppercase", letterSpacing:"0.08em", color:"var(--fg-subtle)" }}>Beslut väntar</div>
                    <div className="font-display tnum" style={{ fontSize:22, fontWeight:400, letterSpacing:"-0.018em", marginTop:2, color:"var(--warn)" }}>{a.decisions}</div>
                  </div>
                  <div>
                    <div className="mono" style={{ fontSize:9.5, textTransform:"uppercase", letterSpacing:"0.08em", color:"var(--fg-subtle)" }}>Betalt</div>
                    <div className="font-display tnum" style={{ fontSize:22, fontWeight:400, letterSpacing:"-0.018em", marginTop:2 }}>{(a.paid/1000).toFixed(0)} tkr</div>
                    <div style={{ fontSize:11, color:"var(--fg-subtle)" }}>av {(a.target/1000).toFixed(0)} tkr</div>
                  </div>
                  <div>
                    <div className="mono" style={{ fontSize:9.5, textTransform:"uppercase", letterSpacing:"0.08em", color:"var(--fg-subtle)" }}>ROT på detta projekt</div>
                    <div className="font-display tnum" style={{ fontSize:22, fontWeight:400, letterSpacing:"-0.018em", marginTop:2, color:"var(--primary)" }}>29 900</div>
                    <div style={{ fontSize:11, color:"var(--fg-subtle)" }}>av {(a.rotMax/1000).toFixed(0)} tkr</div>
                  </div>
                </div>
              </div>
              <div style={{ display:"flex", gap:8, marginTop:20, paddingTop:18, borderTop:"1px solid var(--hairline)" }}>
                <button className="rf-btn rf-btn-primary" style={{ fontSize:13 }}>Öppna projekt<Ico d={icons.arrowRight} size={12}/></button>
                <button className="rf-btn rf-btn-ghost" style={{ fontSize:12 }}><Ico d={icons.chat} size={12}/>Chatta med Markus</button>
                <button className="rf-btn rf-btn-ghost" style={{ fontSize:12, marginLeft:"auto" }}>Granska 2 beslut</button>
              </div>
            </div>
          </div>
        </section>

        {/* Past projects — gallery */}
        <section>
          <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:14 }}>
            <div>
              <Kicker>Avslutade · sorterade efter år</Kicker>
              <h2 className="font-display" style={{ fontSize:26, fontWeight:400, margin:0, letterSpacing:"-0.02em" }}>Din renoveringshistorik</h2>
            </div>
            <div style={{ display:"flex", gap:6 }}>
              {["Alla","2024","2023","2021"].map((s,i)=>(
                <button key={s} className="rf-btn rf-btn-ghost" style={{ fontSize:11.5, padding:"5px 10px", background:i===0?"var(--surface-2)":"transparent", borderColor:i===0?"var(--hairline)":"transparent", color:i===0?"var(--fg)":"var(--fg-muted)" }}>{s}</button>
              ))}
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
            {HO_DATA.past.map((p,i)=>(
              <div key={i} className="rf-card" style={{ overflow:"hidden", display:"flex", flexDirection:"column", cursor:"pointer" }}>
                <div className="img-placeholder" style={{ aspectRatio:"4/3", position:"relative", borderRadius:0, fontSize:10 }}>
                  {p.img}
                  <div style={{ position:"absolute", top:10, left:10, background:"oklch(15% 0.01 260 / 0.75)", color:"var(--bg)", padding:"3px 8px", borderRadius:4, fontFamily:'"JetBrains Mono", monospace', fontSize:10, letterSpacing:"0.04em" }}>{p.y}</div>
                </div>
                <div style={{ padding:16 }}>
                  <div style={{ fontSize:14, fontWeight:500 }}>{p.n}</div>
                  <div className="mono" style={{ fontSize:10.5, color:"var(--fg-subtle)", marginTop:3, textTransform:"uppercase", letterSpacing:"0.06em" }}>{p.addr}</div>
                  <div style={{ display:"flex", justifyContent:"space-between", marginTop:14, paddingTop:12, borderTop:"1px solid var(--hairline)" }}>
                    <div>
                      <div className="mono" style={{ fontSize:9.5, color:"var(--fg-subtle)", textTransform:"uppercase", letterSpacing:"0.06em" }}>Kostnad</div>
                      <div className="mono tnum" style={{ fontSize:13, fontWeight:500, marginTop:2 }}>{(p.cost/1000).toFixed(0)} tkr</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div className="mono" style={{ fontSize:9.5, color:"var(--fg-subtle)", textTransform:"uppercase", letterSpacing:"0.06em" }}>ROT</div>
                      <div className="mono tnum" style={{ fontSize:13, fontWeight:500, marginTop:2, color:"var(--primary)" }}>+{(p.rot/1000).toFixed(0)} tkr</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop:32, padding:"18px 22px", background:"var(--surface)", border:"1px solid var(--hairline)", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"space-between", gap:16 }}>
            <div>
              <div className="mono" style={{ fontSize:10, color:"var(--fg-subtle)", textTransform:"uppercase", letterSpacing:"0.08em" }}>Försäljning?</div>
              <div style={{ fontSize:14, fontWeight:500, marginTop:3 }}>Exportera renoveringsmappen som PDF för mäklaren</div>
              <div style={{ fontSize:12, color:"var(--fg-muted)", marginTop:3 }}>Foton, fakturor, garantier — sammanställt i ett dokument.</div>
            </div>
            <button className="rf-btn rf-btn-ghost" style={{ fontSize:12 }}><Ico d={icons.download} size={12}/>Skapa export</button>
          </div>
        </section>
      </main>
    </div>
  );
}

window.HoEmpty = HoEmpty;
window.HoSingle = HoSingle;
window.HoMulti = HoMulti;
