"use client";

import { useCallback, useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { api, session, ApiError } from "@/lib/api";
import { useTranslations } from "next-intl";

interface Mission {
  id: string;
  label: string;
  icon: string;
  target: number;
  reward: number;
  progress: number;
  completed: boolean;
  rewardPaid: boolean;
}

export default function MissionsPage() {
  const t = useTranslations("Missions");

  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    const tk = session.getToken();
    if (!tk) return;
    setLoading(true);
    try {
      const res = await api.getDailyMissions(tk);
      setMissions(res.missions);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleClaim(id: string) {
    const tk = session.getToken();
    if (!tk) return;
    setClaiming(id);
    setNotice(null);
    try {
      const res = await api.claimMission(tk, id);
      setNotice({ kind: "ok", text: t("claimSuccess", { reward: res.reward }) });
      await load();
    } catch (err) {
      setNotice({ kind: "err", text: err instanceof ApiError ? err.message : t("claimFailed") });
    } finally {
      setClaiming(null);
    }
  }

  return (
    <section className="mx-auto w-full max-w-lg px-4 py-10 sm:px-6 sm:py-12">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-zinc-500">{t("subtitle")}</p>
      </div>

      {notice && (
        <div className={`mb-5 rounded-lg px-4 py-3 text-sm ${
          notice.kind === "ok"
            ? "bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200"
            : "bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200"
        }`}>
          {notice.text}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">{t("loading")}</p>
      ) : (
        <ul className="space-y-3">
          {missions.map((m) => {
            const pct = Math.min(100, (m.progress / m.target) * 100);
            const barColor = m.completed ? "bg-green-500" : "bg-blue-500";

            return (
              <li
                key={m.id}
                className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-2xl leading-none">{m.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="font-semibold">{m.label}</p>
                      <span className="text-sm font-bold text-yellow-600 dark:text-yellow-400 shrink-0">
                        {t("reward", { reward: m.reward })}
                      </span>
                    </div>

                    {/* 진행도 바 */}
                    <div className="mt-2 mb-1">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-zinc-500">
                      {t("progress", { current: m.progress, target: m.target })}
                    </p>
                  </div>
                </div>

                {/* 버튼 */}
                <div className="mt-4 flex justify-end">
                  {m.rewardPaid ? (
                    <span className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-400 dark:bg-zinc-800">
                      ✓ {t("claimed")}
                    </span>
                  ) : m.completed ? (
                    <button
                      onClick={() => handleClaim(m.id)}
                      disabled={claiming === m.id}
                      className="rounded-lg bg-yellow-500 px-4 py-1.5 text-sm font-bold text-white hover:bg-yellow-600 disabled:opacity-60 transition-colors animate-pulse"
                    >
                      {claiming === m.id ? t("claiming") : `🎁 ${t("claim")}`}
                    </button>
                  ) : (
                    <span className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800">
                      {t("progress", { current: m.progress, target: m.target })}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-10 text-center text-sm">
        <Link href="/" className="text-blue-600 hover:underline">{t("backHome")}</Link>
      </p>
    </section>
  );
}
