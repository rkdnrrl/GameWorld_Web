"use client";

import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Logo from "./Logo";
import { SESSION_CHANGE_EVENT, SESSION_EXPIRED_EVENT, session } from "@/lib/api";

const LOCALES = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
];

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("Header");

  const [loggedIn, setLoggedIn] = useState(false);
  const [coins, setCoins] = useState<number | null>(null);
  const [operatorAccess, setOperatorAccess] = useState(false);
  // 만료 임박 경고 (분 단위, null=정상)
  const [expiryWarningMins, setExpiryWarningMins] = useState<number | null>(null);

  const fetchCoins = useCallback(async (token: string) => {
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const c = data?.user?.coins;
      setCoins(typeof c === "number" ? c : null);
      setOperatorAccess(!!data?.user?.operatorAccess);
    } catch {
      // 무시
    }
  }, []);

  const syncFromStorage = useCallback(() => {
    const token = session.getToken();
    const isLoggedIn = !!token;
    setLoggedIn(isLoggedIn);
    const u = session.getUser();
    setOperatorAccess(!!u?.operatorAccess);
    if (isLoggedIn && token) {
      fetchCoins(token);
    } else {
      setCoins(null);
      setOperatorAccess(false);
      setExpiryWarningMins(null);
    }
  }, [fetchCoins]);

  // 만료 상태 주기적으로 체크
  const checkExpiry = useCallback(() => {
    if (!session.getToken()) return;
    const secs = session.expiresInSeconds();
    if (secs === null) return; // expires_at 없으면 체크 안 함

    if (secs <= 0) {
      // 이미 만료 — 이벤트 발생시키고 로그아웃 처리
      const wasLoggedIn = !!session.getToken();
      session.clear();
      if (wasLoggedIn) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      setExpiryWarningMins(null);
    } else if (secs < 10 * 60) {
      // 10분 미만 남음 → 경고
      setExpiryWarningMins(Math.ceil(secs / 60));
    } else {
      setExpiryWarningMins(null);
    }
  }, []);

  useEffect(() => {
    syncFromStorage();
    window.addEventListener(SESSION_CHANGE_EVENT, syncFromStorage);

    // 포커스 시: 코인 갱신 + 만료 체크
    const onFocus = () => {
      const token = session.getToken();
      if (token) { fetchCoins(token); checkExpiry(); }
    };
    window.addEventListener("focus", onFocus);

    // 30초마다 만료 체크
    const interval = setInterval(checkExpiry, 30_000);
    checkExpiry(); // 초기 체크

    return () => {
      window.removeEventListener(SESSION_CHANGE_EVENT, syncFromStorage);
      window.removeEventListener("focus", onFocus);
      clearInterval(interval);
    };
  }, [syncFromStorage, fetchCoins, checkExpiry]);

  function onLogout() {
    session.clear();
    router.push("/");
  }

  function onLocaleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    router.replace(pathname, { locale: e.target.value });
  }

  return (
    <>
      {/* 만료 임박 경고 배너 */}
      {loggedIn && expiryWarningMins !== null && (
        <div className="flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-white">
          <span>⏰ {expiryWarningMins}분 후 로그인이 만료됩니다.</span>
          <Link
            href="/login"
            className="shrink-0 rounded bg-white px-3 py-1 text-xs font-bold text-amber-700 hover:bg-amber-50"
          >
            {t("relogin")}
          </Link>
        </div>
      )}

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex min-h-14 w-full max-w-6xl min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-2 px-3 py-2 sm:min-h-16 sm:flex-nowrap sm:px-6 sm:py-0">
          <Link href="/" aria-label={t("homeAriaLabel")} className="shrink-0">
            <Logo size={28} />
          </Link>
          <nav className="flex min-w-0 max-w-full flex-[1_1_0%] flex-wrap items-center justify-end gap-x-2 gap-y-1.5 text-xs sm:flex-none sm:gap-x-4 sm:text-sm">
            <Link href="/games" className="shrink-0 whitespace-nowrap hover:text-blue-600">
              {t("games")}
            </Link>
            <Link href="/announcements" className="shrink-0 whitespace-nowrap hover:text-blue-600">
              {t("announcements")}
            </Link>
            <Link href="/shop" className="shrink-0 whitespace-nowrap hover:text-blue-600">
              {t("shop")}
            </Link>
            <Link href="/donate" className="shrink-0 whitespace-nowrap hover:text-blue-600">
              {t("donate")}
            </Link>
            {loggedIn && operatorAccess && (
              <Link
                href="/operator"
                className="shrink-0 whitespace-nowrap font-medium text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200"
              >
                {t("operator")}
              </Link>
            )}
            {loggedIn && (
              <Link
                href="/develop"
                className="shrink-0 whitespace-nowrap font-medium text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-200"
              >
                {t("develop")}
              </Link>
            )}
            {loggedIn && (
              <Link href="/account" className="shrink-0 whitespace-nowrap hover:text-blue-600">
                {t("myInfo")}
              </Link>
            )}
            {loggedIn && (
              <Link href="/inventory" className="shrink-0 whitespace-nowrap hover:text-blue-600">
                {t("inventory")}
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
                {t("logout")}
              </button>
            ) : (
              <Link
                href="/login"
                className="shrink-0 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1.5 text-xs text-white hover:bg-zinc-700 sm:px-3 sm:text-sm dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {t("login")}
              </Link>
            )}
            {/* 언어 선택기 */}
            <select
              value={locale}
              onChange={onLocaleChange}
              aria-label="Language"
              className="shrink-0 rounded-md border border-zinc-300 bg-white px-1.5 py-1 text-xs text-zinc-700 hover:border-zinc-400 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
            >
              {LOCALES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </nav>
        </div>
      </header>
    </>
  );
}
