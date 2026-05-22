"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { session, SESSION_CHANGE_EVENT } from "@/lib/api";

type AdSlot = "leaderboard" | "banner" | "skyscraper";

/**
 * Kakao AdFit 배너 광고.
 * - 구독자는 광고 비노출
 * - 단위 ID 미설정 시 개발용 placeholder 표시
 *
 * 환경변수:
 *   NEXT_PUBLIC_KAKAO_ADFIT_LEADERBOARD  — 728×90 (PC 상단)
 *   NEXT_PUBLIC_KAKAO_ADFIT_BANNER       — 320×50  (모바일)
 *   NEXT_PUBLIC_KAKAO_ADFIT_SKYSCRAPER   — 160×600 (PC 사이드, 선택)
 */

const UNIT_IDS: Record<AdSlot, string> = {
  leaderboard: process.env.NEXT_PUBLIC_KAKAO_ADFIT_LEADERBOARD ?? "",
  banner:      process.env.NEXT_PUBLIC_KAKAO_ADFIT_BANNER      ?? "",
  skyscraper:  process.env.NEXT_PUBLIC_KAKAO_ADFIT_SKYSCRAPER  ?? "",
};

const SIZES: Record<AdSlot, { w: string; h: string }> = {
  leaderboard: { w: "728", h: "90"  },
  banner:      { w: "320", h: "50"  },
  skyscraper:  { w: "160", h: "600" },
};

const SLOT_CLASSES: Record<AdSlot, string> = {
  leaderboard: "mx-auto hidden w-full max-w-[728px] justify-center sm:flex",
  banner:      "mx-auto flex w-full max-w-[320px] justify-center sm:hidden",
  skyscraper:  "hidden w-[160px] flex-shrink-0 justify-center lg:flex",
};

export default function AdBanner({ slot = "leaderboard", className = "" }: { slot?: AdSlot; className?: string }) {
  const t = useTranslations("AdBanner");
  const [subscribed, setSubscribed] = useState<boolean | null>(null);

  useEffect(() => {
    const check = () => setSubscribed(!!session.getUser()?.isSubscribed);
    check();
    window.addEventListener(SESSION_CHANGE_EVENT, check);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, check);
  }, []);

  // 구독자 광고 미노출
  if (subscribed) return null;

  const unitId = UNIT_IDS[slot];
  const { w, h } = SIZES[slot];
  const base = [SLOT_CLASSES[slot], className].filter(Boolean).join(" ");

  // 단위 ID 없으면 placeholder (개발 환경 또는 미설정)
  if (!unitId) {
    return (
      <div
        className={[
          "items-center justify-center border border-dashed border-zinc-300 bg-zinc-100 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-600",
          base,
        ].join(" ")}
        style={{ height: `${h}px` }}
        aria-label={t("ariaLabel")}
      >
        <span className="text-xs">{t("placeholder")} ({w}×{h})</span>
      </div>
    );
  }

  // Kakao AdFit 실제 광고
  return (
    <div className={base}>
      <ins
        className="kakao_ad_area"
        style={{ display: "none" }}
        data-ad-unit={unitId}
        data-ad-width={w}
        data-ad-height={h}
      />
    </div>
  );
}
