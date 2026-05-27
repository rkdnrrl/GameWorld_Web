'use client';
import { useEffect, useRef, useCallback, useState } from 'react';

export type AnimState = string;

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
  // 속도 (m/s) — 원격 플레이어 kinematic body가 실제 속도로 움직이게 해서 박스 push 힘 제공
  vx?: number;
  vy?: number;
  vz?: number;
  lastUpdate: number;
}

export interface ChatMessage {
  id: string;
  username: string;
  message: string;
  time: number;
}

export interface ChatBubble {
  message: string;
  time: number;
}

export interface ScriptEventMessage {
  objectId: string;
  event: string;
  data: Record<string, unknown>;
  fromId: string;
}

export interface ObjectStateUpdate {
  id: string;
  pos: [number, number, number];
  rot: [number, number, number];
  scl: [number, number, number];
  vis: boolean;
}

interface Options {
  worldId: string;
  playerId: string;
  username: string;
  character: Record<string, unknown>;
  enabled: boolean;
  onScriptEvent?: (msg: ScriptEventMessage) => void;
  onObjectStates?: (states: ObjectStateUpdate[], fromId: string) => void;
}

export function useGameSocket({ worldId, playerId, username, character, enabled, onScriptEvent, onObjectStates }: Options) {
  const onScriptEventRef  = useRef(onScriptEvent);
  const onObjectStatesRef = useRef(onObjectStates);
  const [hostId, setHostId] = useState<string | null>(null);
  const [players, setPlayers]     = useState<Record<string, RemotePlayer>>({});
  const [chatLog, setChatLog]     = useState<ChatMessage[]>([]);
  const [chatBubbles, setChatBubbles] = useState<Record<string, ChatBubble>>({});
  const [connected, setConnected] = useState(false);
  /** 위치/회전/애니메이션 상태 — 재렌더 없이 매 프레임 mutate */
  const posesRef = useRef<Map<string, PlayerPose>>(new Map());

  const ws    = useRef<WebSocket | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const bubbleTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const dead  = useRef(false);
  const sessionIdRef = useRef(0);

  const connect = useCallback(() => {
    if (dead.current || !enabled) return;
    const mySessionId = sessionIdRef.current;
    const isLocal = typeof window !== 'undefined' && window.location.hostname === 'localhost';
    const wsBase  = isLocal
      ? (process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000')
      : 'wss://play.airliveplay.com';

    if (ws.current && ws.current.readyState !== WebSocket.CLOSED) {
      try { ws.current.close(); } catch {}
    }

    const sock = new WebSocket(`${wsBase}/_alp/world-ws?worldId=${worldId}`);
    ws.current = sock;

    sock.onopen = () => {
      if (mySessionId !== sessionIdRef.current) {
        try { sock.close(); } catch {}
        return;
      }
      setConnected(true);
      sock.send(JSON.stringify({ type: 'join', worldId, playerId, username, character }));
    };

    sock.onmessage = (e) => {
      if (mySessionId !== sessionIdRef.current) return;
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
        const { id, x, y, z, rotY, animState, vx, vy, vz } =
          msg as { id: string; x: number; y: number; z: number; rotY: number; animState?: AnimState; vx?: number; vy?: number; vz?: number };
        const prev = posesRef.current.get(id);
        if (prev) {
          prev.x = x; prev.y = y; prev.z = z; prev.rotY = rotY;
          prev.animState = animState;
          prev.vx = vx ?? 0; prev.vy = vy ?? 0; prev.vz = vz ?? 0;
          prev.lastUpdate = Date.now();
        } else {
          posesRef.current.set(id, { x, y, z, rotY, animState, vx: vx ?? 0, vy: vy ?? 0, vz: vz ?? 0, lastUpdate: Date.now() });
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
      else if (msg.type === 'script_event') {
        const se = msg as unknown as ScriptEventMessage & { type: string };
        onScriptEventRef.current?.({ objectId: se.objectId, event: se.event, data: se.data ?? {}, fromId: se.fromId });
      }
      else if (msg.type === 'object_states') {
        const o = msg as unknown as { states: ObjectStateUpdate[]; fromId: string };
        if (Array.isArray(o.states)) onObjectStatesRef.current?.(o.states, o.fromId);
      }
      else if (msg.type === 'host') {
        const h = msg as unknown as { hostId: string | null };
        setHostId(h.hostId ?? null);
      }
      else if (msg.type === 'chat') {
        const { id, username: un, message } = msg as { id: string; username: string; message: string };
        const now = Date.now();
        setChatLog(prev => [...prev.slice(-49), { id, username: un, message, time: now }]);
        setChatBubbles((prev) => ({ ...prev, [id]: { message, time: now } }));
        if (bubbleTimers.current[id]) clearTimeout(bubbleTimers.current[id]);
        bubbleTimers.current[id] = setTimeout(() => {
          setChatBubbles((prev) => {
            if (!prev[id]) return prev;
            const next = { ...prev };
            delete next[id];
            return next;
          });
          delete bubbleTimers.current[id];
        }, 6000);
      }
    };

    sock.onclose = () => {
      if (mySessionId !== sessionIdRef.current) return;
      setConnected(false);
      if (!dead.current) timer.current = setTimeout(connect, 3000);
    };
    sock.onerror = () => {
      if (mySessionId !== sessionIdRef.current) return;
      sock.close();
    };
  }, [worldId, playerId, username, character, enabled]);

  useEffect(() => {
    sessionIdRef.current += 1;
    dead.current = false;
    posesRef.current = new Map();
    setPlayers({});
    setChatBubbles({});
    setConnected(false);
    setHostId(null);
    Object.values(bubbleTimers.current).forEach(clearTimeout);
    bubbleTimers.current = {};
    clearTimeout(timer.current);
    connect();
    return () => {
      dead.current = true;
      clearTimeout(timer.current);
      Object.values(bubbleTimers.current).forEach(clearTimeout);
      bubbleTimers.current = {};
      ws.current?.close();
    };
  }, [connect]);

  const sendMove = useCallback((pos: { x: number; y: number; z: number; rotY: number; animState?: AnimState; vx?: number; vy?: number; vz?: number }) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'move', ...pos }));
    }
  }, []);

  const sendChat = useCallback((message: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'chat', message }));
    }
  }, []);

  const sendScriptEvent = useCallback((
    objectId: string,
    event: string,
    data: Record<string, unknown>,
    toId?: string,
  ) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'script_event', objectId, event, data, toId }));
    }
  }, []);

  const sendObjectStates = useCallback((states: ObjectStateUpdate[]) => {
    if (ws.current?.readyState === WebSocket.OPEN && states.length > 0) {
      ws.current.send(JSON.stringify({ type: 'object_states', states }));
    }
  }, []);

  useEffect(() => { onScriptEventRef.current  = onScriptEvent;  }, [onScriptEvent]);
  useEffect(() => { onObjectStatesRef.current = onObjectStates; }, [onObjectStates]);

  return { players, posesRef, chatLog, chatBubbles, connected, sendMove, sendChat, sendScriptEvent, sendObjectStates, hostId };
}
