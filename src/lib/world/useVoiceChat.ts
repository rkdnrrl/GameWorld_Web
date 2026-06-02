/**
 * WebRTC P2P 음성 채팅 (Phase 22)
 *
 * 구조:
 *   - 같은 월드에 있는 다른 유저와 1:1 peer connection 을 N개 유지 (mesh)
 *   - 시그널링: 기존 멀티플레이 WebSocket 의 voice_signal 메시지 활용
 *   - STUN: Google 공용 (NAT 통과 무료). TURN 은 추후
 *   - 적정 인원: 4~8명. 16명+ 부터는 SFU 필요
 */
import { useEffect, useRef, useState, useCallback } from 'react';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

interface VoiceSignal {
  type: 'voice_signal';
  sub: 'offer' | 'answer' | 'ice';
  fromId: string;
  data: unknown;
}
interface VoiceState {
  type: 'voice_state';
  id: string;
  mic: boolean;
  speaking: boolean;
}

interface Options {
  /** 멀티플레이 socket — voice_signal 송신 + voice_signal·voice_state 수신 등록 */
  socket: WebSocket | null;
  /** 내 플레이어 id */
  myId: string;
  /** 현재 방의 다른 플레이어 id 들 (입퇴장 변화 감지) */
  peerIds: string[];
  /** 마이크 ON 여부 (true 면 peer 연결 시작) */
  enabled: boolean;
}

export interface VoiceChatState {
  /** 권한·연결·에러 상태 */
  status: 'idle' | 'requesting' | 'ready' | 'denied' | 'error';
  /** 에러 메시지 */
  error?: string;
  /** 현재 말하는 중인 peer id 들 (오디오 레벨 감지) */
  speakingIds: Set<string>;
  /** 각 peer 의 마이크 켜짐 여부 (다른 사람) */
  micOnIds: Set<string>;
}

