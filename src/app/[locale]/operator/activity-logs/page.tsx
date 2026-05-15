"use client";

import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { useCallback, useEffect, useState, FormEvent, ChangeEvent } from "react";
import { api, session, ApiError } from "@/lib/api";
import { useTranslations } from "next-intl";

type LogItem = {
  id: string;
  userId: string;
  nickname: string;
  action: string;
  detail: Record<string, unknown>;
  createdAt: string;
};

function formatDt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR");
}

function DetailCell({ action, detail, t }: { action: string; detail: Record<string, unknown>; t: ReturnType<typeof import("next-intl")["useTranslations"]> }) {
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
    const lost = (detail.lost as { emoji: string; name: string; count: number }[]) ?? [];
    return (
      <span>
        {t("smeltMelted", { count: String(detail.meltCount ?? 0) })}
        {gained.length > 0 && (
          <span className="ml-2 text-xs text-green-700 dark:text-green-400">
            {t("smeltGained", { items: gained.map((g) => `${g.emoji}${g.name}×${g.count}`).join(" ") })}
          </span>
        )}
        {lost.length > 0 && (
          <span className="ml-2 text-xs text-red-600 dark:text-red-400">
            {t("smeltLost", { items: lost.map((l) => `${l.emoji}${l.name}×${l.count}`).join(" ") })}
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
          {detail.firstDiscovery ? t("forgeFirstDiscovery") : ""}
        </span>
      </span>
    );
  }
  return <span className="font-mono text-xs">{JSON.stringify(detail)}</span>;
}

export default function OperatorActivityLogsPage() {
  const router = useRouter();
  const t = useTranslations("ActivityLogs");
  const tOp = useTranslations("Operator");
  const tCommon = useTranslations("Common");
  const [forbidden, setForbidden] = useState(false);
  const [items, setItems] = useState<LogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [actionFilter, setActionFilter] = useState("all");
  const [nicknameInput, setNicknameInput] = useState("");
  const [nicknameFilter, setNicknameFilter] = useState("");

  const ACTION_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
    fish_catch: { label: t("filterFish"), emoji: "🎣", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300" },
    smelt_melt: { label: t("filterSmelt"), emoji: "🔥", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300" },
    forge_craft: { label: t("filterForge"), emoji: "⚒️", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300" },
  };

  const load = useCallback(async () => {
    const tk = session.getToken();
    if (!tk) { router.replace("/login"); return; }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.operatorActivityLogs(tk, {
        action: actionFilter !== "all" ? actionFilter : undefined,
        nickname: nicknameFilter || undefined,
        page,
        limit: 50,
      });
      setItems(res.items);
      setTotal(res.total);
      setTotalPages(Math.max(1, res.totalPages));
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else setLoadError(err instanceof ApiError ? err.message : t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [router, page, actionFilter, nicknameFilter, t]);

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
        <h1 className="text-xl font-semibold">{t("forbidden")}</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{t("forbiddenDesc")}</p>
        <Link href="/" className="mt-6 inline-block text-sm text-blue-600 hover:underline">{tOp("home")}</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      {/* 헤더 */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{t("breadcrumb")}</p>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {t("subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link href="/operator" className="text-blue-600 hover:underline dark:text-blue-400">← {t("breadcrumb")}</Link>
          <Link href="/" className="text-blue-600 hover:underline dark:text-blue-400">홈</Link>
        </div>
      </div>

      {/* 필터 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {(["all", "fish_catch", "smelt_melt", "forge_craft"] as const).map((a) => {
            const meta = a === "all" ? { label: t("filterAll"), emoji: "" } : ACTION_LABELS[a];
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

        <form onSubmit={onSearch} className="flex gap-2">
          <input
            type="search"
            value={nicknameInput}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setNicknameInput(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          />
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {tCommon("search")}
          </button>
          {nicknameFilter && (
            <button
              type="button"
              onClick={() => { setNicknameFilter(""); setNicknameInput(""); setPage(1); }}
              className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              {tCommon("reset")}
            </button>
          )}
        </form>

        <span className="text-sm text-zinc-500">{t("totalCount", { count: total.toLocaleString() })}</span>
        <button
          type="button"
          onClick={() => void load()}
          className="ml-auto text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          {t("refresh")}
        </button>
      </div>

      {loadError && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {loadError}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">{tCommon("loading")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                <th className="px-3 py-2 font-medium">{t("colTime")}</th>
                <th className="px-3 py-2 font-medium">{t("colNickname")}</th>
                <th className="px-3 py-2 font-medium">{t("colAction")}</th>
                <th className="px-3 py-2 font-medium">{t("colDetail")}</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-zinc-500">{t("noLogs")}</td>
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
                        <DetailCell action={row.action} detail={row.detail} t={t} />
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
            {tCommon("prev")}
          </button>
          <span className="text-sm text-zinc-600 dark:text-zinc-400">{page} / {totalPages}</span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded border border-zinc-300 px-3 py-1 text-sm disabled:opacity-40 dark:border-zinc-600"
          >
            {tCommon("next")}
          </button>
        </div>
      )}
    </div>
  );
}
