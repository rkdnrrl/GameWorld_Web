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
    if (sortBy === "popular") list = [...list].sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0));
    if (sortBy === "rating")  list = [...list].sort((a, b) => (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0));
    return list;
  }, [games, activeCat, query, sortBy]);

  const lastGame     = lastGameId ? games.find((g) => g.id === lastGameId) ?? null : null;
  const lastGameHref = lastGame ? gameHrefWithToken(lastGame.url, token) || lastGame.url : "";

  const tabs = (["all", ...FILTER_CATEGORIES] as (GameCategory | "all")[]).filter(
    (cat) => cat === "all" || (counts.get(cat as GameCategory) ?? 0) > 0,
  );

  return (
    <div className="flex flex-col text-zinc-100">

      {/* ══ 검색 바 ══════════════════════════════════════════════ */}
      <div className="relative mb-6">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"
          width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-full rounded-lg border border-zinc-700/50 bg-zinc-800/70 py-3 pl-11 pr-4 text-sm text-zinc-100 placeholder:text-zinc-600 backdrop-blur-sm transition-colors focus:border-blue-500/70 focus:bg-zinc-800 focus:outline-none"
        />
      </div>

      {/* ══ 카테고리 탭 (Unity 언더라인 스타일) ═════════════════ */}
      <div className="mb-6 border-b border-zinc-800">
        <nav className="flex overflow-x-auto [&::-webkit-scrollbar]:hidden">
          {tabs.map((cat) => {
            const n      = cat === "all" ? games.length : (counts.get(cat as GameCategory) ?? 0);
            const active = activeCat === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCat(cat)}
                className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors duration-150 ${
                  active
                    ? "border-blue-500 text-white"
                    : "border-transparent text-zinc-500 hover:border-zinc-600 hover:text-zinc-200"
                }`}
              >
                <span>{CAT_ICON[cat]}</span>
                <span>{catLabel(cat)}</span>
                <span className={`text-xs ${active ? "text-blue-300/60" : "text-zinc-700"}`}>{n}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* ══ 이어하기 ════════════════════════════════════════════ */}
      {lastGame && (
        <a
          href={lastGameHref}
          onClick={() => saveLastGameId(lastGame.id)}
          className="group mb-6 flex items-center gap-4 rounded-lg border border-zinc-700/40 bg-zinc-800/50 p-4 transition-all hover:border-blue-500/30 hover:bg-zinc-800"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-blue-500 to-violet-600 text-xl shadow">
            {lastGame.emoji}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-400">{t("continueLabel")}</p>
            <p className="truncate text-sm font-semibold">{lastGame.title}</p>
          </div>
          <span className="shrink-0 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors group-hover:bg-blue-500">
            {t("continueButton")}
          </span>
        </a>
      )}

      {/* ══ 정렬 / 카운트 ════════════════════════════════════════ */}
      <div className="mb-5 flex items-center justify-between">
        <div className="relative">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="appearance-none cursor-pointer rounded border border-zinc-700 bg-zinc-800/80 py-1.5 pl-3 pr-7 text-xs font-medium text-zinc-300 focus:border-blue-500 focus:outline-none"
          >
            <option value="default">{t("sortDefault")}</option>
            <option value="popular">{t("sortPopular")}</option>
            <option value="rating">⭐ 평점순</option>
          </select>
          <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500"
            width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
        <span className="text-xs text-zinc-600">{t("gameCount", { count: filtered.length })}</span>
      </div>

      {/* ══ 카드 그리드 ═════════════════════════════════════════ */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <span className="text-5xl opacity-20">🔍</span>
          <p className="text-sm text-zinc-600">{t("emptyResult")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((g) => <GameCard key={g.id} game={g} />)}
        </div>
      )}
    </div>
  );
}
