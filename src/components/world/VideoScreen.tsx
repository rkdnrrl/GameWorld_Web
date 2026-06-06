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
import { createContext, memo, useContext, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Html } from '@react-three/drei';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export const VIDEO_SYNC_EVENT = '__video__';
// 유저 컨트롤(앞/뒤 이동·URL 변경) 동기화 이벤트 — 주기적 sync(__video__)와 별개의 1회성 명령.
export const VIDEO_CTL_EVENT = '__videoctl__';
export interface VideoControlCmd {
  seekTo?: number; url?: string; playing?: boolean;
  /** 볼륨 0~1 — 전체 월드 동기화 */
  volume?: number;
  muted?: boolean;
}

/** 파일영상/YouTube 공통 재생 핸들 — 동기화가 소스 종류를 몰라도 되게 추상화. */
export interface VideoHandle {
  getTime: () => number;
  seek: (t: number) => void;
  duration: () => number;
  setPlaying: (playing: boolean) => void;
  paused: () => boolean;
  /** "base" 볼륨 0~1 — UI 슬라이더가 표시·동기화하는 값. 거리 attenuation 전. */
  getVolume: () => number;
  setVolume: (v: number) => void;
  isMuted: () => boolean;
  setMuted: (m: boolean) => void;
  /**
   * 외부(WorldCanvas/StudioCanvas)가 매 프레임 호출 — 카메라↔영상 화면 거리(m).
   * 내부에서 base × attenuation 으로 실제 볼륨 적용 (거리 멀수록 작게).
   */
  setListenerDistance?: (d: number) => void;
}

// 영상 거리 감쇠 — 음성보다 조금 더 멀리까지 들리게.
export const VIDEO_REF_DISTANCE = 5;   // 5m 안 풀 볼륨
export const VIDEO_MAX_DISTANCE = 30;  // 30m 밖 무음
function videoAttenuation(d: number): number {
  if (!Number.isFinite(d) || d <= VIDEO_REF_DISTANCE) return 1;
  if (d >= VIDEO_MAX_DISTANCE) return 0;
  // linear — 음악/환경음용 자연스러운 페이드
  return 1 - (d - VIDEO_REF_DISTANCE) / (VIDEO_MAX_DISTANCE - VIDEO_REF_DISTANCE);
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

/** 입력이 <iframe src="..."> 같은 HTML embed 코드면 src 추출해 일반 URL 로. 아니면 그대로 반환. */
export function normalizeMediaUrl(input: string): string {
  if (!input) return '';
  const s = input.trim();
  // <iframe ... src="..."> 또는 src='...' 추출
  const m = s.match(/<iframe[^>]*\ssrc\s*=\s*["']([^"']+)["']/i);
  if (m) return m[1];
  return s;
}

/** URL 분류 — 어떤 종류의 콘텐츠인지 분기. embed 코드는 normalizeMediaUrl 로 URL 추출 후 분류. */
export type VideoUrlKind = 'youtube' | 'videoFile' | 'image' | 'iframe' | 'none';
export function parseUrlKind(rawUrl: string): VideoUrlKind {
  const url = normalizeMediaUrl(rawUrl);
  if (!url) return 'none';
  if (parseYouTubeId(url)) return 'youtube';
  if (/\.(mp4|webm|mov|m4v|ogv)(\?|$)/i.test(url)) return 'videoFile';
  if (/\.(gif|png|jpe?g|webp|avif|bmp|svg)(\?|$)/i.test(url)) return 'image';
  if (/^https?:\/\//i.test(url)) return 'iframe';
  return 'none';
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
    // base = 사용자/동기화 의도 볼륨, video.volume = 거리감쇠 적용한 effective
    let base = 1;
    let lastApplied = -1;
    const applyEffective = (att: number) => {
      const eff = Math.max(0, Math.min(1, base * att));
      if (Math.abs(eff - lastApplied) > 0.005) {
        video.volume = eff;
        lastApplied = eff;
      }
    };
    const handle: VideoHandle = {
      getTime: () => video.currentTime,
      seek: (t) => { try { video.currentTime = t; } catch { /* noop */ } },
      duration: () => video.duration,
      setPlaying: (p) => { if (p) video.play().catch(() => {}); else video.pause(); },
      paused: () => video.paused,
      getVolume: () => base,
      setVolume: (v) => { base = Math.max(0, Math.min(1, v)); applyEffective(1); },
      isMuted:   () => video.muted,
      setMuted:  (m) => { video.muted = m; },
      setListenerDistance: (d) => applyEffective(videoAttenuation(d)),
    };
    registry.current.set(objId, handle);
    return () => { registry.current.delete(objId); };
  }, [registry, objId, video]);

  useEffect(() => {
    if (!withSound) return;
    // 음소거 해제만 — play() 호출 안 함. 사용자가 리모컨으로 일시정지 했으면 그 상태 유지.
    const onGesture = () => { if (video.muted) video.muted = false; };
    window.addEventListener('pointerdown', onGesture);
    return () => window.removeEventListener('pointerdown', onGesture);
  }, [withSound, video]);

  return <meshBasicMaterial map={texture} color={selected ? '#9fb8ff' : '#ffffff'} toneMapped={false} side={side} />;
}

