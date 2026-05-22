"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SESSION_CHANGE_EVENT, session } from "@/lib/api";
import { saveLastGameId } from "@/lib/lastGame";

export type GameCategory = "earn" | "multiplay" | "decorate" | "other";

export type Game = {
  id: string;
  title: string;
  description: string;
  url: string;
  emoji: string;
  tags: string[];
  players: number | null;
  rooms: number | null;
  maxPlayers?: number | null;
  category?: GameCategory;
  kind?: string;
  thumbnailUrl?: string | null;
  playCount?: number | null;
  likeCount?: number | null;
  ratingAvg?: number | null;
  ratingCount?: number | null;
};

const CAT_GRADIENT: Record<string, string> = {
  earn:      "from-amber-500 to-orange-600",
  multiplay: "from-blue-600 to-cyan-500",
  decorate:  "from-pink-500 to-rose-500",
  other:     "from-violet-600 to-purple-700",
};

function catKey(cat: GameCategory) {
  const map = {
    earn:      "categoryEarn",
    multiplay: "categoryMultiplay",
    decorate:  "categoryDecorate",
    other:     "categoryOther",
  } as const;
  return map[cat] ?? "categoryOther";
}

function gameHrefWithToken(baseUrl: string, token: string): string {
  let u = String(baseUrl || "").trim();
  if (!u) return u;
  const hashIdx = u.indexOf("#");
  let hash = "";
  if (hashIdx !== -1) { hash = u.slice(hashIdx); u = u.slice(0, hashIdx); }
  const standaloneApi = (process.env.NEXT_PUBLIC_STANDALONE_GAMES_API_URL ?? "").trim();
  const apiQ = standaloneApi ? `&platformApi=${encodeURIComponent(standaloneApi)}` : "";
  const qIdx = u.indexOf("?");
  if (qIdx !== -1) return `${u}&token=${encodeURIComponent(token)}${apiQ}${hash}`;
  return `${u.replace(/\/+$/, "") + "/"}?token=${encodeURIComponent(token)}${apiQ}${hash}`;
}

function formatCount(n: number | null | undefined): string {
  if (n == null) return "0";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ── 별점 컴포넌트 ──────────────────────────────────────────────────────────────
function StarRating({
  avg, count, canRate, onRate,
}: {
  avg: number; count: number; canRate: boolean; onRate: (r: number) => void;
}) {
  const t = useTranslations("Games");
  const [hovered, setHovered] = useState(0);

  // 색 결정: hover 우선 → avg 채우기 (소수)
  const display = hovered || avg;

  return (
    <div
      className="flex items-center gap-1.5"
      onClick={(e) => e.preventDefault()}
    >
      <div className="flex">
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = n <= Math.round(display);
          return (
            <button
              key={n}
              type="button"
              disabled={!canRate}
              onClick={() => onRate(n)}
              onMouseEnter={() => canRate && setHovered(n)}
              onMouseLeave={() => setHovered(0)}
              title={canRate ? undefined : t("loginToRate")}
              className={`text-base leading-none transition-all ${
                filled ? "text-amber-400" : "text-zinc-700"
              } ${canRate ? "cursor-pointer hover:scale-125" : "cursor-default"}`}
            >
              ★
            </button>
          );
        })}
      </div>
      {count > 0 ? (
        <span className="text-xs text-zinc-500">
          <span className="text-zinc-300">{avg.toFixed(1)}</span>
          {" "}({count})
        </span>
      ) : (
        <span className="text-xs text-zinc-600">{t("noRating")}</span>
      )}
    </div>
  );
}

// ── 메인 카드 ──────────────────────────────────────────────────────────────────
export default function GameCard({ game }: { game: Game }) {
  const t = useTranslations("Games");
  const [token, setToken] = useState<string | null>(null);
  const [ratingAvg,   setRatingAvg]   = useState(game.ratingAvg   ?? 0);
  const [ratingCount, setRatingCount] = useState(game.ratingCount ?? 0);

  useEffect(() => {
    const sync = () => setToken(session.getToken());
    sync();
    window.addEventListener(SESSION_CHANGE_EVENT, sync);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, sync);
  }, []);

  const href = token ? gameHrefWithToken(game.url, token) : game.url;
  const cat  = (game.category ?? "other") as GameCategory;
  const gradient = CAT_GRADIENT[cat] ?? CAT_GRADIENT.other;

  async function handleRate(rating: number) {
    if (!token) return;
    const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
    try {
      const res = await fetch(`${apiBase}/api/games/${game.id}/rate`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ rating }),
      });
      if (res.ok) {
        const data = await res.json();
        setRatingAvg(data.avg);
        setRatingCount(data.count);
      }
    } catch {}
  }

  return (
    <a
      href={href}
      onClick={() => saveLastGameId(game.id)}
      className="group flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-950/60"
    >
      {/* ── 썸네일 ── */}
      <div className="relative aspect-video overflow-hidden bg-zinc-800">
        {game.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={game.thumbnailUrl}
            alt={game.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br ${gradient}`}>
            <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
            <div className="pointer-events-none absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-black/15" />
            <span className="relative text-6xl drop-shadow-lg transition-transform duration-300 group-hover:scale-110">
              {game.emoji}
            </span>
          </div>
        )}

        {/* 호버 오버레이 */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 backdrop-blur-[2px] transition-opacity duration-200 group-hover:opacity-100">
          <span className="rounded-full bg-white/95 px-5 py-2 text-sm font-bold text-zinc-900 shadow-xl">
            ▶ {t("playNow")}
          </span>
        </div>

        {/* 카테고리 뱃지 */}
        <span className="absolute left-2.5 top-2.5 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
          {t(catKey(cat))}
        </span>

        {/* 접속자 뱃지 */}
        {game.players !== null && (
          <span className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-0.5 text-xs text-white backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
            {t("onlineCount", { count: game.players })}
          </span>
        )}
      </div>

      {/* ── 카드 바디 ── */}
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        {/* kind 뱃지 */}
        {game.kind && (
          <span className={`w-fit rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            game.kind === "official"
              ? "bg-indigo-500/20 text-indigo-300"
              : "bg-zinc-700 text-zinc-400"
          }`}>
            {game.kind === "official" ? t("kindOfficial") : t("kindCommunity")}
          </span>
        )}

        <h2 className="line-clamp-1 text-sm font-semibold text-zinc-100">
          {game.title}
        </h2>

        <p className="line-clamp-2 text-xs leading-relaxed text-zinc-500">
          {game.description}
        </p>

        {/* 별점 */}
        <StarRating
          avg={ratingAvg}
          count={ratingCount}
          canRate={!!token}
          onRate={handleRate}
        />

        {/* 태그 + 플레이 수 */}
        <div className="mt-auto flex items-center gap-2 pt-1">
          <div className="flex flex-1 flex-wrap gap-1">
            {game.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500"
              >
                {tag}
              </span>
            ))}
          </div>
          {game.playCount != null && game.playCount > 0 && (
            <span className="shrink-0 text-xs text-zinc-600">
              👁 {formatCount(game.playCount)}
            </span>
          )}
        </div>
      </div>
    </a>
  );
}
