"use client";

import { useEffect, useState, useMemo } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { session } from "@/lib/api";
import { useTranslations } from "next-intl";

type GameStat = {
  slug: string;
  title: string;
  emoji: string;
  category: string;
  status: string;
  thumbnailUrl: string | null;
  playCount: number;
  likeCount: number;
  ratingAvg: number;
  ratingCount: number;
  commentCount: number;
  publishedAt: string | null;
};

type Summary = {
  totalGames: number;
  publishedGames: number;
  totalPlays: number;
  totalLikes: number;
  totalRatings: number;
  totalComments: number;
};

type Sort = "default" | "plays" | "likes" | "rating";

const CAT_BG: Record<string, string> = {
  earn:      "from-amber-400 to-orange-500",
  multiplay: "from-sky-500 to-blue-600",
  decorate:  "from-pink-400 to-rose-500",
  other:     "from-violet-500 to-purple-600",
};

const STATUS_STYLE: Record<string, string> = {
  published: "bg-emerald-100 text-emerald-700",
  pending:   "bg-amber-100 text-amber-700",
  rejected:  "bg-red-100 text-red-700",
  hidden:    "bg-zinc-100 text-zinc-500",
};

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-700">
      <p className="text-2xl">{icon}</p>
      <p className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      <p className="mt-0.5 text-xs text-zinc-500">{label}</p>
    </div>
  );
}

export default function DevelopStatsPage() {
  const router = useRouter();
  const t = useTranslations("DevelopStats");

  const [summary, setSummary] = useState<Summary | null>(null);
  const [games,   setGames]   = useState<GameStat[] | null>(null);
  const [sort,    setSort]    = useState<Sort>("default");
  const [error,   setError]   = useState<string | null>(null);

  const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

  useEffect(() => {
    const tk = session.getToken();
    if (!tk) { router.replace("/login"); return; }
    fetch(`${apiBase}/api/games/mine/stats`, {
      headers: { Authorization: `Bearer ${tk}` },
    })
      .then((r) => r.json())
      .then((d: { summary: Summary; games: GameStat[] }) => {
        setSummary(d.summary);
        setGames(d.games);
      })
      .catch(() => setError("통계를 불러오지 못했습니다."));
  }, [router, apiBase]);

  const sorted = useMemo(() => {
    if (!games) return [];
    if (sort === "plays")  return [...games].sort((a, b) => b.playCount  - a.playCount);
    if (sort === "likes")  return [...games].sort((a, b) => b.likeCount  - a.likeCount);
    if (sort === "rating") return [...games].sort((a, b) => b.ratingAvg  - a.ratingAvg);
    return games;
  }, [games, sort]);

  // 최대값 계산 (프로그레스 바용)
  const maxPlays  = Math.max(1, ...(games?.map((g) => g.playCount)  ?? [1]));
  const maxLikes  = Math.max(1, ...(games?.map((g) => g.likeCount)  ?? [1]));
  const maxComments = Math.max(1, ...(games?.map((g) => g.commentCount) ?? [1]));

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      {/* 헤더 */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/develop" className="text-sm text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
            {t("backToDevelop")}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t("subtitle")}</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}

      {/* 로딩 */}
      {!summary && !error && (
        <p className="text-sm text-zinc-500">{t("loading")}</p>
      )}

      {summary && (
        <>
          {/* 요약 카드 4개 */}
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label={t("totalPlays")}    value={summary.totalPlays}    icon="👁" />
            <StatCard label={t("totalLikes")}    value={summary.totalLikes}    icon="❤️" />
            <StatCard label={t("totalComments")} value={summary.totalComments} icon="💬" />
            <StatCard label={t("publishedGames")} value={`${summary.publishedGames} / ${summary.totalGames}`} icon="🎮" />
          </div>

          {/* 정렬 버튼 */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {(["default", "plays", "likes", "rating"] as Sort[]).map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  sort === s
                    ? "bg-blue-600 text-white"
                    : "border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                {t(`sort${s.charAt(0).toUpperCase() + s.slice(1)}` as `sort${string}`)}
              </button>
            ))}
          </div>

          {/* 게임 목록 */}
          {sorted.length === 0 ? (
            <p className="py-16 text-center text-zinc-400">{t("noGames")}</p>
          ) : (
            <div className="space-y-3">
              {sorted.map((g) => (
                <div key={g.slug}
                  className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-700">
                  <div className="flex items-start gap-4 p-4">
                    {/* 썸네일 */}
                    <div className={`relative flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br ${CAT_BG[g.category] ?? CAT_BG.other}`}>
                      {g.thumbnailUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={g.thumbnailUrl} alt={g.title} className="h-full w-full object-cover" />
                        : <span className="text-2xl">{g.emoji}</span>
                      }
                    </div>

                    {/* 정보 */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-1">{g.title}</h3>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[g.status] ?? STATUS_STYLE.hidden}`}>
                          {t(`status_${g.status}` as `status_${string}`)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-zinc-400">
                        {g.publishedAt ? new Date(g.publishedAt).toLocaleDateString("ko-KR") : "—"}
                        {" · "}<code className="text-[10px]">{g.slug}</code>
                      </p>

                      {/* 통계 바 */}
                      <div className="mt-3 space-y-1.5">
                        <StatBar icon="👁" label={t("plays")}    value={g.playCount}    max={maxPlays}    color="bg-blue-400" />
                        <StatBar icon="❤️" label={t("likes")}    value={g.likeCount}    max={maxLikes}    color="bg-rose-400" />
                        <StatBar icon="💬" label={t("comments")} value={g.commentCount} max={maxComments} color="bg-violet-400" />
                      </div>

                      {/* 평점 */}
                      {g.ratingCount > 0 && (
                        <p className="mt-2 text-xs text-zinc-500">
                          ⭐ {g.ratingAvg.toFixed(1)} ({g.ratingCount}개 {t("ratingLabel")})
                        </p>
                      )}
                    </div>

                    {/* 게임 보기 링크 */}
                    {g.status === "published" && (
                      <Link href={`/games/${g.slug}`}
                        className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {t("viewGame")}
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatBar({ icon, label, value, max, color }: {
  icon: string; label: string; value: number; max: number; color: string;
}) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-2 text-[11px] text-zinc-500">
      <span className="w-4 text-center">{icon}</span>
      <div className="w-24 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700" style={{ height: 5 }}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 text-left font-medium text-zinc-700 dark:text-zinc-300">
        {value.toLocaleString()} <span className="font-normal text-zinc-400">{label}</span>
      </span>
    </div>
  );
}