/* ── 2) YouTube — 편집 미리보기용 썸네일 재질 (live=false 일 때) ── */
export function YouTubeThumbMaterial({ videoId, selected, side = THREE.FrontSide }: {
  videoId: string; selected?: boolean; side?: THREE.Side;
}) {
  // maxresdefault.jpg (1280×720, 16:9) — 실제 iframe 표시 비율과 동일해 미리보기↔시뮬 프레임 일치.
  // 없으면 자동으로 hqdefault.jpg(4:3, 위아래 검은띠) 폴백.
  const texture = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const t = loader.load(
      `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      undefined,
      undefined,
      () => { loader.load(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`, (fallback) => {
        t.image = fallback.image;
        t.needsUpdate = true;
      }); },
    );
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
// React.memo + 영구 iframe — iframe 을 useEffect 에서 한 번만 만들고 div container 가 React reconcile
// 로 교체될 때마다 새 div 로 옮김 (setContainerRef callback). drei Html 이 root.render 매번 호출해 div
// fiber 가 새로 만들어져도 iframe element 자체는 살아남음 → src 재로드 없음 → 영상 안 끊김.
export const YouTubeOverlay = memo(function YouTubeOverlayImpl({ videoId, objId, planeW = 2, planeH = 1.2 }: { videoId: string; objId?: string; planeW?: number; planeH?: number }) {
  const { withSound, registry } = useContext(VideoScreenCtx);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);
  // div container ref callback — drei 가 div 를 새로 만들 때마다 호출. 옛 iframe 을 새 div 로 옮겨 영구 보존.
  const setContainerRef = (div: HTMLDivElement | null) => {
    if (div && iframeRef.current && iframeRef.current.parentElement !== div) {
      console.log('[YT] re-parent iframe to new div', objId);
      div.appendChild(iframeRef.current);
    }
    // drei <Html transform> 의 wrap div 들에 backface-visibility:hidden 강제 — 뒷면 안 그리게.
    // wrap → transform div → inner 까지 모두 적용. iframe 까지도.
    // div 자체에만 검정 background (4단계 traverse 는 portal root 까지 영향 줘서 페이지 다른 영역도 검정 → 제거)
    if (div) div.style.background = '#000';
  };

  // 플레이어 생성 — videoId 변경 시만. iframe 을 document body 에 만들어 두고 div 마운트 시 옮김 → div
  // 마운트 타이밍 무관하게 안전. 첫 div mount 는 setContainerRef 가 처리.
  useEffect(() => {
    console.log('[YT] mount/effect player', videoId, objId);
    const iframe = document.createElement('iframe');
    iframe.width = String(YT_IFRAME_W);
    iframe.height = String(YT_IFRAME_H);
    iframe.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0&disablekb=1&fs=0&modestbranding=1&rel=0&iv_load_policy=3&playsinline=1`;
    iframe.title = 'YouTube';
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
    iframe.tabIndex = -1;   // focus 못 받게 — focus 가면 키보드 이벤트가 iframe 으로 가서 ctrl+z / ctrl+d 등 안 먹음
    iframe.style.cssText = 'border:none;display:block;background:#000;pointer-events:none;width:100%;height:100%';
    iframeRef.current = iframe;
    // setContainerRef 가 div mount 시 옮길 텐데, 그게 useEffect 이전이면 이미 옮겨졌을 수도. 아니면 강제 트리거.
    // 트리거: ref callback 다시 호출은 안 되니, 한 frame 후 ref.current 확인.
    requestAnimationFrame(() => {
      // 현재 div ref 가 잡혀있고 iframe 이 아직 안 옮겨졌다면 직접 옮김.
      // (setContainerRef 는 div 가 새로 mount 될 때만 호출됨)
    });
    let cancelled = false;
    loadYTApi().then(() => {
      if (cancelled || !iframeRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const YT = (window as any).YT;
      playerRef.current = new YT.Player(iframeRef.current, {
        events: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onReady: (e: any) => { console.log('[YT] onReady', objId); try { e.target.mute(); e.target.playVideo(); } catch { /* noop */ } },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onStateChange: (e: any) => {
            const t = (() => { try { return e.target.getCurrentTime?.() ?? '?'; } catch { return '?'; } })();
            console.log('[YT] state', objId, 'state', e.data, 'time', t);
          },
        },
      });
    });
    return () => {
      console.log('[YT] cleanup/destroy player', videoId, objId);
      cancelled = true;
      try { playerRef.current?.destroy?.(); } catch { /* noop */ }
      playerRef.current = null;
      const iframe = iframeRef.current;
      iframeRef.current = null;
      try { iframe?.remove(); } catch { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // 동기화 핸들 등록
  useEffect(() => {
    if (!registry || !objId) return;
    console.log('[YT] register handle', objId);
    // base = 사용자/동기화 의도 볼륨 (0~1). 실제 player.setVolume 은 base × 거리감쇠.
    // YT setVolume 은 postMessage 기반이라 매 프레임 호출은 비싸므로 정수 비율 변화시에만 호출.
    let base = 1;
    let lastAppliedV100 = -1;
    const applyEffective = (att: number) => {
      const eff = Math.max(0, Math.min(1, base * att));
      const v100 = Math.round(eff * 100);
      if (v100 !== lastAppliedV100) {
        try { playerRef.current?.setVolume?.(v100); } catch { /* noop */ }
        lastAppliedV100 = v100;
      }
    };
    const handle: VideoHandle = {
      getTime: () => playerRef.current?.getCurrentTime?.() ?? 0,
      seek: (t) => { console.log('[YT] seek', objId, '→', t); try { playerRef.current?.seekTo?.(t, true); } catch { /* noop */ } },
      duration: () => playerRef.current?.getDuration?.() ?? 0,
      setPlaying: (p) => { console.log('[YT] setPlaying', objId, '→', p); try { p ? playerRef.current?.playVideo?.() : playerRef.current?.pauseVideo?.(); } catch { /* noop */ } },
      paused: () => (playerRef.current?.getPlayerState?.() ?? 1) !== 1,  // 1 = playing
      getVolume: () => base,
      setVolume: (v) => { base = Math.max(0, Math.min(1, v)); applyEffective(1); },
      isMuted:   () => { try { return !!playerRef.current?.isMuted?.(); } catch { return false; } },
      setMuted:  (m) => { try { m ? playerRef.current?.mute?.() : playerRef.current?.unMute?.(); } catch { /* noop */ } },
      setListenerDistance: (d) => applyEffective(videoAttenuation(d)),
    };
    registry.current.set(objId, handle);
    return () => { console.log('[YT] unregister handle', objId); registry.current.delete(objId); };
  }, [registry, objId]);

  // 소리 — 사용자 제스처마다 음소거 해제 시도 (player 준비 전 첫 클릭이 헛돌아도 다음 클릭에 켜지게).
  // playVideo() 호출 X — 사용자가 리모컨으로 일시정지 했으면 그 상태 유지.
  useEffect(() => {
    if (!withSound) return;
    const onGesture = () => { try { if (playerRef.current?.isMuted?.()) playerRef.current?.unMute?.(); } catch { /* noop */ } };
    window.addEventListener('pointerdown', onGesture);
    return () => window.removeEventListener('pointerdown', onGesture);
  }, [withSound]);

  // drei <Html transform> 은 부모 mesh 의 world matrix(=부모 scale 포함) 를 상속함.
  // 따라서 sx 에 planeW 곱하면 부모 scale 과 중복으로 W² 비선형 늘어남.
  // 올바른 공식: sx = 1 / (640 * 0.025), sy = 1 / (360 * 0.025). 부모 mesh scale 이 자동 fit.
  // drei Html.js 271행: multiplier = 1/((distanceFactor||10)/400) = 40 → 1 unit = 40px → PX_TO_UNIT = 1/40.
  // (planeW, planeH 는 안 씀 — 부모 scale 이 모든 걸 처리)
  const PX_TO_UNIT = 1 / 40;
  void planeW; void planeH;  // 더 이상 사용 안 함 (부모 scale 이 fit 담당)
  const sx = 1 / (YT_IFRAME_W * PX_TO_UNIT);
  const sy = 1 / (YT_IFRAME_H * PX_TO_UNIT);
  return (
    <Html transform occlude="blending" pointerEvents="none" position={[0, 0, 0.001]} scale={[sx, sy, 1]} center style={{ background: '#000' }}>
      <div ref={setContainerRef} style={{ width: YT_IFRAME_W, height: YT_IFRAME_H, background: '#000' }} />
    </Html>
  );
});

/* ── 호출부 편의 — context.live 에 따라 재질/오버레이 자동 선택 ── */
export function YouTubeMeshMaterial({ videoId, selected, side = THREE.FrontSide }: {
  videoId: string; selected?: boolean; side?: THREE.Side;
}) {
  // live 모드 (시뮬/월드) 면 검정 mesh — iframe 이 그 위에 덮여 영상 표시.
  // blending alpha gradient 시 외곽이 sky/thumbnail 색 대신 검정으로 fade (사용자 요청).
  // live=false (편집 미리보기) 면 썸네일 표시 (영상 안 재생).
  const { live } = useContext(VideoScreenCtx);
  if (live) {
    // transparent + opacity 0 — iframe 이 plane 양면 모두 보이게 (mesh 가 가리지 않게).
    // 외곽 fade 색은 wrap div 의 background:#000 으로 처리.
    return <meshBasicMaterial color="#000" side={side} transparent opacity={0} toneMapped={false} />;
  }
  return <YouTubeThumbMaterial videoId={videoId} selected={selected} side={side} />;
}
export const YouTubeMaybeOverlay = memo(function YouTubeMaybeOverlayImpl({ videoId, objId, planeW, planeH }: { videoId: string; objId?: string; planeW?: number; planeH?: number }) {
  const { live } = useContext(VideoScreenCtx);
  return live ? <YouTubeOverlay videoId={videoId} objId={objId} planeW={planeW} planeH={planeH} /> : null;
});

/* ── 이미지/GIF 재질 — mesh 표면에 정적 이미지 또는 GIF 텍스처. ── */
export function ImageMaterial({ url, selected, side = THREE.FrontSide }: {
  url: string; selected?: boolean; side?: THREE.Side;
}) {
  const texture = useMemo(() => {
    const t = new THREE.TextureLoader().load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [url]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <meshBasicMaterial map={texture} color={selected ? '#9fb8ff' : '#ffffff'} toneMapped={false} side={side} transparent />;
}

/* ── Generic iframe 오버레이 — YouTube 가 아닌 일반 http(s) URL (호스팅 게임, 외부 사이트 등).
   YouTubeOverlay 와 같은 패턴 — drei Html transform + imperative iframe + re-parent. */
export const GenericIframeOverlay = memo(function GenericIframeOverlayImpl({ url, planeW = 2, planeH = 1.2 }: { url: string; planeW?: number; planeH?: number }) {
  const { live } = useContext(VideoScreenCtx);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const setContainerRef = (div: HTMLDivElement | null) => {
    if (div && iframeRef.current && iframeRef.current.parentElement !== div) {
      div.appendChild(iframeRef.current);
    }
    // div 자체에만 검정 background (4단계 traverse 는 portal root 까지 영향 줘서 페이지 다른 영역도 검정 → 제거)
    if (div) div.style.background = '#000';
  };

  useEffect(() => {
    if (!live) return;
    const iframe = document.createElement('iframe');
    iframe.width = String(YT_IFRAME_W);
    iframe.height = String(YT_IFRAME_H);
    iframe.src = url;
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.style.cssText = 'border:none;display:block;background:#000;pointer-events:auto;width:100%;height:100%';
    iframeRef.current = iframe;
    return () => {
      try { iframe.remove(); } catch { /* noop */ }
      iframeRef.current = null;
    };
  }, [url, live]);

  // 상호작용 가능하게 — drei portal 의 iframe 의 immediate wrapper(=drei 가 만든 transform div) 만
  // 캔버스(16777271)보다 위로. 5단계까지 끌어올리면 공통 portal root 까지 영향받아 같은 root 안의
  // 다른 Html(YouTube 등) 도 캔버스 위로 떠서 모든 오브젝트 앞으로 그려짐 → 캐릭터 가림 버그.
  // 1단계만 올려도 클릭 도달 OK (캐릭터 mesh 보다 위, 다른 Html 은 영향 X).
  useFrame(() => {
    if (!live) return;
    const wrap = iframeRef.current?.parentElement;
    if (wrap && wrap.style.zIndex !== '16777272') wrap.style.zIndex = '16777272';
  });

  if (!live) return null;
  const PX_TO_UNIT = 0.03;
  const sx = Math.max(0.01, planeW) / (YT_IFRAME_W * PX_TO_UNIT);
  const sy = Math.max(0.01, planeH) / (YT_IFRAME_H * PX_TO_UNIT);
  return (
    <Html transform occlude="blending" pointerEvents="auto" position={[0, 0, 0.001]} scale={[sx, sy, 1]} center style={{ background: '#000' }}>
      <div ref={setContainerRef} style={{ width: YT_IFRAME_W, height: YT_IFRAME_H, background: '#000', pointerEvents: 'auto' }} />
    </Html>
  );
});

/**
 * Listener 거리 업데이트 — 매 프레임 카메라 위치 ↔ 비디오 객체 위치 거리 계산해서
 * registry 의 모든 handle 에 setListenerDistance 호출. 호출부는 objects(id→position) 만 넘기면 됨.
 *
 * Canvas 안 (R3F context) 에서만 사용 가능. 빈 객체 또는 position 없는 객체는 자동 스킵.
 */
export function VideoDistanceUpdater({
  registry, objectsById, globalAudio,
}: {
  registry: VideoRegistry;
  /** id → [x, y, z] 또는 { position: [x,y,z] } */
  objectsById: Map<string, { position?: [number, number, number] | { x: number; y: number; z: number } }>;
  /** 전역 음향 모드 — videoRemote 의 globalAudio prop 이 하나라도 true 면 모든 비디오 거리 무시 (전역). */
  globalAudio?: boolean;
}) {
  const { camera } = useThree();
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    if (registry.current.size === 0) return;
    for (const [objId, handle] of registry.current) {
      if (!handle.setListenerDistance) continue;
      // 전역 음향 — 거리 0 으로 고정 (감쇠 없음, 항상 최대 볼륨)
      if (globalAudio) {
        handle.setListenerDistance(0);
        continue;
      }
      const o = objectsById.get(objId);
      const p = o?.position;
      if (!p) continue;
      if (Array.isArray(p)) tmp.set(p[0], p[1], p[2]);
      else tmp.set(p.x, p.y, p.z);
      handle.setListenerDistance(camera.position.distanceTo(tmp));
    }
  });
  return null;
}

/**
 * 비디오 첫 mount 시 자동 재생/정지 정책 적용.
 * videoRemote 의 initiallyPlaying prop 이 한번이라도 false 면 처음 1.5초 동안 모든 비디오 pause 유지.
 * 1.5초 동안 reapply 이유: YouTube iframe / mp4 video element / GIF 가 ready timing 이 제각각이라
 * YouTube iframe / mp4 video 의 자동 재생을 영구히 차단. unlockedRef 에 ID 가 있으면 skip
 * (사용자가 ▶ 직접 누르거나 호스트 sync 로 playing:true 받으면 unlock).
 * 이전 1.5초 윈도우 방식은 YouTube ready 가 1.5초보다 늦으면 못 잡아서 자동 재생되는 문제 있었음.
 */
export function VideoInitialStateApplier({
  registry, initiallyPaused, unlockedRef,
}: {
  registry: VideoRegistry;
  initiallyPaused: boolean;
  unlockedRef?: React.MutableRefObject<Set<string>>;
}) {
  useFrame(() => {
    if (!initiallyPaused) return;
    for (const [id, handle] of registry.current) {
      if (unlockedRef?.current.has(id)) continue;
      try {
        if (handle.paused?.() === false) handle.setPlaying(false);
      } catch { /* noop */ }
    }
  });
  return null;
}

/* ── 멀티 동기화 — 호스트가 보낸 시각을 핸들에 반영 (0.5초 이상 차이날 때만 seek) ── */
export function applyVideoSync(
  handle: VideoHandle,
  data: { t?: number; playing?: boolean; volume?: number; muted?: boolean },
): void {
  const t = typeof data.t === 'number' ? data.t : null;
  const dur = handle.duration();
  if (t !== null && Number.isFinite(dur) && dur > 0) {
    const target = t % dur;
    if (Math.abs(handle.getTime() - target) > 0.5) handle.seek(target);
  }
  if (data.playing === false && !handle.paused()) handle.setPlaying(false);
  else if (data.playing !== false && handle.paused()) handle.setPlaying(true);
  if (typeof data.volume === 'number') {
    const cur = handle.getVolume();
    if (Math.abs(cur - data.volume) > 0.02) handle.setVolume(data.volume);
  }
  if (typeof data.muted === 'boolean' && handle.isMuted() !== data.muted) {
    handle.setMuted(data.muted);
  }
}

/* ── 영상 컨트롤 바 (월드·스튜디오 공용) ── 스크러버 + 재생/일시정지 + ±5초 + (선택)URL.
   registry 의 첫 영상 시각/길이를 250ms 폴링해 표시. 조작은 콜백으로(월드=broadcast+local, 스튜디오=local). */
function fmtTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return m + ':' + (ss < 10 ? '0' : '') + ss;
}

export function VideoControlBar({ registry, targetId, onSeekBy, onSeekTo, onTogglePlay, onChangeUrl }: {
  registry: VideoRegistry;
  /** 지정 시 그 objId 영상만 표시/조작 (비디오 리모컨). 미지정 시 등록된 첫 영상 (2D 바). */
  targetId?: string;
  onSeekBy: (delta: number) => void;
  onSeekTo: (t: number) => void;
  onTogglePlay: (play: boolean) => void;
  onChangeUrl?: () => void;
}) {
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [paused, setPaused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [scrub, setScrub] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => {
      if (dragging) return;
      const h = (targetId ? registry.current.get(targetId) : registry.current.values().next().value) as VideoHandle | undefined;
      if (!h) return;
      setCur(h.getTime() || 0);
      setDur(h.duration() || 0);
      setPaused(h.paused());
    }, 250);
    return () => clearInterval(iv);
  }, [registry, dragging, targetId]);

  const max = dur > 0 ? dur : 0;
  const shown = dragging ? scrub : cur;
  const btn: CSSProperties = {
    background: 'rgba(255,255,255,0.12)', color: '#fff', border: 'none',
    borderRadius: 7, padding: '5px 9px', fontSize: 13, fontWeight: 700, cursor: 'pointer', lineHeight: 1,
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: 'rgba(0,0,0,0.6)', padding: '6px 9px', borderRadius: 999,
      border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(6px)', maxWidth: '80vw',
    }}>
      <span style={{ fontSize: 13, padding: '0 2px' }}>📺</span>
      <button type="button" title="5초 뒤로" style={btn} onClick={() => onSeekBy(-5)}>⏪</button>
      <button type="button" title={paused ? '재생' : '일시정지'} style={btn} onClick={() => onTogglePlay(paused)}>{paused ? '▶' : '⏸'}</button>
      <button type="button" title="5초 앞으로" style={btn} onClick={() => onSeekBy(5)}>⏩</button>
      <span style={{ fontSize: 11, color: '#fff', fontVariantNumeric: 'tabular-nums', minWidth: 30, textAlign: 'right' }}>{fmtTime(shown)}</span>
      <input
        type="range" min={0} max={max || 1} step={0.1}
        value={Math.min(shown, max || 1)}
        onPointerDown={() => { setScrub(cur); setDragging(true); }}
        onChange={e => setScrub(Number(e.currentTarget.value))}
        onPointerUp={e => { const t = Number((e.currentTarget as HTMLInputElement).value); setDragging(false); onSeekTo(t); }}
        style={{ width: 180, maxWidth: '34vw', accentColor: '#818cf8', cursor: 'pointer' }}
      />
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontVariantNumeric: 'tabular-nums', minWidth: 30 }}>{fmtTime(max)}</span>
      {onChangeUrl && <button type="button" title="다른 동영상으로 변경" style={btn} onClick={onChangeUrl}>🔗</button>}
    </div>
  );
}

/* ── 비디오 리모컨 — 진짜 3D 메쉬 (태블릿 식). 캔버스 텍스처를 plane 에 입히고 raycaster 로 클릭 받음.
   - 2D HTML 오버레이 X → drei Html 안 씀. 깊이 가림·원근감 자연 (다른 오브젝트와 동일하게 처리됨).
   - 텍스처: offscreen 2D canvas 에 매 250ms 그려서 THREE.CanvasTexture 로 업데이트.
   - 클릭: mesh onPointerDown 에서 event.uv 받아 캔버스 픽셀 좌표로 변환 → 어느 버튼/스크러버 영역인지 판정. */

// 캔버스 레이아웃 (px) — 클릭 hit 판정 + 그리기 좌표 공유
const CAN_W = 512, CAN_H = 256;

// 리모컨 클릭 가능한 최대 거리(m) — 카메라/캐릭터로부터. "팔 닿을 거리" 개념.
// 이 거리보다 멀면 클릭 무시 (VRChat 의 interactable distance 와 유사).
const REMOTE_INTERACT_DISTANCE = 3;
const HIT = {
  title: { x: 0, y: 0, w: CAN_W, h: 44 },
  prev:  { x: 16,  y: 60, w: 60, h: 60 },   // ⏪
  play:  { x: 88,  y: 60, w: 60, h: 60 },   // ▶/⏸
  next:  { x: 160, y: 60, w: 60, h: 60 },   // ⏩
  mute:  { x: 232, y: 60, w: 60, h: 60 },   // 🔊/🔇
  vol:   { x: 300, y: 70, w: 130, h: 40 },  // 볼륨 슬라이더
  url:   { x: 436, y: 60, w: 60, h: 60 },   // 🔗
  scrub: { x: 16,  y: 150, w: CAN_W - 32, h: 36 }, // 스크러버 트랙
};

function drawRemote(
  ctx: CanvasRenderingContext2D,
  title: string, cur: number, dur: number, paused: boolean,
  volume: number, muted: boolean,
) {
  // 배경
  ctx.fillStyle = 'rgba(10,12,20,0.92)';
  ctx.fillRect(0, 0, CAN_W, CAN_H);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, CAN_W - 2, CAN_H - 2);
  // 제목
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.textBaseline = 'middle';
  const t = '📺  ' + (title.length > 32 ? title.slice(0, 30) + '…' : title);
  ctx.fillText(t, 14, HIT.title.y + HIT.title.h / 2);
  // 버튼 박스 헬퍼
  const drawBtn = (h: { x: number; y: number; w: number; h: number }, label: string, accent = '#a5b4fc') => {
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(h.x, h.y, h.w, h.h);
    ctx.strokeStyle = accent;
    ctx.strokeRect(h.x + 0.5, h.y + 0.5, h.w - 1, h.h - 1);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, h.x + h.w / 2, h.y + h.h / 2);
    ctx.textAlign = 'start';
  };
  drawBtn(HIT.prev, '⏪');
  drawBtn(HIT.play, paused ? '▶' : '⏸');
  drawBtn(HIT.next, '⏩');
  drawBtn(HIT.mute, muted || volume <= 0 ? '🔇' : '🔊', muted ? '#f87171' : '#a5b4fc');
  drawBtn(HIT.url,  '🔗', '#fcd34d');
  // 볼륨 슬라이더 트랙
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(HIT.vol.x, HIT.vol.y + HIT.vol.h / 2 - 4, HIT.vol.w, 8);
  const volRatio = muted ? 0 : Math.max(0, Math.min(1, volume));
  ctx.fillStyle = muted ? '#7f1d1d' : '#22c55e';
  ctx.fillRect(HIT.vol.x, HIT.vol.y + HIT.vol.h / 2 - 4, HIT.vol.w * volRatio, 8);
  // 볼륨 thumb
  ctx.beginPath();
  ctx.arc(HIT.vol.x + HIT.vol.w * volRatio, HIT.vol.y + HIT.vol.h / 2, 8, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  // 시간 — 볼륨 슬라이더와 겹치지 않게 아래로 이동
  ctx.fillStyle = '#c7d2fe';
  ctx.font = '14px monospace';
  ctx.fillText(fmtTime(cur) + ' / ' + fmtTime(dur), 232, 130);
  // 스크러버
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(HIT.scrub.x, HIT.scrub.y + HIT.scrub.h / 2 - 4, HIT.scrub.w, 8);
  const ratio = dur > 0 ? Math.max(0, Math.min(1, cur / dur)) : 0;
  ctx.fillStyle = '#818cf8';
  ctx.fillRect(HIT.scrub.x, HIT.scrub.y + HIT.scrub.h / 2 - 4, HIT.scrub.w * ratio, 8);
  // thumb
  ctx.beginPath();
  ctx.arc(HIT.scrub.x + HIT.scrub.w * ratio, HIT.scrub.y + HIT.scrub.h / 2, 10, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  // 안내 (하단)
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '13px sans-serif';
  ctx.fillText('Tab 으로 커서 켜고 클릭', 14, 220);
}

function hitTest(px: number, py: number): keyof typeof HIT | null {
  for (const key of Object.keys(HIT) as (keyof typeof HIT)[]) {
    const h = HIT[key];
    if (px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h) return key;
  }
  return null;
}

export function VideoRemotePanel({ registry, targetId, videoUrl, width = 1.6, height = 0.8, offsetY = 1, interactive = true, firstPerson = false, onSeekBy, onSeekTo, onTogglePlay, onChangeUrl, onSetVolume, onToggleMute }: {
  registry: VideoRegistry;
  /** 비어 있으면 미리보기 모드 (조작 없이 시각화만). */
  targetId: string;
  videoUrl: string;
  width?: number;
  height?: number;
  offsetY?: number;
  /** false 면 onPointerDown 안 받음 (스튜디오 편집뷰 미리보기). */
  interactive?: boolean;
  /** true 면 마우스 hover 위치 무시하고 화면 중앙 크로스헤어로만 클릭 받음.
   *  pointer lock 안 쓰는 모드(스튜디오 시뮬 1인칭) 대응. 월드는 pointer lock 으로 자동 감지. */
  firstPerson?: boolean;
  onSeekBy: (delta: number) => void;
  onSeekTo: (t: number) => void;
  onTogglePlay: (play: boolean) => void;
  onChangeUrl: () => void;
  /** 볼륨 0~1 — 미지정 시 음소거 토글만 가능 (편집 미리보기). */
  onSetVolume?: (v: number) => void;
  /** 음소거 토글 — 호출 시 현재 muted 상태 받음 (true → unmute). */
  onToggleMute?: (currentlyMuted: boolean) => void;
}) {
  // 유튜브 제목 best-effort
  const [titled, setTitled] = useState<{ url: string; title: string }>({ url: '', title: '' });
  useEffect(() => {
    const id = parseYouTubeId(videoUrl || '');
    if (!id) return;
    let cancelled = false;
    fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!cancelled && j?.title) setTitled({ url: videoUrl, title: String(j.title) }); })
      .catch(() => { /* noop */ });
    return () => { cancelled = true; };
  }, [videoUrl]);

  const ytId = parseYouTubeId(videoUrl || '');
  const fallback = videoUrl
    ? (ytId ? 'YouTube · ' + ytId : (videoUrl.split('/').pop() || videoUrl))
    : '(영상 없음)';
  const shownTitle = (titled.url === videoUrl && titled.title) || fallback;

  // offscreen canvas + texture (한 번만 생성)
  const canvas = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = CAN_W; c.height = CAN_H;
    return c;
  }, []);
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter;
    return t;
  }, [canvas]);
  useEffect(() => () => { texture.dispose(); }, [texture]);

  // 영상 상태 폴링 — 250ms 마다 캔버스 다시 그림. 미리보기(targetId 없음)면 더미 값.
  useEffect(() => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const tick = () => {
      const h = targetId ? registry.current.get(targetId) : undefined;
      const cur = h?.getTime() || 0;
      const dur = h?.duration() || 0;
      const paused = h?.paused() ?? true;
      const volume = h?.getVolume() ?? 1;
      const muted  = h?.isMuted() ?? false;
      drawRemote(ctx, shownTitle, cur, dur, paused, volume, muted);
      texture.needsUpdate = true;
    };
    tick();
    const iv = setInterval(tick, 250);
    return () => clearInterval(iv);
  }, [canvas, texture, registry, targetId, shownTitle]);

  // 클릭 처리 공용 (uv → 버튼 분기). 마우스 클릭(R3F)·1인칭 크로스헤어 양쪽에서 사용.
  const handleUv = (uv: { x: number; y: number }) => {
    const px = uv.x * CAN_W;
    const py = (1 - uv.y) * CAN_H;
    const hit = hitTest(px, py);
    if (hit === 'prev')      onSeekBy(-5);
    else if (hit === 'next') onSeekBy(5);
    else if (hit === 'play') {
      const h = registry.current.get(targetId);
      onTogglePlay(h?.paused() ?? true);
    }
    else if (hit === 'mute') {
      const h = registry.current.get(targetId);
      onToggleMute?.(h?.isMuted() ?? false);
    }
    else if (hit === 'vol') {
      if (onSetVolume) {
        const ratio = Math.max(0, Math.min(1, (px - HIT.vol.x) / HIT.vol.w));
        onSetVolume(ratio);
      }
    }
    else if (hit === 'url')  onChangeUrl();
    else if (hit === 'scrub') {
      const h = registry.current.get(targetId);
      const dur = h?.duration() || 0;
      if (dur > 0) {
        const ratio = Math.max(0, Math.min(1, (px - HIT.scrub.x) / HIT.scrub.w));
        onSeekTo(ratio * dur);
      }
    }
  };

  // 1인칭 크로스헤어 클릭 — pointer lock(PC) 또는 firstPerson prop(스튜디오 시뮬) 또는
  // alp:fp-tap(모바일 1인칭 탭) 모두 화면 중앙 raycaster 로 처리. mesh hit 시 handleUv.
  // 주의: capture phase X / stopPropagation X — 다른 1인칭 처리(오브젝트 클릭 등) 와 공존.
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera, gl } = useThree();
  useEffect(() => {
    if (!interactive) return;
    const tryCrosshairHit = () => {
      if (!meshRef.current) return;
      // 사용자가 보는 visible 중심(visualViewport) 을 NDC 로 변환 — 모바일 주소창 분 보정.
      // 데스크탑은 visualViewport == window 라 기존 NDC(0,0) 과 동일.
      const canvas = gl.domElement;
      const rect = canvas.getBoundingClientRect();
      const vw = typeof window !== 'undefined' ? window.visualViewport : undefined;
      const cx = vw ? vw.offsetLeft + vw.width / 2 : window.innerWidth / 2;
      const cy = vw ? vw.offsetTop  + vw.height / 2 : window.innerHeight / 2;
      const ndcX = ((cx - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((cy - rect.top) / rect.height) * 2 + 1;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      const hits = raycaster.intersectObject(meshRef.current);
      // 거리 제한 — 손 닿을 거리 안에서만 클릭 허용
      if (hits.length > 0 && hits[0].distance <= REMOTE_INTERACT_DISTANCE && hits[0].uv) {
        handleUv(hits[0].uv);
      }
    };
    const onClick = (e: PointerEvent) => {
      if (!document.pointerLockElement && !firstPerson) return;   // 일반 모드면 R3F 클릭이 처리
      if (e.button !== 0) return;
      tryCrosshairHit();
    };
    // 모바일 1인칭 탭 — WorldCanvas 가 dispatch. pointer lock 없는 환경 대응.
    const onMobileTap = () => { tryCrosshairHit(); };
    window.addEventListener('pointerdown', onClick);
    document.addEventListener('alp:fp-tap', onMobileTap);
    return () => {
      window.removeEventListener('pointerdown', onClick);
      document.removeEventListener('alp:fp-tap', onMobileTap);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive, firstPerson, camera, targetId]);

  return (
    <mesh
      ref={meshRef}
      position={[0, offsetY, 0]}
      onPointerDown={interactive ? (e) => {
        // 1인칭(pointer lock 또는 firstPerson) 모드에선 마우스 hover 클릭 무시 — 위 raycaster 가 처리
        if (document.pointerLockElement || firstPerson) return;
        // 손 닿을 거리 밖이면 무시 — 멀리서는 클릭 안 됨
        if (typeof e.distance === 'number' && e.distance > REMOTE_INTERACT_DISTANCE) return;
        e.stopPropagation();
        if (!e.uv) return;
        handleUv(e.uv);
      } : undefined}
    >
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} transparent side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
  );
}
