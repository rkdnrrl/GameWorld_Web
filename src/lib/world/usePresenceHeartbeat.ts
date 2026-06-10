'use client';
/**
 * 월드 접속 중 presence heartbeat — 30초마다 백엔드에 ping.
 *  - 마운트 시 즉시 ping + 인터벌 시작
 *  - worldId 변경 시 새 worldId 로 ping (자동 switch)
 *  - 탭 숨김 (visibilitychange) 동안 ping 중단 → 90초 후 백엔드에서 offline 으로 간주
 *  - unmount / beforeunload 시 명시적 offline (fetch DELETE keepalive)
 *  - 비로그인 시 noop
 */
import { useEffect, useRef } from 'react';
import { api, session } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://airliveplay.com';

const INTERVAL_MS = 30_000;

export function usePresenceHeartbeat(worldId: string | null) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const token = session.getToken();
    if (!token || !worldId) return;

    function ping() {
      if (!token || !worldId) return;
      api.presenceHeartbeat(token, worldId).catch(() => {});
    }
    function clear() {
      if (!token) return;
      // keepalive — 페이지 unload 중에도 전송 시도
      try {
        fetch(`${API_BASE}/api/presence`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
          keepalive: true,
        }).catch(() => {});
      } catch { /* noop */ }
    }

    ping();
    timerRef.current = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      ping();
    }, INTERVAL_MS);

    window.addEventListener('beforeunload', clear);
    return () => {
      window.removeEventListener('beforeunload', clear);
      if (timerRef.current) clearInterval(timerRef.current);
      clear();
    };
  }, [worldId]);
}
