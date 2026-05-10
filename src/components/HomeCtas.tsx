"use client";

import Link from "next/link";
import { useLoggedIn } from "@/lib/useLoggedIn";

export default function HomeCtas() {
  const loggedIn = useLoggedIn();

  return (
    <div className="mx-auto mt-10 flex w-full max-w-md flex-col items-stretch justify-center gap-3 px-1 sm:max-w-none sm:flex-row sm:items-center sm:gap-4 sm:px-0">
      <Link
        href="/games"
        className="min-w-0 rounded-md bg-blue-600 px-4 py-3 text-center text-sm font-medium text-white hover:bg-blue-700 sm:px-6 sm:text-base"
      >
        게임 둘러보기
      </Link>
      {!loggedIn && (
        <Link
          href="/signup"
          className="min-w-0 rounded-md border border-zinc-300 px-4 py-3 text-center text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900 sm:px-6 sm:text-base"
        >
          회원가입
        </Link>
      )}
    </div>
  );
}
