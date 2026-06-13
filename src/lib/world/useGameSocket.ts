'use client';
import { useEffect, useRef, useCallback, useState } from 'react';
import { session } from '@/lib/api';

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
  // 선속도 (extrapolation용) — 수신측이 네트워크 지연만큼 앞을 예측
  vel?: [number, number, number];
  // 1인칭 grab 중인 playerId. 수신측이 충돌-기반 ownership 탈취를 막는데 사용.
  grabbedBy?: string | null;
}

/** world.spawn() 또는 유저 in-world spawn 으로 만들어진 런타임 오브젝트 — 멀티 동기화용 */
export interface RuntimeObjectSpec {
  id: string;
  kind: string;
  assetUrl?: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
  physics?: 'none' | 'fixed' | 'dynamic';
  material?: string;
  materialColor?: string;
  // 유저 spawn — 이미지(plane+textureAlbedo), 비디오(plane+videoUrl), 오디오(sound+soundUrl)
  textureAlbedo?: string;
  videoUrl?: string;
  soundUrl?: string;
  soundVolume?: number;
  soundLoop?: boolean;
  soundAutoplay?: boolean;
  soundRadius?: number;
  // Prefab — 컴포넌트(Grab/AutoRotate)·스크립트·자식 트리
  components?: unknown[];   // ComponentInstance[] — 정확한 타입은 components.ts 에
  keyframeAnim?: unknown;   // KeyframeAnim — 키프레임 애니메이션
  script?: string;
  scriptVars?: Record<string, unknown>;
  grabbable?: boolean;
  parentId?: string;
  label?: string;
  /** 런타임 지형 생성 파라미터 — heights 배열 대신 시드만 전송, 각 클라가 동일 지형 재생성. */
  terrainGen?: { seed: number; size: number; segments: number; amplitude: number; scale: number; baseColor: string };
}

interface Options {
  worldId: string;
  /** 같은 worldId 안에서 분리된 세션 (DO 인스턴스). 미지정 시 "main" */
  sessionId?: string;
  /** 비공개 세션 — 공개 목록에서 제외 (코드/링크 아는 사람만 참가) */
  isPrivate?: boolean;
  playerId: string;
  username: string;
  character: Record<string, unknown>;
  enabled: boolean;
  onScriptEvent?: (msg: ScriptEventMessage) => void;
  onObjectStates?: (states: ObjectStateUpdate[], fromId: string) => void;
  onObjectOwnership?: (objectId: string, ownerId: string | null) => void;
  /** 다른 클라가 world.spawn 한 오브젝트 또는 신규 입장 시 일괄 수신 */
  onObjSpawn?: (spec: RuntimeObjectSpec) => void;
  /** 다른 클라가 obj.destroy() 한 결과 */
  onObjDestroy?: (objectId: string) => void;
  /** 호스트가 등록한 씬 전체 스냅샷 (입장 시 한 번 수신) */
  onSceneSnapshot?: (objects: unknown[]) => void;
  /** DO 가 spawn 거부 — 소유자당 5개 제한 초과 등. id 는 거부된 spec.id (롤백 용) */
  onObjSpawnRejected?: (reason: string, id?: string) => void;
}

