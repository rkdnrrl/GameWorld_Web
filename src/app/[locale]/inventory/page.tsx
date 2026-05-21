"use client";

import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, session, ApiError, type CatchItem } from "@/lib/api";
import CatchPixelThumb from "@/components/CatchPixelThumb";
import { useTranslations } from "next-intl";

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

function formatTimeAgo(iso: string): { key: "timeJustNow" | "timeMinutesAgo" | "timeHoursAgo" | null; n?: number; fallback?: string } {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { key: null, fallback: "" };
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return { key: "timeJustNow" };
  if (diff < 3600) return { key: "timeMinutesAgo", n: Math.floor(diff / 60) };
  if (diff < 86400) return { key: "timeHoursAgo", n: Math.floor(diff / 3600) };
  return { key: null, fallback: d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" }) };
}

export default function InventoryPage() {
  const router = useRouter();
  const t = useTranslations("Inventory");
  const [token, setToken] = useState<string | null>(null);
  const [items, setItems] = useState<CatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [query, setQuery] = useState("");

  const loadInventory = useCallback(
    async (tk: string) => {
      setLoadError(null);
      try {
        const data = await api.getInventory(tk);
        const raw = data.catches;
        setItems(Array.isArray(raw) ? raw : []);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          session.clear();
          router.replace("/login");
          return;
        }
        setLoadError(
          err instanceof ApiError ? err.message : t("loadFailed")
        );
      } finally {
        setLoading(false);
      }
    },
    [router, t]
  );

  useEffect(() => {
    const tk = session.getToken();
    if (!tk) {
      router.replace("/login");
      return;
    }
    setToken(tk);
    void loadInventory(tk);
  }, [router, loadInventory]);

  function showNotice(kind: "ok" | "err", text: string) {
    setNotice({ kind, text });
    setTimeout(() => setNotice(null), 3000);
  }

  async function removeOne(id: string) {
    if (!token || removingId) return;
    if (!confirm(t("removeConfirm"))) return;
    setRemovingId(id);
    try {
      await api.deleteInventoryItem(token, id);
      const item = items.find((i) => i.id === id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      showNotice("ok", t("removedNotice", { emoji: item?.itemEmoji ?? "", name: item?.itemName ?? "아이템" }));
    } catch (err) {
      showNotice(
        "err",
        err instanceof ApiError ? err.message : t("removeFailed")
      );
    } finally {
      setRemovingId(null);
    }
  }

  // 검색 필터 (이름·이모지·타입 부분 매칭)
  const q = query.trim().toLowerCase();
  const filtered = q
    ? items.filter((i) => {
        const hay = `${i.itemName} ${i.itemEmoji} ${i.itemType} ${i.rarity}`.toLowerCase();
        return hay.includes(q);
      })
    : items;

  return (
    <section className="mx-auto w-full min-w-0 max-w-2xl px-4 py-10 sm:px-6 sm:py-12">
      {/* 헤더 */}
      <div className="mb-6 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <span className="text-3xl">📦</span>
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">
              {t("title")}
            </h1>
            <p className="mt-1 break-words text-sm text-zinc-500">
              {t("subtitle")}
            </p>
          </div>
        </div>
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

      {/* 검색 + 통계 */}
      {(items.length > 0 || query) && (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          />
          <span className="shrink-0 text-xs text-zinc-500 sm:ml-2">
            {t("itemCount", { count: filtered.length, total: items.length })}
          </span>
        </div>
      )}

      {/* 로딩 */}
      {loading && (
        <p className="py-8 text-center text-sm text-zinc-500">{t("loading")}</p>
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
          <p className="text-5xl">📦</p>
          <p className="mt-4 text-lg font-semibold">{t("emptyTitle")}</p>
          <p className="mt-1 text-sm text-zinc-500">
            {t("emptyDesc")}
          </p>
          <Link
            href="/games"
            className="mt-5 inline-block rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {t("goToGames")}
          </Link>
        </div>
      )}

      {/* 검색 결과 없음 */}
      {!loading && items.length > 0 && filtered.length === 0 && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-6 py-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
          {t("noSearchResult", { query })}
        </div>
      )}

      {/* 아이템 목록 */}
      {!loading && filtered.length > 0 && (
        <div className="flex flex-col gap-3">
          {filtered.map((item) => (
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
                  {(() => { const r = formatTimeAgo(item.caughtAt); if (r.key === null) return r.fallback ?? ""; if (r.n !== undefined) return t(r.key as "timeMinutesAgo" | "timeHoursAgo", { n: r.n }); return t(r.key as "timeJustNow"); })()}
                </p>
              </div>
              <div className="min-w-0 shrink-0 text-right">
                <button
                  type="button"
                  onClick={() => removeOne(item.id)}
                  disabled={removingId === item.id}
                  className="rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 sm:px-3 dark:border-red-700 dark:bg-zinc-800 dark:text-red-300 dark:hover:bg-red-950/30"
                >
                  {removingId === item.id ? t("removing") : t("remove")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-10 text-center text-sm text-zinc-500">
        <Link href="/games" className="text-blue-600 hover:underline">
          {t("backToGames")}
        </Link>
      </p>
    </section>
  );
}
