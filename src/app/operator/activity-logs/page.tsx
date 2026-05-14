"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, FormEvent, ChangeEvent } from "react";
import { api, session, ApiError } from "@/lib/api";

type LogItem = {
  id: string;
  userId: string;
  nickname: string;
  action: string;
  detail: Record<string, unknown>;
  createdAt: string;
};

const ACTION_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  fish_catch:  { label: "낚시",   emoji: "🎣", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300" },
  smelt_melt:  { label: "용광로", emoji: "🔥", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300" },
  forge_craft: { label: "제련",   emoji: "⚒️",  color: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300" },
};

function formatDt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR");
}

function DetailCell({ action, detail }: { action: string; detail: Record<string, unknown> }) {
  if (action === "fish_catch") {
    return (
      <span>
        {String(detail.itemEmoji ?? "")} {String(detail.itemName ?? "—")}
        <span className="ml-2 text-xs text-zinc-500">
          {String(detail.rarity ?? "")} · {String(detail.itemType ?? "")} · 🪙{String(detail.coinValue ?? 0)}
        </span>
      </span>
    );
  }
  if (action === "smelt_melt") {
    const gained = (detail.gained as { emoji: string; name: string; count: number }[]) ?? [];
    const lost   = (detail.lost   as { emoji: string; name: string; count: number }[]) ?? [];
    return (
      <span>
        {String(detail.meltCount ?? 0)}개 녹임
        {gained.length > 0 && (
          <span className="ml-2 text-xs text-green-700 dark:text-green-400">
            +{gained.map((g) => `${g.emoji}${g.name}×${g.count}`).join(" ")}
          </span>
        )}
        {lost.length > 0 && (
          <span className="ml-2 text-xs text-red-600 dark:text-red-400">
            소실: {lost.map((l) => `${l.emoji}${l.name}×${l.count}`).join(" ")}
          </span>
        )}
      </span>
    );
  }
  if (action === "forge_craft") {
    return (
      <span>
        {String(detail.itemEmoji ?? "")} {String(detail.name ?? "—")}
        <span className="ml-2 text-xs text-zinc-500">
          {String(detail.tier ?? "")} · {String(detail.slot ?? "")}
          {detail.firstDiscovery ? " ✨첫발견" : ""}
        </span>
      </span>
    );
  }
  return <span className="font-mono text-xs">{JSON.stringify(detail)}</span>;
}

export default function OperatorActivityLogsPage() {
  const router = useRouter();
  const [forbidden, setForbidden]   = useState(false);
  const [items, setItems]           = useState<LogItem[]>([]);
  const [total, setTotal]           = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage]             = useState(1);
  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState<string | null>(null);

  const [actionFilter,   setActionFilter]   = useState("all");
  const [nicknameInput,  setNicknameInput]  = useState("");
  const [nicknameFilter, setNicknameFilter] = useState("");

  const load = useCallback(async () => {
    const t = session.getToken();
    if (!t) { router.replace("/login"); return; }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.operatorActivityLogs(t, {
        action:   actionFilter !== "all" ? actionFilter : undefined,
        nickname: nicknameFilter || undefined,
        page,
        limit: 50,
      });
      setItems(res.items);
      setTotal(res.total);
      setTotalPages(Math.max(1, res.totalPages));
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else setLoadError(err instanceof ApiError ? err.message : "불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [router, page, actionFilter, nicknameFilter]);

  useEffect(() => { void load(); }, [load]);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setNicknameFilter(nicknameInput.trim());
  }

  function onActionChange(a: string) {
    setActionFilter(a);
    setPage(1);
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
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      {/* 헤더 */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">운영</p>
          <h1 className="text-2xl font-semibold">활동 로그</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            낚시 · 용광로 · 제련 이벤트 실시간 기록
          </p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link href="/operator/smelt-stock"       className="text-blue-600 hover:underline dark:text-blue-400">기초 재료 지급</Link>
          <Link href="/operator/shared-pixel-arts" className="text-blue-600 hover:underline dark:text-blue-400">픽셀 아트 관리</Link>
          <Link href="/"                           className="text-blue-600 hover:underline dark:text-blue-400">← 홈</Link>
        </div>
      </div>

      {/* 필터 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* 액션 필터 */}
        <div className="flex gap-1">
          {(["all", "fish_catch", "smelt_melt", "forge_craft"] as const).map((a) => {
            const meta = a === "all" ? { label: "전체", emoji: "" } : ACTION_LABELS[a];
            return (
              <button
                key={a}
                type="button"
                onClick={() => onActionChange(a)}
                className={`rounded-full px-3 py-1 text-sm transition-colors ${
                  actionFilter === a
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                    : "border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
                }`}
              >
                {meta.emoji} {meta.label}
              </button>
            );
          })}
        </div>

        {/* 닉네임 검색 */}
        <form onSubmit={onSearch} className="flex gap-2">
          <input
            type="search"
            value={nicknameInput}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setNicknameInput(e.target.value)}
            placeholder="닉네임 검색…"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          />
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            검색
          </button>
          {nicknameFilter && (
            <button
              type="button"
              onClick={() => { setNicknameFilter(""); setNicknameInput(""); setPage(1); }}
              className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              초기화
            </button>
          )}
        </form>

        <span className="text-sm text-zinc-500">총 {total.toLocaleString()}건</span>
        <button
          type="button"
          onClick={() => void load()}
          className="ml-auto text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          새로고침
        </button>
      </div>

      {loadError && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {loadError}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">불러오는 중…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                <th className="px-3 py-2 font-medium">시각</th>
                <th className="px-3 py-2 font-medium">닉네임</th>
                <th className="px-3 py-2 font-medium">행동</th>
                <th className="px-3 py-2 font-medium">내용</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-zinc-500">로그가 없습니다.</td>
                </tr>
              ) : (
                items.map((row) => {
                  const meta = ACTION_LABELS[row.action];
                  return (
                    <tr key={row.id} className="border-b border-zinc-100 dark:border-zinc-800/80">
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">{formatDt(row.createdAt)}</td>
                      <td className="px-3 py-2 font-medium">{row.nickname}</td>
                      <td className="px-3 py-2">
                        {meta ? (
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta.color}`}>
                            {meta.emoji} {meta.label}
                          </span>
                        ) : (
                          <span className="font-mono text-xs">{row.action}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <DetailCell action={row.action} detail={row.detail} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded border border-zinc-300 px-3 py-1 text-sm disabled:opacity-40 dark:border-zinc-600"
          >
            이전
          </button>
          <span className="text-sm text-zinc-600 dark:text-zinc-400">{page} / {totalPages}</span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded border border-zinc-300 px-3 py-1 text-sm disabled:opacity-40 dark:border-zinc-600"
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}
