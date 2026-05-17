"use client";

import { useEffect, useState, useRef } from "react";
import { SESSION_CHANGE_EVENT, session } from "@/lib/api";
import type { Game } from "./GameCard";

// 던전을 중심(50,50)에 배치, 나머지는 주변에 방사형으로
const GAME_LAYOUT: Record<string, {
  cx: number; cy: number; r: number;
  bg: string; border: string; shadow: string;
}> = {
  "dungeon":           { cx: 50,  cy: 50,  r: 120, bg: "#ede9fe", border: "#8b5cf6", shadow: "#c4b5fd" },
  "space-fishing":     { cx: 11,  cy: 22,  r: 68,  bg: "#dbeafe", border: "#3b82f6", shadow: "#93c5fd" },
  "blacksmith":        { cx: 80,  cy: 18,  r: 80,  bg: "#ffedd5", border: "#f97316", shadow: "#fdba74" },
  "cube-multiplay":    { cx: 86,  cy: 76,  r: 60,  bg: "#dcfce7", border: "#22c55e", shadow: "#86efac" },
  "topdown-multiplay": { cx: 11,  cy: 77,  r: 56,  bg: "#fef9c3", border: "#eab308", shadow: "#fde047" },
  "interior-3d":       { cx: 89,  cy: 46,  r: 52,  bg: "#fce7f3", border: "#ec4899", shadow: "#f9a8d4" },
};

// 던전과 각 위성 게임을 잇는 선 정의
const CONNECTIONS: Array<[string, string]> = [
  ["dungeon", "space-fishing"],
  ["dungeon", "blacksmith"],
  ["dungeon", "cube-multiplay"],
  ["dungeon", "topdown-multiplay"],
  ["dungeon", "interior-3d"],
];

const OVERFLOW_POSITIONS = [
  { cx: 30, cy: 82, r: 50 },
  { cx: 70, cy: 82, r: 50 },
];

function gameHrefWithToken(baseUrl: string, token: string): string {
  const u = String(baseUrl || "").trim();
  if (!u) return u;
  const standaloneApi = (process.env.NEXT_PUBLIC_STANDALONE_GAMES_API_URL ?? "").trim();
  const apiQ = standaloneApi ? `&platformApi=${encodeURIComponent(standaloneApi)}` : "";
  return u.replace(/\/+$/, "") + `/?token=${encodeURIComponent(token)}${apiQ}`;
}

interface BlobProps {
  game: Game;
  cx: number; cy: number; r: number;
  bg: string; border: string; shadow: string;
  href: string;
  scale: number;
}

function GameBlob({ game, cx, cy, r, bg, border, shadow, href, scale }: BlobProps) {
  const [hovered, setHovered] = useState(false);
  const sr = r * scale;
  const isDungeon = game.id === "dungeon";

  return (
    <a
      href={href}
      style={{
        position: "absolute",
        left: `${cx}%`,
        top: `${cy}%`,
        transform: "translate(-50%, -50%)",
        textDecoration: "none",
        zIndex: hovered ? 10 : isDungeon ? 2 : 1,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={() => setHovered(true)}
      onTouchEnd={() => setHovered(false)}
    >
      <div style={{
        width: sr * 2,
        height: sr * 2,
        borderRadius: "50%",
        background: bg,
        border: `${Math.max(2, 2.5 * scale)}px solid ${border}`,
        boxShadow: hovered
          ? `0 6px ${28 * scale}px ${shadow}, 0 2px ${8 * scale}px rgba(0,0,0,0.08)`
          : `0 3px ${14 * scale}px ${shadow}99`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: Math.max(3, 5 * scale),
        transition: "all .22s cubic-bezier(.34,1.56,.64,1)",
        transform: hovered ? "scale(1.06)" : "scale(1)",
        cursor: "pointer",
        flexShrink: 0,
        overflow: "hidden",
      }}>
        <span style={{
          fontSize: sr * 0.46,
          lineHeight: 1,
          userSelect: "none",
          display: "block",
        }}>
          {game.emoji}
        </span>
        <span style={{
          fontSize: Math.max(10, 12 * scale),
          fontWeight: 700,
          color: "#18181b",
          letterSpacing: "0.01em",
          textAlign: "center",
          padding: `0 ${6 * scale}px`,
          lineHeight: 1.2,
          userSelect: "none",
        }}>
          {game.title}
        </span>
      </div>
    </a>
  );
}

// 두 게임 사이 연결선 (SVG, viewBox=0 0 100 100, preserveAspectRatio=none)
function ConnectionLines({ layouts }: { layouts: typeof GAME_LAYOUT }) {
  const lines = CONNECTIONS.map(([a, b]) => {
    const la = layouts[a];
    const lb = layouts[b];
    if (!la || !lb) return null;
    return { x1: la.cx, y1: la.cy, x2: lb.cx, y2: lb.cy, color: lb.border };
  }).filter(Boolean);

  return (
    <svg
      style={{
        position: "absolute", inset: 0,
        width: "100%", height: "100%",
        pointerEvents: "none", zIndex: 0,
        overflow: "visible",
      }}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <defs>
        {lines.map((l, i) => l && (
          <marker
            key={i}
            id={`arrow-${i}`}
            markerWidth="4" markerHeight="4"
            refX="3" refY="2"
            orient="auto"
          >
            <path d="M0,0 L0,4 L4,2 z" fill={l.color} opacity="0.5" />
          </marker>
        ))}
      </defs>
      {lines.map((l, i) => l && (
        <line
          key={i}
          x1={l.x1} y1={l.y1}
          x2={l.x2} y2={l.y2}
          stroke={l.color}
          strokeWidth={0.35}
          strokeDasharray="1.5 1.8"
          opacity={0.55}
          markerEnd={`url(#arrow-${i})`}
        />
      ))}
    </svg>
  );
}

export default function GameWorldMap({ games }: { games: Game[] }) {
  const [token, setToken] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const sync = () => setToken(session.getToken());
    sync();
    window.addEventListener(SESSION_CHANGE_EVENT, sync);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, sync);
  }, []);

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        const w = containerRef.current.offsetWidth;
        setScale(Math.max(0.4, Math.min(1, w / 1000)));
      }
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  let overflowIdx = 0;
  const canvasMinW = 600;

  return (
    <div style={{
      width: "100%",
      overflowX: scale < 0.6 ? "auto" : "visible",
      userSelect: "none",
    }}>
      <div
        ref={containerRef}
        onMouseDown={(e) => e.preventDefault()}
        style={{
          position: "relative",
          width: scale < 0.6 ? canvasMinW : "100%",
          paddingBottom: scale < 0.6 ? canvasMinW * 0.68 : "68%",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        {/* 연결선 */}
        <ConnectionLines layouts={GAME_LAYOUT} />

        {/* 게임 블롭 */}
        {games.map((game) => {
          const href = token ? gameHrefWithToken(game.url, token) : game.url;
          const layout = GAME_LAYOUT[game.id];

          if (layout) {
            return (
              <GameBlob key={game.id} game={game} href={href} scale={scale} {...layout} />
            );
          }

          const pos = OVERFLOW_POSITIONS[overflowIdx++ % OVERFLOW_POSITIONS.length];
          return (
            <GameBlob
              key={game.id} game={game} href={href} scale={scale}
              cx={pos.cx} cy={pos.cy} r={pos.r}
              bg="#f4f4f5" border="#a1a1aa" shadow="#d4d4d8"
            />
          );
        })}
      </div>
    </div>
  );
}
