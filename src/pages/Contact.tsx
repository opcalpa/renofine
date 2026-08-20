import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Mail, CalendarClock } from "lucide-react";
import Footer from "@/components/Footer";
import { useToast } from "@/hooks/use-toast";

const Contact = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);

    // Create mailto link with form data
    const mailtoLink = `mailto:hello@renofine.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
      `From: ${name} (${email})\n\n${message}`
    )}`;

    window.location.href = mailtoLink;

    // Show confirmation
    setTimeout(() => {
      setSending(false);
      toast({
        title: t("contactPage.toastTitle", "Ditt mejlprogram öppnas"),
        description: t("contactPage.toastDesc", "Skicka mejlet därifrån så återkommer vi snabbt."),
      });
    }, 500);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="container mx-auto px-4 pt-8 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <img src="/brand/svg/lockup/lockup-horizontal-green.svg" alt="Renofine" className="h-8 w-auto" />
          </div>
          <Button variant="ghost" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("contactPage.back", "Tillbaka")}
          </Button>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-4xl font-light tracking-tight mb-4" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>{t("contactPage.h1", "Hör av dig.")}</h1>
            <p className="text-lg text-muted-foreground">
              {t("contactPage.sub", "Frågor, feedback eller samarbete? Det är Carl, grundaren, som svarar — oftast samma dag.")}
            </p>
          </div>

          {/* Direct channels */}
          <div className="flex flex-col sm:flex-row gap-3 mb-10 justify-center">
            <Button variant="outline" asChild className="gap-2">
              <a href="mailto:hello@renofine.com">
                <Mail className="h-4 w-4" /> hello@renofine.com
              </a>
            </Button>
            <Button variant="outline" asChild className="gap-2">
              <a href="https://calendar.app.google/cpD1Z1Qb6VQBhSAL9" target="_blank" rel="noreferrer">
                <CalendarClock className="h-4 w-4" /> {t("contactPage.bookDemo", "Boka 15 min demo")}
              </a>
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6 bg-card p-8 rounded-lg border">
            <div className="space-y-2">
              <Label htmlFor="name">{t("contactPage.formName", "Namn")}</Label>
              <Input
                id="name"
                placeholder={t("contactPage.formNamePh", "Ditt namn")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("contactPage.formEmail", "E-post")}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t("contactPage.formEmailPh", "din@mejl.se")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject">{t("contactPage.formSubject", "Ämne")}</Label>
              <Input
                id="subject"
                placeholder={t("contactPage.formSubjectPh", "Vad gäller det?")}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">{t("contactPage.formMessage", "Meddelande")}</Label>
              <Textarea
                id="message"
                placeholder={t("contactPage.formMessagePh", "Berätta mer…")}
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={sending}>
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("contactPage.opening", "Öppnar…")}
                </>
              ) : (
                t("contactPage.send", "Skicka meddelande")
              )}
            </Button>
          </form>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Contact;
