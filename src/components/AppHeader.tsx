import { useEffect, useState, lazy, Suspense } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { LogOut, User, Globe, Lightbulb, MessageSquare, FolderOpen, ChevronDown, MoreHorizontal, Users, FileText, BarChart3, Sparkles } from "lucide-react";
const ProfileDrawer = lazy(() => import("@/components/ProfileDrawer").then(m => ({ default: m.ProfileDrawer })));
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { NotificationBell } from "@/components/NotificationBell";
import { GlobalSearch } from "@/components/GlobalSearch";
import { supabase } from "@/integrations/supabase/client";
import { PUBLIC_DEMO_PROJECT_ID, PUBLIC_DEMO_PROJECT_TYPE } from "@/constants/publicDemo";
import { isDemoProject } from "@/services/demoProjectService";
import { useAuthSession } from "@/hooks/useAuthSession";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarColor } from "@/lib/avatarColor";
import { useIsProfessional } from "@/hooks/useIsProfessional";

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '\u{1F1EC}\u{1F1E7}' },
  { code: 'sv', name: 'Swedish', flag: '\u{1F1F8}\u{1F1EA}' },
  { code: 'de', name: 'German', flag: '\u{1F1E9}\u{1F1EA}' },
  { code: 'fr', name: 'French', flag: '\u{1F1EB}\u{1F1F7}' },
  { code: 'es', name: 'Spanish', flag: '\u{1F1EA}\u{1F1F8}' },
  { code: 'pl', name: 'Polish', flag: '\u{1F1F5}\u{1F1F1}' },
  { code: 'uk', name: 'Ukrainian', flag: '\u{1F1FA}\u{1F1E6}' },
  { code: 'ro', name: 'Romanian', flag: '\u{1F1F7}\u{1F1F4}' },
  { code: 'lt', name: 'Lithuanian', flag: '\u{1F1F1}\u{1F1F9}' },
  { code: 'et', name: 'Estonian', flag: '\u{1F1EA}\u{1F1EA}' },
];

interface SimpleProject {
  id: string;
  name: string;
  project_type: string | null;
}

interface SimpleQuote {
  id: string;
  title: string;
  project_name: string | null;
}

interface AppHeaderProps {
  userName?: string;
  userEmail?: string;
  avatarUrl?: string;
  onSignOut?: () => void;
  children?: React.ReactNode;
  isGuest?: boolean;
  guestUserType?: string | null;
  onGuestRoleChange?: (role: string) => void;
}

