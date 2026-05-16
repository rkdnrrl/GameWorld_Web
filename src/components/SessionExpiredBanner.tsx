"use client";

import { useEffect, useState } from "react";
import { SESSION_EXPIRED_EVENT } from "@/lib/api";

/**
 * 세션 만료(401) 시 화면 상단에 배너를 표시합니다.
 * 로그인 페이지로 이동하거나 닫을 수 있습니다.
 */
export default function SessionExpiredBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = () => setVisible(true);
    window.addEventListener(SESSION_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[9999] flex items-center justify-between gap-3 bg-red-600 px-4 py-3 text-sm text-white shadow-lg"
    >
      <span className="font-medium">
        🔒 로그인이 만료됐습니다. 다시 로그인해 주세요.
      </span>
      <div className="flex shrink-0 gap-2">
        <a
          href="/ko/login"
          className="rounded bg-white px-3 py-1 text-red-600 font-semibold hover:bg-red-50 transition-colors"
        >
          로그인
        </a>
        <button
          onClick={() => setVisible(false)}
          className="rounded px-2 py-1 hover:bg-red-700 transition-colors"
          aria-label="닫기"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
