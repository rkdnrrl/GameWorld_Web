'use client';
import { useEffect, useRef, useCallback, useState } from 'react';

export type AnimState = 'idle' | 'walk' | 'run' | 'jump' | 'crouch' | 'prone';

/** 정적 정보 — 입장/퇴장 시에만 변경 (React 재렌더 트리거) */
export interface RemotePlayer {
  id: string;
  username: string;
  character: Record<string, unknown>;
}

/** 동적 정보 — 매 프레임 업데이트 (ref로만 관리, 재렌더 안 함) */
export interface PlayerPose {
  x: number;
  y: number;
  z: number;
  rotY: number;
  animState?: AnimState;
  lastUpdate: number;
}

export interface ChatMessage {
  id: string;
  username: string;
  message: string;
  time: number;
}

interface Options {
  worldId: string;
  playerId: string;
  username: string;
  character: Record<string, unknown>;
  enabled: boolean;
}

export function useGameSocket({ worldId, playerId, username, character, enabled }: Options) {
  const [players, setPlayers]     = useState<Record<string, RemotePlayer>>({});
  const [chatLog, setChatLog]     = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  /** 위치/회전/애니메이션 상태 — 재렌더 없이 매 프레임 mutate */
  const posesRef = useRef<Map<string, PlayerPose>>(new Map());

  const ws    = useRef<WebSocket | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dead  = useRef(false);

  const connect = useCallback(() => {
    if (dead.current || !enabled) return;
    const isLocal = typeof window !== 'undefined' && window.location.hostname === 'localhost';
    const wsBase  = isLocal
      ? (process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000')
      : 'wss://play.airliveplay.com';
    const sock = new WebSocket(`${wsBase}/_alp/world-ws?worldId=${worldId}`);
    ws.current = sock;

    sock.onopen = () => {
      setConnected(true);
      sock.send(JSON.stringify({ type: 'join', worldId, playerId, username, character }));
    };

    sock.onmessage = (e) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(e.data as string); } catch { return; }

      if (msg.type === 'players') {
        // 초기 플레이어 목록
        const map: Record<string, RemotePlayer> = {};
        const newPoses = new Map<string, PlayerPose>();
        const now = Date.now();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const p of (msg.players as any[])) {
          map[p.id] = { id: p.id, username: p.username, character: p.character };
          newPoses.set(p.id, { x: p.x, y: p.y, z: p.z, rotY: p.rotY, animState: p.animState, lastUpdate: now });
        }
        posesRef.current = newPoses;
        setPlayers(map);
      }
      else if (msg.type === 'joined') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = msg as any;
        posesRef.current.set(p.id, { x: p.x, y: p.y, z: p.z, rotY: p.rotY, animState: p.animState, lastUpdate: Date.now() });
        setPlayers(prev => ({ ...prev, [p.id]: { id: p.id, username: p.username, character: p.character } }));
      }
      else if (msg.type === 'moved') {
        // 핵심: ref만 mutate, setState 호출 안 함 → React 재렌더 없음
        const { id, x, y, z, rotY, animState } =
          msg as { id: string; x: number; y: number; z: number; rotY: number; animState?: AnimState };
        const prev = posesRef.current.get(id);
        if (prev) {
          prev.x = x; prev.y = y; prev.z = z; prev.rotY = rotY;
          prev.animState = animState; prev.lastUpdate = Date.now();
        } else {
          posesRef.current.set(id, { x, y, z, rotY, animState, lastUpdate: Date.now() });
        }
      }
      else if (msg.type === 'left') {
        posesRef.current.delete(msg.id as string);
        setPlayers(prev => {
          const next = { ...prev };
          delete next[msg.id as string];
          return next;
        });
      }
      else if (msg.type === 'chat') {
        const { id, username: un, message } = msg as { id: string; username: string; message: string };
        setChatLog(prev => [...prev.slice(-49), { id, username: un, message, time: Date.now() }]);
      }
    };

    sock.onclose = () => {
      setConnected(false);
      if (!dead.current) timer.current = setTimeout(connect, 3000);
    };
    sock.onerror = () => sock.close();
  }, [worldId, playerId, username, character, enabled]);

  useEffect(() => {
    dead.current = false;
    connect();
    return () => {
      dead.current = true;
      clearTimeout(timer.current);
      ws.current?.close();
    };
  }, [connect]);

  const sendMove = useCallback((pos: { x: number; y: number; z: number; rotY: number; animState?: AnimState }) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'move', ...pos }));
    }
  }, []);

  const sendChat = useCallback((message: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'chat', message }));
    }
  }, []);

  return { players, posesRef, chatLog, connected, sendMove, sendChat };
}
