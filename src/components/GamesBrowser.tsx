"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import GameCard, { type Game, type GameCategory } from "@/components/GameCard";
import { SESSION_CHANGE_EVENT, session } from "@/lib/api";
import { loadLastGameId, saveLastGameId } from "@/lib/lastGame";

type Props = { games: Game[] };
const FILTER_CATEGORIES: GameCategory[] = ["earn", "multiplay", "decorate", "other"];
const CAT_ICON: Record<string, string> = {
  all: "🎮", earn: "💰", multiplay: "👥", decorate: "🎨", other: "🎲",
};

function gameHrefWithToken(baseUrl: string, token: string | null): string {
  const u = String(baseUrl || "").trim();
  if (!u || !token) return u;
  const api = (process.env.NEXT_PUBLIC_STANDALONE_GAMES_API_URL ?? "").trim();
  const q   = api ? `&platformApi=${encodeURIComponent(api)}` : "";
  return `${u.replace(/\/+$/, "") + "/"}?token=${encodeURIComponent(token)}${q}`;
}

export default function GamesBrowser({ games }: Props) {
  const t = useTranslations("Games");

  const [query,      setQuery]     = useState("");
  const [activeCat,  setActiveCat] = useState<GameCategory | "all">("all");
  const [sortBy,     setSortBy]    = useState<"default" | "popular" | "rating">("default");
  const [lastGameId, setLastGameId] = useState<string | null>(null);
  const [token,      setToken]     = useState<string | null>(null);

  useEffect(() => {
    setLastGameId(loadLastGameId());
    const sync = () => setToken(session.getToken());
    sync();
    window.addEventListener(SESSION_CHANGE_EVENT, sync);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, sync);
  }, []);

  const catLabel = (cat: GameCategory | "all") => {
    const m = { earn: "categoryEarn", multiplay: "categoryMultiplay", decorate: "categoryDecorate", other: "categoryOther" } as const;
    return cat === "all" ? t("filterAll") : t(m[cat]);
  };

  const counts = useMemo(() => {
    const c = new Map<GameCategory, number>();
    for (const g of games) c.set((g.category ?? "other") as GameCategory, (c.get((g.category ?? "other") as GameCategory) ?? 0) + 1);
    return c;
  }, [games]);

  const filtered = useMemo(() => {
    let list = games.filter((g) => {
      if (activeCat !== "all" && (g.category ?? "other") !== activeCat) return false;
      return true;
    });
    if (sortBy === "popular") list = [...list].sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0));
    if (sortBy === "rating")  list = [...list].sort((a, b) => (b.ratingAvg  ?? 0) - (a.ratingAvg  ?? 0));
    return list;
  }, [games, activeCat, sortBy]);

  const lastGame     = lastGameId ? games.find((g) => g.id === lastGameId) ?? null : null;
  const lastGameHref = lastGame ? gameHrefWithToken(lastGame.url, token) || lastGame.url : "";

  return (
    <div className="flex flex-col gap-0 text-gray-900">

      {/* ── 이어하기 ────────────────────────────────────────────────── */}
      {lastGame && (
        <a href={lastGameHref} onClick={() => saveLastGameId(lastGame.id)}
          className="group mb-5 flex items-center gap-4 rounded-lg border border-blue-100 bg-blue-50 p-4 transition-all hover:border-blue-200 hover:bg-blue-100"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 text-2xl shadow">
            {lastGame.emoji}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">{t("continueLabel")}</p>
            <p className="truncate text-sm font-semibold text-gray-900">{lastGame.title}</p>
          </div>
          <span className="shrink-0 rounded bg-[#0170bd] px-4 py-2 text-xs font-semibold text-white transition-colors group-hover:bg-blue-700">
            {t("continueButton")}
          </span>
        </a>
      )}

      {/* ── 카테고리 + 정렬 드롭다운 ───────────────────────────────── */}
      <div className="mb-5 flex items-center gap-2">
        {/* 카테고리 */}
        <div className="relative">
          <select value={activeCat} onChange={(e) => setActiveCat(e.target.value as GameCategory | "all")}
            className="appearance-none cursor-pointer rounded border border-gray-300 bg-white py-1.5 pl-3 pr-8 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="all">{CAT_ICON.all} {t("filterAll")} ({games.length})</option>
            {FILTER_CATEGORIES.map((cat) => {
              const n = counts.get(cat) ?? 0;
              if (n === 0) return null;
              return (
                <option key={cat} value={cat}>
                  {CAT_ICON[cat]} {catLabel(cat)} ({n})
                </option>
              );
            })}
          </select>
          <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
            width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="m6 9 6 6 6-6"/>
          </svg>
        </div>

        {/* 정렬 */}
        <div className="relative">
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="appearance-none cursor-pointer rounded border border-gray-300 bg-white py-1.5 pl-3 pr-8 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="default">{t("sortDefault")}</option>
            <option value="popular">{t("sortPopular")}</option>
            <option value="rating">⭐ 평점순</option>
          </select>
          <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
            width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="m6 9 6 6 6-6"/>
          </svg>
        </div>

        <span className="ml-auto text-sm text-gray-500">{t("gameCount", { count: filtered.length })}</span>
      </div>

      {/* ── 카드 그리드 ─────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-gray-300 bg-white py-24 text-center">
          <span className="text-5xl opacity-30">🔍</span>
          <p className="text-sm text-gray-500">{t("emptyResult")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((g) => <GameCard key={g.id} game={g} />)}
        </div>
      )}
    </div>
  );
}
