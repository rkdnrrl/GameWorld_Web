"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { api, session } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useLoggedIn } from "@/lib/useLoggedIn";

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
        setError(signUpError.message);
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
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder={t("nicknamePlaceholder")}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
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
          required
          minLength={8}
        />
        <input
          type="password"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          placeholder={t("passwordConfirm")}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
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
    </section>
  );
}
