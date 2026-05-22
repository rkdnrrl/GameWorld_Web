"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { session, SESSION_CHANGE_EVENT } from "@/lib/api";

type Comment = {
  id: number;
  userId: string;
  nickname: string;
  content: string;
  createdAt: string;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "방금 전";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export default function GameComments({ slug }: { slug: string }) {
  const t = useTranslations("GameDetail");
  const [comments,    setComments]    = useState<Comment[]>([]);
  const [content,     setContent]     = useState("");
  const [token,       setToken]       = useState<string | null>(null);
  const [userId,      setUserId]      = useState<string | null>(null);
  const [isOperator,  setIsOperator]  = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [deletingId,  setDeletingId]  = useState<number | null>(null);

  const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

  // 세션 동기화
  useEffect(() => {
    const sync = () => {
      setToken(session.getToken());
      const u = session.getUser();
      setUserId(u?.id ?? null);
      setIsOperator(!!u?.isOperator);
    };
    sync();
    window.addEventListener(SESSION_CHANGE_EVENT, sync);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, sync);
  }, []);

  // 댓글 로드
  useEffect(() => {
    fetch(`${apiBase}/api/games/${slug}/comments`)
      .then((r) => r.json())
      .then((d) => setComments(d.comments ?? []))
      .catch(() => {});
  }, [slug, apiBase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !content.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/api/games/${slug}/comments`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ content: content.trim() }),
      });
      if (res.ok) {
        const { comment } = await res.json();
        setComments((prev) => [comment, ...prev]);
        setContent("");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!token || deletingId !== null) return;
    setDeletingId(id);
    try {
      const res = await fetch(`${apiBase}/api/games/${slug}/comments/${id}`, {
        method:  "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setComments((prev) => prev.filter((c) => c.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="mt-10">
      <h2 className="mb-4 text-base font-semibold text-gray-900">
        {t("commentsTitle", { count: comments.length })}
      </h2>

      {/* 입력창 */}
      {token ? (
        <form onSubmit={handleSubmit} className="mb-6 flex gap-2">
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={500}
            placeholder={t("commentPlaceholder")}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={submitting || !content.trim()}
            className="shrink-0 rounded-lg bg-[#0170bd] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? t("commentSubmitting") : t("commentSubmit")}
          </button>
        </form>
      ) : (
        <p className="mb-6 rounded-lg border border-dashed border-gray-200 bg-gray-50 py-4 text-center text-sm text-gray-500">
          {t("commentLoginPrompt")}
        </p>
      )}

      {/* 댓글 목록 */}
      {comments.length === 0 ? (
        <p className="text-center text-sm text-gray-400">{t("commentEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3 rounded-lg border border-gray-100 bg-white p-4">
              {/* 아바타 */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 text-sm font-bold text-white">
                {c.nickname.charAt(0).toUpperCase()}
              </div>
              {/* 내용 */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800">{c.nickname}</span>
                  <span className="text-xs text-gray-400">{timeAgo(c.createdAt)}</span>
                </div>
                <p className="mt-1 break-words text-sm text-gray-700">{c.content}</p>
              </div>
              {/* 삭제 버튼 (본인 또는 운영자) */}
              {(c.userId === userId || isOperator) && (
                <button
                  type="button"
                  onClick={() => handleDelete(c.id)}
                  disabled={deletingId === c.id}
                  className="shrink-0 self-start text-xs text-gray-400 hover:text-red-500 disabled:opacity-40"
                >
                  {deletingId === c.id ? t("commentDeleting") : t("commentDelete")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
