"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { api, session } from "@/lib/api";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function handleCallback() {
      try {
        // Supabase가 URL 해시/쿼리에서 세션을 자동으로 파싱
        const { data, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !data.session) {
          setError("인증에 실패했습니다. 다시 시도해주세요.");
          return;
        }

        const meResult = await api.me(data.session.access_token);
        session.save({ token: data.session.access_token, user: meResult.user });
        router.replace("/");
      } catch (err) {
        setError(err instanceof Error ? err.message : "서버에 연결할 수 없습니다.");
      }
    }

    handleCallback();
  }, [router]);

  if (error) {
    return (
      <section className="flex flex-1 items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-600">{error}</p>
          <a href="/login" className="mt-4 inline-block text-blue-600 hover:underline">
            로그인 페이지로 돌아가기
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-1 items-center justify-center px-4">
      <p className="text-zinc-500">인증 처리 중...</p>
    </section>
  );
}
