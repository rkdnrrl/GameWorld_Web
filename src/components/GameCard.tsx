"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { SESSION_CHANGE_EVENT, session } from "@/lib/api";
import { saveLastGameId } from "@/lib/lastGame";

export type GameCategory = string;

export type Game = {
  id: string;
  title: string;
  description: string;
  url: string;
  emoji: string;
  tags: string[];
  players: number | null;
  rooms: number | null;
  maxPlayers?: number | null;
  category?: GameCategory;
  kind?: string;
  thumbnailUrl?: string | null;
  playCount?: number | null;
  likeCount?: number | null;
  ratingAvg?: number | null;
  ratingCount?: number | null;
  isFeatured?: boolean;
  featuredText?: string | null;
  ownerNickname?: string | null;
};

// 카테고리별 색상 (썸네일 bg + 텍스트)
const CAT_BG: Record<string, string> = {
  earn:      "from-amber-400  to-orange-500",
  multiplay: "from-sky-500    to-blue-600",
  decorate:  "from-pink-400   to-rose-500",
  other:     "from-violet-500 to-purple-600",
};
const CAT_TEXT: Record<string, string> = {
  earn:      "text-amber-600",
  multiplay: "text-sky-600",
  decorate:  "text-pink-600",
  other:     "text-violet-600",
};

function catKey(cat: GameCategory) {
  return { earn:"categoryEarn", multiplay:"categoryMultiplay", decorate:"categoryDecorate", other:"categoryOther" }[cat] as
    "categoryEarn" | "categoryMultiplay" | "categoryDecorate" | "categoryOther";
}

function gameHrefWithToken(baseUrl: string, token: string): string {
  let u = String(baseUrl || "").trim();
  if (!u) return u;
  const hi = u.indexOf("#"); let hash = "";
  if (hi !== -1) { hash = u.slice(hi); u = u.slice(0, hi); }
  const api = (process.env.NEXT_PUBLIC_STANDALONE_GAMES_API_URL ?? "").trim();
  const q   = api ? `&platformApi=${encodeURIComponent(api)}` : "";
  if (u.includes("?")) return `${u}&token=${encodeURIComponent(token)}${q}${hash}`;
  return `${u.replace(/\/+$/, "") + "/"}?token=${encodeURIComponent(token)}${q}${hash}`;
}

function fmt(n?: number | null) {
  if (!n) return null;
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

// ── 별점 컴포넌트 ─────────────────────────────────────────────────────────────
function Stars({
  avg, count, canRate, onRate,
}: { avg: number; count: number; canRate: boolean; onRate: (r: number) => void }) {
  const t = useTranslations("Games");
  const [hov, setHov] = useState(0);
  const fill = hov || avg;

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.preventDefault()}>
      {/* 별 */}
      <div className="flex">
        {[1,2,3,4,5].map((n) => (
          <button key={n} type="button" disabled={!canRate}
            onClick={() => onRate(n)}
            onMouseEnter={() => canRate && setHov(n)}
            onMouseLeave={() => setHov(0)}
            title={canRate ? undefined : t("loginToRate")}
            className={`text-[14px] leading-none transition-transform ${
              n <= Math.round(fill) ? "text-amber-400" : "text-gray-200"
            } ${canRate ? "cursor-pointer hover:scale-125" : "cursor-default"}`}
          >★</button>
        ))}
      </div>
      {/* 점수 */}
      {count > 0 ? (
        <span className="text-[11px] text-gray-400">
          <span className="font-medium text-gray-600">{avg.toFixed(1)}</span>
          {" "}({count})
        </span>
      ) : (
        <span className="text-[11px] text-gray-300">{t("noRating")}</span>
      )}
    </div>
  );
}

// ── 카드 ─────────────────────────────────────────────────────────────────────
export default function GameCard({ game }: { game: Game }) {
  const t = useTranslations("Games");
  const router = useRouter();
  const [token,       setToken]       = useState<string | null>(null);
  const [ratingAvg,   setRatingAvg]   = useState(game.ratingAvg   ?? 0);
  const [ratingCount, setRatingCount] = useState(game.ratingCount ?? 0);

  useEffect(() => {
    const sync = () => setToken(session.getToken());
    sync();
    window.addEventListener(SESSION_CHANGE_EVENT, sync);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, sync);
  }, []);

  // 카드 클릭 → 상세 페이지 (게임 실행은 상세 페이지에서)
  const href = `/games/${game.id}`;
  const cat  = (game.category ?? "other") as GameCategory;

  async function handleRate(rating: number) {
    if (!token) return;
    const base = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
    try {
      const res = await fetch(`${base}/api/games/${game.id}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating }),
      });
      if (res.ok) { const d = await res.json(); setRatingAvg(d.avg); setRatingCount(d.count); }
    } catch {}
  }

  const plays = fmt(game.playCount);

  return (
    <a
      href={href}
      onClick={() => { /* lastGame은 Play 버튼에서 기록 */ }}
      className="group flex flex-col overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-gray-200 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-gray-300"
    >
      {/* ── 썸네일 ────────────────────────────────────────────────── */}
      <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
        {game.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={game.thumbnailUrl} alt={game.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br ${CAT_BG[cat] ?? CAT_BG.other}`}>
            <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
            <div className="pointer-events-none absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-black/10" />
            <span className="relative text-6xl drop-shadow transition-transform duration-300 group-hover:scale-110">
              {game.emoji}
            </span>
          </div>
        )}

        {/* 호버 → 플레이 오버레이 */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span className="rounded-full bg-white px-5 py-2 text-sm font-bold text-gray-900 shadow-lg">
            ▶ {t("playNow")}
          </span>
        </div>

        {/* 접속자 수 (우상단) */}
        {game.players !== null && (
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[11px] text-white backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
            {game.players}명
          </div>
        )}
      </div>

      {/* ── 카드 정보 ─────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-1 p-3">

        {/* 카테고리 + 공식 뱃지 */}
        <div className="flex items-center gap-1.5">
          <span className={`text-[11px] font-medium ${CAT_TEXT[cat] ?? CAT_TEXT.other}`}>
            {t(catKey(cat))}
          </span>
          {game.kind === "official" && (
            <span className="rounded bg-indigo-100 px-1.5 py-px text-[10px] font-semibold text-indigo-600">
              {t("kindOfficial")}
            </span>
          )}
        </div>

        {/* 타이틀 */}
        <h2 className="line-clamp-2 text-[13px] font-semibold leading-snug text-gray-900">
          {game.title}
        </h2>

        {/* 개발자 이름 */}
        {game.ownerNickname && (
          <span
            role="link"
            tabIndex={0}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              router.push(`/developer/${encodeURIComponent(game.ownerNickname!)}`);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                router.push(`/developer/${encodeURIComponent(game.ownerNickname!)}`);
              }
            }}
            className="w-fit cursor-pointer text-[11px] text-gray-400 hover:text-blue-600 hover:underline"
          >
            {game.ownerNickname}
          </span>
        )}

        {/* 별점 */}
        <Stars avg={ratingAvg} count={ratingCount} canRate={!!token} onRate={handleRate} />

        {/* 플레이 수 */}
        {plays && (
          <p className="mt-0.5 text-[11px] text-gray-400">👁 {plays}</p>
        )}
      </div>
    </a>
  );
}
