"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { api, session, ApiError } from "@/lib/api";

type FishingItemStatus = {
  name: string;
  emoji: string;
  tier: string;
  hasCache: boolean;
};

const TIER_LABEL: Record<string, string> = {
  common: "일반",
  rare: "희귀",
  epic: "에픽",
  legendary: "전설",
};

const TIER_COLOR: Record<string, string> = {
  common: "text-zinc-500",
  rare: "text-blue-500",
  epic: "text-purple-500",
  legendary: "text-amber-500",
};

export default function OperatorFishingItemsPage() {
  const router = useRouter();
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [total, setTotal] = useState(0);
  const [cached, setCached] = useState(0);
  const [items, setItems] = useState<FishingItemStatus[]>([]);

  // 생성 중인 아이템 이름 집합
  const [generating, setGenerating] = useState<Set<string>>(new Set());
  // 방금 생성 완료된 아이템 이름 집합
  const [justDone, setJustDone] = useState<Set<string>>(new Set());
  const [genErrors, setGenErrors] = useState<Record<string, string>>({});

  // 필터: all | missing | cached
  const [filter, setFilter] = useState<"all" | "missing" | "cached">("missing");

  const loadStatus = useCallback(async () => {
    const t = session.getToken();
    if (!t) { router.replace("/login"); return; }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.operatorFishingItemsStatus(t);
      setTotal(res.total);
      setCached(res.cached);
      setItems(res.items);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else setLoadError(err instanceof Error ? err.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  async function generateOne(name: string) {
    const t = session.getToken();
    if (!t) return;
    setGenerating((prev) => new Set(prev).add(name));
    setGenErrors((prev) => { const n = { ...prev }; delete n[name]; return n; });
    try {
      await api.aiFishingItemsGenerateOne(t, name);
      // 로컬 상태 업데이트 (재요청 없이)
      setItems((prev) => prev.map((i) => i.name === name ? { ...i, hasCache: true } : i));
      setCached((prev) => prev + 1);
      setJustDone((prev) => new Set(prev).add(name));
      setTimeout(() => setJustDone((prev) => { const n = new Set(prev); n.delete(name); return n; }), 3000);
    } catch (err) {
      setGenErrors((prev) => ({
        ...prev,
        [name]: err instanceof Error ? err.message : "생성 실패",
      }));
    } finally {
      setGenerating((prev) => { const n = new Set(prev); n.delete(name); return n; });
    }
  }

  async function generateAllMissing() {
    const missing = items.filter((i) => !i.hasCache && !generating.has(i.name));
    for (const item of missing) {
      await generateOne(item.name);
    }
  }

  const filteredItems = items.filter((i) => {
    if (filter === "missing") return !i.hasCache;
    if (filter === "cached") return i.hasCache;
    return true;
  });

  const missingCount = items.filter((i) => !i.hasCache).length;
  const anyGenerating = generating.size > 0;

  if (forbidden) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16">
        <h1 className="text-xl font-semibold">접근 불가</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">운영자만 이 페이지를 볼 수 있습니다.</p>
        <Link href="/operator" className="mt-6 inline-block text-sm text-blue-600 hover:underline">← 운영 콘솔</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      {/* 헤더 */}
      <div className="mb-6 flex items-end justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">운영 콘솔</p>
          <h1 className="mt-0.5 text-2xl font-bold">낚시 아이템 관리</h1>
        </div>
        <Link href="/operator" className="text-sm text-blue-600 hover:underline dark:text-blue-400">← 운영 콘솔</Link>
      </div>

      {/* 요약 카드 */}
      {!loading && !loadError && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          {[
            { label: "전체", value: total, color: "text-zinc-700 dark:text-zinc-200" },
            { label: "생성 완료", value: cached, color: "text-green-600 dark:text-green-400" },
            { label: "미생성", value: missingCount, color: missingCount > 0 ? "text-red-500" : "text-zinc-400" },
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
            {anyGenerating ? `생성 중… (${generating.size}건)` : `미생성 ${missingCount}건 전체 생성`}
          </button>
          <p className="text-xs text-zinc-500">순차적으로 생성합니다. 시간이 걸릴 수 있습니다.</p>
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
            {f === "missing" ? `미생성 (${missingCount})` : f === "cached" ? `완료 (${cached})` : `전체 (${total})`}
          </button>
        ))}
        <button onClick={loadStatus} className="ml-auto text-xs text-zinc-400 hover:text-zinc-600">새로고침</button>
      </div>

      {/* 목록 */}
      {loading && <p className="py-8 text-center text-sm text-zinc-400">불러오는 중…</p>}
      {loadError && <p className="py-8 text-center text-sm text-red-500">{loadError}</p>}
      {!loading && !loadError && filteredItems.length === 0 && (
        <p className="py-8 text-center text-sm text-zinc-400">
          {filter === "missing" ? "미생성 아이템이 없습니다. 🎉" : "항목이 없습니다."}
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
                <p className={`text-xs ${TIER_COLOR[item.tier] || "text-zinc-400"}`}>
                  {TIER_LABEL[item.tier] || item.tier}
                </p>
                {errMsg && <p className="text-xs text-red-500 mt-0.5">{errMsg}</p>}
              </div>
              <div className="flex items-center gap-2">
                {item.hasCache || isDone ? (
                  <span className="text-xs font-medium text-green-600 dark:text-green-400">
                    {isDone ? "✓ 생성됨" : "✓ 완료"}
                  </span>
                ) : (
                  <button
                    onClick={() => generateOne(item.name)}
                    disabled={isGen}
                    className="rounded-md bg-zinc-800 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-700 dark:hover:bg-zinc-600"
                  >
                    {isGen ? "생성 중…" : "생성"}
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
