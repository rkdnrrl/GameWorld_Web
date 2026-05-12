"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { blobUrlFromDataUrl, normalizePixelDataUrl } from "@/lib/pixelDataUrl";

type Props = {
  raw: string | null | undefined;
  className?: string;
  maxHeightPx?: number;
  /** 목록 썸네일 — 작은 정사각형 */
  variant?: "default" | "thumb";
};

/**
 * 운영 콘솔용: DB에 저장된 data URL / raw base64 를 정규화하고,
 * data: 로드 실패 시 blob: 으로 한 번만 재시도합니다.
 */
export default function OperatorPixelImg({
  raw,
  className = "",
  maxHeightPx = 192,
  variant = "default",
}: Props) {
  const dataUrl = useMemo(() => normalizePixelDataUrl(raw) || "", [raw]);
  const [src, setSrc] = useState(dataUrl);
  const blobTried = useRef(false);

  useEffect(() => {
    blobTried.current = false;
    setSrc(dataUrl);
  }, [dataUrl]);

  useEffect(() => {
    return () => {
      if (src.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(src);
        } catch {
          /* ignore */
        }
      }
    };
  }, [src]);

  const onError = useCallback(() => {
    if (blobTried.current || !dataUrl) return;
    blobTried.current = true;
    const blob = blobUrlFromDataUrl(dataUrl);
    if (blob) setSrc(blob);
  }, [dataUrl]);

  const isThumb = variant === "thumb";
  const mh = isThumb ? Math.min(maxHeightPx, 48) : maxHeightPx;

  if (!src) {
    if (isThumb) {
      return (
        <span className="inline-flex h-12 w-12 items-center justify-center rounded border border-dashed border-zinc-300 text-xs text-zinc-400 dark:border-zinc-600">
          —
        </span>
      );
    }
    return (
      <span className="text-xs text-zinc-500 dark:text-zinc-400">
        표시할 이미지가 없거나 형식이 잘못되었습니다.
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      {...(!isThumb ? { width: 256, height: 256 } : {})}
      className={`${isThumb ? "box-border max-h-12 max-w-12" : ""} ${className}`}
      style={{
        maxHeight: mh,
        maxWidth: isThumb ? mh : "100%",
        width: isThumb ? mh : "auto",
        height: isThumb ? mh : "auto",
        objectFit: "contain",
        imageRendering: "pixelated",
      }}
      onError={onError}
    />
  );
}
