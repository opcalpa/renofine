/* global React, AppHeader, SectionHeader, Ico, icons */

// ————————————————————————————————————————————————————————————————
// Purchases / Materials — editorial ledger
// ————————————————————————————————————————————————————————————————
window.Purchases = function Purchases() {
  return (
    <div style={{ background: "var(--bg)", minHeight: "100%" }}>
      <AppHeader projectMode activeTab="Inköp" project={{ name: "Vasastan Totalrenovering" }} />
      <main style={{ padding: "28px 40px", maxWidth: 1280, margin: "0 auto" }}>
        <SectionHeader kicker="Inköp & material" title="24 inköp · 18 levererade"
          action={<div style={{ display: "flex", gap: 6 }}>
            <button className="rf-btn rf-btn-ghost"><Ico d={icons.download} size={13} /> Export</button>
            <button className="rf-btn rf-btn-primary"><Ico d={icons.plus} size={13} /> Nytt inköp</button>
          </div>} />

        {/* Highlight: pending approval */}
        <div className="rf-card" style={{ padding: 20, marginBottom: 24, background: "var(--surface-2)", border: "1px solid color-mix(in oklab, var(--warn) 30%, var(--hairline))" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <Ico d={icons.alert} size={14} />
            <span style={{ fontSize: 13, fontWeight: 500 }}>4 inköp väntar på ditt godkännande · totalt 184 200 kr</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 120px 120px", gap: 16, fontSize: 12, padding: "8px 0", borderTop: "1px solid var(--hairline)", color: "var(--fg-subtle)" }} className="mono">
            <span>Artikel</span>
            <span>Rum</span>
            <span style={{ textAlign: "right" }}>Antal</span>
            <span style={{ textAlign: "right" }}>Pris</span>
            <span style={{ textAlign: "right" }}></span>
          </div>
          {[
            { item: "Parkett ek 15 mm, Kährs", room: "Vardagsrum", qty: "42 m²", price: "58 400 kr" },
            { item: "Kalksten Öland, bänkskiva", room: "Kök", qty: "3.2 m²", price: "32 800 kr" },
            { item: "Duschblandare Tapwell ARM", room: "Badrum", qty: "2 st", price: "12 400 kr" },
            { item: "Kakel Marrakech 20×20", room: "Badrum", qty: "18 m²", price: "80 600 kr" },
          ].map((p, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 120px 120px", gap: 16, fontSize: 13, padding: "10px 0", borderTop: "1px solid var(--hairline)", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: 4, background: "var(--surface)", display: "grid", placeItems: "center", border: "1px solid var(--hairline)" }}>
                  <Ico d={icons.box} size={13} />
                </div>
                <span>{p.item}</span>
              </div>
              <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>{p.room}</span>
              <span className="mono tnum" style={{ textAlign: "right" }}>{p.qty}</span>
              <span className="mono tnum" style={{ textAlign: "right", fontWeight: 500 }}>{p.price}</span>
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button className="rf-btn rf-btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }}>Avslå</button>
                <button className="rf-btn rf-btn-primary" style={{ padding: "4px 10px", fontSize: 11 }}>Godkänn</button>
              </div>
            </div>
          ))}
        </div>

        {/* Ledger table */}
        <div style={{ border: "1px solid var(--hairline)", borderRadius: 12, overflow: "hidden", background: "var(--surface)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "60px 1.8fr 1fr 1fr 100px 110px 110px 28px", padding: "10px 16px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-subtle)", background: "var(--bg-sunken)", borderBottom: "1px solid var(--hairline)", fontWeight: 500 }} className="mono">
            <span>#</span><span>Artikel</span><span>Leverantör</span><span>Rum / arbete</span><span style={{ textAlign: "right" }}>Belopp</span><span>Leverans</span><span>Status</span><span></span>
          </div>
          {[
            { n: "082", item: "Parkett ek 15 mm", sup: "Kährs Stockholm", room: "Vardagsrum · Parkettläggning", amt: "58 400 kr", del: "24 apr", status: "Godkänd", statusColor: "primary" },
            { n: "081", item: "Vitvaror paket Bosch", sup: "Elon Fridhemsplan", room: "Kök · Montering", amt: "42 900 kr", del: "2 maj", status: "Levererad", statusColor: "muted" },
            { n: "080", item: "Gipsskivor 13 × 48 st", sup: "Beijer Bygg", room: "Alla · Innerväggar", amt: "9 840 kr", del: "18 apr", status: "Levererad", statusColor: "muted" },
            { n: "079", item: "Målarfärg linoljefärg", sup: "Ottosson Färg", room: "Vardagsrum · Måleri", amt: "14 200 kr", del: "20 apr", status: "Levererad", statusColor: "muted" },
            { n: "078", item: "Kakel Marrakech 20×20", sup: "Kakelspecialisten", room: "Badrum · Kakling", amt: "80 600 kr", del: "—", status: "Väntar", statusColor: "warn" },
            { n: "077", item: "Bänkskiva Kalksten Öland", sup: "Slottsbergs Stenhuggeri", room: "Kök · Montering", amt: "32 800 kr", del: "29 apr", status: "Försenad", statusColor: "warn" },
            { n: "076", item: "Duschblandare Tapwell", sup: "VVS-Butiken", room: "Badrum · VVS", amt: "12 400 kr", del: "—", status: "Väntar", statusColor: "warn" },
            { n: "075", item: "Eluttag 16 st + brytare", sup: "Elon", room: "Alla · El", amt: "4 320 kr", del: "12 apr", status: "Levererad", statusColor: "muted" },
          ].map((p, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "60px 1.8fr 1fr 1fr 100px 110px 110px 28px", padding: "12px 16px", fontSize: 13, alignItems: "center", borderBottom: i < 7 ? "1px solid var(--hairline)" : "none" }}>
              <span className="mono" style={{ fontSize: 11, color: "var(--fg-subtle)" }}>#{p.n}</span>
              <span style={{ fontWeight: 500, letterSpacing: "-0.003em" }}>{p.item}</span>
              <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>{p.sup}</span>
              <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>{p.room}</span>
              <span className="mono tnum" style={{ textAlign: "right", fontWeight: 500 }}>{p.amt}</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--fg-muted)" }}>{p.del}</span>
              <span className={`rf-chip chip-${p.statusColor}`} style={{ width: "fit-content" }}>{p.status}</span>
              <Ico d={icons.chevRight} size={13} />
            </div>
          ))}
        </div>

        {/* Footer totals */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, marginTop: 24, background: "var(--hairline)", border: "1px solid var(--hairline)", borderRadius: 12, overflow: "hidden" }}>
          {[
            { l: "Beställt", v: "482 300 kr", d: "24 ordrar" },
            { l: "Levererat", v: "278 500 kr", d: "18 ordrar" },
            { l: "Väntar leverans", v: "184 600 kr", d: "4 ordrar" },
            { l: "Budget kvar material", v: "81 700 kr", d: "av 560 tkr" },
          ].map((s, i) => (
            <div key={i} style={{ background: "var(--surface)", padding: "16px 18px" }}>
              <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-subtle)", marginBottom: 8 }}>{s.l}</div>
              <div className="font-display tnum" style={{ fontSize: 22, fontWeight: 400, letterSpacing: "-0.018em" }}>{s.v}</div>
              <div style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 4 }}>{s.d}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};
