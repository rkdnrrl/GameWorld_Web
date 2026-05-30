'use client';
/**
 * 비디오 스크린 — 오브젝트 표면에 영상을 재생. "TV 화면". 두 소스 지원:
 *  1) 업로드 영상 파일(mp4/webm) → THREE.VideoTexture 로 표면에 직접 텍스처.
 *  2) YouTube URL → WebGL 텍스처로 못 올리므로(크로스오리진) drei <Html> 로 YouTube
 *     iframe 을 3D 화면 위치에 겹쳐 띄움. 동기화는 YouTube IFrame API(currentTime).
 *
 * 소리/동기화/모드는 Context 로 제어:
 *  - live:      true 면 실제 재생(시뮬/월드). false 면 편집 미리보기(YouTube 는 썸네일).
 *  - withSound: 첫 사용자 제스처에 음소거 해제 (브라우저 자동재생 정책 우회).
 *  - registry:  objId→VideoHandle 등록. 멀티 동기화(호스트 broadcast→비호스트 seek)에 사용.
 *
 * 파일영상과 YouTube 를 같은 VideoHandle 인터페이스로 묶어 동기화 코드를 공유.
 */
import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

export const VIDEO_SYNC_EVENT = '__video__';

/** 파일영상/YouTube 공통 재생 핸들 — 동기화가 소스 종류를 몰라도 되게 추상화. */
export interface VideoHandle {
  getTime: () => number;
  seek: (t: number) => void;
  duration: () => number;
  setPlaying: (playing: boolean) => void;
  paused: () => boolean;
}
export type VideoRegistry = React.MutableRefObject<Map<string, VideoHandle>>;

export const VideoScreenCtx = createContext<{ live: boolean; withSound: boolean; registry?: VideoRegistry }>({ live: false, withSound: false });

/** YouTube URL/ID 에서 11자리 video id 추출 (아니면 null). */
export function parseYouTubeId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  if (m) return m[1];
  if (/^[\w-]{11}$/.test(url.trim())) return url.trim();  // 순수 id 도 허용
  return null;
}

/* ── 1) 영상 파일 — VideoTexture 재질 ───────────────────────── */
export function VideoScreenMaterial({ url, objId, selected, side = THREE.FrontSide }: {
  url: string; objId?: string; selected?: boolean; side?: THREE.Side;
}) {
  const { withSound, registry } = useContext(VideoScreenCtx);

  const video = useMemo(() => {
    const v = document.createElement('video');
    v.src = url; v.loop = true; v.muted = true; v.crossOrigin = 'anonymous';
    v.playsInline = true; v.preload = 'auto';
    v.play().catch(() => {});
    return v;
  }, [url]);

  const texture = useMemo(() => {
    const t = new THREE.VideoTexture(video);
    t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter;
    return t;
  }, [video]);

  useEffect(() => () => { video.pause(); video.removeAttribute('src'); video.load(); texture.dispose(); }, [video, texture]);

  useEffect(() => {
    if (!registry || !objId) return;
    const handle: VideoHandle = {
      getTime: () => video.currentTime,
      seek: (t) => { try { video.currentTime = t; } catch { /* noop */ } },
      duration: () => video.duration,
      setPlaying: (p) => { if (p) video.play().catch(() => {}); else video.pause(); },
      paused: () => video.paused,
    };
    registry.current.set(objId, handle);
    return () => { registry.current.delete(objId); };
  }, [registry, objId, video]);

  useEffect(() => {
    if (!withSound) return;
    const onGesture = () => { video.muted = false; video.play().catch(() => {}); };
    window.addEventListener('pointerdown', onGesture);
    return () => window.removeEventListener('pointerdown', onGesture);
  }, [withSound, video]);

  return <meshBasicMaterial map={texture} color={selected ? '#9fb8ff' : '#ffffff'} toneMapped={false} side={side} />;
}

