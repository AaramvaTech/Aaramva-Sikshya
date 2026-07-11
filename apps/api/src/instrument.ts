import * as Sentry from '@sentry/nestjs';
import { Logger } from '@nestjs/common';

/**
 * Sentry bootstrap (OPS-1 T2). Imported FIRST in main.ts so instrumentation
 * precedes everything else. SENTRY_DSN is optional: absent = disabled with a
 * one-line boot notice. Scrubbing: no request bodies, no headers/cookies, no
 * default PII — the exception filter tags events with tenant slug + route and
 * sets only the user id.
 */
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0, // errors only — no performance tracing
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.headers;
        delete event.request.cookies;
        delete event.request.query_string;
      }
      return event;
    },
  });
  Logger.log('Sentry error tracking ENABLED', 'Sentry');
} else {
  Logger.log('Sentry disabled (no SENTRY_DSN configured) — unexpected errors log to console only', 'Sentry');
}
