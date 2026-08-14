/* global React, Ico, icons */
const { useState: useS_l } = React;

// =================================================================
// Public landing page v2 — builder-first, homeowner-as-distribution
// =================================================================

// ─── Shared atoms ─────────────────────────────────────────────────
function Pill({ children, tone="ink" }) {
  const tones = {
    ink: { bg:"oklch(22% 0.01 260)", fg:"oklch(98% 0.002 85)" },
    primary: { bg:"color-mix(in oklab, var(--primary) 15%, transparent)", fg:"var(--primary)" },
    paper: { bg:"var(--surface-2)", fg:"var(--fg)" },
  };
  const c = tones[tone];
  return <span className="mono" style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"4px 10px", borderRadius:999, background:c.bg, color:c.fg, fontSize:11, fontWeight:500, letterSpacing:"0.04em", textTransform:"uppercase" }}>{children}</span>;
}

function Logo({ inverted=false }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <div style={{ width:24, height:24, borderRadius:5, background:inverted?"var(--bg)":"var(--accent-ink)", color:inverted?"var(--accent-ink)":"var(--bg)", display:"grid", placeItems:"center", fontSize:13, fontWeight:700, letterSpacing:"-0.04em" }}>R</div>
      <span className="font-display" style={{ fontSize:18, fontWeight:500, letterSpacing:"-0.03em", color:inverted?"var(--bg)":"var(--fg)" }}>Renofine</span>
    </div>
  );
}

// Reusable: framed product screenshot with browser-style chrome.
function Shot({ src, alt, ratio="4/3", radius=12, chrome=true, fit="cover", children }) {
  return (
    <div style={{ position:"relative" }}>
      <div style={{ aspectRatio:ratio, borderRadius:radius, overflow:"hidden", border:"1px solid var(--hairline)", background:"var(--surface)", boxShadow:"var(--shadow-md)" }}>
        {chrome && (
          <div style={{ height:28, padding:"0 12px", display:"flex", alignItems:"center", gap:6, borderBottom:"1px solid var(--hairline)", background:"var(--bg-sunken)" }}>
            <span style={{ width:10, height:10, borderRadius:"50%", background:"oklch(78% 0.12 30)" }}/>
            <span style={{ width:10, height:10, borderRadius:"50%", background:"oklch(85% 0.13 90)" }}/>
            <span style={{ width:10, height:10, borderRadius:"50%", background:"oklch(75% 0.12 145)" }}/>
            <span className="mono" style={{ marginLeft:"auto", fontSize:9, color:"var(--fg-subtle)", letterSpacing:"0.05em" }}>renofine.com / projekt</span>
          </div>
        )}
        {src ? (
          <img src={src} alt={alt||""} style={{ display:"block", width:"100%", height: chrome ? "calc(100% - 28px)" : "100%", objectFit:fit, objectPosition:"top left" }}/>
        ) : (
          <div className="img-placeholder" style={{ width:"100%", height: chrome ? "calc(100% - 28px)" : "100%", border:"none", borderRadius:0, fontSize:11 }}>{alt||"sk\u00e4rmbild"}</div>
        )}
      </div>
      {children}
    </div>
  );
}

// Reusable: floating annotation card overlaid on a Shot.
function Anno({ pos="top-right", kicker, children, dx=-20, dy=20 }) {
  const v = pos.split("-");
  const style = { position:"absolute", background:"var(--surface)", border:"1px solid var(--hairline)", borderRadius:8, padding:"8px 12px", fontSize:12, fontWeight:500, boxShadow:"var(--shadow-md)", whiteSpace:"nowrap" };
  if (v[0]==="top") style.top = dy;
  if (v[0]==="bottom") style.bottom = dy;
  if (v[1]==="left") style.left = dx;
  if (v[1]==="right") style.right = dx;
  return (
    <div style={style}>
      {kicker && <div className="mono" style={{ fontSize:9, color:"var(--fg-subtle)", letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:2, fontWeight:500 }}>{kicker}</div>}
      <div>{children}</div>
    </div>
  );
}

