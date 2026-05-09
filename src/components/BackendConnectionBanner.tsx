"use client";

import { useCallback, useEffect, useState } from "react";

type CheckResult =
  | { ok: true }
  | { ok: false; backendUrl: string };

const POLL_MS = 20_000;

export default function BackendConnectionBanner({
  enabled,
}: {
  enabled: boolean;
}) {
  const [disconnected, setDisconnected] = useState<boolean | null>(null);
  const [backendUrl, setBackendUrl] = useState<string | null>(null);

  const runCheck = useCallback(async () => {
    try {
      const res = await fetch("/backend-connection-check", {
        cache: "no-store",
      });
      const data = (await res.json()) as CheckResult;
      if (data.ok) {
        setDisconnected(false);
        setBackendUrl(null);
      } else {
        setDisconnected(true);
        setBackendUrl("backendUrl" in data ? data.backendUrl : null);
      }
    } catch {
      setDisconnected(true);
      setBackendUrl(null);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    void runCheck();
    const id = window.setInterval(() => void runCheck(), POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled, runCheck]);

  if (!enabled || disconnected !== true) return null;

  return (
    <div
      role="status"
      className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-center text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/80 dark:text-amber-100"
    >
      백엔드 서버에 연결되지 않았습니다. API 서버가 켜져 있는지 확인해 주세요.
      {backendUrl ? (
        <span className="mt-1 block font-mono text-xs opacity-90">
          (설정 주소: {backendUrl})
        </span>
      ) : null}
    </div>
  );
}
