"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Logo from "./Logo";
import { SESSION_CHANGE_EVENT, session } from "@/lib/api";

export default function Header() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);

  const syncFromStorage = useCallback(() => {
    setLoggedIn(!!session.getToken());
  }, []);

  useEffect(() => {
    syncFromStorage();
    window.addEventListener(SESSION_CHANGE_EVENT, syncFromStorage);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, syncFromStorage);
  }, [syncFromStorage]);

  function onLogout() {
    session.clear();
    router.push("/");
  }

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" aria-label="ALP 홈">
          <Logo size={28} />
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/games" className="hover:text-blue-600">
            게임
          </Link>
          {loggedIn ? (
            <button
              type="button"
              onClick={onLogout}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              로그아웃
            </button>
          ) : (
            <Link
              href="/login"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              로그인
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
