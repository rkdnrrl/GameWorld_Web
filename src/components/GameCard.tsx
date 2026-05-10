"use client";

import { useEffect, useState } from "react";
import { SESSION_CHANGE_EVENT, session } from "@/lib/api";

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

function occupancyMeterColor(ratio: number): string {
  const t = Math.min(1, Math.max(0, ratio));
  // 낮음: 초록 → 중간: 황색 → 높음: 주황 → 포화: 빨강
  const hue = 125 * (1 - t);
  return `hsl(${hue} 78% ${42 + t * 6}%)`;
}

export default function GameCard({ game }: { game: Game }) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setToken(session.getToken());
    sync();
    window.addEventListener(SESSION_CHANGE_EVENT, sync);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, sync);
  }, []);

  const href = token
    ? `${game.url}?token=${encodeURIComponent(token)}`
    : game.url;

  const maxCap =
    game.maxPlayers ??
    (game.id === "cube-multiplay" ? 100 : null);
  const current = game.players;
  const ratio =
    maxCap !== null && maxCap > 0 && current !== null
      ? Math.min(1, current / maxCap)
      : null;

  const fillPercent =
    ratio === null
      ? 0
      : ratio <= 0
        ? 0
        : Math.min(100, Math.max(ratio * 100, 2));

  return (
    <a
      href={href}
      className="group flex min-w-0 max-w-full flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white transition-all hover:-translate-y-1 hover:border-blue-500 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-blue-500"
    >
      <div className="relative flex h-40 items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 text-6xl">
        {game.emoji}
        {maxCap === null && (
          <div className="absolute left-2 right-2 top-2 flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-full bg-black/40 px-2 py-1 text-[10px] text-white backdrop-blur-sm sm:left-auto sm:right-3 sm:top-3 sm:max-w-none sm:px-2.5 sm:text-xs">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${game.players !== null ? "bg-green-400" : "bg-zinc-400"}`}
            />
            <span className="min-w-0 truncate">
              {game.players !== null
                ? `${game.players}명 플레이 중`
                : "정보 없음"}
            </span>
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
        <h2 className="break-words text-base font-semibold tracking-tight sm:text-lg">
          {game.title}
        </h2>
        <p className="mt-1 break-words text-sm text-zinc-600 dark:text-zinc-400">
          {game.description}
        </p>
        {maxCap !== null && (
          <div className="mt-4 space-y-2">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-zinc-800 dark:text-zinc-100">
                동시 접속
              </span>
              <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
                {current !== null ? (
                  <>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                      {current}
                    </span>
                    <span> / {maxCap}명</span>
                  </>
                ) : (
                  <span>— / {maxCap}명</span>
                )}
              </span>
            </div>
            <div
              className="h-2.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
              title={
                ratio !== null
                  ? `접속률 ${Math.round(ratio * 100)}%`
                  : "현재 인원 정보 없음"
              }
            >
              <div
                className="h-full rounded-full transition-[width,background-color] duration-500 ease-out"
                style={{
                  width: `${fillPercent}%`,
                  backgroundColor:
                    ratio !== null
                      ? occupancyMeterColor(ratio)
                      : "rgb(161 161 170)",
                }}
              />
            </div>
            <p className="break-words text-xs text-zinc-500 dark:text-zinc-400">
              최대 동시 접속 {maxCap}명 · 인원이 많아질수록 게이지가 붉어집니다
            </p>
          </div>
        )}
        <div
          className={`flex flex-wrap gap-1.5 ${maxCap !== null ? "mt-4" : "mt-3"}`}
        >
          {game.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="mt-4 flex items-center text-sm font-medium text-blue-600 group-hover:translate-x-1 group-hover:transition-transform">
          플레이하기 →
        </div>
      </div>
    </a>
  );
}
