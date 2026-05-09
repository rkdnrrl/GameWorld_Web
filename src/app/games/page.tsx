import GameCard, { type Game } from "@/components/GameCard";

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
        id: "cube-multiplay",
        title: "큐브 멀티플레이",
        description: "친구들과 함께 즐기는 실시간 멀티플레이 큐브 게임",
        url: "http://13.125.187.132:3001",
        emoji: "🎲",
        tags: ["멀티플레이", "실시간"],
        players: null,
        rooms: null,
        maxPlayers: 100,
      },
    ];
  }
}

export default async function GamesPage() {
  const games = await getGames();

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16">
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight">게임</h1>
        <p className="mt-2 text-sm text-zinc-500">
          ALP에서 즐길 수 있는 게임들
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {games.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </div>
    </section>
  );
}
