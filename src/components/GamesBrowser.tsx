"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import GameCard, { type Game, type GameCategory } from "@/components/GameCard";
import { SESSION_CHANGE_EVENT, session } from "@/lib/api";
import { loadLastGameId, saveLastGameId } from "@/lib/lastGame";

type Props = { games: Game[] };

const FILTER_CATEGORIES: GameCategory[] = ["earn", "multiplay", "decorate", "other"];

const CAT_ICON: Record<string, string> = {
  all:       "🎮",
  earn:      "💰",
  multiplay: "👥",
  decorate:  "🎨",
  other:     "🎲",
};

function gameHrefWithToken(baseUrl: string, token: string | null): string {
  const u = String(baseUrl || "").trim();
  if (!u || !token) return u;
  const standaloneApi = (process.env.NEXT_PUBLIC_STANDALONE_GAMES_API_URL ?? "").trim();
  const apiQ = standaloneApi ? `&platformApi=${encodeURIComponent(standaloneApi)}` : "";
  return `${u.replace(/\/+$/, "") + "/"}?token=${encodeURIComponent(token)}${apiQ}`;
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

  const catLabel = (cat: GameCategory | "all"): string => {
    switch (cat) {
      case "earn":      return t("categoryEarn");
      case "multiplay": return t("categoryMultiplay");
      case "decorate":  return t("categoryDecorate");
      case "other":     return t("categoryOther");
      default:          return t("filterAll");
    }
  };

  const counts = useMemo(() => {
    const c = new Map<GameCategory, number>();
    for (const g of games) {
      const cat = (g.category ?? "other") as GameCategory;
      c.set(cat, (c.get(cat) ?? 0) + 1);
    }
    return c;
  }, [games]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = games.filter((g) => {
      const cat = (g.category ?? "other") as GameCategory;
      if (activeCat !== "all" && cat !== activeCat) return false;
      if (!q) return true;
      return `${g.title} ${g.description} ${g.tags.join(" ")}`.toLowerCase().includes(q);
    });
    if (sortBy === "popular") {
      list = [...list].sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0));
    } else if (sortBy === "rating") {
      list = [...list].sort((a, b) => (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0));
    }
    return list;
  }, [games, activeCat, query, sortBy]);

  const lastGame     = lastGameId ? games.find((g) => g.id === lastGameId) ?? null : null;
  const lastGameHref = lastGame ? gameHrefWithToken(lastGame.url, token) || lastGame.url : "";

  return (
    <div className="flex flex-col gap-6 text-zinc-100">

      {/* ── 검색 ── */}
      <div className="relative">
        <svg
          className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"
          width="16" height="16" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5"
        >
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-full rounded-xl border border-zinc-700/60 bg-zinc-800/80 py-3 pl-11 pr-4 text-sm text-zinc-100 placeholder:text-zinc-600 backdrop-blur-sm transition-colors focus:border-indigo-500/60 focus:bg-zinc-800 focus:outline-none"
        />
      </div>

      {/* ── 카테고리 칩 (가로 스크롤) ── */}
      <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
        {(["all", ...FILTER_CATEGORIES] as (GameCategory | "all")[]).map((cat) => {
          const n   = cat === "all" ? games.length : (counts.get(cat as GameCategory) ?? 0);
          const active = activeCat === cat;
          if (cat !== "all" && n === 0) return null;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCat(cat)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                active
                  ? "border-indigo-500 bg-indigo-600 text-white shadow-lg shadow-indigo-900/40"
                  : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
              }`}
            >
              <span>{CAT_ICON[cat]}</span>
              <span>{catLabel(cat)}</span>
              <span className={`text-xs ${active ? "text-indigo-200" : "text-zinc-600"}`}>
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── 이어하기 ── */}
      {lastGame && (
        <a
          href={lastGameHref}
          onClick={() => saveLastGameId(lastGame.id)}
          className="group flex items-center gap-4 rounded-xl border border-zinc-700/60 bg-zinc-800/60 p-4 transition-all hover:border-indigo-500/40 hover:bg-zinc-800"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-2xl shadow">
            {lastGame.emoji}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-indigo-400">
              {t("continueLabel")}
            </div>
            <div className="truncate text-sm font-semibold text-zinc-100">
              {lastGame.title}
            </div>
          </div>
          <span className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors group-hover:bg-indigo-500">
            {t("continueButton")}
          </span>
        </a>
      )}

      {/* ── 정렬 바 ── */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="appearance-none cursor-pointer rounded-lg border border-zinc-700 bg-zinc-800 py-1.5 pl-3 pr-8 text-xs font-medium text-zinc-300 focus:border-indigo-500 focus:outline-none"
          >
            <option value="default">{t("sortDefault")}</option>
            <option value="popular">{t("sortPopular")}</option>
            <option value="rating">⭐ 평점순</option>
          </select>
          <svg
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
            width="10" height="10" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="3"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
        <span className="ml-auto text-xs text-zinc-600">
          {t("gameCount", { count: filtered.length })}
        </span>
      </div>

      {/* ── 카드 그리드 ── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-800 py-20 text-center">
          <span className="text-5xl opacity-40">🔍</span>
          <p className="text-sm text-zinc-600">{t("emptyResult")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
      )}
    </div>
  );
}
