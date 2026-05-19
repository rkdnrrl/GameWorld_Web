"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SESSION_CHANGE_EVENT, session } from "@/lib/api";

type GameSummary = { id: string; url: string };

/* ── 월드 설정 ───────────────────────────────────────────── */
const TILE = 32;            // 타일 한 변
const GRID_W = 20;          // 가로 타일 수
const GRID_H = 13;          // 세로 타일 수
const WORLD_W = TILE * GRID_W;
const WORLD_H = TILE * GRID_H;

const PLAYER_SPEED = 130;   // px/sec
const PLAYER_SIZE = 24;

type Building = {
  id: string;
  gameId: string;          // /api/games 의 id 매칭
  emoji: string;
  label: string;
  // 픽셀 좌표 (좌상단)
  x: number; y: number;
  w: number; h: number;
  // 입장 트리거 영역 (문 앞)
  doorX: number; doorY: number; doorW: number; doorH: number;
  color: string;
  roofColor: string;
};

const BUILDINGS: Building[] = [
  // 낚시 — 왼쪽
  {
    id: "fishing",
    gameId: "space-fishing",
    emoji: "🎣",
    label: "낚시터",
    x: TILE * 2, y: TILE * 3, w: TILE * 4, h: TILE * 4,
    doorX: TILE * 3, doorY: TILE * 7 - 4, doorW: TILE * 2, doorH: TILE,
    color: "#3b82f6",
    roofColor: "#1e40af",
  },
  // 대장간 — 가운데
  {
    id: "blacksmith",
    gameId: "blacksmith",
    emoji: "⚒️",
    label: "대장간",
    x: TILE * 8, y: TILE * 2, w: TILE * 4, h: TILE * 5,
    doorX: TILE * 9, doorY: TILE * 7 - 4, doorW: TILE * 2, doorH: TILE,
    color: "#f97316",
    roofColor: "#9a3412",
  },
  // 던전 — 오른쪽
  {
    id: "dungeon",
    gameId: "dungeon",
    emoji: "🏰",
    label: "던전",
    x: TILE * 14, y: TILE * 3, w: TILE * 4, h: TILE * 4,
    doorX: TILE * 15, doorY: TILE * 7 - 4, doorW: TILE * 2, doorH: TILE,
    color: "#8b5cf6",
    roofColor: "#4c1d95",
  },
];

function gameHrefWithToken(baseUrl: string, token: string | null, locale: string): string {
  const u = String(baseUrl || "").trim();
  if (!u) return u;
  if (!token) return u;
  const standaloneApi = (process.env.NEXT_PUBLIC_STANDALONE_GAMES_API_URL ?? "").trim();
  const apiQ = standaloneApi ? `&platformApi=${encodeURIComponent(standaloneApi)}` : "";
  const webOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const webQ = webOrigin ? `&platformWeb=${encodeURIComponent(webOrigin)}` : "";
  const langQ = locale ? `&lang=${encodeURIComponent(locale)}` : "";
  return u.replace(/\/+$/, "") + `/?token=${encodeURIComponent(token)}${apiQ}${webQ}${langQ}`;
}

function rectsOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export default function DungeonHomeScene() {
  const tHome = useTranslations("Home");
  const locale = useLocale();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hint, setHint] = useState<string>("");
  const [navigating, setNavigating] = useState(false);
  const tokenRef = useRef<string | null>(null);
  const gamesRef = useRef<Map<string, string>>(new Map());

  // 세션 토큰 추적
  useEffect(() => {
    const sync = () => { tokenRef.current = session.getToken(); };
    sync();
    window.addEventListener(SESSION_CHANGE_EVENT, sync);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, sync);
  }, []);

  // 게임 URL 로드
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/games", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json() as { games?: GameSummary[] };
        const m = new Map<string, string>();
        for (const g of data.games || []) {
          if (g.id && g.url) m.set(g.id, g.url);
        }
        gamesRef.current = m;
      } catch { /* 폴백 없음 — 클릭 시 안내만 */ }
    })();
  }, []);

  const navigateToGame = useCallback((gameId: string) => {
    if (navigating) return;
    const url = gamesRef.current.get(gameId);
    if (!url) {
      setHint("게임을 찾을 수 없습니다. /games 페이지로 이동합니다.");
      setNavigating(true);
      setTimeout(() => { window.location.href = `/${locale}/games`; }, 800);
      return;
    }
    setNavigating(true);
    const href = gameHrefWithToken(url, tokenRef.current, locale);
    window.location.href = href;
  }, [locale, navigating]);

  /* ── 게임 루프 ─────────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    // 캐릭터 상태
    const player = {
      x: WORLD_W / 2 - PLAYER_SIZE / 2,
      y: WORLD_H - TILE * 2,
      vx: 0, vy: 0,
      facing: "down" as "up" | "down" | "left" | "right",
    };

    const keys = new Set<string>();
    const touch = { dx: 0, dy: 0, active: false };

    const onKey = (e: KeyboardEvent, down: boolean) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(k)) {
        e.preventDefault();
        if (down) keys.add(k); else keys.delete(k);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => onKey(e, true);
    const onKeyUp = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let lastTs = performance.now();
    let raf = 0;
    let entered: string | null = null;

    function update(dt: number) {
      // 입력 → 속도
      let vx = 0, vy = 0;
      if (keys.has("arrowleft") || keys.has("a")) vx -= 1;
      if (keys.has("arrowright") || keys.has("d")) vx += 1;
      if (keys.has("arrowup") || keys.has("w")) vy -= 1;
      if (keys.has("arrowdown") || keys.has("s")) vy += 1;
      if (touch.active) { vx += touch.dx; vy += touch.dy; }
      const len = Math.hypot(vx, vy);
      if (len > 0) {
        vx /= len; vy /= len;
        // facing
        if (Math.abs(vx) > Math.abs(vy)) player.facing = vx > 0 ? "right" : "left";
        else player.facing = vy > 0 ? "down" : "up";
      }
      player.vx = vx * PLAYER_SPEED;
      player.vy = vy * PLAYER_SPEED;

      // 이동 + 충돌 (건물 본체는 통과 못 함)
      const nx = Math.max(0, Math.min(WORLD_W - PLAYER_SIZE, player.x + player.vx * dt));
      const ny = Math.max(0, Math.min(WORLD_H - PLAYER_SIZE, player.y + player.vy * dt));
      // X 축
      let collidedX = false;
      for (const b of BUILDINGS) {
        if (rectsOverlap(nx, player.y, PLAYER_SIZE, PLAYER_SIZE, b.x, b.y, b.w, b.h)) {
          collidedX = true; break;
        }
      }
      if (!collidedX) player.x = nx;
      // Y 축
      let collidedY = false;
      for (const b of BUILDINGS) {
        if (rectsOverlap(player.x, ny, PLAYER_SIZE, PLAYER_SIZE, b.x, b.y, b.w, b.h)) {
          collidedY = true; break;
        }
      }
      if (!collidedY) player.y = ny;

      // 입장 트리거 (문 영역과 겹침)
      let now: string | null = null;
      for (const b of BUILDINGS) {
        if (rectsOverlap(player.x, player.y, PLAYER_SIZE, PLAYER_SIZE,
                         b.doorX, b.doorY, b.doorW, b.doorH)) {
          now = b.id; break;
        }
      }
      if (now && now !== entered) {
        entered = now;
        const b = BUILDINGS.find((x) => x.id === now)!;
        setHint(`${b.emoji} ${b.label}로 입장 중…`);
        navigateToGame(b.gameId);
      } else if (!now && entered) {
        entered = null;
        setHint("");
      }
    }

    function draw() {
      if (!ctx) return;
      // 화면 크기에 맞춰 캔버스 픽셀 비율 설정
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const wantW = WORLD_W * dpr;
      const wantH = WORLD_H * dpr;
      if (canvas!.width !== wantW || canvas!.height !== wantH) {
        canvas!.width = wantW; canvas!.height = wantH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // 배경 — 어두운 돌바닥
      ctx.fillStyle = "#1f2937";
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      // 타일 패턴
      ctx.fillStyle = "#111827";
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          if ((x + y) % 2 === 0) ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        }
      }
      // 격자 라인 (희미하게)
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= GRID_W; x++) {
        ctx.beginPath(); ctx.moveTo(x * TILE, 0); ctx.lineTo(x * TILE, WORLD_H); ctx.stroke();
      }
      for (let y = 0; y <= GRID_H; y++) {
        ctx.beginPath(); ctx.moveTo(0, y * TILE); ctx.lineTo(WORLD_W, y * TILE); ctx.stroke();
      }

      // 건물
      for (const b of BUILDINGS) {
        // 몸체
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x, b.y + TILE * 0.8, b.w, b.h - TILE * 0.8);
        // 지붕 (삼각)
        ctx.fillStyle = b.roofColor;
        ctx.beginPath();
        ctx.moveTo(b.x - 8, b.y + TILE * 1.1);
        ctx.lineTo(b.x + b.w / 2, b.y);
        ctx.lineTo(b.x + b.w + 8, b.y + TILE * 1.1);
        ctx.closePath();
        ctx.fill();
        // 문
        ctx.fillStyle = "#1c1917";
        const doorX = b.x + b.w / 2 - TILE * 0.6;
        const doorY = b.y + b.h - TILE * 1.4;
        ctx.fillRect(doorX, doorY, TILE * 1.2, TILE * 1.4);
        // 이모지 + 라벨
        ctx.font = "26px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#fff";
        ctx.fillText(b.emoji, b.x + b.w / 2, b.y + b.h / 2 - 8);
        ctx.font = "bold 12px sans-serif";
        ctx.fillStyle = "#fff";
        ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 14);

        // 문 앞 트리거 영역 표시 (살짝)
        ctx.fillStyle = "rgba(250, 204, 21, 0.18)";
        ctx.fillRect(b.doorX, b.doorY, b.doorW, b.doorH);
      }

      // 플레이어 — 픽셀 캐릭터
      const px = Math.round(player.x);
      const py = Math.round(player.y);
      // 그림자
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(px + PLAYER_SIZE / 2, py + PLAYER_SIZE + 2, PLAYER_SIZE * 0.45, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      // 몸
      ctx.fillStyle = "#fcd34d"; // 노란 모험가
      ctx.fillRect(px + 4, py + 8, PLAYER_SIZE - 8, PLAYER_SIZE - 10);
      // 머리
      ctx.fillStyle = "#fde68a";
      ctx.fillRect(px + 6, py, PLAYER_SIZE - 12, 10);
      // 눈 (facing 따라)
      ctx.fillStyle = "#1f2937";
      if (player.facing === "down" || player.facing === "up") {
        ctx.fillRect(px + 8, py + 4, 2, 2);
        ctx.fillRect(px + PLAYER_SIZE - 10, py + 4, 2, 2);
      } else if (player.facing === "right") {
        ctx.fillRect(px + PLAYER_SIZE - 10, py + 4, 2, 2);
      } else {
        ctx.fillRect(px + 8, py + 4, 2, 2);
      }
    }

    function tick(now: number) {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;
      update(dt);
      draw();
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    /* 터치 컨트롤 */
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      if (!t) return;
      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = t.clientX - cx;
      const dy = t.clientY - cy;
      const len = Math.hypot(dx, dy) || 1;
      touch.active = true;
      touch.dx = dx / len;
      touch.dy = dy / len;
    };
    const onTouchMove = onTouchStart;
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      touch.active = false;
      touch.dx = 0; touch.dy = 0;
    };
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    canvas.addEventListener("touchcancel", onTouchEnd, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [navigateToGame]);

  return (
    <div ref={containerRef} className="mx-auto w-full max-w-[900px] px-2">
      <div className="mb-3 text-center text-sm text-zinc-400">
        {tHome("dungeonHint") /* 이동: WASD/방향키 또는 터치 · 건물 앞 문 영역으로 들어가면 게임 시작 */}
      </div>
      <div className="relative w-full" style={{ aspectRatio: `${WORLD_W} / ${WORLD_H}` }}>
        <canvas
          ref={canvasRef}
          tabIndex={0}
          onFocus={() => { /* noop */ }}
          className="absolute inset-0 h-full w-full rounded-lg border border-zinc-800 bg-zinc-900 outline-none"
          style={{ touchAction: "none", imageRendering: "pixelated" }}
          aria-label="홈 던전 월드"
        />
        {hint && (
          <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-sm font-medium text-yellow-300">
            {hint}
          </div>
        )}
      </div>
    </div>
  );
}
