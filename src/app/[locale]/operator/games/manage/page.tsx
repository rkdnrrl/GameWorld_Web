"use client";

import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import React, { useEffect, useState } from "react";
import { type GameCategory } from "@/lib/api";
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
  const [downloadingSlug, setDownloadingSlug] = useState<string | null>(null);

  // 삭제 확인: slug 를 정확히 입력해야 활성화
  const [deleteFor, setDeleteFor] = useState<string | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  // 운영자 직접 메타 수정
  const [categories, setCategories] = useState<GameCategory[]>([]);
  const [metaEditGame, setMetaEditGame] = useState<UgcGame | null>(null);
  const [metaForm, setMetaForm] = useState({ title: "", description: "", emoji: "", category: "", tagsRaw: "" });
  const [metaSubmitting, setMetaSubmitting] = useState(false);

  // 필터
  const [filterKind, setFilterKind] = useState<"all" | "official" | "community">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "published" | "rejected" | "hidden">("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => { void api.getCategories().then((r) => setCategories(r.categories)).catch(() => {}); }, []);

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

  async function onDownload(slug: string) {
    const tk = session.getToken();
    if (!tk) return;
    setDownloadingSlug(slug);
    setActionError(null);
    try {
      const res = await fetch(`/api/operator/games/${slug}/download`, {
        headers: { Authorization: `Bearer ${tk}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(data.error?.message || "다운로드 실패");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "다운로드 실패");
    } finally {
      setDownloadingSlug(null);
    }
  }

  const [featuredModal, setFeaturedModal] = useState<UgcGame | null>(null);
  const [featuredText,  setFeaturedText]  = useState("");
  const [featuredX,     setFeaturedX]     = useState(75);
  const [featuredY,     setFeaturedY]     = useState(50);
  const [featureSaving, setFeatureSaving] = useState(false);

  function openFeaturedModal(g: UgcGame) {
    const gg = g as UgcGame & { featuredText?: string; featuredTextX?: number; featuredTextY?: number };
    setFeaturedText(gg.featuredText ?? "");
    setFeaturedX(gg.featuredTextX ?? 75);
    setFeaturedY(gg.featuredTextY ?? 50);
    setFeaturedModal(g);
  }

  async function onSubmitFeatured(e: React.FormEvent) {
    e.preventDefault();
    if (!featuredModal) return;
    const tk = session.getToken();
    if (!tk) return;
    setFeatureSaving(true);
    try {
      const res = await fetch(`/api/operator/games/${featuredModal.slug}/feature`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text: featuredText, x: featuredX, y: featuredY }),
      });
      if (!res.ok) throw new Error("설정 실패");
      setGames((prev) => prev?.map((g) => g.slug === featuredModal.slug
        ? { ...g, isFeatured: true, featuredText } : g
      ) ?? null);
      setFeaturedModal(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "설정 실패");
    } finally {
      setFeatureSaving(false);
    }
  }

  async function onToggleFeatured(slug: string, currentlyFeatured: boolean) {
    const tk = session.getToken();
    if (!tk) return;
    setActingSlug(slug);
    try {
      const method = currentlyFeatured ? "DELETE" : "POST";
      const res = await fetch(`/api/operator/games/${slug}/feature`, {
        method,
        headers: { Authorization: `Bearer ${tk}` },
      });
      if (!res.ok) throw new Error("설정 실패");
      setGames((prev) => prev?.map((g) => ({
        ...g,
        isFeatured: g.slug === slug ? !currentlyFeatured : g.isFeatured,
      })) ?? null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "설정 실패");
    } finally {
      setActingSlug(null);
    }
  }

  async function onToggleKind(slug: string, currentKind: string) {
    const tk = session.getToken();
    if (!tk) return;
    const newKind = currentKind === "official" ? "community" : "official";
    setActingSlug(slug);
    setActionError(null);
    try {
      const res = await api.operatorSetKind(tk, slug, newKind);
      setGames((prev) => prev?.map((g) => g.slug === slug ? { ...g, kind: res.game.kind } : g) ?? null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "변경 실패");
    } finally {
      setActingSlug(null);
    }
  }

  function openMetaEdit(g: UgcGame) {
    setMetaForm({
      title: g.title,
      description: g.description ?? "",
      emoji: g.emoji,
      category: g.category,
      tagsRaw: Array.isArray(g.tags) ? (g.tags as string[]).join(", ") : "",
    });
    setMetaEditGame(g);
  }

  async function onOperatorMeta(e: React.FormEvent) {
    e.preventDefault();
    if (!metaEditGame) return;
    const tk = session.getToken();
    if (!tk) return;
    setMetaSubmitting(true);
    try {
      const tags = metaForm.tagsRaw.split(",").map((s) => s.trim()).filter(Boolean);
      const res = await api.operatorEditMeta(tk, metaEditGame.slug, {
        title: metaForm.title, description: metaForm.description,
        emoji: metaForm.emoji, category: metaForm.category, tags,
      });
      setGames((prev) => prev?.map((g) => g.slug === metaEditGame.slug ? { ...g, ...res.game } : g) ?? null);
      setMetaEditGame(null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "수정 실패");
    } finally {
      setMetaSubmitting(false);
    }
  }

  async function onToggleVisibility(slug: string, currentStatus: string) {
    const tk = session.getToken();
    if (!tk) return;
    setActingSlug(slug);
    setActionError(null);
    try {
      const isHiding = currentStatus === "published";
      const res = isHiding
        ? await api.operatorHideGame(tk, slug)
        : await api.operatorUnhideGame(tk, slug);
      setGames((prev) => prev?.map((g) =>
        g.slug === slug ? { ...g, status: res.game.status } : g
      ) ?? null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "변경 실패");
    } finally {
      setActingSlug(null);
    }
  }

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

  const q = searchQuery.trim().toLowerCase();
  const filtered = (games ?? []).filter((g) => {
    if (filterKind !== "all" && g.kind !== filterKind) return false;
    if (filterStatus !== "all" && g.status !== filterStatus) return false;
    if (q) {
      const hay = `${g.title} ${g.slug} ${g.description ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
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

      {/* 필터 + 검색 */}
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="min-w-[240px] flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
        />
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
        <span className="text-xs text-zinc-500">{t("resultCount", { count: filtered.length })}</span>
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
                  {/* 피처드 토글 */}
                  {g.status === "published" && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => openFeaturedModal(g)}
                        disabled={actingSlug !== null}
                        className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-60 ${
                          g.isFeatured
                            ? "border-yellow-400 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 dark:border-yellow-600 dark:bg-yellow-950/30 dark:text-yellow-300"
                            : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                        }`}
                      >
                        {g.isFeatured ? "⭐ 피처드 수정" : "☆ 피처드 설정"}
                      </button>
                      {g.isFeatured && (
                        <button
                          onClick={() => void onToggleFeatured(g.slug, true)}
                          disabled={actingSlug !== null}
                          className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-800"
                          title="피처드 해제"
                        >✕</button>
                      )}
                    </div>
                  )}
                  {/* official ↔ community 전환 */}
                  <button
                    onClick={() => void onToggleKind(g.slug, g.kind)}
                    disabled={actingSlug !== null}
                    className={`rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-60 ${
                      g.kind === "official"
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                        : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}
                  >
                    {g.kind === "official" ? "⭐ 공식" : "커뮤니티 → 공식"}
                  </button>
                  {/* 정보 직접 수정 */}
                  <button
                    onClick={() => openMetaEdit(g)}
                    className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                  >
                    ✏️ 정보 수정
                  </button>
                  {/* 공개/비공개 토글 */}
                  {(g.status === "published" || g.status === "hidden") && (
                    <button
                      onClick={() => void onToggleVisibility(g.slug, g.status)}
                      disabled={actingSlug !== null}
                      className={`rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-60 ${
                        g.status === "published"
                          ? "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                          : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                      }`}
                    >
                      {g.status === "published" ? "🔒 비공개" : "🔓 공개"}
                    </button>
                  )}
                  <button
                    onClick={() => onDownload(g.slug)}
                    disabled={downloadingSlug === g.slug || actingSlug !== null}
                    className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  >
                    {downloadingSlug === g.slug ? "⏳" : "⬇ 다운로드"}
                  </button>
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

      {/* ── 피처드 설정 모달 ── */}
      {featuredModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setFeaturedModal(null)}>
          <form onSubmit={(e) => void onSubmitFeatured(e)} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
            <h3 className="mb-1 text-base font-bold text-zinc-900 dark:text-white">⭐ 피처드 설정</h3>
            <p className="mb-3 text-xs text-zinc-500">
              <span className="font-semibold">{featuredModal.title}</span> — 배너 위에서 텍스트를 드래그해 위치를 조정하세요
            </p>

            {/* 배너 미리보기 + 드래그 */}
            <div
              className="relative mb-3 w-full overflow-hidden rounded-xl bg-zinc-800 select-none"
              style={{ aspectRatio: "21/9" }}
              onPointerMove={(e) => {
                if (e.buttons !== 1) return;
                const rect = e.currentTarget.getBoundingClientRect();
                setFeaturedX(Math.round(Math.max(5, Math.min(95, (e.clientX - rect.left) / rect.width * 100))));
                setFeaturedY(Math.round(Math.max(5, Math.min(95, (e.clientY - rect.top) / rect.height * 100))));
              }}
            >
              {featuredModal.thumbnailUrl
                ? <img src={featuredModal.thumbnailUrl} alt="" className="h-full w-full object-cover pointer-events-none" /> // eslint-disable-line @next/next/no-img-element
                : <div className="h-full w-full bg-gradient-to-br from-zinc-700 to-zinc-900" />
              }
              <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/20 to-transparent pointer-events-none" />
              {featuredText && (
                <div
                  className="absolute cursor-grab active:cursor-grabbing"
                  style={{ left: `${featuredX}%`, top: `${featuredY}%`, transform: "translate(-50%,-50%)" }}
                  onPointerDown={(e) => e.currentTarget.parentElement?.setPointerCapture(e.pointerId)}
                >
                  <p className="whitespace-pre-wrap text-center text-sm font-black text-white drop-shadow-[0_1px_8px_rgba(0,0,0,1)] sm:text-base">
                    {featuredText}
                  </p>
                  <div className="mt-1 text-center text-[9px] text-white/40">({featuredX}%, {featuredY}%)</div>
                </div>
              )}
            </div>

            <textarea
              rows={3}
              value={featuredText}
              onChange={(e) => setFeaturedText(e.target.value)}
              maxLength={300}
              placeholder="소개 문구를 입력하면 미리보기에서 드래그로 위치를 조정할 수 있어요"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
            />
            <p className="mt-1 text-right text-[10px] text-zinc-400">{featuredText.length}/300</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setFeaturedModal(null)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300">취소</button>
              <button type="submit" disabled={featureSaving}
                className="rounded-lg bg-yellow-500 px-4 py-2 text-sm font-semibold text-white hover:bg-yellow-600 disabled:opacity-50">
                {featureSaving ? "저장 중…" : "⭐ 피처드 설정"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── 운영자 직접 메타 수정 모달 ── */}
      {metaEditGame && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setMetaEditGame(null)}>
          <form onSubmit={(e) => void onOperatorMeta(e)} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
            <h3 className="mb-1 text-base font-bold text-zinc-900 dark:text-white">✏️ 정보 직접 수정</h3>
            <p className="mb-4 text-xs text-zinc-500">운영자 수정은 검수 없이 즉시 반영됩니다 — <span className="font-semibold">{metaEditGame.slug}</span></p>
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="w-16">
                  <label className="mb-1 block text-xs text-zinc-500">이모지</label>
                  <input value={metaForm.emoji} onChange={(e) => setMetaForm((f) => ({ ...f, emoji: e.target.value }))}
                    className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-center text-lg dark:border-zinc-600 dark:bg-zinc-800 dark:text-white" />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-zinc-500">제목</label>
                  <input required value={metaForm.title} onChange={(e) => setMetaForm((f) => ({ ...f, title: e.target.value }))}
                    className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-white" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">설명</label>
                <textarea rows={3} value={metaForm.description} onChange={(e) => setMetaForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-white" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-zinc-500">카테고리</label>
                  <select value={metaForm.category} onChange={(e) => setMetaForm((f) => ({ ...f, category: e.target.value }))}
                    className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-white">
                    {categories.map((c) => (
                      <option key={c.slug} value={c.slug}>{c.emoji} {c.labelKo}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-zinc-500">태그 (쉼표 구분)</label>
                  <input value={metaForm.tagsRaw} onChange={(e) => setMetaForm((f) => ({ ...f, tagsRaw: e.target.value }))}
                    placeholder="퍼즐, 액션"
                    className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-white" />
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setMetaEditGame(null)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300">취소</button>
              <button type="submit" disabled={metaSubmitting}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
                {metaSubmitting ? "저장 중…" : "즉시 반영"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
