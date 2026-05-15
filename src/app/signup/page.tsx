"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { api, session } from "@/lib/api";
import { useLoggedIn } from "@/lib/useLoggedIn";

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

  useEffect(() => {
    if (loggedIn) router.replace("/");
  }, [loggedIn, router]);

  const [form, setForm] = useState<FormState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): string | null {
    if (!form.email.includes("@")) return "올바른 이메일을 입력해주세요.";
    if (form.nickname.trim().length < 2) return "닉네임은 2자 이상이어야 합니다.";
    if (form.nickname.trim().length > 20) return "닉네임은 20자 이하여야 합니다.";
    if (form.password.length < 8) return "비밀번호는 8자 이상이어야 합니다.";
    if (form.password !== form.passwordConfirm) return "비밀번호가 일치하지 않습니다.";
    return null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = validate();
    if (v) { setError(v); return; }
    setError(null);
    setSubmitting(true);

    try {
      // 1. Supabase에 회원가입 — 닉네임을 metadata로 전달해 DB 트리거가 사용
      const { data, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: { nickname: form.nickname.trim() },
        },
      });

      if (authError) {
        setError(authError.message);
        return;
      }
      if (!data.session) {
        // 이메일 확인이 필요한 경우 (Supabase 대시보드에서 설정)
        setError("가입 확인 이메일을 보냈습니다. 이메일을 확인해 주세요.");
        return;
      }

      // 2. Supabase access_token으로 우리 서버에서 유저 정보 조회
      const meResult = await api.me(data.session.access_token);

      // 3. 세션 저장 (기존 session 유틸 재사용)
      session.save({ token: data.session.access_token, user: meResult.user });
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "서버에 연결할 수 없습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6 sm:py-16">
      <div className="w-full min-w-0 max-w-md">
        <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">
          회원가입
        </h1>
        <p className="mt-2 break-words text-sm text-zinc-500">
          ALP에 오신 것을 환영합니다.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-5">
          <Field label="이메일">
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

          <Field label="닉네임">
            <input
              type="text"
              value={form.nickname}
              onChange={(e) => update("nickname", e.target.value)}
              className="input"
              placeholder="플레이어 이름 (2~20자)"
              required
            />
          </Field>

          <Field label="비밀번호">
            <input
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              className="input"
              placeholder="8자 이상"
              required
            />
          </Field>

          <Field label="비밀번호 확인">
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

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? "처리 중..." : "회원가입"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="text-blue-600 hover:underline">
            로그인
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
