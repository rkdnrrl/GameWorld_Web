"use client";

import { Link, useRouter } from "@/i18n/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, session, type User } from "@/lib/api";
import { useLoggedIn } from "@/lib/useLoggedIn";
import { useTranslations } from "next-intl";
import { supabase } from "@/lib/supabase";
import ProfileCustomizeModal from "@/components/account/ProfileCustomizeModal";

function formatJoined(iso: string | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

export default function AccountPage() {
  const router = useRouter();
  const loggedIn = useLoggedIn();
  const t = useTranslations("Account");
  const tCommon = useTranslations("Common");

  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nicknameInput, setNicknameInput] = useState("");
  const [nicknameMessage, setNicknameMessage] = useState<string | null>(null);
  const [savingNickname, setSavingNickname] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwMessage, setPwMessage] = useState<string | null>(null);
  const [savingPw, setSavingPw] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const refreshProfile = useCallback(async (tk: string) => {
    setLoadError(null);
    try {
      const { user: me } = await api.me(tk);
      setUser(me);
      setNicknameInput(me.nickname || "");
      session.updateStoredUser(me);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        session.clear();
        router.replace("/login");
        return;
      }
      setLoadError(err instanceof ApiError ? err.message : t("profileLoadFailed"));
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
    if (!loggedIn && !loading && !session.getToken()) {
      router.replace("/login");
    }
  }, [loggedIn, loading, router]);

  async function handleSaveNickname() {
    if (!token || !user) return;
    const next = nicknameInput.trim();
    if (!next) return;
    if (next === user.nickname) {
      setNicknameMessage(t("nicknameUnchanged"));
      return;
    }

    setSavingNickname(true);
    setNicknameMessage(null);
    try {
      const res = await api.updateProfile(token, { nickname: next });
      setUser(res.user);
      setNicknameInput(res.user.nickname || "");
      setNicknameMessage(t("nicknameSaved"));
      session.updateStoredUser(res.user);
    } catch (err) {
      setNicknameMessage(err instanceof ApiError ? err.message : t("saveFailed"));
    } finally {
      setSavingNickname(false);
    }
  }

  async function handleChangePassword() {
    if (!user?.email || !token || savingPw) return;
    if (newPw.length < 8) {
      setPwMessage(t("pwTooShort"));
      return;
    }
    if (newPw !== confirmPw) {
      setPwMessage(t("pwMismatch"));
      return;
    }
    setSavingPw(true);
    setPwMessage(null);
    try {
      // 서버에서 현재 비번 검증 + admin API 로 즉시 변경.
      // (client-side supabase.updateUser 는 세션 없음/이메일 확인 설정 시 성공만 뜨고 실제 변경이 안 됨)
      await api.changePassword(token, user.email, currentPw, newPw);
      setPwMessage(t("pwChanged"));
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err) {
      // 403 = 현재 비밀번호 틀림 (구글 로그인 계정도 비번 없어 여기로 옴)
      if (err instanceof ApiError && err.status === 403) {
        setPwMessage(t("pwCurrentWrong"));
      } else {
        setPwMessage(err instanceof ApiError ? err.message : t("pwChangeFailed"));
      }
    } finally {
      setSavingPw(false);
    }
  }

  async function handleWithdraw() {
    if (!token || deleting) return;
    if (!window.confirm(t("withdrawDesc"))) return;
    setDeleting(true);
    try {
      await api.deleteAccount(token);
      await supabase.auth.signOut();
      session.clear();
      router.replace("/login");
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : t("withdrawFailed"));
    } finally {
      setDeleting(false);
    }
  }

  if (!token && !loading) return null;

  return (
    <section className="mx-auto w-full max-w-lg px-4 py-10 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
      <p className="mt-2 text-sm text-zinc-500">{t("subtitle")}</p>

      {loading ? <p className="mt-6 text-sm text-zinc-500">{tCommon("loading")}</p> : null}

      {loadError ? (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => {
              const tk = session.getToken();
              if (!tk) return;
              setLoading(true);
              void refreshProfile(tk);
            }}
            className="mt-3 rounded-md bg-red-700 px-3 py-1.5 text-white"
          >
            {tCommon("retry")}
          </button>
        </div>
      ) : null}

      {user && !loading ? (
        <>
          <dl className="mt-6 space-y-4 rounded-xl border border-zinc-200 bg-white p-6">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{t("email")}</dt>
              <dd className="mt-1 text-sm font-medium break-all">{user.email || "-"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{t("coins")}</dt>
              <dd className="mt-1 text-sm font-medium tabular-nums">{typeof user.coins === "number" ? user.coins.toLocaleString() : "0"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{t("joinedAt")}</dt>
              <dd className="mt-1 text-sm">{formatJoined(user.createdAt)}</dd>
            </div>
          </dl>

          <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="text-lg font-semibold">{t("nicknameSection")}</h2>
            <div className="mt-3 space-y-3">
              <input
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
                maxLength={20}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
              {nicknameMessage ? <p className="text-sm text-zinc-600">{nicknameMessage}</p> : null}
              <button
                type="button"
                onClick={handleSaveNickname}
                disabled={savingNickname}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {savingNickname ? t("savingNickname") : t("saveNickname")}
              </button>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="text-lg font-semibold">{t("pwSection")}</h2>
            <div className="mt-3 space-y-3">
              <input
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                placeholder={t("pwCurrent")}
                autoComplete="current-password"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder={t("pwNew")}
                autoComplete="new-password"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
              <input
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder={t("pwConfirm")}
                autoComplete="new-password"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
              {pwMessage ? <p className="text-sm text-zinc-600">{pwMessage}</p> : null}
              <button
                type="button"
                onClick={handleChangePassword}
                disabled={savingPw || !currentPw || !newPw || !confirmPw}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {savingPw ? t("pwSaving") : t("pwButton")}
              </button>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-indigo-200 bg-indigo-50 p-6">
            <h2 className="text-lg font-semibold text-indigo-800">{t("customizeSection")}</h2>
            <p className="mt-2 text-sm text-indigo-700">{t("customizeDesc")}</p>
            <button
              type="button"
              onClick={() => setCustomizeOpen(true)}
              className="mt-4 inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              {t("customizeButton")}
            </button>
          </div>
          <ProfileCustomizeModal open={customizeOpen} onClose={() => setCustomizeOpen(false)} />

          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-6">
            <h2 className="text-lg font-semibold text-emerald-800">{t("friendsSection")}</h2>
            <p className="mt-2 text-sm text-emerald-700">{t("friendsDesc")}</p>
            <Link
              href="/friends"
              className="mt-4 inline-block rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              {t("friendsButton")}
            </Link>
          </div>

          <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6">
            <h2 className="text-lg font-semibold text-red-800">{t("withdrawSection")}</h2>
            <p className="mt-2 text-sm text-red-700">{t("withdrawDesc")}</p>
            <button
              type="button"
              onClick={handleWithdraw}
              disabled={deleting}
              className="mt-4 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-60"
            >
              {deleting ? t("withdrawSubmitting") : t("withdrawButton")}
            </button>
          </div>

          <p className="mt-8 text-center text-sm text-zinc-500">
            <Link href="/" className="text-blue-600 hover:underline">
              {tCommon("backHome")}
            </Link>
          </p>
        </>
      ) : null}
    </section>
  );
}
