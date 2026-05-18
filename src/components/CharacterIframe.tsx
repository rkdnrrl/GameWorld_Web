"use client";

/**
 * 로그인 상태에 따라 CharacterWidget을 마운트/언마운트.
 * commonUserId는 session 캐시 또는 /api/auth/me에서 가져옴.
 * 위젯 내부의 assistant:navigate 메시지 처리도 여기서.
 */

import { useEffect, useState } from "react";
import { session, SESSION_CHANGE_EVENT, api } from "@/lib/api";
import CharacterWidget from "./CharacterWidget";

export default function CharacterIframe() {
  const [commonUserId, setCommonUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolveId() {
      const token = session.getToken();
      if (!token) { setCommonUserId(null); return; }
      const cached = session.getUser();
      if (cached?.commonUserId) { setCommonUserId(cached.commonUserId); return; }
      try {
        const { user } = await api.me(token);
        if (cancelled) return;
        setCommonUserId(user.commonUserId || user.id);
      } catch {
        if (cancelled) return;
        if (cached?.id) setCommonUserId(cached.id);
      }
    }

    resolveId();

    const onSessionChange = () => {
      if (session.getToken()) resolveId();
      else setCommonUserId(null);
    };
    window.addEventListener(SESSION_CHANGE_EVENT, onSessionChange);

    // 위젯이 보내는 assistant:navigate 메시지 → 새 탭으로 열기
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "assistant:navigate" && typeof e.data.url === "string") {
        window.open(e.data.url, "_blank");
      }
    };
    window.addEventListener("message", onMessage);

    return () => {
      cancelled = true;
      window.removeEventListener(SESSION_CHANGE_EVENT, onSessionChange);
      window.removeEventListener("message", onMessage);
    };
  }, []);

  if (!commonUserId) return null;
  return <CharacterWidget userId={commonUserId} app="platform" storageKey="alp_charwidget" />;
}
