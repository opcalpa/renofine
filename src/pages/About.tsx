import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Footer from "@/components/Footer";

const About = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="container mx-auto px-4 pt-8 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <img src="/brand/svg/lockup/lockup-horizontal-green.svg" alt="Renofine" className="h-8 w-auto" />
          </div>
          <Button variant="ghost" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("aboutPage.back", "Tillbaka")}
          </Button>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground mb-3">
            {t("aboutPage.eyebrow", "Om Renofine")}
          </div>
          <h1 className="text-4xl md:text-5xl font-light tracking-tight mb-6" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
            {t("aboutPage.h1", "Byggt av någon som tröttnade på att jaga kvitton.")}
          </h1>

          <p className="text-lg text-muted-foreground leading-relaxed mb-12">
            {t(
              "aboutPage.intro",
              "Renofine är ett svenskt verktyg för renoveringsprojekt — med Renaida, en AI-kollega som bygger projektet när du beskriver jobbet, läser dina kvitton och håller budgeten uppdaterad. Offert med ROT, tidsplan, inköp och en egen vy för din kund. Allt på ett ställe, på sju språk."
            )}
          </p>

          {/* Founder */}
          <div className="flex flex-col sm:flex-row gap-8 items-start mb-12 p-8 rounded-lg border bg-card">
            <img
              src="/images/carl-palmquist-bw.jpg"
              alt="Carl Palmquist"
              className="w-36 h-36 rounded-lg object-cover shrink-0"
              style={{ filter: "grayscale(1)" }}
            />
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground mb-2">
                {t("aboutPage.founderKicker", "Grundare")}
              </div>
              <h2 className="text-xl font-semibold mb-1">Carl Palmquist</h2>
              <p className="text-sm text-muted-foreground mb-4">{t("aboutPage.founderRole", "Grundare & produktbyggare · Stockholm")}</p>
              <p className="text-muted-foreground leading-relaxed mb-3">
                {t(
                  "aboutPage.story1",
                  "Jag startade Renofine efter min egen renovering: kvitton i mejlen, budgeten i Excel, offerten som PDF och besluten i sms-trådar. Verktygen för branschen var byggda för kontoret — inte för den som står i dammet."
                )}
              </p>
              <p className="text-muted-foreground leading-relaxed">
                {t(
                  "aboutPage.story2",
                  "Så jag byggde det jag själv ville ha: fota kvittot så bokförs det, beskriv jobbet så finns projektet, och kunden ser hur bygget går utan att ringa. Jag bygger i snabb takt tillsammans med de byggare och hemägare som använder verktyget — deras vardag styr vad som byggs härnäst."
                )}
              </p>
            </div>
          </div>

          {/* Where we are */}
          <div className="mb-12">
            <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground mb-3">
              {t("aboutPage.whereKicker", "Var vi är")}
            </div>
            <p className="text-muted-foreground leading-relaxed">
              {t(
                "aboutPage.where1",
                "Renofine är i öppen beta — gratis att använda fullt ut medan vi bygger. Vi är ett ungt bygge med hög leveranstakt: nya funktioner varje vecka, formade direkt av användarnas feedback."
              )}{" "}
              <button onClick={() => navigate("/changelog")} className="text-primary underline-offset-2 hover:underline inline-flex items-center gap-1">
                {t("aboutPage.whereLink", "Se vad som är nytt")} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </p>
          </div>

          {/* Contact CTA */}
          <div className="p-8 rounded-lg border bg-card">
            <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground mb-3">
              {t("aboutPage.contactKicker", "Kontakt")}
            </div>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t("aboutPage.contactText", "Frågor, feedback eller samarbete? Hör av dig direkt — det är jag som svarar.")}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <a href="mailto:hello@renofine.com">hello@renofine.com</a>
              </Button>
              <Button variant="outline" asChild>
                <a href="https://calendar.app.google/cpD1Z1Qb6VQBhSAL9" target="_blank" rel="noreferrer">
                  {t("aboutPage.bookDemo", "Boka 15 min demo")}
                </a>
              </Button>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default About;
