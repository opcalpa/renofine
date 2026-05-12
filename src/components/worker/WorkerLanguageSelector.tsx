import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const LANGUAGES = [
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "sv", name: "Swedish", flag: "🇸🇪" },
  { code: "de", name: "German", flag: "🇩🇪" },
  { code: "fr", name: "French", flag: "🇫🇷" },
  { code: "es", name: "Spanish", flag: "🇪🇸" },
  { code: "pl", name: "Polish", flag: "🇵🇱" },
  { code: "uk", name: "Ukrainian", flag: "🇺🇦" },
  { code: "ro", name: "Romanian", flag: "🇷🇴" },
  { code: "lt", name: "Lithuanian", flag: "🇱🇹" },
  { code: "et", name: "Estonian", flag: "🇪🇪" },
];

interface WorkerLanguageSelectorProps {
  token: string;
}

export function workerLangOverrideKey(token: string) {
  return `worker-lang-override-${token}`;
}

export function WorkerLanguageSelector({ token }: WorkerLanguageSelectorProps) {
  const { i18n, t } = useTranslation();
  const current = LANGUAGES.find((l) => l.code === i18n.language) || LANGUAGES[0];

  const handleChange = async (code: string) => {
    await i18n.changeLanguage(code);
    try {
      localStorage.setItem(workerLangOverrideKey(token), code);
    } catch {
      // localStorage unavailable — fall back to in-memory only
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 px-2">
          <span className="text-base leading-none">{current.flag}</span>
          <Globe className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleChange(lang.code)}
            className="cursor-pointer"
          >
            <span className="mr-2 text-lg">{lang.flag}</span>
            <span>{t(`languages.${lang.code}`, lang.name)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
