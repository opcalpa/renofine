import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ContactInfo, InvitePath } from "./types";

const LANGUAGES = [
  { code: "sv", name: "Svenska", flag: "🇸🇪" },
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "uk", name: "Українська", flag: "🇺🇦" },
  { code: "pl", name: "Polski", flag: "🇵🇱" },
  { code: "ro", name: "Română", flag: "🇷🇴" },
  { code: "lt", name: "Lietuvių", flag: "🇱🇹" },
  { code: "et", name: "Eesti", flag: "🇪🇪" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "es", name: "Español", flag: "🇪🇸" },
];

interface Props {
  path: InvitePath;
  contact: ContactInfo;
  onChange: (updates: Partial<ContactInfo>) => void;
}

export function WizardStep4Contact({ path, contact, onChange }: Props) {
  const { t } = useTranslation();
  const isWorker = path === "worker";

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">
          {isWorker
            ? t("inviteWizard.contactStep.titleWorker", "Kontaktuppgifter för arbetaren")
            : t("inviteWizard.contactStep.titleMember", "Kontaktuppgifter")}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isWorker
            ? t(
                "inviteWizard.contactStep.descriptionWorker",
                "Personen får en länk till sina uppgifter via SMS eller e-post.",
              )
            : t(
                "inviteWizard.contactStep.descriptionMember",
                "Vi skickar en inbjudan via e-post.",
              )}
        </p>
      </div>

      <div className="space-y-3">
        <Field
          id="invite-name"
          label={t("inviteWizard.contactStep.nameLabel", "Namn")}
          required
        >
          <Input
            id="invite-name"
            value={contact.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder={t("inviteWizard.contactStep.namePlaceholder", "Ange namn...")}
          />
        </Field>

        <Field
          id="invite-email"
          label={t("inviteWizard.contactStep.emailLabel", "E-post")}
          required={!isWorker}
          optional={isWorker}
        >
          <Input
            id="invite-email"
            type="email"
            value={contact.email}
            onChange={(e) => onChange({ email: e.target.value })}
            placeholder="namn@exempel.se"
          />
        </Field>

        <Field
          id="invite-phone"
          label={t("inviteWizard.contactStep.phoneLabel", "Telefon")}
          optional={!isWorker}
          required={isWorker && !contact.email.trim()}
        >
          <Input
            id="invite-phone"
            type="tel"
            value={contact.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
            placeholder="070-123 45 67"
          />
        </Field>

        {isWorker && (
          <>
            <Field
              id="invite-language"
              label={t("inviteWizard.contactStep.languageLabel", "Språk")}
            >
              <Select
                value={contact.language || "sv"}
                onValueChange={(value) => onChange({ language: value })}
              >
                <SelectTrigger id="invite-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      <span className="flex items-center gap-2">
                        <span>{lang.flag}</span>
                        <span>{lang.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              id="invite-welcome"
              label={t("inviteWizard.contactStep.welcomeLabel", "Välkomstmeddelande")}
              optional
            >
              <Textarea
                id="invite-welcome"
                value={contact.welcomeMessage || ""}
                onChange={(e) => onChange({ welcomeMessage: e.target.value })}
                placeholder={t(
                  "inviteWizard.contactStep.welcomePlaceholder",
                  "Valfritt meddelande som visas när arbetaren öppnar länken...",
                )}
                rows={3}
              />
            </Field>
          </>
        )}

        {isWorker && !contact.email.trim() && !contact.phone.trim() && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {t(
              "inviteWizard.contactStep.workerContactHint",
              "Lägg till antingen telefonnummer eller e-post — vi behöver något att skicka länken till.",
            )}
          </p>
        )}
      </div>
    </div>
  );
}

interface FieldProps {
  id: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  children: React.ReactNode;
}

function Field({ id, label, required, optional, children }: FieldProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-medium">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
        {optional && (
          <span className="text-muted-foreground ml-1 font-normal">
            ({t("common.optional", "frivilligt")})
          </span>
        )}
      </Label>
      {children}
    </div>
  );
}
