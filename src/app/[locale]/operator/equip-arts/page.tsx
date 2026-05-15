"use client";

import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useState, useCallback } from "react";
import { api, session, ApiError } from "@/lib/api";
import { useTranslations } from "next-intl";

type EquipNounStatus = {
  noun: string;
  slot: string;
  hasCache: boolean;
};

export default function OperatorEquipArtsPage() {
  const router = useRouter();
  const t = useTranslations("EquipArts");
  const tOp = useTranslations("Operator");
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<EquipNounStatus[]>([]);

  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const [justDone, setJustDone] = useState<Set<string>>(new Set());
  const [genErrors, setGenErrors] = useState<Record<string, string>>({});

  const [filter, setFilter] = useState<"all" | "missing" | "cached">("missing");
  const [slotFilter, setSlotFilter] = useState<string>("all");

  const SLOT_LABEL: Record<string, string> = {
    weapon: t("slotWeapon"),
    head: t("slotHead"),
    chest: t("slotChest"),
    pants: t("slotPants"),
    gloves: t("slotGloves"),
    boots: t("slotBoots"),
    accessory: t("slotAccessory"),
  };

  const loadStatus = useCallback(async () => {
    const tk = session.getToken();
    if (!tk) { router.replace("/login"); return; }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.operatorEquipArtStatus(tk);
      setTotal(res.total);
      setItems(res.items);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else setLoadError(err instanceof Error ? err.message : t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [router, t]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  async function generateOne(noun: string) {
    const tk = session.getToken();
    if (!tk) return;
    setGenerating((prev) => new Set(prev).add(noun));
    setGenErrors((prev) => { const n = { ...prev }; delete n[noun]; return n; });
    try {
      await api.craftEquipArtGenerateOne(tk, noun);
      setItems((prev) => prev.map((i) => i.noun === noun ? { ...i, hasCache: true } : i));
      setJustDone((prev) => new Set(prev).add(noun));
      setTimeout(() => setJustDone((prev) => { const n = new Set(prev); n.delete(noun); return n; }), 3000);
    } catch (err) {
      setGenErrors((prev) => ({ ...prev, [noun]: err instanceof Error ? err.message : t("generateFailed") }));
    } finally {
      setGenerating((prev) => { const n = new Set(prev); n.delete(noun); return n; });
    }
  }

  async function generateAllMissing() {
    const missing = items.filter((i) => !i.hasCache && !generating.has(i.noun)
      && (slotFilter === "all" || i.slot === slotFilter));
    for (let idx = 0; idx < missing.length; idx++) {
      await generateOne(missing[idx].noun);
      if (idx < missing.length - 1) await new Promise((r) => setTimeout(r, 1500));
    }
  }

  const cachedCount = items.filter((i) => i.hasCache).length;
  const missingCount = items.filter((i) => !i.hasCache).length;
  const anyGenerating = generating.size > 0;

  const slots = ["all", ...Array.from(new Set(items.map((i) => i.slot)))];

  const filteredItems = items.filter((i) => {
    if (filter === "missing" && i.hasCache) return false;
    if (filter === "cached" && !i.hasCache) return false;
    if (slotFilter !== "all" && i.slot !== slotFilter) return false;
    return true;
  });

  const filteredMissingCount = items.filter((i) =>
    !i.hasCache && (slotFilter === "all" || i.slot === slotFilter)
  ).length;

  if (forbidden) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16">
        <h1 className="text-xl font-semibold">{t("forbidden")}</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{t("forbiddenDesc")}</p>
        <Link href="/operator" className="mt-6 inline-block text-sm text-blue-600 hover:underline">{tOp("backToMenu")}</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      {/* 헤더 */}
      <div className="mb-6 flex items-end justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{t("breadcrumb")}</p>
          <h1 className="mt-0.5 text-2xl font-bold">{t("title")}</h1>
        </div>
        <Link href="/operator" className="text-sm text-blue-600 hover:underline dark:text-blue-400">{tOp("backToMenu")}</Link>
      </div>

      {/* 요약 카드 */}
      {!loading && !loadError && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          {[
            { label: t("statTotal"), value: total, color: "text-zinc-700 dark:text-zinc-200" },
            { label: t("statCached"), value: cachedCount, color: "text-green-600 dark:text-green-400" },
            { label: t("statMissing"), value: missingCount, color: missingCount > 0 ? "text-red-500" : "text-zinc-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-zinc-200 bg-white p-4 text-center dark:border-zinc-700 dark:bg-zinc-900">
              <p className="text-xs text-zinc-500">{label}</p>
              <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* 일괄 생성 */}
      {filteredMissingCount > 0 && !loading && (
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={generateAllMissing}
            disabled={anyGenerating}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {anyGenerating
              ? t("generatingAll", { count: generating.size })
              : t("generateAllButton", { count: filteredMissingCount })}
          </button>
          <p className="text-xs text-zinc-500">{t("generateAllNote")}</p>
        </div>
      )}

      {/* 필터 탭 */}
      <div className="mb-2 flex gap-2 border-b border-zinc-200 dark:border-zinc-700">
        {(["missing", "cached", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === f
                ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            {f === "missing"
              ? t("tabMissing", { count: missingCount })
              : f === "cached"
              ? t("tabCached", { count: cachedCount })
              : t("tabAll", { count: total })}
          </button>
        ))}
        <button onClick={loadStatus} className="ml-auto text-xs text-zinc-400 hover:text-zinc-600">{t("refresh")}</button>
      </div>

      {/* 슬롯 필터 */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {slots.map((s) => (
          <button
            key={s}
            onClick={() => setSlotFilter(s)}
            className={`rounded-full px-3 py-0.5 text-xs font-medium transition-colors ${
              slotFilter === s
                ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            {s === "all" ? t("slotAll") : SLOT_LABEL[s] || s}
          </button>
        ))}
      </div>

      {/* 목록 */}
      {loading && <p className="py-8 text-center text-sm text-zinc-400">{t("loading")}</p>}
      {loadError && <p className="py-8 text-center text-sm text-red-500">{loadError}</p>}
      {!loading && !loadError && filteredItems.length === 0 && (
        <p className="py-8 text-center text-sm text-zinc-400">
          {filter === "missing" ? t("noMissing") : t("noItems")}
        </p>
      )}

      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {filteredItems.map((item) => {
          const isGen = generating.has(item.noun);
          const isDone = justDone.has(item.noun);
          const errMsg = genErrors[item.noun];
          return (
            <li key={item.noun} className="flex items-center gap-3 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{item.noun}</p>
                <p className="text-xs text-zinc-400">{SLOT_LABEL[item.slot] || item.slot}</p>
                {errMsg && <p className="text-xs text-red-500 mt-0.5">{errMsg}</p>}
              </div>
              <div className="flex items-center gap-2">
                {item.hasCache || isDone ? (
                  <span className="text-xs font-medium text-green-600 dark:text-green-400">
                    {isDone ? t("generated") : t("done")}
                  </span>
                ) : (
                  <button
                    onClick={() => generateOne(item.noun)}
                    disabled={isGen}
                    className="rounded-md bg-zinc-800 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-700 dark:hover:bg-zinc-600"
                  >
                    {isGen ? t("generating") : t("generate")}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
