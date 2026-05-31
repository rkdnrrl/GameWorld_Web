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
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

export const VIDEO_SYNC_EVENT = '__video__';
// 유저 컨트롤(앞/뒤 이동·URL 변경) 동기화 이벤트 — 주기적 sync(__video__)와 별개의 1회성 명령.
export const VIDEO_CTL_EVENT = '__videoctl__';
export interface VideoControlCmd { seekTo?: number; url?: string; playing?: boolean }

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
    const handle: VideoHandle = {
      getTime: () => playerRef.current?.getCurrentTime?.() ?? 0,
      seek: (t) => { console.log('[YT] seek', objId, '→', t); try { playerRef.current?.seekTo?.(t, true); } catch { /* noop */ } },
      duration: () => playerRef.current?.getDuration?.() ?? 0,
      setPlaying: (p) => { console.log('[YT] setPlaying', objId, '→', p); try { p ? playerRef.current?.playVideo?.() : playerRef.current?.pauseVideo?.(); } catch { /* noop */ } },
      paused: () => (playerRef.current?.getPlayerState?.() ?? 1) !== 1,  // 1 = playing
    };
    registry.current.set(objId, handle);
    return () => { console.log('[YT] unregister handle', objId); registry.current.delete(objId); };
  }, [registry, objId]);

  // 소리 — 사용자 제스처마다 음소거 해제 시도 (once X — player 준비 전 첫 클릭이 헛돌아도
  // 준비된 뒤 다음 클릭에 켜지게). 이미 소리 켜져 있으면 무해.
  useEffect(() => {
    if (!withSound) return;
    const onGesture = () => { try { playerRef.current?.unMute?.(); playerRef.current?.playVideo?.(); } catch { /* noop */ } };
    window.addEventListener('pointerdown', onGesture);
    return () => window.removeEventListener('pointerdown', onGesture);
  }, [withSound]);

  // drei <Html transform> 의 px→월드 환산 (scale 1 에서 640px ≈ 64유닛, 경험치).
  // contain fit — 영상 16:9 비율 유지하며 평면 안에 맞춤. 남는 부분은 평면 mesh (썸네일) 가 보임 = 레터박스.
  // 사용자 요구: 영상이 stretched 되지 말고 비율 유지. 평면이 16:9 면 가득 차고, 다른 비율이면 위아래 / 좌우 띠.
  const PX_TO_UNIT = 0.06;
  const w = Math.max(0.01, planeW), h = Math.max(0.01, planeH);
  const videoAspect = YT_IFRAME_W / YT_IFRAME_H;
  const planeAspect = w / h;
  let fitW: number, fitH: number;
  if (planeAspect > videoAspect) { fitH = h; fitW = h * videoAspect; }
  else                            { fitW = w; fitH = w / videoAspect; }
  const sx = fitW / (YT_IFRAME_W * PX_TO_UNIT);
  const sy = fitH / (YT_IFRAME_H * PX_TO_UNIT);
  return (
    <Html transform occlude="blending" pointerEvents="none" position={[0, 0, 0.05]} scale={[sx, sy, 1]} center>
      <div ref={setContainerRef} style={{ width: YT_IFRAME_W, height: YT_IFRAME_H, background: '#000' }} />
    </Html>
  );
});

/* ── 호출부 편의 — context.live 에 따라 재질/오버레이 자동 선택 ── */
export function YouTubeMeshMaterial({ videoId, selected, side = THREE.FrontSide }: {
  videoId: string; selected?: boolean; side?: THREE.Side;
}) {
  // 항상 썸네일 — live(시뮬/월드)에선 그 위에 iframe 이 덮어 재생. iframe 이 안 떠도
  // 검은 화면 대신 썸네일이 보이게 (폴백).
  return <YouTubeThumbMaterial videoId={videoId} selected={selected} side={side} />;
}
export const YouTubeMaybeOverlay = memo(function YouTubeMaybeOverlayImpl({ videoId, objId, planeW, planeH }: { videoId: string; objId?: string; planeW?: number; planeH?: number }) {
  const { live } = useContext(VideoScreenCtx);
  return live ? <YouTubeOverlay videoId={videoId} objId={objId} planeW={planeW} planeH={planeH} /> : null;
});

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
const HIT = {
  title: { x: 0, y: 0, w: CAN_W, h: 44 },
  prev:  { x: 16,  y: 60, w: 60, h: 60 },   // ⏪
  play:  { x: 88,  y: 60, w: 60, h: 60 },   // ▶/⏸
  next:  { x: 160, y: 60, w: 60, h: 60 },   // ⏩
  url:   { x: 436, y: 60, w: 60, h: 60 },   // 🔗
  scrub: { x: 16,  y: 150, w: CAN_W - 32, h: 36 }, // 스크러버 트랙
};

function drawRemote(ctx: CanvasRenderingContext2D, title: string, cur: number, dur: number, paused: boolean) {
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
  drawBtn(HIT.url,  '🔗', '#fcd34d');
  // 시간
  ctx.fillStyle = '#c7d2fe';
  ctx.font = '16px monospace';
  ctx.fillText(fmtTime(cur) + ' / ' + fmtTime(dur), 240, 90);
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

export function VideoRemotePanel({ registry, targetId, videoUrl, width = 1.6, height = 0.8, offsetY = 1, interactive = true, onSeekBy, onSeekTo, onTogglePlay, onChangeUrl }: {
  registry: VideoRegistry;
  /** 비어 있으면 미리보기 모드 (조작 없이 시각화만). */
  targetId: string;
  videoUrl: string;
  width?: number;
  height?: number;
  offsetY?: number;
  /** false 면 onPointerDown 안 받음 (스튜디오 편집뷰 미리보기). */
  interactive?: boolean;
  onSeekBy: (delta: number) => void;
  onSeekTo: (t: number) => void;
  onTogglePlay: (play: boolean) => void;
  onChangeUrl: () => void;
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
      drawRemote(ctx, shownTitle, cur, dur, paused);
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

  // 1인칭 크로스헤어 클릭 — pointer lock 상태에서 화면 중앙으로 raycaster 쏴 이 mesh hit 시 처리.
  // R3F 의 onPointerDown 은 마우스 좌표 기반이라 lock 중엔 안 잡힘 → 직접 window listener.
  // 주의: capture phase X / stopPropagation X — 다른 1인칭 처리(오브젝트 클릭 등) 와 공존.
  //   리모컨 hit 일 때도 다른 처리에 클릭이 같이 전달되지만, 다른 곳도 raycast 로 자기 mesh hit
  //   체크하므로 동시 호출돼도 무해(리모컨 mesh 는 다른 곳에서 hit 안 됨).
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  useEffect(() => {
    if (!interactive) return;
    const onClick = (e: PointerEvent) => {
      if (!document.pointerLockElement) return;   // lock 안 됐으면 R3F 일반 클릭이 처리
      if (e.button !== 0) return;
      if (!meshRef.current) return;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);   // 화면 중앙
      const hits = raycaster.intersectObject(meshRef.current);
      if (hits.length > 0 && hits[0].uv) handleUv(hits[0].uv);
    };
    window.addEventListener('pointerdown', onClick);
    return () => window.removeEventListener('pointerdown', onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive, camera, targetId]);

  return (
    <mesh
      ref={meshRef}
      position={[0, offsetY, 0]}
      onPointerDown={interactive ? (e) => {
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
