"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { session } from "@/lib/api";
import { useTranslations } from "next-intl";

// ─── 타입 ────────────────────────────────────────────────────────────────────

type Category = "free" | "qna" | "tips" | "showcase";

interface PostItem {
  id: string;
  title: string;
  category: Category;
  views: number;
  isPinned: boolean;
  createdAt: string;
  user: { id: string; nickname: string };
  _count: { comments: number };
}

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; nickname: string };
}

interface PostDetail extends PostItem {
  content: string;
  updatedAt: string;
  comments: Comment[];
}

// ─── 유틸 ────────────────────────────────────────────────────────────────────

const CATS: { key: Category | "all"; labelKey: string }[] = [
  { key: "all",      labelKey: "catAll"      },
  { key: "free",     labelKey: "catFree"     },
  { key: "qna",      labelKey: "catQna"      },
  { key: "tips",     labelKey: "catTips"     },
  { key: "showcase", labelKey: "catShowcase" },
];

const CAT_COLORS: Record<Category, string> = {
  free:     "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  qna:      "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  tips:     "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  showcase: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
};

function timeAgo(iso: string, t: (k: string, v?: Record<string, string | number>) => string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)           return t("justNow");
  if (diff < 3600)         return t("minutesAgo", { n: Math.floor(diff / 60) });
  if (diff < 86400)        return t("hoursAgo",   { n: Math.floor(diff / 3600) });
  return t("daysAgo", { n: Math.floor(diff / 86400) });
}

function avatarChar(nickname: string) {
  return (nickname?.[0] ?? "?").toUpperCase();
}