export function useGameSocket({ worldId, sessionId = 'main', isPrivate = false, playerId, username, character, enabled, onScriptEvent, onObjectStates, onObjectOwnership, onObjSpawn, onObjDestroy, onSceneSnapshot, onObjSpawnRejected }: Options) {
  const onScriptEventRef     = useRef(onScriptEvent);
  const onObjectStatesRef    = useRef(onObjectStates);
  const onObjectOwnershipRef = useRef(onObjectOwnership);
  const onObjSpawnRef        = useRef(onObjSpawn);
  const onObjDestroyRef      = useRef(onObjDestroy);
  const onObjSpawnRejectedRef = useRef(onObjSpawnRejected);
  const onSceneSnapshotRef   = useRef(onSceneSnapshot);
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

    // 토큰 동봉 — Worker 가 입장 전 차단(ban) 유저를 거른다. 비로그인(게스트)이면 토큰 없이 연결.
    const token = session.getToken();
    const tokenQs = token ? `&token=${encodeURIComponent(token)}` : '';
    const sock = new WebSocket(`${wsBase}/_alp/world-ws?worldId=${encodeURIComponent(worldId)}&sessionId=${encodeURIComponent(sessionId)}${isPrivate ? '&private=1' : ''}${tokenQs}`);
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
      else if (msg.type === 'obj_owner') {
        const o = msg as unknown as { objectId: string; ownerId: string | null };
        onObjectOwnershipRef.current?.(o.objectId, o.ownerId ?? null);
      }
      else if (msg.type === 'obj_owner_snapshot') {
        // 신규 join 시 서버가 현재 owner 상태 전체를 전송
        const o = msg as unknown as { owners: Array<{ objectId: string; ownerId: string | null }> };
        if (Array.isArray(o.owners)) {
          for (const { objectId, ownerId } of o.owners) {
            onObjectOwnershipRef.current?.(objectId, ownerId ?? null);
          }
        }
      }
      else if (msg.type === 'obj_spawn') {
        const o = msg as unknown as { spec: RuntimeObjectSpec };
        if (o.spec && o.spec.id) onObjSpawnRef.current?.(o.spec);
      }
      else if (msg.type === 'obj_destroy') {
        const o = msg as unknown as { objectId: string };
        if (o.objectId) onObjDestroyRef.current?.(o.objectId);
      }
      else if (msg.type === 'obj_spawn_rejected') {
        const o = msg as unknown as { reason?: string; id?: string };
        onObjSpawnRejectedRef.current?.(o.reason || 'unknown', o.id);
      }
      else if (msg.type === 'runtime_objects') {
        // 신규 입장 시 일괄 — 각 spec을 onObjSpawn으로 전달
        const o = msg as unknown as { objects: RuntimeObjectSpec[] };
        if (Array.isArray(o.objects)) {
          for (const spec of o.objects) {
            if (spec && spec.id) onObjSpawnRef.current?.(spec);
          }
        }
      }
      else if (msg.type === 'scene_snapshot') {
        // 호스트가 등록한 씬 전체 (입장 시 1회)
        const o = msg as unknown as { objects: unknown[] };
        if (Array.isArray(o.objects)) onSceneSnapshotRef.current?.(o.objects);
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
  }, [worldId, sessionId, isPrivate, playerId, username, character, enabled]);

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

  // 호스트 자격 추적 — 창 hidden/잠수 시 'active=false' 전송 → DO 가 호스트 박탈.
  // 다시 visible 또는 입력 시 'active=true'.
  useEffect(() => {
    if (!enabled) return;
    const IDLE_TIMEOUT = 60_000;  // 1분 무입력 → 잠수
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let lastActive: boolean | null = null;
    const send = (active: boolean) => {
      if (lastActive === active) return;
      lastActive = active;
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'active', active }));
      }
    };
    const setIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => send(false), IDLE_TIMEOUT);
    };
    const onUserInput = () => {
      if (document.hidden) return;  // 창 hidden 이면 input 무시
      send(true);
      setIdleTimer();
    };
    const onVisibility = () => {
      if (document.hidden) {
        send(false);
        if (idleTimer) clearTimeout(idleTimer);
      } else {
        send(true);
        setIdleTimer();
      }
    };
    // 초기 — visible + active
    if (!document.hidden) { send(true); setIdleTimer(); }
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('keydown', onUserInput, { passive: true });
    window.addEventListener('mousemove', onUserInput, { passive: true });
    window.addEventListener('pointerdown', onUserInput, { passive: true });
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('keydown', onUserInput);
      window.removeEventListener('mousemove', onUserInput);
      window.removeEventListener('pointerdown', onUserInput);
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, [enabled]);

  const sendMove = useCallback((pos: { x: number; y: number; z: number; rotY: number; animState?: AnimState; vx?: number; vy?: number; vz?: number }) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'move', ...pos }));
    }
    // 본인 pose 도 posesRef 에 기록 — DO 는 sender 제외 broadcast 이므로 본인은 자기 데이터 안 받음.
    // 이게 빠지면 에셋 spawn 위치 계산 등에서 본인 위치를 (0,0,0) 으로 인식 → 월드 중앙 생성 버그.
    posesRef.current.set(playerId, {
      x: pos.x, y: pos.y, z: pos.z, rotY: pos.rotY,
      animState: pos.animState ?? 'idle',
      vx: pos.vx ?? 0, vy: pos.vy ?? 0, vz: pos.vz ?? 0,
      lastUpdate: Date.now(),
    });
  }, [playerId]);

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

  const sendObjClaim = useCallback((objectId: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'obj_claim', objectId }));
    }
  }, []);

  const sendObjRelease = useCallback((objectId: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'obj_release', objectId }));
    }
  }, []);

  const sendObjSpawn = useCallback((spec: RuntimeObjectSpec) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'obj_spawn', spec }));
    }
  }, []);

  const sendObjDestroy = useCallback((objectId: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'obj_destroy', objectId }));
    }
  }, []);

  const sendSceneRegister = useCallback((objects: unknown[]) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'scene_register', objects }));
    }
  }, []);

  useEffect(() => { onScriptEventRef.current     = onScriptEvent;     }, [onScriptEvent]);
  useEffect(() => { onObjectStatesRef.current    = onObjectStates;    }, [onObjectStates]);
  useEffect(() => { onObjectOwnershipRef.current = onObjectOwnership; }, [onObjectOwnership]);
  useEffect(() => { onObjSpawnRef.current        = onObjSpawn;        }, [onObjSpawn]);
  useEffect(() => { onObjDestroyRef.current      = onObjDestroy;      }, [onObjDestroy]);
  useEffect(() => { onObjSpawnRejectedRef.current = onObjSpawnRejected; }, [onObjSpawnRejected]);
  useEffect(() => { onSceneSnapshotRef.current   = onSceneSnapshot;   }, [onSceneSnapshot]);

  return { players, posesRef, chatLog, chatBubbles, connected, sendMove, sendChat, sendScriptEvent, sendObjectStates, sendObjClaim, sendObjRelease, sendObjSpawn, sendObjDestroy, sendSceneRegister, hostId, socketRef: ws };
}