export const AppHeader = ({ userName, userEmail, avatarUrl, onSignOut, children, isGuest = false, guestUserType, onGuestRoleChange }: AppHeaderProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { i18n, t } = useTranslation();
  const { user } = useAuthSession();
  const [projects, setProjects] = useState<SimpleProject[]>([]);
  const [quotes, setQuotes] = useState<SimpleQuote[]>([]);
  const { isProfessional } = useIsProfessional();

  const isProjectMode = !!children;
  const [profileDrawerOpen, setProfileDrawerOpen] = useState(false);

  const initials = userName
    ? userName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'U';

  const currentLanguage = LANGUAGES.find(lang => lang.code === i18n.language) || LANGUAGES[0];

  useEffect(() => {
    // Skip data fetching for guest users
    if (!user || isGuest) return;

    let cancelled = false;
    (async () => {
      // Resolve profile.id so we can scope explicitly. RLS lets system_admins
      // see every project across the DB, which would turn "Mina Projekt" into
      // "All projects". Trust the user's scope, not the policy.
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      const profileId = profile?.id;
      if (!profileId || cancelled) return;

      // Own projects + shared with me. Exclude the global public demo since
      // its RLS exposes it to every logged-in user.
      //
      // The OR-with-IS-NULL pattern is required because SQL `!=` is unsafe
      // against NULL — `NULL != 'public_demo'` evaluates to NULL, not TRUE,
      // which silently drops every project_type=NULL row from the result.
      const publicDemoFilter = `project_type.is.null,project_type.neq.${PUBLIC_DEMO_PROJECT_TYPE}`;
      const [ownRes, sharesRes] = await Promise.all([
        supabase
          .from("projects")
          .select("id, name, project_type, created_at")
          .eq("owner_id", profileId)
          .is("deleted_at", null)
          .or(publicDemoFilter)
          .order("created_at", { ascending: false }),
        supabase
          .from("project_shares")
          .select("project_id")
          .eq("shared_with_user_id", profileId),
      ]);

      let sharedRows: SimpleProject[] = [];
      const sharedIds = (sharesRes.data || []).map((s) => s.project_id);
      if (sharedIds.length > 0) {
        const { data } = await supabase
          .from("projects")
          .select("id, name, project_type, created_at")
          .in("id", sharedIds)
          .is("deleted_at", null)
          .or(publicDemoFilter);
        sharedRows = (data || []) as SimpleProject[];
      }

      if (cancelled) return;
      const merged = [...(ownRes.data || []) as SimpleProject[]];
      for (const sp of sharedRows) {
        if (!merged.some((p) => p.id === sp.id)) merged.push(sp);
      }
      setProjects(merged);

      // Quotes for the same project scope (own + shared). Limit 10, newest
      // updated first. Skipping quotes whose project is the public demo too.
      const projectIds = merged.map((p) => p.id);
      if (projectIds.length === 0) {
        setQuotes([]);
        return;
      }
      const { data: quotesData } = await supabase
        .from("quotes")
        .select("id, title, project:projects!quotes_project_id_fkey(name)")
        .in("project_id", projectIds)
        .neq("project_id", PUBLIC_DEMO_PROJECT_ID)
        .order("updated_at", { ascending: false })
        .limit(10);
      if (cancelled) return;
      if (quotesData) {
        setQuotes(quotesData.map((q) => ({
          id: q.id,
          title: q.title,
          project_name: (q.project as { name: string } | null)?.name || null,
        })));
      }
    })();

    return () => { cancelled = true; };
  }, [user, isGuest]);

  const handleLanguageChange = async (langCode: string) => {
    await i18n.changeLanguage(langCode);
    if (user) {
      try {
        await supabase
          .from("profiles")
          .update({ language_preference: langCode })
          .eq("user_id", user.id);
      } catch (error) {
        console.error("Error updating language preference:", error);
      }
    }
  };

  const isActive = (path: string) => location.pathname === path;

  const siteNavLinks = (
    <>
      <button
        type="button"
        className={`px-2.5 py-1.5 text-[13px] tracking-[-0.002em] rounded-md transition-colors ${isActive("/tips") ? "bg-accent/60 text-foreground font-medium" : "text-muted-foreground hover:text-foreground font-normal"}`}
        onClick={() => navigate("/tips")}
      >
        {t('nav.tips')}
      </button>
      <button
        type="button"
        className={`px-2.5 py-1.5 text-[13px] tracking-[-0.002em] rounded-md transition-colors ${isActive("/changelog") ? "bg-accent/60 text-foreground font-medium" : "text-muted-foreground hover:text-foreground font-normal"}`}
        onClick={() => navigate("/changelog")}
      >
        {t('nav.changelog', "What's new")}
      </button>
      <button
        type="button"
        className={`px-2.5 py-1.5 text-[13px] tracking-[-0.002em] rounded-md transition-colors ${isActive("/feedback") ? "bg-accent/60 text-foreground font-medium" : "text-muted-foreground hover:text-foreground font-normal"}`}
        onClick={() => navigate("/feedback")}
      >
        {t('nav.feedback')}
      </button>
    </>
  );

  const hasDropdownItems = projects.length > 0 || quotes.length > 0;

  const projectsDropdown = hasDropdownItems ? (
    <div className="flex items-center">
      <button
        type="button"
        className={`px-2.5 py-1.5 text-[13px] tracking-[-0.002em] rounded-l-md transition-colors ${isActive("/start") ? "bg-accent/60 text-foreground font-medium" : "text-muted-foreground hover:text-foreground font-normal"}`}
        onClick={() => navigate("/start")}
      >
        {t('nav.start')}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="px-1 py-1.5 rounded-r-md text-muted-foreground hover:text-foreground transition-colors">
            <ChevronDown className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64 bg-popover z-[100]">
          {/* Mina Projekt */}
          {projects.length > 0 && (
            <>
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                {t('nav.myProjects')}
              </DropdownMenuLabel>
              {projects.map((proj) => (
                <DropdownMenuItem
                  key={proj.id}
                  onClick={() => navigate(`/projects/${proj.id}`)}
                  className="cursor-pointer"
                >
                  <FolderOpen className="mr-2 h-4 w-4" />
                  <span className="truncate">{proj.name}</span>
                  {isDemoProject(proj.project_type) && (
                    <span className="ml-2 shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                      {t("demoProject.badge", "Demo")}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </>
          )}

          {/* Deklarationsunderlag - homeowners only */}
          {!isProfessional && projects.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => navigate("/start#deklaration")}
                className="cursor-pointer"
              >
                <BarChart3 className="mr-2 h-4 w-4" />
                <span>{t('nav.declaration', 'Deklarationsunderlag')}</span>
              </DropdownMenuItem>
            </>
          )}

          {/* Mina Offerter */}
          {quotes.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                {t('nav.myQuotes')}
              </DropdownMenuLabel>
              {quotes.map((quote) => (
                <DropdownMenuItem
                  key={quote.id}
                  onClick={() => navigate(`/quotes/${quote.id}`)}
                  className="cursor-pointer flex flex-col items-start"
                >
                  <span className="truncate font-medium">{quote.title}</span>
                  {quote.project_name && (
                    <span className="text-xs text-muted-foreground truncate">
                      {quote.project_name}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  ) : (
    <button
      type="button"
      className={`px-2.5 py-1.5 text-[13px] tracking-[-0.002em] rounded-md transition-colors ${isActive("/start") ? "bg-accent/60 text-foreground font-medium" : "text-muted-foreground hover:text-foreground font-normal"}`}
      onClick={() => navigate("/start")}
    >
      {t('nav.start')}
    </button>
  );

  return (
    <>
    <header className="border-b border-border/60 bg-card sticky top-0 z-50 h-[52px]">
      <div className="container mx-auto px-5 h-full flex items-center gap-5">
        <div
          className="flex items-center cursor-pointer shrink-0"
          onClick={() => navigate(user && !isGuest ? "/start" : "/")}
        >
          <img src="/brand/svg/lockup/lockup-horizontal-green.svg" alt="Renofine" className="h-7 w-auto" />
        </div>

        {isProjectMode ? (
          /* Project mode: children contain project tabs */
          <div className="flex-1 min-w-0">
            {children}
          </div>
        ) : (
          /* Default mode: show projects dropdown + site nav links */
          <div className="flex-1 flex items-center gap-0.5">
            {projectsDropdown}
            <div className="hidden md:flex items-center gap-0.5 ml-3">
              {siteNavLinks}
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 shrink-0">
          <GlobalSearch />
          <NotificationBell />

          {/* In project mode, show a "more" menu with site nav links */}
          {isProjectMode && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <MoreHorizontal className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => navigate("/start")} className="cursor-pointer">
                  <FolderOpen className="mr-2 h-4 w-4" />
                  <span>{t('nav.myStart')}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {isProfessional && (
                  <DropdownMenuItem onClick={() => navigate("/clients")} className="cursor-pointer">
                    <Users className="mr-2 h-4 w-4" />
                    <span>{t('clients.title')}</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => navigate("/tips")} className="cursor-pointer">
                  <Lightbulb className="mr-2 h-4 w-4" />
                  <span>{t('nav.tips')}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/changelog")} className="cursor-pointer">
                  <Sparkles className="mr-2 h-4 w-4" />
                  <span>{t('nav.changelog', "What's new")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/feedback")} className="cursor-pointer">
                  <MessageSquare className="mr-2 h-4 w-4" />
                  <span>{t('nav.feedback')}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Mobile "more" menu for default mode (site links hidden on small screens) */}
          {!isProjectMode && (
            <div className="md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9">
                    <MoreHorizontal className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {isProfessional && (
                    <DropdownMenuItem onClick={() => navigate("/clients")} className="cursor-pointer">
                      <Users className="mr-2 h-4 w-4" />
                      <span>{t('clients.title')}</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => navigate("/tips")} className="cursor-pointer">
                    <Lightbulb className="mr-2 h-4 w-4" />
                    <span>{t('nav.tips')}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/changelog")} className="cursor-pointer">
                    <Sparkles className="mr-2 h-4 w-4" />
                    <span>{t('nav.changelog', "What's new")}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/feedback")} className="cursor-pointer">
                    <MessageSquare className="mr-2 h-4 w-4" />
                    <span>{t('nav.feedback')}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 md:h-9 md:w-9 rounded-full">
                <Avatar className="h-10 w-10 md:h-9 md:w-9">
                  <AvatarImage src={avatarUrl} alt={userName} />
                  <AvatarFallback className={`text-sm font-medium ${getAvatarColor(userName || userEmail || "")}`}>
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <div className="flex flex-col space-y-1 p-2">
                <p className="text-sm font-medium leading-none">{userName || 'User'}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {userEmail || ''}
                </p>
                {isGuest && guestUserType && (
                  <button
                    className="text-xs leading-none text-muted-foreground/70 hover:text-foreground transition-colors text-left flex items-center gap-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      const newRole = guestUserType === 'homeowner' ? 'contractor' : 'homeowner';
                      onGuestRoleChange?.(newRole);
                    }}
                  >
                    {guestUserType === 'homeowner' ? t('roles.homeowner', 'Homeowner') : t('roles.contractor', 'Contractor')}
                    <span className="text-[10px] text-muted-foreground/50">({t('common.change', 'change')})</span>
                  </button>
                )}
              </div>
              <DropdownMenuSeparator />
              {!isGuest && (
                <>
                  <DropdownMenuItem onClick={() => setProfileDrawerOpen(true)} className="cursor-pointer">
                    <User className="mr-2 h-4 w-4" />
                    <span>{t('nav.profile')}</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Globe className="mr-2 h-4 w-4" />
                  <span>{currentLanguage.flag} {t('nav.language', 'Language')}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={i18n.language} onValueChange={handleLanguageChange}>
                    {LANGUAGES.map((lang) => (
                      <DropdownMenuRadioItem key={lang.code} value={lang.code} className="cursor-pointer">
                        <span className="mr-2">{lang.flag}</span>
                        {t(`languages.${lang.code}`)}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              {isGuest ? (
                <DropdownMenuItem onClick={() => navigate("/auth")} className="cursor-pointer text-primary">
                  <User className="mr-2 h-4 w-4" />
                  <span>{t('common.signIn')}</span>
                </DropdownMenuItem>
              ) : onSignOut ? (
                <DropdownMenuItem onClick={onSignOut} className="cursor-pointer text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>{t('common.signOut')}</span>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
    <Suspense fallback={null}>
      {profileDrawerOpen && (
        <ProfileDrawer open={profileDrawerOpen} onOpenChange={setProfileDrawerOpen} />
      )}
    </Suspense>
    </>
  );
};
