/**
 * Cloudflare Calls (Realtime SFU) 기반 음성 채팅 + 3D 위치 사운드 (Phase 24)
 *
 * 구조:
 *   - 각 클라이언트가 Cloudflare Calls 와 **단일 RTCPeerConnection** 유지
 *   - 마이크 켜면 push track → trackId 받음 → 멀티플레이 socket 으로 broadcast
 *   - 다른 사람 trackId 수신 → pull track 으로 받기 → PannerNode 통해 3D 재생
 *   - SFU 라서 peer 수 무관 (50명+ OK), 업로드는 1회 (서버가 분배)
 *
 * 시그널링:
 *   - SDP: 백엔드 /api/voice/* 라우트 proxy (App Secret 보호)
 *   - trackId broadcast: 기존 멀티플레이 WebSocket 의 voice_track 메시지
 *
 * 3D 사운드:
 *   - Web Audio API PannerNode (HRTF). refDistance 2m, maxDistance 40m
 *   - 매 프레임 listener (나) + panner (상대) 위치 갱신
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import type { PlayerPose } from './useGameSocket';
import { session } from '@/lib/api';

const PANNER_REF_DISTANCE = 6;       // 6m 이내 풀 볼륨
const PANNER_MAX_DISTANCE = 60;      // 60m 이상 무음
const PANNER_ROLLOFF      = 0.9;     // 감쇠 곡선

const VOICE_API_BASE = (typeof window !== 'undefined' && (window as { __ALP_API__?: string }).__ALP_API__) || 'https://airliveplay.com';

interface VoiceTrackMessage {
  type: 'voice_track';
  fromId: string;
  sessionId: string;
  trackName: string;
  mic: boolean;
}

interface Options {
  socket: WebSocket | null;
  myId: string;
  peerIds: string[];
  enabled: boolean;
  posesRef?: React.RefObject<Map<string, PlayerPose>>;
  localPoseRef?: React.RefObject<{ x: number; y: number; z: number; rotY: number } | null>;
}

export interface VoiceChatState {
  status: 'idle' | 'requesting' | 'connecting' | 'ready' | 'denied' | 'error';
  error?: string;
  speakingIds: Set<string>;
  micOnIds: Set<string>;
}

interface RemotePeerInfo {
  sessionId: string;
  trackName: string;
  pannerMid?: string;
  panner?: PannerNode;
  analyser?: AnalyserNode;
  rafId?: number;
}

export function useVoiceChat({ socket, myId, peerIds, enabled, posesRef, localPoseRef }: Options): VoiceChatState {
  const [status, setStatus] = useState<VoiceChatState['status']>('idle');
  const [error, setError] = useState<string>();
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(new Set());
  const [micOnIds, setMicOnIds] = useState<Set<string>>(new Set());

  // Cloudflare Calls 1개 RTCPeerConnection
  const pcRef          = useRef<RTCPeerConnection | null>(null);
  const sessionIdRef   = useRef<string | null>(null);
  const myTrackNameRef = useRef<string | null>(null);
  const micStreamRef   = useRef<MediaStream | null>(null);
  // 원격 peer 들 (userId → 정보)
  const remotesRef     = useRef<Map<string, RemotePeerInfo>>(new Map());
  // mid 별 audio track (ontrack 받은 거)
  const tracksByMidRef = useRef<Map<string, MediaStreamTrack>>(new Map());
  // 공용 AudioContext
  const audioCtxRef    = useRef<AudioContext | null>(null);
  // 더미 audio element (Safari workaround — addStream 안정성)
  const sinkElemRef    = useRef<HTMLAudioElement | null>(null);

  /** 백엔드 voice API 호출 helper */
  const apiCall = useCallback(async <T = unknown>(path: string, method: 'POST' | 'PUT', body: unknown): Promise<T> => {
    const tk = session.getToken();
    const r = await fetch(`${VOICE_API_BASE}/api/voice${path}`, {
      method,
      headers: {
        ...(tk ? { Authorization: `Bearer ${tk}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err?.error || `voice API ${r.status}`);
    }
    return r.json();
  }, []);

  /** Cloudflare Calls 세션 시작. micStream 없으면 listen-only (recvonly transceiver 만). */
  const startSession = useCallback(async (micStream: MediaStream | null) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
      bundlePolicy: 'max-bundle',
    });
    pcRef.current = pc;

    // mic 있으면 sendonly, 없으면 recvonly (listen-only)
    let transceiver: RTCRtpTransceiver | null = null;
    if (micStream) {
      const micTrack = micStream.getAudioTracks()[0];
      if (!micTrack) throw new Error('no mic track');
      transceiver = pc.addTransceiver(micTrack, { direction: 'sendonly' });
    } else {
      // recvonly transceiver — Cloudflare 가 pull track 추가 시 mid 매칭에 사용
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }

    // 원격 audio track 도착 시 PannerNode 로 연결
    pc.ontrack = (e) => {
      const track = e.track;
      const mid = e.transceiver?.mid;
      if (mid) tracksByMidRef.current.set(mid, track);
      tryApplyPannerByMid(mid);
    };

    // SDP offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitIceGathering(pc, 1500);

    // 백엔드 proxy → Cloudflare /sessions/new
    const r = await apiCall<{ sessionDescription: { type: RTCSdpType; sdp: string }; sessionId: string }>(
      '/session/new', 'POST',
      { sessionDescription: { type: pc.localDescription!.type, sdp: pc.localDescription!.sdp } },
    );
    sessionIdRef.current = r.sessionId;
    await pc.setRemoteDescription(new RTCSessionDescription(r.sessionDescription));

    // push track 등록 — mic 있을 때만
    if (transceiver) {
      const pushed = await apiCall<{ tracks: Array<{ mid?: string; trackName: string }> }>(
        '/track/new', 'POST',
        {
          sessionId: r.sessionId,
          tracks: [{
            location: 'local',
            mid: transceiver.mid,
            trackName: `mic-${myId}`,
          }],
        },
      );
      myTrackNameRef.current = pushed.tracks?.[0]?.trackName || `mic-${myId}`;
    }
    return r.sessionId;
  }, [apiCall, myId]);

  /** mid → panner 매핑 시도 (remotes 정보 도착 후) */
  const tryApplyPannerByMid = useCallback((mid: string | null | undefined) => {
    if (!mid) return;
    const track = tracksByMidRef.current.get(mid);
    if (!track) return;
    // 어떤 remote 의 mid 인지 검사
    for (const [peerId, info] of remotesRef.current) {
      if (info.pannerMid === mid && !info.panner) {
        attachPanner(peerId, track, info);
      }
    }
  }, []);

  /** PannerNode 생성 + analyser 부착 */
  const attachPanner = useCallback((peerId: string, track: MediaStreamTrack, info: RemotePeerInfo) => {
    try {
      if (!audioCtxRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Ctor: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
        audioCtxRef.current = new Ctor();
      }
      const ctx = audioCtxRef.current!;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});

      // Safari/Chrome workaround: track 을 audio element 의 srcObject 로 한 번 거쳐야 sourceNode 활성화됨
      // 각 track 마다 별도 audio element 필요
      const el = document.createElement('audio');
      el.autoplay = true;
      el.muted = true;
      (el as HTMLAudioElement & { playsInline: boolean }).playsInline = true;
      el.srcObject = new MediaStream([track]);
      document.body.appendChild(el);

      if (!sinkElemRef.current) sinkElemRef.current = el;
      const src = ctx.createMediaStreamSource(el.srcObject as MediaStream);
      const panner = ctx.createPanner();
      panner.panningModel  = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance   = PANNER_REF_DISTANCE;
      panner.maxDistance   = PANNER_MAX_DISTANCE;
      panner.rolloffFactor = PANNER_ROLLOFF;

      const pose = posesRef?.current?.get(peerId);
      if (pose) setPannerPosition(panner, pose.x, pose.y, pose.z);

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      src.connect(panner).connect(ctx.destination);

      info.panner = panner;
      info.analyser = analyser;

      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(buf);
        let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i];
        const avg = sum / buf.length;
        setSpeakingIds(prev => {
          const has = prev.has(peerId);
          if (avg > 20 && !has) { const n = new Set(prev); n.add(peerId); return n; }
          if (avg <= 12 && has)  { const n = new Set(prev); n.delete(peerId); return n; }
          return prev;
        });
        info.rafId = requestAnimationFrame(tick);
      };
      info.rafId = requestAnimationFrame(tick);
    } catch (err) {
      console.warn('[voice] attachPanner failed:', err);
    }
  }, [posesRef]);

  /** 원격 peer 의 trackId 받아서 pull track 시작 */
  const pullRemoteTrack = useCallback(async (peerId: string, peerSessionId: string, peerTrackName: string) => {
    const pc = pcRef.current;
    const mySession = sessionIdRef.current;
    if (!pc || !mySession || peerId === myId) return;
    if (remotesRef.current.has(peerId)) return;  // 이미 pull 중

    const info: RemotePeerInfo = { sessionId: peerSessionId, trackName: peerTrackName };
    remotesRef.current.set(peerId, info);

    try {
      const r = await apiCall<{
        tracks: Array<{ mid?: string; trackName: string }>;
        sessionDescription?: { type: RTCSdpType; sdp: string };
        requiresImmediateRenegotiation?: boolean;
      }>('/track/new', 'POST', {
        sessionId: mySession,
        tracks: [{ location: 'remote', sessionId: peerSessionId, trackName: peerTrackName }],
      });

      const mid = r.tracks?.[0]?.mid;
      if (mid) info.pannerMid = mid;

      // Cloudflare 가 새 offer 보내면 renegotiate
      if (r.requiresImmediateRenegotiation && r.sessionDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(r.sessionDescription));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await apiCall('/session/renegotiate', 'PUT', {
          sessionId: mySession,
          sessionDescription: { type: answer.type, sdp: answer.sdp },
        });
      }

      // 이미 ontrack 으로 mid 가 도착했을 수 있음 — 매핑 시도
      tryApplyPannerByMid(mid);
    } catch (err) {
      console.warn('[voice] pullRemoteTrack failed:', err);
      remotesRef.current.delete(peerId);
    }
  }, [apiCall, myId, tryApplyPannerByMid]);

  /** 원격 peer 정리 */
  const cleanupRemote = useCallback((peerId: string) => {
    const info = remotesRef.current.get(peerId);
    if (!info) return;
    if (info.rafId) cancelAnimationFrame(info.rafId);
    if (info.panner) try { info.panner.disconnect(); } catch {}
    remotesRef.current.delete(peerId);
    setSpeakingIds(prev => { if (!prev.has(peerId)) return prev; const n = new Set(prev); n.delete(peerId); return n; });
    setMicOnIds(prev => { if (!prev.has(peerId)) return prev; const n = new Set(prev); n.delete(peerId); return n; });
  }, []);

  /** broadcast 내 trackId */
  const broadcastMyTrack = useCallback((mic: boolean) => {
    if (!socket || socket.readyState !== 1) return;
    socket.send(JSON.stringify({
      type: 'voice_track',
      sessionId: sessionIdRef.current || '',
      trackName: myTrackNameRef.current || '',
      mic,
    }));
  }, [socket]);

  /** 마이크 enabled 변화 처리 */
  useEffect(() => {
    if (!enabled) {
      // off
      micStreamRef.current?.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
      try { pcRef.current?.close(); } catch {}
      pcRef.current = null;
      sessionIdRef.current = null;
      myTrackNameRef.current = null;
      remotesRef.current.forEach((_, id) => cleanupRemote(id));
      remotesRef.current.clear();
      tracksByMidRef.current.clear();
      broadcastMyTrack(false);
      setStatus('idle');
      return;
    }
    let cancelled = false;
    setStatus('requesting');

    const startWithStream = async (stream: MediaStream | null) => {
      if (cancelled) { stream?.getTracks().forEach(t => t.stop()); return; }
      micStreamRef.current = stream;
      setStatus('connecting');
      try {
        await startSession(stream);
        if (cancelled) return;
        setStatus('ready');
        broadcastMyTrack(!!stream);
      } catch (e) {
        console.error('[voice] session start failed:', e);
        setStatus('error');
        setError(e instanceof Error ? e.message : 'session failed');
      }
    };

    navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    }).then(startWithStream).catch(err => {
      if (cancelled) return;
      if (err?.name === 'NotAllowedError') {
        // 마이크 권한 거부 → listen-only 모드로 fallback
        setError('마이크 권한이 거부되어 듣기 전용으로 작동합니다.');
        startWithStream(null);
      } else {
        setStatus('error'); setError(err?.message || 'mic failed');
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  /** 시그널링 수신 — voice_track 메시지 */
  useEffect(() => {
    if (!socket) return;
    const onMessage = (e: MessageEvent) => {
      let msg: VoiceTrackMessage | { type: string };
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.type !== 'voice_track') return;
      const m = msg as VoiceTrackMessage;
      if (!m.fromId || m.fromId === myId) return;
      setMicOnIds(prev => {
        const has = prev.has(m.fromId);
        if (m.mic && !has) { const n = new Set(prev); n.add(m.fromId); return n; }
        if (!m.mic && has) { const n = new Set(prev); n.delete(m.fromId); return n; }
        return prev;
      });
      if (m.mic && m.sessionId && m.trackName) {
        if (enabled) pullRemoteTrack(m.fromId, m.sessionId, m.trackName);
      } else {
        cleanupRemote(m.fromId);
      }
    };
    socket.addEventListener('message', onMessage);
    return () => { socket.removeEventListener('message', onMessage); };
  }, [socket, myId, enabled, pullRemoteTrack, cleanupRemote]);

  /** 떠난 peer 정리 */
  useEffect(() => {
    const want = new Set(peerIds);
    for (const id of remotesRef.current.keys()) {
      if (!want.has(id)) cleanupRemote(id);
    }
  }, [peerIds, cleanupRemote]);

  /** 새 peer 가 입장하면 — 내 trackId 다시 broadcast (그들이 pull 할 수 있게) */
  useEffect(() => {
    if (enabled && status === 'ready') broadcastMyTrack(true);
  }, [peerIds, enabled, status, broadcastMyTrack]);

  /** 3D 위치 업데이트 RAF */
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const tick = () => {
      const ctx = audioCtxRef.current;
      if (ctx) {
        const me = localPoseRef?.current;
        if (me) {
          const l = ctx.listener;
          const cosY = Math.cos(me.rotY);
          const sinY = Math.sin(me.rotY);
          if (l.positionX) {
            l.positionX.value = me.x; l.positionY.value = me.y; l.positionZ.value = me.z;
            l.forwardX.value = -sinY; l.forwardY.value = 0; l.forwardZ.value = -cosY;
            l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (l as any).setPosition?.(me.x, me.y, me.z);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (l as any).setOrientation?.(-sinY, 0, -cosY, 0, 1, 0);
          }
        }
        const poses = posesRef?.current;
        if (poses) {
          remotesRef.current.forEach((info, peerId) => {
            if (!info.panner) return;
            const pose = poses.get(peerId);
            if (pose) setPannerPosition(info.panner, pose.x, pose.y, pose.z);
          });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, posesRef, localPoseRef]);

  /** unmount 시 전부 정리 */
  useEffect(() => () => {
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    try { pcRef.current?.close(); } catch {}
    remotesRef.current.forEach((info) => {
      if (info.rafId) cancelAnimationFrame(info.rafId);
      if (info.panner) try { info.panner.disconnect(); } catch {}
    });
    sinkElemRef.current?.remove();
    try { audioCtxRef.current?.close(); } catch {}
  }, []);

  return { status, error, speakingIds, micOnIds };
}

function setPannerPosition(panner: PannerNode, x: number, y: number, z: number) {
  if (panner.positionX) {
    panner.positionX.value = x;
    panner.positionY.value = y;
    panner.positionZ.value = z;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (panner as any).setPosition?.(x, y, z);
  }
}

function waitIceGathering(pc: RTCPeerConnection, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const t = setTimeout(() => resolve(), timeoutMs);
    const check = () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(t); pc.removeEventListener('icegatheringstatechange', check); resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', check);
  });
}
