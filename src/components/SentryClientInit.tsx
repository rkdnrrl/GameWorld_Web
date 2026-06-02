"use client";

/**
 * Sentry 클라이언트 초기화 — 클라이언트 컴포넌트 useEffect 로 직접 init.
 *
 * 왜 이 방식?
 *   `sentry.client.config.ts` / `instrumentation-client.ts` 는 Next.js 16 + Turbopack
 *   환경에서 번들에 안 들어가는 케이스가 있음. 그래서 일반 React 컴포넌트로 박아
 *   강제로 번들에 포함시킴.
 *
 * NEXT_PUBLIC_SENTRY_DSN 은 빌드 시점에 문자열로 치환됨 (클라이언트 컴포넌트 표준 동작).
 * DSN 미설정이면 SDK 는 no-op.
 */
import { useEffect } from "react";

export default function SentryClientInit() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return;

    // 동적 import — 첫 페이지 페인트 차단하지 않게
    import("@sentry/nextjs").then((Sentry) => {
      Sentry.init({
        dsn,
        tracesSampleRate: 0.1,
        environment: process.env.NEXT_PUBLIC_VERCEL_ENV || "development",
      });
    });
  }, []);

  return null;
}
