/**
 * Next.js 16 서버 측 인스트루멘테이션 — Sentry 초기화 (Node/Edge 런타임 분기).
 * DSN 이 없으면 Sentry 가 no-op 으로 동작 — 안전.
 */
import * as Sentry from '@sentry/nextjs';

export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    });
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
