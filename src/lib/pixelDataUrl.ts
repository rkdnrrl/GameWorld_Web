/**
 * shared_pixel_arts.imageData 등 저장값 → <img src>에 넣을 수 있는 URL.
 * - 앞뒤 공백·줄바꿈 제거
 * - 이미 data:image/... 이면 그대로(페이로드 공백만 제거)
 * - 순수 base64만 있으면 PNG data URL로 감쌈
 */

export function normalizePixelDataUrl(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/\r?\n/g, "");
  if (s.startsWith("data:image/")) {
    const comma = s.indexOf(",");
    if (comma === -1) return null;
    const head = s.slice(0, comma);
    const payload = s.slice(comma + 1).replace(/\s+/g, "");
    return `${head},${payload}`;
  }
  const compact = s.replace(/\s+/g, "");
  if (compact.length < 32) return null;
  if (!/^[A-Za-z0-9+/=_-]+$/.test(compact)) return null;
  return `data:image/png;base64,${compact}`;
}

/** 정규화된 data URL → blob: (img 로딩 실패 시 폴백용) */
export function blobUrlFromDataUrl(dataUrl: string): string | null {
  try {
    const comma = dataUrl.indexOf(",");
    if (comma === -1) return null;
    const meta = dataUrl.slice(0, comma);
    const b64 = dataUrl.slice(comma + 1);
    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64$/i.exec(meta);
    const mime = m ? m[1] : "image/png";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}
