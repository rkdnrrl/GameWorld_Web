/**
 * Next.js 16 클라이언트 인스트루멘테이션 — 브라우저 Sentry 초기화 + 라우터 추적.
 * DSN 이 없으면 no-op.
 */
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,         // 세션 리플레이는 일단 끔 (용량·프라이버시)
  replaysOnErrorSampleRate: 1.0,       // 단, 에러 발생 시엔 1회 리플레이
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || 'development',
  integrations: [
    Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
