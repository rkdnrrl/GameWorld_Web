"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { session } from "@/lib/api";

type RewardedAdProps = {
  /** 모달 표시 여부 */
  open: boolean;
  /** 닫기/취소 콜백 */
  onClose: () => void;
  /** 광고 완료 시 콜백 (보상 지급은 이 콜백에서 처리) */
  onReward: () => void;
  /** 광고 길이(초). 기본 5 */
  durationSec?: number;
  /** 보상 설명 (예: "코인 +10") */
  rewardLabel?: string;
};

/**
 * 보상형 광고 모달 (placeholder).
 * 구독자에게는 자동으로 onReward 가 즉시 호출됨 (광고 스킵).
 */
export default function RewardedAd({
  open,
  onClose,
  onReward,
  durationSec = 5,
  rewardLabel,
}: RewardedAdProps) {
  const t = useTranslations("RewardedAd");
  const [remaining, setRemaining] = useState(durationSec);
  const [done, setDone] = useState(false);
  const rewardedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    rewardedRef.current = false;
    setRemaining(durationSec);
    setDone(false);

    // 구독자는 광고 스킵 + 즉시 보상
    const u = session.getUser();
    if (u?.isSubscribed) {
      rewardedRef.current = true;
      onReward();
      onClose();
      return;
    }

    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(id);
          setDone(true);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [open, durationSec, onClose, onReward]);

  if (!open) return null;

  const handleClaim = () => {
    if (rewardedRef.current) return;
    rewardedRef.current = true;
    onReward();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && done) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 text-center shadow-2xl dark:bg-zinc-900">
        <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {t("title")}
        </h2>
        {rewardLabel && (
          <p className="mb-4 text-sm text-emerald-600 dark:text-emerald-400">
            {t("rewardPrefix")} {rewardLabel}
          </p>
        )}
        <div className="mb-4 flex aspect-video w-full items-center justify-center rounded border border-dashed border-zinc-300 bg-zinc-100 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-600">
          <span className="text-sm">{t("placeholder")}</span>
        </div>
        {!done ? (
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-300">
            {t("waiting", { seconds: remaining })}
          </p>
        ) : (
          <p className="mb-4 text-sm text-emerald-600 dark:text-emerald-400">
            {t("ready")}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            disabled={!done}
            onClick={handleClaim}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("claim")}
          </button>
        </div>
      </div>
    </div>
  );
}
