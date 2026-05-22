import Link from "next/link";
import type { GameCategory } from "@/components/GameCard";
import DeveloperProfileEdit from "@/components/DeveloperProfileEdit";

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
};

type DevProfile = {
  nickname: string;
  bio: string | null;
  profileImageUrl: string | null;
  websiteUrl: string | null;
  games: DevGame[];
};

async function getDeveloper(nickname: string): Promise<DevProfile | null> {
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
  const data = await getDeveloper(nickname);

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

        {/* ── 프로필 헤더 ── */}
        <div className="mb-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">

            {/* 아바타 */}
            <div className="shrink-0">
              {data.profileImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.profileImageUrl}
                  alt={data.nickname}
                  className="h-24 w-24 rounded-2xl object-cover ring-2 ring-gray-200"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-4xl font-bold text-white shadow">
                  {data.nickname.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            {/* 정보 */}
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">{data.nickname}</h1>
                <span className="rounded-full bg-indigo-100 px-3 py-0.5 text-xs font-semibold text-indigo-600">
                  개발자
                </span>
                {/* 내 프로필이면 편집 버튼 (클라이언트 컴포넌트) */}
                <DeveloperProfileEdit
                  nickname={data.nickname}
                  initialBio={data.bio}
                  initialWebsiteUrl={data.websiteUrl}
                />
              </div>

              {data.bio && (
                <p className="mt-2 text-sm leading-relaxed text-gray-600 whitespace-pre-line">
                  {data.bio}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-500">
                <span>🎮 {data.games.length}개 게임</span>
                {data.websiteUrl && (
                  <a href={data.websiteUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-600 hover:underline">
                    🔗 {data.websiteUrl.replace(/^https?:\/\//, '')}
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── 게임 목록 ── */}
        <h2 className="mb-4 text-lg font-semibold text-gray-800">출시한 게임</h2>

        {data.games.length === 0 ? (
          <p className="text-center text-gray-400 py-16">아직 출시된 게임이 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.games.map((g) => {
              const cat      = (g.category ?? "other") as GameCategory;
              const gradient = CAT_BG[cat] ?? CAT_BG.other;
              return (
                <Link key={g.id} href={`/games/${g.id}`}
                  className="group flex flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className={`relative flex aspect-video items-center justify-center overflow-hidden bg-gradient-to-br ${gradient}`}>
                    {g.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={g.thumbnailUrl} alt={g.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <span className="text-5xl drop-shadow transition-transform duration-300 group-hover:scale-110">{g.emoji}</span>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 line-clamp-1">{g.title}</h3>
                    {g.description && (
                      <p className="mt-1 text-xs text-gray-500 line-clamp-2">{g.description}</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-400">
                      {g.ratingCount > 0 && <span>⭐ {g.ratingAvg.toFixed(1)}</span>}
                      {g.playCount   > 0 && <span>👁 {g.playCount.toLocaleString()}</span>}
                      {g.likeCount   > 0 && <span>❤️ {g.likeCount}</span>}
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
