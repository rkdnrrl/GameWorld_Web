"use client";

import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { api, session, ApiError, type UgcGame } from "@/lib/api";
import { useTranslations } from "next-intl";

export default function OperatorManageGamesPage() {
  const router = useRouter();
  const t = useTranslations("ManageGames");
  const tOp = useTranslations("Operator");
  const tCommon = useTranslations("Common");

  const [games, setGames] = useState<UgcGame[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [actingSlug, setActingSlug] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // 삭제 확인: slug 를 정확히 입력해야 활성화
  const [deleteFor, setDeleteFor] = useState<string | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");

  // 필터
  const [filterKind, setFilterKind] = useState<"all" | "official" | "community">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "published" | "rejected" | "hidden">("all");
  const [searchQuery, setSearchQuery] = useState("");

  function load() {
    const tk = session.getToken();
    if (!tk) { router.replace("/login"); return; }
    api.operatorListAllGames(tk)
      .then((res) => { setGames(res.games); setLoadError(null); })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setForbidden(true);
        else setLoadError(err instanceof ApiError ? err.message : t("loadFailed"));
      });
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function onDelete(slug: string) {
    const tk = session.getToken();
    if (!tk) return;
    if (deleteConfirmInput.trim() !== slug) {
      setActionError(t("deleteConfirmSlugMismatch"));
      return;
    }
    setActingSlug(slug);
    setActionError(null);
    try {
      await api.deleteGame(tk, slug);
      setGames((prev) => prev?.filter((g) => g.slug !== slug) ?? null);
      setDeleteFor(null);
      setDeleteConfirmInput("");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("deleteFailed"));
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

  const filtered = (games ?? []).filter((g) => {
    if (filterKind !== "all" && g.kind !== filterKind) return false;
    if (filterStatus !== "all" && g.status !== filterStatus) return false;
    return true;
  });

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

      {/* 필터 */}
      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-zinc-500">{t("filterKind")}</span>
          <select
            value={filterKind}
            onChange={(e) => setFilterKind(e.target.value as "all" | "official" | "community")}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          >
            <option value="all">{t("filterAll")}</option>
            <option value="official">official</option>
            <option value="community">community</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-zinc-500">{t("filterStatus")}</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as "all" | "pending" | "published" | "rejected" | "hidden")}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          >
            <option value="all">{t("filterAll")}</option>
            <option value="pending">pending</option>
            <option value="published">published</option>
            <option value="rejected">rejected</option>
            <option value="hidden">hidden</option>
          </select>
        </label>
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
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-8 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
          {t("empty")}
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((g) => (
            <li
              key={g.slug}
              className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div className="flex items-start gap-4">
                <span className="mt-0.5 text-2xl leading-none">{g.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h3 className="font-medium text-zinc-900 dark:text-zinc-100">{g.title}</h3>
                    <code className="text-xs text-zinc-500">{g.slug}</code>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      g.kind === "official"
                        ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
                        : "bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
                    }`}>
                      {g.kind}
                    </span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                      {g.status}
                    </span>
                    <span className="text-[10px] text-zinc-500">v{g.version}</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {t("createdAt", { date: new Date(g.createdAt).toLocaleString() })}
                    {g.ownerUserId && (
                      <>
                        {" · "}
                        owner: <code className="text-[10px]">{g.ownerUserId.slice(0, 8)}</code>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <button
                    onClick={() => {
                      setDeleteFor(deleteFor === g.slug ? null : g.slug);
                      setDeleteConfirmInput("");
                      setActionError(null);
                    }}
                    disabled={actingSlug !== null}
                    className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-700 dark:bg-zinc-800 dark:text-red-300 dark:hover:bg-red-950/30"
                  >
                    {t("delete")}
                  </button>
                </div>
              </div>

              {deleteFor === g.slug && (
                <div className="mt-4 rounded-md border border-red-200 bg-red-50/50 p-3 dark:border-red-800 dark:bg-red-950/20">
                  <p className="text-xs text-red-800 dark:text-red-300">
                    {t("deleteWarning", { slug: g.slug })}
                  </p>
                  <label className="mt-2 block text-xs font-medium text-red-800 dark:text-red-300">
                    {t("deleteConfirmLabel", { slug: g.slug })}
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmInput}
                    onChange={(e) => setDeleteConfirmInput(e.target.value)}
                    placeholder={g.slug}
                    className="mt-1 w-full rounded-md border border-red-300 bg-white px-3 py-2 text-sm dark:border-red-700 dark:bg-zinc-900"
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      onClick={() => { setDeleteFor(null); setDeleteConfirmInput(""); }}
                      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                    >
                      {tCommon("cancel")}
                    </button>
                    <button
                      onClick={() => void onDelete(g.slug)}
                      disabled={actingSlug !== null || deleteConfirmInput.trim() !== g.slug}
                      className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                    >
                      {actingSlug === g.slug ? tCommon("processingEllipsis") : t("deleteConfirm")}
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
