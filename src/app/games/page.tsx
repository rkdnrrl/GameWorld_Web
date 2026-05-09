import GameCard, { type Game } from "@/components/GameCard";

// 게임 목록 — 추후 DB로 옮길 예정
const games: Game[] = [
  {
    id: "cube-multiplay",
    title: "큐브 멀티플레이",
    description: "친구들과 함께 즐기는 실시간 멀티플레이 큐브 게임",
    url: "http://54.116.133.27:3001",
    emoji: "🎲",
    tags: ["멀티플레이", "실시간"],
  },
];

export default function GamesPage() {
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
