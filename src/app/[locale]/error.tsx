"use client";

/**
 * Locale 별 에러 바운더리 — 페이지 렌더링 중 throw 잡힘.
 * Sentry 가 자동 캡처하므로 별도 보고 호출은 불필요.
 */
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("Home");

  useEffect(() => {
    // 개발 시 빠른 디버깅을 위해 콘솔 출력만. Sentry 는 알아서 잡음.
    if (process.env.NODE_ENV !== "production") {
      console.error("[page error]", error);
    }
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b1020] px-4 py-16 text-white">
      <div className="max-w-md text-center">
        <h1 className="mb-4 text-2xl font-bold sm:text-3xl">{t("errorTitle")}</h1>
        <p className="mb-8 text-sm leading-relaxed text-white/60 sm:text-base">
          {t("errorSub")}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold shadow-lg shadow-indigo-900/40 transition hover:bg-indigo-500 active:scale-95"
          >
            🔄 {t("errorRetry")}
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-6 py-3 text-sm font-bold transition hover:bg-white/10 active:scale-95"
          >
            🏠 {t("backHome")}
          </Link>
        </div>
        {error.digest && (
          <p className="mt-6 text-xs text-white/30">ID: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
