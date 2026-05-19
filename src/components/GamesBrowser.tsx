"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import GameCard, { type Game, type GameCategory } from "@/components/GameCard";
import DungeonHomeScene from "@/components/DungeonHomeScene";
import AdBanner from "@/components/AdBanner";
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

  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<GameCategory | "all">("all");
  const [worldOpen, setWorldOpen] = useState(false);
  const [lastGameId, setLastGameId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setLastGameId(loadLastGameId());
    const sync = () => setToken(session.getToken());
    sync();
    window.addEventListener(SESSION_CHANGE_EVENT, sync);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, sync);
  }, []);

  // 카테고리별 게임 수
  const counts = useMemo(() => {
    const c = new Map<GameCategory, number>();
    for (const g of games) {
      const cat = (g.category ?? "other") as GameCategory;
      c.set(cat, (c.get(cat) ?? 0) + 1);
    }
    return c;
  }, [games]);

  // 필터 적용
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return games.filter((g) => {
      const cat = (g.category ?? "other") as GameCategory;
      if (activeCat !== "all" && cat !== activeCat) return false;
      if (!q) return true;
      const hay = `${g.title} ${g.description} ${g.tags.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [games, activeCat, query]);

  // 이어하기 카드
  const lastGame = lastGameId ? games.find((g) => g.id === lastGameId) ?? null : null;
  const lastGameHref = lastGame ? gameHrefWithToken(lastGame.url, token) : "";

  const catLabel = (cat: GameCategory): string => {
    switch (cat) {
      case "earn": return t("categoryEarn");
      case "multiplay": return t("categoryMultiplay");
      case "decorate": return t("categoryDecorate");
      default: return t("categoryOther");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 검색 + 필터 칩 */}
      <div className="flex flex-col gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveCat("all")}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              activeCat === "all"
                ? "bg-blue-600 text-white"
                : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            }`}
          >
            {t("filterAll")} <span className="ml-1 opacity-70">{games.length}</span>
          </button>
          {FILTER_CATEGORIES.map((cat) => {
            const n = counts.get(cat) ?? 0;
            if (n === 0) return null;
            const active = activeCat === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCat(cat)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                  active
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                }`}
              >
                {catLabel(cat)} <span className="ml-1 opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 이어하기 */}
      {lastGame && (
        <a
          href={lastGameHref || lastGame.url}
          onClick={() => saveLastGameId(lastGame.id)}
          className="group flex items-center gap-4 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 transition-all hover:border-blue-400 hover:shadow-md dark:border-blue-900 dark:from-blue-950/40 dark:to-indigo-950/40"
        >
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-3xl">
            {lastGame.emoji}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium uppercase tracking-wide text-blue-700 dark:text-blue-400">
              {t("continueLabel")}
            </div>
            <div className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {lastGame.title}
            </div>
            <div className="truncate text-sm text-zinc-600 dark:text-zinc-400">
              {lastGame.description}
            </div>
          </div>
          <div className="flex-shrink-0 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white group-hover:bg-blue-500">
            {t("continueButton")}
          </div>
        </a>
      )}

      {/* 카드 그리드 + 광고 (한 줄) */}
      <div className="flex items-start gap-4">
        <AdBanner slot="skyscraper" />
        <div className="min-w-0 flex-1">
          {filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-300 p-12 text-center text-sm text-zinc-500 dark:border-zinc-700">
              {t("emptyResult")}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((g) => (
                <GameCard key={g.id} game={g} />
              ))}
            </div>
          )}
        </div>
        <AdBanner slot="skyscraper" />
      </div>

      {/* 월드맵 모드 — 접이식 */}
      <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
        <button
          type="button"
          onClick={() => setWorldOpen((v) => !v)}
          aria-expanded={worldOpen}
          className="flex w-full items-center justify-between gap-3 p-4 text-left"
        >
          <div>
            <div className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {t("worldMapTitle")}
            </div>
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              {t("worldMapDesc")}
            </div>
          </div>
          <span className="flex-shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 dark:border-zinc-700 dark:text-zinc-200">
            {worldOpen ? t("worldMapClose") : t("worldMapOpen")}
          </span>
        </button>
        {worldOpen && (
          <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
            <DungeonHomeScene />
          </div>
        )}
      </div>

    </div>
  );
}
