import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";
import { GuestMigrationDialog } from "@/components/guest";
import { hasGuestProjectsToMigrate, migrateGuestProjects } from "@/services/guestMigrationService";
import { useGuestMode } from "@/hooks/useGuestMode";
import { analytics, AnalyticsEvents } from "@/lib/analytics";

const Auth = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [showResetForm, setShowResetForm] = useState(false);
  const [showMigrationDialog, setShowMigrationDialog] = useState(false);
  const [profileIdForMigration, setProfileIdForMigration] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const redirect = searchParams.get("redirect");
  const { exitGuestMode } = useGuestMode();

  // Check for migration after successful OAuth callback
  useEffect(() => {
    const checkForMigration = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session && hasGuestProjectsToMigrate()) {
        // Get profile ID
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", session.user.id)
          .single();

        if (profile) {
          setProfileIdForMigration(profile.id);
          setShowMigrationDialog(true);
        }
      }
    };
    checkForMigration();
  }, []);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (password !== confirmPassword) {
      toast({
        title: t('common.error'),
        description: t('auth.passwordMismatch', 'Passwords do not match'),
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    try {
      const { error, data } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
          },
          emailRedirectTo: `${window.location.origin}/start?confirmed=true`,
        },
      });

      if (error) throw error;

      // Track signup completion deterministically here. The email-confirmation
      // flow never reaches the SIGNED_IN session event (and OAuth is handled in
      // useAuthSession), so this is the reliable signal for email signups.
      if (data.user) {
        analytics.capture(AnalyticsEvents.SIGNUP_COMPLETED, {
          method: "email",
          email_confirmation_required: !data.session,
        });
      }

      // Email confirmation required — no session returned
      if (data.user && !data.session) {
        toast({
          title: t('auth.checkEmail', 'Check your email'),
          description: t('auth.confirmEmailDescription', 'We sent a confirmation link to {{email}}. Click it to activate your account.', { email }),
        });
        setLoading(false);
        return;
      }

      toast({
        title: t('auth.accountCreated', 'Account created!'),
        description: t('auth.welcomeAboard', 'Welcome to Renofine!'),
      });

      // Brand-new account: silently carry over any guest projects — the user
      // just built them and signed up to keep them, so don't ask.
      if (data.user) {
        if (hasGuestProjectsToMigrate()) {
          // The profile row is created by a DB trigger; retry briefly in case
          // it isn't visible yet right after signUp returns.
          let profileId: string | null = null;
          for (let attempt = 0; attempt < 5 && !profileId; attempt++) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("id")
              .eq("user_id", data.user.id)
              .maybeSingle();
            if (profile) profileId = profile.id;
            else await new Promise((r) => setTimeout(r, 600));
          }

          if (profileId) {
            const result = await migrateGuestProjects(profileId);
            if (result.migratedProjects > 0) {
              toast({
                title: t('guest.autoMigrated', 'Your project came along!'),
                description: t('guest.autoMigratedDescription', 'Everything you created as a guest is now saved to your account.'),
              });
              exitGuestMode();
              navigate(
                result.newProjectIds.length === 1
                  ? `/projects/${result.newProjectIds[0]}`
                  : "/start"
              );
              return;
            }
          }
          // Migration didn't run — keep guest data; the /start safety net
          // will offer migration there instead.
          navigate(redirect || "/start");
          return;
        }
        exitGuestMode();
        navigate(redirect || "/start");
      }
    } catch (error: unknown) {
      toast({
        title: t('common.error'),
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error, data } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Store Remember Me preference
      if (rememberMe) {
        localStorage.setItem("rememberMe", "true");
      } else {
        localStorage.removeItem("rememberMe");
      }

      toast({
        title: t('auth.welcomeBack', 'Welcome back!'),
        description: t('auth.signInSuccess', "You've successfully signed in."),
      });

      // Check for guest projects to migrate
      if (hasGuestProjectsToMigrate()) {
        // Get profile ID
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", data.user.id)
          .single();

        if (profile) {
          setProfileIdForMigration(profile.id);
          setShowMigrationDialog(true);
          return;
        }
      }

      // No migration needed, proceed to redirect
      exitGuestMode();
      setTimeout(() => {
        navigate(redirect || "/start");
      }, 100);
    } catch (error: unknown) {
      toast({
        title: t('common.error'),
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/start`,
        },
      });

      if (error) throw error;
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      setGoogleLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({
        title: "Email required",
        description: "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }

    setResetLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth?reset=true`,
      });

      if (error) throw error;

      toast({
        title: "Reset link sent",
        description: "Check your email for a password reset link.",
      });
      setShowResetForm(false);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to send reset email";
      toast({
        title: "Error",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center mb-8">
          <a href="/">
            <img src="/brand/svg/lockup/lockup-horizontal-green.svg" alt="Renofine" className="h-10 w-auto cursor-pointer" />
          </a>
        </div>

        {redirect && (
          <div className="mb-4 bg-primary/10 text-primary border border-primary/20 rounded-lg p-3 text-sm text-center">
            {t('auth.invitationPrompt', 'Sign in or create an account to accept your invitation.')}
          </div>
        )}

        <Card className="border-border">
          <CardHeader>
            <CardTitle>{t('auth.welcome', 'Welcome')}</CardTitle>
            <CardDescription>{t('auth.welcomeDescription', 'Sign in or create an account to get started')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">{t('auth.signIn', 'Sign In')}</TabsTrigger>
                <TabsTrigger value="signup">{t('auth.signUp', 'Sign Up')}</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">{t('auth.email', 'Email')}</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password">{t('auth.password', 'Password')}</Label>
                    <Input
                      id="signin-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="remember-me"
                        checked={rememberMe}
                        onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                      />
                      <Label htmlFor="remember-me" className="text-sm font-normal cursor-pointer">
                        {t('auth.rememberMe', 'Remember me for 30 days')}
                      </Label>
                    </div>
                    <button
                      type="button"
                      className="text-sm text-primary hover:underline"
                      onClick={() => setShowResetForm(true)}
                    >
                      {t('auth.forgotPassword', 'Forgot password?')}
                    </button>
                  </div>
                  {showResetForm && (
                    <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                      <p className="text-sm text-muted-foreground">
                        {t('auth.resetInstructions', 'Enter your email above and click below to receive a reset link.')}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        disabled={resetLoading || !email}
                        onClick={handleResetPassword}
                      >
                        {resetLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {t('auth.sending', 'Sending...')}
                          </>
                        ) : (
                          t('auth.sendResetLink', 'Send Reset Link')
                        )}
                      </Button>
                    </div>
                  )}
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? t('auth.signingIn', 'Signing in...') : t('auth.signIn', 'Sign In')}
                  </Button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <Separator />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">{t('auth.orContinueWith', 'Or continue with')}</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={handleGoogleSignIn}
                    disabled={googleLoading}
                  >
                    {googleLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('auth.connecting', 'Connecting...')}
                      </>
                    ) : (
                      <>
                        <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                          <path
                            fill="currentColor"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          />
                          <path
                            fill="currentColor"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          />
                          <path
                            fill="currentColor"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                          />
                          <path
                            fill="currentColor"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                          />
                        </svg>
                        {t('auth.signInWithGoogle', 'Sign in with Google')}
                      </>
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">{t('auth.name', 'Name')}</Label>
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder={t('auth.namePlaceholder', 'Your name')}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">{t('auth.email', 'Email')}</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">{t('auth.password', 'Password')}</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-confirm-password">{t('auth.confirmPassword', 'Confirm password')}</Label>
                    <Input
                      id="signup-confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? t('auth.creatingAccount', 'Creating account...') : t('auth.createAccount', 'Create Account')}
                  </Button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <Separator />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">{t('auth.orContinueWith', 'Or continue with')}</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={handleGoogleSignIn}
                    disabled={googleLoading}
                  >
                    {googleLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('auth.connecting', 'Connecting...')}
                      </>
                    ) : (
                      <>
                        <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                          <path
                            fill="currentColor"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          />
                          <path
                            fill="currentColor"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          />
                          <path
                            fill="currentColor"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                          />
                          <path
                            fill="currentColor"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                          />
                        </svg>
                        {t('auth.signUpWithGoogle', 'Sign up with Google')}
                      </>
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Guest Migration Dialog */}
      {profileIdForMigration && (
        <GuestMigrationDialog
          open={showMigrationDialog}
          onOpenChange={setShowMigrationDialog}
          profileId={profileIdForMigration}
          onComplete={() => {
            exitGuestMode();
            navigate(redirect || "/start");
          }}
        />
      )}
    </div>
  );
};

export default Auth;
