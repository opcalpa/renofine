import { Eye, Send, FileText, Trash2, RefreshCcw } from "lucide-react";
import {
  DocumentLayout,
  DocumentNumber,
  DocumentParties,
  DocumentLines,
  DocumentTotals,
  DocumentStatusStamp,
  SidebarCard,
  SidebarActions,
  SidebarTimeline,
  SidebarLinkBlock,
  StatusPill,
  type DocumentLineItem,
} from "@/components/documents-v2";

const SAMPLE_LINES: DocumentLineItem[] = [
  { sectionHeader: "Arbete" },
  {
    description: "Demontering befintligt kök",
    comment: "Inkl. bortforsling till miljöstation",
    quantity: "8 tim",
    unitPrice: "685 kr",
    total: "5 480 kr",
    rot: true,
  },
  {
    description: "Montering nytt kök Marbodal Linnea",
    comment: "Stommar, luckor, bänkskiva, blandare",
    quantity: "26 tim",
    unitPrice: "685 kr",
    total: "17 810 kr",
    rot: true,
  },
  {
    description: "Vatten & avlopp anslutning",
    comment: "Behörig VVS via underentreprenad",
    quantity: "6 tim",
    unitPrice: "895 kr",
    total: "5 370 kr",
    rot: true,
  },
  { sectionHeader: "Material" },
  {
    description: "Marbodal Linnea, mörkgrön",
    comment: "14 luckor, 6 lådor — paketpris",
    quantity: "1 st",
    unitPrice: "68 400 kr",
    total: "68 400 kr",
  },
  {
    description: "Bosch häll + ugn paket",
    comment: "HBA533BS3S + PUE611BB5E",
    quantity: "1 st",
    unitPrice: "14 900 kr",
    total: "14 900 kr",
  },
];

