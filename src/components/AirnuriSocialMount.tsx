"use client";

/**
 * Airnuri Social 위젯 임베드.
 * https://airnuri.com/social-sdk.js 를 동적으로 로드해 우하단에 친구/DM iframe 위젯을 띄운다.
 * mount() 는 멱등이므로 hot reload / 중복 호출 안전.
 *
 * 사전 조건:
 * - 부모 페이지에 Supabase 세션이 설정돼 있어야 위젯이 표시됨 (AirnuriTokenReceiver 가 처리).
 * - airliveplay.com 은 Airnuri 측 도메인 화이트리스트에 이미 등록됨.
 */

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

declare global {
  interface Window {
    AirnuriSocial?: { mount: (client: unknown) => void };
  }
}

const SDK_URL      = "https://airnuri.com/social-sdk.js";
const COMMON_API   = process.env.NEXT_PUBLIC_AIRNURI_API_URL ?? "https://api.airnuri.com";

/** CommonDB에 유저 등록/확인 — 로그인 직후 반드시 호출 */
function ensureUser(user: User, accessToken: string) {
  fetch(`${COMMON_API}/api/users/ensure`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      id:       user.id,
      email:    user.email,
      nickname: user.user_metadata?.nickname ?? user.email?.split("@")[0],
    }),
  }).catch((e) => console.warn("[airnuri] users/ensure 실패:", e));
}

function mountSdk() {
  if (window.AirnuriSocial) {
    window.AirnuriSocial.mount(supabase);
    return;
  }
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_URL}"]`);
  if (existing) {
    existing.addEventListener("load", () => window.AirnuriSocial?.mount(supabase));
    return;
  }
  const s = document.createElement("script");
  s.src   = SDK_URL;
  s.async = true;
  s.onload  = () => window.AirnuriSocial?.mount(supabase);
  s.onerror = () => console.warn("[airnuri-social] SDK 로드 실패:", SDK_URL);
  document.body.appendChild(s);
}

export default function AirnuriSocialMount() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // SDK 마운트
    mountSdk();

    // 현재 세션에 유저가 있으면 즉시 ensure
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) ensureUser(session.user, session.access_token);
    });

    // 로그인 / 토큰 갱신 시 ensure 재호출
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session?.user) {
          ensureUser(session.user, session.access_token);
        }
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
