'use client';
/**
 * 월드 즐겨찾기 — 별표 누른 월드 모음.
 *  - 로그인 시 서버(SoT) + localStorage(캐시) 양쪽 유지.
 *  - 비로그인 시 localStorage 만.
 *  - VRChat "Favorites" 탭 식. 사용자가 명시적으로 ⭐ 누른 월드만.
 *  - Recents 와 달리 자동 추가 X — 항상 명시적 add/remove.
 *  - 최대 100개. SSR 안전.
 */
import { api, session } from '@/lib/api';

const KEY = 'alp_favorite_worlds';
const MAX = 100;

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

function writeLocal(items: FavoriteWorldEntry[]) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX))); } catch { /* noop */ }
}

export function addFavoriteWorld(entry: { id: string; name: string; thumbnailUrl?: string | null }) {
  if (typeof window === 'undefined') return;
  const prev = getFavoriteWorlds();
  if (prev.some(w => w.id === entry.id)) return;
  const next: FavoriteWorldEntry[] = [
    { id: entry.id, name: entry.name, thumbnailUrl: entry.thumbnailUrl ?? null, addedAt: Date.now() },
    ...prev,
  ].slice(0, MAX);
  writeLocal(next);
  // 서버 동기화 (로그인 시) — fire-and-forget
  const tk = session.getToken();
  if (tk) {
    api.addFavoriteWorld(tk, { worldId: entry.id, name: entry.name, thumbnailUrl: entry.thumbnailUrl ?? null })
      .catch(() => { /* offline-tolerant */ });
  }
}

export function removeFavoriteWorld(id: string) {
  if (typeof window === 'undefined') return;
  const next = getFavoriteWorlds().filter(w => w.id !== id);
  writeLocal(next);
  const tk = session.getToken();
  if (tk) {
    api.removeFavoriteWorld(tk, id).catch(() => { /* noop */ });
  }
}

export function toggleFavoriteWorld(entry: { id: string; name: string; thumbnailUrl?: string | null }): boolean {
  if (isFavoriteWorld(entry.id)) {
    removeFavoriteWorld(entry.id);
    return false;
  }
  addFavoriteWorld(entry);
  return true;
}

/**
 * 로그인 시 1회 호출 — 로컬 즐겨찾기를 서버에 push 하고 최종 목록(SoT)을 받아 localStorage 덮어쓰기.
 * 디바이스 A 에서 추가한 즐겨찾기가 디바이스 B 로그인 시 자동 합쳐짐.
 */
export async function syncFavoriteWorldsFromServer(): Promise<FavoriteWorldEntry[]> {
  const tk = session.getToken();
  if (!tk || typeof window === 'undefined') return getFavoriteWorlds();
  try {
    const local = getFavoriteWorlds();
    const { favorites } = await api.syncFavoriteWorlds(tk, local);
    const merged: FavoriteWorldEntry[] = favorites.map(f => ({
      id: f.id, name: f.name, thumbnailUrl: f.thumbnailUrl, addedAt: f.addedAt,
    }));
    writeLocal(merged);
    return merged;
  } catch {
    return getFavoriteWorlds();
  }
}
