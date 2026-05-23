"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import GameCard, { type Game, type GameCategory } from "@/components/GameCard";
import AdBanner from "@/components/AdBanner";
import FeaturedGamesCarousel from "@/components/FeaturedGamesCarousel";
import { useLocale } from "next-intl";
import { SESSION_CHANGE_EVENT, session, api, type GameCategory as ApiCategory } from "@/lib/api";
import { loadLastGameId, saveLastGameId } from "@/lib/lastGame";

type Props = { games: Game[] };
const DEFAULT_ICON = "🎮";

function gameHrefWithToken(baseUrl: string, token: string | null): string {
  const u = String(baseUrl || "").trim();
  if (!u || !token) return u;
  const api = (process.env.NEXT_PUBLIC_STANDALONE_GAMES_API_URL ?? "").trim();
  const q   = api ? `&platformApi=${encodeURIComponent(api)}` : "";
  return `${u.replace(/\/+$/, "") + "/"}?token=${encodeURIComponent(token)}${q}`;
}

export default function GamesBrowser({ games }: Props) {
  const t      = useTranslations("Games");
  const locale = useLocale();

  const [query,      setQuery]     = useState("");
  const [activeCat,  setActiveCat] = useState<GameCategory | "all">("all");
  const [sortBy,     setSortBy]    = useState<"default" | "popular" | "rating">("default");
  const [lastGameId,  setLastGameId]  = useState<string | null>(null);
  const [token,       setToken]       = useState<string | null>(null);
  const [categories,  setCategories]  = useState<ApiCategory[]>([]);

  useEffect(() => {
    setLastGameId(loadLastGameId());
    const sync = () => setToken(session.getToken());
    sync();
    window.addEventListener(SESSION_CHANGE_EVENT, sync);
    void api.getCategories().then((r) => setCategories(r.categories)).catch(() => {});
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, sync);
  }, []);

  const catLabel = (cat: GameCategory | "all") => {
    if (cat === "all") return t("filterAll");
    const c = categories.find((c) => c.slug === cat);
    if (c) return locale === "ko" ? c.labelKo : c.labelEn;
    return STATIC_CAT_LABEL[cat] ?? cat;
  };
  const STATIC_CAT_LABEL: Record<string,string> = {earn:"돈 버는 게임",multiplay:"멀티플레이",decorate:"꾸미기",other:"기타"};
  const catIcon = (cat: string) =>
    cat === "all" ? DEFAULT_ICON : (categories.find((c) => c.slug === cat)?.emoji ?? DEFAULT_ICON);

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const g of games) {
      const cat = g.category ?? "other";
      c.set(cat, (c.get(cat) ?? 0) + 1);
    }
    return c;
  }, [games]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = games.filter((g) => {
      if (activeCat !== "all" && (g.category ?? "other") !== activeCat) return false;
      if (!q) return true;
      const title = (g as Game & { titlesI18n?: Record<string,string> }).titlesI18n?.[locale] || g.title;
      const desc  = (g as Game & { descriptionsI18n?: Record<string,string> }).descriptionsI18n?.[locale] || g.description;
      return `${title} ${desc} ${g.tags.join(" ")}`.toLowerCase().includes(q);
    });
    if (sortBy === "popular") list = [...list].sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0));
    else if (sortBy === "rating") list = [...list].sort((a, b) => (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0));
    else list = [...list].sort((a, b) => (a.kind === "official" ? 0 : 1) - (b.kind === "official" ? 0 : 1));
    return list;
  }, [games, activeCat, query, sortBy]);

  const lastGame     = lastGameId ? games.find((g) => g.id === lastGameId) ?? null : null;
  const lastGameHref = lastGame ? gameHrefWithToken(lastGame.url, token) || lastGame.url : "";

  return (
    <div className="flex flex-col gap-0 text-gray-900">

      {/* ── 피처드 캐러셀 ───────────────────────────────────────────── */}
      {(() => { const f = games.filter((g) => g.isFeatured); return f.length > 0 ? <FeaturedGamesCarousel games={f} /> : null; })()}

      {/* ── 검색바 ──────────────────────────────────────────────────── */}
      <div className="relative mb-5">
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
          width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          type="search" value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-full rounded border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* ── 모바일 배너 광고 (sm 미만에서만) ───────────────────────── */}
      <div className="mb-4 flex justify-center sm:hidden">
        <AdBanner slot="banner" />
      </div>

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
            <p className="truncate text-sm font-semibold text-gray-900">
              {(lastGame as Game & { titlesI18n?: Record<string,string> }).titlesI18n?.[locale] || lastGame.title}
            </p>
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
            <option value="all">{DEFAULT_ICON} {t("filterAll")} ({games.length})</option>
            {categories.map((cat) => {
              const n = counts.get(cat.slug) ?? 0;
              if (n === 0) return null;
              return (
                <option key={cat.slug} value={cat.slug}>
                  {cat.emoji} {locale === "ko" ? cat.labelKo : cat.labelEn} ({n})
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
            <option value="rating">{t("sortRating")}</option>
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