// 카테고리마다 고유 배경색 (아바타용)
const AVATAR_COLORS = [
  "bg-red-400", "bg-orange-400", "bg-amber-400", "bg-lime-500",
  "bg-emerald-500", "bg-teal-500", "bg-cyan-500", "bg-sky-500",
  "bg-blue-500", "bg-indigo-500", "bg-violet-500", "bg-pink-500",
];
function avatarColor(nickname: string) {
  let n = 0;
  for (const c of nickname) n = (n * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function CommunityPage() {
  const t = useTranslations("Community");

  // 인증
  const [userId, setUserId]       = useState<string | null>(null);
  const [isOperator, setIsOperator] = useState(false);
  const token = useRef<string | null>(null);

  // 목록 상태
  const [category, setCategory]   = useState<Category | "all">("all");
  const [q, setQ]                 = useState("");
  const [inputQ, setInputQ]       = useState("");
  const [posts, setPosts]         = useState<PostItem[]>([]);
  const [page, setPage]           = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading]     = useState(true);

  // 상세 모달
  const [detail, setDetail]       = useState<PostDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 글쓰기/수정 폼
  const [writing, setWriting]     = useState(false);
  const [editTarget, setEditTarget] = useState<PostDetail | null>(null);
  const [form, setForm]           = useState({ title: "", content: "", category: "free" as Category });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // 댓글
  const [commentText, setCommentText] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  // ── 초기화 ──
  useEffect(() => {
    const u = session.getUser();
    token.current = session.getToken();
    if (u) {
      setUserId(u.id);
      setIsOperator(!!(u as { isOperator?: boolean }).isOperator);
    }
  }, []);

  // ── 목록 불러오기 ──
  useEffect(() => {
    loadPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, q, page]);

  async function loadPosts(resetPage = false) {
    setLoading(true);
    const p = resetPage ? 1 : page;
    if (resetPage) setPage(1);
    try {
      const qs = new URLSearchParams({ page: String(p), limit: "20" });
      if (category !== "all") qs.set("category", category);
      if (q) qs.set("q", q);
      const r = await fetch(`/api/community?${qs}`);
      const d = await r.json();
      setPosts(d.items ?? []);
      setTotalPages(d.totalPages ?? 1);
    } finally {
      setLoading(false);
    }
  }

  // ── 검색 제출 ──
  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setQ(inputQ.trim());
    setPage(1);
  }

  // ── 상세 열기 ──
  async function openDetail(id: string) {
    setDetailLoading(true);
    setDetail(null);
    setCommentText("");
    try {
      const r = await fetch(`/api/community/${id}`);
      const d = await r.json();
      setDetail(d.post ?? null);
    } finally {
      setDetailLoading(false);
    }
  }

  // ── 글쓰기 열기 ──
  function openWrite() {
    setEditTarget(null);
    setForm({ title: "", content: "", category: "free" });
    setFormError(null);
    setWriting(true);
  }

  // ── 수정 열기 ──
  function openEdit(post: PostDetail) {
    setEditTarget(post);
    setForm({ title: post.title, content: post.content, category: post.category });
    setFormError(null);
    setWriting(true);
    setDetail(null);
  }

  // ── 글 등록/수정 ──
  async function submitPost() {
    if (!token.current || !form.title.trim() || !form.content.trim()) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const url    = editTarget ? `/api/community/${editTarget.id}` : "/api/community";
      const method = editTarget ? "PATCH" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.current}` },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (d.error) { setFormError(d.error.message); return; }
      setWriting(false);
      await loadPosts(true);
    } finally {
      setSubmitting(false);
    }
  }

  // ── 글 삭제 ──
  async function deletePost(id: string) {
    if (!token.current || !confirm(t("deleteConfirm"))) return;
    await fetch(`/api/community/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token.current}` },
    });
    setDetail(null);
    await loadPosts(true);
  }

  // ── 고정 토글 ──
  async function togglePin(id: string) {
    if (!token.current) return;
    await fetch(`/api/community/${id}/pin`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token.current}` },
    });
    await loadPosts();
    if (detail?.id === id) await openDetail(id);
  }

  // ── 댓글 작성 ──
  async function submitComment() {
    if (!token.current || !commentText.trim() || !detail) return;
    setCommentSubmitting(true);
    try {
      const r = await fetch(`/api/community/${detail.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.current}` },
        body: JSON.stringify({ content: commentText }),
      });
      const d = await r.json();
      if (!d.error) {
        setCommentText("");
        // 댓글 목록 갱신
        setDetail(prev => prev ? { ...prev, comments: [...prev.comments, d.comment] } : prev);
        setPosts(prev => prev.map(p => p.id === detail.id ? { ...p, _count: { comments: p._count.comments + 1 } } : p));
      }
    } finally {
      setCommentSubmitting(false);
    }
  }

  // ── 댓글 삭제 ──
  async function deleteComment(postId: string, commentId: string) {
    if (!token.current || !confirm(t("deleteCommentConfirm"))) return;
    await fetch(`/api/community/${postId}/comments/${commentId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token.current}` },
    });
    setDetail(prev => prev ? { ...prev, comments: prev.comments.filter(c => c.id !== commentId) } : prev);
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, _count: { comments: Math.max(0, p._count.comments - 1) } } : p));
  }

  // ─── 렌더 ────────────────────────────────────────────────────────────────────

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">

      {/* 헤더 */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        {userId ? (
          <button
            onClick={openWrite}
            className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-95 transition-transform"
          >
            {t("write")}
          </button>
        ) : (
          <Link
            href="/login"
            className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            {t("loginToWrite")}
          </Link>
        )}
      </div>

      {/* 카테고리 탭 */}
      <div className="mb-4 flex flex-wrap gap-2">
        {CATS.map(({ key, labelKey }) => (
          <button
            key={key}
            onClick={() => { setCategory(key as Category | "all"); setPage(1); }}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              category === key
                ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
            }`}
          >
            {t(labelKey as Parameters<typeof t>[0])}
          </button>
        ))}
      </div>

      {/* 검색 */}
      <form onSubmit={handleSearch} className="mb-6 flex gap-2">
        <input
          type="text"
          value={inputQ}
          onChange={e => setInputQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="input flex-1 text-sm"
        />
        <button type="submit" className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800">
          🔍
        </button>
        {q && (
          <button type="button" onClick={() => { setInputQ(""); setQ(""); setPage(1); }}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-50 dark:border-zinc-600">
            ✕
          </button>
        )}
      </form>

      {/* 목록 */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-zinc-500">
          <span className="animate-pulse">{t("loading")}</span>
        </div>
      ) : posts.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-4xl mb-3">🌊</p>
          <p className="text-sm text-zinc-500">{q ? t("emptySearch") : t("empty")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {posts.map(post => (
            <li key={post.id}>
              <button
                onClick={() => openDetail(post.id)}
                className="w-full rounded-2xl border border-zinc-200 bg-white px-5 py-4 text-left transition-all hover:border-zinc-300 hover:shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600"
              >
                {/* 제목 행 */}
                <div className="flex items-start gap-2 mb-2">
                  {post.isPinned && <span className="mt-0.5 shrink-0 text-sm">📌</span>}
                  <p className="flex-1 min-w-0 truncate font-semibold text-[0.95rem]">{post.title}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${CAT_COLORS[post.category]}`}>
                    {t(`cat${post.category.charAt(0).toUpperCase() + post.category.slice(1)}` as Parameters<typeof t>[0])}
                  </span>
                </div>
                {/* 메타 행 */}
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.6rem] font-bold text-white ${avatarColor(post.user.nickname)}`}>
                    {avatarChar(post.user.nickname)}
                  </span>
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">{post.user.nickname}</span>
                  <span>·</span>
                  <span>{timeAgo(post.createdAt, t)}</span>
                  <span className="ml-auto flex items-center gap-2.5">
                    <span title={t("views")}>👁️ {post.views}</span>
                    <span title={t("comments")}>💬 {post._count.comments}</span>
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-zinc-600"
          >
            ←
          </button>
          <span className="text-sm text-zinc-500">{page} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-zinc-600"
          >
            →
          </button>
        </div>
      )}

      {/* ── 글쓰기 / 수정 모달 ── */}
      {writing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={() => setWriting(false)}>
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-6 dark:bg-zinc-900 sm:rounded-2xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-bold">
              {editTarget ? t("editTitle") : t("write")}
            </h2>

            {/* 카테고리 선택 */}
            <div className="mb-3 flex flex-wrap gap-2">
              {CATS.filter(c => c.key !== "all").map(({ key, labelKey }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, category: key as Category }))}
                  className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                    form.category === key
                      ? CAT_COLORS[key as Category] + " ring-2 ring-offset-1 ring-current"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
                  }`}
                >
                  {t(labelKey as Parameters<typeof t>[0])}
                </button>
              ))}
            </div>

            <input
              type="text"
              placeholder={t("titlePlaceholder")}
              value={form.title}
              maxLength={200}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="input mb-3 w-full"
            />
            <textarea
              placeholder={t("contentPlaceholder")}
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              rows={8}
              className="input mb-3 w-full resize-y text-sm"
            />
            {formError && <p className="mb-2 text-sm text-red-600">{formError}</p>}
            <div className="flex gap-2">
              <button
                onClick={submitPost}
                disabled={submitting || !form.title.trim() || !form.content.trim()}
                className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? t("submitting") : t("submit")}
              </button>
              <button
                onClick={() => setWriting(false)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
              >
                {t("close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 상세 모달 ── */}
      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:p-4 sm:items-center" onClick={() => setDetail(null)}>
          <div
            className="flex w-full max-w-lg flex-col rounded-t-3xl bg-white dark:bg-zinc-900 sm:rounded-2xl"
            style={{ maxHeight: "92dvh" }}
            onClick={e => e.stopPropagation()}
          >
            {detailLoading ? (
              <div className="flex items-center justify-center py-16 text-sm text-zinc-500">
                <span className="animate-pulse">{t("loading")}</span>
              </div>
            ) : detail ? (
              <>
                {/* 모달 헤더 */}
                <div className="flex-shrink-0 border-b border-zinc-200 dark:border-zinc-700 px-5 py-4">
                  {/* 카테고리 + 고정 */}
                  <div className="mb-2 flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CAT_COLORS[detail.category]}`}>
                      {t(`cat${detail.category.charAt(0).toUpperCase() + detail.category.slice(1)}` as Parameters<typeof t>[0])}
                    </span>
                    {detail.isPinned && <span className="text-xs text-zinc-500">{t("pinned")}</span>}
                  </div>
                  <h2 className="text-lg font-bold leading-snug">{detail.title}</h2>
                  {/* 작성자 정보 */}
                  <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                    <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.6rem] font-bold text-white ${avatarColor(detail.user.nickname)}`}>
                      {avatarChar(detail.user.nickname)}
                    </span>
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">{detail.user.nickname}</span>
                    <span>·</span>
                    <span>{timeAgo(detail.createdAt, t)}</span>
                    <span className="ml-auto flex items-center gap-2">
                      <span>👁️ {detail.views}</span>
                      <span>💬 {detail.comments.length}</span>
                    </span>
                  </div>
                </div>

                {/* 스크롤 영역 */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
                  {/* 본문 */}
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 dark:text-zinc-200 font-sans">
                    {detail.content}
                  </pre>

                  {/* 액션 버튼 */}
                  <div className="flex flex-wrap gap-2 border-t border-zinc-100 dark:border-zinc-800 pt-4">
                    {(userId === detail.user.id || isOperator) && (
                      <>
                        {userId === detail.user.id && (
                          <button
                            onClick={() => openEdit(detail)}
                            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
                          >
                            ✏️ {t("edit")}
                          </button>
                        )}
                        <button
                          onClick={() => deletePost(detail.id)}
                          className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
                        >
                          🗑️ {t("delete")}
                        </button>
                      </>
                    )}
                    {isOperator && (
                      <button
                        onClick={() => togglePin(detail.id)}
                        className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400"
                      >
                        {detail.isPinned ? t("unpin") : t("pin")}
                      </button>
                    )}
                    <button
                      onClick={() => setDetail(null)}
                      className="ml-auto rounded-lg border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-600"
                    >
                      {t("close")}
                    </button>
                  </div>

                  {/* 댓글 섹션 */}
                  <div>
                    <p className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                      💬 {t("comments")} {detail.comments.length > 0 && `(${detail.comments.length})`}
                    </p>

                    {detail.comments.length === 0 ? (
                      <p className="text-center text-sm text-zinc-400 py-4">{t("noComments")}</p>
                    ) : (
                      <ul className="space-y-3">
                        {detail.comments.map(c => (
                          <li key={c.id} className="flex gap-3">
                            <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${avatarColor(c.user.nickname)}`}>
                              {avatarChar(c.user.nickname)}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{c.user.nickname}</span>
                                <span className="text-xs text-zinc-400">{timeAgo(c.createdAt, t)}</span>
                                {(userId === c.user.id || isOperator) && (
                                  <button
                                    onClick={() => deleteComment(detail.id, c.id)}
                                    className="ml-auto text-xs text-zinc-400 hover:text-red-500"
                                  >
                                    {t("deleteComment")}
                                  </button>
                                )}
                              </div>
                              <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{c.content}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* 댓글 입력 */}
                    {userId ? (
                      <div className="mt-4 flex gap-2">
                        <textarea
                          value={commentText}
                          onChange={e => setCommentText(e.target.value)}
                          placeholder={t("commentPlaceholder")}
                          rows={2}
                          maxLength={500}
                          onKeyDown={e => {
                            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                              e.preventDefault();
                              submitComment();
                            }
                          }}
                          className="input flex-1 resize-none text-sm"
                        />
                        <button
                          onClick={submitComment}
                          disabled={commentSubmitting || !commentText.trim()}
                          className="shrink-0 self-end rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {t("addComment")}
                        </button>
                      </div>
                    ) : (
                      <Link
                        href="/login"
                        className="mt-4 block rounded-xl border border-zinc-200 p-3 text-center text-sm text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        {t("loginToWrite")}
                      </Link>
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      <p className="mt-10 text-center text-sm text-zinc-500">
        <Link href="/" className="text-blue-600 hover:underline">{t("back")}</Link>
      </p>
    </section>
  );
}
