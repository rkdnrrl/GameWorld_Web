"use client";

/**
 * 로그인 — Airnuri 통합 인증으로 즉시 리다이렉트
 * (페이지 진입과 동시에 airnuri 로 이동. 이미 airnuri 에서 로그인된 상태면
 *  사용자 입력 없이 토큰 받아 자동 복귀 → 체감상 SSO.)
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
    if (loggedIn) {
      router.replace("/");
      return;
    }
    const returnTo = encodeURIComponent(window.location.origin + "/");
    window.location.href = `https://airnuri.com/login?return_to=${returnTo}`;
  }, [loggedIn, router]);

  return (
    <section className="flex flex-1 items-center justify-center px-4 py-16">
      <p className="text-sm text-zinc-500">{t("submitting")}</p>
    </section>
  );
}
