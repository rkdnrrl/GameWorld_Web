"use client";

import { useEffect, useRef, useState, useCallback, type SyntheticEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SESSION_CHANGE_EVENT, session } from "@/lib/api";

type GameSummary = { id: string; url: string };

/* ── Game7 던전과 동일한 상수 + 카메라 ─────────────────── */
const TS = 32;              // 타일 크기 (Game7 동일)
const DW = 56;              // 가로 타일 (월드)
const DH = 32;              // 세로 타일 (월드)
const WORLD_W = TS * DW;
const WORLD_H = TS * DH;

// 뷰포트: 모바일은 줌인(작은 영역), 데스크탑은 줌아웃(넓은 영역)
const VW_DESKTOP = 44, VH_DESKTOP = 26;
const VW_MOBILE  = 18, VH_MOBILE  = 11;
const MOBILE_BREAKPOINT = 640;  // Tailwind sm
function getViewport() {
  const isMobile = typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT;
  return isMobile
    ? { VW: VW_MOBILE,  VH: VH_MOBILE,  CW: TS * VW_MOBILE,  CH: TS * VH_MOBILE  }
    : { VW: VW_DESKTOP, VH: VH_DESKTOP, CW: TS * VW_DESKTOP, CH: TS * VH_DESKTOP };
}

const MOVE_DELAY_MS = 180;  // 타일 한 칸 이동 쿨다운
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

// 단순 맵: 외곽 벽만 두고 건물 자리는 2x2 도어 타일 (벽 없음 — 닿기만 해도 입장)
// 낚시(좌), 던전(중), 대장간(우)
// 56×32 월드에 3 건물 펼쳐서 배치 (던전 중앙)
const BUILDING_PLACES = [
  { sx: 8,  sy: 8,  door: T.DOOR_FISH,  emoji: "🎣", label: "낚시터" },
  { sx: 26, sy: 15, door: T.DOOR_DUNG,  emoji: "🏰", label: "던전" },
  { sx: 44, sy: 8,  door: T.DOOR_FORGE, emoji: "⚒️", label: "대장간" },
] as const;

