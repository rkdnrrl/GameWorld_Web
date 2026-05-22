"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import GameCard, { type Game, type GameCategory } from "@/components/GameCard";
import { SESSION_CHANGE_EVENT, session } from "@/lib/api";
import { loadLastGameId, saveLastGameId } from "@/lib/lastGame";

type Props = { games: Game[] };

const FILTER_CATEGORIES: GameCategory[] = ["earn", "multiplay", "decorate", "other"];

function gameHrefWithToken(baseUrl: string, token: string | null): string {
  const u = String(baseUrl || "").trim();
  if (!u || !token) return u;
  const standaloneApi = (process.env.NEXT_PUBLIC_STANDALONE_GAMES_API_URL ?? "").trim();
  const apiQ = standaloneApi ? `&platformApi=${encodeURIComponent(standaloneApi)}` : "";
  const root = u.replace(/\/+$/, "") + "/";
  return `${root}?token=${encodeURIComponent(token)}${apiQ}`;
}

export default function GamesBrowser({ games }: Props) {
  const t = useTranslations("Games");

  const [query,     setQuery]     = useState("");
  const [activeCat, setActiveCat] = useState<GameCategory | "all">("all");
  const [sortBy,    setSortBy]    = useState<"default" | "popular">("default");
  const [lastGameId, setLastGameId] = useState<string | null>(null);
  const [token,     setToken]     = useState<string | null>(null);

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
      const hay = `${g.title} ${g.description} ${g.tags.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
    if (sortBy === "popular") {
      list = [...list].sort((a, b) => (b.players ?? -1) - (a.players ?? -1));
    }
    return list;
  }, [games, activeCat, query, sortBy]);

  const lastGame     = lastGameId ? games.find((g) => g.id === lastGameId) ?? null : null;
  const lastGameHref = lastGame ? gameHrefWithToken(lastGame.url, token) || lastGame.url : "";

  return (
    <div className="flex flex-col gap-8">

      {/* ── 히어로 검색 ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-8 shadow-xl">
        {/* 배경 장식 */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -bottom-12 -left-12 h-48 w-48 rounded-full bg-white/5" />

        <div className="relative">
          <h1 className="mb-1 text-3xl font-bold tracking-tight text-white">{t("title")}</h1>
          <p className="mb-6 text-sm text-white/60">{t("subtitle")}</p>
          <div className="relative">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40"
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
              className="w-full rounded-xl border border-white/20 bg-white/10 py-3 pl-10 pr-4 text-sm text-white backdrop-blur-sm placeholder:text-white/40 transition-colors focus:border-white/40 focus:bg-white/15 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* ── 이어하기 ── */}
      {lastGame && (
        <a
          href={lastGameHref}
          onClick={() => saveLastGameId(lastGame.id)}
          className="group flex items-center gap-4 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-violet-50 p-4 transition-all hover:border-indigo-300 hover:shadow-md dark:border-indigo-900/50 dark:from-indigo-950/30 dark:to-violet-950/30"
        >
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-3xl shadow-md">
            {lastGame.emoji}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">
              {t("continueLabel")}
            </div>
            <div className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {lastGame.title}
            </div>
          </div>
          <span className="flex-shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow transition-colors group-hover:bg-indigo-500">
            {t("continueButton")}
          </span>
        </a>
      )}

      {/* ── 필터 바 ── */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* 카테고리 드롭다운 */}
        <div className="relative">
          <select
            value={activeCat}
            onChange={(e) => setActiveCat(e.target.value as GameCategory | "all")}
            className="appearance-none cursor-pointer rounded-xl border border-zinc-200 bg-white py-2 pl-4 pr-9 text-sm font-medium text-zinc-800 shadow-sm transition-colors hover:border-zinc-300 focus:border-indigo-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="all">{t("filterAll")} ({games.length})</option>
            {FILTER_CATEGORIES.map((cat) => {
              const n = counts.get(cat) ?? 0;
              if (n === 0) return null;
              return (
                <option key={cat} value={cat}>
                  {catLabel(cat)} ({n})
                </option>
              );
            })}
          </select>
          <svg
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400"
            width="12" height="12" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2.5"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>

        {/* 정렬 드롭다운 */}
        <div className="relative">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "default" | "popular")}
            className="appearance-none cursor-pointer rounded-xl border border-zinc-200 bg-white py-2 pl-4 pr-9 text-sm font-medium text-zinc-800 shadow-sm transition-colors hover:border-zinc-300 focus:border-indigo-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="default">{t("sortDefault")}</option>
            <option value="popular">{t("sortPopular")}</option>
          </select>
          <svg
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400"
            width="12" height="12" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2.5"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>

        {/* 결과 수 */}
        <span className="ml-auto text-sm text-zinc-400">
          {t("gameCount", { count: filtered.length })}
        </span>
      </div>

      {/* ── 카드 그리드 ── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-200 py-20 text-center dark:border-zinc-700">
          <span className="text-5xl">🔍</span>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{t("emptyResult")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
      )}
    </div>
  );
}
