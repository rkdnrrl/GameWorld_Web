"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { api, session } from "@/lib/api";
import { useTranslations } from "next-intl";

interface Compendium {
  lifetimeTotal: number;
  byType: { type: string; count: number; coins: number }[];
  byRarity: { rarity: string; count: number }[];
  topItems: { name: string; emoji: string; type: string; rarity: string; count: number }[];
}

const RARITY_COLOR: Record<string, string> = {
  common:    "text-zinc-500  bg-zinc-100  dark:bg-zinc-800",
  rare:      "text-blue-600  bg-blue-50   dark:bg-blue-900/30",
  epic:      "text-purple-600 bg-purple-50 dark:bg-purple-900/30",
  legendary: "text-yellow-600 bg-yellow-50 dark:bg-yellow-900/30",
};

const RARITY_ORDER = ["legendary", "epic", "rare", "common"];
const TYPE_ORDER   = ["fish", "artifact", "crystal", "creature", "debris", "cosmic", "scrap"];

export default function CompendiumPage() {
  const t = useTranslations("Compendium");
  const [data, setData] = useState<Compendium | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tk = session.getToken();
    if (!tk) { setLoading(false); return; }
    api.getFishingCompendium(tk)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const total = data?.byType.reduce((s, r) => s + r.count, 0) ?? 0;

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-12">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-zinc-500">{t("subtitle")}</p>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">{t("loading")}</p>
      ) : !data || total === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
          <p className="text-zinc-500">{t("empty")}</p>
          <Link href="/games" className="mt-3 inline-block text-sm text-blue-600 hover:underline">
            🎣 게임하러 가기
          </Link>
        </div>
      ) : (
        <div className="space-y-6">

          {/* 누적 수확 */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500">{t("lifetimeTotal")}</p>
            <p className="mt-1 text-4xl font-black tabular-nums text-blue-600 dark:text-blue-400">
              {(data.lifetimeTotal || total).toLocaleString()}
              <span className="ml-1 text-lg font-normal text-zinc-400">{t("totalUnit")}</span>
            </p>
          </div>

          {/* 희귀도별 */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
            <h2 className="mb-3 text-sm font-semibold text-zinc-500">{t("byRarity")}</h2>
            <div className="flex flex-wrap gap-2">
              {RARITY_ORDER.map((rarity) => {
                const row = data.byRarity.find((r) => r.rarity === rarity);
                if (!row) return null;
                return (
                  <div key={rarity} className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${RARITY_COLOR[rarity] ?? ""}`}>
                    <span>{t(`rarity${rarity}` as Parameters<typeof t>[0])}</span>
                    <span className="font-bold tabular-nums">{row.count.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 종류별 */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
            <h2 className="mb-3 text-sm font-semibold text-zinc-500">{t("byType")}</h2>
            <ul className="space-y-2">
              {TYPE_ORDER.map((type) => {
                const row = data.byType.find((r) => r.type === type);
                if (!row) return null;
                const pct = total > 0 ? (row.count / total) * 100 : 0;
                return (
                  <li key={type}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium">{t(`type${type}` as Parameters<typeof t>[0])}</span>
                      <span className="tabular-nums text-zinc-500">
                        {row.count.toLocaleString()} {t("countUnit")}
                        <span className="ml-2 text-xs text-zinc-400">
                          {row.coins.toLocaleString()}{t("coinsUnit")}
                        </span>
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
                      <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* TOP 10 */}
          {data.topItems.length > 0 && (
            <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
              <h2 className="mb-3 text-sm font-semibold text-zinc-500">{t("topItems")}</h2>
              <ol className="space-y-2">
                {data.topItems.map((item, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <span className="w-5 text-center text-xs font-bold text-zinc-400">{i + 1}</span>
                    <span className="text-xl">{item.emoji}</span>
                    <span className="flex-1 truncate text-sm font-medium">{item.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RARITY_COLOR[item.rarity] ?? ""}`}>
                      {t(`rarity${item.rarity}` as Parameters<typeof t>[0])}
                    </span>
                    <span className="tabular-nums text-sm text-zinc-500">
                      {item.count}{t("countUnit")}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

        </div>
      )}

      <p className="mt-10 text-center text-sm">
        <Link href="/" className="text-blue-600 hover:underline">{t("backHome")}</Link>
      </p>
    </section>
  );
}
