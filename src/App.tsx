import * as Sentry from "@sentry/react";
import { Toaster } from "@/components/ui/toaster";
import { isEditorV2Enabled } from "@/components/floormap/editor/flag";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { GuestProvider } from "@/contexts/GuestContext";
import { MeasurementProvider } from "@/contexts/MeasurementContext";
import "@/i18n/config";
import { lazy, Suspense } from "react";

/**
 * Route-splitting (Carl 2026-09-03): landningssidan skickade 2 385 kB gzip i EN
 * chunk, med Konva, Leaflet, Recharts, fabric och three inbakade — allt som
 * ProjectDetail drar in. Inget av det används på `/`.
 *
 * Regeln här: sidor som ingår i den PUBLIKA första kontakten laddas statiskt.
 * Allt bakom inloggning, och allt som drar in ett tungt bibliotek, är lazy.
 * Identifierarna är oförändrade, så JSX:en nedan behöver inte röras.
 */

// Publik första kontakt — måste vara omedelbar, är liten.
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import Tips from "./pages/Tips";
import NotFound from "./pages/NotFound";

// Appen bakom inloggning — dessa bar hela bundeln.
const Projects = lazy(() => import("./pages/Projects"));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail"));
const Profile = lazy(() => import("./pages/Profile"));
const Admin = lazy(() => import("./pages/Admin"));
const DevImportReview = lazy(() => import("./pages/DevImportReview"));

// Offert och faktura — både v1 och v2 skeppades tidigare till varje besökare.
const CreateQuote = lazy(() => import("./pages/contractor/CreateQuote"));
const CreateQuoteV2 = lazy(() => import("./pages/contractor/CreateQuoteV2"));
const ViewQuote = lazy(() => import("./pages/ViewQuote"));
const ViewQuoteV2 = lazy(() => import("./pages/ViewQuoteV2"));
const CreateInvoice = lazy(() => import("./pages/contractor/CreateInvoice"));
const CreateInvoiceV2 = lazy(() => import("./pages/contractor/CreateInvoiceV2"));
const ViewInvoice = lazy(() => import("./pages/ViewInvoice"));
const ViewInvoiceV2 = lazy(() => import("./pages/ViewInvoiceV2"));
const ClientRegistry = lazy(() => import("./pages/contractor/ClientRegistry"));
const IntakeRequests = lazy(() => import("./pages/contractor/IntakeRequests"));

// Övriga sidor bakom en klick eller en länk.
const EmbedRenaida = lazy(() => import("./pages/EmbedRenaida"));
const InvitationResponse = lazy(() => import("./pages/InvitationResponse"));
const PinterestCallback = lazy(() => import("./pages/PinterestCallback"));
const Changelog = lazy(() => import("./pages/Changelog"));
const Feedback = lazy(() => import("./pages/Feedback"));
const FindProfessionals = lazy(() => import("./pages/FindProfessionals"));
const CustomerIntake = lazy(() => import("./pages/CustomerIntake"));

// Sedan tidigare lazy.
const WorkerView = lazy(() => import("./pages/WorkerView"));
const AtaApproval = lazy(() => import("./pages/AtaApproval"));
const AttendanceCheckIn = lazy(() => import("./pages/AttendanceCheckIn"));
const DocPlayground = lazy(() => import("./pages/_DocPlayground"));
const Capture = lazy(() => import("./pages/Capture"));
const AddressDetail = lazy(() => import("./pages/AddressDetail"));
const AddressInviteAccept = lazy(() => import("./pages/AddressInviteAccept"));

// Flip to false to fall back to v1 versions.
const USE_QUOTE_VIEW_V2 = true;
const USE_QUOTE_CREATE_V2 = true;
const USE_INVOICE_VIEW_V2 = true;
const USE_INVOICE_CREATE_V2 = true;

import { RequireAuth } from "./components/auth/RequireAuth";
import { RequireRole } from "./components/auth/RequireRole";

// Renaida renderas aldrig på publika sidor (isPublicAppPath), så den hör inte
// hemma i entry-chunken heller. ~2 000 rader.
const Renaida = lazy(() => import("./components/Renaida").then((m) => ({ default: m.Renaida })));
import { InstallPwaBanner } from "./components/InstallPwaBanner";
import { BetaBanner } from "./components/BetaBanner";
import { Canonical } from "./components/seo/Canonical";

/** Only show Renaida on authenticated/app pages, not public landing pages.
 *  MUST live inside BrowserRouter and read useLocation — window.location read
 *  once at mount froze visibility to the initial URL: a session that started
 *  on the landing page never got the FAB at all (Carl's iPhone finding 7 Jul). */
function isPublicAppPath(pathname: string): boolean {
  const publicPaths = ["/", "/auth", "/landing-test", "/about", "/contact", "/terms", "/privacy", "/tips"];
  return (
    publicPaths.includes(pathname) ||
    pathname.startsWith("/w/") ||
    pathname.startsWith("/embed/") ||
    pathname.startsWith("/intake/") ||
    pathname.startsWith("/quotes/") ||
    pathname.startsWith("/invoices/")
  );
}

function AuthenticatedRenaida() {
  const { pathname } = useLocation();
  if (isPublicAppPath(pathname)) return null;
  // Egen gräns: Renaida renderas utanför <Routes> och täcks inte av dess Suspense.
  return (
    <Suspense fallback={null}>
      <Renaida />
    </Suspense>
  );
}

