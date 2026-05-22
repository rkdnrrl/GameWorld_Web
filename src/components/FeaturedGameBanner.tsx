"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SESSION_CHANGE_EVENT, session } from "@/lib/api";
import { saveLastGameId } from "@/lib/lastGame";
import type { Game } from "@/components/GameCard";

const CAT_COLOR: Record<string, string> = {
  earn:      "bg-amber-500",
  multiplay: "bg-blue-500",
  decorate:  "bg-pink-500",
  other:     "bg-violet-500",
};

const CAT_LABEL: Record<string, string> = {
  earn:      "리워드 게임",
  multiplay: "멀티플레이",
  decorate:  "꾸미기",
  other:     "기타",
};

function gameHrefWithToken(url: string, token: string | null): string {
  if (!token) return url;
  const api = (process.env.NEXT_PUBLIC_STANDALONE_GAMES_API_URL ?? "").trim();
  const q   = api ? `&platformApi=${encodeURIComponent(api)}` : "";
  return `${url.replace(/\/+$/, "") + "/"}?token=${encodeURIComponent(token)}${q}`;
}

export default function FeaturedGameBanner({ game }: { game: Game }) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setToken(session.getToken());
    sync();
    window.addEventListener(SESSION_CHANGE_EVENT, sync);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, sync);
  }, []);

  const cat      = game.category ?? "other";
  const playHref = token ? gameHrefWithToken(game.url, token) : game.url;

  return (
    <div className="relative mb-6 overflow-hidden rounded-2xl shadow-lg">
      {/* 배경 — 썸네일 또는 그라디언트 */}
      <div className="absolute inset-0">
        {game.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={game.thumbnailUrl}
            alt={game.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className={`h-full w-full bg-gradient-to-br ${
            cat === "earn"      ? "from-amber-400 to-orange-600"  :
            cat === "multiplay" ? "from-blue-500 to-cyan-600"     :
            cat === "decorate"  ? "from-pink-400 to-rose-600"     :
                                  "from-violet-500 to-purple-700"
          }`} />
        )}
        {/* 왼쪽 어두운 그라디언트 오버레이 */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-transparent" />
      </div>

      {/* 컨텐츠 */}
      <div className="relative flex min-h-[300px] flex-col justify-end p-8 sm:min-h-[360px] sm:max-w-[60%]">
        {/* 카테고리 뱃지 */}
        <span className={`mb-3 w-fit rounded-full ${CAT_COLOR[cat]} px-3 py-1 text-xs font-semibold text-white`}>
          {CAT_LABEL[cat] ?? "기타"}
        </span>

        {/* 제목 */}
        <h2 className="mb-2 text-3xl font-bold leading-tight text-white drop-shadow sm:text-4xl">
          {game.title}
        </h2>

        {/* 설명 */}
        {game.description && (
          <p className="mb-5 line-clamp-2 text-sm text-white/75 sm:text-base">
            {game.description}
          </p>
        )}

        {/* 버튼 */}
        <div className="flex flex-wrap gap-3">
          <a
            href={playHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => saveLastGameId(game.id)}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-gray-900 shadow-md transition-all hover:bg-gray-100 hover:shadow-lg active:scale-95"
          >
            ▶ 게임 시작
          </a>
          <Link
            href={`/games/${game.id}`}
            className="inline-flex items-center gap-2 rounded-xl border border-white/40 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20"
          >
            자세히 보기
          </Link>
        </div>

        {/* 이모지 (썸네일 없을 때만) */}
        {!game.thumbnailUrl && (
          <div className="absolute right-8 top-1/2 -translate-y-1/2 text-[8rem] opacity-30 select-none hidden sm:block">
            {game.emoji}
          </div>
        )}
      </div>
    </div>
  );
}
