import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";
import { supabase } from "./integrations/supabase/client";
import { analytics } from "./lib/analytics";
import { i18nReady } from "./i18n/config";

// Initialize Sentry for error tracking.
//
// Production only. The DSN lives in .env.local too, so before this gate every
// transient HMR error during development mailed Carl and filled the production
// project with `environment: development` noise that no one would ever act on.
// Set VITE_SENTRY_DEV=true when you deliberately want to debug Sentry locally.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
const sentryEnabled =
  Boolean(sentryDsn) &&
  (import.meta.env.PROD || import.meta.env.VITE_SENTRY_DEV === 'true');
if (sentryEnabled) {
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

const root = createRoot(document.getElementById("root")!);

// Translations are their own chunk now (see src/i18n/config.ts), so they land
// a beat after the entry script. Wait for the active language before the first
// paint or the landing page flashes raw t() keys. A failed fetch still renders:
// English keys beat a blank page.
i18nReady
  .catch(() => undefined)
  .then(() => root.render(<App />));