const MAP: Tile[][] = (() => {
  const m: Tile[][] = [];
  for (let y = 0; y < DH; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < DW; x++) {
      if (x === 0 || y === 0 || x === DW - 1 || y === DH - 1) row.push(T.WALL);
      else row.push(T.FLOOR);
    }
    m.push(row);
  }
  // 각 건물 2x2 영역을 도어 타일로 (벽 없음, 자유롭게 걸어갈 수 있음)
  for (const b of BUILDING_PLACES) {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        m[b.sy + dy][b.sx + dx] = b.door;
      }
    }
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
  const [viewport, setViewport] = useState(() => getViewport());

  // 리사이즈에 따라 viewport 재계산 (모바일↔데스크탑 전환)
  useEffect(() => {
    const onResize = () => {
      const next = getViewport();
      setViewport((prev) => (prev.VW === next.VW && prev.VH === next.VH) ? prev : next);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
      facing: "down" as "up" | "down" | "left" | "right",
      lastMoveAt: 0,
    };

    // 카메라 — Game7 의 camX/camY + 보간 (viewport 의존)
    const { VW, VH, CW, CH } = viewport;
    const cam = { x: 0, y: 0, tx: 0, ty: 0 };
    function updateCameraTarget() {
      const tx = player.gx * TS - VW * 0.5 * TS + TS * 0.5;
      const ty = player.gy * TS - VH * 0.5 * TS + TS * 0.5;
      cam.tx = Math.max(0, Math.min(WORLD_W - CW, tx));
      cam.ty = Math.max(0, Math.min(WORLD_H - CH, ty));
    }
    updateCameraTarget();
    cam.x = cam.tx; cam.y = cam.ty;

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

      // 카메라 추적 (Game7 lerpCamera 동일)
      updateCameraTarget();
      const ck = 1 - Math.pow(0.93, (dt * 1000) / 16.67);
      cam.x += (cam.tx - cam.x) * ck;
      cam.y += (cam.ty - cam.y) * ck;
      if (Math.abs(cam.tx - cam.x) < 0.5) cam.x = cam.tx;
      if (Math.abs(cam.ty - cam.y) < 0.5) cam.y = cam.ty;

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
      const wantW = CW * dpr;
      const wantH = CH * dpr;
      if (canvas!.width !== wantW || canvas!.height !== wantH) {
        canvas!.width = wantW; canvas!.height = wantH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, CW, CH);

      // ── 타일 (Game7 스타일, 카메라 오프셋 적용) ────────────
      const startTx = Math.max(0, Math.floor(cam.x / TS));
      const endTx = Math.min(DW, Math.ceil((cam.x + CW) / TS) + 1);
      const startTy = Math.max(0, Math.floor(cam.y / TS));
      const endTy = Math.min(DH, Math.ceil((cam.y + CH) / TS) + 1);
      for (let ty = startTy; ty < endTy; ty++) {
        for (let tx = startTx; tx < endTx; tx++) {
          const sx = tx * TS - cam.x, sy = ty * TS - cam.y;
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

            // 문(건물 영역) 타일 — Game7 ESCAPE 스타일 색 펄스 (이모지는 별도로 중앙에 그림)
            if (t === T.DOOR_FISH || t === T.DOOR_FORGE || t === T.DOOR_DUNG) {
              const ep = 0.55 + Math.sin(frameCount * 0.09) * 0.45;
              const col = t === T.DOOR_FISH ? "59,130,246"
                        : t === T.DOOR_FORGE ? "249,115,22"
                        : "139,92,246";
              ctx.fillStyle = `rgba(${col},${ep * 0.5})`;
              ctx.fillRect(sx, sy, TS, TS);
            }
          }
        }
      }

      // ── 건물 이모지 + 라벨 (카메라 오프셋 적용) ────────────
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (const p of BUILDING_PLACES) {
        const cx = (p.sx + 1) * TS - cam.x;
        const cy = (p.sy + 1) * TS - cam.y;
        ctx.font = "bold 13px sans-serif";
        const tw = ctx.measureText(p.label).width;
        const labelY = p.sy * TS - 10 - cam.y;
        ctx.fillStyle = "rgba(10,10,30,0.85)";
        ctx.fillRect(cx - tw / 2 - 6, labelY - 9, tw + 12, 18);
        ctx.fillStyle = "#d0e8ff";
        ctx.fillText(p.label, cx, labelY);
        ctx.font = "52px serif";
        ctx.fillStyle = "#fff";
        ctx.fillText(p.emoji, cx, cy);
      }

      // ── 플레이어 (Game7 동일 스타일: 동그라미 + 🧙) ──────
      const sx = player.px - cam.x;
      const sy = player.py - cam.y;
      const hx = sx + TS / 2;

      // 몸체 원
      ctx.fillStyle = "#0f0f2a";
      ctx.beginPath(); ctx.arc(hx, sy + TS / 2, TS / 2 - 1, 0, Math.PI * 2); ctx.fill();
      // 이모지 (모바일 가독성을 위해 크게)
      ctx.font = "32px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
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
  }, [navigateToGame, viewport]);

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
    <div className="mx-auto w-full max-w-[1400px]">
      <div className="mb-3 text-center text-sm text-zinc-400">
        {tHome("dungeonHint")}
      </div>
      <div className="relative w-full" style={{ aspectRatio: `${viewport.CW} / ${viewport.CH}` }}>
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

      {/* 모바일 D-pad — 화면 우하단 고정. 데스크탑(sm 이상)에서는 숨김 */}
      <div
        className="fixed bottom-3 right-3 z-40 sm:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex flex-col items-center gap-1 rounded-xl bg-black/40 p-1.5 backdrop-blur">
          <button
            type="button"
            aria-label="위로"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-700 bg-[#0e0e20] text-base text-zinc-100 active:bg-[#1e1e38]"
            style={{ touchAction: "none", WebkitTapHighlightColor: "transparent" }}
            onTouchStart={startDir("up")} onTouchEnd={stopDir} onTouchCancel={stopDir}
            onMouseDown={startDir("up")} onMouseUp={stopDir} onMouseLeave={stopDir}
          >▲</button>
          <div className="flex gap-1">
            <button
              type="button"
              aria-label="왼쪽"
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-700 bg-[#0e0e20] text-base text-zinc-100 active:bg-[#1e1e38]"
              style={{ touchAction: "none", WebkitTapHighlightColor: "transparent" }}
              onTouchStart={startDir("left")} onTouchEnd={stopDir} onTouchCancel={stopDir}
              onMouseDown={startDir("left")} onMouseUp={stopDir} onMouseLeave={stopDir}
            >◀</button>
            <div className="h-11 w-11" />
            <button
              type="button"
              aria-label="오른쪽"
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-700 bg-[#0e0e20] text-base text-zinc-100 active:bg-[#1e1e38]"
              style={{ touchAction: "none", WebkitTapHighlightColor: "transparent" }}
              onTouchStart={startDir("right")} onTouchEnd={stopDir} onTouchCancel={stopDir}
              onMouseDown={startDir("right")} onMouseUp={stopDir} onMouseLeave={stopDir}
            >▶</button>
          </div>
          <button
            type="button"
            aria-label="아래로"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-700 bg-[#0e0e20] text-base text-zinc-100 active:bg-[#1e1e38]"
            style={{ touchAction: "none", WebkitTapHighlightColor: "transparent" }}
            onTouchStart={startDir("down")} onTouchEnd={stopDir} onTouchCancel={stopDir}
            onMouseDown={startDir("down")} onMouseUp={stopDir} onMouseLeave={stopDir}
          >▼</button>
        </div>
      </div>
    </div>
  );
}
