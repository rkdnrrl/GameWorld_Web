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
import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Html } from '@react-three/drei';
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
  // controls=0/disablekb=1/fs=0 → YouTube 자체 UI 제거(유저가 직접 못 건드림). 재생 제어는 별도 버튼이 IFrame API 로 함.
  const src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0&disablekb=1&fs=0&modestbranding=1&rel=0&iv_load_policy=3&playsinline=1`;
  // occlude="blending": 깊이 버퍼 기반 픽셀 단위 가림. 캔버스 alpha:true + 배경 div + 캔버스 zIndex
  //   강제(16777271) 조합으로 iframe 이 캔버스 뒤로 가게 해 캐릭터·박스 등이 영상을 가림.
  //   알려진 한계: drei transform 모드 occlusion mesh 가 빌보드 셰이더라 가림 영역이 살짝 부정확할 수 있음.
  // pointerEvents="none": iframe 클릭 통과 → 마우스 캡쳐 안 됨. 조작은 별도 리모컨 패널이 담당.
  return (
    <Html transform occlude="blending" pointerEvents="none" position={[0, 0, 0.05]} scale={[sx, sy, 1]} center>
      <iframe
        ref={iframeRef}
        width={YT_IFRAME_W}
        height={YT_IFRAME_H}
        src={src}
        title="YouTube"
        frameBorder={0}
        allow="autoplay; encrypted-media; picture-in-picture"
        style={{ border: 'none', display: 'block', background: '#000', pointerEvents: 'none' }}
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

  return (
    <mesh
      position={[0, offsetY, 0]}
      onPointerDown={interactive ? (e) => {
        e.stopPropagation();
        if (!e.uv) return;
        const px = e.uv.x * CAN_W;
        const py = (1 - e.uv.y) * CAN_H;
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
      } : undefined}
    >
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} transparent side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
  );
}
