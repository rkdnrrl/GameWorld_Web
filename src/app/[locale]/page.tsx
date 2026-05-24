"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface GameItem {
  id: string;
  slug: string;
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

  // ── 데이터 로드 ──
  useEffect(() => {
    Promise.all([
      fetch("/api/games").then(r => r.json()).catch(() => ({ games: [] })),
      fetch("/api/announcements?limit=6").then(r => r.json()).catch(() => ({ items: [] })),
      fetch("/api/community?limit=10&sort=createdAt").then(r => r.json()).catch(() => ({ items: [] })),
      fetch("/api/community?limit=5&sort=views").then(r => r.json()).catch(() => ({ items: [] })),
      fetch("/api/genres").then(r => r.json()).catch(() => ({ genres: [] })),
    ]).then(([gd, nd, pd, hd, gnd]) => {
      setGames(gd.games ?? []);
      setNotices(nd.items ?? []);
      setPosts(pd.items ?? []);
      setHotPosts(hd.items ?? []);
      setGenres(gnd.genres ?? []);
      setDataReady(true);
    });
  }, []);

  // ── 파생 데이터 ──
  const featured     = games.filter(g => g.isFeatured).slice(0, 3);
  const filteredGames = cat === "all"
    ? games
    : games.filter(g => g.genre === cat);
  const latestGames  = filteredGames.slice(0, 9);
  const hotGames     = [...games].sort((a, b) => b.playCount - a.playCount).slice(0, 7);

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
                  <a
                    href={g.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50"
                  >
                    <span className={`w-4 shrink-0 text-center text-xs font-bold ${
                      i < 3 ? "text-blue-600" : "text-gray-400"
                    }`}>{i + 1}</span>
                    <span className="shrink-0 text-base">{g.emoji}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-gray-700">{gameTitle(g)}</span>
                  </a>
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
                  <a
                    key={g.id}
                    href={g.url}
                    target="_blank"
                    rel="noopener noreferrer"
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
                  </a>
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
                  <a
                    key={g.id}
                    href={g.url}
                    target="_blank"
                    rel="noopener noreferrer"
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
                  </a>
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
      <div className="sticky bottom-0 z-10 border-t border-gray-200 bg-white px-2 py-1.5 shadow-md lg:hidden">
        <div className="flex justify-around">
          {([
            { key: "all", label: t("catAll"), emoji: "📋" },
            { key: "earn", label: t("catEarn"), emoji: CAT_EMOJI.earn },
            { key: "multiplay", label: t("catMultiplay"), emoji: CAT_EMOJI.multiplay },
            { key: "decorate", label: t("catDecorate"), emoji: CAT_EMOJI.decorate },
            { key: "other", label: t("catOther"), emoji: CAT_EMOJI.other },
          ] as { key: Category; label: string; emoji: string }[]).map(({ key, label, emoji }) => (
            <button
              key={key}
              onClick={() => setCat(key)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[0.62rem] transition-colors ${
                cat === key ? "text-blue-600 font-semibold" : "text-gray-500"
              }`}
            >
              <span className="text-base">{emoji}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
