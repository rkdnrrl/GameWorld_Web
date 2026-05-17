"use client";

import { useEffect, useState, useRef } from "react";
import { SESSION_CHANGE_EVENT, session } from "@/lib/api";
import type { Game } from "./GameCard";

// 게임별 고정 레이아웃 (1000×620 기준, %)
const GAME_LAYOUT: Record<string, {
  cx: number; cy: number;
  r: number;
  blob: string;
  bg: string;       // 블롭 배경색
  border: string;   // 테두리색
  shadow: string;   // 그림자색
}> = {
  "space-fishing":     { cx: 13,  cy: 45,  r: 88,  blob: "58% 42% 34% 66% / 55% 38% 62% 45%", bg: "#dbeafe", border: "#3b82f6", shadow: "#93c5fd" },
  "blacksmith":        { cx: 50,  cy: 22,  r: 102, blob: "44% 56% 52% 48% / 60% 44% 56% 40%", bg: "#ffedd5", border: "#f97316", shadow: "#fdba74" },
  "dungeon":           { cx: 62,  cy: 62,  r: 158, blob: "40% 60% 55% 45% / 50% 42% 58% 50%", bg: "#ede9fe", border: "#8b5cf6", shadow: "#c4b5fd" },
  "cube-multiplay":    { cx: 84,  cy: 35,  r: 78,  blob: "52% 48% 46% 54% / 58% 44% 56% 42%", bg: "#dcfce7", border: "#22c55e", shadow: "#86efac" },
  "topdown-multiplay": { cx: 20,  cy: 80,  r: 74,  blob: "62% 38% 44% 56% / 46% 60% 40% 54%", bg: "#fef9c3", border: "#eab308", shadow: "#fde047" },
  "interior-3d":       { cx: 84,  cy: 80,  r: 68,  blob: "50% 50% 42% 58% / 52% 46% 54% 48%", bg: "#fce7f3", border: "#ec4899", shadow: "#f9a8d4" },
};

const OVERFLOW_POSITIONS = [
  { cx: 35, cy: 80, r: 65 },
  { cx: 72, cy: 18, r: 65 },
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
  blob: string; bg: string; border: string; shadow: string;
  href: string;
  scale: number;
}

function GameBlob({ game, cx, cy, r, blob, bg, border, shadow, href, scale }: BlobProps) {
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
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textDecoration: "none",
        zIndex: hovered ? 10 : 1,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={() => setHovered(true)}
      onTouchEnd={() => setHovered(false)}
    >
      {/* 블롭 본체 */}
      <div style={{
        width: sr * 2,
        height: sr * 2,
        borderRadius: blob,
        background: bg,
        border: `${Math.max(2, 2.5 * scale)}px solid ${border}`,
        boxShadow: hovered
          ? `0 8px ${28 * scale}px ${shadow}, 0 2px ${8 * scale}px rgba(0,0,0,0.08)`
          : `0 4px ${16 * scale}px ${shadow}88, 0 1px ${4 * scale}px rgba(0,0,0,0.06)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all .22s cubic-bezier(.34,1.56,.64,1)",
        transform: hovered ? "scale(1.07)" : "scale(1)",
        cursor: "pointer",
        position: "relative",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: sr * 0.52, lineHeight: 1, userSelect: "none" }}>{game.emoji}</span>
      </div>

      {/* 게임 이름 */}
      <div style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: `translate(-50%, ${sr + Math.max(8, 10 * scale)}px)`,
        whiteSpace: "nowrap",
        pointerEvents: "none",
        textAlign: "center",
      }}>
        <span style={{
          display: "inline-block",
          background: "#fff",
          color: "#18181b",
          fontSize: Math.max(10, 13 * scale),
          fontWeight: 700,
          padding: `${2 * scale}px ${8 * scale}px`,
          borderRadius: 20,
          border: `1px solid ${border}88`,
          boxShadow: `0 1px 4px ${shadow}55`,
          letterSpacing: "0.02em",
        }}>{game.title}</span>

        {hovered && (
          <div style={{
            marginTop: 5 * scale,
            background: "#fff",
            color: "#52525b",
            fontSize: Math.max(9, 11 * scale),
            padding: `${4 * scale}px ${10 * scale}px`,
            borderRadius: 10,
            border: `1px solid #e4e4e7`,
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            maxWidth: 160 * scale,
            whiteSpace: "normal",
            textAlign: "center",
            lineHeight: 1.5,
          }}>{game.description}</div>
        )}
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
        setScale(Math.max(0.38, Math.min(1, w / 1000)));
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
    <div style={{ width: "100%", overflowX: scale < 0.6 ? "auto" : "hidden", borderRadius: 16 }}>
      <div
        ref={containerRef}
        style={{
          position: "relative",
          width: scale < 0.6 ? canvasMinW : "100%",
          paddingBottom: scale < 0.6 ? canvasMinW * 0.62 : "62%",
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
              blob="50% 50% 45% 55% / 50% 50% 50% 50%"
              bg="#f4f4f5" border="#a1a1aa" shadow="#d4d4d8"
            />
          );
        })}
      </div>
    </div>
  );
}

