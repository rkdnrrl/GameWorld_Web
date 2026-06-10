'use client';
/**
 * 친구의 현재 접속 위치 (presence) — 30초 polling.
 *  - 비로그인 시 빈 배열
 *  - 탭 숨김 (visibility hidden) 동안 fetch skip
 *  - 컴포넌트가 자주 마운트되는 경우 비용 절감 위해 30초 간격 충분
 */
import { useEffect, useState } from 'react';
import { api, session } from '@/lib/api';

const INTERVAL_MS = 30_000;

export interface FriendLocation {
  userId: string;
  username: string;
  profileImageUrl: string | null;
  worldId: string;
  worldName: string | null;   // 비공개 월드면 null
  worldIsPublic: boolean;
  updatedAt: string;
}

export function useFriendLocations(): { locations: FriendLocation[]; loading: boolean } {
  const [locations, setLocations] = useState<FriendLocation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = session.getToken();
    if (!token) { setLoading(false); return; }

    let alive = true;

    async function fetchOnce() {
      if (!token) return;
      try {
        const d = await api.listFriendLocations(token);
        if (alive) { setLocations(d.locations); setLoading(false); }
      } catch {
        if (alive) setLoading(false);
      }
    }

    fetchOnce();
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      fetchOnce();
    }, INTERVAL_MS);

    return () => { alive = false; clearInterval(id); };
  }, []);

  return { locations, loading };
}
