"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { session, SESSION_CHANGE_EVENT } from "@/lib/api";

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
  players: number | null;
  url: string;
  isFeatured: boolean;
  titlesI18n?: Record<string, string> | null;
}

interface AnnouncementItem {
  id: string;
  title: string;
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

interface GenreItem {
  slug: string;
  labelKo: string;
  labelEn: string;
  emoji: string;
}

export default function Home() {
  const t = useTranslations("Home");
  const locale = useLocale();

  const [games, setGames] = useState<GameItem[]>([]);
  const [notices, setNotices] = useState<AnnouncementItem[]>([]);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [hotPosts, setHotPosts] = useState<PostItem[]>([]);
  const [genres, setGenres] = useState<GenreItem[]>([]);
  const [cat, setCat] = useState<string>("all");
  const [dataReady, setDataReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [heroIdx, setHeroIdx] = useState(0);

  useEffect(() => {
    const sync = () => setToken(session.getToken());
    sync();
    window.addEventListener(SESSION_CHANGE_EVENT, sync);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, sync);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/games").then((r) => r.json()).catch(() => ({ games: [] })),
      fetch("/api/announcements?limit=5").then((r) => r.json()).catch(() => ({ items: [] })),
      fetch("/api/community?limit=8&sort=createdAt").then((r) => r.json()).catch(() => ({ items: [] })),
      fetch("/api/community?limit=5&sort=views").then((r) => r.json()).catch(() => ({ items: [] })),
      fetch("/api/genres").then((r) => r.json()).catch(() => ({ genres: [] })),
      fetch("/api/categories").then((r) => r.json()).catch(() => ({ categories: [] })),
    ]).then(([gd, nd, pd, hd, gnd, catd]) => {
      const catOrder: Record<string, number> = {};
      for (const c of catd.categories ?? []) catOrder[c.slug] = c.sortOrder;
      const sorted = (gd.games ?? []).slice().sort(
        (a: GameItem, b: GameItem) => (catOrder[a.category] ?? 999) - (catOrder[b.category] ?? 999),
      );
      setGames(sorted);
      setNotices(nd.items ?? []);
      setPosts(pd.items ?? []);
      setHotPosts(hd.items ?? []);
      setGenres(gnd.genres ?? []);
      setDataReady(true);
    });
  }, []);

  const heroGames = useMemo(
    () => games.filter((g) => g.thumbnailUrl).slice(0, 6),
    [games],
  );

  useEffect(() => {
    if (heroGames.length <= 1) return;
    const timer = setInterval(() => {
      setHeroIdx((i) => (i + 1) % heroGames.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [heroGames.length]);

  const hotGames = useMemo(
    () => [...games].sort((a, b) => b.playCount - a.playCount).slice(0, 8),
    [games],
  );

  const featured = useMemo(
    () => games.filter((g) => g.isFeatured).slice(0, 6),
    [games],
  );

  const latestGames = useMemo(() => {
    if (cat === "all") return games.slice(0, 12);
    return games.filter((g) => g.genre === cat).slice(0, 12);
  }, [cat, games]);

  function gameTitle(g: GameItem) {
    if (!g.titlesI18n) return g.title;
    return g.titlesI18n[locale] || g.titlesI18n.ko || g.title;
  }

  function playHref(url: string) {
    if (!token) return url;
    const standaloneApi = (process.env.NEXT_PUBLIC_STANDALONE_GAMES_API_URL ?? "").trim();
    const apiQ = standaloneApi ? `&platformApi=${encodeURIComponent(standaloneApi)}` : "";
    return `${url.replace(/\/+$/, "")}/?token=${encodeURIComponent(token)}${apiQ}`;
  }

  const hero = heroGames[heroIdx % Math.max(1, heroGames.length)];

  return (
    <div className="min-h-screen bg-[#0b1020] text-white">
      <div className="mx-auto max-w-[1280px] px-4 py-4 sm:px-6">
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link href="/world" className="rounded-lg bg-indigo-600 px-4 py-3 text-sm font-bold hover:bg-indigo-500">
            🎮 {t("enterHomeHub")}
          </Link>
          <Link href="/character" className="rounded-lg bg-[#1b2647] px-4 py-3 text-sm font-bold hover:bg-[#24315a]">
            {t("startNow")}
          </Link>
          <Link href="/worlds" className="rounded-lg bg-[#1b2647] px-4 py-3 text-sm font-bold hover:bg-[#24315a]">
            {t("viewAllGames")}
          </Link>
        </div>

        <div className="mb-5 overflow-hidden rounded-lg border border-white/10 bg-[#131b34]">
          {!hero ? (
            <div className="flex h-[280px] items-center justify-center text-sm text-white/60">{t("noGames")}</div>
          ) : (
            <div className="relative h-[280px] sm:h-[360px]">
              <img src={hero.thumbnailUrl!} alt={gameTitle(hero)} className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
                <div className="mb-1 text-xs font-semibold text-white/80">
                  {hero.kind === "official" ? t("official") : t("community")}
                </div>
                <h1 className="mb-2 text-2xl font-extrabold sm:text-4xl">{gameTitle(hero)}</h1>
                <p className="mb-4 line-clamp-2 max-w-[620px] text-sm text-white/80 sm:text-base">{hero.description}</p>
                <div className="flex gap-2">
                  <a href={playHref(hero.url)} target="_blank" rel="noreferrer" className="rounded-md bg-white px-4 py-2 text-sm font-bold text-black">
                    {t("playNow")}
                  </a>
                  <Link href={`/games/${hero.id}`} className="rounded-md border border-white/40 bg-white/10 px-4 py-2 text-sm font-bold">
                    {t("viewDetail")}
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mb-5 rounded-lg border border-white/10 bg-[#131b34] p-4">
          <div className="mb-3 text-sm font-bold">{t("gameCategoryHeader")}</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCat("all")}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${cat === "all" ? "bg-indigo-600" : "bg-white/10 hover:bg-white/20"}`}
            >
              {t("catAll")}
            </button>
            {genres.slice(0, 10).map((g) => (
              <button
                key={g.slug}
                onClick={() => setCat(g.slug)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${cat === g.slug ? "bg-indigo-600" : "bg-white/10 hover:bg-white/20"}`}
              >
                {locale === "ko" ? g.labelKo : g.labelEn}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
          <section className="rounded-lg border border-white/10 bg-[#131b34] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold">{t("latestGames")}</h2>
              <Link href="/games" className="text-sm text-indigo-300 hover:text-indigo-200">{t("viewAllGames")}</Link>
            </div>
            {!dataReady ? (
              <div className="py-10 text-center text-sm text-white/60">{t("loading")}</div>
            ) : latestGames.length === 0 ? (
              <div className="py-10 text-center text-sm text-white/60">{t("noGames")}</div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {latestGames.map((g) => (
                  <article key={g.id} className="overflow-hidden rounded-md border border-white/10 bg-[#0f172f]">
                    <div className="relative h-32 w-full bg-[#1a2547]">
                      {g.thumbnailUrl ? (
                        <img src={g.thumbnailUrl} alt={gameTitle(g)} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xl">{g.emoji || "🎮"}</div>
                      )}
                      <div className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[11px]">
                        {g.kind === "official" ? t("official") : t("community")}
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="mb-1 line-clamp-1 font-bold">{gameTitle(g)}</div>
                      <div className="mb-2 line-clamp-2 text-xs text-white/70">{g.description || "-"}</div>
                      <div className="mb-2 text-[11px] text-white/60">
                        {t("plays")}: {g.playCount.toLocaleString()} {g.players ? `· ${g.players} ${t("online")}` : ""}
                      </div>
                      <div className="flex gap-2">
                        <a href={playHref(g.url)} target="_blank" rel="noreferrer" className="rounded bg-indigo-600 px-2.5 py-1.5 text-xs font-bold hover:bg-indigo-500">
                          {t("playNow")}
                        </a>
                        <Link href={`/games/${g.id}`} className="rounded border border-white/20 px-2.5 py-1.5 text-xs font-bold hover:bg-white/10">
                          {t("viewDetail")}
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <section className="rounded-lg border border-white/10 bg-[#131b34] p-4">
              <div className="mb-3 text-base font-bold">{t("hotGames")}</div>
              {hotGames.length === 0 ? (
                <div className="text-sm text-white/60">{t("noGames")}</div>
              ) : (
                <ul className="space-y-2">
                  {hotGames.map((g, i) => (
                    <li key={g.id} className="flex items-center justify-between gap-2 rounded bg-white/5 px-2 py-1.5">
                      <div className="min-w-0 text-sm">
                        <span className="mr-2 text-indigo-300">{i + 1}</span>
                        <span className="truncate">{gameTitle(g)}</span>
                      </div>
                      <span className="text-xs text-white/60">{g.playCount.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-lg border border-white/10 bg-[#131b34] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-bold">{t("noticeSection")}</h2>
                <Link href="/announcements" className="text-sm text-indigo-300 hover:text-indigo-200">{t("viewAllNotice")}</Link>
              </div>
              {notices.length === 0 ? (
                <div className="text-sm text-white/60">{t("noNotice")}</div>
              ) : (
                <ul className="space-y-2 text-sm">
                  {notices.map((n) => (
                    <li key={n.id} className="line-clamp-1 rounded bg-white/5 px-2 py-1.5">{n.title}</li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-lg border border-white/10 bg-[#131b34] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-bold">{t("hotPosts")}</h2>
                <Link href="/community" className="text-sm text-indigo-300 hover:text-indigo-200">{t("viewAllCommunity")}</Link>
              </div>
              {hotPosts.length === 0 ? (
                <div className="text-sm text-white/60">{t("noPosts")}</div>
              ) : (
                <ul className="space-y-2">
                  {hotPosts.map((p) => (
                    <li key={p.id} className="rounded bg-white/5 px-2 py-1.5">
                      <div className="line-clamp-1 text-sm">{p.title}</div>
                      <div className="text-[11px] text-white/60">{p.user?.nickname || "-"} · {p.views}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>

        <section className="mt-4 rounded-lg border border-white/10 bg-[#131b34] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold">{t("communitySection")}</h2>
            <Link href="/community" className="text-sm text-indigo-300 hover:text-indigo-200">{t("viewAllCommunity")}</Link>
          </div>
          {posts.length === 0 ? (
            <div className="text-sm text-white/60">{t("noPosts")}</div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {posts.slice(0, 9).map((p) => (
                <article key={p.id} className="rounded border border-white/10 bg-[#0f172f] p-3">
                  <div className="mb-1 line-clamp-1 text-sm font-semibold">{p.title}</div>
                  <div className="text-[11px] text-white/60">
                    {p.user?.nickname || "-"} · {p._count?.comments ?? 0}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {featured.length > 0 && (
          <section className="mt-4 rounded-lg border border-white/10 bg-[#131b34] p-4">
            <div className="mb-3 text-base font-bold">{t("featuredGames")}</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((g) => (
                <article key={g.id} className="rounded border border-white/10 bg-[#0f172f] p-3">
                  <div className="mb-1 line-clamp-1 text-sm font-bold">{gameTitle(g)}</div>
                  <div className="mb-2 line-clamp-2 text-xs text-white/70">{g.description || "-"}</div>
                  <div className="flex gap-2">
                    <a href={playHref(g.url)} target="_blank" rel="noreferrer" className="rounded bg-indigo-600 px-2.5 py-1.5 text-xs font-bold hover:bg-indigo-500">
                      {t("playNow")}
                    </a>
                    <Link href={`/games/${g.id}`} className="rounded border border-white/20 px-2.5 py-1.5 text-xs font-bold hover:bg-white/10">
                      {t("viewDetail")}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