function PublicNav({ inverted=false }) {
  const c = inverted ? { fg:"var(--bg)", muted:"oklch(70% 0.005 85)", btn:"var(--bg)", btnFg:"var(--accent-ink)" } : { fg:"var(--fg)", muted:"var(--fg-muted)", btn:"var(--accent-ink)", btnFg:"var(--bg)" };
  return (
    <header style={{ padding:"20px 40px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom: inverted?"1px solid oklch(30% 0.005 260)":"1px solid var(--hairline)" }}>
      <Logo inverted={inverted}/>
      <nav style={{ display:"flex", alignItems:"center", gap:32 }}>
        {["Funktioner","Priser","För hemägare","Kunder"].map(l=>(
          <a key={l} style={{ fontSize:13, color:c.muted, textDecoration:"none", cursor:"pointer", fontWeight:450 }}>{l}</a>
        ))}
        <a style={{ fontSize:13, color:c.fg, textDecoration:"none", cursor:"pointer", fontWeight:500 }}>Logga in</a>
        <button style={{ padding:"8px 16px", borderRadius:6, background:c.btn, color:c.btnFg, fontSize:13, fontWeight:500, border:"none", cursor:"pointer" }}>Prova fritt 14 dagar</button>
      </nav>
    </header>
  );
}

// ─── HERO — Editorial (anti-Excel, lugnt, Fraunces leder) ────────────
function HeroEditorial() {
  return (
    <section style={{ padding:"80px 40px 60px", maxWidth:1280, margin:"0 auto" }}>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:60, alignItems:"center" }}>
        <div>
          <Pill tone="primary">För renoveringsbranschen</Pill>
          <h1 className="font-display" style={{ fontSize:68, fontWeight:300, letterSpacing:"-0.03em", lineHeight:1.02, margin:"24px 0 24px" }}>
            Det enda projekt&shy;kontoret du kommer behöva<span style={{ color:"var(--primary)" }}>.</span>
          </h1>
          <p style={{ fontSize:17, color:"var(--fg-muted)", lineHeight:1.55, maxWidth:480, margin:"0 0 32px" }}>
            Offerter, ROT, tidsplan, inköp och kund­kommunikation — i ett verktyg byggt för dig som faktiskt utför jobbet, inte för Excel-konsulten.
          </p>
          <div style={{ display:"flex", gap:10, alignItems:"center" }}>
            <button style={{ padding:"12px 22px", borderRadius:6, background:"var(--accent-ink)", color:"var(--bg)", fontSize:14, fontWeight:500, border:"none", cursor:"pointer", display:"inline-flex", alignItems:"center", gap:8 }}>
              Prova fritt 14 dagar <Ico d={icons.arrowRight} size={14}/>
            </button>
            <button style={{ padding:"12px 18px", borderRadius:6, background:"transparent", color:"var(--fg)", fontSize:14, fontWeight:500, border:"1px solid var(--hairline)", cursor:"pointer", display:"inline-flex", alignItems:"center", gap:8 }}>
              <Ico d={icons.eye} size={14}/> Se demoprojekt
            </button>
          </div>
          <div style={{ marginTop:32, fontSize:12, color:"var(--fg-subtle)" }}>
            Inga kontokrav · Importera projekt på 2 minuter · Avsluta när du vill
          </div>
        </div>
        {/* Visual */}
        <Shot src="v2/screenshots/timeline.png" alt="Tidsplan · projektöversikt" ratio="4/3" fit="cover">
          <Anno pos="top-right" kicker="ROT 2026" dx={-20} dy={56}>32 400 kr kvar</Anno>
          <Anno pos="bottom-left" kicker="Aktivt" dx={-24} dy={64}>
            <span style={{ fontWeight:500 }}>Kök bänkskivor</span> klart imorgon
          </Anno>
        </Shot>
      </div>
    </section>
  );
}

