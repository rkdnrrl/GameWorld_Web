"use client";

/**
 * 회원가입 — Airnuri 통합 인증으로 리다이렉트
 * 자체 폼 제거, 사용자는 airnuri.com에서 가입 후 hash 토큰으로 돌아옴
 */

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useLoggedIn } from "@/lib/useLoggedIn";
import { useTranslations } from "next-intl";

export default function SignupPage() {
  const router = useRouter();
  const loggedIn = useLoggedIn();
  const t = useTranslations("Signup");

  useEffect(() => {
    if (loggedIn) {
      router.replace("/");
      return;
    }
    // Airnuri 통합 회원가입 페이지로 자동 리다이렉트
    const returnTo = encodeURIComponent(window.location.origin + "/");
    window.location.href = `https://airnuri.com/signup?return_to=${returnTo}`;
  }, [loggedIn, router]);

  return (
    <section className="flex flex-1 items-center justify-center px-4 py-16">
      <p className="text-sm text-zinc-500">{t("submitting")}</p>
    </section>
  );
}
