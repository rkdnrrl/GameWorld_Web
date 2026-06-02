"use client";

/**
 * PostHog 클라이언트 초기화 + Next.js App Router SPA 라우팅 추적.
 *
 * App Router 의 router.push 는 일반 페이지 로드가 아니라 history.pushState 만
 * 발생시켜서 PostHog autocapture 가 종종 놓침. usePathname 으로 직접 감지해
 * 수동으로 $pageview 발생.
 */
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import type { PostHog } from "posthog-js";

export default function PostHogInit() {
  const pathname = usePathname();
  const phRef = useRef<PostHog | null>(null);

  // 1) SDK 1회 init
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;

    // 절대 URL — PostHog 가 leading slash 처리하면서 locale 경로(/ko)가 끼는 문제 회피.
    const apiHost = `${window.location.origin}/ingest`;

    import("posthog-js").then(({ default: posthog }) => {
      posthog.init(key, {
        api_host: apiHost,
        ui_host: "https://us.posthog.com",
        person_profiles: "identified_only",
        capture_pageview: false,            // 수동 처리 (App Router 호환)
        capture_pageleave: true,
        disable_session_recording: true,
      });
      phRef.current = posthog;
      posthog.capture("$pageview");         // 첫 진입 페이지뷰
    });
  }, []);

  // 2) 라우트 변경 시마다 페이지뷰 캡처
  useEffect(() => {
    if (!phRef.current || !pathname) return;
    phRef.current.capture("$pageview");
  }, [pathname]);

  return null;
}
