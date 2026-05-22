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
  earn:      "from-amber-500/80 to-orange-600/80",
  multiplay: "from-blue-600/80 to-cyan-500/80",
  decorate:  "from-pink-500/80 to-rose-500/80",
  other:     "from-violet-600/80 to-purple-700/80",
};

const CAT_COLOR: Record<string, string> = {
  earn:      "text-amber-400",
  multiplay: "text-blue-400",
  decorate:  "text-pink-400",
  other:     "text-violet-400",
};

function catKey(cat: GameCategory) {
  const map = { earn:"categoryEarn", multiplay:"categoryMultiplay", decorate:"categoryDecorate", other:"categoryOther" } as const;
  return map[cat] ?? "categoryOther";
}

function gameHrefWithToken(baseUrl: string, token: string): string {
  let u = String(baseUrl || "").trim();
  if (!u) return u;
  const hi = u.indexOf("#"); let hash = "";
  if (hi !== -1) { hash = u.slice(hi); u = u.slice(0, hi); }
  const api = (process.env.NEXT_PUBLIC_STANDALONE_GAMES_API_URL ?? "").trim();
  const q   = api ? `&platformApi=${encodeURIComponent(api)}` : "";
  const qi  = u.indexOf("?");
  if (qi !== -1) return `${u}&token=${encodeURIComponent(token)}${q}${hash}`;
  return `${u.replace(/\/+$/, "") + "/"}?token=${encodeURIComponent(token)}${q}${hash}`;
}

function fmt(n: number | null | undefined) {
  if (n == null || n === 0) return null;
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

// ── 별점 ──────────────────────────────────────────────────────────────────────
function Stars({ avg, count, canRate, onRate }: {
  avg: number; count: number; canRate: boolean; onRate: (r: number) => void;
}) {
  const t = useTranslations("Games");
  const [hov, setHov] = useState(0);
  const fill = hov || avg;

  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.preventDefault()}>
      <div className="flex gap-px">
        {[1,2,3,4,5].map((n) => (
          <button
            key={n} type="button" disabled={!canRate}
            onClick={() => onRate(n)}
            onMouseEnter={() => canRate && setHov(n)}
            onMouseLeave={() => setHov(0)}
            title={canRate ? undefined : t("loginToRate")}
            className={`text-sm leading-none transition-transform ${
              n <= Math.round(fill) ? "text-amber-400" : "text-zinc-700"
            } ${canRate ? "cursor-pointer hover:scale-125" : "cursor-default"}`}
          >★</button>
        ))}
      </div>
      {count > 0
        ? <span className="text-xs text-zinc-500"><span className="text-zinc-300">{avg.toFixed(1)}</span> ({count})</span>
        : <span className="text-[11px] text-zinc-700">{t("noRating")}</span>
      }
    </div>
  );
}

// ── 카드 ──────────────────────────────────────────────────────────────────────
export default function GameCard({ game }: { game: Game }) {
  const t = useTranslations("Games");
  const [token,       setToken]       = useState<string | null>(null);
  const [ratingAvg,   setRatingAvg]   = useState(game.ratingAvg   ?? 0);
  const [ratingCount, setRatingCount] = useState(game.ratingCount ?? 0);

  useEffect(() => {
    const sync = () => setToken(session.getToken());
    sync();
    window.addEventListener(SESSION_CHANGE_EVENT, sync);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, sync);
  }, []);

  const href     = token ? gameHrefWithToken(game.url, token) : game.url;
  const cat      = (game.category ?? "other") as GameCategory;
  const gradient = CAT_GRADIENT[cat] ?? CAT_GRADIENT.other;
  const catColor = CAT_COLOR[cat]    ?? CAT_COLOR.other;

  async function handleRate(rating: number) {
    if (!token) return;
    const base = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
    try {
      const res = await fetch(`${base}/api/games/${game.id}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating }),
      });
      if (res.ok) {
        const d = await res.json();
        setRatingAvg(d.avg);
        setRatingCount(d.count);
      }
    } catch {}
  }

  const plays = fmt(game.playCount);

  return (
    <a
      href={href}
      onClick={() => saveLastGameId(game.id)}
      className="group flex flex-col overflow-hidden rounded-lg bg-zinc-900 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/50"
    >
      {/* ── 썸네일 ── */}
      <div className="relative aspect-[4/3] overflow-hidden bg-zinc-800">
        {game.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={game.thumbnailUrl}
            alt={game.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br ${gradient}`}>
            {/* 배경 원 장식 */}
            <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10" />
            <div className="pointer-events-none absolute -bottom-8 -left-8 h-28 w-28 rounded-full bg-black/20" />
            <span className="relative text-6xl drop-shadow-lg transition-transform duration-300 group-hover:scale-110">
              {game.emoji}
            </span>
          </div>
        )}

        {/* 호버 → 플레이 오버레이 */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span className="rounded-full bg-white px-5 py-2 text-sm font-bold text-zinc-900 shadow-lg">
            ▶ {t("playNow")}
          </span>
        </div>

        {/* 접속자 수 (우상단) */}
        {game.players !== null && (
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
            {game.players}
          </div>
        )}
      </div>

      {/* ── 정보 영역 ── */}
      <div className="flex flex-1 flex-col gap-1.5 p-3">

        {/* 카테고리 + kind */}
        <div className="flex items-center gap-1.5">
          <span className={`text-[11px] font-medium ${catColor}`}>
            {t(catKey(cat))}
          </span>
          {game.kind === "official" && (
            <span className="rounded bg-indigo-500/20 px-1.5 py-px text-[10px] font-semibold text-indigo-300">
              {t("kindOfficial")}
            </span>
          )}
        </div>

        {/* 타이틀 */}
        <h2 className="line-clamp-1 text-sm font-semibold text-white">
          {game.title}
        </h2>

        {/* 별점 */}
        <Stars avg={ratingAvg} count={ratingCount} canRate={!!token} onRate={handleRate} />

        {/* 플레이 수 */}
        {plays && (
          <p className="text-[11px] text-zinc-600">👁 {plays}</p>
        )}
      </div>
    </a>
  );
}
