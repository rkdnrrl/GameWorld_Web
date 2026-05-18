"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { supabase } from "@/lib/supabase";
import { api, session } from "@/lib/api";
import { useTranslations } from "next-intl";

export default function AuthCallbackPage() {
  const router = useRouter();
  const t = useTranslations("AuthCallback");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function handleCallback() {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !data.session) {
          setError(t("authFailed"));
          return;
        }

        // Supabase 토큰으로 내 정보 조회 + 플랫폼 JWT(7일) 교환
        const meResult = await api.me(data.session.access_token);
        let platformToken = data.session.access_token;
        try {
          const ex = await api.exchange(data.session.access_token);
          if (ex.token) platformToken = ex.token;
        } catch {
          /* 교환 실패 시 Supabase 토큰 폴백 (refresh 로직 작동) */
        }
        session.save({ token: platformToken, user: meResult.user });
        // 플랫폼 JWT는 자체 만료라 refresh 불필요 — refresh info는 안 저장
        router.replace("/");
      } catch (err) {
        setError(err instanceof Error ? err.message : t("authFailed"));
      }
    }

    handleCallback();
  }, [router, t]);

  if (error) {
    return (
      <section className="flex flex-1 items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-600">{error}</p>
          <a href="/login" className="mt-4 inline-block text-blue-600 hover:underline">
            {t("backToLogin")}
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-1 items-center justify-center px-4">
      <p className="text-zinc-500">{t("processing")}</p>
    </section>
  );
}
