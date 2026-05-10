import GameCard, { type Game } from "@/components/GameCard";
import {
  GAME_CATEGORY_LABEL,
  GAME_CATEGORY_ORDER,
  groupGamesByCategory,
} from "./gameCategories";

async function getGames(): Promise<Game[]> {
  try {
    const backendUrl = process.env.BACKEND_URL || "http://localhost:4000";
    const res = await fetch(`${backendUrl}/api/games`, {
      next: { revalidate: 10 }, // 10초마다 갱신
    });
    if (!res.ok) throw new Error("failed");
    const data = await res.json();
    return data.games ?? [];
  } catch {
    // 플랫폼 서버 연결 실패 시 기본 목록 반환
    return [
      {
        id: "rock-clicker",
        title: "돌깨기 클리커",
        description: "바위를 연타해서 부수고 게임머니를 모으세요!",
        url: "http://13.125.187.132/rock-clicker",
        emoji: "🪨",
        tags: ["싱글플레이", "클리커"],
        players: null,
        rooms: null,
        category: "earn",
      },
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
    ];
  }
}

export default async function GamesPage() {
  const games = await getGames();
  const byCat = groupGamesByCategory(games);

  return (
    <section className="mx-auto w-full max-w-6xl min-w-0 px-4 py-12 sm:px-6 sm:py-16">
      <div className="mb-10 min-w-0">
        <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">
          게임
        </h1>
        <p className="mt-2 break-words text-sm text-zinc-500">
          종류별로 골라 플레이할 수 있어요
        </p>
      </div>

      <div className="space-y-14">
        {GAME_CATEGORY_ORDER.map((cat) => {
          const list = byCat.get(cat) ?? [];
          if (list.length === 0) return null;
          return (
            <div key={cat}>
              <h2 className="mb-4 break-words text-lg font-semibold tracking-tight text-zinc-900 sm:text-xl dark:text-zinc-50">
                {GAME_CATEGORY_LABEL[cat]}
              </h2>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((game) => (
                  <GameCard key={game.id} game={game} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
