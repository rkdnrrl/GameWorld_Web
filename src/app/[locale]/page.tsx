import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import GameCard, { type Game } from "@/components/GameCard";
import HeroVideoBackground from "@/components/HeroVideoBackground";
import PlazaButton from "@/components/PlazaButton";
import DailyCheckIn from "@/components/DailyCheckIn";
import OnlineCount from "@/components/OnlineCount";

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

  // 미니게임은 부수 콘텐츠 — 인기순 상위 3개만 작게
  const miniGames = [...games]
    .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-[#0b1020] text-white">

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-white/5">
        {/* 배경 비디오 — NEXT_PUBLIC_HERO_YOUTUBE_ID 환경변수로 YouTube 사용 가능 */}
        <HeroVideoBackground />

        {/* 어둠 오버레이 — 텍스트 가독성 보장 */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0b1020]/40 via-[#0b1020]/60 to-[#0b1020]" />
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/30 via-purple-900/20 to-transparent mix-blend-overlay" />

        <div className="relative mx-auto max-w-[1280px] px-4 py-20 text-center sm:px-6 sm:py-32">
          <h1 className="mb-5 whitespace-pre-line text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-6xl">
            {t("heroTitle")}
          </h1>
          <p className="mx-auto mb-6 max-w-2xl text-sm leading-relaxed text-white/70 sm:text-lg">
            {t("heroSub")}
          </p>
          <div className="mb-8 flex justify-center">
            <OnlineCount variant="hero" />
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <PlazaButton />
            <Link
              href="/world"
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-7 py-3.5 text-sm font-bold shadow-lg shadow-indigo-900/50 transition hover:bg-indigo-500 hover:shadow-indigo-900/70 active:scale-95 sm:text-base"
            >
              {t("enterAnyWorld")}
            </Link>
            <Link
              href="/worlds"
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-bold backdrop-blur-sm transition hover:bg-white/10 active:scale-95 sm:text-base"
            >
              {t("browseWorlds")}
            </Link>
            <Link
              href="/studio"
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-bold backdrop-blur-sm transition hover:bg-white/10 active:scale-95 sm:text-base"
            >
              {t("buildYourWorld")}
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6 sm:py-16">

        {/* ── 데일리 출석 보상 (로그인 유저만) ─────────────── */}
        <DailyCheckIn />

        {/* ── Features (3 카드) — 월드·만들기·음성 ─────────── */}
        <section className="mb-16 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { title: t("feat1Title"), desc: t("feat1Desc"), tint: "from-blue-500/20 to-cyan-600/20 border-blue-500/30" },
            { title: t("feat2Title"), desc: t("feat2Desc"), tint: "from-violet-500/20 to-purple-600/20 border-violet-500/30" },
            { title: t("feat3Title"), desc: t("feat3Desc"), tint: "from-pink-500/20 to-rose-600/20 border-pink-500/30" },
          ].map((f) => (
            <div
              key={f.title}
              className={`rounded-2xl border bg-gradient-to-br ${f.tint} p-6 backdrop-blur-sm`}
            >
              <h3 className="mb-3 text-lg font-bold sm:text-xl">{f.title}</h3>
              <p className="text-sm leading-relaxed text-white/70">{f.desc}</p>
            </div>
          ))}
        </section>

        {/* ── 월드 만들기 큰 CTA 카드 ──────────────────────── */}
        <section className="mb-12 overflow-hidden rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-600/30 via-purple-700/20 to-indigo-700/20 p-8 sm:p-12">
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-violet-300">STUDIO</p>
              <p className="whitespace-pre-line text-xl font-extrabold leading-tight sm:text-3xl">
                {t("devCardDesc")}
              </p>
            </div>
            <Link
              href="/studio"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-violet-600 px-7 py-3.5 text-sm font-bold shadow-lg shadow-violet-900/50 transition hover:bg-violet-500 active:scale-95 sm:text-base"
            >
              {t("devCardCta")}
            </Link>
          </div>
        </section>

        {/* ── 아바타 카드 ──────────────────────────────────── */}
        <section className="mb-16 rounded-2xl border border-white/10 bg-gradient-to-r from-amber-500/15 to-orange-600/15 p-6 sm:p-8">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="mb-2 text-xl font-bold sm:text-2xl">{t("avatarTitle")}</h3>
              <p className="text-sm text-white/70 sm:text-base">{t("avatarDesc")}</p>
            </div>
            <Link
              href="/character"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-500/20 px-6 py-3 text-sm font-bold text-amber-100 transition hover:bg-amber-500/30 active:scale-95"
            >
              {t("startNow")} →
            </Link>
          </div>
        </section>

        {/* ── 미니게임 (부수 콘텐츠, 작게) ──────────────────── */}
        {miniGames.length > 0 && (
          <section className="mb-8">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <h2 className="text-lg font-bold sm:text-xl">{t("miniGamesTitle")}</h2>
                <p className="mt-1 text-xs text-white/50 sm:text-sm">{t("miniGamesDesc")}</p>
              </div>
              <Link
                href="/games"
                className="text-sm text-indigo-300 transition hover:text-indigo-200"
              >
                {t("viewAllGames")}
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {miniGames.map((g) => (
                <GameCard key={g.id} game={g} />
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
