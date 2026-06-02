import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// 백엔드 주소. 빌드/서버 시작 시점에 평가됨.
// - 로컬: 미설정 → http://localhost:4000 (default)
// - Vercel: BACKEND_URL=http://<Lightsail_IP>:4000 (Vercel 환경변수에 등록)
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";

const nextConfig: NextConfig = {
  // PostHog 리버스 프록시 경로 — 광고차단기로 인한 이벤트 손실(10~25%) 방지.
  // /ingest/* 요청을 우리 도메인에서 PostHog 로 그대로 전달.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
      // PostHog 정적 자산 (recorder 스크립트 등)
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      // PostHog 이벤트 수집 + decide endpoint
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
};

// Sentry 래핑 — DSN/auth-token 미설정 시 no-op 으로 통과 (소스맵 업로드만 스킵).
const withSentry = (cfg: NextConfig) =>
  withSentryConfig(cfg, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    silent: !process.env.CI,
    widenClientFileUpload: true,
    disableLogger: true,
  });

export default withSentry(withNextIntl(nextConfig));
