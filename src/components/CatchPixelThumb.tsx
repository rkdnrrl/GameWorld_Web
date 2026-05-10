"use client";

import { useEffect, useRef } from "react";
import type { CatchPixelArt } from "@/lib/api";

type Props = {
  art: CatchPixelArt;
  /** CSS 픽셀 크기 */
  width?: number;
  height?: number;
  className?: string;
};

/** DB에 저장된 pixelArt JSON을 게임과 동일하게 확대 표시 */
export default function CatchPixelThumb({
  art,
  width = 48,
  height = 34,
  className = "",
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !art?.cells?.length || !art?.palette?.length) return;
    const w = art.w;
    const h = art.h;
    if (art.cells.length !== w * h) return;

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    for (let i = 0; i < art.cells.length; i += 1) {
      const cidx = Number(art.cells[i]);
      if (!Number.isInteger(cidx) || cidx < 0 || cidx >= art.palette.length) {
        continue;
      }
      const px = i % w;
      const py = Math.floor(i / w);
      ctx.fillStyle = art.palette[cidx] ?? "#000000";
      ctx.fillRect(px, py, 1, 1);
    }
  }, [art]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={`block shrink-0 ${className}`}
      style={{
        width,
        height,
        imageRendering: "pixelated",
      }}
    />
  );
}
