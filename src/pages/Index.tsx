import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useGuestMode } from "@/hooks/useGuestMode";
import { PUBLIC_DEMO_PROJECT_ID } from "@/constants/publicDemo";
import { GuestRoleModal } from "@/components/guest/GuestRoleModal";
import { PublicNav } from "@/components/landing/PublicNav";
import { HeroSection } from "@/components/landing/sections/HeroSection";
import { LogoStrip } from "@/components/landing/sections/LogoStrip";
import { StatsBand } from "@/components/landing/sections/StatsBand";
import { BuilderFeatures } from "@/components/landing/sections/BuilderFeatures";
import { HomeownerSection } from "@/components/landing/sections/HomeownerSection";
import { TestimonialSection } from "@/components/landing/sections/TestimonialSection";
import { PricingSection } from "@/components/landing/sections/PricingSection";
import { FAQSection } from "@/components/landing/sections/FAQSection";
import { FinalCTA } from "@/components/landing/sections/FinalCTA";
import { LandingFooter } from "@/components/landing/sections/LandingFooter";

const Index = () => {
  const navigate = useNavigate();
  const { enterGuestMode } = useGuestMode();
  const [showRoleModal, setShowRoleModal] = useState(false);

  useEffect(() => {
    const guestState = localStorage.getItem("renofine_guest_mode");
    if (guestState) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/start");
      }
    });
  }, [navigate]);

  const handleCta = useCallback(() => {
    setShowRoleModal(true);
  }, []);

  const handleLogin = useCallback(() => {
    navigate("/auth");
  }, [navigate]);

  const handleDemo = useCallback(() => {
    localStorage.setItem("demo_view_role", "contractor");
    // Land on Översikt — cover photo, room photos and budget cards make a
    // warmer first impression than the raw task table.
    navigate(`/projects/${PUBLIC_DEMO_PROJECT_ID}`);
  }, [navigate]);

  const handleDemoTab = useCallback(
    (tab: string) => {
      localStorage.setItem("demo_view_role", "contractor");
      navigate(`/projects/${PUBLIC_DEMO_PROJECT_ID}?tab=${tab}`);
    },
    [navigate]
  );

  const handleScrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <div
      data-page="landing"
      style={{
        minHeight: "100vh",
        fontFamily: '"Inter Tight", "Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <PublicNav onCta={handleCta} onLogin={handleLogin} onScrollTo={handleScrollTo} />
      <HeroSection onCta={handleCta} onDemo={handleDemo} onScreenshotClick={handleDemo} />
      <LogoStrip />
      <StatsBand />
      <BuilderFeatures onDemoTab={handleDemoTab} />
      <HomeownerSection />
      <TestimonialSection />
      <PricingSection onCta={handleCta} />
      <FAQSection />
      <FinalCTA onCta={handleCta} />
      <LandingFooter />

      <GuestRoleModal
        open={showRoleModal}
        onOpenChange={setShowRoleModal}
        onSelect={(role) => {
          setShowRoleModal(false);
          localStorage.setItem("guest_user_type", role);
          enterGuestMode();
          navigate("/start");
        }}
      />
    </div>
  );
};

export default Index;
