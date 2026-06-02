/**
 * Sentry 브라우저 측 초기화. @sentry/nextjs 의 webpack 플러그인이
 * 이 파일을 루트에서 자동 감지해 클라이언트 번들에 inject 한다.
 *
 * NEXT_PUBLIC_SENTRY_DSN 환경변수는 빌드 시점에 문자열로 치환됨.
 * DSN 미설정이면 SDK 는 no-op.
 */
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || 'development',
});
