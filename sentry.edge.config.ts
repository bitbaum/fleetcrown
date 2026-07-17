// Sentry edge-runtime init (middleware/proxy, edge routes).
// Env-gated: without NEXT_PUBLIC_SENTRY_DSN the SDK is disabled and no-ops.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});
