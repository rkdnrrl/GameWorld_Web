"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
  FormEvent,
  ChangeEvent,
} from "react";
import {
  api,
  session,
  ApiError,
  type User,
} from "@/lib/api";
import { useLoggedIn } from "@/lib/useLoggedIn";

const WITHDRAW_CONFIRM_TEXT = "회원탈퇴";

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
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [nickname, setNickname] = useState("");
  const [profileNotice, setProfileNotice] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawPhrase, setWithdrawPhrase] = useState("");
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);

  const refreshProfile = useCallback(async (t: string) => {
    setLoadError(null);
    try {
      const { user: next } = await api.me(t);
      setUser(next);
      session.updateStoredUser(next);
      setNickname(next.nickname);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        session.clear();
        router.replace("/login");
        return;
      }
      setLoadError(
        err instanceof ApiError
          ? err.message
          : "프로필을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const t = session.getToken();
    setToken(t);
    if (!t) {
      setLoading(false);
      router.replace("/login");
      return;
    }
    void refreshProfile(t);
  }, [router, refreshProfile]);

  useEffect(() => {
    if (!loggedIn && !loading) {
      const t = session.getToken();
      if (!t) router.replace("/login");
    }
  }, [loggedIn, loading, router]);

  async function onNicknameSubmit(e: FormEvent) {
    e.preventDefault();
    const t = session.getToken();
    if (!t || !user) return;

    const nextNick = nickname.trim();
    if (nextNick.length < 2) {
      setProfileNotice({
        kind: "err",
        text: "닉네임은 2자 이상이어야 합니다.",
      });
      return;
    }
    if (nextNick === user.nickname) {
      setProfileNotice({ kind: "err", text: "변경된 내용이 없습니다." });
      return;
    }

    setProfileNotice(null);
    setProfileSaving(true);
    try {
      const res = await api.updateProfile(t, { nickname: nextNick });
      if (res.token) {
        session.save({ token: res.token, user: res.user });
      } else {
        session.updateStoredUser(res.user);
      }
      setUser(res.user);
      setNickname(res.user.nickname);
      setProfileNotice({ kind: "ok", text: "닉네임이 저장되었습니다." });
    } catch (err) {
      setProfileNotice({
        kind: "err",
        text:
          err instanceof ApiError ? err.message : "저장에 실패했습니다.",
      });
    } finally {
      setProfileSaving(false);
    }
  }

  async function onWithdrawConfirm() {
    const t = session.getToken();
    if (!t) return;
    if (withdrawPhrase.trim() !== WITHDRAW_CONFIRM_TEXT) {
      setWithdrawError(`「${WITHDRAW_CONFIRM_TEXT}」를 정확히 입력해 주세요.`);
      return;
    }
    setWithdrawError(null);
    setWithdrawSubmitting(true);
    try {
      await api.deleteAccount(t);
      session.clear();
      router.replace("/");
    } catch (err) {
      setWithdrawError(
        err instanceof ApiError
          ? err.message
          : "탈퇴 처리에 실패했습니다.",
      );
    } finally {
      setWithdrawSubmitting(false);
    }
  }

  function onWithdrawPhraseChange(e: ChangeEvent<HTMLInputElement>) {
    setWithdrawPhrase(e.target.value);
    setWithdrawError(null);
  }

  if (!token && !loading) {
    return null;
  }

  return (
    <section className="mx-auto w-full max-w-lg px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">내 정보</h1>
        <p className="mt-2 text-sm text-zinc-500">
          계정 정보를 확인하고 닉네임을 변경할 수 있습니다.
        </p>
      </div>

      {loading && (
        <p className="text-sm text-zinc-500">불러오는 중…</p>
      )}

      {loadError && !loading && (
        <div className="mb-6 space-y-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => {
              const t = session.getToken();
              if (t) {
                setLoading(true);
                void refreshProfile(t);
              }
            }}
            className="rounded-md bg-red-700 px-3 py-1.5 text-white hover:bg-red-800"
          >
            다시 시도
          </button>
        </div>
      )}

      {user && !loading && (
        <>
          <dl className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                이메일
              </dt>
              <dd className="mt-1 text-sm font-medium">{user.email}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                보유 코인
              </dt>
              <dd className="mt-1 text-sm font-medium tabular-nums">
                🪙 {typeof user.coins === "number" ? user.coins.toLocaleString() : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                가입일
              </dt>
              <dd className="mt-1 text-sm">{formatJoined(user.createdAt)}</dd>
            </div>
          </dl>

          <form
            onSubmit={onNicknameSubmit}
            className="mt-8 space-y-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h2 className="text-lg font-semibold">닉네임 변경</h2>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">닉네임</span>
              <input
                type="text"
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value);
                  setProfileNotice(null);
                }}
                className="input"
                minLength={2}
                autoComplete="nickname"
              />
            </label>
            {profileNotice && (
              <p
                className={`text-sm ${profileNotice.kind === "ok" ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-300"}`}
              >
                {profileNotice.text}
              </p>
            )}
            <button
              type="submit"
              disabled={profileSaving}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {profileSaving ? "저장 중…" : "저장"}
            </button>
          </form>

          <div className="mt-10 rounded-xl border border-red-200 bg-red-50/80 p-6 dark:border-red-900/60 dark:bg-red-950/30">
            <h2 className="text-lg font-semibold text-red-900 dark:text-red-200">
              회원 탈퇴
            </h2>
            <p className="mt-2 text-sm text-red-800/90 dark:text-red-300/90">
              탈퇴하면 계정과 관련 데이터가 삭제될 수 있습니다. 되돌릴 수 없습니다.
            </p>
            {!withdrawOpen ? (
              <button
                type="button"
                onClick={() => {
                  setWithdrawOpen(true);
                  setWithdrawPhrase("");
                  setWithdrawError(null);
                }}
                className="mt-4 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900/40"
              >
                탈퇴 진행하기
              </button>
            ) : (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-red-900 dark:text-red-200">
                  계속하려면 아래 입력란에{" "}
                  <strong className="font-mono">{WITHDRAW_CONFIRM_TEXT}</strong>
                  를 입력하세요.
                </p>
                <input
                  type="text"
                  value={withdrawPhrase}
                  onChange={onWithdrawPhraseChange}
                  className="input font-mono"
                  placeholder={WITHDRAW_CONFIRM_TEXT}
                  autoComplete="off"
                />
                {withdrawError && (
                  <p className="text-sm text-red-700 dark:text-red-400">
                    {withdrawError}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={withdrawSubmitting}
                    onClick={onWithdrawConfirm}
                    className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
                  >
                    {withdrawSubmitting ? "처리 중…" : "탈퇴 확인"}
                  </button>
                  <button
                    type="button"
                    disabled={withdrawSubmitting}
                    onClick={() => {
                      setWithdrawOpen(false);
                      setWithdrawPhrase("");
                      setWithdrawError(null);
                    }}
                    className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
                  >
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>

          <p className="mt-8 text-center text-sm text-zinc-500">
            <Link href="/" className="text-blue-600 hover:underline">
              홈으로
            </Link>
          </p>
        </>
      )}
    </section>
  );
}
