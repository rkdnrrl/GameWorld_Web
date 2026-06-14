"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { SESSION_CHANGE_EVENT, session } from "@/lib/api";
import { canPlay, refreshCanPlay } from "@/lib/alphaGate";

/**
 * 현재 사용자가 게임플레이 가능한지 반환하는 훅.
 * 마운트 시 세션 즉시 판정 + 서버 최신값 동기화(redeem 직후 stale 방지), 세션 변경 시 갱신.
 */
export function useCanPlay(): boolean {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let alive = true;
    const sync = () => { if (alive) setAllowed(canPlay(session.getUser())); };
    sync();
    refreshCanPlay().then((ok) => { if (alive) setAllowed(ok); }).catch(() => {});
    window.addEventListener(SESSION_CHANGE_EVENT, sync);
    return () => { alive = false; window.removeEventListener(SESSION_CHANGE_EVENT, sync); };
  }, []);
  return allowed;
}

/** 비테스터가 플레이를 시도했을 때 뜨는 안내 + 테스터 코드 입력 유도 모달 */
export default function AlphaGateModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("AlphaGate");
  const router = useRouter();
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 text-5xl">🔒</div>
        <h2 className="mb-2 text-xl font-bold text-gray-900">{t("title")}</h2>
        <p className="mb-1 text-sm leading-relaxed text-gray-600">{t("desc")}</p>
        <p className="mb-6 text-xs text-gray-400">{t("note")}</p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => router.push("/redeem")}
            className="w-full rounded-xl bg-[#0170bd] px-6 py-3 text-sm font-bold text-white transition hover:bg-blue-700 active:scale-95"
          >
            {t("redeemBtn")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-gray-100 px-6 py-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-200"
          >
            {t("closeBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}
