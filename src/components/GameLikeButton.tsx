"use client";

import { useEffect, useState } from "react";
import { session, SESSION_CHANGE_EVENT } from "@/lib/api";

export default function GameLikeButton({ gameId, initialCount }: { gameId: string; initialCount: number }) {
  const [count,   setCount]   = useState(initialCount);
  const [liked,   setLiked]   = useState(false);
  const [token,   setToken]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

  useEffect(() => {
    const sync = () => setToken(session.getToken());
    sync();
    window.addEventListener(SESSION_CHANGE_EVENT, sync);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, sync);
  }, []);

  async function handleLike() {
    if (!token || loading) return;
    setLoading(true);
    try {
      const method = liked ? "DELETE" : "POST";
      const res = await fetch(`${apiBase}/api/games/${gameId}/like`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setLiked((v) => !v);
        setCount((c) => liked ? c - 1 : c + 1);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLike}
      disabled={!token || loading}
      title={token ? (liked ? "좋아요 취소" : "좋아요") : "로그인 후 이용 가능"}
      className={`inline-flex items-center gap-2 rounded-xl border px-5 py-3 text-sm font-semibold transition-all active:scale-95 disabled:opacity-40 ${
        liked
          ? "border-red-300 bg-red-50 text-red-600 hover:bg-red-100"
          : "border-gray-300 bg-white text-gray-600 hover:border-red-300 hover:text-red-500"
      }`}
    >
      {liked ? "❤️" : "🤍"} {count > 0 ? count : ""}
    </button>
  );
}
