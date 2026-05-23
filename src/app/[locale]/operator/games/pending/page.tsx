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
  const [pendingMedia, setPendingMedia] = useState<UgcGame[] | null>(null);
  const [rejectMediaFor, setRejectMediaFor] = useState<string | null>(null);
  const [rejectMediaReason, setRejectMediaReason] = useState("");
  const [pendingMeta, setPendingMeta] = useState<UgcGame[] | null>(null);
  const [rejectMetaFor, setRejectMetaFor] = useState<string | null>(null);
  const [rejectMetaReason, setRejectMetaReason] = useState("");

  // 미리보기 URL 의 token 쿼리는 client mount 후에만 채움 (SSR 시 localStorage 없음).
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  useEffect(() => { setPreviewToken(session.getToken()); }, []);

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
      .catch(() => {});
    api.operatorListPendingMedia(tk)
      .then((res) => setPendingMedia(res.games))
      .catch(() => {});
    api.operatorListPendingMeta(tk)
      .then((res) => setPendingMeta(res.games))
      .catch(() => {});
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
    api.operatorListPendingMedia(tk)
      .then((res) => setPendingMedia(res.games))
      .catch(() => {});
    api.operatorListPendingMeta(tk)
      .then((res) => setPendingMeta(res.games))
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

  async function onApproveMeta(slug: string) {
    const tk = session.getToken();
    if (!tk) return;
    setActingSlug(slug); setActionError(null);
    try {
      await api.operatorApproveMeta(tk, slug);
      // 메타와 함께 제출된 미디어도 서버에서 함께 승인되므로 두 목록에서 모두 제거
      setPendingMeta((prev) => prev?.filter((g) => g.slug !== slug) ?? null);
      setPendingMedia((prev) => prev?.filter((g) => g.slug !== slug) ?? null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "승인 실패");
    } finally { setActingSlug(null); }
  }

  async function onRejectMeta(slug: string) {
    const tk = session.getToken();
    if (!tk) return;
    if (!rejectMetaReason.trim()) { setActionError("거절 사유를 입력해주세요."); return; }
    setActingSlug(slug); setActionError(null);
    try {
      await api.operatorRejectMeta(tk, slug, rejectMetaReason.trim());
      setPendingMeta((prev) => prev?.filter((g) => g.slug !== slug) ?? null);
      setRejectMetaFor(null); setRejectMetaReason("");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "거절 실패");
    } finally { setActingSlug(null); }
  }

  async function onApproveMedia(slug: string) {
    const tk = session.getToken();
    if (!tk) return;
    setActingSlug(slug);
    setActionError(null);
    try {
      await api.operatorApproveMedia(tk, slug);
      setPendingMedia((prev) => prev?.filter((g) => g.slug !== slug) ?? null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "승인 실패");
    } finally {
      setActingSlug(null);
    }
  }

  async function onRejectMedia(slug: string) {
    const tk = session.getToken();
    if (!tk) return;
    if (!rejectMediaReason.trim()) { setActionError("거절 사유를 입력해주세요."); return; }
    setActingSlug(slug);
    setActionError(null);
    try {
      await api.operatorRejectMedia(tk, slug, rejectMediaReason.trim());
      setPendingMedia((prev) => prev?.filter((g) => g.slug !== slug) ?? null);
      setRejectMediaFor(null);
      setRejectMediaReason("");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "거절 실패");
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
                    {t("category")}: {({earn:"돈 버는 게임",multiplay:"멀티플레이",decorate:"꾸미기",other:"기타"} as Record<string,string>)[g.category] ?? g.category}
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

      {/* ── 보류 중인 재업로드 (업데이트 검수) ── */}
      <section className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
        <h2 className="text-lg font-semibold">{t("pendingUpdatesSection")}</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{t("pendingUpdatesSubtitle")}</p>

        {pendingUpdates === null ? (
          <p className="mt-4 text-sm text-zinc-500">{tCommon("loading")}</p>
        ) : pendingUpdates.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">{t("pendingUpdatesEmpty")}</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {pendingUpdates.map((g) => (
              <li
                key={g.slug}
                className="rounded-xl border border-amber-300 bg-amber-50/40 p-4 dark:border-amber-700 dark:bg-amber-950/20"
              >
                <div className="flex items-start gap-4">
                  <span className="mt-0.5 text-3xl leading-none">{g.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <h3 className="font-medium text-zinc-900 dark:text-zinc-100">{g.title}</h3>
                      <code className="text-xs text-zinc-500">{g.slug}</code>
                      <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-800 dark:text-amber-100">
                        v{g.version} → v{g.pendingVersion ?? "?"}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">
                      {g.pendingUploadedAt && t("uploadedAt", { date: new Date(g.pendingUploadedAt).toLocaleString() })}
                      {" · "}
                      {t("category")}: {({earn:"돈 버는 게임",multiplay:"멀티플레이",decorate:"꾸미기",other:"기타"} as Record<string,string>)[g.category] ?? g.category}
                    </p>
                    <p className="mt-1 text-xs">
                      <a
                        href={
                          previewToken
                            ? `https://play.airliveplay.com/_preview/${g.slug}/?token=${encodeURIComponent(previewToken)}`
                            : `https://play.airliveplay.com/_preview/${g.slug}/`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {t("previewStagingLink")}
                      </a>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    <button
                      onClick={() => void onApproveUpdate(g.slug)}
                      disabled={actingSlug !== null}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {actingSlug === g.slug ? tCommon("processingEllipsis") : t("approveUpdate")}
                    </button>
                    <button
                      onClick={() => {
                        setRejectUpdateFor(rejectUpdateFor === g.slug ? null : g.slug);
                        setRejectUpdateReason("");
                        setActionError(null);
                      }}
                      disabled={actingSlug !== null}
                      className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-700 dark:bg-zinc-800 dark:text-red-300 dark:hover:bg-red-950/30"
                    >
                      {t("reject")}
                    </button>
                  </div>
                </div>

                {rejectUpdateFor === g.slug && (
                  <div className="mt-4 rounded-md border border-red-200 bg-red-50/50 p-3 dark:border-red-800 dark:bg-red-950/20">
                    <label className="mb-1 block text-xs font-medium text-red-800 dark:text-red-300">
                      {t("rejectReasonLabel")}
                    </label>
                    <textarea
                      value={rejectUpdateReason}
                      onChange={(e) => setRejectUpdateReason(e.target.value)}
                      rows={2}
                      maxLength={500}
                      placeholder={t("rejectReasonPlaceholder")}
                      className="w-full rounded-md border border-red-300 bg-white px-3 py-2 text-sm dark:border-red-700 dark:bg-zinc-900"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        onClick={() => { setRejectUpdateFor(null); setRejectUpdateReason(""); }}
                        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                      >
                        {tCommon("cancel")}
                      </button>
                      <button
                        onClick={() => void onRejectUpdate(g.slug)}
                        disabled={actingSlug !== null || !rejectUpdateReason.trim()}
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
      </section>

      {/* ── 미디어 단독 검수 대기 ── */}
      <section className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
        <h2 className="text-lg font-semibold">🖼 미디어 검수 대기</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">썸네일·데모영상 단독 수정 신청 목록입니다.</p>

        {/* ── 정보 수정 검수 ── */}
        {pendingMeta !== null && pendingMeta.length > 0 && (
          <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-6 dark:border-amber-800 dark:bg-amber-950/20">
            <h2 className="mb-4 text-base font-bold text-amber-900 dark:text-amber-200">✏️ 정보 수정 검수 대기 ({pendingMeta.length})</h2>
            <ul className="space-y-6">
              {pendingMeta.map((g) => {
                const LANGS = ["ko","en","ja","zh"] as const;
                const LANG_LABEL: Record<string,string> = { ko:"🇰🇷 한국어", en:"🇺🇸 영어", ja:"🇯🇵 일본어", zh:"🇨🇳 중국어" };
                const changed = (cur: unknown, nxt: unknown) => cur !== nxt && nxt != null;
                const rowCls = (isChanged: boolean) =>
                  `grid grid-cols-2 gap-2 rounded px-2 py-1.5 text-sm ${isChanged ? "bg-amber-50 dark:bg-amber-950/30" : ""}`;

                const pendingTagsArr = g.pendingTags as string[] | null;
                const curTagsArr = g.tags as string[] | null;
                const tagsChanged = pendingTagsArr != null &&
                  JSON.stringify(pendingTagsArr) !== JSON.stringify(curTagsArr);

                return (
                  <li key={g.slug} className="rounded-lg border border-amber-200 bg-white dark:border-amber-800 dark:bg-zinc-900 overflow-hidden">
                    {/* 헤더 */}
                    <div className="flex items-center justify-between bg-zinc-50 px-4 py-2 dark:bg-zinc-800">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-zinc-500">{g.slug}</span>
                        <span className="text-base">{g.emoji}</span>
                        <span className="font-semibold text-zinc-800 dark:text-white">{g.title}</span>
                      </div>
                      <span className="text-xs text-zinc-400">{g.pendingMetaAt ? new Date(g.pendingMetaAt).toLocaleString("ko") : ""}</span>
                    </div>

                    {/* 컬럼 헤더 */}
                    <div className="grid grid-cols-2 gap-2 border-b border-zinc-100 px-4 py-1 text-xs font-semibold dark:border-zinc-700">
                      <span className="text-zinc-500">현재</span>
                      <span className="text-amber-700 dark:text-amber-400">→ 신청 내용</span>
                    </div>

                    <div className="space-y-0.5 px-4 py-3">
                      {/* 제목 */}
                      <div className={rowCls(changed(g.title, g.pendingTitle))}>
                        <div><span className="mr-1 text-xs text-zinc-400">제목</span>{g.title}</div>
                        <div className={changed(g.title, g.pendingTitle) ? "font-semibold text-amber-800 dark:text-amber-300" : "text-zinc-400"}>
                          {g.pendingTitle ?? <span className="italic text-zinc-300">변경 없음</span>}
                        </div>
                      </div>

                      {/* 이모지 */}
                      <div className={rowCls(changed(g.emoji, g.pendingEmoji))}>
                        <div><span className="mr-1 text-xs text-zinc-400">이모지</span>{g.emoji}</div>
                        <div className={changed(g.emoji, g.pendingEmoji) ? "font-semibold text-amber-800 dark:text-amber-300" : "text-zinc-400"}>
                          {g.pendingEmoji ?? <span className="italic text-zinc-300">변경 없음</span>}
                        </div>
                      </div>

                      {/* 카테고리 */}
                      <div className={rowCls(changed(g.category, g.pendingCategory))}>
                        <div><span className="mr-1 text-xs text-zinc-400">카테고리</span>{g.category}</div>
                        <div className={changed(g.category, g.pendingCategory) ? "font-semibold text-amber-800 dark:text-amber-300" : "text-zinc-400"}>
                          {g.pendingCategory ?? <span className="italic text-zinc-300">변경 없음</span>}
                        </div>
                      </div>

                      {/* 설명 */}
                      <div className={`rounded px-2 py-1.5 ${changed(g.description, g.pendingDescription) ? "bg-amber-50 dark:bg-amber-950/30" : ""}`}>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="mb-0.5 block text-xs text-zinc-400">설명</span>
                            <p className="whitespace-pre-wrap text-xs text-zinc-600 dark:text-zinc-400">{g.description || <span className="italic text-zinc-300">없음</span>}</p>
                          </div>
                          <div>
                            {g.pendingDescription != null ? (
                              <p className={`whitespace-pre-wrap text-xs ${changed(g.description, g.pendingDescription) ? "font-medium text-amber-800 dark:text-amber-300" : "text-zinc-400"}`}>
                                {g.pendingDescription}
                              </p>
                            ) : (
                              <p className="text-xs italic text-zinc-300">변경 없음</p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 태그 */}
                      <div className={rowCls(tagsChanged)}>
                        <div>
                          <span className="mr-1 text-xs text-zinc-400">태그</span>
                          <span className="text-xs">{curTagsArr?.join(", ") || <span className="italic text-zinc-300">없음</span>}</span>
                        </div>
                        <div className={tagsChanged ? "text-xs font-semibold text-amber-800 dark:text-amber-300" : "text-xs text-zinc-400"}>
                          {pendingTagsArr != null ? pendingTagsArr.join(", ") || "(없음)" : <span className="italic text-zinc-300">변경 없음</span>}
                        </div>
                      </div>

                      {/* i18n 제목/설명 */}
                      {LANGS.map((lang) => {
                        const curT = g.titlesI18n?.[lang] ?? "";
                        const newT = g.pendingTitlesI18n?.[lang] ?? "";
                        const curD = g.descriptionsI18n?.[lang] ?? "";
                        const newD = g.pendingDescriptionsI18n?.[lang] ?? "";
                        const tChanged = g.pendingTitlesI18n != null && curT !== newT;
                        const dChanged = g.pendingDescriptionsI18n != null && curD !== newD;
                        if (!tChanged && !dChanged && !curT && !curD) return null;
                        return (
                          <div key={lang} className={`rounded px-2 py-1.5 ${(tChanged || dChanged) ? "bg-amber-50 dark:bg-amber-950/30" : ""}`}>
                            <p className="mb-1 text-xs font-medium text-zinc-500">{LANG_LABEL[lang]}</p>
                            {(curT || newT) && (
                              <div className="grid grid-cols-2 gap-2 text-sm mb-0.5">
                                <div><span className="mr-1 text-xs text-zinc-400">제목</span>{curT || <span className="italic text-zinc-300">없음</span>}</div>
                                <div className={tChanged ? "font-semibold text-amber-800 dark:text-amber-300" : "text-zinc-400"}>
                                  {newT || <span className="italic text-zinc-300">변경 없음</span>}
                                </div>
                              </div>
                            )}
                            {(curD || newD) && (
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <p className="whitespace-pre-wrap text-zinc-500">{curD || <span className="italic text-zinc-300">없음</span>}</p>
                                <p className={`whitespace-pre-wrap ${dChanged ? "font-medium text-amber-800 dark:text-amber-300" : "text-zinc-400"}`}>
                                  {newD || <span className="italic text-zinc-300">변경 없음</span>}
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* 액션 버튼 */}
                    <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 px-4 py-3 dark:border-zinc-700">
                      <button onClick={() => void onApproveMeta(g.slug)} disabled={actingSlug !== null}
                        className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60">
                        {actingSlug === g.slug ? "처리 중…" : "✓ 승인"}
                      </button>
                      <button onClick={() => setRejectMetaFor(rejectMetaFor === g.slug ? null : g.slug)}
                        className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:border-red-700 dark:bg-zinc-800 dark:text-red-400">
                        거절
                      </button>
                      {rejectMetaFor === g.slug && (
                        <div className="mt-2 w-full space-y-2">
                          <textarea rows={2} placeholder="거절 사유" value={rejectMetaReason} onChange={(e) => setRejectMetaReason(e.target.value)}
                            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-white" />
                          <button onClick={() => void onRejectMeta(g.slug)} disabled={actingSlug !== null || !rejectMetaReason.trim()}
                            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">
                            거절 확인
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {pendingMedia === null ? (
          <p className="mt-4 text-sm text-zinc-500">{tCommon("loading")}</p>
        ) : pendingMedia.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">대기 중인 미디어 검수가 없습니다.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {pendingMedia.map((g) => (
              <li key={g.slug}
                className="rounded-xl border border-sky-200 bg-sky-50/40 p-4 dark:border-sky-800 dark:bg-sky-950/20">
                <div className="flex items-start gap-4">
                  {/* 현재 vs 대기 중 썸네일 비교 */}
                  <div className="flex shrink-0 gap-3">
                    {g.thumbnailUrl && (
                      <div className="text-center">
                        <p className="mb-1 text-[10px] text-zinc-400">현재</p>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={g.thumbnailUrl} alt="current" className="h-16 w-28 rounded-lg object-cover ring-1 ring-zinc-200" />
                      </div>
                    )}
                    {g.pendingThumbnailUrl && (
                      <div className="text-center">
                        <p className="mb-1 text-[10px] text-blue-600 font-medium">신청</p>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={g.pendingThumbnailUrl} alt="pending" className="h-16 w-28 rounded-lg object-cover ring-2 ring-blue-400" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <h3 className="font-medium text-zinc-900 dark:text-zinc-100">{g.title}</h3>
                      <code className="text-xs text-zinc-500">{g.slug}</code>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-zinc-500">
                      {g.pendingThumbnailUrl && <span>🖼 썸네일 신청</span>}
                      {g.pendingDemoVideoUrl && (
                        <a href={g.pendingDemoVideoUrl} target="_blank" rel="noreferrer"
                          className="text-blue-600 hover:underline">🎬 영상 미리보기</a>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-zinc-400">
                      {g.pendingMediaAt && `신청: ${new Date(g.pendingMediaAt).toLocaleString()}`}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col gap-2">
                    <button
                      onClick={() => void onApproveMedia(g.slug)}
                      disabled={actingSlug !== null}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {actingSlug === g.slug ? tCommon("processingEllipsis") : "승인"}
                    </button>
                    <button
                      onClick={() => {
                        setRejectMediaFor(rejectMediaFor === g.slug ? null : g.slug);
                        setRejectMediaReason("");
                        setActionError(null);
                      }}
                      disabled={actingSlug !== null}
                      className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-700 dark:bg-zinc-800 dark:text-red-300"
                    >
                      거절
                    </button>
                  </div>
                </div>

                {rejectMediaFor === g.slug && (
                  <div className="mt-4 rounded-md border border-red-200 bg-red-50/50 p-3 dark:border-red-800 dark:bg-red-950/20">
                    <label className="mb-1 block text-xs font-medium text-red-800 dark:text-red-300">거절 사유</label>
                    <textarea
                      value={rejectMediaReason}
                      onChange={(e) => setRejectMediaReason(e.target.value)}
                      rows={2}
                      maxLength={500}
                      placeholder="거절 사유를 입력하세요..."
                      className="w-full rounded-md border border-red-300 bg-white px-3 py-2 text-sm dark:border-red-700 dark:bg-zinc-900"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        onClick={() => { setRejectMediaFor(null); setRejectMediaReason(""); }}
                        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
                      >
                        {tCommon("cancel")}
                      </button>
                      <button
                        onClick={() => void onRejectMedia(g.slug)}
                        disabled={actingSlug !== null || !rejectMediaReason.trim()}
                        className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        {actingSlug === g.slug ? tCommon("processingEllipsis") : "거절 확인"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
