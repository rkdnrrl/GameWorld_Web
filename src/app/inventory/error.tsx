"use client";

import Link from "next/link";

export default function InventoryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="mx-auto w-full max-w-2xl px-6 py-16 text-center">
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
        보관함을 표시하지 못했습니다
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        {process.env.NODE_ENV === "development" ? error.message : "일시적인 오류일 수 있습니다."}
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          다시 시도
        </button>
        <Link
          href="/games"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-600"
        >
          게임 목록
        </Link>
      </div>
    </section>
  );
}
