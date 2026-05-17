"use client";

import { useEffect, useState, useCallback } from "react";
import { Link } from "@/i18n/navigation";
import { api, session, ApiError, type EquipmentItem } from "@/lib/api";
import { useTranslations } from "next-intl";

// 티어별 수리 비용 (서버와 동일)
const REPAIR_COST_PER_DUR: Record<string, number> = {
  common: 5, rare: 12, epic: 30, legendary: 70,
};

// 강화석 메타
const STONE_META = [
  { id: "stone_common",  emoji: "🪨", name: "일반 강화석", rate: 60 },
  { id: "stone_rare",    emoji: "💎", name: "희귀 강화석", rate: 70 },
  { id: "crystal_magic", emoji: "🔮", name: "마법 수정",   rate: 80 },
  { id: "shard_legend",  emoji: "✨", name: "전설 파편",   rate: 85 },
];

const SLOT_EMOJI: Record<string, string> = {
  weapon: "⚔️", head: "🪖", chest: "🧥",
  pants: "👖", gloves: "🧤", boots: "👢", accessory: "💍",
};
const TIER_COLOR: Record<string, string> = {
  common: "text-zinc-500", rare: "text-blue-500",
  epic: "text-purple-500", legendary: "text-yellow-500",
};

function repairCost(eq: EquipmentItem): number {
  const max = eq.stats.durabilityMax ?? 0;
  const cur = eq.stats.durability ?? max;
  const costPer = REPAIR_COST_PER_DUR[eq.tier] ?? 5;
  return Math.ceil((max - cur) * costPer);
}

function DurBar({ cur, max }: { cur: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 100;
  const color = pct > 60 ? "bg-green-500" : pct > 30 ? "bg-amber-400" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="h-2 w-28 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular-nums text-zinc-500">{cur}/{max}</span>
    </div>
  );
}

