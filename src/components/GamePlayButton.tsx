"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { session, SESSION_CHANGE_EVENT } from "@/lib/api";
import { saveLastGameId } from "@/lib/lastGame";

export default function GamePlayButton({ gameId, gameUrl }: { gameId: string; gameUrl: string }) {
  const t = useTranslations("GameDetail");
  const [href, setHref] = useState(gameUrl);

  useEffect(() => {
    const sync = () => {
      const token = session.getToken();
      if (!token) { setHref(gameUrl); return; }

      const standaloneApi = (process.env.NEXT_PUBLIC_STANDALONE_GAMES_API_URL ?? "").trim();
      const apiQ = standaloneApi ? `&platformApi=${encodeURIComponent(standaloneApi)}` : "";
      const base = gameUrl.replace(/\/+$/, "") + "/";
      setHref(`${base}?token=${encodeURIComponent(token)}${apiQ}`);
    };
    sync();
    window.addEventListener(SESSION_CHANGE_EVENT, sync);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, sync);
  }, [gameUrl]);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => saveLastGameId(gameId)}
      className="inline-flex items-center gap-2 rounded-xl bg-[#0170bd] px-8 py-3.5 text-base font-bold text-white shadow-md transition-all hover:bg-blue-700 hover:shadow-lg active:scale-95"
    >
      {t("play")}
    </a>
  );
}
