"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Logo from "./Logo";
import { SESSION_CHANGE_EVENT, session } from "@/lib/api";

export default function Header() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);
  const [coins, setCoins] = useState<number | null>(null);

  const fetchCoins = useCallback(async (token: string) => {
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const c = data?.user?.coins;
      setCoins(typeof c === "number" ? c : null);
    } catch {
      // 무시
    }
  }, []);

  const syncFromStorage = useCallback(() => {
    const token = session.getToken();
    const isLoggedIn = !!token;
    setLoggedIn(isLoggedIn);
    if (isLoggedIn && token) {
      fetchCoins(token);
    } else {
      setCoins(null);
    }
  }, [fetchCoins]);

  useEffect(() => {
    syncFromStorage();
    window.addEventListener(SESSION_CHANGE_EVENT, syncFromStorage);

    // 탭 포커스 시 코인 갱신
    const onFocus = () => {
      const token = session.getToken();
      if (token) fetchCoins(token);
    };
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener(SESSION_CHANGE_EVENT, syncFromStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, [syncFromStorage, fetchCoins]);

  function onLogout() {
    session.clear();
    router.push("/");
  }

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex min-h-14 w-full max-w-6xl min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-2 px-3 py-2 sm:min-h-16 sm:flex-nowrap sm:px-6 sm:py-0">
        <Link href="/" aria-label="ALP 홈" className="shrink-0">
          <Logo size={28} />
        </Link>
        <nav className="flex min-w-0 max-w-full flex-[1_1_0%] flex-wrap items-center justify-end gap-x-2 gap-y-1.5 text-xs sm:flex-none sm:gap-x-4 sm:text-sm">
          <Link href="/games" className="shrink-0 whitespace-nowrap hover:text-blue-600">
            게임
          </Link>
          {loggedIn && (
            <Link href="/account" className="shrink-0 whitespace-nowrap hover:text-blue-600">
              내 정보
            </Link>
          )}
          {loggedIn && (
            <Link href="/inventory" className="shrink-0 whitespace-nowrap hover:text-blue-600">
              보관함
            </Link>
          )}
          {loggedIn && typeof coins === "number" && (
            <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full bg-yellow-50 px-2 py-1 text-xs font-semibold text-yellow-600 sm:max-w-[11rem] sm:px-3 sm:text-sm dark:bg-yellow-900/30 dark:text-yellow-400">
              <span className="shrink-0">🪙</span>
              <span className="min-w-0 truncate tabular-nums">
                {coins.toLocaleString()}
              </span>
            </span>
          )}
          {loggedIn ? (
            <button
              type="button"
              onClick={onLogout}
              className="shrink-0 whitespace-nowrap rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 hover:bg-zinc-50 sm:px-3 sm:text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              로그아웃
            </button>
          ) : (
            <Link
              href="/login"
              className="shrink-0 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1.5 text-xs text-white hover:bg-zinc-700 sm:px-3 sm:text-sm dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              로그인
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
