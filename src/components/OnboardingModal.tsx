"use client";

/**
 * 신규 가입자 온보딩 모달 — 5스텝 가이드.
 *
 * 트리거 조건:
 *   1. 로그인 상태 (token 있음)
 *   2. localStorage 의 ONBOARDING_KEY 값이 없음 (= 아직 안 본 사람)
 *
 * 모든 스텝에서 PostHog 이벤트 발생:
 *   - onboarding_started, onboarding_step_{n}, onboarding_completed, onboarding_skipped
 *
 * 강제 재실행 (헤더 도움말 버튼 등): props 의 forceOpen 사용.
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { SESSION_CHANGE_EVENT, session } from "@/lib/api";

const ONBOARDING_KEY = "alp_onboarding_completed_v1";

interface Props {
  /** 강제 열기 — 헤더 도움말 등에서 호출 */
  forceOpen?: boolean;
  onClose?: () => void;
}

type StepKey = "welcome" | "avatar" | "world" | "voice" | "friends";

interface Step {
  key: StepKey;
  titleKey: string;
  descKey: string;
  /** 이 스텝에서 보여줄 "바로가기" 버튼이 향할 경로. 없으면 버튼 안 보임. */
  goHref?: string;
  goLabelKey?: string;
}

const STEPS: Step[] = [
  { key: "welcome", titleKey: "onboardWelcomeTitle", descKey: "onboardWelcomeDesc" },
  { key: "avatar",  titleKey: "onboardAvatarTitle",  descKey: "onboardAvatarDesc",
    goHref: "/character", goLabelKey: "onboardAvatarTitle" },
  { key: "world",   titleKey: "onboardWorldTitle",   descKey: "onboardWorldDesc",
    goHref: "/world",     goLabelKey: "onboardWorldTitle" },
  { key: "voice",   titleKey: "onboardVoiceTitle",   descKey: "onboardVoiceDesc" },
  { key: "friends", titleKey: "onboardFriendsTitle", descKey: "onboardFriendsDesc",
    goHref: "/friends",   goLabelKey: "onboardFriendsTitle" },
];

async function track(event: string, props?: Record<string, unknown>) {
  try {
    const ph = (await import("posthog-js")).default;
    ph.capture(event, props);
  } catch {
    /* PostHog 없으면 조용히 무시 */
  }
}

export default function OnboardingModal({ forceOpen, onClose }: Props) {
  const t = useTranslations("Home");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);

  // 로그인 상태 + 미완료 시 자동 표시
  useEffect(() => {
    if (forceOpen) { setOpen(true); setIdx(0); return; }
    const check = () => {
      const hasToken = !!session.getToken();
      const completed = typeof window !== "undefined" && localStorage.getItem(ONBOARDING_KEY);
      if (hasToken && !completed) {
        setOpen(true);
        setIdx(0);
        track("onboarding_started");
      }
    };
    check();
    window.addEventListener(SESSION_CHANGE_EVENT, check);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, check);
  }, [forceOpen]);

  const finish = useCallback((reason: "completed" | "skipped") => {
    if (typeof window !== "undefined") {
      localStorage.setItem(ONBOARDING_KEY, new Date().toISOString());
    }
    track(reason === "completed" ? "onboarding_completed" : "onboarding_skipped",
      { lastStep: STEPS[idx]?.key });
    setOpen(false);
    onClose?.();
  }, [idx, onClose]);

  const next = useCallback(() => {
    if (idx >= STEPS.length - 1) { finish("completed"); return; }
    const nextIdx = idx + 1;
    setIdx(nextIdx);
    track(`onboarding_step_${nextIdx + 1}`, { step: STEPS[nextIdx].key });
  }, [idx, finish]);

  const prev = useCallback(() => {
    if (idx > 0) setIdx(idx - 1);
  }, [idx]);

  const goAndClose = useCallback((href: string) => {
    finish("completed");
    router.push(href);
  }, [finish, router]);

  const step = useMemo(() => STEPS[idx], [idx]);

  // ESC 키 = skip (backdrop 클릭과 같은 동작)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish('skipped'); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, finish]);

  if (!open || !step) return null;

  const total = STEPS.length;
  const isLast = idx === total - 1;
  const isFirst = idx === 0;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm"
      onClick={() => finish("skipped")}
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#0b1020] text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 진행률 바 */}
        <div className="h-1 w-full bg-white/10">
          <div
            className="h-full bg-indigo-500 transition-all"
            style={{ width: `${((idx + 1) / total) * 100}%` }}
          />
        </div>

        <div className="p-6 sm:p-8">
          {/* 스텝 라벨 */}
          <div className="mb-3 text-xs font-semibold text-indigo-300">
            {t("onboardStepLabel", { n: idx + 1, total })}
          </div>

          {/* 제목 + 설명 */}
          <h2 className="mb-3 text-xl font-bold sm:text-2xl">{t(step.titleKey)}</h2>
          <p className="mb-6 whitespace-pre-line text-sm leading-relaxed text-white/70 sm:text-base">
            {t(step.descKey)}
          </p>

          {/* 바로가기 (선택) */}
          {step.goHref && step.goLabelKey && (
            <button
              type="button"
              onClick={() => goAndClose(step.goHref!)}
              className="mb-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-400/40 bg-indigo-500/20 px-5 py-3 text-sm font-bold text-indigo-100 transition hover:bg-indigo-500/30"
            >
              {t("onboardGoStep", { name: t(step.goLabelKey) })}
            </button>
          )}

          {/* 네비게이션 */}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => finish("skipped")}
              className="text-sm text-white/40 transition hover:text-white/70"
            >
              {t("onboardSkip")}
            </button>
            <div className="flex gap-2">
              {!isFirst && (
                <button
                  type="button"
                  onClick={prev}
                  className="rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold transition hover:bg-white/10"
                >
                  {t("onboardPrev")}
                </button>
              )}
              <button
                type="button"
                onClick={next}
                className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold shadow-md shadow-indigo-900/40 transition hover:bg-indigo-500"
              >
                {isLast ? t("onboardFinish") : t("onboardNext")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