// ─── HERO — Direct / numbers-first ────────────────────────────────
function HeroDirect() {
  return (
    <section style={{ padding:"60px 40px", maxWidth:1280, margin:"0 auto" }}>
      <div style={{ textAlign:"center", maxWidth:780, margin:"0 auto 56px" }}>
        <Pill tone="ink">142 firmor · 612 avslutade projekt</Pill>
        <h1 className="font-display" style={{ fontSize:64, fontWeight:300, letterSpacing:"-0.03em", lineHeight:1.05, margin:"24px 0 20px" }}>
          8 timmar mindre administration<br/><em style={{ fontStyle:"italic", color:"var(--primary)" }}>per projekt</em>.
        </h1>
        <p style={{ fontSize:17, color:"var(--fg-muted)", lineHeight:1.55, margin:"0 auto 32px" }}>
          Hellre på bygget än framför Excel. Renofine ersätter pappershögen, mejltråden och WhatsApp-gruppen — och betalar sig på första projektet.
        </p>
        <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
          <button style={{ padding:"12px 22px", borderRadius:6, background:"var(--accent-ink)", color:"var(--bg)", fontSize:14, fontWeight:500, border:"none", cursor:"pointer", display:"inline-flex", alignItems:"center", gap:8 }}>
            Prova fritt 14 dagar <Ico d={icons.arrowRight} size={14}/>
          </button>
          <button style={{ padding:"12px 18px", borderRadius:6, background:"transparent", color:"var(--fg)", fontSize:14, fontWeight:500, border:"1px solid var(--hairline)", cursor:"pointer", display:"inline-flex", alignItems:"center", gap:8 }}>
            <Ico d={icons.eye} size={14}/> Se demo (90 sek)
          </button>
        </div>
      </div>
      {/* Big product screenshot */}
      <div className="img-placeholder" style={{ aspectRatio:"16/9", borderRadius:14, fontSize:12, position:"relative" }}>
        skärmbild · byggar-dashboard
        {/* annotations */}
        <div style={{ position:"absolute", top:24, left:24, background:"var(--surface)", border:"1px solid var(--hairline)", borderRadius:8, padding:"10px 14px", fontSize:13, boxShadow:"var(--shadow-md)" }}>
          <div className="mono" style={{ fontSize:9, color:"var(--fg-subtle)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4 }}>Pipeline</div>
          <div className="font-display tnum" style={{ fontSize:24, fontWeight:400, letterSpacing:"-0.02em" }}>9.1 Mkr</div>
        </div>
      </div>
    </section>
  );
}

// ─── HERO — Showcase / product-first ────────────────────────────────
function HeroShowcase() {
  return (
    <section style={{ padding:"60px 40px 0", maxWidth:1280, margin:"0 auto" }}>
      <div style={{ textAlign:"center", maxWidth:720, margin:"0 auto 40px" }}>
        <Pill tone="primary">Renofine för byggare</Pill>
        <h1 className="font-display" style={{ fontSize:56, fontWeight:300, letterSpacing:"-0.03em", lineHeight:1.05, margin:"20px 0 16px" }}>
          Ditt projekt&shy;kontor — på riktigt.
        </h1>
        <p style={{ fontSize:16, color:"var(--fg-muted)", lineHeight:1.55, margin:"0 auto 28px", maxWidth:560 }}>
          Allt från offert till slutfaktura. Bjud in din kund kostnadsfritt — de ser progress, godkänner inköp, och får sitt ROT-saldo i realtid.
        </p>
        <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
          <button style={{ padding:"12px 22px", borderRadius:6, background:"var(--primary)", color:"var(--bg)", fontSize:14, fontWeight:500, border:"none", cursor:"pointer", display:"inline-flex", alignItems:"center", gap:8 }}>
            Boka demo <Ico d={icons.arrowRight} size={14}/>
          </button>
          <button style={{ padding:"12px 18px", borderRadius:6, background:"var(--surface)", color:"var(--fg)", fontSize:14, fontWeight:500, border:"1px solid var(--hairline)", cursor:"pointer" }}>
            Prova själv →
          </button>
        </div>
      </div>
      {/* Product showcase — scaled, leaning into the screenshot */}
      <div style={{ position:"relative", maxWidth:1100, margin:"0 auto" }}>
        <div className="img-placeholder" style={{ aspectRatio:"16/10", borderRadius:"14px 14px 0 0", fontSize:13, borderBottom:"none" }}>
          skärmbild · komplett app
        </div>
        <div style={{ position:"absolute", inset:"-20px -40px auto -40px", height:60, background:"radial-gradient(ellipse at top, color-mix(in oklab, var(--primary) 15%, transparent), transparent 70%)", zIndex:-1 }}/>
      </div>
    </section>
  );
}

// ─── Logo strip / social proof ─────────────────────────────────────
function LogoStrip() {
  return (
    <section style={{ padding:"40px 40px", borderTop:"1px solid var(--hairline)", borderBottom:"1px solid var(--hairline)", background:"var(--bg-sunken)" }}>
      <div style={{ maxWidth:1280, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", gap:40 }}>
        <span className="mono" style={{ fontSize:11, color:"var(--fg-subtle)", textTransform:"uppercase", letterSpacing:"0.1em", flexShrink:0 }}>142 firmor använder Renofine dagligen</span>
        <div style={{ display:"flex", gap:48, alignItems:"center", flex:1, justifyContent:"flex-end", flexWrap:"wrap" }}>
          {["Holmberg Bygg","Skanlund AB","Wallin & Söner","BoBygg Stockholm","Andersson Renoverar","Mälar Bygg"].map((n,i)=>(
            <span key={n} className="font-display" style={{ fontSize:15, color:"var(--fg-muted)", fontWeight:500, letterSpacing:"-0.01em" }}>{n}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Stats band ────────────────────────────────────────────────────
function StatsBand() {
  return (
    <section style={{ padding:"56px 40px", borderBottom:"1px solid var(--hairline)" }}>
      <div style={{ maxWidth:1280, margin:"0 auto", display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:60 }}>
        {[
          { v:"12 h", l:"Mindre admin per projekt", s:"Genomsnitt över 1240 projekt" },
          { v:"96%", l:"Snabbare ROT-hantering", s:"Mot manuell process" },
          { v:"32 min", l:"Att skicka första offerten", s:"Från registrering till skickad" },
          { v:"4.8/5", l:"Hur byggare betygsätter Renofine", s:"Trustpilot · 89 omdömen" },
        ].map((s,i)=>(
          <div key={i}>
            <div className="font-display tnum" style={{ fontSize:42, fontWeight:300, letterSpacing:"-0.025em", lineHeight:1 }}>{s.v}</div>
            <div style={{ fontSize:14, fontWeight:500, marginTop:10, letterSpacing:"-0.005em" }}>{s.l}</div>
            <div style={{ fontSize:12, color:"var(--fg-subtle)", marginTop:4 }}>{s.s}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Builder feature deep-dive ─────────────────────────────────────
function BuilderFeatures() {
  const items = [
    { kicker:"Offert & avtal", title:"Skicka offert på 10 min", desc:"AI-mall som lär sig din prissättning. ROT-uppgifter förifyllda. Kund signerar digitalt.", src:null, img:"offert-vy (kommer snart)" },
    { kicker:"Tidsplan", title:"Schema som faktiskt hänger med", desc:"Drag-and-drop Gantt med leverantörsspår, väderprognos och beroenden. Ingen omarbetning vid förseningar.", src:"v2/screenshots/timeline.png", img:"tidsplan-vy" },
    { kicker:"Inköp & ROT", title:"En kassabok för bygget", desc:"Dra-och-släpp kvitton, automatisk ROT-fördelning, kund-godkännanden i appen. Slutet på Excel-trasslet.", src:"v2/screenshots/budget.png", img:"inköp-vy" },
    { kicker:"Kundvy", title:"Bjud in kunden — kostnadsfritt", desc:"Din kund får en egen, snygg vy. Ser progress, godkänner inköp, ser ROT-saldo. De gillar dig mer.", src:null, img:"kundvy mobil (kommer snart)" },
  ];
  return (
    <section style={{ padding:"80px 40px" }}>
      <div style={{ maxWidth:1280, margin:"0 auto" }}>
        <div style={{ marginBottom:48, maxWidth:680 }}>
          <Pill tone="primary">Funktioner</Pill>
          <h2 className="font-display" style={{ fontSize:42, fontWeight:300, letterSpacing:"-0.025em", margin:"16px 0 12px", lineHeight:1.1 }}>
            Allt från första kundkontakt till slutbesiktning.
          </h2>
          <p style={{ fontSize:15, color:"var(--fg-muted)", lineHeight:1.55, margin:0 }}>
            Inte ett verktyg som "stödjer" ditt arbete. Verktyget som <em>är</em> ditt arbete.
          </p>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:40 }}>
          {items.map((f,i)=>(
            <div key={i} style={{ display:"grid", gridTemplateColumns:i%2===0?"1fr 1.4fr":"1.4fr 1fr", gap:48, alignItems:"center" }}>
              <div style={{ order: i%2===0 ? 1 : 2 }}>
                <div className="mono" style={{ fontSize:10, color:"var(--fg-subtle)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>{f.kicker}</div>
                <h3 className="font-display" style={{ fontSize:30, fontWeight:400, margin:"0 0 12px", letterSpacing:"-0.02em", lineHeight:1.15 }}>{f.title}</h3>
                <p style={{ fontSize:15, color:"var(--fg-muted)", lineHeight:1.6, margin:"0 0 16px" }}>{f.desc}</p>
                <a style={{ fontSize:13, color:"var(--primary)", fontWeight:500, display:"inline-flex", alignItems:"center", gap:6, cursor:"pointer" }}>Läs mer <Ico d={icons.arrowRight} size={13}/></a>
              </div>
              <div style={{ order: i%2===0 ? 2 : 1 }}>
                <Shot src={f.src} alt={f.img} ratio="4/3" chrome={true} fit="cover"/>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Homeowner side — designed as feature, not as parallel funnel ───
function HomeownerAsFeature() {
  return (
    <section style={{ padding:"80px 40px", background:"var(--bg-sunken)", borderTop:"1px solid var(--hairline)", borderBottom:"1px solid var(--hairline)" }}>
      <div style={{ maxWidth:1280, margin:"0 auto", display:"grid", gridTemplateColumns:"1fr 1fr", gap:60, alignItems:"center" }}>
        <div>
          <Pill tone="paper">För hemägaren</Pill>
          <h2 className="font-display" style={{ fontSize:38, fontWeight:300, letterSpacing:"-0.025em", margin:"16px 0 16px", lineHeight:1.1 }}>
            Din kund får en egen vy. Det är där du vinner nästa kund.
          </h2>
          <p style={{ fontSize:15, color:"var(--fg-muted)", lineHeight:1.6, margin:"0 0 20px" }}>
            När du bjuder in din kund till Renofine får de något ingen byggare i Sverige har gett dem förut: <strong style={{ color:"var(--fg)" }}>insyn utan att störa dig</strong>.
          </p>
          <ul style={{ listStyle:"none", padding:0, margin:0, display:"flex", flexDirection:"column", gap:14 }}>
            {[
              ["Realtids-progress","Ser exakt hur långt bygget har kommit, utan att ringa dig"],
              ["ROT-saldo i realtid","Hur mycket av årets 50 000 kr som kvarstår — alltid synkat"],
              ["Inköp-godkännanden","Ett knapptryck istället för långa mejltrådar"],
              ["Säljvärde-dokumentation","Renoveringshistorik per adress, perfekt vid framtida försäljning"],
            ].map(([t,d],i)=>(
              <li key={i} style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                <div style={{ width:22, height:22, borderRadius:11, background:"var(--primary)", color:"var(--bg)", display:"grid", placeItems:"center", flexShrink:0, marginTop:1 }}>
                  <Ico d={icons.check} size={12}/>
                </div>
                <div>
                  <div style={{ fontSize:14, fontWeight:500 }}>{t}</div>
                  <div style={{ fontSize:13, color:"var(--fg-muted)", marginTop:2 }}>{d}</div>
                </div>
              </li>
            ))}
          </ul>
          <div style={{ padding:"14px 16px", marginTop:24, background:"var(--surface)", border:"1px solid var(--hairline)", borderRadius:8, fontSize:13, color:"var(--fg-muted)", display:"flex", alignItems:"center", gap:10 }}>
            <Ico d={icons.sparkle} size={14}/>
            <span>Är du hemägare? <a style={{ color:"var(--primary)", fontWeight:500, textDecoration:"underline", textUnderlineOffset:3 }}>Be din byggare bjuda in dig</a> till Renofine.</span>
          </div>
        </div>
        <Shot src={null} alt="kundvy · mobil (kommer snart)" ratio="3/4" chrome={false}/>
      </div>
    </section>
  );
}

// ─── Testimonial ────────────────────────────────────────────────────
function Testimonial() {
  return (
    <section style={{ padding:"100px 40px" }}>
      <div style={{ maxWidth:880, margin:"0 auto", textAlign:"center" }}>
        <div className="mono" style={{ fontSize:11, color:"var(--fg-subtle)", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:24 }}>Kunder · Holmberg Bygg AB</div>
        <blockquote className="font-display" style={{ fontSize:32, fontWeight:300, lineHeight:1.25, letterSpacing:"-0.018em", margin:"0 0 32px", fontStyle:"italic", textWrap:"pretty" }}>
          "Vi gick från 14 timmars administration per projekt till under 2. Det är en löneökning för mina arbetsledare — utan att det kostar mig något."
        </blockquote>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:14 }}>
          <div className="img-placeholder" style={{ width:48, height:48, borderRadius:"50%", fontSize:9 }}>foto</div>
          <div style={{ textAlign:"left" }}>
            <div style={{ fontSize:14, fontWeight:500 }}>Marcus Holmberg</div>
            <div style={{ fontSize:12, color:"var(--fg-muted)" }}>VD · Holmberg Bygg AB · Stockholm</div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Pricing — focused on builders ─────────────────────────────────
function Pricing() {
  return (
    <section style={{ padding:"80px 40px", borderTop:"1px solid var(--hairline)" }}>
      <div style={{ maxWidth:1100, margin:"0 auto" }}>
        <div style={{ textAlign:"center", marginBottom:48 }}>
          <Pill tone="ink">Pris</Pill>
          <h2 className="font-display" style={{ fontSize:42, fontWeight:300, letterSpacing:"-0.025em", margin:"16px 0 8px" }}>Ett pris. Allt inkluderat.</h2>
          <p style={{ fontSize:14, color:"var(--fg-muted)", margin:0 }}>Bjud in obegränsat antal kunder kostnadsfritt. De är din distribution.</p>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1.15fr 1fr", gap:0, border:"1px solid var(--hairline)", borderRadius:14, overflow:"hidden", background:"var(--surface)" }}>
          {[
            { name:"Solo", price:"299", per:"per månad", desc:"För enskilda byggare", limit:"3 aktiva projekt", cta:"Prova fritt", ctaPrim:false },
            { name:"Team", price:"549", per:"per månad", desc:"För mindre firmor (1–5 personer)", limit:"Obegränsat antal projekt", cta:"Prova fritt", ctaPrim:true, badge:"Mest populär" },
            { name:"Större firma", price:"Kontakt", per:"", desc:"För 6+ personer, anpassad onboarding", limit:"Skräddarsydd lösning", cta:"Boka demo", ctaPrim:false },
          ].map((p,i)=>(
            <div key={i} style={{ padding:32, position:"relative", borderRight: i<2?"1px solid var(--hairline)":"none", background: p.ctaPrim?"var(--bg-sunken)":"transparent" }}>
              {p.badge && <div className="mono" style={{ position:"absolute", top:-12, left:32, padding:"3px 10px", fontSize:10, background:"var(--accent-ink)", color:"var(--bg)", textTransform:"uppercase", letterSpacing:"0.08em", borderRadius:4 }}>{p.badge}</div>}
              <div className="mono" style={{ fontSize:10, color:"var(--fg-subtle)", textTransform:"uppercase", letterSpacing:"0.1em" }}>{p.name}</div>
              <div style={{ display:"flex", alignItems:"baseline", gap:6, marginTop:14 }}>
                <span className="font-display tnum" style={{ fontSize:48, fontWeight:300, letterSpacing:"-0.025em", lineHeight:1 }}>{p.price}</span>
                <span style={{ fontSize:14, color:"var(--fg-muted)" }}>{p.per ? "kr" : ""}</span>
              </div>
              <div style={{ fontSize:12, color:"var(--fg-subtle)", marginTop:4 }}>{p.per}</div>
              <div style={{ fontSize:13, color:"var(--fg-muted)", marginTop:12 }}>{p.desc}</div>
              <div className="mono" style={{ fontSize:11, color:"var(--fg-subtle)", marginTop:8 }}>{p.limit}</div>
              <ul style={{ listStyle:"none", padding:0, margin:"24px 0", display:"flex", flexDirection:"column", gap:8, fontSize:13 }}>
                {["Obegränsat antal kunder","Offert + faktura + ROT","Tidsplan & inköp","Mobilapp"].map(f=>(
                  <li key={f} style={{ display:"flex", alignItems:"center", gap:8, color:"var(--fg-muted)" }}>
                    <Ico d={icons.check} size={13} fill="none"/>{f}
                  </li>
                ))}
              </ul>
              <button style={{ width:"100%", padding:"11px 18px", borderRadius:6, background: p.ctaPrim?"var(--accent-ink)":"transparent", color: p.ctaPrim?"var(--bg)":"var(--fg)", fontSize:13, fontWeight:500, border: p.ctaPrim?"none":"1px solid var(--hairline)", cursor:"pointer" }}>{p.cta}</button>
            </div>
          ))}
        </div>
        <div style={{ textAlign:"center", marginTop:24, fontSize:12, color:"var(--fg-subtle)" }}>
          Alla priser exkl. moms · Avsluta när du vill · 30 dagars pengarna-tillbaka-garanti
        </div>
      </div>
    </section>
  );
}

// ─── FAQ ────────────────────────────────────────────────────────────
function FAQ() {
  const [open, setOpen] = useS_l(0);
  const items = [
    { q:"Hur lång är onboarding-tiden?", a:"Mellan 30 minuter och 2 timmar, beroende på hur många pågående projekt du importerar. Vi har en mall för hur projekt struktureras som vi går igenom tillsammans i ett startmöte." },
    { q:"Hanterar Renofine ROT-avdraget korrekt?", a:"Ja. Vi följer Skatteverkets regler för ROT-arbete: 30% av arbetskostnaden, max 50 000 kr per person/år. Saldot uppdateras realtid mot godkända arbeten — du kan visa kunden exakt vad de har kvar." },
    { q:"Får mina kunder också använda appen?", a:"Ja, kostnadsfritt. Bjud in obegränsat antal kunder. De får en egen vy där de ser projektets progress, ROT-saldo, och kan godkänna inköp digitalt. Det är vår starkaste säljpunkt." },
    { q:"Funkar det på byggplats / med dålig täckning?", a:"Ja. Mobilappen funkar offline — synkar när du får täckning igen. All kritisk projektdata (ritningar, kontaktuppgifter, checklistor) finns lokalt på enheten." },
    { q:"Kan jag exportera min data om jag avslutar?", a:"Ja, alltid. Hela projektarkivet exporteras som PDF + Excel. Vi tror att data är ditt, och en försäkring mot lock-in är en försäkring mot dålig produkt." },
  ];
  return (
    <section style={{ padding:"80px 40px", borderTop:"1px solid var(--hairline)" }}>
      <div style={{ maxWidth:760, margin:"0 auto" }}>
        <h2 className="font-display" style={{ fontSize:36, fontWeight:300, letterSpacing:"-0.022em", margin:"0 0 32px", textAlign:"center" }}>Vanliga frågor</h2>
        <div style={{ display:"flex", flexDirection:"column", gap:1, background:"var(--hairline)", border:"1px solid var(--hairline)", borderRadius:10, overflow:"hidden" }}>
          {items.map((it,i)=>(
            <div key={i} style={{ background:"var(--surface)" }}>
              <button onClick={()=>setOpen(open===i?-1:i)} style={{ width:"100%", padding:"18px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", border:"none", background:"transparent", cursor:"pointer", textAlign:"left" }}>
                <span style={{ fontSize:15, fontWeight:500, letterSpacing:"-0.005em" }}>{it.q}</span>
                <Ico d={open===i?icons.chevDown:icons.chevRight} size={14}/>
              </button>
              {open===i && (
                <div style={{ padding:"0 20px 20px", fontSize:14, color:"var(--fg-muted)", lineHeight:1.6 }}>{it.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Final CTA + Footer ─────────────────────────────────────────────
function FinalCTA() {
  return (
    <section style={{ padding:"100px 40px", textAlign:"center", borderTop:"1px solid var(--hairline)", background:"var(--bg-sunken)" }}>
      <div style={{ maxWidth:760, margin:"0 auto" }}>
        <h2 className="font-display" style={{ fontSize:54, fontWeight:300, letterSpacing:"-0.028em", margin:"0 0 18px", lineHeight:1.05 }}>
          Bygg branschens vassaste projektkontor.
        </h2>
        <p style={{ fontSize:16, color:"var(--fg-muted)", margin:"0 0 32px", lineHeight:1.55 }}>
          14 dagars fri provperiod. Inga kontokrav. Importera ditt första projekt på två minuter.
        </p>
        <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
          <button style={{ padding:"14px 26px", borderRadius:6, background:"var(--accent-ink)", color:"var(--bg)", fontSize:14, fontWeight:500, border:"none", cursor:"pointer", display:"inline-flex", alignItems:"center", gap:8 }}>
            Prova fritt 14 dagar <Ico d={icons.arrowRight} size={14}/>
          </button>
          <button style={{ padding:"14px 22px", borderRadius:6, background:"transparent", color:"var(--fg)", fontSize:14, fontWeight:500, border:"1px solid var(--hairline)", cursor:"pointer" }}>
            Boka 15 min demo
          </button>
        </div>
      </div>
    </section>
  );
}

function PublicFooter() {
  return (
    <footer style={{ padding:"40px 40px 32px", borderTop:"1px solid var(--hairline)" }}>
      <div style={{ maxWidth:1280, margin:"0 auto", display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr", gap:40 }}>
        <div>
          <Logo/>
          <p style={{ fontSize:13, color:"var(--fg-muted)", margin:"16px 0 0", maxWidth:280, lineHeight:1.5 }}>Projektkontoret som byggare faktiskt vill använda. Gjort i Stockholm.</p>
        </div>
        {[
          ["Produkt",["Funktioner","Priser","Vad är nytt","Demo"]],
          ["Företag",["Om oss","Kunder","Karriär","Press"]],
          ["Resurser",["Hjälpcenter","Blogg","ROT-guide","API"]],
          ["Juridik",["Villkor","Integritet","GDPR","Säkerhet"]],
        ].map(([title,links])=>(
          <div key={title}>
            <div className="mono" style={{ fontSize:10, color:"var(--fg-subtle)", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:12 }}>{title}</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {links.map(l=> <a key={l} style={{ fontSize:13, color:"var(--fg-muted)", textDecoration:"none", cursor:"pointer" }}>{l}</a>)}
            </div>
          </div>
        ))}
      </div>
      <div style={{ maxWidth:1280, margin:"40px auto 0", paddingTop:24, borderTop:"1px solid var(--hairline)", display:"flex", justifyContent:"space-between", fontSize:11, color:"var(--fg-subtle)" }}>
        <span>© 2026 Renofine AB · Org. 559123-4567</span>
        <span className="mono" style={{ letterSpacing:"0.08em" }}>RENOFINE.COM</span>
      </div>
    </footer>
  );
}

// ─── Composed pages ────────────────────────────────────────────────
window.LandingEditorial = function LandingEditorial() {
  return (
    <div style={{ background:"var(--bg)", minHeight:"100%" }}>
      <PublicNav/>
      <HeroEditorial/>
      <LogoStrip/>
      <StatsBand/>
      <BuilderFeatures/>
      <HomeownerAsFeature/>
      <Testimonial/>
      <Pricing/>
      <FAQ/>
      <FinalCTA/>
      <PublicFooter/>
    </div>
  );
};

window.LandingDirect = function LandingDirect() {
  return (
    <div style={{ background:"var(--bg)", minHeight:"100%" }}>
      <PublicNav/>
      <HeroDirect/>
      <LogoStrip/>
      <BuilderFeatures/>
      <Testimonial/>
      <HomeownerAsFeature/>
      <Pricing/>
      <FAQ/>
      <FinalCTA/>
      <PublicFooter/>
    </div>
  );
};

window.LandingShowcase = function LandingShowcase() {
  return (
    <div style={{ background:"var(--bg)", minHeight:"100%" }}>
      <PublicNav/>
      <HeroShowcase/>
      <LogoStrip/>
      <StatsBand/>
      <BuilderFeatures/>
      <HomeownerAsFeature/>
      <Testimonial/>
      <Pricing/>
      <FAQ/>
      <FinalCTA/>
      <PublicFooter/>
    </div>
  );
};

// ─── Mobile version of winning hero (Editorial-default) ───────────
window.LandingMobile = function LandingMobile() {
  const [open, setOpen] = useS_l(false);
  return (
    <div style={{ background:"var(--bg)", minHeight:"100%", overflow:"hidden", position:"relative" }}>
      {/* Sticky mobile header */}
      <header style={{ position:"sticky", top:0, padding:"14px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"1px solid var(--hairline)", background:"var(--surface)", zIndex:10 }}>
        <Logo/>
        <button onClick={()=>setOpen(!open)} style={{ width:36, height:36, border:"1px solid var(--hairline)", background:"transparent", borderRadius:6, display:"grid", placeItems:"center", cursor:"pointer" }}>
          <Ico d={open ? "M6 6l12 12M6 18L18 6" : "M3 6h18M3 12h18M3 18h18"} size={18}/>
        </button>
      </header>
      {open && (
        <nav style={{ position:"absolute", top:60, left:0, right:0, background:"var(--surface)", borderBottom:"1px solid var(--hairline)", padding:"12px 16px", zIndex:9, display:"flex", flexDirection:"column", gap:0 }}>
          {["Funktioner","Priser","För hemägare","Kunder","Logga in"].map(l=>(
            <a key={l} style={{ padding:"14px 4px", fontSize:15, color:"var(--fg)", textDecoration:"none", borderBottom:"1px solid var(--hairline)" }}>{l}</a>
          ))}
          <button style={{ marginTop:14, padding:"13px 18px", borderRadius:6, background:"var(--accent-ink)", color:"var(--bg)", fontSize:14, fontWeight:500, border:"none", cursor:"pointer", minHeight:44 }}>Prova fritt 14 dagar</button>
        </nav>
      )}

      <main>
        {/* Hero */}
        <section style={{ padding:"32px 20px 28px" }}>
          <Pill tone="primary">För renoveringsbranschen</Pill>
          <h1 className="font-display" style={{ fontSize:36, fontWeight:300, letterSpacing:"-0.025em", lineHeight:1.05, margin:"18px 0 14px" }}>
            Det enda projektkontoret du kommer behöva<span style={{ color:"var(--primary)" }}>.</span>
          </h1>
          <p style={{ fontSize:15, color:"var(--fg-muted)", lineHeight:1.55, margin:"0 0 20px" }}>
            Offerter, ROT, tidsplan, inköp och kund­kommunikation — i ett verktyg byggt för dig som faktiskt utför jobbet.
          </p>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <button style={{ padding:"14px 22px", borderRadius:6, background:"var(--accent-ink)", color:"var(--bg)", fontSize:15, fontWeight:500, border:"none", cursor:"pointer", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:8, minHeight:48 }}>
              Prova fritt 14 dagar <Ico d={icons.arrowRight} size={15}/>
            </button>
            <button style={{ padding:"14px 18px", borderRadius:6, background:"transparent", color:"var(--fg)", fontSize:15, fontWeight:500, border:"1px solid var(--hairline)", cursor:"pointer", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:8, minHeight:48 }}>
              <Ico d={icons.eye} size={14}/> Se demoprojekt
            </button>
          </div>
        </section>

        {/* Hero visual */}
        <section style={{ padding:"0 20px 32px" }}>
          <Shot src="v2/screenshots/timeline.png" alt="tidsplan" ratio="4/3" chrome={true}>
            <Anno pos="top-right" kicker="ROT" dx={14} dy={42}>32 400 kr kvar</Anno>
          </Shot>
        </section>

        {/* Logo strip */}
        <section style={{ padding:"24px 20px", borderTop:"1px solid var(--hairline)", borderBottom:"1px solid var(--hairline)", background:"var(--bg-sunken)" }}>
          <div className="mono" style={{ fontSize:10, color:"var(--fg-subtle)", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:12 }}>142 firmor använder Renofine dagligen</div>
          <div style={{ display:"flex", gap:24, overflowX:"auto", marginLeft:-20, marginRight:-20, paddingLeft:20, paddingRight:20, scrollbarWidth:"none" }}>
            {["Holmberg Bygg","Skanlund AB","Wallin & Söner","BoBygg","Mälar Bygg"].map(n=>(
              <span key={n} className="font-display" style={{ fontSize:14, color:"var(--fg-muted)", fontWeight:500, letterSpacing:"-0.01em", whiteSpace:"nowrap", flexShrink:0 }}>{n}</span>
            ))}
          </div>
        </section>

        {/* Stats — 2x2 */}
        <section style={{ padding:"32px 20px", borderBottom:"1px solid var(--hairline)" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24 }}>
            {[["8 h","Mindre admin/projekt"],["3.2 d","Snabbare offert"],["94 %","Förnyar år 2"],["4.7/5","Trustpilot"]].map(([v,l])=>(
              <div key={v}>
                <div className="font-display tnum" style={{ fontSize:30, fontWeight:300, letterSpacing:"-0.025em", lineHeight:1 }}>{v}</div>
                <div style={{ fontSize:12, marginTop:6, color:"var(--fg-muted)" }}>{l}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Compressed features */}
        <section style={{ padding:"40px 20px" }}>
          <div className="mono" style={{ fontSize:10, color:"var(--fg-subtle)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>Funktioner</div>
          <h2 className="font-display" style={{ fontSize:30, fontWeight:300, letterSpacing:"-0.022em", margin:"0 0 24px", lineHeight:1.1 }}>Allt från första kundkontakt till slutbesiktning.</h2>
          <div style={{ display:"flex", flexDirection:"column", gap:24 }}>
            {[
              { kicker:"Offert", title:"Skicka offert på 10 min", img:"offert (kommer snart)", src:null },
              { kicker:"Tidsplan", title:"Schema som hänger med", img:"tidsplan", src:"v2/screenshots/timeline.png" },
              { kicker:"Inköp", title:"En kassabok för bygget", img:"inköp", src:"v2/screenshots/budget.png" },
              { kicker:"Kundvy", title:"Bjud in kunden gratis", img:"kund (kommer snart)", src:null },
            ].map((f,i)=>(
              <div key={i}>
                <div style={{ marginBottom:10 }}><Shot src={f.src} alt={f.img} ratio="4/3" chrome={true}/></div>
                <div className="mono" style={{ fontSize:9, color:"var(--fg-subtle)", textTransform:"uppercase", letterSpacing:"0.08em" }}>{f.kicker}</div>
                <h3 className="font-display" style={{ fontSize:20, fontWeight:400, margin:"6px 0 0", letterSpacing:"-0.015em" }}>{f.title}</h3>
              </div>
            ))}
          </div>
        </section>

        {/* Testimonial */}
        <section style={{ padding:"40px 20px", borderTop:"1px solid var(--hairline)", background:"var(--bg-sunken)" }}>
          <div className="mono" style={{ fontSize:10, color:"var(--fg-subtle)", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:14 }}>Kunder</div>
          <blockquote className="font-display" style={{ fontSize:22, fontWeight:300, lineHeight:1.3, letterSpacing:"-0.012em", margin:"0 0 20px", fontStyle:"italic" }}>
            "Vi gick från 14 timmars admin till under 2 per projekt."
          </blockquote>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div className="img-placeholder" style={{ width:40, height:40, borderRadius:"50%", fontSize:9 }}>foto</div>
            <div>
              <div style={{ fontSize:13, fontWeight:500 }}>Marcus Holmberg</div>
              <div style={{ fontSize:11, color:"var(--fg-muted)" }}>VD · Holmberg Bygg AB</div>
            </div>
          </div>
        </section>

        {/* Pricing — single card stacked */}
        <section style={{ padding:"40px 20px" }}>
          <div style={{ textAlign:"center", marginBottom:24 }}>
            <Pill tone="ink">Pris</Pill>
            <h2 className="font-display" style={{ fontSize:28, fontWeight:300, letterSpacing:"-0.022em", margin:"12px 0 6px" }}>Ett pris. Allt inkluderat.</h2>
            <p style={{ fontSize:13, color:"var(--fg-muted)", margin:0 }}>Bjud in obegränsat antal kunder gratis.</p>
          </div>
          <div style={{ border:"1px solid var(--hairline)", borderRadius:12, overflow:"hidden", background:"var(--surface)" }}>
            <div style={{ padding:24, borderBottom:"1px solid var(--hairline)", background:"var(--bg-sunken)", textAlign:"center", position:"relative" }}>
              <div className="mono" style={{ position:"absolute", top:-10, left:"50%", transform:"translateX(-50%)", padding:"3px 10px", fontSize:9, background:"var(--accent-ink)", color:"var(--bg)", textTransform:"uppercase", letterSpacing:"0.08em", borderRadius:4 }}>Mest populär</div>
              <div className="mono" style={{ fontSize:10, color:"var(--fg-subtle)", textTransform:"uppercase", letterSpacing:"0.1em" }}>Team</div>
              <div style={{ display:"flex", alignItems:"baseline", gap:6, justifyContent:"center", marginTop:10 }}>
                <span className="font-display tnum" style={{ fontSize:42, fontWeight:300, letterSpacing:"-0.025em", lineHeight:1 }}>549</span>
                <span style={{ fontSize:14, color:"var(--fg-muted)" }}>kr/mån</span>
              </div>
              <div style={{ fontSize:13, color:"var(--fg-muted)", marginTop:8 }}>För mindre firmor (1–5 personer)</div>
            </div>
            <div style={{ padding:24 }}>
              <ul style={{ listStyle:"none", padding:0, margin:"0 0 20px", display:"flex", flexDirection:"column", gap:10, fontSize:13 }}>
                {["Obegränsat antal projekt","Obegränsat antal kunder","Offert + faktura + ROT","Tidsplan & inköp","Mobilapp + offline-läge"].map(f=>(
                  <li key={f} style={{ display:"flex", alignItems:"center", gap:10, color:"var(--fg-muted)" }}>
                    <Ico d={icons.check} size={14}/>{f}
                  </li>
                ))}
              </ul>
              <button style={{ width:"100%", padding:"14px 18px", borderRadius:6, background:"var(--accent-ink)", color:"var(--bg)", fontSize:14, fontWeight:500, border:"none", cursor:"pointer", minHeight:48 }}>Prova fritt 14 dagar</button>
            </div>
          </div>
          <a style={{ display:"block", textAlign:"center", marginTop:14, fontSize:13, color:"var(--fg-muted)", textDecoration:"underline", textUnderlineOffset:3 }}>Se alla planer</a>
        </section>

        {/* CTA */}
        <section style={{ padding:"56px 20px", textAlign:"center", borderTop:"1px solid var(--hairline)", background:"var(--bg-sunken)" }}>
          <h2 className="font-display" style={{ fontSize:32, fontWeight:300, letterSpacing:"-0.025em", margin:"0 0 14px", lineHeight:1.05 }}>
            Bygg branschens vassaste projektkontor.
          </h2>
          <p style={{ fontSize:14, color:"var(--fg-muted)", margin:"0 0 22px", lineHeight:1.55 }}>14 dagars fri provperiod. Inga kontokrav.</p>
          <button style={{ padding:"14px 26px", borderRadius:6, background:"var(--accent-ink)", color:"var(--bg)", fontSize:14, fontWeight:500, border:"none", cursor:"pointer", display:"inline-flex", alignItems:"center", gap:8, minHeight:48 }}>
            Kom igång <Ico d={icons.arrowRight} size={14}/>
          </button>
        </section>
      </main>
    </div>
  );
};
