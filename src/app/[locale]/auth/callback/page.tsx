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

        const meResult = await api.me(data.session.access_token);
        session.save({ token: data.session.access_token, user: meResult.user });
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
