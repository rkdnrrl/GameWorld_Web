"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { api, session } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useLoggedIn } from "@/lib/useLoggedIn";
import { Link } from "@/i18n/navigation";

function mapSignupError(message: string, fallback: string) {
  const m = (message || "").toLowerCase();
  if (m.includes("user already registered")) return fallback;
  if (m.includes("password")) return fallback;
  return message || fallback;
}

export default function SignupPage() {
  const t = useTranslations("Signup");
  const router = useRouter();
  const loggedIn = useLoggedIn();
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [doneMessage, setDoneMessage] = useState("");

  useEffect(() => {
    if (loggedIn) router.replace("/");
  }, [loggedIn, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    setDoneMessage("");

    try {
      if (password !== passwordConfirm) {
        setError(t("errorPasswordMismatch"));
        return;
      }

      const locale = document.documentElement.lang || "ko";
      const redirectTo = `${window.location.origin}/${locale}/auth/callback`;
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: { nickname: nickname.trim() },
        },
      });

      if (signUpError) {
        setError(mapSignupError(signUpError.message, t("signupFailed")));
        return;
      }

      if (!data.session) {
        setDoneMessage(t("emailConfirmationSent"));
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
      setError(t("signupFailed"));
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
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder={t("nicknamePlaceholder")}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
          disabled={submitting}
          autoComplete="nickname"
          required
          minLength={2}
          maxLength={20}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("passwordPlaceholder")}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
          disabled={submitting}
          autoComplete="new-password"
          required
          minLength={8}
        />
        <input
          type="password"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          placeholder={t("passwordConfirm")}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
          disabled={submitting}
          autoComplete="new-password"
          required
          minLength={8}
        />
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        {doneMessage ? <p className="text-sm text-emerald-500">{doneMessage}</p> : null}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {submitting ? t("submitting") : t("submit")}
        </button>
      </form>
      <p className="mt-5 text-sm text-zinc-500">
        {t("hasAccount")}{" "}
        <Link href="/login" className="font-semibold text-blue-600 hover:underline">
          {t("loginLink")}
        </Link>
      </p>
      </div>
    </section>
  );
}
