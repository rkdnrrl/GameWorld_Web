"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SESSION_CHANGE_EVENT, session } from "@/lib/api";

type GameSummary = { id: string; url: string };

/* ── Game7 던전과 동일한 상수 ─────────────────────────── */
const TS = 32;              // 타일 크기 (Game7 동일)
const DW = 22;              // 가로 타일
const DH = 14;              // 세로 타일
const WORLD_W = TS * DW;
const WORLD_H = TS * DH;

const PLAYER_SPEED = 130;   // px/sec
const PLAYER_SIZE = TS;     // 1 타일

// 타일 종류 (Game7 방식)
const T = {
  FLOOR: 0,
  WALL: 1,
  DOOR_FISH: 2,
  DOOR_FORGE: 3,
  DOOR_DUNG: 4,
} as const;

type Tile = typeof T[keyof typeof T];

// 맵: 0=floor, 1=wall, 2=낚시문, 3=대장간문, 4=던전문
// 22x14 — 외곽 벽 + 가운데 3개 건물 (벽으로 둘러쌈, 문 하나씩)
const MAP_RAW = [
  "1111111111111111111111",
  "1000000000000000000001",
  "1011110000111100001111", // 낚시는 좌측 위 (1~5,2~5), 던전 우측 위
  "1011110000111100001111",
  "1011110000111100001111",
  "1012110000131100001411", // 문 위치
  "1000000000000000000001",
  "1000000000000000000001",
  "1000001111111111100001",
  "1000001000000000100001",
  "1000001000000000100001",
  "1000001000000000100001",
  "1000000000000000000001",
  "1111111111111111111111",
];

// 간단한 맵 — 건물별 입구 문 위치
//  낚시: (4,5)에 문
//  대장간: (10,5)에 문
//  던전: (16,5)에 문
// 위 MAP_RAW는 너무 복잡해서, 새 단순 맵 사용
const MAP: Tile[][] = (() => {
  const m: Tile[][] = [];
  for (let y = 0; y < DH; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < DW; x++) {
      // 외곽 벽
      if (x === 0 || y === 0 || x === DW - 1 || y === DH - 1) row.push(T.WALL);
      else row.push(T.FLOOR);
    }
    m.push(row);
  }
  // 건물 3채 — 각 3x3 벽덩어리 + 정중앙 문 (floor row 바로 위)
  // 낚시 (좌측 위): x=2..4, y=2..4 → 정중앙 (3,4)에 문 = T.DOOR_FISH (실제로는 4행 위치)
  // 대장간 (중앙 위): x=10..12, y=2..4 → (11,4) DOOR_FORGE
  // 던전 (우측 위): x=17..19, y=2..4 → (18,4) DOOR_DUNG
  // 던전을 중앙에, 낚시는 왼쪽, 대장간은 오른쪽
  const buildings: { sx: number; sy: number; door: Tile }[] = [
    { sx: 3,  sy: 2, door: T.DOOR_FISH  },
    { sx: 10, sy: 2, door: T.DOOR_DUNG  },
    { sx: 17, sy: 2, door: T.DOOR_FORGE },
  ];
  for (const b of buildings) {
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        m[b.sy + dy][b.sx + dx] = T.WALL;
      }
    }
    // 정중앙 아래쪽이 문 (사람이 위로 걸어 들어가는 입구)
    m[b.sy + 2][b.sx + 1] = b.door;
  }
  return m;
})();

const BUILDING_DOORS: { tile: Tile; gameId: string; label: string; emoji: string }[] = [
  { tile: T.DOOR_FISH,  gameId: "space-fishing", label: "폐품 낚시", emoji: "🎣" },
  { tile: T.DOOR_FORGE, gameId: "blacksmith",    label: "대장간",   emoji: "⚒️" },
  { tile: T.DOOR_DUNG,  gameId: "dungeon",       label: "던전 탐험", emoji: "🏰" },
];

function tileAt(gx: number, gy: number): Tile {
  if (gx < 0 || gy < 0 || gx >= DW || gy >= DH) return T.WALL;
  return MAP[gy][gx];
}
function isWalkable(tile: Tile): boolean {
  // 벽만 막힘. 문은 통과 가능 (들어가면 트리거)
  return tile !== T.WALL;
}

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

