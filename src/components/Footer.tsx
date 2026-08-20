import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

const Footer = () => {
  const { t } = useTranslation();

  return (
    <footer className="bg-card border-t mt-16">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <div className="mb-4">
              <img src="/brand/svg/lockup/lockup-horizontal-green.svg" alt="Renofine" className="h-7 w-auto" />
            </div>
            <p className="text-sm text-muted-foreground max-w-md">
              {t("landingV2.footer.tagline", "Projektkontoret som byggare faktiskt vill använda. Gjort i Stockholm.")}
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-4">{t("landingV2.footer.company", "Företag")}</h4>
            <ul className="space-y-2">
              <li>
                <Link to="/about" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  {t("landingV2.footer.about", "Om oss")}
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  {t("landingV2.footer.contact", "Kontakt")}
                </Link>
              </li>
              <li>
                <Link to="/changelog" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  {t("landingV2.footer.whatsNew", "Vad är nytt")}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">{t("landingV2.footer.legal", "Juridik")}</h4>
            <ul className="space-y-2">
              <li>
                <Link to="/privacy" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  {t("landingV2.footer.privacy", "Integritet")}
                </Link>
              </li>
              <li>
                <Link to="/terms" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  {t("landingV2.footer.terms", "Villkor")}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t mt-8 pt-8 text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Renofine · Stockholm
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
