"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { session, SESSION_CHANGE_EVENT } from "@/lib/api";

export default function GameDetailRating({
  gameId, initialAvg, initialCount,
}: {
  gameId: string;
  initialAvg: number;
  initialCount: number;
}) {
  const t = useTranslations("GameDetail");
  const [avg,     setAvg]     = useState(initialAvg);
  const [count,   setCount]   = useState(initialCount);
  const [hovered, setHovered] = useState(0);
  const [token,   setToken]   = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [myRating,   setMyRating]   = useState(0);
  const [message,    setMessage]    = useState("");

  const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

  useEffect(() => {
    const sync = () => setToken(session.getToken());
    sync();
    window.addEventListener(SESSION_CHANGE_EVENT, sync);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, sync);
  }, []);

  async function handleRate(rating: number) {
    if (!token || submitting) return;
    setSubmitting(true);
    setMessage("");
    try {
      const res = await fetch(`${apiBase}/api/games/${gameId}/rate`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ rating }),
      });
      if (res.ok) {
        const d = await res.json();
        setAvg(d.avg);
        setCount(d.count);
        setMyRating(rating);
        setMessage(t("ratingDone"));
        setTimeout(() => setMessage(""), 2500);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const display = hovered || myRating;

  return (
    <div className="flex flex-col gap-2">
      {/* 현재 평균 점수 */}
      <div className="flex items-center gap-3">
        <div className="flex">
          {[1, 2, 3, 4, 5].map((n) => {
            const filled = n <= Math.round(avg);
            return (
              <span key={n} className={`text-2xl ${filled ? "text-amber-400" : "text-gray-200"}`}>
                ★
              </span>
            );
          })}
        </div>
        {count > 0 ? (
          <span className="text-sm text-gray-500">
            <span className="text-lg font-semibold text-gray-800">{avg.toFixed(1)}</span>
            {" "}{t("ratingScore", { count })}
          </span>
        ) : (
          <span className="text-sm text-gray-400">{t("ratingNone")}</span>
        )}
      </div>

      {/* 내 평점 입력 */}
      {token ? (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{myRating > 0 ? "내 평점:" : "평가하기:"}</span>
          <div className="flex">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                disabled={submitting}
                onClick={() => void handleRate(n)}
                onMouseEnter={() => setHovered(n)}
                onMouseLeave={() => setHovered(0)}
                className={`text-2xl leading-none transition-transform hover:scale-125 disabled:opacity-50 ${
                  n <= display ? "text-amber-400" : "text-gray-300"
                }`}
              >
                ★
              </button>
            ))}
          </div>
          {message && (
            <span className="text-xs font-medium text-emerald-600">{message}</span>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-400">{t("loginToRate")}</p>
      )}
    </div>
  );
}
