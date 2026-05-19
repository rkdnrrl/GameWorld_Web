"use client";

import { useEffect, useRef, useState, useCallback, type SyntheticEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SESSION_CHANGE_EVENT, session } from "@/lib/api";

type GameSummary = { id: string; url: string };

/* ── Game7 던전과 동일한 상수 ─────────────────────────── */
const TS = 32;              // 타일 크기 (Game7 동일)
const DW = 22;              // 가로 타일
const DH = 14;              // 세로 타일
const WORLD_W = TS * DW;
const WORLD_H = TS * DH;

const MOVE_DELAY_MS = 180;  // 타일 한 칸 이동 쿨다운 (Game7 의 MOVE_BASE_MS=220 보다 살짝 빠름)
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
  // D-pad → 게임 루프 통신. dir 값을 update() 에서 매 프레임 읽어 tryMove 호출.
  const dpadRef = useRef<{ dir: null | "up" | "down" | "left" | "right" }>({ dir: null });

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

    // 캐릭터 — Game7 동일 방식: gx,gy 는 격자, px,py 는 보간된 픽셀
    const startGx = Math.floor(DW / 2);
    const startGy = DH - 3;
    const player = {
      gx: startGx, gy: startGy,
      px: startGx * TS, py: startGy * TS,
      facing: "up" as "up" | "down" | "left" | "right",
      lastMoveAt: 0,
    };

    const keys = new Set<string>();
    const touch = dpadRef.current; // D-pad 가 .dir 을 갱신함
    let frameCount = 0;
    let lastTs = performance.now();
    let raf = 0;
    let lastDoorTile: Tile | null = null;

    // 격자 한 칸 이동 시도 (Game7 의 tryMove)
    function tryMove(dx: number, dy: number) {
      const now = performance.now();
      if (now - player.lastMoveAt < MOVE_DELAY_MS) return;
      const nx = player.gx + dx, ny = player.gy + dy;
      if (nx < 0 || nx >= DW || ny < 0 || ny >= DH) return;
      const tile = MAP[ny][nx];
      if (tile === T.WALL) return;
      player.gx = nx; player.gy = ny;
      player.lastMoveAt = now;
      if (dx > 0) player.facing = "right";
      else if (dx < 0) player.facing = "left";
      else if (dy > 0) player.facing = "down";
      else if (dy < 0) player.facing = "up";
    }

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
      // Game7 식: 키가 눌려 있으면 매 프레임 tryMove 호출 (내부 쿨다운으로 1타일씩만 진행)
      if      (keys.has("arrowup")   || keys.has("w")) tryMove( 0, -1);
      else if (keys.has("arrowdown") || keys.has("s")) tryMove( 0,  1);
      else if (keys.has("arrowleft") || keys.has("a")) tryMove(-1,  0);
      else if (keys.has("arrowright")|| keys.has("d")) tryMove( 1,  0);
      else if (touch.dir === "up")    tryMove( 0, -1);
      else if (touch.dir === "down")  tryMove( 0,  1);
      else if (touch.dir === "left")  tryMove(-1,  0);
      else if (touch.dir === "right") tryMove( 1,  0);

      // 픽셀 보간 — Game7 동일 공식
      const pk = 1 - Math.pow(0.82, (dt * 1000) / 16.67);
      player.px += (player.gx * TS - player.px) * pk;
      player.py += (player.gy * TS - player.py) * pk;

      // 문 트리거 — 현재 격자 위치 기준
      const cur = tileAt(player.gx, player.gy);
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

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [navigateToGame]);

  /* D-pad 버튼 — Game7 와 동일한 동작 (누름 → 즉시 이동 + 80ms 간격 반복) */
  const dpadHold = useRef<{ timer: number | null }>({ timer: null });
  const startDir = useCallback((dir: "up" | "down" | "left" | "right") => (e: SyntheticEvent) => {
    e.preventDefault();
    dpadRef.current.dir = dir;
    if (dpadHold.current.timer != null) window.clearInterval(dpadHold.current.timer);
    // 누르고 있는 동안 dir 유지 → 게임 루프가 매 프레임 tryMove 호출 (쿨다운으로 보호됨)
  }, []);
  const stopDir = useCallback((e: SyntheticEvent) => {
    e.preventDefault();
    dpadRef.current.dir = null;
    if (dpadHold.current.timer != null) {
      window.clearInterval(dpadHold.current.timer);
      dpadHold.current.timer = null;
    }
  }, []);

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

      {/* 모바일 D-pad — 데스크탑(sm 이상)에서는 숨김 */}
      <div className="mt-4 flex justify-center sm:hidden">
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex justify-center">
            <button
              type="button"
              aria-label="위로"
              className="flex h-12 w-12 items-center justify-center rounded-lg border border-zinc-700 bg-[#0e0e20] text-lg text-zinc-200 active:bg-[#1e1e38]"
              style={{ touchAction: "none", WebkitTapHighlightColor: "transparent" }}
              onTouchStart={startDir("up")}
              onTouchEnd={stopDir}
              onTouchCancel={stopDir}
              onMouseDown={startDir("up")}
              onMouseUp={stopDir}
              onMouseLeave={stopDir}
            >▲</button>
          </div>
          <div className="flex justify-center gap-1.5">
            <button
              type="button"
              aria-label="왼쪽"
              className="flex h-12 w-12 items-center justify-center rounded-lg border border-zinc-700 bg-[#0e0e20] text-lg text-zinc-200 active:bg-[#1e1e38]"
              style={{ touchAction: "none", WebkitTapHighlightColor: "transparent" }}
              onTouchStart={startDir("left")}
              onTouchEnd={stopDir}
              onTouchCancel={stopDir}
              onMouseDown={startDir("left")}
              onMouseUp={stopDir}
              onMouseLeave={stopDir}
            >◀</button>
            <div className="h-12 w-12" /> {/* 가운데 비움 (Game7 의 ⚡ counter 자리) */}
            <button
              type="button"
              aria-label="오른쪽"
              className="flex h-12 w-12 items-center justify-center rounded-lg border border-zinc-700 bg-[#0e0e20] text-lg text-zinc-200 active:bg-[#1e1e38]"
              style={{ touchAction: "none", WebkitTapHighlightColor: "transparent" }}
              onTouchStart={startDir("right")}
              onTouchEnd={stopDir}
              onTouchCancel={stopDir}
              onMouseDown={startDir("right")}
              onMouseUp={stopDir}
              onMouseLeave={stopDir}
            >▶</button>
          </div>
          <div className="flex justify-center">
            <button
              type="button"
              aria-label="아래로"
              className="flex h-12 w-12 items-center justify-center rounded-lg border border-zinc-700 bg-[#0e0e20] text-lg text-zinc-200 active:bg-[#1e1e38]"
              style={{ touchAction: "none", WebkitTapHighlightColor: "transparent" }}
              onTouchStart={startDir("down")}
              onTouchEnd={stopDir}
              onTouchCancel={stopDir}
              onMouseDown={startDir("down")}
              onMouseUp={stopDir}
              onMouseLeave={stopDir}
            >▼</button>
          </div>
        </div>
      </div>
    </div>
  );
}
