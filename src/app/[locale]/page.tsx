"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import { session, SESSION_CHANGE_EVENT } from "@/lib/api";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface GameItem {
  id: string;
  title: string;
  description: string;
  emoji: string;
  category: string;
  genre?: string | null;
  kind: "official" | "community";
  thumbnailUrl: string | null;
  playCount: number;
  likeCount: number;
  ratingAvg: number | null;
  ratingCount: number;
  isFeatured: boolean;
  players: number | null;
  url: string;
  titlesI18n?: Record<string, string> | null;
  descriptionsI18n?: Record<string, string> | null;
}

interface AnnouncementItem {
  id: string;
  title: string;
  kind: string;
  pinned: boolean;
  createdAt: string;
}

interface PostItem {
  id: string;
  title: string;
  category: string;
  views: number;
  createdAt: string;
  user: { nickname: string };
  _count: { comments: number };
}

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

interface GenreItem { slug: string; labelKo: string; labelEn: string; emoji: string; }

function timeShort(iso: string, t: (k: string, v?: Record<string, string | number>) => string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600)  return t("minutesAgo", { n: Math.floor(diff / 60) });
  if (diff < 86400) return t("hoursAgo",   { n: Math.floor(diff / 3600) });
  return t("daysAgo", { n: Math.floor(diff / 86400) });
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
}

// ─── 섹션 헤더 컴포넌트 ───────────────────────────────────────────────────────

