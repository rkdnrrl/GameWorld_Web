"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { api, session } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useLoggedIn } from "@/lib/useLoggedIn";

export default function LoginPage() {
  const t = useTranslations("Login");
  const router = useRouter();
  const loggedIn = useLoggedIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loggedIn) router.replace("/");
  }, [loggedIn, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError || !data.session) {
        setError(authError?.message || t("errorInvalidCredentials"));
        return;
      }

      const supaToken = data.session.access_token;
      const refreshToken = data.session.refresh_token;
      const expiresAt = data.session.expires_at;

      let token = supaToken;
      try {
        const ex = await api.exchange(supaToken);
        if (ex.token) token = ex.token;
      } catch {}

      const { user } = await api.me(token);
      session.save({ token, user });
      if (refreshToken && expiresAt) {
        session.saveRefreshInfo(refreshToken, expiresAt);
      }
      router.replace("/");
    } catch {
      setError(t("errorInvalidCredentials"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-2 text-sm text-zinc-500">{t("subtitle")}</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("email")}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("password")}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
          required
        />
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {submitting ? t("submitting") : t("submit")}
        </button>
      </form>
    </section>
  );
}
