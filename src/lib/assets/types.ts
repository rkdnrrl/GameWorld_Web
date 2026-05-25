/** 에셋 도메인 타입 — 서버 API 와 동일 구조 */

export interface Asset {
  id: string;
  name: string;
  modelUrl: string;
  thumbnailUrl: string | null;
  isPublic: boolean;
  createdAt: string;
  kind: string | null;                  // asset_kinds.id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any;                       // 타입별 메타데이터
  tags?: string[];
  folder?: string | null;
  fileSize?: string | null;             // BigInt → string
  /** @deprecated metadata.materialConfig 사용 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  materialConfig?: any;
}

export interface AssetKind {
  id: string;
  label: string;
  icon: string | null;
  extensions: string[];
  mimeTypes: string[];
  maxSizeMb: number;
  sortOrder: number;
  enabled: boolean;
}

/** 확장자 → kind id 매핑 (fallback) */
export function detectKindFromUrl(url: string, kinds: AssetKind[]): string | null {
  const m = url.toLowerCase().match(/\.([a-z0-9]+)(\?|$)/);
  if (!m) return null;
  const ext = m[1];
  return kinds.find(k => k.extensions.includes(ext))?.id ?? null;
}

/** asset.materialConfig (deprecated) 와 asset.metadata.materialConfig 통합해서 가져오기 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getMaterialConfig(asset: Asset): any {
  return asset.metadata?.materialConfig ?? asset.materialConfig ?? null;
}
