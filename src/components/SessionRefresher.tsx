"use client";

/**
 * Supabase access token 만료 전 자동 갱신.
 * - 5분마다 만료 체크 → 5분 이내 만료면 미리 refresh
 * - Supabase onAuthStateChange 구독 → 자동 갱신 시 우리 localStorage도 업데이트
 * - 탭 활성화 시 즉시 한 번 체크
 */

import { useEffect } from "react";
import { session } from "@/lib/api";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5분
const REFRESH_THRESHOLD_S = 5 * 60;       // 만료 5분 전 갱신

export default function SessionRefresher() {
  useEffect(() => {
    let cancelled = false;
    let timerId: ReturnType<typeof setInterval> | null = null;

    async function checkAndRefresh() {
      if (cancelled) return;
      if (!session.getToken()) return;
      const expiresAtRaw = typeof window !== "undefined"
        ? localStorage.getItem("gameworld_expires_at")
        : null;
      if (!expiresAtRaw) return; // 만료 시각 모르면 (자체 JWT) 갱신 안 함
      const expiresAt = Number(expiresAtRaw);
      const secondsLeft = expiresAt - Date.now() / 1000;
      if (secondsLeft > REFRESH_THRESHOLD_S) return;
      // 만료 임박 — refresh
      try {
        const refreshToken = session.getRefreshToken();
        if (!refreshToken) return;
        const { supabase } = await import("@/lib/supabase");
        const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
        if (error || !data.session) return;
        const user = session.getUser();
        if (!user) return;

        // Supabase 갱신 후 플랫폼 JWT(7일)로 재교환
        let platformToken = data.session.access_token;
        let platformExpiresAt = data.session.expires_at ?? 0;
        try {
          const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://airliveplay.com";
          const exRes = await fetch(`${API_BASE}/api/auth/exchange`, {
            method: "POST",
            headers: { Authorization: `Bearer ${data.session.access_token}` },
          });
          if (exRes.ok) {
            const exData = await exRes.json() as { token?: string };
            if (exData.token) {
              platformToken = exData.token;
              platformExpiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
            }
          }
        } catch { /* 교환 실패 시 Supabase 토큰 폴백 */ }

        session.save({ token: platformToken, user });
        session.saveRefreshInfo(data.session.refresh_token, platformExpiresAt);
      } catch {
        /* 비치명 */
      }
    }

    // 초기 1회 체크
    checkAndRefresh();

    // 주기적 체크
    timerId = setInterval(checkAndRefresh, CHECK_INTERVAL_MS);

    // 탭 활성화 시 체크
    const onVisible = () => {
      if (document.visibilityState === "visible") checkAndRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    // Supabase 내부 갱신 이벤트 구독 → 우리 storage도 업데이트
    let unsub: (() => void) | null = null;
    (async () => {
      const { supabase } = await import("@/lib/supabase");
      const { data: sub } = supabase.auth.onAuthStateChange((event, supabaseSession) => {
        if (event === "TOKEN_REFRESHED" && supabaseSession) {
          const user = session.getUser();
          if (user) {
            session.save({ token: supabaseSession.access_token, user });
            session.saveRefreshInfo(supabaseSession.refresh_token, supabaseSession.expires_at ?? 0);
          }
        }
      });
      unsub = () => sub.subscription.unsubscribe();
    })();

    return () => {
      cancelled = true;
      if (timerId) clearInterval(timerId);
      document.removeEventListener("visibilitychange", onVisible);
      if (unsub) unsub();
    };
  }, []);

  return null;
}
