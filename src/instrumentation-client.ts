// Sentry client-side init (browser).
// Env-gated: without NEXT_PUBLIC_SENTRY_DSN the SDK is disabled and no-ops.
// Conservative by design: no session replay, no PII, 10% trace sampling.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});

// Instruments App Router navigations for performance traces.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
