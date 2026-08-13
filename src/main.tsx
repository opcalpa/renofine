import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";
import { supabase } from "./integrations/supabase/client";
import { analytics } from "./lib/analytics";

// Initialize Sentry for error tracking (only in production or when DSN is set)
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    // Performance monitoring sample rate
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    // Session Replay sample rate (10% in production)
    replaysSessionSampleRate: import.meta.env.PROD ? 0.1 : 0,
    // Error session sample rate (100% for errors)
    replaysOnErrorSampleRate: 1.0,
  });
}

// Initialize PostHog analytics
analytics.init();

// Expose supabase globally for debugging
if (typeof window !== 'undefined') {
  (window as unknown as { supabase: typeof supabase }).supabase = supabase;
}

// PWA share-target relay (public/sw.js) — a no-cache worker whose only job is
// receiving "dela till Renofine" files and bouncing them to /capture → Renaida.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // PWA share is progressive enhancement — the app works fine without it.
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
