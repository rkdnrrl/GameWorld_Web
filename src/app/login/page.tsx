"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { api, session } from "@/lib/api";
import { useLoggedIn } from "@/lib/useLoggedIn";

export default function LoginPage() {
  const router = useRouter();
  const loggedIn = useLoggedIn();

  useEffect(() => {
    if (loggedIn) router.replace("/");
  }, [loggedIn, router]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) { setError("올바른 이메일을 입력해주세요."); return; }
    if (!password) { setError("비밀번호를 입력해주세요."); return; }
    setError(null);
    setSubmitting(true);

    try {
      // 1. Supabase로 로그인
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError("이메일 또는 비밀번호가 올바르지 않습니다.");
        return;
      }

      // 2. Supabase access_token으로 우리 서버에서 유저 정보 조회
      const meResult = await api.me(data.session.access_token);

      // 3. 세션 저장
      session.save({ token: data.session.access_token, user: meResult.user });
      router.push("/");
    } catch {
      setError("서버에 연결할 수 없습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6 sm:py-16">
      <div className="w-full min-w-0 max-w-md">
        <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">
          로그인
        </h1>
        <p className="mt-2 break-words text-sm text-zinc-500">
          ALP 계정으로 로그인하세요.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">이메일</span>
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
            <span className="mb-1.5 block text-sm font-medium">비밀번호</span>
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
            {submitting ? "처리 중..." : "로그인"}
          </button>
        </form>

        {!loggedIn && (
          <p className="mt-6 text-center text-sm text-zinc-500">
            계정이 없으신가요?{" "}
            <Link href="/signup" className="text-blue-600 hover:underline">
              회원가입
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}
