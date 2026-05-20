"use client";

import { Link, useRouter } from "@/i18n/navigation";
import { useEffect, useState, use } from "react";
import { api, session, ApiError } from "@/lib/api";
import { useTranslations } from "next-intl";

type GameInfo = {
  slug: string;
  title: string;
  description: string | null;
  emoji: string;
  kind: "official" | "community";
  category: string;
  tags: string[];
  thumbnailUrl: string | null;
  screenshots: string[];
  url: string;
};

export default function GamePlayPage({ params }: { params: Promise<{ slug: string; locale: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const t = useTranslations("GamePlay");
  const tCommon = useTranslations("Common");

  const [game, setGame] = useState<GameInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);

  useEffect(() => {
    api.getGame(slug)
      .then((res) => {
        setGame(res.game as GameInfo);
        // official 게임만 platform JWT 를 ?token= 으로 전달 (community 는 token 없음 — Common API 차단 정책)
        const base = res.game.url;
        if (res.game.kind === "official") {
          const tk = session.getToken();
          if (tk) {
            const sep = base.includes("?") ? "&" : "?";
            setIframeSrc(`${base}${sep}token=${encodeURIComponent(tk)}`);
          } else {
            // 비로그인 official 게임 진입 시 로그인으로 보냄
            router.replace("/login");
            return;
          }
        } else {
          setIframeSrc(base);
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setLoadError(t("notFound"));
        } else {
          setLoadError(err instanceof ApiError ? err.message : t("loadFailed"));
        }
      });
  }, [slug, router, t]);

  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">{loadError}</h1>
        <Link href="/games" className="mt-6 inline-block text-sm text-blue-600 hover:underline">
          {t("backToList")}
        </Link>
      </div>
    );
  }

  if (!game || !iframeSrc) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center text-sm text-zinc-500">
        {tCommon("loading")}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-2 py-4 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-baseline gap-3">
          <span className="text-2xl leading-none">{game.emoji}</span>
          <h1 className="text-lg font-semibold sm:text-xl">{game.title}</h1>
          {game.kind === "community" && (
            <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-900/40 dark:text-purple-200">
              {t("communityBadge")}
            </span>
          )}
          {game.kind === "official" && (
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
              {t("officialBadge")}
            </span>
          )}
        </div>
        <Link href="/games" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          {t("backToList")}
        </Link>
      </div>

      <div className="aspect-[16/10] w-full overflow-hidden rounded-xl border border-zinc-200 bg-black dark:border-zinc-800">
        <iframe
          src={iframeSrc}
          title={game.title}
          className="h-full w-full"
          sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-popups allow-forms"
          allow="fullscreen; gamepad"
        />
      </div>

      {game.description && (
        <p className="px-1 text-sm text-zinc-600 dark:text-zinc-400">{game.description}</p>
      )}
    </div>
  );
}
