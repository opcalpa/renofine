import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useProfileLanguage } from "@/hooks/useProfileLanguage";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Loader2, Save, BadgeCheck, Eye, ShieldCheck, Plus, X, Download, Home, Wrench, Upload, Calculator, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { downloadUserDataAsJson } from "@/services/dataExportService";
import { Checkbox } from "@/components/ui/checkbox";
import { CERTIFICATION_PRESETS } from "@/lib/professionalCertifications";
import { PublicProfileSheet } from "@/components/shared/PublicProfileSheet";
import { PROFESSIONAL_CATEGORIES } from "@/lib/professionalCategories";
import { validatePersonnummer } from "@/lib/personnummerValidator";
import { Switch } from "@/components/ui/switch";
import { useEnabledModules } from "@/hooks/useEnabledModules";
import { MODULE_REGISTRY, MARKETS } from "@/lib/modules";
import { useMarket } from "@/hooks/useMarket";
import { ShoppingCart, Clock, FileText, Users as UsersIcon2, PencilRuler, ClipboardCheck, QrCode, CalendarRange, Contact, TrendingUp, Puzzle, Receipt, FileDown } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function CollapsibleCard({
  title,
  description,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 w-full text-left group">
              <ChevronRight
                className={`h-4 w-4 text-muted-foreground transition-transform shrink-0 ${open ? "rotate-90" : ""}`}
              />
              {icon}
              <div>
                <CardTitle className="group-hover:text-foreground/80 transition-colors">{title}</CardTitle>
                {description && <CardDescription>{description}</CardDescription>}
              </div>
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4">{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

const MODULE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  ShoppingCart, Clock, FileText, Users: UsersIcon2, PencilRuler,
  ClipboardCheck, QrCode, CalendarRange, Contact, TrendingUp,
  Receipt, FileDown,
};

function ModulesSection({ profileSize }: { profileSize: "solo" | "small" | "company" | "homeowner" }) {
  const { t } = useTranslation();
  const [market, setMarket] = useMarket();
  const { enabledModules, toggleModule, resetToDefaults, allModules } = useEnabledModules(profileSize, market);

  const visibleModules = allModules.filter(
    (m) => m.audience === "both" || m.audience === (profileSize === "homeowner" ? "homeowner" : "contractor"),
  );

  const currentMarket = MARKETS.find((m) => m.code === market) || MARKETS[0];

  return (
    <CollapsibleCard
      title={t("modules.title", "Modules")}
      description={t("modules.description", "Choose which features are visible in your workspace")}
      icon={<Puzzle className="h-5 w-5 text-primary shrink-0" />}
    >
      {/* Market selector */}
      <div className="mb-4">
        <Label className="text-sm font-medium">{t("modules.market.label", "Operating market")}</Label>
        <p className="text-xs text-muted-foreground mb-2">{t("modules.market.description", "Determines which region-specific features are available. Independent from your UI language.")}</p>
        <Select value={market ?? "__intl"} onValueChange={(v) => setMarket(v === "__intl" ? null : v)}>
          <SelectTrigger className="w-full max-w-xs">
            <SelectValue>{currentMarket.flag} {t(currentMarket.labelKey)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {MARKETS.map((m) => (
              <SelectItem key={m.code ?? "__intl"} value={m.code ?? "__intl"}>
                {m.flag} {t(m.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator className="mb-3" />

      <div className="space-y-1">
        {visibleModules.map((mod) => {
          const Icon = MODULE_ICONS[mod.icon];
          const enabled = enabledModules.includes(mod.id);
          return (
            <label
              key={mod.id}
              className="flex items-center justify-between py-2.5 px-1 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {t(mod.labelKey)}
                    {mod.region && <span className="ml-1.5 text-[10px] text-muted-foreground/70 font-normal">{mod.region}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">{t(mod.descriptionKey)}</div>
                </div>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={() => toggleModule(mod.id)}
              />
            </label>
          );
        })}
      </div>
      <button
        type="button"
        onClick={resetToDefaults}
        className="text-xs text-muted-foreground hover:text-foreground underline mt-2"
      >
        {t("modules.resetDefaults", "Reset to defaults")}
      </button>
    </CollapsibleCard>
  );
}

interface ProfileData {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  language_preference: string | null;
  avatar_url: string | null;
  is_professional: boolean;
  contractor_category: string | null;
  company_name: string | null;
  company_address: string | null;
  company_city: string | null;
  company_postal_code: string | null;
  company_country: string | null;
  company_description: string | null;
  company_website: string | null;
  org_number: string | null;
  company_logo_url: string | null;
}

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'sv', name: 'Swedish', flag: '🇸🇪' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
];

export function ProfileContent() {
  return <Profile asDrawer />;
}

const Profile = ({ asDrawer = false }: { asDrawer?: boolean }) => {
  const { user, session, loading: authLoading, signOut } = useAuthSession();
  useProfileLanguage();
  const { t, i18n } = useTranslation();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [exportingData, setExportingData] = useState(false);
  
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [languagePreference, setLanguagePreference] = useState("en");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState(() => localStorage.getItem("admin_currency") || "SEK");
  const [measurementSystem, setMeasurementSystem] = useState<'metric' | 'imperial'>(() => {
    const stored = localStorage.getItem("renofine_measurement_system");
    return stored === 'imperial' ? 'imperial' : 'metric';
  });

  // User type from onboarding
  const [userType, setUserType] = useState<"homeowner" | "contractor" | null>(null);

  // Professional profile fields
  const [isProfessional, setIsProfessional] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [contractorCategory, setContractorCategory] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyCity, setCompanyCity] = useState("");
  const [companyPostalCode, setCompanyPostalCode] = useState("");
  const [companyDescription, setCompanyDescription] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [orgNumber, setOrgNumber] = useState("");
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [bankgiro, setBankgiro] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [personnummer, setPersonnummer] = useState("");
  const [defaultPaymentTermsDays, setDefaultPaymentTermsDays] = useState("30");
  const [defaultHourlyRate, setDefaultHourlyRate] = useState("");
  const [defaultLaborCostPercent, setDefaultLaborCostPercent] = useState("50");
  const [paintCoverage, setPaintCoverage] = useState("10");
  const [paintCoats, setPaintCoats] = useState("2");
  const [materialPrices, setMaterialPrices] = useState<Record<string, string>>({
    paint_price_per_liter: "150",
    floor_price_per_sqm: "300",
    tile_price_per_sqm: "500",
  });
  const [productivityRates, setProductivityRates] = useState<Record<string, string>>({
    paint_sqm_per_hour: "10",
    floor_sqm_per_hour: "5",
    tile_sqm_per_hour: "3",
    demolition_sqm_per_hour: "8",
    spackling_sqm_per_hour: "6",
    sanding_sqm_per_hour: "12",
    carpentry_sqm_per_hour: "4",
    electrical_sqm_per_hour: "3",
    plumbing_sqm_per_hour: "2",
  });
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [certifications, setCertifications] = useState<Array<{ id: string; name: string; issuer: string; year: string; custom: boolean }>>([]);


  const navigate = useNavigate();
  const { toast } = useToast();

  // Auth redirect handled by RequireAuth wrapper in App.tsx

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);


  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user?.id)
        .single();

      if (error) throw error;
      
      setProfile(data);
      setName(data.name || "");
      setPhone(data.phone || "");
      setLanguagePreference(data.language_preference || "en");
      if ((data as Record<string, unknown>).measurement_system) {
        setMeasurementSystem((data as Record<string, unknown>).measurement_system as 'metric' | 'imperial');
      }
      setUserType(data.onboarding_user_type || null);
      setIsProfessional(data.is_professional || false);
      setCompanyName(data.company_name || "");
      setContractorCategory(data.contractor_category || "");
      setCompanyAddress(data.company_address || "");
      setCompanyCity(data.company_city || "");
      setCompanyPostalCode(data.company_postal_code || "");
      setCompanyDescription(data.company_description || "");
      setCompanyWebsite(data.company_website || "");
      setOrgNumber(data.org_number || "");
      setCompanyLogoUrl(data.company_logo_url || null);
      setAvatarUrl(data.avatar_url || null);
      setBankgiro(data.bankgiro || "");
      setBankAccountNumber(data.bank_account_number || "");
      setPersonnummer(data.personnummer || "");
      setDefaultPaymentTermsDays(String(data.default_payment_terms_days ?? 30));
      setDefaultHourlyRate(data.default_hourly_rate != null ? String(data.default_hourly_rate) : "");
      setDefaultLaborCostPercent(data.default_labor_cost_percent != null ? String(data.default_labor_cost_percent) : "50");
      const es = data.estimation_settings as Record<string, unknown> | null;
      setPaintCoverage(typeof es?.paint_coverage_sqm_per_liter === "number" ? String(es.paint_coverage_sqm_per_liter) : "10");
      setPaintCoats(typeof es?.paint_coats === "number" ? String(es.paint_coats) : "2");
      if (es) {
        const rateKeys = [
          "paint_sqm_per_hour", "floor_sqm_per_hour", "tile_sqm_per_hour",
          "demolition_sqm_per_hour", "spackling_sqm_per_hour", "sanding_sqm_per_hour",
          "carpentry_sqm_per_hour", "electrical_sqm_per_hour", "plumbing_sqm_per_hour",
        ];
        const rateDefaults: Record<string, string> = {
          paint_sqm_per_hour: "10", floor_sqm_per_hour: "5", tile_sqm_per_hour: "3",
          demolition_sqm_per_hour: "8", spackling_sqm_per_hour: "6", sanding_sqm_per_hour: "12",
          carpentry_sqm_per_hour: "4", electrical_sqm_per_hour: "3", plumbing_sqm_per_hour: "2",
        };
        const loaded: Record<string, string> = {};
        for (const k of rateKeys) {
          loaded[k] = typeof es[k] === "number" ? String(es[k]) : rateDefaults[k];
        }
        setProductivityRates(loaded);

        const priceDefaults: Record<string, string> = {
          paint_price_per_liter: "150", floor_price_per_sqm: "300", tile_price_per_sqm: "500",
        };
        const loadedPrices: Record<string, string> = {};
        for (const k of Object.keys(priceDefaults)) {
          loadedPrices[k] = typeof es[k] === "number" ? String(es[k]) : priceDefaults[k];
        }
        setMaterialPrices(loadedPrices);
      }
      setCertifications(data.certifications || []);
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const isContractor = userType === "contractor";

      // Validate pro fields if enabling professional mode
      if (isProfessional && (!companyName.trim() || !contractorCategory)) {
        toast({
          title: t('errors.generic'),
          description: t('profile.proFieldsRequired'),
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      // Geocode address if contractor and address fields present
      let lat: number | null = null;
      let lng: number | null = null;
      if (isContractor && (companyAddress || companyCity)) {
        try {
          const parts = [companyAddress, companyPostalCode, companyCity, "Sweden"].filter(Boolean).join(", ");
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(parts)}&format=json&limit=1`,
            { headers: { "User-Agent": "Renofine/1.0" } }
          );
          const geo = await res.json();
          if (geo.length > 0) {
            lat = parseFloat(geo[0].lat);
            lng = parseFloat(geo[0].lon);
          }
        } catch {
          // Geocoding failure is non-critical
        }
      }

      const updateData: Record<string, unknown> = {
        name,
        phone,
        personnummer: personnummer.trim() || null,
        language_preference: languagePreference,
        measurement_system: measurementSystem,
        onboarding_user_type: userType,
        is_professional: isProfessional,
        // Only update contractor fields when in contractor mode — preserve existing values when switching to homeowner
        ...(isContractor ? {
          company_name: companyName,
          org_number: orgNumber,
          company_address: companyAddress,
          company_city: companyCity,
          company_postal_code: companyPostalCode,
          company_website: companyWebsite,
          company_logo_url: companyLogoUrl,
          bankgiro: bankgiro.trim() || null,
          bank_account_number: bankAccountNumber.trim() || null,
          default_payment_terms_days: parseInt(defaultPaymentTermsDays) || 30,
          default_hourly_rate: defaultHourlyRate ? parseFloat(defaultHourlyRate) : null,
          default_labor_cost_percent: parseFloat(defaultLaborCostPercent) || 50,
          estimation_settings: {
            paint_coverage_sqm_per_liter: parseFloat(paintCoverage) || 10,
            paint_coats: parseInt(paintCoats) || 2,
            ...Object.fromEntries(
              Object.entries(productivityRates).map(([k, v]) => [k, parseFloat(v) || 0])
            ),
            ...Object.fromEntries(
              Object.entries(materialPrices).map(([k, v]) => [k, parseFloat(v) || 0])
            ),
          },
        } : {}),
        // Only update professional listing fields when in professional mode — preserve when switching away
        ...(isProfessional ? {
          contractor_category: contractorCategory,
          company_description: companyDescription,
          certifications: certifications,
        } : {}),
      };

      if (lat !== null && lng !== null) {
        updateData.latitude = lat;
        updateData.longitude = lng;
      }

      const { error } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("user_id", user?.id);

      if (error) throw error;

      // Update i18n language if changed
      if (languagePreference !== i18n.language) {
        await i18n.changeLanguage(languagePreference);
      }

      // Save currency + measurement preferences to localStorage
      localStorage.setItem("admin_currency", defaultCurrency);
      localStorage.setItem("renofine_measurement_system", measurementSystem);

      // Mark onboarding profile step complete
      // For contractors: requires professional fields (is_professional, company_name, contractor_category)
      // For basic users: requires name and (phone or avatar)
      const isContractorProfileComplete = isProfessional && companyName?.trim() && contractorCategory?.trim();
      const isBasicProfileComplete = name.trim() && (phone?.trim() || profile?.avatar_url);
      if (isContractorProfileComplete || isBasicProfileComplete) {
        await supabase
          .from("profiles")
          .update({ onboarding_completed_profile: true })
          .eq("user_id", user?.id);
      }

      toast({
        title: t('profile.profileUpdated'),
        description: t('profile.profileUpdatedDescription'),
      });

      fetchProfile();
    } catch (error: unknown) {
      toast({
        title: t('errors.generic'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      toast({
        title: t('errors.generic'),
        description: t('profile.passwordsDoNotMatch'),
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: t('errors.generic'),
        description: t('profile.passwordTooShort'),
        variant: "destructive",
      });
      return;
    }

    setChangingPassword(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      toast({
        title: t('profile.passwordChanged'),
        description: t('profile.passwordChangedDescription'),
      });
      
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: unknown) {
      toast({
        title: t('errors.generic'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const handleExportData = async () => {
    setExportingData(true);
    try {
      await downloadUserDataAsJson();
      toast({
        title: t('profile.dataExported'),
        description: t('profile.dataExportedDescription'),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('errors.generic');
      toast({
        title: t('errors.generic'),
        description: message,
        variant: "destructive",
      });
    } finally {
      setExportingData(false);
    }
  };

  const compressLogo = (file: File, maxSize = 400): Promise<File> => {
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          resolve(new File([blob!], file.name, { type: "image/png" }));
        }, "image/png", 0.9);
      };
      img.src = URL.createObjectURL(file);
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setUploadingLogo(true);

    try {
      const compressed = await compressLogo(file, 400);
      const ext = file.name.split(".").pop() || "png";
      const path = `${profile.id}/${Date.now()}.${ext}`;

      // Delete old logo if exists
      if (companyLogoUrl) {
        const oldPath = companyLogoUrl.split("/company-logos/")[1];
        if (oldPath) await supabase.storage.from("company-logos").remove([oldPath]);
      }

      const { error } = await supabase.storage.from("company-logos").upload(path, compressed);
      if (error) {
        toast({ title: t("errors.generic"), description: error.message, variant: "destructive" });
        return;
      }

      const { data: { publicUrl } } = supabase.storage.from("company-logos").getPublicUrl(path);
      setCompanyLogoUrl(publicUrl);

      await supabase.from("profiles").update({ company_logo_url: publicUrl }).eq("user_id", user?.id);
      toast({ title: t("profile.logoUploaded") });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("errors.generic");
      toast({ title: t("errors.generic"), description: message, variant: "destructive" });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!companyLogoUrl || !profile) return;

    const oldPath = companyLogoUrl.split("/company-logos/")[1];
    if (oldPath) await supabase.storage.from("company-logos").remove([oldPath]);

    setCompanyLogoUrl(null);
    await supabase.from("profiles").update({ company_logo_url: null }).eq("user_id", user?.id);
    toast({ title: t("profile.logoRemoved") });
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setUploadingAvatar(true);

    try {
      const compressed = await compressLogo(file, 256);
      const ext = file.name.split(".").pop() || "png";
      const path = `${profile.id}/${Date.now()}.${ext}`;

      if (avatarUrl) {
        const oldPath = avatarUrl.split("/avatars/")[1];
        if (oldPath) await supabase.storage.from("avatars").remove([oldPath]);
      }

      const { error } = await supabase.storage.from("avatars").upload(path, compressed);
      if (error) {
        toast({ title: t("errors.generic"), description: error.message, variant: "destructive" });
        return;
      }

      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      setAvatarUrl(publicUrl);
      await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("user_id", user?.id);
      toast({ title: t("profile.avatarUploaded", "Profile photo updated") });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("errors.generic");
      toast({ title: t("errors.generic"), description: message, variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!avatarUrl || !profile) return;
    try {
      const oldPath = avatarUrl.split("/avatars/")[1];
      if (oldPath) await supabase.storage.from("avatars").remove([oldPath]);
      await supabase.from("profiles").update({ avatar_url: null }).eq("user_id", user?.id);
      setAvatarUrl(null);
      toast({ title: t("profile.avatarRemoved", "Profile photo removed") });
    } catch {
      toast({ title: t("errors.generic", "Something went wrong"), variant: "destructive" });
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const mainContent = (
    <main className={asDrawer ? "px-1 py-4 space-y-6" : "mx-auto px-4 py-8 max-w-3xl"}>
      {!asDrawer && (
        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-2">{t('profile.title')}</h2>
          <p className="text-muted-foreground">{t('profile.description')}</p>
        </div>
      )}

        <form onSubmit={handleSaveProfile} className="space-y-6">
          {/* Profile Information */}
          <Card>
            <CardHeader>
              <CardTitle>{t('profile.profileInfo')}</CardTitle>
              <CardDescription>{t('profile.profileInfoDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Avatar upload */}
                <div className="flex items-center gap-4">
                  <div className="relative group">
                    {avatarUrl ? (
                      <>
                        <img
                          src={avatarUrl}
                          alt={name}
                          className="h-16 w-16 rounded-full object-cover border"
                        />
                        <button
                          type="button"
                          onClick={handleRemoveAvatar}
                          className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </>
                    ) : (
                      <label className="h-16 w-16 rounded-full border-2 border-dashed flex items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors">
                        <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
                        {uploadingAvatar ? (
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        ) : (
                          <Upload className="h-5 w-5 text-muted-foreground" />
                        )}
                      </label>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{t("profile.profilePhoto", "Profile photo")}</p>
                    <p className="text-xs text-muted-foreground">{t("profile.profilePhotoHint", "Visible in comments and activity")}</p>
                    {avatarUrl && (
                      <label className="text-xs text-primary hover:underline cursor-pointer">
                        <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
                        {t("common.change", "Change")}
                      </label>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">{t('common.name')}</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('common.name')}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">{t('common.email')}</Label>
                  <Input
                    id="email"
                    value={profile?.email || user?.email || ""}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('profile.emailNotChangeable')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">{t('common.phone')}</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="language">{t('profile.defaultLanguage')}</Label>
                  <Select value={languagePreference} onValueChange={setLanguagePreference}>
                    <SelectTrigger id="language">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((lang) => (
                        <SelectItem key={lang.code} value={lang.code}>
                          <span className="flex items-center gap-2">
                            <span>{lang.flag}</span>
                            <span>{t(`languages.${lang.code}`)}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="currency">{t('profile.defaultCurrency')}</Label>
                  <Select value={defaultCurrency} onValueChange={setDefaultCurrency}>
                    <SelectTrigger id="currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SEK">SEK (kr)</SelectItem>
                      <SelectItem value="EUR">EUR (€)</SelectItem>
                      <SelectItem value="USD">USD ($)</SelectItem>
                      <SelectItem value="NOK">NOK (kr)</SelectItem>
                      <SelectItem value="DKK">DKK (kr)</SelectItem>
                      <SelectItem value="GBP">GBP (£)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t('profile.currencyDescription')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="measurement">{t('profile.measurementSystem', 'Measurement system')}</Label>
                  <Select value={measurementSystem} onValueChange={(v) => setMeasurementSystem(v as 'metric' | 'imperial')}>
                    <SelectTrigger id="measurement">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="metric">📏 Metric (m, cm, m²)</SelectItem>
                      <SelectItem value="imperial">📐 Imperial (ft, in, sq ft)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t('profile.measurementDescription', 'Used for floor plans, room dimensions, and material calculations')}
                  </p>
                </div>

                {userType === "homeowner" && (
                  <div className="space-y-2">
                    <Label htmlFor="personnummer">{t("profile.personnummer")}</Label>
                    <Input
                      id="personnummer"
                      value={personnummer}
                      onChange={(e) => setPersonnummer(e.target.value)}
                      placeholder="YYYYMMDD-XXXX"
                    />
                    {personnummer.trim() && !validatePersonnummer(personnummer).valid && (
                      <p className="text-sm text-destructive">
                        {t("rot.personnummerInvalid")}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {t("profile.personnummerHint")}
                    </p>
                  </div>
                )}
            </CardContent>
          </Card>

          {/* Account Type */}
          <Card>
            <CardHeader>
              <CardTitle>{t('profile.accountType')}</CardTitle>
              <CardDescription>
                {t('profile.accountTypeDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setUserType("homeowner")}
                  className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                    userType === "homeowner"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                    userType === "homeowner" ? "bg-primary/10" : "bg-muted"
                  }`}>
                    <Home className={`h-5 w-5 ${userType === "homeowner" ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-sm">{t('welcome.homeowner')}</p>
                    <p className="text-xs text-muted-foreground">{t('profile.homeownerShort')}</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setUserType("contractor")}
                  className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                    userType === "contractor"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                    userType === "contractor" ? "bg-primary/10" : "bg-muted"
                  }`}>
                    <Wrench className={`h-5 w-5 ${userType === "contractor" ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-sm">{t('welcome.contractor')}</p>
                    <p className="text-xs text-muted-foreground">{t('profile.contractorShort')}</p>
                  </div>
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Company Details — visible for all contractors */}
          {userType === "contractor" && (
            <CollapsibleCard
              title={t('profile.companyDetails')}
              description={t('profile.companyDetailsDescription')}
              defaultOpen={!companyName}
            >
                <div className="flex items-center gap-4">
                  {companyLogoUrl ? (
                    <div className="relative group">
                      <img src={companyLogoUrl} alt="" className="h-16 w-auto max-w-[200px] object-contain rounded border" />
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="h-16 w-32 border-2 border-dashed rounded flex items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors">
                      <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
                      {uploadingLogo ? (
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      ) : (
                        <Upload className="h-5 w-5 text-muted-foreground" />
                      )}
                    </label>
                  )}
                  <div>
                    <p className="text-sm font-medium">{t("profile.companyLogo")}</p>
                    <p className="text-xs text-muted-foreground">{t("profile.companyLogoHint")}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="companyName">{t('profile.companyName')}</Label>
                    <Input
                      id="companyName"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder={t('profile.companyNamePlaceholder')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="orgNumber">{t('profile.orgNumber')}</Label>
                    <Input
                      id="orgNumber"
                      value={orgNumber}
                      onChange={(e) => setOrgNumber(e.target.value)}
                      placeholder={t('profile.orgNumberPlaceholder')}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2 min-w-0">
                    <Label htmlFor="companyAddress">{t('profile.companyAddress')}</Label>
                    <Input
                      id="companyAddress"
                      value={companyAddress}
                      onChange={(e) => setCompanyAddress(e.target.value)}
                      placeholder={t('profile.companyAddressPlaceholder')}
                    />
                  </div>
                  <div className="space-y-2 min-w-0">
                    <Label htmlFor="companyPostalCode">{t('profile.companyPostalCode')}</Label>
                    <Input
                      id="companyPostalCode"
                      value={companyPostalCode}
                      onChange={(e) => setCompanyPostalCode(e.target.value)}
                      placeholder={t('profile.companyPostalCodePlaceholder')}
                    />
                  </div>
                  <div className="space-y-2 min-w-0">
                    <Label htmlFor="companyCity">{t('profile.companyCity')}</Label>
                    <Input
                      id="companyCity"
                      value={companyCity}
                      onChange={(e) => setCompanyCity(e.target.value)}
                      placeholder={t('profile.companyCityPlaceholder')}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyWebsite">{t('profile.companyWebsite')}</Label>
                  <Input
                    id="companyWebsite"
                    type="text"
                    value={companyWebsite}
                    onChange={(e) => setCompanyWebsite(e.target.value)}
                    placeholder={t('profile.companyWebsitePlaceholder')}
                  />
                </div>

                <Separator />

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bankgiro">{t('profile.bankgiro')}</Label>
                    <Input
                      id="bankgiro"
                      value={bankgiro}
                      onChange={(e) => setBankgiro(e.target.value)}
                      placeholder="123-4567"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bankAccountNumber">{t('profile.bankAccountNumber')}</Label>
                    <Input
                      id="bankAccountNumber"
                      value={bankAccountNumber}
                      onChange={(e) => setBankAccountNumber(e.target.value)}
                      placeholder="1234-12 345 67"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="defaultPaymentTerms">{t('profile.defaultPaymentTerms')}</Label>
                    <Select value={defaultPaymentTermsDays} onValueChange={setDefaultPaymentTermsDays}>
                      <SelectTrigger id="defaultPaymentTerms">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10 {t('profile.days')}</SelectItem>
                        <SelectItem value="15">15 {t('profile.days')}</SelectItem>
                        <SelectItem value="20">20 {t('profile.days')}</SelectItem>
                        <SelectItem value="30">30 {t('profile.days')}</SelectItem>
                        <SelectItem value="45">45 {t('profile.days')}</SelectItem>
                        <SelectItem value="60">60 {t('profile.days')}</SelectItem>
                        <SelectItem value="90">90 {t('profile.days')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {t('profile.defaultPaymentTermsHint')}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="defaultHourlyRate">{t('profile.defaultHourlyRate')}</Label>
                    <Input
                      id="defaultHourlyRate"
                      type="number"
                      step="1"
                      min="0"
                      value={defaultHourlyRate}
                      onChange={(e) => setDefaultHourlyRate(e.target.value)}
                      placeholder={t('profile.defaultHourlyRatePlaceholder', 'e.g. 550')}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('profile.defaultHourlyRateHint')} <span className="text-muted-foreground/70">{t('estimation.exMomsShort', '(ex moms)')}</span>
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="defaultLaborCostPercent">{t('profile.defaultLaborCostPercent')}</Label>
                    <Input
                      id="defaultLaborCostPercent"
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      value={defaultLaborCostPercent}
                      onChange={(e) => setDefaultLaborCostPercent(e.target.value)}
                      placeholder="50"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('profile.defaultLaborCostPercentHint')}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('profile.paymentFieldsHint')}
                </p>

                <p className="text-xs text-muted-foreground">
                  {t('profile.companyDetailsHint')}
                </p>
            </CollapsibleCard>
          )}

          {/* Calculation Settings — all users (productivity rates hidden for homeowners) */}
          <CollapsibleCard
            title={t('estimation.title')}
            description={t('estimation.description')}
            icon={<Calculator className="h-5 w-5 text-primary shrink-0" />}
          >
                <div>
                  <h4 className="text-sm font-medium mb-2">{t('estimation.paintFormula')}</h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    {t('estimation.paintFormulaDesc')}
                  </p>
                  <div className="grid grid-cols-2 gap-4 max-w-sm">
                    <div className="space-y-1">
                      <Label htmlFor="paintCoverage">{t('estimation.coverage')}</Label>
                      <Input
                        id="paintCoverage"
                        type="number"
                        step="0.5"
                        min="1"
                        value={paintCoverage}
                        onChange={(e) => setPaintCoverage(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="paintCoats">{t('estimation.coats')}</Label>
                      <Input
                        id="paintCoats"
                        type="number"
                        step="1"
                        min="1"
                        max="5"
                        value={paintCoats}
                        onChange={(e) => setPaintCoats(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                <Separator className="my-4" />
                <div>
                  <h4 className="text-sm font-medium mb-1">{t('estimation.materialPrices', 'Material prices')}</h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    {t('estimation.materialPricesDesc', 'Default unit prices for material estimation.')} <span className="text-muted-foreground/70">{t('estimation.exMomsHint', 'Enter prices ex. VAT (25% is added on quotes/invoices).')}</span>
                  </p>
                  <div className="grid grid-cols-3 gap-3 max-w-lg">
                    {[
                      { key: "paint_price_per_liter", label: "workTypes.painting", unit: "SEK/L" },
                      { key: "floor_price_per_sqm", label: "workTypes.flooring", unit: "SEK/m²" },
                      { key: "tile_price_per_sqm", label: "workTypes.tiling", unit: "SEK/m²" },
                    ].map(({ key, label, unit }) => (
                      <div key={key} className="space-y-1">
                        <Label htmlFor={key} className="text-xs">{t(label)} ({unit})</Label>
                        <Input
                          id={key}
                          type="number"
                          step="10"
                          min="0"
                          className="h-8 text-sm"
                          value={materialPrices[key] || ""}
                          onChange={(e) => setMaterialPrices((prev) => ({ ...prev, [key]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                {/* Productivity rates — proffs only */}
                {userType === "contractor" && (<>
                <Separator className="my-4" />
                <div>
                  <h4 className="text-sm font-medium mb-1">{t('estimation.productivityRates', 'Productivity rates')}</h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    {t('estimation.productivityRatesDesc', 'Square meters per hour for each work type. Used by auto-estimate.')}
                  </p>
                  <div className="grid grid-cols-3 gap-3 max-w-lg">
                    {[
                      { key: "paint_sqm_per_hour", label: "workTypes.painting" },
                      { key: "floor_sqm_per_hour", label: "workTypes.flooring" },
                      { key: "tile_sqm_per_hour", label: "workTypes.tiling" },
                      { key: "demolition_sqm_per_hour", label: "workTypes.demolition" },
                      { key: "spackling_sqm_per_hour", label: "workTypes.spackling" },
                      { key: "sanding_sqm_per_hour", label: "workTypes.sanding" },
                      { key: "carpentry_sqm_per_hour", label: "workTypes.carpentry" },
                      { key: "electrical_sqm_per_hour", label: "workTypes.electrical" },
                      { key: "plumbing_sqm_per_hour", label: "workTypes.plumbing" },
                    ].map(({ key, label }) => (
                      <div key={key} className="space-y-1">
                        <Label htmlFor={key} className="text-xs">{t(label)} (m²/h)</Label>
                        <Input
                          id={key}
                          type="number"
                          step="0.5"
                          min="0.5"
                          className="h-8 text-sm"
                          value={productivityRates[key] || ""}
                          onChange={(e) => setProductivityRates((prev) => ({ ...prev, [key]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                </>)}
            </CollapsibleCard>

          {/* Feature Modules — toggle which features are visible */}
          {userType === "contractor" && (
            <ModulesSection profileSize="small" />
          )}

          {/* Professional Profile — hidden for homeowners */}
          {userType !== "homeowner" && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <BadgeCheck className="h-5 w-5 text-primary" />
                    {t('profile.professionalProfile')}
                    {isProfessional && (
                      <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-medium">
                        {t('profile.proBadge')}
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {t('profile.professionalProfileDescription')}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t('profile.enableProfessional')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t('profile.enableProfessionalDescription')}
                  </p>
                </div>
                <Switch
                  checked={isProfessional}
                  onCheckedChange={setIsProfessional}
                />
              </div>

              {isProfessional && (
                <>
                  <Separator />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="contractorCategory">{t('profile.professionalCategory')} *</Label>
                      <Select value={contractorCategory} onValueChange={setContractorCategory}>
                        <SelectTrigger id="contractorCategory">
                          <SelectValue placeholder={t('profile.selectCategory')} />
                        </SelectTrigger>
                        <SelectContent>
                          {PROFESSIONAL_CATEGORIES.map((cat) => (
                            <SelectItem key={cat.value} value={cat.value}>
                              {t(cat.labelKey)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="companyDescription">{t('profile.companyDescription')}</Label>
                    <Textarea
                      id="companyDescription"
                      value={companyDescription}
                      onChange={(e) => setCompanyDescription(e.target.value)}
                      placeholder={t('profile.companyDescriptionPlaceholder')}
                      rows={3}
                    />
                  </div>

                  <Separator />

                  {/* Certifications */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      {t('certifications.title')}
                    </h3>

                    {/* Preset certifications */}
                    {contractorCategory && CERTIFICATION_PRESETS[contractorCategory] && (
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">{t('certifications.preset')}</Label>
                        <div className="space-y-2">
                          {CERTIFICATION_PRESETS[contractorCategory].map((preset) => {
                            const isChecked = certifications.some(c => !c.custom && c.name === preset.name);
                            return (
                              <div key={preset.name} className="flex items-center gap-2">
                                <Checkbox
                                  id={`cert-${preset.name}`}
                                  checked={isChecked}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setCertifications(prev => [...prev, {
                                        id: crypto.randomUUID(),
                                        name: preset.name,
                                        issuer: preset.issuer,
                                        year: "",
                                        custom: false,
                                      }]);
                                    } else {
                                      setCertifications(prev => prev.filter(c => !(c.name === preset.name && !c.custom)));
                                    }
                                  }}
                                />
                                <label htmlFor={`cert-${preset.name}`} className="text-sm cursor-pointer">
                                  {t(preset.labelKey)}
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Custom certifications */}
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">{t('certifications.custom')}</Label>
                      {certifications.filter(c => c.custom).map((cert) => (
                        <div key={cert.id} className="flex items-center gap-2">
                          <Input
                            value={cert.name}
                            onChange={(e) => setCertifications(prev => prev.map(c => c.id === cert.id ? { ...c, name: e.target.value } : c))}
                            placeholder={t('certifications.name')}
                            className="flex-1"
                          />
                          <Input
                            value={cert.issuer}
                            onChange={(e) => setCertifications(prev => prev.map(c => c.id === cert.id ? { ...c, issuer: e.target.value } : c))}
                            placeholder={t('certifications.issuer')}
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setCertifications(prev => prev.filter(c => c.id !== cert.id))}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setCertifications(prev => [...prev, {
                          id: crypto.randomUUID(),
                          name: "",
                          issuer: "",
                          year: "",
                          custom: true,
                        }])}
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        {t('certifications.addCustom')}
                      </Button>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setPreviewOpen(true)}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    {t('marketplace.publicProfile')}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
          )}

          {/* Save button for all profile fields */}
          <Button type="submit" disabled={saving} className="w-full" size="lg">
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('profile.saving')}
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                {t('profile.saveChanges')}
              </>
            )}
          </Button>
        </form>

        {/* Change Password */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t('profile.changePassword')}</CardTitle>
            <CardDescription>{t('profile.changePasswordDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">{t('profile.newPassword')}</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t('profile.newPasswordPlaceholder')}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t('profile.confirmPassword')}</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('profile.confirmPasswordPlaceholder')}
                  required
                />
              </div>

              <Button type="submit" disabled={changingPassword} className="w-full">
                {changingPassword ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('profile.changingPassword')}
                  </>
                ) : (
                  t('profile.changePassword')
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Data & Privacy — minimal footer */}
        <div className="mt-8 mb-4 flex items-center justify-center gap-1 text-xs text-muted-foreground">
          <button
            type="button"
            className="inline-flex items-center gap-1 hover:text-foreground transition-colors underline-offset-2 hover:underline"
            onClick={handleExportData}
            disabled={exportingData}
          >
            {exportingData ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Download className="h-3 w-3" />
            )}
            {t('profile.exportData')}
          </button>
          <span>·</span>
          <span>GDPR</span>
        </div>
      </main>
  );

  if (asDrawer) return mainContent;

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <AppHeader
        userName={profile?.name}
        userEmail={profile?.email || user?.email}
        avatarUrl={profile?.avatar_url || undefined}
        onSignOut={handleSignOut}
      />
      {mainContent}
      <PublicProfileSheet
        profileId={profile?.id || null}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        showContact={false}
      />
    </div>
  );
};

export default Profile;
