import type { Game } from "@/components/GameCard";
import AdBanner from "@/components/AdBanner";
import GamesBrowser from "@/components/GamesBrowser";

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

function filterVisibleGames(games: Game[]): Game[] {
  return games.filter((g) => !isHiddenGame(g));
}

async function getGames(): Promise<Game[]> {
  try {
    const backendUrl = process.env.BACKEND_URL || "http://localhost:4000";
    const res = await fetch(`${backendUrl}/api/games`, {
      next: { revalidate: 10 },
    });
    if (!res.ok) throw new Error("failed");
    const data = await res.json();
    return filterVisibleGames(data.games ?? []);
  } catch {
    return filterVisibleGames([
      {
        id: "cube-multiplay",
        title: "큐브 멀티플레이",
        description: "친구들과 함께 즐기는 실시간 멀티플레이 큐브 게임",
        url: "http://13.125.187.132:3001",
        emoji: "🎲",
        tags: ["멀티플레이", "실시간"],
        players: null,
        rooms: null,
        maxPlayers: 100,
        category: "multiplay",
      },
    ]);
  }
}

export default async function GamesPage() {
  const games = await getGames();

  return (
    <div className="flex min-h-screen items-start bg-[#f5f5f5]">

      {/* 왼쪽 스카이스크래퍼 — 레이아웃 흐름 안에 있어 컨텐츠를 밀어냄 */}
      <div className="hidden w-[160px] shrink-0 sm:block">
        <div className="sticky top-4 flex justify-center pt-4">
          <AdBanner slot="skyscraper" />
        </div>
      </div>

      {/* 메인 컨텐츠 */}
      <section className="min-w-0 flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <GamesBrowser games={games} />
      </section>

      {/* 오른쪽 스카이스크래퍼 */}
      <div className="hidden w-[160px] shrink-0 sm:block">
        <div className="sticky top-4 flex justify-center pt-4">
          <AdBanner slot="skyscraperRight" />
        </div>
      </div>

    </div>
  );
}