export function useVoiceChat({ socket, myId, peerIds, enabled }: Options): VoiceChatState {
  const [status, setStatus] = useState<VoiceChatState['status']>('idle');
  const [error, setError] = useState<string>();
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(new Set());
  const [micOnIds, setMicOnIds] = useState<Set<string>>(new Set());

  const micStreamRef  = useRef<MediaStream | null>(null);
  const peersRef      = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioElemsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const analysersRef  = useRef<Map<string, { ctx: AudioContext; analyser: AnalyserNode; raf: number }>>(new Map());

  /** signaling 송신 */
  const sendSignal = useCallback((toId: string, sub: 'offer' | 'answer' | 'ice', data: unknown) => {
    if (!socket || socket.readyState !== 1) return;
    socket.send(JSON.stringify({ type: 'voice_signal', toId, sub, data }));
  }, [socket]);

  /** 새 peer 연결 생성 (offerSide=true 면 내가 offer 보냄) */
  const createPeer = useCallback((peerId: string, offerSide: boolean) => {
    if (peersRef.current.has(peerId)) return;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peersRef.current.set(peerId, pc);

    // 내 mic track 추가
    const stream = micStreamRef.current;
    if (stream) stream.getAudioTracks().forEach(t => pc.addTrack(t, stream));

    // 원격 audio 재생
    pc.ontrack = (e) => {
      let el = audioElemsRef.current.get(peerId);
      if (!el) {
        el = document.createElement('audio');
        el.autoplay = true;
        // playsInline 은 iOS 자동재생 허용
        (el as HTMLAudioElement & { playsInline: boolean }).playsInline = true;
        document.body.appendChild(el);
        audioElemsRef.current.set(peerId, el);
      }
      el.srcObject = e.streams[0];
      // 오디오 레벨 분석 → speakingIds 갱신
      try {
        // AudioContext 는 user gesture 후에만 동작 — 안 되면 무시
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Ctor: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (Ctor) {
          const ctx = new Ctor();
          const src = ctx.createMediaStreamSource(e.streams[0]);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          src.connect(analyser);
          const buf = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            analyser.getByteFrequencyData(buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i++) sum += buf[i];
            const avg = sum / buf.length;
            setSpeakingIds(prev => {
              const has = prev.has(peerId);
              if (avg > 20 && !has) { const next = new Set(prev); next.add(peerId); return next; }
              if (avg <= 12 && has)  { const next = new Set(prev); next.delete(peerId); return next; }
              return prev;
            });
            const raf = requestAnimationFrame(tick);
            const cur = analysersRef.current.get(peerId);
            if (cur) cur.raf = raf;
          };
          const raf = requestAnimationFrame(tick);
          analysersRef.current.set(peerId, { ctx, analyser, raf });
        }
      } catch (err) {
        console.warn('[voice] analyser failed:', err);
      }
    };

    // ICE 후보 → peer 로 전송
    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal(peerId, 'ice', e.candidate);
    };

    // peer 가 disconnected/failed 되면 정리
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        cleanupPeer(peerId);
      }
    };

    // offer 생성
    if (offerSide) {
      pc.createOffer().then(offer => pc.setLocalDescription(offer).then(() => {
        sendSignal(peerId, 'offer', offer);
      })).catch(err => console.warn('[voice] offer failed:', err));
    }
  }, [sendSignal]);

  const cleanupPeer = useCallback((peerId: string) => {
    const pc = peersRef.current.get(peerId);
    if (pc) {
      try { pc.close(); } catch {}
      peersRef.current.delete(peerId);
    }
    const el = audioElemsRef.current.get(peerId);
    if (el) {
      try { el.srcObject = null; el.remove(); } catch {}
      audioElemsRef.current.delete(peerId);
    }
    const an = analysersRef.current.get(peerId);
    if (an) {
      cancelAnimationFrame(an.raf);
      try { an.ctx.close(); } catch {}
      analysersRef.current.delete(peerId);
    }
    setSpeakingIds(prev => { if (!prev.has(peerId)) return prev; const next = new Set(prev); next.delete(peerId); return next; });
    setMicOnIds(prev => { if (!prev.has(peerId)) return prev; const next = new Set(prev); next.delete(peerId); return next; });
  }, []);

  /** 마이크 권한 + stream 획득 */
  useEffect(() => {
    if (!enabled) {
      // off — 모든 정리
      micStreamRef.current?.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
      peersRef.current.forEach((_, id) => cleanupPeer(id));
      setStatus('idle');
      // 상태 broadcast
      if (socket && socket.readyState === 1) socket.send(JSON.stringify({ type: 'voice_state', mic: false, speaking: false }));
      return;
    }
    let cancelled = false;
    setStatus('requesting');
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        micStreamRef.current = stream;
        setStatus('ready');
        // 마이크 ON broadcast
        if (socket && socket.readyState === 1) socket.send(JSON.stringify({ type: 'voice_state', mic: true, speaking: false }));
        // 이미 있는 peer 들에게 offer 보내기 (id 비교로 한쪽만 offer)
        for (const pid of peerIds) {
          if (pid === myId) continue;
          // id 사전순으로 작은 쪽이 offer
          if (myId < pid) createPeer(pid, true);
        }
      })
      .catch(err => {
        if (cancelled) return;
        if (err?.name === 'NotAllowedError') setStatus('denied');
        else { setStatus('error'); setError(err?.message || 'mic failed'); }
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  /** peerIds 변화 → 신규 peer 에 offer / 떠난 peer 정리 */
  useEffect(() => {
    if (!enabled || !micStreamRef.current) return;
    const want = new Set(peerIds.filter(id => id !== myId));
    // 떠난 peer 정리
    for (const id of peersRef.current.keys()) {
      if (!want.has(id)) cleanupPeer(id);
    }
    // 신규 peer 에 offer (id 작은 쪽이 offer)
    for (const id of want) {
      if (!peersRef.current.has(id) && myId < id) createPeer(id, true);
    }
  }, [peerIds, enabled, myId, createPeer, cleanupPeer]);

  /** 시그널링 수신 (socket message) — 외부 useGameSocket 이 같은 ws 를 쓰니 직접 listener 추가 */
  useEffect(() => {
    if (!socket) return;
    const onMessage = (e: MessageEvent) => {
      let msg: VoiceSignal | VoiceState | { type: string };
      try { msg = JSON.parse(e.data); } catch { return; }

      if (msg.type === 'voice_signal') {
        const m = msg as VoiceSignal;
        const fromId = m.fromId;
        if (!fromId || fromId === myId) return;
        let pc = peersRef.current.get(fromId);
        if (!pc) {
          // 상대가 offer 먼저 보낸 케이스 (id 큰 쪽이 받음) — peer 생성
          if (m.sub === 'offer') {
            createPeer(fromId, false);
            pc = peersRef.current.get(fromId)!;
          } else return;
        }
        if (m.sub === 'offer') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          pc.setRemoteDescription(new RTCSessionDescription(m.data as any))
            .then(() => pc!.createAnswer())
            .then(answer => pc!.setLocalDescription(answer).then(() => {
              sendSignal(fromId, 'answer', answer);
            }))
            .catch(err => console.warn('[voice] handle offer:', err));
        } else if (m.sub === 'answer') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          pc.setRemoteDescription(new RTCSessionDescription(m.data as any))
            .catch(err => console.warn('[voice] handle answer:', err));
        } else if (m.sub === 'ice') {
          if (m.data) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            pc.addIceCandidate(new RTCIceCandidate(m.data as any))
              .catch(err => console.warn('[voice] handle ice:', err));
          }
        }
      } else if (msg.type === 'voice_state') {
        const m = msg as VoiceState;
        if (!m.id || m.id === myId) return;
        setMicOnIds(prev => {
          const has = prev.has(m.id);
          if (m.mic && !has) { const n = new Set(prev); n.add(m.id); return n; }
          if (!m.mic && has) { const n = new Set(prev); n.delete(m.id); return n; }
          return prev;
        });
      }
    };
    socket.addEventListener('message', onMessage);
    return () => { socket.removeEventListener('message', onMessage); };
  }, [socket, myId, createPeer, sendSignal]);

  /** unmount 시 전부 정리 */
  useEffect(() => () => {
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    peersRef.current.forEach((pc) => { try { pc.close(); } catch {} });
    audioElemsRef.current.forEach((el) => { try { el.srcObject = null; el.remove(); } catch {} });
    analysersRef.current.forEach((a) => { cancelAnimationFrame(a.raf); try { a.ctx.close(); } catch {} });
  }, []);

  return { status, error, speakingIds, micOnIds };
}
