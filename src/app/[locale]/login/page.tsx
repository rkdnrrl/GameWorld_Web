"use client";

/**
 * 로그인 — Airnuri 통합 인증으로 리다이렉트
 * 자체 폼 제거, 사용자는 airnuri.com에서 로그인 후 hash 토큰으로 돌아옴
 */

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useLoggedIn } from "@/lib/useLoggedIn";
import { useTranslations } from "next-intl";

export default function LoginPage() {
  const router = useRouter();
  const loggedIn = useLoggedIn();
  const t = useTranslations("Login");

  useEffect(() => {
    if (loggedIn) router.replace("/");
  }, [loggedIn, router]);

  function goLogin() {
    const returnTo = encodeURIComponent(window.location.origin + "/");
    window.location.href = `https://airnuri.com/login?return_to=${returnTo}`;
  }

  function goSignup() {
    const returnTo = encodeURIComponent(window.location.origin + "/");
    window.location.href = `https://airnuri.com/signup?return_to=${returnTo}`;
  }

  return (
    <section className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6 sm:py-16">
      <div className="w-full min-w-0 max-w-md text-center">
        <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-2 break-words text-sm text-zinc-500">
          {t("subtitle")}
        </p>

        <div className="mt-8 space-y-3">
          <button
            type="button"
            onClick={goLogin}
            className="w-full rounded-md bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700"
          >
            {t("submit")}
          </button>
          <button
            type="button"
            onClick={goSignup}
            className="w-full rounded-md border border-zinc-300 bg-white px-4 py-2.5 font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            {t("signupLink")}
          </button>
        </div>
      </div>
    </section>
  );
}
