"use client";

import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useState, FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { api, session } from "@/lib/api";
import { useLoggedIn } from "@/lib/useLoggedIn";
import { useTranslations } from "next-intl";

export default function LoginPage() {
  const router = useRouter();
  const loggedIn = useLoggedIn();
  const t = useTranslations("Login");

  useEffect(() => {
    if (loggedIn) router.replace("/");
  }, [loggedIn, router]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) { setError(t("errorInvalidEmail")); return; }
    if (!password) { setError(t("errorNoPassword")); return; }
    setError(null);
    setSubmitting(true);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(t("errorInvalidCredentials"));
        return;
      }

      const meResult = await api.me(data.session.access_token);
      session.save({ token: data.session.access_token, user: meResult.user });
      session.saveRefreshInfo(data.session.refresh_token, data.session.expires_at ?? 0);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorInvalidCredentials"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6 sm:py-16">
      <div className="w-full min-w-0 max-w-md">
        <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-2 break-words text-sm text-zinc-500">
          {t("subtitle")}
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{t("email")}</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="you@example.com"
              required
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{t("password")}</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              required
            />
          </label>

          {error && (
            <p className="break-words rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? t("submitting") : t("submit")}
          </button>
        </form>

        <div className="mt-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
          <span className="text-xs text-zinc-400">또는</span>
          <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          className="mt-4 flex w-full items-center justify-center gap-3 rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.6 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 2.9l5.7-5.7C34 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16.1 19 13 24 13c3.1 0 5.8 1.1 8 2.9l5.7-5.7C34 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.3 26.8 36 24 36c-5.2 0-9.6-3.4-11.2-8H6.5C9.9 35.8 16.4 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.2 5.2C40.8 35.8 44 30.3 44 24c0-1.3-.1-2.6-.4-3.9z"/>
          </svg>
          Google로 로그인
        </button>

        {!loggedIn && (
          <p className="mt-6 text-center text-sm text-zinc-500">
            {t("noAccount")}{" "}
            <Link href="/signup" className="text-blue-600 hover:underline">
              {t("signupLink")}
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}
