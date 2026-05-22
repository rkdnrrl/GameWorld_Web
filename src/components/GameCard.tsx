"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SESSION_CHANGE_EVENT, session } from "@/lib/api";
import { saveLastGameId } from "@/lib/lastGame";

/** API `games.js`의 category와 동일 */
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
  /** 동시 접속 상한 (없으면 큐브 멀티플레이만 기본 100) */
  maxPlayers?: number | null;
  /** 없으면 UI에서 other 취급 */
  category?: GameCategory;
};

// 카테고리별 썸네일 그라디언트
const CAT_GRADIENT: Record<string, string> = {
  earn:      "from-amber-400 to-orange-500",
  multiplay: "from-blue-500 to-cyan-500",
  decorate:  "from-pink-500 to-rose-400",
  other:     "from-violet-500 to-purple-600",
};

// 카테고리 뱃지 색
const CAT_BADGE: Record<string, string> = {
  earn:      "bg-amber-500/90",
  multiplay: "bg-blue-500/90",
  decorate:  "bg-pink-500/90",
  other:     "bg-violet-500/90",
};

function catKey(cat: GameCategory): "categoryEarn" | "categoryMultiplay" | "categoryDecorate" | "categoryOther" {
  switch (cat) {
    case "earn":      return "categoryEarn";
    case "multiplay": return "categoryMultiplay";
    case "decorate":  return "categoryDecorate";
    default:          return "categoryOther";
  }
}

function gameHrefWithToken(baseUrl: string, token: string): string {
  let u = String(baseUrl || "").trim();
  if (!u) return u;
  const hashIdx = u.indexOf("#");
  let hash = "";
  if (hashIdx !== -1) {
    hash = u.slice(hashIdx);
    u    = u.slice(0, hashIdx);
  }
  const standaloneApi = (process.env.NEXT_PUBLIC_STANDALONE_GAMES_API_URL ?? "").trim();
  const apiQ = standaloneApi ? `&platformApi=${encodeURIComponent(standaloneApi)}` : "";
  const qIdx = u.indexOf("?");
  if (qIdx !== -1) return `${u}&token=${encodeURIComponent(token)}${apiQ}${hash}`;
  const root = u.replace(/\/+$/, "") + "/";
  return `${root}?token=${encodeURIComponent(token)}${apiQ}${hash}`;
}

export default function GameCard({ game }: { game: Game }) {
  const t = useTranslations("Games");
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setToken(session.getToken());
    sync();
    window.addEventListener(SESSION_CHANGE_EVENT, sync);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, sync);
  }, []);

  const href    = token ? gameHrefWithToken(game.url, token) : game.url;
  const cat     = (game.category ?? "other") as GameCategory;
  const gradient = CAT_GRADIENT[cat] ?? CAT_GRADIENT.other;
  const badge    = CAT_BADGE[cat]    ?? CAT_BADGE.other;

  const maxCap  = game.maxPlayers ?? (game.id === "cube-multiplay" ? 100 : null);
  const current = game.players;
  const ratio   = maxCap && maxCap > 0 && current !== null
    ? Math.min(1, current / maxCap)
    : null;

  return (
    <a
      href={href}
      onClick={() => saveLastGameId(game.id)}
      className="group flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
    >
      {/* 썸네일 */}
      <div className={`relative flex h-44 items-center justify-center overflow-hidden bg-gradient-to-br ${gradient}`}>
        {/* 배경 장식 원 */}
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-black/10" />

        {/* 이모지 */}
        <span className="relative text-7xl drop-shadow-lg transition-transform duration-300 group-hover:scale-110">
          {game.emoji}
        </span>

        {/* 호버 오버레이 — 플레이 버튼 */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 backdrop-blur-[2px] transition-opacity duration-200 group-hover:opacity-100">
          <span className="rounded-full bg-white px-5 py-2 text-sm font-bold text-zinc-900 shadow-lg">
            ▶ {t("playNow")}
          </span>
        </div>

        {/* 카테고리 뱃지 */}
        <span className={`absolute left-3 top-3 rounded-full ${badge} px-2.5 py-0.5 text-xs font-semibold text-white backdrop-blur-sm`}>
          {t(catKey(cat))}
        </span>

        {/* 접속자 뱃지 */}
        {current !== null ? (
          <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/40 px-2.5 py-0.5 text-xs text-white backdrop-blur-sm">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-400" />
            {t("onlineCount", { count: current })}
          </span>
        ) : (
          <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/40 px-2.5 py-0.5 text-xs text-white/70 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" />
            {t("noInfo")}
          </span>
        )}
      </div>

      {/* 카드 바디 */}
      <div className="flex flex-1 flex-col p-4">
        <h2 className="line-clamp-1 text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {game.title}
        </h2>
        <p className="mt-1 line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">
          {game.description}
        </p>

        {/* 접속률 바 (maxCap 있는 경우) */}
        {maxCap !== null && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs text-zinc-400">
              <span>동시 접속</span>
              <span className="font-medium tabular-nums">
                {current !== null ? `${current} / ${maxCap}` : `— / ${maxCap}`}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              {ratio !== null && (
                <div
                  className="h-full rounded-full transition-[width,background-color] duration-500"
                  style={{
                    width: `${Math.max(ratio * 100, ratio > 0 ? 2 : 0)}%`,
                    backgroundColor: `hsl(${125 * (1 - ratio)} 78% 45%)`,
                  }}
                />
              )}
            </div>
          </div>
        )}

        {/* 태그 */}
        {game.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {game.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </a>
  );
}
