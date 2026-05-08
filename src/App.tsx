import * as Sentry from "@sentry/react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { GuestProvider } from "@/contexts/GuestContext";
import { MeasurementProvider } from "@/contexts/MeasurementContext";
import "@/i18n/config";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import Profile from "./pages/Profile";
import InvitationResponse from "./pages/InvitationResponse";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import NotFound from "./pages/NotFound";
import PinterestCallback from "./pages/PinterestCallback";
import Tips from "./pages/Tips";
import Changelog from "./pages/Changelog";
// EmailConfirmed page removed — using toast on /start?confirmed=true instead
import Feedback from "./pages/Feedback";
import FindProfessionals from "./pages/FindProfessionals";
import CreateQuote from "./pages/contractor/CreateQuote";
import CreateQuoteV2 from "./pages/contractor/CreateQuoteV2";
import ViewQuote from "./pages/ViewQuote";
import ViewQuoteV2 from "./pages/ViewQuoteV2";

// Flip to false to fall back to v1 versions.
const USE_QUOTE_VIEW_V2 = true;
const USE_QUOTE_CREATE_V2 = true;
import CreateInvoice from "./pages/contractor/CreateInvoice";
import CreateInvoiceV2 from "./pages/contractor/CreateInvoiceV2";
import ViewInvoice from "./pages/ViewInvoice";
import ViewInvoiceV2 from "./pages/ViewInvoiceV2";

const USE_INVOICE_VIEW_V2 = true;
const USE_INVOICE_CREATE_V2 = true;
import ClientRegistry from "./pages/contractor/ClientRegistry";
import CustomerIntake from "./pages/CustomerIntake";
import IntakeRequests from "./pages/contractor/IntakeRequests";
import { RequireAuth } from "./components/auth/RequireAuth";
import { RequireRole } from "./components/auth/RequireRole";
import { lazy, Suspense } from "react";

const WorkerView = lazy(() => import("./pages/WorkerView"));
const AtaApproval = lazy(() => import("./pages/AtaApproval"));
const AttendanceCheckIn = lazy(() => import("./pages/AttendanceCheckIn"));
const DocPlayground = lazy(() => import("./pages/_DocPlayground"));
import { HelpBot } from "./components/HelpBot";
import { BetaBanner } from "./components/BetaBanner";

/** Only show HelpBot on authenticated/app pages, not public landing pages */
function AuthenticatedHelpBot() {
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  const publicPaths = ["/", "/auth", "/landing-test", "/about", "/contact", "/terms", "/privacy", "/tips"];
  if (publicPaths.includes(path) || path.startsWith("/w/") || path.startsWith("/intake/") || path.startsWith("/quotes/") || path.startsWith("/invoices/")) {
    return null;
  }
  return <HelpBot />;
}

const queryClient = new QueryClient();

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
            <BetaBanner />
            <Routes>
              {/* ── Public routes ── */}
              <Route path="/" element={<Index />} />
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
              <Route path="/intake/:token" element={<CustomerIntake />} />
              <Route path="/w/:token" element={<Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}><WorkerView /></Suspense>} />
              <Route path="/ata/:token" element={<Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}><AtaApproval /></Suspense>} />
              <Route path="/checkin/:projectId" element={<Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}><AttendanceCheckIn /></Suspense>} />

              {/* ── Auth required (any role, guests allowed) ── */}
              <Route path="/start" element={<RequireAuth><Projects /></RequireAuth>} />
              <Route path="/projects" element={<Navigate to="/start" replace />} />
              <Route path="/projects/:projectId" element={<RequireAuth><ProjectDetail /></RequireAuth>} />
              <Route path="/profile" element={<RequireAuth allowGuest={false}><Profile /></RequireAuth>} />
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
          </BrowserRouter>
          <AuthenticatedHelpBot />
        </TooltipProvider>
        </MeasurementProvider>
      </GuestProvider>
    </QueryClientProvider>
  </Sentry.ErrorBoundary>
);

export default App;
