"use client";

import { useEffect, useState, useRef } from "react";
import { SESSION_CHANGE_EVENT, session } from "@/lib/api";
import type { Game } from "./GameCard";

// 게임별 고정 레이아웃 (1000×620 기준 좌표 → %)
const GAME_LAYOUT: Record<string, {
  cx: number; cy: number; // 0~100 % (캔버스 기준)
  r: number;              // 반지름 px (기준 크기, 실제론 캔버스 스케일 적용)
  blob: string;           // border-radius 유기적 blob 모양
  color: string;          // 베이스 색
  glow: string;           // 글로우 색
  labelOffset: number;    // 라벨 y 오프셋(px)
}> = {
  "space-fishing":     { cx: 13,  cy: 45,  r: 88,  blob: "58% 42% 34% 66% / 55% 38% 62% 45%", color: "#0369a1", glow: "#38bdf8", labelOffset: 100 },
  "blacksmith":        { cx: 50,  cy: 22,  r: 102, blob: "44% 56% 52% 48% / 60% 44% 56% 40%", color: "#92400e", glow: "#fb923c", labelOffset: 116 },
  "dungeon":           { cx: 62,  cy: 62,  r: 158, blob: "40% 60% 55% 45% / 50% 42% 58% 50%", color: "#4c1d95", glow: "#a78bfa", labelOffset: 174 },
  "cube-multiplay":    { cx: 84,  cy: 35,  r: 78,  blob: "52% 48% 46% 54% / 58% 44% 56% 42%", color: "#14532d", glow: "#4ade80", labelOffset: 90 },
  "topdown-multiplay": { cx: 20,  cy: 80,  r: 74,  blob: "62% 38% 44% 56% / 46% 60% 40% 54%", color: "#713f12", glow: "#fbbf24", labelOffset: 86 },
  "interior-3d":       { cx: 84,  cy: 80,  r: 68,  blob: "50% 50% 42% 58% / 52% 46% 54% 48%", color: "#831843", glow: "#f472b6", labelOffset: 80 },
};

// 레이아웃 없는 게임은 여기 배치
const OVERFLOW_POSITIONS = [
  { cx: 35, cy: 80, r: 65 },
  { cx: 72, cy: 18, r: 65 },
];

function gameHrefWithToken(baseUrl: string, token: string): string {
  let u = String(baseUrl || "").trim();
  if (!u) return u;
  const standaloneApi = (process.env.NEXT_PUBLIC_STANDALONE_GAMES_API_URL ?? "").trim();
  const apiQ = standaloneApi ? `&platformApi=${encodeURIComponent(standaloneApi)}` : "";
  const root = u.replace(/\/+$/, "") + "/";
  return `${root}?token=${encodeURIComponent(token)}${apiQ}`;
}

interface BlobProps {
  game: Game;
  cx: number; cy: number; r: number;
  blob: string; color: string; glow: string; labelOffset: number;
  href: string;
  scale: number;
}

