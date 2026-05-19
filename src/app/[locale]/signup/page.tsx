"use client";

import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useState, FormEvent } from "react";
import { api, session } from "@/lib/api";
import { useLoggedIn } from "@/lib/useLoggedIn";
import { useTranslations } from "next-intl";

type FormState = {
  email: string;
  nickname: string;
  password: string;
  passwordConfirm: string;
};

const initial: FormState = {
  email: "",
  nickname: "",
  password: "",
  passwordConfirm: "",
};

export default function SignupPage() {
  const router = useRouter();
  const loggedIn = useLoggedIn();
  const t = useTranslations("Signup");

  useEffect(() => {
    if (loggedIn) router.replace("/");
  }, [loggedIn, router]);

  const [form, setForm] = useState<FormState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): string | null {
    if (!form.email.includes("@")) return t("errorInvalidEmail");
    if (form.nickname.trim().length < 2) return t("errorNicknameTooShort");
    if (form.nickname.trim().length > 20) return t("errorNicknameTooLong");
    if (form.password.length < 8) return t("errorPasswordTooShort");
    if (form.password !== form.passwordConfirm) return t("errorPasswordMismatch");
    return null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = validate();
    if (v) { setError(v); return; }
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      // Common API 회원가입 (CommonDB가 단일 사용자 소스)
      // redirectTo: 이메일 인증 후 돌아올 URL (메일 발송에 필수)
      const result = await api.signup({
        email: form.email,
        nickname: form.nickname.trim(),
        password: form.password,
        redirectTo: window.location.origin + "/",
      });
      // 이메일 인증 필요 → 안내 메시지만 표시하고 종료
      if ("requiresEmailConfirmation" in result && result.requiresEmailConfirmation) {
        setSuccess(result.message || t("emailConfirmationSent"));
        return;
      }
      // 즉시 활성화된 경우만 로그인 처리
      if ("token" in result) {
        session.save({ token: result.token, user: result.user });
        router.push("/");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorInvalidEmail"));
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
          <Field label={t("email")}>
            <input
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              className="input"
              placeholder="you@example.com"
              required
            />
          </Field>

          <Field label={t("nickname")}>
            <input
              type="text"
              value={form.nickname}
              onChange={(e) => update("nickname", e.target.value)}
              className="input"
              placeholder={t("nicknamePlaceholder")}
              required
            />
          </Field>

          <Field label={t("password")}>
            <input
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              className="input"
              placeholder={t("passwordPlaceholder")}
              required
            />
          </Field>

          <Field label={t("passwordConfirm")}>
            <input
              type="password"
              autoComplete="new-password"
              value={form.passwordConfirm}
              onChange={(e) => update("passwordConfirm", e.target.value)}
              className="input"
              required
            />
          </Field>

          {error && (
            <p className="break-words rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}

          {success && (
            <p className="break-words rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
              ✉️ {success}
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

        <p className="mt-6 text-center text-sm text-zinc-500">
          {t("hasAccount")}{" "}
          <Link href="/login" className="text-blue-600 hover:underline">
            {t("loginLink")}
          </Link>
        </p>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
