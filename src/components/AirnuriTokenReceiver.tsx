"use client";

/**
 * Airnuri 통합 인증 — URL hash로 전달된 access/refresh 토큰을 받아 세션 설정.
 * 토큰을 받으면 supabase 세션을 설정한 뒤, 플랫폼 JWT(7일)로 교환해 세션에 저장한다.
 */

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { api, session, SESSION_CHANGE_EVENT } from "@/lib/api";

export default function AirnuriTokenReceiver() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.location.hash) return;

    const hash = new URLSearchParams(window.location.hash.slice(1));
    const access_token  = hash.get("access_token");
    const refresh_token = hash.get("refresh_token") || "";
    if (!access_token) return;

    (async () => {
      try {
        // 1) Supabase 세션 설정 (refresh 자동 처리)
        await supabase.auth.setSession({ access_token, refresh_token });

        // 2) 플랫폼 JWT로 교환 + 사용자 정보 받기
        let platformToken = access_token;
        try {
          const ex = await api.exchange(access_token);
          if (ex.token) platformToken = ex.token;
        } catch { /* 폴백: Supabase 토큰 그대로 사용 */ }

        try {
          const { user } = await api.me(platformToken);
          session.save({ token: platformToken, user });
          window.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
        } catch (e) {
          console.warn("[airnuri] me failed:", e);
        }
      } finally {
        // URL hash 정리 (토큰 노출 방지)
        window.history.replaceState({}, "", window.location.pathname + window.location.search);
      }
    })();
  }, []);

  return null;
}
