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

declare global {
  interface Window {
    AirnuriSocial?: { mount: (client: unknown) => void };
  }
}

const SDK_URL = "https://airnuri.com/social-sdk.js";

/** 캐릭터 위젯과 겹치지 않게 Airnuri iframe 위치를 위로 올림.
 *  MutationObserver 로 iframe 이 생긴 직후 style 갱신, FAB↔패널 크기 변경 시에도 유지. */
function repositionAirnuriIframe() {
  const apply = () => {
    const iframe = document.querySelector<HTMLIFrameElement>(
      'iframe[src*="airnuri.com/embed/social"]',
    );
    if (!iframe) return false;
    // 캐릭터 위젯이 우하단을 차지 → FAB 를 캐릭터 위로
    iframe.style.bottom = "260px";
    iframe.style.right = "16px";
    return true;
  };
  if (apply()) return;
  const obs = new MutationObserver(() => { if (apply()) obs.disconnect(); });
  obs.observe(document.body, { childList: true, subtree: true });
  // 안전망: 10초 후 자동 종료
  setTimeout(() => obs.disconnect(), 10000);
}

export default function AirnuriSocialMount() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (window.AirnuriSocial) {
      window.AirnuriSocial.mount(supabase);
      repositionAirnuriIframe();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SDK_URL}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => {
        window.AirnuriSocial?.mount(supabase);
        repositionAirnuriIframe();
      });
      return;
    }

    const s = document.createElement("script");
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => {
      window.AirnuriSocial?.mount(supabase);
      repositionAirnuriIframe();
    };
    s.onerror = () => console.warn("[airnuri-social] SDK 로드 실패:", SDK_URL);
    document.body.appendChild(s);
  }, []);

  return null;
}
