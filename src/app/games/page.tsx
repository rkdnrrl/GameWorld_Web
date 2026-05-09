type Game = {
  id: string;
  title: string;
  description: string;
  url: string;
  emoji: string;
  tags: string[];
};

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

function GameCard({ game }: { game: Game }) {
  return (
    <a
      href={game.url}
      className="group flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white transition-all hover:-translate-y-1 hover:border-blue-500 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-blue-500"
    >
      <div className="flex h-40 items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 text-6xl">
        {game.emoji}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h2 className="text-lg font-semibold tracking-tight">{game.title}</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {game.description}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {game.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="mt-4 flex items-center text-sm font-medium text-blue-600 group-hover:translate-x-1 group-hover:transition-transform">
          플레이하기 →
        </div>
      </div>
    </a>
  );
}
