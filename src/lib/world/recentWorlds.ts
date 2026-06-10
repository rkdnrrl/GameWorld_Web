'use client';
/**
 * 최근 방문한 월드 (LRU).
 *  - 로그인 시 서버(SoT) + localStorage(캐시) 양쪽 유지. 비로그인 시 localStorage 만.
 *  - 월드 입장 시 add 호출. 최신순. 최대 8개 유지.
 *  - 같은 id 재방문 시 맨 앞으로 이동 + 메타 갱신.
 *  - SSR 안전 (window undefined 체크).
 */
import { api, session } from '@/lib/api';

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

function writeLocal(items: RecentWorldEntry[]) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX))); } catch { /* noop */ }
}

export function addRecentWorld(entry: { id: string; name: string; thumbnailUrl?: string | null }) {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  const filtered = getRecentWorlds().filter(w => w.id !== entry.id);
  const next: RecentWorldEntry[] = [
    { id: entry.id, name: entry.name, thumbnailUrl: entry.thumbnailUrl ?? null, visitedAt: now },
    ...filtered,
  ].slice(0, MAX);
  writeLocal(next);
  // 서버 동기화 (로그인 시) — fire-and-forget
  const tk = session.getToken();
  if (tk) {
    api.addRecentWorld(tk, { worldId: entry.id, name: entry.name, thumbnailUrl: entry.thumbnailUrl ?? null })
      .catch(() => { /* offline-tolerant */ });
  }
}

export function removeRecentWorld(id: string) {
  if (typeof window === 'undefined') return;
  const next = getRecentWorlds().filter(w => w.id !== id);
  writeLocal(next);
  const tk = session.getToken();
  if (tk) {
    api.removeRecentWorld(tk, id).catch(() => { /* noop */ });
  }
}

/**
 * 로그인 시 1회 호출 — 로컬 LRU 를 서버에 push 하고 merge 결과(SoT)로 localStorage 덮어쓰기.
 * 항목별로 더 최신인 visitedAt 이 이김 (다른 디바이스 방문 기록과 자연스럽게 섞임).
 */
export async function syncRecentWorldsFromServer(): Promise<RecentWorldEntry[]> {
  const tk = session.getToken();
  if (!tk || typeof window === 'undefined') return getRecentWorlds();
  try {
    const local = getRecentWorlds();
    const { recents } = await api.syncRecentWorlds(tk, local);
    const merged: RecentWorldEntry[] = recents.map(r => ({
      id: r.id, name: r.name, thumbnailUrl: r.thumbnailUrl, visitedAt: r.visitedAt,
    }));
    writeLocal(merged);
    return merged;
  } catch {
    return getRecentWorlds();
  }
}