/* ── 2) YouTube — 편집 미리보기용 썸네일 재질 (live=false 일 때) ── */
export function YouTubeThumbMaterial({ videoId, selected, side = THREE.FrontSide }: {
  videoId: string; selected?: boolean; side?: THREE.Side;
}) {
  const texture = useMemo(() => {
    const t = new THREE.TextureLoader().load(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [videoId]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <meshBasicMaterial map={texture} color={selected ? '#9fb8ff' : '#ffffff'} toneMapped={false} side={side} />;
}

/* ── YouTube IFrame API 로더 (1회) ─────────────────────────── */
let ytApiPromise: Promise<void> | null = null;
function loadYTApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise<void>((resolve) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => { try { prev?.(); } catch { /* noop */ } resolve(); };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

/* ── 3) YouTube — 실제 재생 오버레이 (live=true). drei Html iframe + IFrame API ── */
const YT_IFRAME_W = 640;   // iframe 픽셀 크기 (16:9). 비균등 scale 로 평면 가로·세로에 각각 맞춤.
const YT_IFRAME_H = 360;
// drei <Html transform> 은 부모 스케일을 무시(위치·회전만 따름)하므로 평면 월드 가로/세로를 직접 받아 스케일링.
export function YouTubeOverlay({ videoId, objId, planeW = 2, planeH = 1.2 }: { videoId: string; objId?: string; planeW?: number; planeH?: number }) {
  const { withSound, registry } = useContext(VideoScreenCtx);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);

  // 플레이어 생성 (IFrame API)
  useEffect(() => {
    let cancelled = false;
    loadYTApi().then(() => {
      if (cancelled || !iframeRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const YT = (window as any).YT;
      playerRef.current = new YT.Player(iframeRef.current, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        events: { onReady: (e: any) => { try { e.target.mute(); e.target.playVideo(); } catch { /* noop */ } } },
      });
    });
    return () => { cancelled = true; try { playerRef.current?.destroy?.(); } catch { /* noop */ } playerRef.current = null; };
  }, [videoId]);

  // 동기화 핸들 등록
  useEffect(() => {
    if (!registry || !objId) return;
    const handle: VideoHandle = {
      getTime: () => playerRef.current?.getCurrentTime?.() ?? 0,
      seek: (t) => { try { playerRef.current?.seekTo?.(t, true); } catch { /* noop */ } },
      duration: () => playerRef.current?.getDuration?.() ?? 0,
      setPlaying: (p) => { try { p ? playerRef.current?.playVideo?.() : playerRef.current?.pauseVideo?.(); } catch { /* noop */ } },
      paused: () => (playerRef.current?.getPlayerState?.() ?? 1) !== 1,  // 1 = playing
    };
    registry.current.set(objId, handle);
    return () => { registry.current.delete(objId); };
  }, [registry, objId]);

  // 소리 — 사용자 제스처마다 음소거 해제 시도 (once X — player 준비 전 첫 클릭이 헛돌아도
  // 준비된 뒤 다음 클릭에 켜지게). 이미 소리 켜져 있으면 무해.
  useEffect(() => {
    if (!withSound) return;
    const onGesture = () => { try { playerRef.current?.unMute?.(); playerRef.current?.playVideo?.(); } catch { /* noop */ } };
    window.addEventListener('pointerdown', onGesture);
    return () => window.removeEventListener('pointerdown', onGesture);
  }, [withSound]);

  // drei <Html transform> 의 px→월드 환산이 작아서(scale 1 에서 640px ≈ 64유닛, 경험치).
  // 가로·세로 각각 평면 크기에 맞춰 비균등 스케일 → iframe 이 평면을 꽉 채움(16:9 아니어도).
  // 전체가 안 맞으면 PX_TO_UNIT 만 조절.
  const PX_TO_UNIT = 0.06;
  const sx = Math.max(0.01, planeW) / (YT_IFRAME_W * PX_TO_UNIT);   // 가로 → planeW
  const sy = Math.max(0.01, planeH) / (YT_IFRAME_H * PX_TO_UNIT);   // 세로 → planeH
  const src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=1&rel=0&playsinline=1`;
  // occlude="blending": 깊이 버퍼 기반 가림 — 앞에 있는 오브젝트(캐릭터/벽 등)가 영상을
  // 픽셀 단위로 정상적으로 가림. (raycast 방식은 중심이 가려지면 통째로 사라져서 부적합)
  // occlude="blending" 이 깊이 가림(앞 오브젝트가 영상 가림) + 클릭 영역 관리를 함께 처리:
  //  - 보이는 영상 영역만 클릭 잡음(YouTube 조작, 잠금 안 됨)
  //  - 가려지거나 영상 밖 클릭은 캔버스로 통과 → 포인터락(화면 회전)
  // 수동 pointerEvents 를 주면 이 관리와 충돌하므로 주지 않는다.
  return (
    <Html transform occlude="blending" position={[0, 0, 0.05]} scale={[sx, sy, 1]} center>
      <iframe
        ref={iframeRef}
        width={YT_IFRAME_W}
        height={YT_IFRAME_H}
        src={src}
        title="YouTube"
        frameBorder={0}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        style={{ border: 'none', display: 'block', background: '#000' }}
      />
    </Html>
  );
}

/* ── 호출부 편의 — context.live 에 따라 재질/오버레이 자동 선택 ── */
export function YouTubeMeshMaterial({ videoId, selected, side = THREE.FrontSide }: {
  videoId: string; selected?: boolean; side?: THREE.Side;
}) {
  // 항상 썸네일 — live(시뮬/월드)에선 그 위에 iframe 이 덮어 재생. iframe 이 안 떠도
  // 검은 화면 대신 썸네일이 보이게 (폴백).
  return <YouTubeThumbMaterial videoId={videoId} selected={selected} side={side} />;
}
export function YouTubeMaybeOverlay({ videoId, objId, planeW, planeH }: { videoId: string; objId?: string; planeW?: number; planeH?: number }) {
  const { live } = useContext(VideoScreenCtx);
  return live ? <YouTubeOverlay videoId={videoId} objId={objId} planeW={planeW} planeH={planeH} /> : null;
}

/* ── 멀티 동기화 — 호스트가 보낸 시각을 핸들에 반영 (0.5초 이상 차이날 때만 seek) ── */
export function applyVideoSync(handle: VideoHandle, data: { t?: number; playing?: boolean }): void {
  const t = typeof data.t === 'number' ? data.t : null;
  const dur = handle.duration();
  if (t !== null && Number.isFinite(dur) && dur > 0) {
    const target = t % dur;
    if (Math.abs(handle.getTime() - target) > 0.5) handle.seek(target);
  }
  if (data.playing === false && !handle.paused()) handle.setPlaying(false);
  else if (data.playing !== false && handle.paused()) handle.setPlaying(true);
}