function AuthenticatedInstallBanner() {
  const { pathname } = useLocation();
  if (isPublicAppPath(pathname)) return null;
  return <InstallPwaBanner />;
}

// refetchOnWindowFocus defaults to true — every time the tab regained focus,
// all active queries refetched, which read as a jarring "the page reloaded"
// flash on return (Carl 2026-08-17). Turn it off: data still refetches on mount
// and after mutations; users can navigate/pull to refresh for freshness.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

// Consume ?editor=v2|v1 at app startup — ProjectDetail's tab-sync rewrites
// the query string before the floor planner mounts, so the flag must be
// persisted to localStorage before any param stripping happens.
isEditorV2Enabled();

/** Visas medan en lazy route hämtas. Router-flaggan v7_startTransition gör att
 *  den gamla vyn ligger kvar vid navigering — den här syns i praktiken bara vid
 *  en kall laddning direkt på en lazy route. */
const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

const ErrorFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background p-4">
    <div className="text-center max-w-md">
      <h1 className="text-2xl font-semibold mb-2">Something went wrong</h1>
      <p className="text-muted-foreground mb-4">
        An unexpected error occurred. Please refresh the page to continue.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90"
      >
        Refresh Page
      </button>
    </div>
  </div>
);

const App = () => (
  <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
    <QueryClientProvider client={queryClient}>
      <GuestProvider>
        <MeasurementProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Canonical />
            <BetaBanner />
            <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* ── Public routes ── */}
              <Route path="/" element={<Index />} />
              {/* Frame-friendly Renaida demo for carlpalmquist.com (iframe). Zero backend. */}
              <Route path="/embed/renaida" element={<EmbedRenaida />} />
              <Route path="/_doc-playground" element={<Suspense fallback={null}><DocPlayground /></Suspense>} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/invitation" element={<InvitationResponse />} />
              <Route path="/about" element={<About />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/pinterest/callback" element={<PinterestCallback />} />
              <Route path="/tips" element={<Tips />} />
              <Route path="/changelog" element={<Changelog />} />
              <Route path="/feedback" element={<Feedback />} />
              <Route path="/find-pros" element={<FindProfessionals />} />
              {/* PWA landing pad: shared files / home-screen shortcuts → Renaida */}
              <Route path="/capture" element={<Suspense fallback={null}><Capture /></Suspense>} />
              <Route path="/intake/:token" element={<CustomerIntake />} />
              <Route path="/w/:token" element={<Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}><WorkerView /></Suspense>} />
              <Route path="/ata/:token" element={<Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}><AtaApproval /></Suspense>} />
              <Route path="/checkin/:projectId" element={<Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}><AttendanceCheckIn /></Suspense>} />

              {/* ── Auth required (any role, guests allowed) ── */}
              <Route path="/start" element={<RequireAuth><Projects /></RequireAuth>} />
              {/* Dev-only: the import review with synthetic rows, so the
                  50–100-row layout can be checked without a real import. */}
              {import.meta.env.DEV && (
                <Route path="/dev/import-review" element={<DevImportReview />} />
              )}
              <Route path="/projects" element={<Navigate to="/start" replace />} />
              <Route path="/projects/:projectId" element={<RequireAuth><ProjectDetail /></RequireAuth>} />
              <Route path="/addresses/:propertyId" element={<RequireAuth allowGuest={false}><Suspense fallback={null}><AddressDetail /></Suspense></RequireAuth>} />
              <Route path="/address-invite/:token" element={<Suspense fallback={null}><AddressInviteAccept /></Suspense>} />
              <Route path="/profile" element={<RequireAuth allowGuest={false}><Profile /></RequireAuth>} />
              {/* Servern är gränsen: RPC:erna kastar 42501 för icke-admin. */}
              <Route path="/admin" element={<RequireAuth allowGuest={false}><Admin /></RequireAuth>} />
              <Route path="/quotes/:quoteId" element={USE_QUOTE_VIEW_V2 ? <ViewQuoteV2 /> : <ViewQuote />} />
              <Route path="/invoices/:invoiceId" element={USE_INVOICE_VIEW_V2 ? <ViewInvoiceV2 /> : <ViewInvoice />} />

              {/* ── Contractor-only routes ── */}
              <Route path="/quotes/new" element={<RequireAuth allowGuest={false}><RequireRole allow="contractor">{USE_QUOTE_CREATE_V2 ? <CreateQuoteV2 /> : <CreateQuote />}</RequireRole></RequireAuth>} />
              <Route path="/invoices/new" element={<RequireAuth allowGuest={false}><RequireRole allow="contractor">{USE_INVOICE_CREATE_V2 ? <CreateInvoiceV2 /> : <CreateInvoice />}</RequireRole></RequireAuth>} />
              <Route path="/clients" element={<RequireAuth allowGuest={false}><RequireRole allow="contractor"><ClientRegistry /></RequireRole></RequireAuth>} />
              <Route path="/intake-requests" element={<RequireAuth allowGuest={false}><RequireRole allow="contractor"><IntakeRequests /></RequireRole></RequireAuth>} />

              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
            <AuthenticatedRenaida />
            <AuthenticatedInstallBanner />
          </BrowserRouter>
        </TooltipProvider>
        </MeasurementProvider>
      </GuestProvider>
    </QueryClientProvider>
  </Sentry.ErrorBoundary>
);

export default App;
