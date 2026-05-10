"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, session, ApiError, type CatchItem } from "@/lib/api";
import CatchPixelThumb from "@/components/CatchPixelThumb";

function isValidPixelArt(
  p: CatchItem["pixelArt"]
): p is NonNullable<CatchItem["pixelArt"]> {
  if (!p || typeof p !== "object") return false;
  const w = Number((p as { w?: unknown }).w);
  const h = Number((p as { h?: unknown }).h);
  const palette = (p as { palette?: unknown }).palette;
  const cells = (p as { cells?: unknown }).cells;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1)
    return false;
  if (!Array.isArray(palette) || !Array.isArray(cells)) return false;
  if (cells.length !== w * h) return false;
  return true;
}

const RARITY_LABEL: Record<string, string> = {
  common: "Common",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

const RARITY_TEXT: Record<string, string> = {
  common: "text-slate-400",
  rare: "text-violet-400",
  epic: "text-orange-400",
  legendary: "text-yellow-400",
};

const RARITY_BORDER: Record<string, string> = {
  common: "border-l-slate-400",
  rare: "border-l-violet-400",
  epic: "border-l-orange-400",
  legendary: "border-l-yellow-400",
};

function timeAgo(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "방금 전";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export default function InventoryPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [items, setItems] = useState<CatchItem[]>([]);
  const [coins, setCoins] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sellingId, setSellingId] = useState<string | null>(null);
  const [sellingAll, setSellingAll] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const loadInventory = useCallback(
    async (t: string) => {
      setLoadError(null);
      try {
        const data = await api.getInventory(t);
        const raw = data.catches;
        setItems(Array.isArray(raw) ? raw : []);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          session.clear();
          router.replace("/login");
          return;
        }
        setLoadError(
          err instanceof ApiError ? err.message : "보관함을 불러오지 못했습니다."
        );
      } finally {
        setLoading(false);
      }
    },
    [router]
  );

  useEffect(() => {
    const t = session.getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    setToken(t);
    const user = session.getUser();
    if (user) {
      setCoins(typeof user.coins === "number" ? user.coins : null);
    }
    void loadInventory(t);
  }, [router, loadInventory]);

  function showNotice(kind: "ok" | "err", text: string) {
    setNotice({ kind, text });
    setTimeout(() => setNotice(null), 3000);
  }

  async function sellOne(id: string) {
    if (!token || sellingId || sellingAll) return;
    setSellingId(id);
    try {
      const res = await api.sellCatches(token, { ids: [id] });
      const item = items.find((i) => i.id === id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      setCoins(res.totalCoins);
      session.updateStoredUser({ ...session.getUser()!, coins: res.totalCoins });
      showNotice("ok", `${item?.itemEmoji ?? ""} ${item?.itemName ?? "아이템"} 판매 완료! +${res.coinsEarned}🪙`);
    } catch (err) {
      showNotice(
        "err",
        err instanceof ApiError ? err.message : "판매에 실패했습니다."
      );
    } finally {
      setSellingId(null);
    }
  }

  async function sellAll() {
    if (!token || sellingId || sellingAll || items.length === 0) return;
    setSellingAll(true);
    try {
      const res = await api.sellCatches(token, { all: true });
      setItems([]);
      setCoins(res.totalCoins);
      session.updateStoredUser({ ...session.getUser()!, coins: res.totalCoins });
      showNotice(
        "ok",
        `${res.sold}개 판매 완료! +${Number(res.coinsEarned || 0).toLocaleString()}🪙`
      );
    } catch (err) {
      showNotice(
        "err",
        err instanceof ApiError ? err.message : "판매에 실패했습니다."
      );
    } finally {
      setSellingAll(false);
    }
  }

  const coinNum = (i: CatchItem) => {
    const n = Number(i.coinValue);
    return Number.isFinite(n) ? n : 0;
  };
  const totalValue = items.reduce((s, i) => s + coinNum(i), 0);

  return (
    <section className="mx-auto w-full min-w-0 max-w-2xl px-4 py-10 sm:px-6 sm:py-12">
      {/* 헤더 */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">
            📦 보관함
          </h1>
          <p className="mt-1 break-words text-sm text-zinc-500">
            잡은 아이템을 팔아서 게임머니를 획득하세요
          </p>
        </div>
        {typeof coins === "number" && (
          <span className="inline-flex w-fit max-w-full shrink-0 items-center gap-1 self-start rounded-full bg-yellow-50 px-3 py-2 text-sm font-semibold text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400">
            <span className="shrink-0">🪙</span>
            <span className="min-w-0 truncate tabular-nums">
              {coins.toLocaleString()}
            </span>
          </span>
        )}
      </div>

      {/* 알림 토스트 */}
      {notice && (
        <div
          className={`mb-4 break-words rounded-lg px-4 py-3 text-sm font-medium ${
            notice.kind === "ok"
              ? "bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200"
              : "bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200"
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* 전체 팔기 바 */}
      {items.length > 0 && (
        <div className="mb-4 flex flex-col gap-3 rounded-xl bg-zinc-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:bg-zinc-800">
          <span className="min-w-0 break-words text-sm text-zinc-600 dark:text-zinc-300">
            총 <strong>{items.length}</strong>개 &nbsp;·&nbsp; 합계{" "}
            <strong className="text-yellow-600 dark:text-yellow-400">
              {totalValue.toLocaleString()}🪙
            </strong>
          </span>
          <button
            onClick={sellAll}
            disabled={sellingAll || !!sellingId}
            className="w-full shrink-0 rounded-lg bg-yellow-500 px-4 py-2 text-sm font-semibold text-white hover:bg-yellow-600 disabled:opacity-60 sm:w-auto"
          >
            {sellingAll ? "판매 중…" : "전체 팔기"}
          </button>
        </div>
      )}

      {/* 로딩 */}
      {loading && (
        <p className="py-8 text-center text-sm text-zinc-500">불러오는 중…</p>
      )}

      {/* 에러 */}
      {loadError && !loading && (
        <div className="mb-4 break-words rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {loadError}
        </div>
      )}

      {/* 빈 보관함 */}
      {!loading && !loadError && items.length === 0 && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-6 py-16 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-5xl">🎣</p>
          <p className="mt-4 text-lg font-semibold">보관함이 비어있습니다</p>
          <p className="mt-1 text-sm text-zinc-500">
            우주 낚시를 해서 아이템을 잡아보세요!
          </p>
          <Link
            href="/games"
            className="mt-5 inline-block rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            게임하러 가기 →
          </Link>
        </div>
      )}

      {/* 아이템 목록 */}
      {!loading && items.length > 0 && (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <div
              key={item.id}
              className={`flex min-w-0 items-center gap-2 rounded-xl border border-zinc-200 border-l-4 bg-white px-3 py-3 sm:gap-4 sm:px-5 dark:border-zinc-700 dark:border-l-4 dark:bg-zinc-900 ${RARITY_BORDER[item.rarity] ?? "border-l-zinc-400"}`}
            >
              {isValidPixelArt(item.pixelArt) ? (
                <CatchPixelThumb art={item.pixelArt} width={52} height={38} />
              ) : (
                <span className="text-3xl leading-none">{item.itemEmoji}</span>
              )}
              <div className="min-w-0 flex-1">
                <span
                  className={`text-xs font-bold uppercase tracking-wide ${RARITY_TEXT[item.rarity] ?? "text-zinc-400"}`}
                >
                  {RARITY_LABEL[item.rarity] ?? item.rarity}
                </span>
                <p className="break-words font-semibold leading-snug">{item.itemName}</p>
                <p className="break-words text-xs text-zinc-400">
                  {item.size != null ? `${item.size}cm · ` : ""}
                  {timeAgo(item.caughtAt)}
                </p>
              </div>
              <div className="min-w-0 shrink-0 text-right">
                <p className="font-bold tabular-nums text-yellow-500">
                  {coinNum(item).toLocaleString()}🪙
                </p>
                <button
                  type="button"
                  onClick={() => sellOne(item.id)}
                  disabled={sellingId === item.id || sellingAll}
                  className="mt-1 rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 sm:px-3"
                >
                  {sellingId === item.id ? "판매 중…" : "팔기"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-10 text-center text-sm text-zinc-500">
        <Link href="/games" className="text-blue-600 hover:underline">
          ← 게임 목록
        </Link>
      </p>
    </section>
  );
}
