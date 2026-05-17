"use client";

import { useEffect } from "react";
import { session, SESSION_CHANGE_EVENT, api } from "@/lib/api";

function insertIframe(commonUserId: string) {
  if (document.getElementById("_assistantIframe")) return;
  const iframe = document.createElement("iframe");
  iframe.id = "_assistantIframe";
  iframe.src = `https://assistant-chi-two.vercel.app?userId=${commonUserId}&app=platform`;
  iframe.style.cssText =
    "position:fixed;bottom:0;right:0;width:220px;height:300px;border:none;background:transparent;z-index:9999;pointer-events:none;";
  document.body.appendChild(iframe);
}

async function mount() {
  const token = session.getToken();
  if (!token) return;

  // 세션에 commonUserId가 이미 있으면 바로 삽입
  const cached = session.getUser();
  if (cached?.commonUserId) {
    insertIframe(cached.commonUserId);
    return;
  }

  // 없으면 /api/auth/me 호출해서 최신 commonUserId 획득
  try {
    const { user } = await api.me(token);
    const cuid = user.commonUserId || user.id;
    insertIframe(cuid);
  } catch {
    // 네트워크 오류 시 id 폴백
    if (cached?.id) insertIframe(cached.id);
  }
}

function unmount() {
  document.getElementById("_assistantIframe")?.remove();
}

export default function CharacterIframe() {
  useEffect(() => {
    mount();

    const onChange = () => {
      if (session.getToken()) {
        mount();
      } else {
        unmount();
      }
    };

    window.addEventListener(SESSION_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, onChange);
  }, []);

  return null;
}