export default function DungeonHomeScene() {
  const tHome = useTranslations("Home");
  const locale = useLocale();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hint, setHint] = useState<string>("");
  const [navigating, setNavigating] = useState(false);
  const tokenRef = useRef<string | null>(null);
  const gamesRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const sync = () => { tokenRef.current = session.getToken(); };
    sync();
    window.addEventListener(SESSION_CHANGE_EVENT, sync);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, sync);
  }, []);

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
      } catch { /* empty */ }
    })();
  }, []);

  const navigateToGame = useCallback((gameId: string) => {
    if (navigating) return;
    const url = gamesRef.current.get(gameId);
    if (!url) {
      setHint("게임을 찾을 수 없습니다.");
      return;
    }
    setNavigating(true);
    const href = gameHrefWithToken(url, tokenRef.current, locale);
    window.location.href = href;
  }, [locale, navigating]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 캐릭터 — Game7 처럼 타일 한 칸 단위, px 좌표로 부드러운 이동
    const player = {
      px: (Math.floor(DW / 2)) * TS,
      py: (DH - 3) * TS,
      facing: "up" as "up" | "down" | "left" | "right",
    };

    const keys = new Set<string>();
    const touch = { dx: 0, dy: 0, active: false };
    let frameCount = 0;
    let lastTs = performance.now();
    let raf = 0;
    let lastDoorTile: Tile | null = null;

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

    function update(dt: number) {
      frameCount++;
      let vx = 0, vy = 0;
      if (keys.has("arrowleft") || keys.has("a")) vx -= 1;
      if (keys.has("arrowright") || keys.has("d")) vx += 1;
      if (keys.has("arrowup") || keys.has("w")) vy -= 1;
      if (keys.has("arrowdown") || keys.has("s")) vy += 1;
      if (touch.active) { vx += touch.dx; vy += touch.dy; }
      const len = Math.hypot(vx, vy);
      if (len > 0) {
        vx /= len; vy /= len;
        if (Math.abs(vx) > Math.abs(vy)) player.facing = vx > 0 ? "right" : "left";
        else player.facing = vy > 0 ? "down" : "up";
      }

      // X 축 충돌
      const nxp = player.px + vx * PLAYER_SPEED * dt;
      const corners = [
        [nxp, player.py],
        [nxp + TS - 1, player.py],
        [nxp, player.py + TS - 1],
        [nxp + TS - 1, player.py + TS - 1],
      ];
      let okX = true;
      for (const [cx, cy] of corners) {
        if (!isWalkable(tileAt(Math.floor(cx / TS), Math.floor(cy / TS)))) { okX = false; break; }
      }
      if (okX) player.px = Math.max(0, Math.min(WORLD_W - TS, nxp));

      // Y 축 충돌
      const nyp = player.py + vy * PLAYER_SPEED * dt;
      const corners2 = [
        [player.px, nyp],
        [player.px + TS - 1, nyp],
        [player.px, nyp + TS - 1],
        [player.px + TS - 1, nyp + TS - 1],
      ];
      let okY = true;
      for (const [cx, cy] of corners2) {
        if (!isWalkable(tileAt(Math.floor(cx / TS), Math.floor(cy / TS)))) { okY = false; break; }
      }
      if (okY) player.py = Math.max(0, Math.min(WORLD_H - TS, nyp));

      // 문 트리거 — 중심 타일
      const cgx = Math.floor((player.px + TS / 2) / TS);
      const cgy = Math.floor((player.py + TS / 2) / TS);
      const cur = tileAt(cgx, cgy);
      const door = BUILDING_DOORS.find((d) => d.tile === cur);
      if (door && cur !== lastDoorTile) {
        lastDoorTile = cur;
        setHint(`${door.emoji} ${door.label} 입장 중…`);
        navigateToGame(door.gameId);
      } else if (!door && lastDoorTile !== null) {
        lastDoorTile = null;
        setHint("");
      }
    }

    function draw() {
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const wantW = WORLD_W * dpr;
      const wantH = WORLD_H * dpr;
      if (canvas!.width !== wantW || canvas!.height !== wantH) {
        canvas!.width = wantW; canvas!.height = wantH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, WORLD_W, WORLD_H);

      // ── 타일 (Game7 스타일 그대로) ─────────────────────────
      for (let ty = 0; ty < DH; ty++) {
        for (let tx = 0; tx < DW; tx++) {
          const sx = tx * TS, sy = ty * TS;
          const t = MAP[ty][tx];
          if (t === T.WALL) {
            // 벽 — Game7 일반 던전 벽 동일 색
            ctx.fillStyle = "#0d0d1a"; ctx.fillRect(sx, sy, TS, TS);
            ctx.fillStyle = "#060610"; ctx.fillRect(sx + 3, sy + 3, TS - 6, TS - 6);
          } else {
            // 바닥
            ctx.fillStyle = "#161626"; ctx.fillRect(sx, sy, TS, TS);
            ctx.strokeStyle = "#0e0e22"; ctx.lineWidth = 0.5;
            ctx.strokeRect(sx + 0.5, sy + 0.5, TS - 1, TS - 1);

            // 문 타일 — Game7 ESCAPE 스타일 (초록 펄스 + 🚪)
            if (t === T.DOOR_FISH || t === T.DOOR_FORGE || t === T.DOOR_DUNG) {
              const ep = 0.55 + Math.sin(frameCount * 0.09) * 0.45;
              // 건물별 다른 색
              const col = t === T.DOOR_FISH ? "59,130,246"
                        : t === T.DOOR_FORGE ? "249,115,22"
                        : "139,92,246";
              ctx.fillStyle = `rgba(${col},${ep * 0.45})`;
              ctx.fillRect(sx, sy, TS, TS);
              ctx.font = "20px serif";
              ctx.textAlign = "center"; ctx.textBaseline = "middle";
              ctx.globalAlpha = 0.7 + Math.sin(frameCount * 0.09) * 0.3;
              ctx.fillText("🚪", sx + TS / 2, sy + TS / 2 + 1);
              ctx.globalAlpha = 1;
            }
          }
        }
      }

      // ── 건물 라벨 (벽 위에) ───────────────────────────────
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const labels: { door: Tile; emoji: string; label: string; cx: number; cy: number }[] = [];
      // 건물 중앙 좌표 자동 계산 (벽 덩어리 위에 이모지+이름)
      const places = [
        { tile: T.DOOR_FISH,  emoji: "🎣", label: "낚시터", sx: 3,  sy: 2 },
        { tile: T.DOOR_DUNG,  emoji: "🏰", label: "던전",   sx: 10, sy: 2 },
        { tile: T.DOOR_FORGE, emoji: "⚒️", label: "대장간", sx: 17, sy: 2 },
      ];
      for (const p of places) {
        labels.push({
          door: p.tile, emoji: p.emoji, label: p.label,
          cx: (p.sx + 1.5) * TS,
          cy: (p.sy + 1.0) * TS,
        });
      }
      for (const l of labels) {
        ctx.font = "22px serif";
        ctx.fillStyle = "#fff";
        ctx.fillText(l.emoji, l.cx, l.cy - 4);
        ctx.font = "bold 10px sans-serif";
        ctx.fillStyle = "#d0e8ff";
        ctx.fillText(l.label, l.cx, l.cy + 14);
      }

      // ── 플레이어 (Game7 동일 스타일: 동그라미 + 🧙) ──────
      const sx = player.px;
      const sy = player.py;
      const hx = sx + TS / 2;

      // 몸체 원
      ctx.fillStyle = "#0f0f2a";
      ctx.beginPath(); ctx.arc(hx, sy + TS / 2, TS / 2 - 3, 0, Math.PI * 2); ctx.fill();
      // 이모지
      ctx.font = "20px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("🧙", hx, sy + TS / 2 + 1);
    }

    function tick(now: number) {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;
      update(dt);
      draw();
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    /* 터치: 캔버스 중심 기준 방향 */
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      if (!t) return;
      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = t.clientX - cx, dy = t.clientY - cy;
      const len = Math.hypot(dx, dy) || 1;
      touch.active = true; touch.dx = dx / len; touch.dy = dy / len;
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      touch.active = false; touch.dx = 0; touch.dy = 0;
    };
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchStart, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    canvas.addEventListener("touchcancel", onTouchEnd, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchStart);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [navigateToGame]);

  return (
    <div className="mx-auto w-full max-w-[900px] px-2">
      <div className="mb-3 text-center text-sm text-zinc-400">
        {tHome("dungeonHint")}
      </div>
      <div className="relative w-full" style={{ aspectRatio: `${WORLD_W} / ${WORLD_H}` }}>
        <canvas
          ref={canvasRef}
          tabIndex={0}
          className="absolute inset-0 h-full w-full rounded-lg border border-zinc-800 bg-[#161626] outline-none"
          style={{ touchAction: "none", imageRendering: "pixelated" }}
          aria-label="던전 월드 — Game7 스타일"
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
