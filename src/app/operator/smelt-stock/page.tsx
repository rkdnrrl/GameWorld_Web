"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, FormEvent, ChangeEvent } from "react";
import { api, session, ApiError } from "@/lib/api";

type CatalogItem = { id: string; name: string; emoji: string };
type GrantedItem = { productId: string; name: string; emoji: string; count: number };

export default function OperatorSmeltStockPage() {
  const router = useRouter();
  const [forbidden, setForbidden] = useState(false);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [nickname, setNickname] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    targetNickname: string;
    granted: GrantedItem[];
    errors: string[];
  } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const t = session.getToken();
    if (!t) { router.replace("/login"); return; }
    api.operatorSmeltCatalog(t)
      .then((res) => setCatalog(res.items))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setForbidden(true);
        else setCatalogError(err instanceof ApiError ? err.message : "카탈로그를 불러오지 못했습니다.");
      });
  }, [router]);

  function setCount(id: string, val: string) {
    const n = Math.max(0, Math.floor(Number(val) || 0));
    setCounts((prev) => ({ ...prev, [id]: n }));
  }

  const filtered = catalog.filter(
    (c) =>
      !search.trim() ||
      c.name.includes(search.trim()) ||
      c.id.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const selectedItems = Object.entries(counts).filter(([, n]) => n > 0);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setResult(null);
    const t = session.getToken();
    if (!t) return;
    if (!nickname.trim()) { setSubmitError("닉네임을 입력하세요."); return; }
    if (selectedItems.length === 0) { setSubmitError("지급할 재료를 1개 이상 선택하세요."); return; }
    setSubmitting(true);
    try {
      const res = await api.operatorGrantSmeltStock(
        t,
        nickname.trim(),
        selectedItems.map(([productId, count]) => ({ productId, count })),
      );
      setResult(res);
      setCounts({});
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "지급에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (forbidden) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16">
        <h1 className="text-xl font-semibold">접근 불가</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">운영자만 이 페이지를 볼 수 있습니다.</p>
        <Link href="/" className="mt-6 inline-block text-sm text-blue-600 hover:underline">홈으로</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">운영</p>
          <h1 className="text-2xl font-semibold">기초 재료 지급</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            유저 닉네임과 지급할 재료·수량을 선택하세요.
          </p>
        </div>
        <div className="flex gap-4 text-sm">
          <Link href="/operator" className="text-blue-600 hover:underline dark:text-blue-400">← 운영 메뉴</Link>
          <Link href="/"         className="text-blue-600 hover:underline dark:text-blue-400">홈</Link>
        </div>
      </div>

      <form onSubmit={(e) => void onSubmit(e)} className="space-y-6">
        {/* 닉네임 */}
        <div>
          <label className="block text-sm font-medium mb-1">대상 유저 닉네임</label>
          <input
            type="text"
            value={nickname}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setNickname(e.target.value)}
            placeholder="닉네임 정확히 입력"
            className="w-full max-w-sm rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          />
        </div>

        {/* 재료 목록 */}
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <label className="block text-sm font-medium">재료 선택</label>
            <input
              type="search"
              value={search}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              placeholder="이름·ID 검색…"
              className="min-w-[10rem] rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            />
            {selectedItems.length > 0 && (
              <span className="text-sm text-blue-600 dark:text-blue-400">
                {selectedItems.length}종 선택됨
              </span>
            )}
            {selectedItems.length > 0 && (
              <button
                type="button"
                onClick={() => setCounts({})}
                className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              >
                초기화
              </button>
            )}
          </div>

          {catalogError && (
            <p className="mb-2 text-sm text-red-600">{catalogError}</p>
          )}

          {catalog.length === 0 && !catalogError ? (
            <p className="text-sm text-zinc-500">불러오는 중…</p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4">
              {filtered.map((item) => {
                const cnt = counts[item.id] ?? 0;
                const active = cnt > 0;
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors ${
                      active
                        ? "border-blue-400 bg-blue-50 dark:border-blue-600 dark:bg-blue-950/40"
                        : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
                    }`}
                  >
                    <span className="text-lg leading-none">{item.emoji}</span>
                    <span className="min-w-0 flex-1 truncate text-xs">{item.name}</span>
                    <input
                      type="number"
                      min={0}
                      max={99999}
                      value={cnt === 0 ? "" : cnt}
                      placeholder="0"
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setCount(item.id, e.target.value)}
                      className="w-14 rounded border border-zinc-300 bg-transparent px-1.5 py-0.5 text-right text-sm dark:border-zinc-600"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 선택된 재료 요약 */}
        {selectedItems.length > 0 && (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/50">
            <p className="mb-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">지급 목록</p>
            <div className="flex flex-wrap gap-2">
              {selectedItems.map(([id, n]) => {
                const meta = catalog.find((c) => c.id === id);
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-sm dark:bg-blue-900/50"
                  >
                    {meta?.emoji} {meta?.name ?? id} ×{n}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {submitError && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {submitError}
          </p>
        )}

        {result && (
          <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 dark:border-green-900 dark:bg-green-950/40">
            <p className="mb-2 text-sm font-medium text-green-800 dark:text-green-300">
              ✅ {result.targetNickname}님에게 지급 완료
            </p>
            <div className="flex flex-wrap gap-2">
              {result.granted.map((g) => (
                <span
                  key={g.productId}
                  className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-sm dark:bg-green-900/50"
                >
                  {g.emoji} {g.name} ×{g.count}
                </span>
              ))}
            </div>
            {result.errors.length > 0 && (
              <p className="mt-2 text-xs text-red-600">{result.errors.join(", ")}</p>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || selectedItems.length === 0 || !nickname.trim()}
          className="rounded-md bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {submitting ? "지급 중…" : "지급하기"}
        </button>
      </form>
    </div>
  );
}
