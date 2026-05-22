import { getTranslations } from "next-intl/server";
import Link from "next/link";
import GamePlayButton    from "@/components/GamePlayButton";
import GameComments     from "@/components/GameComments";
import GameDetailRating from "@/components/GameDetailRating";
import GameLikeButton     from "@/components/GameLikeButton";
import GameScreenshots    from "@/components/GameScreenshots";
import type { GameCategory } from "@/components/GameCard";

const CAT_BG: Record<string, string> = {
  earn:      "from-amber-400  to-orange-500",
  multiplay: "from-sky-500    to-blue-600",
  decorate:  "from-pink-400   to-rose-500",
  other:     "from-violet-500 to-purple-600",
};

type GameData = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  emoji: string;
  kind: string;
  category: GameCategory;
  tags: string[];
  thumbnailUrl: string | null;
  demoVideoUrl: string | null;
  playCount: number;
  likeCount: number;
  screenshots: string[];
  url: string;
  publishedAt: string | null;
  ownerNickname: string | null;
  ratingAvg: number;
  ratingCount: number;
};

async function getGame(slug: string): Promise<GameData | null> {
  try {
    const base = process.env.BACKEND_URL || "http://localhost:4000";
    const res  = await fetch(`${base}/api/games/${slug}`, { next: { revalidate: 30 } });
    if (!res.ok) return null;
    const { game } = await res.json();
    return game ?? null;
  } catch { return null; }
}

export default async function GameDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t    = await getTranslations("GameDetail");
  const tg   = await getTranslations("Games");
  const game = await getGame(slug);

  if (!game) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-[#f5f5f5]">
        <p className="text-lg text-gray-500">{t("notFound")}</p>
        <Link href="/games" className="text-sm text-blue-600 hover:underline">{t("back")}</Link>
      </div>
    );
  }

  const cat      = (game.category ?? "other") as GameCategory;
  const gradient = CAT_BG[cat] ?? CAT_BG.other;

  const catLabel =
    cat === "earn"      ? tg("categoryEarn")      :
    cat === "multiplay" ? tg("categoryMultiplay") :
    cat === "decorate"  ? tg("categoryDecorate")  : tg("categoryOther");

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">

        {/* 뒤로가기 */}
        <Link href="/games" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-800">
          {t("back")}
        </Link>

        {/* ── 게임 헤더 카드 ── */}
        <div className="mt-5 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">

          {/* 썸네일 */}
          <div className={`relative flex h-56 items-center justify-center overflow-hidden bg-gradient-to-br sm:h-72 ${gradient}`}>
            <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10" />
            <div className="pointer-events-none absolute -bottom-10 -left-10 h-48 w-48 rounded-full bg-black/10" />
            {game.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={game.thumbnailUrl} alt={game.title} className="h-full w-full object-cover" />
            ) : (
              <span className="relative text-8xl drop-shadow-lg">{game.emoji}</span>
            )}
          </div>

          {/* 정보 영역 */}
          <div className="p-6">
            {/* 배지 */}
            <div className="mb-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                {catLabel}
              </span>
              {game.kind === "official" && (
                <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-600">
                  {tg("kindOfficial")}
                </span>
              )}
            </div>

            {/* 제목 */}
            <h1 className="mb-1 text-2xl font-bold text-gray-900 sm:text-3xl">{game.title}</h1>

            {/* 제작자 */}
            {game.ownerNickname && (
              <p className="mb-3 text-sm text-gray-500">
                제작자:{" "}
                <Link href={`/developer/${encodeURIComponent(game.ownerNickname)}`}
                  className="font-medium text-blue-600 hover:underline">
                  {game.ownerNickname}
                </Link>
              </p>
            )}

            {/* 별점 (클라이언트 컴포넌트) */}
            <div className="mb-4">
              <GameDetailRating
                gameId={game.id}
                initialAvg={game.ratingAvg}
                initialCount={game.ratingCount}
              />
            </div>

            {/* 설명 */}
            {game.description && (
              <p className="mb-5 whitespace-pre-line text-sm leading-relaxed text-gray-600">
                {game.description}
              </p>
            )}

            {/* 태그 */}
            {game.tags.length > 0 && (
              <div className="mb-5 flex flex-wrap gap-1.5">
                {game.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-500">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* 통계 */}
            <div className="mb-6 flex flex-wrap gap-4 text-sm text-gray-400">
              {game.playCount > 0 && (
                <span>👁 {game.playCount.toLocaleString()} 플레이</span>
              )}
              {game.publishedAt && (
                <span>📅 {new Date(game.publishedAt).toLocaleDateString("ko-KR")}</span>
              )}
            </div>

            {/* ▶ 게임 시작 + ❤️ 좋아요 */}
            <div className="flex flex-wrap items-center gap-3">
              <GamePlayButton gameId={game.id} gameUrl={game.url} />
              <GameLikeButton gameId={game.id} initialCount={game.likeCount} />
            </div>
          </div>
        </div>

        {/* ── 스크린샷 갤러리 ── */}
        {game.screenshots && game.screenshots.length > 0 && (
          <GameScreenshots screenshots={game.screenshots} />
        )}

        {/* ── 데모 영상 ── */}
        {game.demoVideoUrl && (
          <div className="mt-5 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
            <div className="p-4">
              <h2 className="mb-3 text-sm font-semibold text-gray-700">🎬 데모 영상</h2>
              <video
                src={game.demoVideoUrl}
                controls
                className="w-full rounded-lg bg-black"
                style={{ maxHeight: "480px" }}
              />
            </div>
          </div>
        )}

        {/* ── 댓글 ── */}
        <div className="mt-5 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <GameComments slug={slug} />
        </div>

      </div>
    </div>
  );
}