function SectionHeader({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between border-b-2 border-blue-600 pb-1.5">
      <h2 className="text-[0.95rem] font-bold text-gray-800">{title}</h2>
      {href && linkLabel && (
        <Link href={href} className="text-xs text-blue-600 hover:underline">
          {linkLabel}
        </Link>
      )}
    </div>
  );
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function Home() {
  const t = useTranslations("Home");
  const locale = useLocale();

  const [games, setGames]           = useState<GameItem[]>([]);
  const [notices, setNotices]       = useState<AnnouncementItem[]>([]);
  const [posts, setPosts]           = useState<PostItem[]>([]);
  const [hotPosts, setHotPosts]     = useState<PostItem[]>([]);
  const [genres, setGenres]         = useState<GenreItem[]>([]);
  const [cat, setCat]               = useState<string>("all");
  const [dataReady, setDataReady]   = useState(false);
  const [heroIdx, setHeroIdx]       = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);
  const [token, setToken]           = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setToken(session.getToken());
    sync();
    window.addEventListener(SESSION_CHANGE_EVENT, sync);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, sync);
  }, []);

  // ── 데이터 로드 ──
  useEffect(() => {
    Promise.all([
      fetch("/api/games").then(r => r.json()).catch(() => ({ games: [] })),
      fetch("/api/announcements?limit=6").then(r => r.json()).catch(() => ({ items: [] })),
      fetch("/api/community?limit=10&sort=createdAt").then(r => r.json()).catch(() => ({ items: [] })),
      fetch("/api/community?limit=5&sort=views").then(r => r.json()).catch(() => ({ items: [] })),
      fetch("/api/genres").then(r => r.json()).catch(() => ({ genres: [] })),
      fetch("/api/categories").then(r => r.json()).catch(() => ({ categories: [] })),
    ]).then(([gd, nd, pd, hd, gnd, catd]) => {
      // 게임 유형 sortOrder 맵 생성
      const catOrder: Record<string, number> = {};
      for (const c of (catd.categories ?? [])) catOrder[c.slug] = c.sortOrder;
      // games를 유형 sortOrder 순으로 정렬
      const sorted = (gd.games ?? []).slice().sort(
        (a: GameItem, b: GameItem) => (catOrder[a.category] ?? 999) - (catOrder[b.category] ?? 999)
      );
      setGames(sorted);
      setNotices(nd.items ?? []);
      setPosts(pd.items ?? []);
      setHotPosts(hd.items ?? []);
      setGenres(gnd.genres ?? []);
      setDataReady(true);
    });
  }, []);

  // ── 히어로 캐러셀 자동 슬라이드 ──
  const heroGames = games.filter(g => g.kind === "official" && g.thumbnailUrl);
  useEffect(() => {
    if (heroGames.length <= 1 || heroPaused) return;
    const id = setInterval(() => setHeroIdx(i => (i + 1) % heroGames.length), 5000);
    return () => clearInterval(id);
  }, [heroGames.length, heroPaused]);

  // ── 파생 데이터 ──
  const featured     = games.filter(g => g.isFeatured).slice(0, 3);
  const filteredGames = cat === "all"
    ? games
    : games.filter(g => g.genre === cat);
  const latestGames  = filteredGames.slice(0, 9);
  const hotGames     = [...games].sort((a, b) => b.playCount - a.playCount).slice(0, 7);

  function playHref(url: string) {
    if (!token) return url;
    const standaloneApi = (process.env.NEXT_PUBLIC_STANDALONE_GAMES_API_URL ?? "").trim();
    const apiQ = standaloneApi ? `&platformApi=${encodeURIComponent(standaloneApi)}` : "";
    return `${url.replace(/\/+$/, "")}/` + `?token=${encodeURIComponent(token)}${apiQ}`;
  }

  function gameTitle(g: GameItem) {
    if (g.titlesI18n && typeof g.titlesI18n === "object") {
      const i18n = g.titlesI18n as Record<string, string>;
      return i18n[locale] || i18n["ko"] || g.title;
    }
    return g.title;
  }

  // ─── 렌더 ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f2f3f5]">

      {/* ── 공지 티커 바 ── */}
      {notices.length > 0 && (
        <div className="bg-[#1a1f36] px-4 py-1.5">
          <div className="mx-auto flex max-w-[1280px] items-center gap-3 overflow-hidden">
            <span className="shrink-0 rounded bg-blue-500 px-1.5 py-0.5 text-[0.65rem] font-bold text-white">
              {t("noticeBadge")}
            </span>
            <div className="flex gap-6 overflow-x-auto whitespace-nowrap scrollbar-none text-[0.78rem] text-gray-300">
              {notices.slice(0, 3).map(n => (
                <Link key={n.id} href="/announcements" className="hover:text-white shrink-0">
                  {n.title}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 히어로 캐러셀 ── */}
      {token && (
        <div className="mx-auto max-w-[1280px] px-3 pt-3 sm:px-4">
          <Link
            href="/world"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-indigo-500"
          >
            🎮 {t("enterHomeHub")}
          </Link>
        </div>
      )}

      {heroGames.length > 0 && (
        <div
          className="relative w-full overflow-hidden bg-black"
          style={{ aspectRatio: "16/6" }}
          onMouseEnter={() => setHeroPaused(true)}
          onMouseLeave={() => setHeroPaused(false)}
        >
          {/* 슬라이드 */}
          {heroGames.map((g, i) => (
            <div
              key={g.id}
              className="absolute inset-0 transition-opacity duration-700"
              style={{ opacity: i === heroIdx % heroGames.length ? 1 : 0, pointerEvents: i === heroIdx % heroGames.length ? "auto" : "none" }}
            >
              <img src={g.thumbnailUrl!} alt={gameTitle(g)} className="h-full w-full object-cover" />
              {/* 그라디언트 */}
              <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/30 to-transparent" />
              {/* 텍스트 */}
              <div className="absolute bottom-0 left-0 p-6 sm:p-10">
                <span className={`mb-2 inline-block rounded px-2 py-0.5 text-[0.65rem] font-bold text-white ${g.kind === "official" ? "bg-blue-500" : "bg-purple-500"}`}>
                  {g.kind === "official" ? t("official") : t("community")}
                </span>
                <h2 className="mb-1 text-2xl font-extrabold text-white drop-shadow-lg sm:text-4xl">{gameTitle(g)}</h2>
                {g.description && (
                  <p className="mb-4 max-w-md truncate text-sm text-gray-300 sm:text-base">{g.description}</p>
                )}
                <div className="flex gap-3">
                  <a
                    href={playHref(g.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-gray-900 shadow hover:bg-gray-100"
                  >
                    ▶ {t("playNow")}
                  </a>
                  <Link
                    href={`/games/${g.id}`}
                    className="rounded-xl border border-white/40 bg-white/10 px-5 py-2.5 text-sm font-bold text-white backdrop-blur hover:bg-white/20"
                  >
                    {t("viewDetail")}
                  </Link>
                </div>
              </div>
            </div>
          ))}

          {/* 좌우 버튼 */}
          {heroGames.length > 1 && (
            <>
              <button
                onClick={() => setHeroIdx(i => (i - 1 + heroGames.length) % heroGames.length)}
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/70"
              >‹</button>
              <button
                onClick={() => setHeroIdx(i => (i + 1) % heroGames.length)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/70"
              >›</button>
            </>
          )}

          {/* 점 인디케이터 */}
          {heroGames.length > 1 && (
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
              {heroGames.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setHeroIdx(i)}
                  className={`h-1.5 rounded-full transition-all ${i === heroIdx % heroGames.length ? "w-5 bg-white" : "w-1.5 bg-white/40"}`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 메인 레이아웃 (3컬럼) ── */}
      <div className="mx-auto flex max-w-[1280px] gap-4 px-3 py-4 sm:px-4">

        {/* ─────── LEFT SIDEBAR ─────── */}
        <aside className="hidden w-44 shrink-0 lg:block">

          {/* 인기 게임 TOP */}
          <div className="rounded bg-white shadow-sm">
            <div className="border-b border-gray-200 px-3 py-2">
              <span className="text-xs font-bold text-gray-700">{t("hotGames")}</span>
            </div>
            <ul className="divide-y divide-gray-100 py-1">
              {hotGames.map((g, i) => (
                <li key={g.id}>
                  <Link
                    href={`/games/${g.id}`}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50"
                  >
                    <span className={`w-4 shrink-0 text-center text-xs font-bold ${
                      i < 3 ? "text-blue-600" : "text-gray-400"
                    }`}>{i + 1}</span>
                    <span className="shrink-0 text-base">{g.emoji}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-gray-700">{gameTitle(g)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* ─────── CENTER MAIN ─────── */}
        <main className="min-w-0 flex-1">

          {/* ── 추천 게임 (Featured) ── */}
          {featured.length > 0 && (
            <section className="mb-4">
              <SectionHeader title={t("featuredGames")} href="/games" linkLabel={t("viewAllGames")} />
              <div className={`grid gap-3 ${featured.length >= 2 ? "sm:grid-cols-2" : "grid-cols-1"} ${featured.length >= 3 ? "lg:grid-cols-3" : ""}`}>
                {featured.map(g => (
                  <Link
                    key={g.id}
                    href={`/games/${g.id}`}
                    className="group relative overflow-hidden rounded-lg shadow-sm"
                    style={{ aspectRatio: "16/7" }}
                  >
                    {g.thumbnailUrl ? (
                      <img
                        src={g.thumbnailUrl}
                        alt={gameTitle(g)}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-600 to-purple-700 text-4xl">
                        {g.emoji}
                      </div>
                    )}
                    {/* 그라디언트 오버레이 */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    {/* 배지 */}
                    <div className="absolute left-2 top-2 flex items-center gap-1">
                      <span className={`rounded px-1.5 py-0.5 text-[0.6rem] font-bold text-white ${
                        g.kind === "official" ? "bg-blue-500" : "bg-purple-500"
                      }`}>
                        {g.kind === "official" ? t("official") : t("community")}
                      </span>
                      {g.players !== null && g.players > 0 && (
                        <span className="rounded bg-green-600 px-1.5 py-0.5 text-[0.6rem] font-bold text-white">
                          🟢 {g.players}{t("online")}
                        </span>
                      )}
                    </div>
                    {/* 하단 텍스트 */}
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <p className="truncate text-sm font-bold text-white">{gameTitle(g)}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-gray-300">
                        <span>▶ {g.playCount.toLocaleString()}</span>
                        {g.ratingAvg && <span>⭐ {g.ratingAvg}</span>}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* ── 카테고리 탭 + 최신 게임 ── */}
          <section className="mb-4">
            <div className="mb-3 flex items-center justify-between border-b-2 border-blue-600 pb-0">
              <div className="flex flex-wrap">
                <button
                  onClick={() => setCat("all")}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-[2px] ${
                    cat === "all"
                      ? "border-blue-600 text-blue-700 bg-white"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {t("catAll")}
                </button>
                {genres.map((g) => (
                  <button
                    key={g.slug}
                    onClick={() => setCat(g.slug)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-[2px] ${
                      cat === g.slug
                        ? "border-blue-600 text-blue-700 bg-white"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {g.emoji} {locale === "ko" ? g.labelKo : g.labelEn}
                  </button>
                ))}
              </div>
              <Link href="/games" className="pb-1.5 text-xs text-blue-600 hover:underline">
                {t("viewAllGames")}
              </Link>
            </div>

            {!dataReady ? (
              <div className="flex h-32 items-center justify-center text-sm text-gray-400">
                <span className="animate-pulse">{t("loading")}</span>
              </div>
            ) : latestGames.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">{t("noGames")}</p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {latestGames.map(g => (
                  <Link
                    key={g.id}
                    href={`/games/${g.id}`}
                    className="group rounded-lg bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden"
                  >
                    {/* 썸네일 */}
                    <div className="relative overflow-hidden" style={{ aspectRatio: "16/9" }}>
                      {g.thumbnailUrl ? (
                        <img
                          src={g.thumbnailUrl}
                          alt={gameTitle(g)}
                          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-700 to-slate-900 text-3xl">
                          {g.emoji}
                        </div>
                      )}
                      <span className={`absolute left-1.5 top-1.5 rounded px-1 py-0.5 text-[0.58rem] font-bold text-white ${
                        g.kind === "official" ? "bg-blue-500" : "bg-purple-500"
                      }`}>
                        {g.kind === "official" ? t("official") : t("community")}
                      </span>
                    </div>
                    {/* 정보 */}
                    <div className="px-2.5 py-2">
                      <p className="truncate text-[0.82rem] font-semibold text-gray-800">{gameTitle(g)}</p>
                      <div className="mt-0.5 flex items-center gap-2 text-[0.7rem] text-gray-400">
                        <span>▶ {g.playCount.toLocaleString()}</span>
                        {g.ratingAvg && <span>⭐ {g.ratingAvg}</span>}
                        {g.players !== null && g.players > 0 && (
                          <span className="ml-auto font-semibold text-green-600">🟢 {g.players}</span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* ── 자유게시판 미리보기 ── */}
          <section className="mb-4">
            <SectionHeader
              title={t("communitySection")}
              href="/community"
              linkLabel={t("viewAllCommunity")}
            />
            {!dataReady ? (
              <div className="h-24 animate-pulse rounded bg-gray-100" />
            ) : posts.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">{t("noPosts")}</p>
            ) : (
              <div className="rounded bg-white shadow-sm">
                <table className="w-full text-[0.8rem]">
                  <tbody className="divide-y divide-gray-100">
                    {posts.map(p => {
                      const CAT_LABEL: Record<string, string> = {
                        free:     t("communityFree"),
                        qna:      t("communityQna"),
                        tips:     t("communityTips"),
                        showcase: t("communityShowcase"),
                      };
                      const CAT_COLOR: Record<string, string> = {
                        free:     "text-blue-600 bg-blue-50",
                        qna:      "text-amber-600 bg-amber-50",
                        tips:     "text-green-600 bg-green-50",
                        showcase: "text-purple-600 bg-purple-50",
                      };
                      return (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="py-2 pl-3 pr-2 w-[3rem]">
                            <span className={`rounded px-1.5 py-0.5 text-[0.62rem] font-medium ${CAT_COLOR[p.category] ?? "text-gray-500 bg-gray-100"}`}>
                              {CAT_LABEL[p.category] ?? p.category}
                            </span>
                          </td>
                          <td className="py-2 pr-2">
                            <Link href="/community" className="line-clamp-1 text-gray-800 hover:text-blue-600 hover:underline">
                              {p.title}
                            </Link>
                          </td>
                          <td className="hidden py-2 pr-2 text-gray-400 sm:table-cell whitespace-nowrap w-[5rem] text-right">
                            {p.user.nickname}
                          </td>
                          <td className="py-2 pr-2 text-gray-400 whitespace-nowrap w-[3rem] text-center">
                            {p._count.comments > 0 && (
                              <span className="text-blue-500 font-medium">[{p._count.comments}]</span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-gray-400 whitespace-nowrap w-[4.5rem] text-right hidden sm:table-cell">
                            {timeShort(p.createdAt, t)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="border-t border-gray-100 px-3 py-2 text-right">
                  <Link href="/community" className="text-xs text-blue-600 hover:underline">
                    {t("viewAllCommunity")}
                  </Link>
                </div>
              </div>
            )}
          </section>

          {/* ── 모바일 전용: 공지사항 ── */}
          <section className="md:hidden mb-4">
            <SectionHeader title={t("noticeSection")} href="/announcements" linkLabel={t("viewAllNotice")} />
            <div className="rounded bg-white shadow-sm">
              {notices.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-gray-400">{t("noNotice")}</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {notices.map(n => (
                    <li key={n.id}>
                      <Link
                        href="/announcements"
                        className="flex items-center justify-between px-3 py-2 hover:bg-gray-50"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {n.pinned && <span className="shrink-0 text-xs">📌</span>}
                          <span className="truncate text-[0.82rem] text-gray-700">{n.title}</span>
                        </div>
                        <span className="ml-2 shrink-0 text-[0.7rem] text-gray-400">{fmtDate(n.createdAt)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </main>

        {/* ─────── RIGHT SIDEBAR ─────── */}
        <aside className="hidden w-60 shrink-0 md:block">

          {/* 공지사항 */}
          <div className="mb-4 rounded bg-white shadow-sm">
            <SectionHeader title={t("noticeSection")} href="/announcements" linkLabel={t("viewAllNotice")} />
            {notices.length === 0 ? (
              <p className="px-3 py-3 text-center text-xs text-gray-400">{t("noNotice")}</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {notices.map(n => (
                  <li key={n.id}>
                    <Link
                      href="/announcements"
                      className="flex items-start gap-1.5 px-3 py-2 hover:bg-gray-50"
                    >
                      {n.pinned && <span className="mt-0.5 shrink-0 text-xs">📌</span>}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-gray-700 hover:text-blue-600">{n.title}</p>
                        <p className="mt-0.5 text-[0.68rem] text-gray-400">{fmtDate(n.createdAt)}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* HOT 게시글 */}
          <div className="mb-4 rounded bg-white shadow-sm">
            <SectionHeader title={t("hotPosts")} href="/community" linkLabel={t("viewAllCommunity")} />
            {hotPosts.length === 0 ? (
              <p className="px-3 py-3 text-center text-xs text-gray-400">{t("noPosts")}</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {hotPosts.map((p, i) => (
                  <li key={p.id}>
                    <Link
                      href="/community"
                      className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50"
                    >
                      <span className={`w-4 shrink-0 text-center text-xs font-bold ${i < 3 ? "text-red-500" : "text-gray-400"}`}>
                        {i + 1}
                      </span>
                      <p className="flex-1 truncate text-xs text-gray-700 hover:text-blue-600">{p.title}</p>
                      {p._count.comments > 0 && (
                        <span className="shrink-0 text-[0.65rem] text-blue-500 font-semibold">[{p._count.comments}]</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 플랫폼 정보 카드 */}
          <div className="rounded bg-gradient-to-br from-blue-600 to-purple-700 p-4 text-white shadow-sm">
            <p className="mb-1 text-xs font-bold opacity-80">ALP Platform</p>
            <p className="mb-3 whitespace-pre-line text-sm font-semibold leading-snug">
              {t("devCardDesc")}
            </p>
            <Link
              href="/develop"
              className="block rounded bg-white/20 px-3 py-1.5 text-center text-xs font-semibold hover:bg-white/30 transition-colors"
            >
              {t("devCardCta")}
            </Link>
          </div>
        </aside>
      </div>

      {/* ── 모바일 하단: 빠른 카테고리 탭 ── */}
      {genres.length > 0 && (
        <div className="sticky bottom-0 z-10 border-t border-gray-200 bg-white px-2 py-1.5 shadow-md lg:hidden">
          <div className="flex justify-around overflow-x-auto">
            <button
              onClick={() => setCat("all")}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[0.62rem] transition-colors shrink-0 ${
                cat === "all" ? "text-blue-600 font-semibold" : "text-gray-500"
              }`}
            >
              <span className="text-base">📋</span>
              <span>{t("catAll")}</span>
            </button>
            {genres.map((g) => (
              <button
                key={g.slug}
                onClick={() => setCat(g.slug)}
                className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[0.62rem] transition-colors shrink-0 ${
                  cat === g.slug ? "text-blue-600 font-semibold" : "text-gray-500"
                }`}
              >
                <span className="text-base">{g.emoji}</span>
                <span>{locale === "ko" ? g.labelKo : g.labelEn}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
