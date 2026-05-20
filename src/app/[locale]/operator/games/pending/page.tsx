"use client";

import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { api, session, ApiError, type UgcGame } from "@/lib/api";
import { useTranslations } from "next-intl";

export default function OperatorPendingGamesPage() {
  const router = useRouter();
  const t = useTranslations("ModerationGames");
  const tOp = useTranslations("Operator");
  const tCommon = useTranslations("Common");

  const [games, setGames] = useState<UgcGame[] | null>(null);
  const [pendingUpdates, setPendingUpdates] = useState<UgcGame[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [actingSlug, setActingSlug] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectUpdateFor, setRejectUpdateFor] = useState<string | null>(null);
  const [rejectUpdateReason, setRejectUpdateReason] = useState("");

  function load() {
    const tk = session.getToken();
    if (!tk) { router.replace("/login"); return; }
    api.operatorListPendingGames(tk)
      .then((res) => { setGames(res.games); setLoadError(null); })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setForbidden(true);
        else setLoadError(err instanceof ApiError ? err.message : t("loadFailed"));
      });
    api.operatorListPendingUpdates(tk)
      .then((res) => setPendingUpdates(res.games))
      .catch(() => { /* 부수적 — 표시 안 함 */ });
  }

  useEffect(() => {
    const tk = session.getToken();
    if (!tk) { router.replace("/login"); return; }
    api.operatorListPendingGames(tk)
      .then((res) => setGames(res.games))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setForbidden(true);
        else setLoadError(err instanceof ApiError ? err.message : t("loadFailed"));
      });
    api.operatorListPendingUpdates(tk)
      .then((res) => setPendingUpdates(res.games))
      .catch(() => {});
  }, [router, t]);

  async function onApproveUpdate(slug: string) {
    const tk = session.getToken();
    if (!tk) return;
    setActingSlug(slug);
    setActionError(null);
    try {
      await api.operatorApproveUpdate(tk, slug);
      setPendingUpdates((prev) => prev?.filter((g) => g.slug !== slug) ?? null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("approveFailed"));
    } finally {
      setActingSlug(null);
    }
  }

  async function onRejectUpdate(slug: string) {
    const tk = session.getToken();
    if (!tk) return;
    if (!rejectUpdateReason.trim()) {
      setActionError(t("rejectReasonRequired"));
      return;
    }
    setActingSlug(slug);
    setActionError(null);
    try {
      await api.operatorRejectUpdate(tk, slug, rejectUpdateReason.trim());
      setPendingUpdates((prev) => prev?.filter((g) => g.slug !== slug) ?? null);
      setRejectUpdateFor(null);
      setRejectUpdateReason("");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("rejectFailed"));
    } finally {
      setActingSlug(null);
    }
  }

  async function onApprove(slug: string) {
    const tk = session.getToken();
    if (!tk) return;
    setActingSlug(slug);
    setActionError(null);
    try {
      await api.operatorApproveGame(tk, slug);
      setGames((prev) => prev?.filter((g) => g.slug !== slug) ?? null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("approveFailed"));
    } finally {
      setActingSlug(null);
    }
  }

  async function onReject(slug: string) {
    const tk = session.getToken();
    if (!tk) return;
    if (!rejectReason.trim()) {
      setActionError(t("rejectReasonRequired"));
      return;
    }
    setActingSlug(slug);
    setActionError(null);
    try {
      await api.operatorRejectGame(tk, slug, rejectReason.trim());
      setGames((prev) => prev?.filter((g) => g.slug !== slug) ?? null);
      setRejectFor(null);
      setRejectReason("");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("rejectFailed"));
    } finally {
      setActingSlug(null);
    }
  }

  if (forbidden) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16">
        <h1 className="text-xl font-semibold">{tOp("forbidden")}</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{tOp("forbiddenDesc")}</p>
        <Link href="/" className="mt-6 inline-block text-sm text-blue-600 hover:underline">
          {tOp("backHome")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{t("breadcrumb")}</p>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{t("subtitle")}</p>
        </div>
        <div className="flex gap-4 text-sm">
          <button
            onClick={() => load()}
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            {tCommon("refresh")}
          </button>
          <Link href="/operator" className="text-blue-600 hover:underline dark:text-blue-400">
            {tOp("backToMenu")}
          </Link>
        </div>
      </div>

      {actionError && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200">
          {actionError}
        </div>
      )}

      {loadError && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200">
          {loadError}
        </div>
      )}

      {games === null && !loadError ? (
        <p className="text-sm text-zinc-500">{tCommon("loading")}</p>
      ) : games && games.length === 0 ? (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-8 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
          {t("empty")}
        </div>
      ) : (
        <ul className="space-y-4">
          {games?.map((g) => (
            <li
              key={g.slug}
              className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div className="flex items-start gap-4">
                <span className="mt-0.5 text-3xl leading-none">{g.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h3 className="font-medium text-zinc-900 dark:text-zinc-100">{g.title}</h3>
                    <code className="text-xs text-zinc-500">{g.slug}</code>
                  </div>
                  {g.description && (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
                      {g.description}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-zinc-500">
                    {t("uploadedAt", { date: new Date(g.createdAt).toLocaleString() })}
                    {" · "}
                    {t("category")}: {t(`category_${g.category}` as const)}
                    {g.ownerUserId && (
                      <>
                        {" · "}
                        <code className="text-[10px]">{g.ownerUserId.slice(0, 8)}</code>
                      </>
                    )}
                  </p>
                  <p className="mt-1 text-xs">
                    <a
                      href={`https://play.airliveplay.com/${g.slug}/`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {t("previewLink")}
                    </a>
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <button
                    onClick={() => void onApprove(g.slug)}
                    disabled={actingSlug !== null}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {actingSlug === g.slug ? tCommon("processingEllipsis") : t("approve")}
                  </button>
                  <button
                    onClick={() => {
                      setRejectFor(rejectFor === g.slug ? null : g.slug);
                      setRejectReason("");
                      setActionError(null);
                    }}
                    disabled={actingSlug !== null}
                    className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-700 dark:bg-zinc-800 dark:text-red-300 dark:hover:bg-red-950/30"
                  >
                    {t("reject")}
                  </button>
                </div>
              </div>

              {rejectFor === g.slug && (
                <div className="mt-4 rounded-md border border-red-200 bg-red-50/50 p-3 dark:border-red-800 dark:bg-red-950/20">
                  <label className="mb-1 block text-xs font-medium text-red-800 dark:text-red-300">
                    {t("rejectReasonLabel")}
                  </label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={2}
                    maxLength={500}
                    placeholder={t("rejectReasonPlaceholder")}
                    className="w-full rounded-md border border-red-300 bg-white px-3 py-2 text-sm dark:border-red-700 dark:bg-zinc-900"
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      onClick={() => { setRejectFor(null); setRejectReason(""); }}
                      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                    >
                      {tCommon("cancel")}
                    </button>
                    <button
                      onClick={() => void onReject(g.slug)}
                      disabled={actingSlug !== null || !rejectReason.trim()}
                      className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                    >
                      {actingSlug === g.slug ? tCommon("processingEllipsis") : t("rejectConfirm")}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
