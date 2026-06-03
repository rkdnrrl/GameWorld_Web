import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import GameCard, { type Game } from "@/components/GameCard";
import FeaturedGamesCarousel from "@/components/FeaturedGamesCarousel";

/** 게임 목록에서 숨김 */
const HIDDEN_GAME_IDS = new Set<string>(["rock-clicker", "alchemy"]);
const HIDDEN_TITLE = "돌깨기 클리커";
const HIDDEN_URL_PATTERN = /rock-clicker/i;

function isHiddenGame(g: Game): boolean {
  if (HIDDEN_GAME_IDS.has(g.id)) return true;
  if (g.title?.trim() === HIDDEN_TITLE) return true;
  if (g.url && HIDDEN_URL_PATTERN.test(g.url)) return true;
  return false;
}

async function getGames(): Promise<Game[]> {
  try {
    const backendUrl = process.env.BACKEND_URL || "http://localhost:4000";
    const res = await fetch(`${backendUrl}/api/games`, { next: { revalidate: 30 } });
    if (!res.ok) return [];
    const data = await res.json();
    const games: Game[] = data.games ?? [];
    return games.filter((g) => !isHiddenGame(g));
  } catch {
    return [];
  }
}

export default async function Home() {
  const t = await getTranslations("Home");
  const games = await getGames();

  // 캐러셀: isFeatured 우선, 없으면 official 상위 5개
  const featured = games.filter((g) => g.isFeatured).slice(0, 5);
  const featuredOrFallback =
    featured.length > 0 ? featured : games.filter((g) => g.kind === "official").slice(0, 5);

  // 인기 게임: playCount 상위 6개
  const hot = [...games]
    .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))
    .slice(0, 6);

  return (
    <div className="min-h-screen bg-[#0b1020] text-white">
      <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 sm:py-10">

        {/* ── Hero ─────────────────────────────────────────── */}
        <section className="mb-12 text-center sm:mb-16">
          <h1 className="mb-4 whitespace-pre-line text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl sm:leading-[1.15]">
            {t("heroTitle")}
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-sm text-white/70 sm:text-base">
            {t("heroSub")}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/character"
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold shadow-lg shadow-indigo-900/40 transition hover:bg-indigo-500 hover:shadow-indigo-900/60 active:scale-95 sm:text-base"
            >
              🚀 {t("startNow")}
            </Link>
            <Link
              href="/games"
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-6 py-3 text-sm font-bold transition hover:bg-white/10 active:scale-95 sm:text-base"
            >
              {t("browsGames")}
            </Link>
            <Link
              href="/world"
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-6 py-3 text-sm font-bold transition hover:bg-white/10 active:scale-95 sm:text-base"
            >
              🎮 {t("enterHomeHub")}
            </Link>
          </div>
        </section>

        {/* ── Features (3 카드) ─────────────────────────────── */}
        <section className="mb-12 grid grid-cols-1 gap-4 sm:mb-16 sm:grid-cols-3">
          {[
            { icon: "🎒", title: t("feat1Title"), desc: t("feat1Desc"), tint: "from-amber-500/20 to-orange-600/20 border-amber-500/30" },
            { icon: "🛠️", title: t("feat2Title"), desc: t("feat2Desc"), tint: "from-pink-500/20 to-rose-600/20 border-pink-500/30" },
            { icon: "🤝", title: t("feat3Title"), desc: t("feat3Desc"), tint: "from-blue-500/20 to-cyan-600/20 border-blue-500/30" },
          ].map((f) => (
            <div
              key={f.title}
              className={`rounded-2xl border bg-gradient-to-br ${f.tint} p-5 backdrop-blur-sm`}
            >
              <div className="mb-3 text-3xl">{f.icon}</div>
              <h3 className="mb-2 text-base font-bold sm:text-lg">{f.title}</h3>
              <p className="text-sm leading-relaxed text-white/70">{f.desc}</p>
            </div>
          ))}
        </section>

        {/* ── Featured Games 캐러셀 ─────────────────────────── */}
        {featuredOrFallback.length > 0 && (
          <section className="mb-12 sm:mb-16">
            <h2 className="mb-4 text-xl font-bold sm:text-2xl">{t("featuredGames")}</h2>
            <FeaturedGamesCarousel games={featuredOrFallback} />
          </section>
        )}

        {/* ── Hot Games (top 6) ─────────────────────────────── */}
        {hot.length > 0 && (
          <section className="mb-12 sm:mb-16">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold sm:text-2xl">{t("hotGames")}</h2>
              <Link
                href="/games"
                className="text-sm text-indigo-300 transition hover:text-indigo-200"
              >
                {t("viewAllGames")}
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
              {hot.map((g) => (
                <GameCard key={g.id} game={g} />
              ))}
            </div>
          </section>
        )}

        {/* ── Developer CTA ────────────────────────────────── */}
        <section className="mb-8 rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-600/20 to-purple-700/20 p-6 sm:p-8">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="whitespace-pre-line text-base font-bold leading-snug sm:text-xl">
              {t("devCardDesc")}
            </p>
            <Link
              href="/develop"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold shadow-lg shadow-violet-900/40 transition hover:bg-violet-500 active:scale-95"
            >
              {t("devCardCta")}
            </Link>
          </div>
        </section>

      </div>
    </div>
  );
}
