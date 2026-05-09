"use client";

import { useEffect, useState } from "react";
import { SESSION_CHANGE_EVENT, session } from "@/lib/api";

export type Game = {
  id: string;
  title: string;
  description: string;
  url: string;
  emoji: string;
  tags: string[];
  players: number | null;
  rooms: number | null;
};

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

  return (
    <a
      href={href}
      className="group flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white transition-all hover:-translate-y-1 hover:border-blue-500 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-blue-500"
    >
      <div className="relative flex h-40 items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 text-6xl">
        {game.emoji}
        {/* 접속자 수 배지 */}
        <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/40 px-2.5 py-1 text-xs text-white backdrop-blur-sm">
          <span className={`h-1.5 w-1.5 rounded-full ${game.players !== null ? "bg-green-400" : "bg-zinc-400"}`} />
          {game.players !== null ? `${game.players}명 플레이 중` : "정보 없음"}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h2 className="text-lg font-semibold tracking-tight">{game.title}</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {game.description}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
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
