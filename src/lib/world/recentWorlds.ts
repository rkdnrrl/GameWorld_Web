'use client';
/**
 * 최근 방문한 월드 (LRU) — localStorage 기반.
 *  - 월드 입장 시 add 호출. 최신순. 최대 8개 유지.
 *  - 같은 id 재방문 시 맨 앞으로 이동 + 메타 갱신.
 *  - SSR 안전 (window undefined 체크).
 */
const KEY = 'alp_recent_worlds';
const MAX = 8;

export interface RecentWorldEntry {
  id: string;
  name: string;
  thumbnailUrl?: string | null;
  visitedAt: number; // unix ms
}

export function getRecentWorlds(): RecentWorldEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is RecentWorldEntry =>
      !!x && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.visitedAt === 'number'
    );
  } catch { return []; }
}

export function addRecentWorld(entry: { id: string; name: string; thumbnailUrl?: string | null }) {
  if (typeof window === 'undefined') return;
  try {
    const now = Date.now();
    const prev = getRecentWorlds();
    const filtered = prev.filter(w => w.id !== entry.id);
    const next: RecentWorldEntry[] = [
      { id: entry.id, name: entry.name, thumbnailUrl: entry.thumbnailUrl ?? null, visitedAt: now },
      ...filtered,
    ].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* noop */ }
}

export function removeRecentWorld(id: string) {
  if (typeof window === 'undefined') return;
  try {
    const next = getRecentWorlds().filter(w => w.id !== id);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* noop */ }
}
