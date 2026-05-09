"use client";

import Link from "next/link";
import { useLoggedIn } from "@/lib/useLoggedIn";

export default function HomeCtas() {
  const loggedIn = useLoggedIn();

  return (
    <div className="mt-10 flex justify-center gap-4">
      <Link
        href="/games"
        className="rounded-md bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700"
      >
        게임 둘러보기
      </Link>
      {!loggedIn && (
        <Link
          href="/signup"
          className="rounded-md border border-zinc-300 px-6 py-3 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          회원가입
        </Link>
      )}
    </div>
  );
}
