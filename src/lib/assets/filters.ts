/**
 * 에셋 필터/정렬 — 순수함수
 * 새 필터 축(폴더/태그/...) 추가 시 조건 한 줄만 더하면 됨.
 */

import type { Asset, AssetKind } from './types';
import { detectKindFromUrl } from './types';

export type SortMode = 'recent' | 'oldest' | 'name' | 'kind';
export type VisibilityFilter = 'all' | 'private' | 'public';

export interface AssetQuery {
  /** 검색어 (이름/태그) — 빈 문자열이면 전체 */
  q?: string;
  /** kind id 화이트리스트 — 빈 배열이면 전체 */
  kinds?: string[];
  /** 공개여부 */
  visibility?: VisibilityFilter;
  /** 태그 화이트리스트 (모두 일치) */
  tags?: string[];
  /** 폴더 prefix 매칭 */
  folder?: string | null;
  /** 정렬 */
  sort?: SortMode;
}

/** asset.kind 가 비어있으면 URL 확장자로 추론 */
function resolveKind(asset: Asset, kinds: AssetKind[]): string | null {
  return asset.kind || detectKindFromUrl(asset.modelUrl, kinds);
}

export function filterAssets(
  assets: Asset[],
  query: AssetQuery,
  kinds: AssetKind[],
): Asset[] {
  const q = (query.q || '').trim().toLowerCase();
  const kindWhitelist = query.kinds && query.kinds.length > 0 ? new Set(query.kinds) : null;
  const tagWhitelist  = query.tags  && query.tags.length  > 0 ? query.tags : null;
  const vis = query.visibility ?? 'all';
  const folderPrefix = query.folder ?? null;

  return assets.filter(a => {
    // 1) 검색어 (이름 또는 태그)
    if (q) {
      const inName = a.name.toLowerCase().includes(q);
      const inTags = (a.tags || []).some(t => t.toLowerCase().includes(q));
      if (!inName && !inTags) return false;
    }
    // 2) kind
    if (kindWhitelist) {
      const k = resolveKind(a, kinds);
      if (!k || !kindWhitelist.has(k)) return false;
    }
    // 3) 공개여부
    if (vis === 'private' && a.isPublic)  return false;
    if (vis === 'public'  && !a.isPublic) return false;
    // 4) 태그 (모두 일치)
    if (tagWhitelist) {
      const t = a.tags || [];
      if (!tagWhitelist.every(tag => t.includes(tag))) return false;
    }
    // 5) 폴더
    if (folderPrefix != null) {
      const f = a.folder || '';
      if (!f.startsWith(folderPrefix)) return false;
    }
    return true;
  });
}

export function sortAssets(assets: Asset[], sort: SortMode, kinds: AssetKind[]): Asset[] {
  const arr = [...assets];
  switch (sort) {
    case 'recent':
      arr.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      break;
    case 'oldest':
      arr.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
      break;
    case 'name':
      arr.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'kind':
      arr.sort((a, b) => {
        const ka = resolveKind(a, kinds) || 'zzz';
        const kb = resolveKind(b, kinds) || 'zzz';
        return ka.localeCompare(kb) || a.name.localeCompare(b.name);
      });
      break;
  }
  return arr;
}

/** kind 별 카운트 — 사이드바용 */
export function countByKind(assets: Asset[], kinds: AssetKind[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const a of assets) {
    const k = resolveKind(a, kinds);
    if (!k) continue;
    counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}
