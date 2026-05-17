"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

interface DungeonEntry { rank: number; nickname: string; floor: number; kills: number; }
interface FishingEntry { rank: number; nickname: string; count: number; }

const RANK_BADGE: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export default function LeaderboardPage() {
  const t = useTranslations("Leaderboard");

  const [tab, setTab] = useState<"dungeon" | "fishing">("dungeon");
  const [dungeon, setDungeon] = useState<DungeonEntry[]>([]);
  const [fishing, setFishing] = useState<FishingEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});

  async function fetchTab(kind: "dungeon" | "fishing") {
    if (loaded[kind]) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/leaderboard/${kind}`);
      const d = await r.json();
      if (kind === "dungeon") setDungeon(d.items ?? []);
      else setFishing(d.items ?? []);
      setLoaded((p) => ({ ...p, [kind]: true }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void fetchTab("dungeon"); }, []);

  function onTab(t: "dungeon" | "fishing") {
    setTab(t);
    void fetchTab(t);
  }

  return (
    <section className="mx-auto w-full max-w-xl px-4 py-10 sm:px-6 sm:py-12">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">{t("title")}</h1>

      {/* 탭 */}
      <div className="mb-6 flex gap-2">
        {(["dungeon", "fishing"] as const).map((k) => (
          <button
            key={k}
            onClick={() => onTab(k)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === k
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
            }`}
          >
            {k === "dungeon" ? `⚔️ ${t("tabDungeon")}` : `🎣 ${t("tabFishing")}`}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">{t("loading")}</p>
      ) : tab === "dungeon" ? (
        dungeon.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("empty")}</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500">{t("rank")}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500">{t("nickname")}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-500">{t("dungeonFloor")}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-500">{t("dungeonKills")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700/50">
                {dungeon.map((row) => (
                  <tr
                    key={row.rank}
                    className={`bg-white dark:bg-zinc-900 ${row.rank <= 3 ? "font-semibold" : ""}`}
                  >
                    <td className="px-4 py-3 text-lg">
                      {RANK_BADGE[row.rank] ?? <span className="text-sm text-zinc-500">{row.rank}</span>}
                    </td>
                    <td className="px-4 py-3 truncate max-w-[8rem]">{row.nickname}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-purple-600 dark:text-purple-400">
                      B{row.floor}{t("floorUnit")}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-500">
                      {row.kills.toLocaleString()}{t("killUnit")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        fishing.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("empty")}</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500">{t("rank")}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500">{t("nickname")}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-500">{t("fishingCount")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700/50">
                {fishing.map((row) => (
                  <tr
                    key={row.rank}
                    className={`bg-white dark:bg-zinc-900 ${row.rank <= 3 ? "font-semibold" : ""}`}
                  >
                    <td className="px-4 py-3 text-lg">
                      {RANK_BADGE[row.rank] ?? <span className="text-sm text-zinc-500">{row.rank}</span>}
                    </td>
                    <td className="px-4 py-3 truncate max-w-[10rem]">{row.nickname}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-blue-600 dark:text-blue-400">
                      {row.count.toLocaleString()}{t("catchUnit")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      <p className="mt-10 text-center text-sm">
        <Link href="/" className="text-blue-600 hover:underline">{t("backHome")}</Link>
      </p>
    </section>
  );
}
