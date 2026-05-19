"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { session, SESSION_CHANGE_EVENT } from "@/lib/api";

type AdBannerProps = {
  /** "leaderboard" = 728×90 (PC 상단), "banner" = 320×50 (모바일) */
  slot?: "leaderboard" | "banner";
  className?: string;
};

export default function AdBanner({ slot = "leaderboard", className = "" }: AdBannerProps) {
  const t = useTranslations("AdBanner");
  const [subscribed, setSubscribed] = useState<boolean | null>(null);

  useEffect(() => {
    const check = () => {
      const u = session.getUser();
      setSubscribed(!!u?.isSubscribed);
    };
    check();
    const onChange = () => check();
    window.addEventListener(SESSION_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, onChange);
  }, []);

  // 구독자는 광고 비노출
  if (subscribed) return null;

  const isLeaderboard = slot === "leaderboard";
  const size = isLeaderboard ? "728×90" : "320×50";

  return (
    <div
      className={[
        "flex items-center justify-center border border-dashed border-zinc-300 bg-zinc-100 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-600",
        isLeaderboard
          ? "mx-auto hidden h-[90px] w-full max-w-[728px] sm:flex"
          : "mx-auto flex h-[50px] w-full max-w-[320px] sm:hidden",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={t("ariaLabel")}
      data-ad-slot={slot}
    >
      <span className="text-xs">{t("placeholder")} ({size})</span>
    </div>
  );
}
