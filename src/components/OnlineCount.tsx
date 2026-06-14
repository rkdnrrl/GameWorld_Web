"use client";
/**
 * 현재 접속 인원 배지 — 공개 count 엔드포인트(/api/presence/count)를 주기적으로 폴링.
 * variant: "inline"(작은 배지) | "hero"(랜딩 강조).
 * 로딩 중(count=null)엔 렌더 안 함 — 0→실제값 깜빡임 방지.
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useTranslations } from "next-intl";

const REFRESH_MS = 25_000;

export default function OnlineCount({ variant = "inline" }: { variant?: "inline" | "hero" }) {
  const t = useTranslations("Presence");
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api.presenceCount().then((r) => { if (alive) setCount(r.count); }).catch(() => {});
    load();
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      load();
    }, REFRESH_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (count === null) return null;

  if (variant === "hero") {
    return (
      <p className="inline-flex items-center gap-2 rounded-full border border-green-400/30 bg-green-500/15 px-4 py-1.5 text-sm font-medium text-green-300">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
        </span>
        {t("onlineHero", { n: count })}
      </p>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/15 px-2.5 py-1 text-xs font-semibold text-green-600 dark:text-green-300">
      <span className="h-2 w-2 rounded-full bg-green-500" />
      {t("online", { n: count })}
    </span>
  );
}