export default function DocPlayground() {
  return (
    <div style={{ background: "var(--rf-paper, #FAFAF7)", minHeight: "100vh" }}>
      <div className="mx-auto max-w-[1200px] px-6 py-10">
        <div className="rf-paper">
          <h1 className="rf-display mb-2" style={{ fontSize: 36, fontWeight: 300, letterSpacing: "-0.025em" }}>
            Documents v2 · Playground
          </h1>
          <p style={{ color: "var(--rf-fg-muted)", marginBottom: 32 }}>
            Visuell verifiering av delade primitiver. Utkast / skickad / betald-stämplar nedan.
          </p>
        </div>

        {/* OFFERT — DRAFT */}
        <div className="mb-12">
          <DocumentLayout
            title="Offert 2026-0142 · Brf Linden 12B Kök"
            meta="Utkast · Senast sparad 14:22"
            main={
              <>
                <DocumentNumber
                  type="Offert"
                  number="2026-0142"
                  rightLabel="Datum"
                  rightValue="12 maj 2026"
                  rightHint="Giltig t.o.m. 12 jun"
                />
                <DocumentParties
                  from={{
                    name: "Lindgren Bygg & Renovering AB",
                    address: (
                      <>
                        Storgatan 14, 117 27 Stockholm
                        <br />
                        Org.nr 559123-4567 · F-skatt
                        <br />
                        info@lindgrenbygg.se
                      </>
                    ),
                  }}
                  to={{
                    name: "Anna Lundgren",
                    address: (
                      <>
                        Brf Linden, lgh 12B
                        <br />
                        Lindgatan 8, 116 35 Stockholm
                        <br />
                        070-123 45 67
                      </>
                    ),
                  }}
                />
                <DocumentLines items={SAMPLE_LINES} />
                <DocumentTotals
                  rows={[
                    { label: "Arbete", value: "32 200 kr" },
                    { label: "Material", value: "92 420 kr" },
                    { label: "Moms 25%", value: "31 155 kr" },
                  ]}
                  grand={{ label: "Totalt", value: "155 775 kr" }}
                  rot={{
                    label: "ROT-avdrag (50% av arbete)",
                    sublabel: "Att betala efter avdrag",
                    value: "−16 100 kr",
                  }}
                  afterRotGrand={{ label: "Att betala", value: "139 675 kr" }}
                />
              </>
            }
            sidebar={
              <>
                <SidebarCard label="Status">
                  <StatusPill tone="draft" label="Utkast" />
                  <div style={{ fontSize: 12, color: "var(--rf-fg-muted)", marginTop: 8, lineHeight: 1.5 }}>
                    Inte skickad till kund ännu. 3 ändringar sparade idag.
                  </div>
                </SidebarCard>
                <SidebarActions
                  actions={[
                    { label: "Granska & skicka", variant: "primary", icon: <Send className="h-3.5 w-3.5" /> },
                    { label: "Förhandsgranska PDF", variant: "outline", icon: <Eye className="h-3.5 w-3.5" /> },
                    { label: "Spara som mall", variant: "ghost", icon: <FileText className="h-3.5 w-3.5" /> },
                  ]}
                />
                <SidebarCard label="Aktivitet">
                  <SidebarTimeline
                    items={[
                      { what: "Skiss skapad", when: "12 MAJ · 09:14" },
                      { what: "Bosch-paket tillagt", when: "12 MAJ · 11:02" },
                      { what: "ROT-avdrag aktiverat", when: "12 MAJ · 14:22" },
                      { what: "Skickas till kund", when: "VÄNTAR", pending: true },
                    ]}
                  />
                </SidebarCard>
                <SidebarLinkBlock
                  label="Koppling"
                  title="Brf Linden 12B"
                  subtitle="Rum: Kök · 14,2 m²"
                  cta={{ label: "Öppna projekt", href: "#" }}
                />
              </>
            }
          />
        </div>

        {/* FAKTURA — SENT */}
        <div className="mb-12">
          <DocumentLayout
            title="Faktura F-2026-0089 · Brf Linden 12B Kök"
            meta="Skickad 14 maj · Förfaller 28 maj"
            stamp={<DocumentStatusStamp label="Skickad" tone="sent" />}
            main={
              <>
                <DocumentNumber
                  type="Faktura"
                  number="F-2026-0089"
                  rightLabel="Förfaller"
                  rightValue="28 maj 2026"
                  rightHint="Fakturadatum 14 maj"
                  badge={
                    <span
                      className="inline-block rounded-full px-2.5 py-1 text-xs font-medium"
                      style={{ background: "var(--rf-amber-soft)", color: "var(--rf-amber-soft-fg)" }}
                    >
                      à konto-faktura 1 av 3 · 30%
                    </span>
                  }
                />
                <DocumentParties
                  from={{
                    name: "Lindgren Bygg & Renovering AB",
                    address: (
                      <>
                        Bg 5234-1167 · Sw 123 234 56 78
                        <br />
                        Org.nr 559123-4567 · F-skatt
                      </>
                    ),
                  }}
                  to={{
                    name: "Anna Lundgren",
                    address: (
                      <>
                        Brf Linden, lgh 12B
                        <br />
                        Lindgatan 8, 116 35 Stockholm
                      </>
                    ),
                  }}
                />
                <DocumentLines
                  items={[
                    {
                      description: "à konto köksrenovering · 30%",
                      comment: "Enligt offert 2026-0142 · Påbörjat 14 maj",
                      quantity: "1 st",
                      unitPrice: "37 386 kr",
                      total: "37 386 kr",
                    },
                    {
                      description: "Demontering & rivning",
                      comment: "Utfört 12–14 maj enligt rapport",
                      quantity: "8 tim",
                      unitPrice: "685 kr",
                      total: "5 480 kr",
                      rot: true,
                    },
                    {
                      description: "ROT-avdrag arbete",
                      comment: "Personnr ********-**** · 50% av 5 480 kr",
                      total: "−2 740 kr",
                      deduction: true,
                    },
                  ]}
                />
                <DocumentTotals
                  rows={[
                    { label: "Netto", value: "40 126 kr" },
                    { label: "Moms 25% (på arbete + material)", value: "10 032 kr" },
                  ]}
                  grand={{ label: "Att betala", value: "50 158 kr" }}
                />
                <div
                  className="mt-6 rounded-md p-4"
                  style={{ background: "var(--rf-bg-sunken)" }}
                >
                  <div
                    className="rf-num mb-3"
                    style={{
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--rf-fg-muted)",
                    }}
                  >
                    Betalning
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      ["Bankgiro", "5234-1167"],
                      ["OCR / Referens", "2026008900"],
                      ["Belopp", "50 158 kr"],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <div style={{ fontSize: 11, color: "var(--rf-fg-muted)", marginBottom: 3 }}>{k}</div>
                        <div className="rf-num" style={{ fontWeight: 500, color: "var(--rf-ink)" }}>
                          {v}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            }
            sidebar={
              <>
                <SidebarCard label="Status">
                  <StatusPill tone="sent" label="Skickad" />
                  <div style={{ fontSize: 12, color: "var(--rf-fg-muted)", marginTop: 8, lineHeight: 1.5 }}>
                    Skickad till anna.lundgren@gmail.com 14 maj 09:18.
                  </div>
                  <div
                    className="mt-2.5 rounded p-2"
                    style={{
                      background: "var(--rf-paper)",
                      fontSize: 11,
                      color: "var(--rf-fg-muted)",
                    }}
                  >
                    Öppnad 2 ggr · Senast 15 maj
                  </div>
                </SidebarCard>
                <SidebarActions
                  actions={[
                    { label: "Skicka påminnelse", variant: "primary", icon: <RefreshCcw className="h-3.5 w-3.5" /> },
                    { label: "Markera som betald", variant: "outline" },
                    { label: "Hämta PDF", variant: "ghost", icon: <FileText className="h-3.5 w-3.5" /> },
                  ]}
                />
                <SidebarCard label="À konto-plan">
                  <div className="mt-1.5 flex flex-col gap-1.5 text-sm">
                    {[
                      ["● 1 av 3 · 30%", "50 158 kr", "var(--rf-green)", false],
                      ["○ 2 av 3 · 50%", "83 597 kr", "var(--rf-fg-muted)", true],
                      ["○ 3 av 3 · slutfaktura", "5 920 kr", "var(--rf-fg-muted)", true],
                    ].map(([label, value, color, last], i) => (
                      <div
                        key={i}
                        className="flex justify-between py-1"
                        style={{
                          borderBottom: last ? undefined : "1px solid var(--rf-hairline)",
                          color: color as string,
                          fontSize: 13,
                        }}
                      >
                        <span>{label}</span>
                        <span className="rf-num">{value}</span>
                      </div>
                    ))}
                  </div>
                </SidebarCard>
              </>
            }
          />
        </div>

        {/* FAKTURA — PAID */}
        <div className="mb-12">
          <DocumentLayout
            title="Faktura F-2026-0088 · Brf Linden 12B Kök · Slutfaktura"
            meta="Betald 30 apr"
            stamp={<DocumentStatusStamp label="Betald" tone="paid" />}
            main={
              <>
                <DocumentNumber type="Faktura" number="F-2026-0088" rightLabel="Förfaller" rightValue="14 apr 2026" />
                <DocumentParties
                  from={{ name: "Lindgren Bygg & Renovering AB", address: "Storgatan 14, 117 27 Stockholm" }}
                  to={{ name: "Anna Lundgren", address: "Brf Linden 12B" }}
                />
                <DocumentLines
                  items={[
                    { sectionHeader: "Arbete + material" },
                    { description: "Slutfaktura köksrenovering", quantity: "1 st", unitPrice: "5 920 kr", total: "5 920 kr" },
                  ]}
                />
                <DocumentTotals
                  rows={[
                    { label: "Netto", value: "4 736 kr" },
                    { label: "Moms 25%", value: "1 184 kr" },
                  ]}
                  grand={{ label: "Att betala", value: "5 920 kr" }}
                />
              </>
            }
            sidebar={
              <SidebarCard label="Status">
                <StatusPill tone="paid" label="Betald" />
                <div style={{ fontSize: 12, color: "var(--rf-fg-muted)", marginTop: 8 }}>Inkommen 30 apr · OCR-matchad.</div>
              </SidebarCard>
            }
          />
        </div>

        {/* DELETE TEST: Destructive action */}
        <div className="rf-paper mb-12 rounded-md p-4">
          <h3 className="rf-display mb-3" style={{ fontSize: 18 }}>
            Action variants
          </h3>
          <div style={{ maxWidth: 280 }}>
            <SidebarActions
              actions={[
                { label: "Primary", variant: "primary" },
                { label: "Outline", variant: "outline" },
                { label: "Ghost", variant: "ghost" },
                { label: "Ta bort", variant: "destructive", icon: <Trash2 className="h-3.5 w-3.5" /> },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
