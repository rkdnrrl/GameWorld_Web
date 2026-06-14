"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { supabase } from "@/lib/supabase";

type Phase = "verifying" | "ready" | "invalid" | "done";

export default function ResetPasswordPage() {
  const t = useTranslations("ResetPassword");
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("verifying");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const readyRef = useRef(false);

  // 재설정 메일 링크 → supabase 가 URL 코드로 복구 세션 수립(detectSessionInUrl).
  // 이벤트(onAuthStateChange)와 즉시조회(getSession) 둘 다 처리, 타임아웃이면 무효 링크.
  useEffect(() => {
    let mounted = true;
    const markReady = () => {
      if (mounted && !readyRef.current) { readyRef.current = true; setPhase("ready"); }
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => { if (sess) markReady(); });
    supabase.auth.getSession().then(({ data }) => { if (data.session) markReady(); }).catch(() => {});
    const tid = setTimeout(() => { if (mounted && !readyRef.current) setPhase("invalid"); }, 6000);
    return () => { mounted = false; sub.subscription.unsubscribe(); clearTimeout(tid); };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (password.length < 8) { setError(t("tooShort")); return; }
    if (password !== confirm) { setError(t("mismatch")); return; }
    setSubmitting(true);
    setError("");
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) { setError(t("error")); return; }
      await supabase.auth.signOut().catch(() => {});
      setPhase("done");
    } catch {
      setError(t("error"));
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls = "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800";

  return (
    <section className="mx-auto w-full max-w-md px-4 py-12">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-2xl font-bold">{t("title")}</h1>

        {phase === "verifying" && <p className="mt-8 text-sm text-zinc-500">{t("verifying")}</p>}

        {phase === "invalid" && (
          <>
            <p className="mt-8 rounded-md bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-300">{t("invalidLink")}</p>
            <p className="mt-5 text-sm">
              <Link href="/forgot-password" className="font-semibold text-blue-600 hover:underline">{t("requestAgain")}</Link>
            </p>
          </>
        )}

        {phase === "ready" && (
          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={t("newPassword")} className={inputCls} disabled={submitting} autoComplete="new-password" required
            />
            <input
              type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              placeholder={t("confirmPassword")} className={inputCls} disabled={submitting} autoComplete="new-password" required
            />
            {error ? <p className="text-sm text-red-500">{error}</p> : null}
            <button
              type="submit" disabled={submitting}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting ? t("submitting") : t("submit")}
            </button>
          </form>
        )}

        {phase === "done" && (
          <>
            <p className="mt-8 rounded-md bg-green-50 p-4 text-sm text-green-700 dark:bg-green-900/30 dark:text-green-300">{t("success")}</p>
            <button
              onClick={() => router.replace("/login")}
              className="mt-5 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {t("backToLogin")}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
