'use client';
/**
 * 인-월드 플레이어 안전 — 로컬 음소거/차단 리스트 (localStorage, 기기별).
 *  - mute  : 그 유저의 음성만 끔 (아바타·채팅은 보임).
 *  - block : 음성 + 채팅 + 아바타 전부 숨김 (강한 차단).
 * username(소문자) 기준. 알파 단계: 로컬 저장으로 충분(서버 동기화는 후속).
 */
import { useEffect, useState } from 'react';

const MUTE_KEY = 'alp-muted-users';
const BLOCK_KEY = 'alp-blocked-users';

function load(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(arr.map(s => s.toLowerCase()));
  } catch { return new Set(); }
}
function save(key: string, set: Set<string>) {
  try { window.localStorage.setItem(key, JSON.stringify([...set])); } catch { /* noop */ }
}

let muted = load(MUTE_KEY);
let blocked = load(BLOCK_KEY);

const listeners = new Set<() => void>();
function emit() { listeners.forEach(fn => fn()); }

const norm = (u: string) => (u || '').toLowerCase();

export function isMuted(u: string): boolean { return muted.has(norm(u)) || blocked.has(norm(u)); }
export function isBlocked(u: string): boolean { return blocked.has(norm(u)); }

export function setMuted(u: string, on: boolean) {
  const k = norm(u); if (!k) return;
  if (on) muted.add(k); else muted.delete(k);
  save(MUTE_KEY, muted); emit();
}
export function setBlocked(u: string, on: boolean) {
  const k = norm(u); if (!k) return;
  if (on) blocked.add(k); else blocked.delete(k);
  save(BLOCK_KEY, blocked); emit();
}

/** 차단된 username 들 (소문자). 렌더 필터용 스냅샷. */
export function blockedSnapshot(): Set<string> { return new Set(blocked); }
export function mutedSnapshot(): Set<string> { return new Set(muted); }

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** 특정 유저의 mute/block 상태 구독 (패널용). */
export function useBlockState(username: string): { muted: boolean; blocked: boolean } {
  const [, force] = useState(0);
  useEffect(() => subscribe(() => force(n => n + 1)), []);
  return { muted: muted.has(norm(username)), blocked: blocked.has(norm(username)) };
}

/** 전체 차단 set 구독 (월드 렌더 필터용). 변경 시 새 Set 반환. */
export function useBlockedSet(): Set<string> {
  const [set, setSet] = useState<Set<string>>(() => new Set(blocked));
  useEffect(() => subscribe(() => setSet(new Set(blocked))), []);
  return set;
}
/** 전체 음소거 set 구독 (음성 필터용). */
export function useMutedSet(): Set<string> {
  const [set, setSet] = useState<Set<string>>(() => new Set([...muted, ...blocked]));
  useEffect(() => subscribe(() => setSet(new Set([...muted, ...blocked]))), []);
  return set;
}
