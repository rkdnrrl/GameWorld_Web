"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { blobUrlFromDataUrl, normalizePixelDataUrl } from "@/lib/pixelDataUrl";

type Props = {
  raw: string | null | undefined;
  className?: string;
  maxHeightPx?: number;
};

/**
 * 운영 콘솔용: DB에 저장된 data URL / raw base64 를 정규화하고,
 * data: 로드 실패 시 blob: 으로 한 번만 재시도합니다.
 */
export default function OperatorPixelImg({
  raw,
  className = "",
  maxHeightPx = 192,
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

  if (!src) {
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
      width={256}
      height={256}
      className={className}
      style={{
        maxHeight: maxHeightPx,
        maxWidth: "100%",
        width: "auto",
        height: "auto",
        objectFit: "contain",
        imageRendering: "pixelated",
      }}
      onError={onError}
    />
  );
}
