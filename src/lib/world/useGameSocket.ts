'use client';
import { useEffect, useRef, useCallback, useState } from 'react';

export interface RemotePlayer {
  id: string;
  username: string;
  character: Record<string, unknown>;
  x: number;
  y: number;
  z: number;
  rotY: number;
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

  const ws     = useRef<WebSocket | null>(null);
  const timer  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dead   = useRef(false);

  const connect = useCallback(() => {
    if (dead.current || !enabled) return;

    // Cloudflare Worker (play.airliveplay.com) 사용 — WSS 지원, 전 세계 엣지
    // 로컬 개발 시 NEXT_PUBLIC_WS_URL=ws://localhost:4000 으로 오버라이드 가능
    const wsBase = process.env.NEXT_PUBLIC_WS_URL || 'wss://play.airliveplay.com';
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
        const map: Record<string, RemotePlayer> = {};
        for (const p of (msg.players as RemotePlayer[])) map[p.id] = p;
        setPlayers(map);
      } else if (msg.type === 'joined') {
        const p = msg as unknown as RemotePlayer & { type: string };
        setPlayers(prev => ({ ...prev, [p.id]: p }));
      } else if (msg.type === 'moved') {
        const { id, x, y, z, rotY } = msg as { id: string; x: number; y: number; z: number; rotY: number; type: string };
        setPlayers(prev => {
          if (!prev[id]) return prev;
          return { ...prev, [id]: { ...prev[id], x, y, z, rotY } };
        });
      } else if (msg.type === 'left') {
        setPlayers(prev => {
          const next = { ...prev };
          delete next[msg.id as string];
          return next;
        });
      } else if (msg.type === 'chat') {
        const { id, username: un, message } = msg as { id: string; username: string; message: string; type: string };
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

  const sendMove = useCallback((pos: { x: number; y: number; z: number; rotY: number }) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'move', ...pos }));
    }
  }, []);

  const sendChat = useCallback((message: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'chat', message }));
    }
  }, []);

  return { players, chatLog, connected, sendMove, sendChat };
}
