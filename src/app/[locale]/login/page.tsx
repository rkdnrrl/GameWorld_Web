"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { api, session } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useLoggedIn } from "@/lib/useLoggedIn";
import { Link } from "@/i18n/navigation";

function mapLoginError(message: string, fallback: string) {
  const m = (message || "").toLowerCase();
  if (m.includes("invalid login credentials")) return fallback;
  if (m.includes("email not confirmed")) return fallback;
  if (m.includes("too many requests")) return fallback;
  return message || fallback;
}

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
        setError(mapLoginError(authError?.message || "", t("errorInvalidCredentials")));
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
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-2 text-sm text-zinc-500">{t("subtitle")}</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("email")}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
          disabled={submitting}
          autoComplete="email"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("password")}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
          disabled={submitting}
          autoComplete="current-password"
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
      <p className="mt-5 text-sm text-zinc-500">
        {t("noAccount")}{" "}
        <Link href="/signup" className="font-semibold text-blue-600 hover:underline">
          {t("signupLink")}
        </Link>
      </p>
      </div>
    </section>
  );
}
