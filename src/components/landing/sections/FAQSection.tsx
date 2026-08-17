import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";

export function FAQSection() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(0);

  const items = [
    {
      q: t("landingV2.faq.q6", "Vad \u00e4r Renaida \u2014 m\u00e5ste jag kunna AI?"),
      a: t(
        "landingV2.faq.a6",
        "Nej. Renaida \u00e4r en inbyggd assistent du pratar med p\u00e5 vanlig svenska. Du beskriver jobbet eller fotar ett kvitto, hon f\u00f6resl\u00e5r \u2014 du bekr\u00e4ftar. Inget att l\u00e4ra sig, inget kr\u00e5ngel. Hon finns med i hela appen och svarar p\u00e5 ditt spr\u00e5k.",
      ),
    },
    {
      q: t("landingV2.faq.q1", "Hur l\u00e5ng \u00e4r onboarding-tiden?"),
      a: t(
        "landingV2.faq.a1",
        "Mellan 30 minuter och 2 timmar, beroende p\u00e5 hur m\u00e5nga p\u00e5g\u00e5ende projekt du importerar. Vi har en mall f\u00f6r hur projekt struktureras som vi g\u00e5r igenom tillsammans i ett startm\u00f6te."
      ),
    },
    {
      q: t("landingV2.faq.q2", "Hanterar Renofine ROT-avdraget korrekt?"),
      a: t(
        "landingV2.faq.a2",
        "Ja. Vi f\u00f6ljer Skatteverkets regler f\u00f6r ROT-arbete: 30% av arbetskostnaden, max 50 000 kr per person/\u00e5r. Saldot uppdateras realtid mot godk\u00e4nda arbeten."
      ),
    },
    {
      q: t("landingV2.faq.q3", "F\u00e5r mina kunder ocks\u00e5 anv\u00e4nda appen?"),
      a: t(
        "landingV2.faq.a3",
        "Ja, kostnadsfritt. Bjud in obegr\u00e4nsat antal kunder. De f\u00e5r en egen vy d\u00e4r de ser projektets progress, ROT-saldo, och kan godk\u00e4nna ink\u00f6p digitalt."
      ),
    },
    {
      q: t("landingV2.faq.q4", "Funkar det p\u00e5 byggplats / med d\u00e5lig t\u00e4ckning?"),
      a: t(
        "landingV2.faq.a4",
        "Ja. Mobilappen funkar offline \u2014 synkar n\u00e4r du f\u00e5r t\u00e4ckning igen. All kritisk projektdata finns lokalt p\u00e5 enheten."
      ),
    },
    {
      q: t("landingV2.faq.q5", "Kan jag exportera min data om jag avslutar?"),
      a: t(
        "landingV2.faq.a5",
        "Ja, alltid. Hela projektarkivet exporteras som PDF + Excel. Vi tror att data \u00e4r ditt, och en f\u00f6rs\u00e4kring mot lock-in \u00e4r en f\u00f6rs\u00e4kring mot d\u00e5lig produkt."
      ),
    },
  ];

  return (
    <section style={{ borderTop: "1px solid var(--lp-hairline)" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "80px 40px" }}>
        <h2
          className="text-center"
          style={{
            fontFamily: '"Fraunces", ui-serif, Georgia, serif',
            fontSize: 36,
            fontWeight: 300,
            letterSpacing: "-0.022em",
            margin: "0 0 32px",
          }}
        >
          {t("landingV2.faq.h2", "Vanliga fr\u00e5gor")}
        </h2>
        <div
          className="flex flex-col"
          style={{
            gap: 1,
            background: "var(--lp-hairline)",
            border: "1px solid var(--lp-hairline)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {items.map((it, i) => (
            <div key={i} style={{ background: "var(--lp-surface)" }}>
              <button
                onClick={() => setOpen(open === i ? -1 : i)}
                className="w-full flex items-center justify-between text-left bg-transparent border-none cursor-pointer"
                style={{ padding: "18px 20px" }}
              >
                <span style={{ fontSize: 15, fontWeight: 500, letterSpacing: "-0.005em", color: "var(--lp-fg)" }}>
                  {it.q}
                </span>
                {open === i ? (
                  <ChevronDown size={14} style={{ color: "var(--lp-fg-muted)", flexShrink: 0 }} />
                ) : (
                  <ChevronRight size={14} style={{ color: "var(--lp-fg-muted)", flexShrink: 0 }} />
                )}
              </button>
              {open === i && (
                <div style={{ padding: "0 20px 20px", fontSize: 14, color: "var(--lp-fg-muted)", lineHeight: 1.6 }}>
                  {it.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