function GameBlob({ game, cx, cy, r, blob, color, glow, labelOffset, href, scale }: BlobProps) {
  const [hovered, setHovered] = useState(false);
  const sr = r * scale;
  const slabelOffset = labelOffset * scale;

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
      {/* 글로우 링 */}
      <div style={{
        position: "absolute",
        width: sr * 2 + 24,
        height: sr * 2 + 24,
        borderRadius: blob,
        background: `radial-gradient(ellipse at center, ${glow}33 0%, transparent 70%)`,
        transform: "translate(-50%, -50%)",
        left: "50%",
        top: "50%",
        transition: "opacity .25s",
        opacity: hovered ? 1 : 0.5,
        pointerEvents: "none",
      }} />

      {/* 블롭 본체 */}
      <div style={{
        width: sr * 2,
        height: sr * 2,
        borderRadius: blob,
        background: `radial-gradient(ellipse at 35% 35%, ${color}cc, ${color}ff 60%, #0a0a1a)`,
        border: `${Math.max(2, 3 * scale)}px solid ${glow}${hovered ? "cc" : "55"}`,
        boxShadow: hovered
          ? `0 0 ${32 * scale}px ${glow}88, inset 0 0 ${20 * scale}px ${color}99`
          : `0 0 ${16 * scale}px ${glow}44, inset 0 0 ${10 * scale}px ${color}55`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 4 * scale,
        transition: "all .25s cubic-bezier(.34,1.56,.64,1)",
        transform: hovered ? `scale(1.07)` : "scale(1)",
        cursor: "pointer",
        position: "relative",
        flexShrink: 0,
      }}>
        {/* 반사광 */}
        <div style={{
          position: "absolute",
          top: "14%", left: "18%",
          width: "35%", height: "22%",
          borderRadius: "50%",
          background: "rgba(255,255,255,0.12)",
          pointerEvents: "none",
          transform: "rotate(-20deg)",
        }} />
        <span style={{ fontSize: sr * 0.55, lineHeight: 1, userSelect: "none" }}>{game.emoji}</span>
      </div>

      {/* 게임 이름 */}
      <div style={{
        position: "absolute",
        top: "50%",
        transform: `translateY(${slabelOffset * 0.5 - sr * 0.08}px) translateX(-50%)`,
        left: "50%",
        whiteSpace: "nowrap",
        textAlign: "center",
        pointerEvents: "none",
      }}>
        <span style={{
          display: "inline-block",
          background: "rgba(0,0,0,0.72)",
          backdropFilter: "blur(4px)",
          color: "#fff",
          fontSize: Math.max(10, 14 * scale),
          fontWeight: 700,
          padding: `${3 * scale}px ${8 * scale}px`,
          borderRadius: 20 * scale,
          border: `1px solid ${glow}55`,
          letterSpacing: "0.03em",
          boxShadow: `0 0 ${8 * scale}px ${glow}44`,
          transition: "opacity .2s",
          opacity: hovered ? 1 : 0.85,
        }}>{game.title}</span>

        {/* 호버 시 설명 */}
        {hovered && (
          <div style={{
            display: "block",
            marginTop: 6 * scale,
            background: "rgba(0,0,0,0.88)",
            backdropFilter: "blur(8px)",
            color: "#ccc",
            fontSize: Math.max(9, 11 * scale),
            padding: `${4 * scale}px ${10 * scale}px`,
            borderRadius: 12 * scale,
            border: `1px solid ${glow}33`,
            maxWidth: 160 * scale,
            whiteSpace: "normal",
            textAlign: "center",
            lineHeight: 1.4,
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

  // 캔버스 너비에 따라 스케일 조정 (기준: 1000px)
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

  // 모바일: 최소 너비 600px, 스크롤 가능
  const canvasMinW = 600;

  return (
    <div style={{ width: "100%", overflowX: scale < 0.6 ? "auto" : "hidden", borderRadius: 20 }}>
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: scale < 0.6 ? canvasMinW : "100%",
        paddingBottom: scale < 0.6 ? canvasMinW * 0.62 : "62%",
        background: "radial-gradient(ellipse at 50% 40%, #0d0d2b 0%, #050510 70%, #000 100%)",
        borderRadius: 20,
        overflow: "hidden",
        border: "1px solid #ffffff18",
        boxShadow: "inset 0 0 80px #6366f108",
      }}
    >
      {/* 별 배경 */}
      <StarField />

      {/* 게임 블롭들 */}
      {games.map((game) => {
        const href = token ? gameHrefWithToken(game.url, token) : game.url;
        const layout = GAME_LAYOUT[game.id];

        if (layout) {
          return (
            <GameBlob
              key={game.id}
              game={game}
              href={href}
              scale={scale}
              {...layout}
            />
          );
        }

        // 레이아웃 없는 게임
        const pos = OVERFLOW_POSITIONS[overflowIdx++ % OVERFLOW_POSITIONS.length];
        return (
          <GameBlob
            key={game.id}
            game={game}
            href={href}
            scale={scale}
            cx={pos.cx} cy={pos.cy} r={pos.r}
            blob="50% 50% 45% 55% / 50% 50% 50% 50%"
            color="#374151"
            glow="#9ca3af"
            labelOffset={pos.r + 16}
          />
        );
      })}
    </div>
    </div>
  );
}

// SVG 별 배경
function StarField() {
  const stars = [
    [8,12],[15,5],[22,30],[30,8],[38,18],[45,3],[52,28],[60,10],[68,22],[75,5],
    [82,15],[90,28],[95,8],[5,50],[12,65],[20,55],[28,72],[35,48],[42,68],[50,52],
    [58,75],[65,58],[72,72],[80,48],[88,65],[94,55],[3,80],[10,88],[18,78],[25,92],
    [33,82],[40,90],[48,85],[55,92],[62,80],[70,88],[78,82],[85,92],[92,78],[97,88],
    [6,38],[16,42],[24,20],[36,35],[44,12],[53,42],[61,38],[69,48],[77,30],[86,42],
  ];
  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
    >
      {stars.map(([x, y], i) => {
        const size = [0.18, 0.12, 0.22, 0.15, 0.10][i % 5];
        const opacity = [0.8, 0.5, 0.9, 0.6, 0.4][i % 5];
        return <circle key={i} cx={x} cy={y} r={size} fill="white" opacity={opacity} />;
      })}
    </svg>
  );
}
