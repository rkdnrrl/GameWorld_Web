"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { SESSION_EXPIRED_EVENT } from "@/lib/api";

export default function SessionExpiredBanner() {
  const [visible, setVisible] = useState(false);
  const locale = useLocale();

  useEffect(() => {
    const handler = () => setVisible(true);
    window.addEventListener(SESSION_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
  }, []);

  if (!visible) return null;

  return (
    <>
      {/* 어두운 오버레이 */}
      <div className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-sm" />

      {/* 중앙 모달 */}
      <div
        role="alertdialog"
        aria-modal="true"
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      >
        <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl dark:bg-zinc-900 overflow-hidden">
          {/* 상단 빨간 띠 */}
          <div className="bg-red-600 px-6 py-4 text-white">
            <p className="text-lg font-bold">🔒 로그인 만료</p>
            <p className="mt-1 text-sm text-red-100">세션이 만료되어 로그아웃 되었습니다.</p>
          </div>
          <div className="px-6 py-5">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              계속 이용하려면 다시 로그인해 주세요.
            </p>
            <div className="mt-4 flex gap-3">
              <a
                href={`/${locale}/login`}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-center text-sm font-semibold text-white hover:bg-red-700 transition-colors"
              >
                다시 로그인
              </a>
              <button
                onClick={() => setVisible(false)}
                className="flex-1 rounded-lg border border-zinc-200 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