export default function EquipmentPage() {
  const t = useTranslations("Equipment");

  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // 강화 모달
  const [enhanceTarget, setEnhanceTarget] = useState<EquipmentItem | null>(null);
  const [enhancing, setEnhancing] = useState(false);

  // 수리 확인
  const [repairTarget, setRepairTarget] = useState<EquipmentItem | null>(null);
  const [repairing, setRepairing] = useState(false);

  const load = useCallback(async () => {
    const tk = session.getToken();
    if (!tk) return;
    setLoading(true);
    try {
      const [eqRes, stRes] = await Promise.all([
        api.getEquipment(tk),
        api.getEnhancementStock(tk),
      ]);
      setEquipment(eqRes.equipment);
      setStock(stRes.stock);
    } catch {
      setNotice({ kind: "err", text: t("loading") });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  async function handleEnhance(stoneId: string) {
    if (!enhanceTarget) return;
    const tk = session.getToken();
    if (!tk) return;
    setEnhancing(true);
    setNotice(null);
    try {
      const res = await api.enhanceEquipment(tk, enhanceTarget.id, stoneId);
      setEnhanceTarget(null);
      setNotice({ kind: res.success ? "ok" : "err", text: res.success ? t("enhanceSuccess") : t("enhanceFail") });
      await load();
    } catch (err) {
      setNotice({ kind: "err", text: err instanceof ApiError ? err.message : t("enhanceFailed") });
    } finally {
      setEnhancing(false);
    }
  }

  async function handleRepair() {
    if (!repairTarget) return;
    const tk = session.getToken();
    if (!tk) return;
    const cost = repairCost(repairTarget);
    const maxDur = repairTarget.stats.durabilityMax ?? 0;
    setRepairing(true);
    setNotice(null);
    try {
      await api.repairEquipment(tk, repairTarget.id, maxDur, cost);
      setRepairTarget(null);
      setNotice({ kind: "ok", text: t("repairSuccess") });
      await load();
    } catch (err) {
      setNotice({ kind: "err", text: err instanceof ApiError ? err.message : t("repairFailed") });
    } finally {
      setRepairing(false);
    }
  }

  if (!session.getToken() && !loading) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-zinc-500">로그인이 필요합니다.</p>
        <Link href="/login" className="mt-4 inline-block text-blue-600 hover:underline">로그인 →</Link>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-12">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">{t("title")}</h1>

      {/* 보유 강화석 */}
      <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <p className="mb-3 text-sm font-semibold text-zinc-500">{t("stockTitle")}</p>
        <div className="flex flex-wrap gap-3">
          {STONE_META.map((s) => (
            <div key={s.id} className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800">
              <span>{s.emoji}</span>
              <span className="font-medium">{s.name}</span>
              <span className={`tabular-nums font-bold ${(stock[s.id] ?? 0) > 0 ? "text-blue-600 dark:text-blue-400" : "text-zinc-400"}`}>
                ×{stock[s.id] ?? 0}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 알림 */}
      {notice && (
        <div className={`mb-5 rounded-lg px-4 py-3 text-sm ${
          notice.kind === "ok"
            ? "bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200"
            : "bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200"
        }`}>
          {notice.text}
        </div>
      )}

      {/* 장비 목록 */}
      {loading ? (
        <p className="text-sm text-zinc-500">{t("loading")}</p>
      ) : equipment.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
          <p className="font-medium text-zinc-500">{t("empty")}</p>
          <p className="mt-1 text-sm text-zinc-400">{t("emptyDesc")}</p>
          <Link href="/games" className="mt-4 inline-block text-sm text-blue-600 hover:underline">{t("goBlacksmith")}</Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {equipment.map((eq) => {
            const slot = (eq.stats.equipSlot as string | undefined) ?? "weapon";
            const dur = eq.stats.durability ?? eq.stats.durabilityMax ?? 0;
            const durMax = eq.stats.durabilityMax ?? 0;
            const cost = repairCost(eq);
            const isFull = cost === 0;

            return (
              <li key={eq.id} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
                {/* 헤더 */}
                <div className="mb-3 flex items-start gap-3">
                  <span className="text-2xl leading-none">{eq.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{eq.name}</span>
                      <span className={`text-xs font-medium ${TIER_COLOR[eq.tier] ?? ""}`}>
                        {t(`tier${eq.tier.charAt(0).toUpperCase()}${eq.tier.slice(1)}` as Parameters<typeof t>[0])}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {SLOT_EMOJI[slot] ?? "🔧"} {t(`slot${slot.charAt(0).toUpperCase()}${slot.slice(1)}` as Parameters<typeof t>[0])}
                      </span>
                    </div>
                    {eq.desc && <p className="mt-0.5 text-xs text-zinc-500">{eq.desc}</p>}
                  </div>
                </div>

                {/* 스탯 */}
                <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {(eq.stats.attackBonus  ?? 0) !== 0 && <span className="text-red-500">⚔️ {t("statAtk")} +{eq.stats.attackBonus}</span>}
                  {(eq.stats.defenseBonus ?? 0) !== 0 && <span className="text-blue-500">🛡️ {t("statDef")} +{eq.stats.defenseBonus}</span>}
                  {(eq.stats.speedBonus   ?? 0) !== 0 && <span className="text-green-500">💨 {t("statSpd")} +{Math.round((eq.stats.speedBonus ?? 0) * 100)}%</span>}
                  {(eq.stats.hpBonus      ?? 0) !== 0 && <span className="text-pink-500">❤️ {t("statHp")} +{eq.stats.hpBonus}</span>}
                </div>

                {/* 내구도 */}
                {durMax > 0 && (
                  <div className="mb-4">
                    <p className="mb-1 text-xs text-zinc-500">{t("durability")}</p>
                    <DurBar cur={dur} max={durMax} />
                  </div>
                )}

                {/* 버튼 */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => { setEnhanceTarget(eq); setNotice(null); }}
                    className="rounded-md bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700"
                  >
                    ✨ {t("enhanceBtn")}
                  </button>
                  {durMax > 0 && (
                    <button
                      onClick={() => { if (isFull) { setNotice({ kind: "err", text: t("repairFree") }); } else { setRepairTarget(eq); setNotice(null); } }}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold ${isFull ? "border border-zinc-300 text-zinc-400 dark:border-zinc-600" : "bg-amber-500 text-white hover:bg-amber-600"}`}
                    >
                      🔧 {t("repairBtn")} {!isFull && `(${t("repairCost", { cost: cost.toLocaleString() })})`}
                    </button>
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

      {/* ── 강화 모달 ─────────────────────────────────────────── */}
      {enhanceTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !enhancing && setEnhanceTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-lg font-bold">✨ {t("enhanceTitle")}</h2>
            <p className="mb-4 text-sm text-zinc-500">{enhanceTarget.name}</p>

            <ul className="space-y-2">
              {STONE_META.map((s) => {
                const have = stock[s.id] ?? 0;
                return (
                  <li key={s.id}>
                    <button
                      disabled={have < 1 || enhancing}
                      onClick={() => handleEnhance(s.id)}
                      className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-left transition-colors hover:bg-purple-50 hover:border-purple-300 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-purple-900/20"
                    >
                      <span className="text-xl">{s.emoji}</span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold">{s.name}</p>
                        <p className="text-xs text-zinc-500">{t("successRate", { rate: s.rate })}</p>
                      </div>
                      <span className={`text-sm font-bold tabular-nums ${have > 0 ? "text-blue-600 dark:text-blue-400" : "text-zinc-400"}`}>
                        ×{have}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <button
              onClick={() => setEnhanceTarget(null)}
              disabled={enhancing}
              className="mt-4 w-full rounded-lg border border-zinc-200 py-2 text-sm text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* ── 수리 확인 모달 ─────────────────────────────────────── */}
      {repairTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !repairing && setRepairTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-lg font-bold">🔧 {t("repairBtn")}</h2>
            <p className="mb-1 text-sm font-medium">{repairTarget.name}</p>
            <p className="mb-5 text-sm text-zinc-500">
              {t("repairCost", { cost: repairCost(repairTarget).toLocaleString() })}
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleRepair}
                disabled={repairing}
                className="flex-1 rounded-lg bg-amber-500 py-2.5 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-60"
              >
                {repairing ? "…" : `🔧 ${t("repairBtn")}`}
              </button>
              <button
                onClick={() => setRepairTarget(null)}
                disabled={repairing}
                className="flex-1 rounded-lg border border-zinc-200 py-2.5 text-sm dark:border-zinc-700"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
