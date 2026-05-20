"use client";

import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  api,
  session,
  ApiError,
  type User,
} from "@/lib/api";
import { useLoggedIn } from "@/lib/useLoggedIn";
import { useTranslations } from "next-intl";

function formatJoined(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function AccountPage() {
  const router = useRouter();
  const loggedIn = useLoggedIn();
  const t = useTranslations("Account");
  const tCommon = useTranslations("Common");

  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [dungeonRecord, setDungeonRecord] = useState<{ dungeonMaxFloor: number; dungeonMaxKills: number } | null>(null);

  const refreshProfile = useCallback(async (tk: string) => {
    setLoadError(null);
    try {
      const [{ user: next }, recordRes] = await Promise.all([
        api.me(tk),
        api.getDungeonRecord(tk).catch(() => ({ record: null })),
      ]);
      setUser(next);
      session.updateStoredUser(next);
      setDungeonRecord(recordRes.record);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        session.clear();
        router.replace("/login");
        return;
      }
      setLoadError(
        err instanceof ApiError ? err.message : t("profileLoadFailed"),
      );
    } finally {
      setLoading(false);
    }
  }, [router, t]);

  useEffect(() => {
    const tk = session.getToken();
    setToken(tk);
    if (!tk) {
      setLoading(false);
      router.replace("/login");
      return;
    }
    void refreshProfile(tk);
  }, [router, refreshProfile]);

  useEffect(() => {
    if (!loggedIn && !loading) {
      const tk = session.getToken();
      if (!tk) router.replace("/login");
    }
  }, [loggedIn, loading, router]);

  function goAirnuriAccount() {
    const returnTo = encodeURIComponent(window.location.origin + "/");
    window.location.href = `https://airnuri.com/account?return_to=${returnTo}`;
  }

  function goAirnuriWithdraw() {
    const returnTo = encodeURIComponent(window.location.origin + "/");
    window.location.href = `https://airnuri.com/account?return_to=${returnTo}`;
  }

  if (!token && !loading) {
    return null;
  }

  return (
    <section className="mx-auto w-full min-w-0 max-w-lg px-4 py-10 sm:px-6 sm:py-12">
      <div className="mb-8 min-w-0">
        <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-2 break-words text-sm text-zinc-500">
          {t("subtitle")}
        </p>
      </div>

      {loading && (
        <p className="text-sm text-zinc-500">{tCommon("loading")}</p>
      )}

      {loadError && !loading && (
        <div className="mb-6 space-y-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <p className="break-words">{loadError}</p>
          <button
            type="button"
            onClick={() => {
              const tk = session.getToken();
              if (tk) {
                setLoading(true);
                void refreshProfile(tk);
              }
            }}
            className="rounded-md bg-red-700 px-3 py-1.5 text-white hover:bg-red-800"
          >
            {tCommon("retry")}
          </button>
        </div>
      )}

      {user && !loading && (
        <>
          <dl className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                {t("email")}
              </dt>
              <dd className="mt-1 break-all text-sm font-medium">{user.email}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                {t("coins")}
              </dt>
              <dd className="mt-1 text-sm font-medium tabular-nums">
                🪙 {typeof user.coins === "number" ? user.coins.toLocaleString() : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                {t("joinedAt")}
              </dt>
              <dd className="mt-1 text-sm">{formatJoined(user.createdAt)}</dd>
            </div>
          </dl>

          <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-4 text-lg font-semibold">{t("recordsSection")}</h2>
            <dl className="space-y-3">
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-sm text-zinc-500">
                  <span>⚔️</span> {t("dungeonMaxFloor")}
                </dt>
                <dd className="text-sm font-bold tabular-nums">
                  {dungeonRecord ? `${dungeonRecord.dungeonMaxFloor}${t("floorUnit")}` : "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-sm text-zinc-500">
                  <span>💀</span> {t("dungeonMaxKills")}
                </dt>
                <dd className="text-sm font-bold tabular-nums">
                  {dungeonRecord ? `${dungeonRecord.dungeonMaxKills}${t("killUnit")}` : "—"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-8 space-y-3 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold">{t("nicknameSection")}</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              <span className="font-medium text-zinc-900 dark:text-zinc-100">{user?.nickname || "—"}</span>
            </p>
            <button
              type="button"
              onClick={goAirnuriAccount}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {t("saveNickname")}
            </button>
          </div>

          <div className="mt-10 rounded-xl border border-red-200 bg-red-50/80 p-6 dark:border-red-900/60 dark:bg-red-950/30">
            <h2 className="text-lg font-semibold text-red-900 dark:text-red-200">
              {t("withdrawSection")}
            </h2>
            <p className="mt-2 text-sm text-red-800/90 dark:text-red-300/90">
              {t("withdrawDesc")}
            </p>
            <button
              type="button"
              onClick={goAirnuriWithdraw}
              className="mt-4 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900/40"
            >
              {t("withdrawButton")}
            </button>
          </div>

          <p className="mt-8 text-center text-sm text-zinc-500">
            <Link href="/" className="text-blue-600 hover:underline">
              {tCommon("backHome")}
            </Link>
          </p>
        </>
      )}
    </section>
  );
}
