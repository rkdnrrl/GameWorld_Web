'use client';
/**
 * 월드 즐겨찾기 — 별표 누른 월드 모음. localStorage 기반.
 *  - VRChat "Favorites" 탭 식. 사용자가 명시적으로 ⭐ 누른 월드만.
 *  - Recents 와 달리 자동 추가 X — 항상 명시적 add/remove.
 *  - 최대 50개 (별표 무한히 누르는 거 방지).
 *  - SSR 안전.
 */
const KEY = 'alp_favorite_worlds';
const MAX = 50;

export interface FavoriteWorldEntry {
  id: string;
  name: string;
  thumbnailUrl?: string | null;
  addedAt: number; // unix ms
}

export function getFavoriteWorlds(): FavoriteWorldEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is FavoriteWorldEntry =>
      !!x && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.addedAt === 'number'
    );
  } catch { return []; }
}

export function isFavoriteWorld(id: string): boolean {
  return getFavoriteWorlds().some(w => w.id === id);
}

export function addFavoriteWorld(entry: { id: string; name: string; thumbnailUrl?: string | null }) {
  if (typeof window === 'undefined') return;
  try {
    const prev = getFavoriteWorlds();
    if (prev.some(w => w.id === entry.id)) return; // 이미 있음
    const next: FavoriteWorldEntry[] = [
      { id: entry.id, name: entry.name, thumbnailUrl: entry.thumbnailUrl ?? null, addedAt: Date.now() },
      ...prev,
    ].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* noop */ }
}

export function removeFavoriteWorld(id: string) {
  if (typeof window === 'undefined') return;
  try {
    const next = getFavoriteWorlds().filter(w => w.id !== id);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* noop */ }
}

export function toggleFavoriteWorld(entry: { id: string; name: string; thumbnailUrl?: string | null }): boolean {
  if (isFavoriteWorld(entry.id)) {
    removeFavoriteWorld(entry.id);
    return false;
  }
  addFavoriteWorld(entry);
  return true;
}
