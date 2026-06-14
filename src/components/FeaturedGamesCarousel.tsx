"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { SESSION_CHANGE_EVENT, session, api, type GameCategory as ApiCategory } from "@/lib/api";
import { saveLastGameId } from "@/lib/lastGame";
import type { Game } from "@/components/GameCard";
import AlphaGateModal, { useCanPlay } from "@/components/AlphaGateModal";

const CAT_GRADIENT: Record<string, string> = {
  earn:      "from-amber-500  to-orange-600",
  multiplay: "from-blue-600   to-cyan-500",
  decorate:  "from-pink-500   to-rose-400",
  other:     "from-violet-600 to-purple-700",
};
const CAT_LABEL: Record<string, string> = {
  earn: "돈 버는 게임", multiplay: "멀티플레이", decorate: "꾸미기", other: "기타",
};

function gameHrefWithToken(url: string, token: string | null): string {
  if (!token) return url;
  const api = (process.env.NEXT_PUBLIC_STANDALONE_GAMES_API_URL ?? "").trim();
  const q   = api ? `&platformApi=${encodeURIComponent(api)}` : "";
  return `${url.replace(/\/+$/, "") + "/"}?token=${encodeURIComponent(token)}${q}`;
}

const INTERVAL_MS = 5000;

export default function FeaturedGamesCarousel({ games }: { games: Game[] }) {
  const t      = useTranslations("Games");
  const locale = useLocale();
  const [current,    setCurrent]    = useState(0);
  const [paused,     setPaused]     = useState(false);
  const [token,      setToken]      = useState<string | null>(null);
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const allowed = useCanPlay();
  const [gateOpen, setGateOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const sync = () => setToken(session.getToken());
    sync();
    window.addEventListener(SESSION_CHANGE_EVENT, sync);
    void api.getCategories().then((r) => setCategories(r.categories)).catch(() => {});
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, sync);
  }, []);

  const catLabel = (slug: string) => {
    const cat = categories.find((c) => c.slug === slug);
    if (cat) return locale === "ko" ? cat.labelKo : cat.labelEn;
    return CAT_LABEL[slug] ?? slug;
  };

  const next = useCallback(() => setCurrent((c) => (c + 1) % games.length), [games.length]);
  const prev = useCallback(() => setCurrent((c) => (c - 1 + games.length) % games.length), [games.length]);

  // 자동 슬라이드
  useEffect(() => {
    if (games.length <= 1 || paused) return;
    timerRef.current = setInterval(next, INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [games.length, paused, next]);

  if (games.length === 0) return null;

  return (
    <div
      className="relative mb-6 overflow-hidden rounded-2xl shadow-lg"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* ── 슬라이드 트랙 ── */}
      <div
        className="flex transition-transform duration-700 ease-in-out"
        style={{ transform: `translateX(-${current * 100}%)` }}
      >
        {games.map((game) => {
          const cat      = game.category ?? "other";
          const gradient = CAT_GRADIENT[cat] ?? CAT_GRADIENT.other;
          const playHref = gameHrefWithToken(game.url, token);

          return (
            <div key={game.id} className="relative min-w-full">
              {/* 배경 */}
              <div className="absolute inset-0">
                {game.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={game.thumbnailUrl}
                    alt={game.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className={`h-full w-full bg-gradient-to-br ${gradient}`}>
                    <div className="absolute right-8 top-1/2 -translate-y-1/2 hidden text-[10rem] opacity-20 select-none sm:block">
                      {game.emoji}
                    </div>
                  </div>
                )}
                {/* 왼쪽 오버레이 */}
                <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
              </div>

              {/* 피처드 텍스트 — locale별 → fallback to featuredText */}
              {(() => { const ft = game.featuredTextsI18n?.[locale] || game.featuredTextsI18n?.['en'] || game.featuredText; return ft && (
                <div
                  className="absolute hidden sm:block pointer-events-none"
                  style={{
                    left: `${game.featuredTextX ?? 75}%`,
                    top: `${game.featuredTextY ?? 50}%`,
                    transform: "translate(-50%, -50%)",
                    maxWidth: "36%",
                    width: "36%",
                    zIndex: 5,
                  }}
                >
                  <p
                    className="text-center font-black leading-snug tracking-tight text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.9)] whitespace-pre-line"
                    style={{ fontSize: "clamp(0.65rem, 2vw, 1.5rem)" }}
                  >
                    {ft}
                  </p>
                </div>
              ); })()}

              {/* 텍스트 컨텐츠 — pl-14 로 좌측 화살표 버튼과 겹침 방지 */}
              <div className="relative flex min-h-[300px] flex-col justify-end p-8 pl-14 sm:min-h-[380px] sm:max-w-[58%]">
                <span className="mb-3 w-fit rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                  {catLabel(cat)}
                </span>
                <h2 className="mb-2 text-3xl font-bold leading-tight text-white drop-shadow-lg sm:text-4xl">
                  {game.titlesI18n?.[locale] || game.titlesI18n?.['en'] || game.title}
                </h2>
                {(game.descriptionsI18n?.[locale] || game.descriptionsI18n?.['en'] || game.description) && (
                  <p className="mb-5 line-clamp-2 text-sm text-white/70 sm:text-base">
                    {game.descriptionsI18n?.[locale] || game.descriptionsI18n?.['en'] || game.description}
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  {allowed ? (
                    <a
                      href={playHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => saveLastGameId(game.id)}
                      className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-gray-900 shadow-md transition hover:bg-gray-100 hover:shadow-lg active:scale-95"
                    >
                      {t("featuredPlay")}
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setGateOpen(true)}
                      className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-gray-900 shadow-md transition hover:bg-gray-100 hover:shadow-lg active:scale-95"
                    >
                      {t("featuredPlay")}
                    </button>
                  )}
                  <Link
                    href={`/games/${game.id}`}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/40 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
                  >
                    {t("featuredDetails")}
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 화살표 ── */}
      {games.length > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            className="absolute left-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60"
            aria-label="이전"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={next}
            className="absolute right-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60"
            aria-label="다음"
          >
            ›
          </button>
        </>
      )}

      {/* ── 점 인디케이터 ── */}
      {games.length > 1 && (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
          {games.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setCurrent(i)}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === current ? "w-6 bg-white" : "w-2 bg-white/40 hover:bg-white/70"
              }`}
              aria-label={`슬라이드 ${i + 1}`}
            />
          ))}
        </div>
      )}

      {/* ── 프로그레스 바 ── */}
      {games.length > 1 && !paused && (
        <div className="absolute bottom-0 left-0 h-0.5 w-full bg-white/20">
          <div
            key={current}
            className="h-full bg-white/60"
            style={{ animation: `carousel-progress ${INTERVAL_MS}ms linear` }}
          />
        </div>
      )}

      <style>{`
        @keyframes carousel-progress {
          from { width: 0% }
          to   { width: 100% }
        }
      `}</style>

      {gateOpen && <AlphaGateModal onClose={() => setGateOpen(false)} />}
    </div>
  );
}
