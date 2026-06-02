"use client";

/**
 * PostHog 클라이언트 초기화 — 클라이언트 컴포넌트 useEffect 로 직접 init.
 *
 * Sentry 와 같은 패턴: env var 미설정 시 no-op, 동적 import 로 첫 페인트 비차단.
 *
 * 자동 추적:
 *   - 페이지뷰 (autocapture)
 *   - 클릭·input (autocapture)
 *   - 세션 리플레이는 비활성 (프라이버시·용량)
 *
 * 수동 이벤트는 useEffect 안 또는 별도 헬퍼에서:
 *   import posthog from "posthog-js";
 *   posthog.capture("character_created", { characterName });
 */
import { useEffect } from "react";

export default function PostHogInit() {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;

    import("posthog-js").then(({ default: posthog }) => {
      posthog.init(key, {
        // 리버스 프록시 — 광고차단기 우회. next.config.ts 의 /ingest 리라이트와 짝.
        api_host: "/ingest",
        ui_host: "https://us.posthog.com",
        person_profiles: "identified_only",  // 로그인 유저만 프로필 생성 (비용 절감)
        capture_pageview: true,
        capture_pageleave: true,
        disable_session_recording: true,     // 세션 리플레이 끔
      });
    });
  }, []);

  return null;
}
