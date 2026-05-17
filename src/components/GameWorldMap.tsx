"use client";

import { useEffect, useState, useRef } from "react";
import { SESSION_CHANGE_EVENT, session } from "@/lib/api";
import type { Game } from "./GameCard";

// 기준 캔버스 1000 × 650 (paddingBottom 65%)
const GAME_LAYOUT: Record<string, {
  cx: number; cy: number; // 중심 위치 (%)
  r: number;              // 반지름 px (1000px 기준)
  bg: string;
  border: string;
  shadow: string;
}> = {
  "space-fishing":     { cx: 13,  cy: 36,  r: 72,  bg: "#dbeafe", border: "#3b82f6", shadow: "#93c5fd" },
  "blacksmith":        { cx: 47,  cy: 20,  r: 85,  bg: "#ffedd5", border: "#f97316", shadow: "#fdba74" },
  "dungeon":           { cx: 61,  cy: 57,  r: 115, bg: "#ede9fe", border: "#8b5cf6", shadow: "#c4b5fd" },
  "cube-multiplay":    { cx: 83,  cy: 31,  r: 62,  bg: "#dcfce7", border: "#22c55e", shadow: "#86efac" },
  "topdown-multiplay": { cx: 21,  cy: 70,  r: 58,  bg: "#fef9c3", border: "#eab308", shadow: "#fde047" },
  "interior-3d":       { cx: 83,  cy: 70,  r: 54,  bg: "#fce7f3", border: "#ec4899", shadow: "#f9a8d4" },
};

const OVERFLOW_POSITIONS = [
  { cx: 37, cy: 72, r: 52 },
  { cx: 73, cy: 16, r: 52 },
];

function gameHrefWithToken(baseUrl: string, token: string): string {
  const u = String(baseUrl || "").trim();
  if (!u) return u;
  const standaloneApi = (process.env.NEXT_PUBLIC_STANDALONE_GAMES_API_URL ?? "").trim();
  const apiQ = standaloneApi ? `&platformApi=${encodeURIComponent(standaloneApi)}` : "";
  const root = u.replace(/\/+$/, "") + "/";
  return `${root}?token=${encodeURIComponent(token)}${apiQ}`;
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

  return (
    <a
      href={href}
      style={{
        position: "absolute",
        left: `${cx}%`,
        top: `${cy}%`,
        transform: "translate(-50%, -50%)",
        textDecoration: "none",
        zIndex: hovered ? 10 : 1,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={() => setHovered(true)}
      onTouchEnd={() => setHovered(false)}
    >
      {/* 블롭 — 이름·이모지 모두 안에 */}
      <div style={{
        width: sr * 2,
        height: sr * 2,
        borderRadius: "50%",
        background: bg,
        border: `${Math.max(2, 2.5 * scale)}px solid ${border}`,
        boxShadow: hovered
          ? `0 6px ${24 * scale}px ${shadow}, 0 2px ${6 * scale}px rgba(0,0,0,0.07)`
          : `0 3px ${12 * scale}px ${shadow}88`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: Math.max(4, 6 * scale),
        transition: "all .22s cubic-bezier(.34,1.56,.64,1)",
        transform: hovered ? "scale(1.06)" : "scale(1)",
        cursor: "pointer",
        flexShrink: 0,
        overflow: "hidden",
      }}>
        <span style={{
          fontSize: sr * 0.48,
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
          padding: `0 ${8 * scale}px`,
          lineHeight: 1.2,
          userSelect: "none",
        }}>
          {game.title}
        </span>
      </div>

    </a>
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
          paddingBottom: scale < 0.6 ? canvasMinW * 0.65 : "65%",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
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
