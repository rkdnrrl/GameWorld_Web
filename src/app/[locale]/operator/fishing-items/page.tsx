"use client";

import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useState, useCallback } from "react";
import { api, session, ApiError } from "@/lib/api";
import { useTranslations } from "next-intl";

type FishingItemStatus = {
  name: string;
  emoji: string;
  hasCache: boolean;
};

export default function OperatorFishingItemsPage() {
  const router = useRouter();
  const t = useTranslations("FishingItems");
  const tOp = useTranslations("Operator");
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<FishingItemStatus[]>([]);

  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const [justDone, setJustDone] = useState<Set<string>>(new Set());
  const [genErrors, setGenErrors] = useState<Record<string, string>>({});

  const [filter, setFilter] = useState<"all" | "missing" | "cached">("missing");

  const loadStatus = useCallback(async () => {
    const tk = session.getToken();
    if (!tk) { router.replace("/login"); return; }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.operatorFishingItemsStatus(tk);
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

  async function generateOne(nounName: string) {
    const tk = session.getToken();
    if (!tk) return;
    setGenerating((prev) => new Set(prev).add(nounName));
    setGenErrors((prev) => { const n = { ...prev }; delete n[nounName]; return n; });
    try {
      await api.aiFishingItemsGenerateOne(tk, nounName);
      setItems((prev) => prev.map((i) => i.name === nounName ? { ...i, hasCache: true } : i));
      setJustDone((prev) => new Set(prev).add(nounName));
      setTimeout(() => setJustDone((prev) => { const n = new Set(prev); n.delete(nounName); return n; }), 3000);
    } catch (err) {
      setGenErrors((prev) => ({
        ...prev,
        [nounName]: err instanceof Error ? err.message : t("generateFailed"),
      }));
    } finally {
      setGenerating((prev) => { const n = new Set(prev); n.delete(nounName); return n; });
    }
  }

  async function generateAllMissing() {
    const missing = items.filter((i) => !i.hasCache && !generating.has(i.name));
    for (let idx = 0; idx < missing.length; idx++) {
      await generateOne(missing[idx].name);
      if (idx < missing.length - 1) await new Promise((r) => setTimeout(r, 1500));
    }
  }

  const filteredItems = items.filter((i) => {
    if (filter === "missing") return !i.hasCache;
    if (filter === "cached") return i.hasCache;
    return true;
  });

  const cachedCount = items.filter((i) => i.hasCache).length;
  const missingCount = items.filter((i) => !i.hasCache).length;
  const anyGenerating = generating.size > 0;

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

      {/* 일괄 생성 버튼 */}
      {missingCount > 0 && !loading && (
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={generateAllMissing}
            disabled={anyGenerating}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {anyGenerating
              ? t("generatingAll", { count: generating.size })
              : t("generateAllButton", { count: missingCount })}
          </button>
          <p className="text-xs text-zinc-500">{t("generateAllNote")}</p>
        </div>
      )}

      {/* 필터 탭 */}
      <div className="mb-4 flex gap-2 border-b border-zinc-200 dark:border-zinc-700">
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
          const isGen = generating.has(item.name);
          const isDone = justDone.has(item.name);
          const errMsg = genErrors[item.name];
          return (
            <li key={item.name} className="flex items-center gap-3 py-3">
              <span className="text-2xl w-8 text-center">{item.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.name}</p>
                {errMsg && <p className="text-xs text-red-500 mt-0.5">{errMsg}</p>}
              </div>
              <div className="flex items-center gap-2">
                {item.hasCache || isDone ? (
                  <span className="text-xs font-medium text-green-600 dark:text-green-400">
                    {isDone ? t("generated") : t("done")}
                  </span>
                ) : (
                  <button
                    onClick={() => generateOne(item.name)}
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
