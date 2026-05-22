import Link from "next/link";
import type { GameCategory } from "@/components/GameCard";

const CAT_BG: Record<string, string> = {
  earn:      "from-amber-400  to-orange-500",
  multiplay: "from-sky-500    to-blue-600",
  decorate:  "from-pink-400   to-rose-500",
  other:     "from-violet-500 to-purple-600",
};

type DevGame = {
  id: string; title: string; description: string | null;
  emoji: string; category: string; thumbnailUrl: string | null;
  playCount: number; likeCount: number; ratingAvg: number; ratingCount: number;
  publishedAt: string | null;
};

async function getDeveloperGames(nickname: string): Promise<{ nickname: string; games: DevGame[] } | null> {
  try {
    const base = process.env.BACKEND_URL || "http://localhost:4000";
    const res  = await fetch(`${base}/api/games/developer/${encodeURIComponent(nickname)}`, { next: { revalidate: 30 } });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export default async function DeveloperPage({
  params,
}: { params: Promise<{ nickname: string }> }) {
  const { nickname } = await params;
  const data = await getDeveloperGames(nickname);

  if (!data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-gray-50">
        <p className="text-lg text-gray-500">개발자를 찾을 수 없습니다.</p>
        <Link href="/games" className="text-sm text-blue-600 hover:underline">← 게임 목록</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">

        {/* 개발자 헤더 */}
        <div className="mb-8 flex items-center gap-5">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-4xl font-bold text-white shadow-lg">
            {nickname.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{nickname}</h1>
            <p className="text-sm text-gray-500">{data.games.length}개의 게임 출시</p>
          </div>
        </div>

        {/* 게임 목록 */}
        {data.games.length === 0 ? (
          <p className="text-center text-gray-400">아직 출시된 게임이 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.games.map((g) => {
              const cat = (g.category ?? "other") as GameCategory;
              const gradient = CAT_BG[cat] ?? CAT_BG.other;
              return (
                <Link
                  key={g.id}
                  href={`/games/${g.id}`}
                  className="group flex flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className={`relative flex aspect-video items-center justify-center overflow-hidden bg-gradient-to-br ${gradient}`}>
                    {g.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={g.thumbnailUrl} alt={g.title} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <span className="text-5xl drop-shadow">{g.emoji}</span>
                    )}
                  </div>
                  <div className="p-4">
                    <h2 className="font-semibold text-gray-900 line-clamp-1">{g.title}</h2>
                    {g.description && (
                      <p className="mt-1 text-xs text-gray-500 line-clamp-2">{g.description}</p>
                    )}
                    <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
                      {g.ratingCount > 0 && (
                        <span>⭐ {g.ratingAvg.toFixed(1)} ({g.ratingCount})</span>
                      )}
                      {g.playCount > 0 && <span>👁 {g.playCount.toLocaleString()}</span>}
                      {g.likeCount > 0 && <span>❤️ {g.likeCount}</span>}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
