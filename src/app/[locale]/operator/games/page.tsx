"use client";

import { useCallback, useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { api, session, type UgcGame, type GameSecurityScan } from "@/lib/api";
import { useTranslations } from "next-intl";

type Tab = "pending" | "updates";

function formatDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
}

function sevClass(sev: string) {
  return sev === "critical"
    ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
    : sev === "warn"
      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
}

export default function OperatorGamesPage() {
  const t = useTranslations("OperatorGames");
  const [isOperator, setIsOperator] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("pending");
  const [games, setGames] = useState<UgcGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // slug → 스캔 상태
  const [scans, setScans] = useState<Record<string, GameSecurityScan | "loading" | "error">>({});

  useEffect(() => {
    // 클라이언트 전용 auth 상태(localStorage) — 마운트 후에만 읽을 수 있어 effect 에서 set (의도된 패턴).
    const user = session.getUser();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsOperator(!!user?.isOperator);
  }, []);

  const load = useCallback(async () => {
    const token = session.getToken();
    if (!token) return;
    setLoading(true);
    setScans({});
    try {
      const res =
        tab === "pending"
          ? await api.operatorListPendingGames(token)
          : await api.operatorListPendingUpdates(token);
      setGames(res.games ?? []);
    } catch {
      setGames([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    // operator 확인 후 1회 데이터 로드 — load 가 동기적으로 setLoading 하나 의도된 fetch 트리거.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isOperator) load();
  }, [isOperator, load]);

  async function runScan(slug: string) {
    const token = session.getToken();
    if (!token) return;
    const which = tab === "updates" ? "pending" : "live";
    setScans((s) => ({ ...s, [slug]: "loading" }));
    try {
      const res = await api.operatorGameSecurityScan(token, slug, which);
      setScans((s) => ({ ...s, [slug]: res.scan }));
    } catch {
      setScans((s) => ({ ...s, [slug]: "error" }));
    }
  }

  async function approve(slug: string) {
    const token = session.getToken();
    if (!token) return;
    setBusy(slug);
    try {
      if (tab === "pending") await api.operatorApproveGame(token, slug);
      else await api.operatorApproveUpdate(token, slug);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function reject(slug: string) {
    const token = session.getToken();
    if (!token) return;
    const reason = window.prompt(t("rejectPrompt"));
    if (!reason || !reason.trim()) return;
    setBusy(slug);
    try {
      if (tab === "pending") await api.operatorRejectGame(token, slug, reason.trim());
      else await api.operatorRejectUpdate(token, slug, reason.trim());
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (isOperator === null) {
    return <section className="mx-auto max-w-3xl px-4 py-12 text-sm text-zinc-500">{t("loading")}</section>;
  }
  if (!isOperator) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-sm text-zinc-500">{t("notOperator")}</p>
        <p className="mt-6"><Link href="/" className="text-blue-600 hover:underline">{t("backHome")}</Link></p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
      <h1 className="mb-2 text-2xl font-bold tracking-tight">{t("title")}</h1>
      <p className="mb-6 text-sm text-zinc-500">{t("scanNote")}</p>

      {/* 탭 */}
      <div className="mb-6 flex gap-2">
        {(["pending", "updates"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              tab === k
                ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
            }`}
          >
            {k === "pending" ? t("tabPending") : t("tabUpdates")}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">{t("loading")}</p>
      ) : games.length === 0 ? (
        <p className="text-sm text-zinc-500">{tab === "pending" ? t("empty") : t("emptyUpdates")}</p>
      ) : (
        <ul className="space-y-4">
          {games.map((g) => {
            const scan = scans[g.slug];
            return (
              <li key={g.slug} className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{g.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{g.title}</p>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      {g.slug} · {g.category}
                      {tab === "updates" ? ` · v${g.version} → v${g.pendingVersion ?? "?"}` : ""}
                      {" · "}{formatDate(tab === "updates" ? g.pendingUploadedAt : g.createdAt)}
                    </p>
                    {g.description && <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{g.description}</p>}
                  </div>
                </div>

                {/* 스캔 영역 */}
                <div className="mt-4 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
                  {!scan ? (
                    <button onClick={() => runScan(g.slug)} className="text-sm font-medium text-blue-600 hover:underline">
                      🔍 {t("scanBtn")}
                    </button>
                  ) : scan === "loading" ? (
                    <p className="text-sm text-zinc-500">{t("scanning")}</p>
                  ) : scan === "error" ? (
                    <p className="text-sm text-red-600">{t("scanError")}</p>
                  ) : (
                    <ScanReport scan={scan} t={t} onRescan={() => runScan(g.slug)} />
                  )}
                </div>

                {/* 액션 */}
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => approve(g.slug)}
                    disabled={busy === g.slug}
                    className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
                  >
                    {t("approve")}
                  </button>
                  <button
                    onClick={() => reject(g.slug)}
                    disabled={busy === g.slug}
                    className="rounded-md border border-red-300 px-4 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    {t("reject")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-10 text-center text-sm text-zinc-500">
        <Link href="/" className="text-blue-600 hover:underline">{t("backHome")}</Link>
      </p>
    </section>
  );
}

function ScanReport({
  scan,
  t,
  onRescan,
}: {
  scan: GameSecurityScan;
  t: ReturnType<typeof useTranslations>;
  onRescan: () => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {scan.counts.critical > 0 && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sevClass("critical")}`}>
            {t("severityCritical")} {scan.counts.critical}
          </span>
        )}
        {scan.counts.warn > 0 && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sevClass("warn")}`}>
            {t("severityWarn")} {scan.counts.warn}
          </span>
        )}
        {scan.counts.info > 0 && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sevClass("info")}`}>
            {t("severityInfo")} {scan.counts.info}
          </span>
        )}
        {scan.maxSeverity === "none" && (
          <span className="text-sm font-medium text-green-700 dark:text-green-400">✓ {t("scanClean")}</span>
        )}
        <span className="ml-auto text-xs text-zinc-400">{t("scannedFiles", { n: scan.scannedFiles })}</span>
        <button onClick={onRescan} className="text-xs text-blue-600 hover:underline">{t("rescan")}</button>
      </div>

      {scan.findings.length > 0 && (
        <ul className="mt-3 max-h-56 space-y-1.5 overflow-y-auto">
          {scan.findings.map((f, i) => (
            <li key={i} className="rounded-md border border-zinc-200 bg-white p-2 text-xs dark:border-zinc-700 dark:bg-zinc-900">
              <div className="flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 font-semibold ${sevClass(f.severity)}`}>{f.id}</span>
                <span className="truncate text-zinc-500">{f.file}:{f.line}</span>
              </div>
              <p className="mt-1 text-zinc-600 dark:text-zinc-400">{f.desc}</p>
              <pre className="mt-1 overflow-x-auto rounded bg-zinc-100 px-2 py-1 font-mono text-[11px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{f.snippet}</pre>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
