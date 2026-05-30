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
  // occlude="blending": 깊이 버퍼 기반 픽셀 단위 가림 — 앞 오브젝트(캐릭터/벽)가 영상을 픽셀 정확히 가림.
  //   동작 조건: 캔버스가 투명(gl alpha:true + CSS background 없음)이어야 occlusion mesh 의 alpha-0
  //   구멍 사이로 뒤에 있는 iframe 이 보임. 캔버스에 솔리드 배경이 깔리면 구멍이 막혀 가림이 깨짐.
  //   WorldCanvas 는 alpha:true + 별도 배경 div(z-index:-1) 로 이 조건을 충족함.
  // pointerEvents="none": iframe 을 완전 비상호작용(클릭 통과)으로 → 유저가 YouTube 를 못 건드리고,
  //   클릭은 그대로 캔버스로 통과해 포인터락(화면 회전)이 정상 동작. 조작은 별도 컨트롤 바가 담당.
  // (주의: blending 은 캔버스 pointerEvents 를 none 으로 만들어 → WorldCanvas 가 매 프레임 auto 로 복원)
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

/* ── 알파 0 출력 셰이더 — 캔버스에 영상 평면 모양의 투명 구멍을 뚫음.
   캔버스 zIndex(16777271) > iframe zIndex(~8388634)라 구멍을 통해 뒤의 iframe 이 비침.
   transparent:false + depthTest:true 라 캐릭터가 mesh 앞에 있으면 깊이 테스트 실패 → mesh 안 그려짐
   → 캔버스에 캐릭터 픽셀(alpha=1) 유지 → 캐릭터가 영상 위로 정상 표시됨. */
function makeYouTubeOccluderMaterial(side: THREE.Side): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: `void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0); }`,
    side,
    transparent: false,
    depthTest: true,
    depthWrite: true,
  });
}

/* ── 호출부 편의 — context.live 에 따라 재질/오버레이 자동 선택 ── */
export function YouTubeMeshMaterial({ videoId, selected, side = THREE.FrontSide }: {
  videoId: string; selected?: boolean; side?: THREE.Side;
}) {
  const { live } = useContext(VideoScreenCtx);
  // live(월드/시뮬)면 mesh 를 alpha=0 셰이더로 → 캔버스에 영상 모양 구멍을 뚫어 뒤의 iframe 이 보임 +
  //   캐릭터가 앞에 있으면 깊이 테스트로 mesh 가 안 그려져 캐릭터 정상 표시.
  // 편집(non-live)이면 썸네일 표시.
  const occluder = useMemo(() => live ? makeYouTubeOccluderMaterial(side) : null, [live, side]);
  useEffect(() => () => { occluder?.dispose(); }, [occluder]);
  if (live && occluder) return <primitive object={occluder} attach="material" />;
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

/* ── 비디오 리모컨 — 씬에 놓는 3D 조작 패널 (videoRemote 컴포넌트). 오브젝트 위치에 떠서
   현재 영상 이름 + URL 변경 + 스크러버/재생을 보여줌. 특정 영상(targetId)만 조작.
   부모 <group position> 안에 두면 그 위치에 앵커됨. <Html> 비-transform: 항상 정면·고정 크기라
   거리와 무관하게 읽기/클릭 좋음. occlude="raycast": 오브젝트 순서(깊이)를 따라 — 앵커 앞에 메시
   (캐릭터·벽·영상 평면)가 있으면 패널을 숨김(display:none), 보일 땐 z-index 가 영상 blending(~8.3M)
   보다 위라 영상 위로 그려짐. 자기 오브젝트에 가리지 않게 position +Y 로 살짝 띄움. 클릭 가능(pe auto). */
export function VideoRemotePanel({ registry, targetId, videoUrl, onSeekBy, onSeekTo, onTogglePlay, onChangeUrl }: {
  registry: VideoRegistry;
  targetId: string;
  videoUrl: string;
  onSeekBy: (delta: number) => void;
  onSeekTo: (t: number) => void;
  onTogglePlay: (play: boolean) => void;
  onChangeUrl: () => void;
}) {
  // 유튜브 제목 best-effort (oEmbed). url 과 함께 저장해, url 바뀌면 자동으로 폴백(파생값)으로.
  const [titled, setTitled] = useState<{ url: string; title: string }>({ url: '', title: '' });
  useEffect(() => {
    const id = parseYouTubeId(videoUrl || '');
    if (!id) return;
    let cancelled = false;
    fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!cancelled && j?.title) setTitled({ url: videoUrl, title: String(j.title) }); })
      .catch(() => { /* CORS/네트워크 — 폴백 사용 */ });
    return () => { cancelled = true; };
  }, [videoUrl]);

  const ytId = parseYouTubeId(videoUrl || '');
  const fallback = videoUrl
    ? (ytId ? 'YouTube · ' + ytId : (videoUrl.split('/').pop() || videoUrl))
    : '(영상 없음)';
  const shown = (titled.url === videoUrl && titled.title) || fallback;

  return (
    <Html center occlude="raycast" position={[0, 1, 0]} style={{ pointerEvents: 'auto' }}>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 6, width: 280,
        background: 'rgba(10,12,20,0.82)', padding: 10, borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.14)', backdropFilter: 'blur(6px)',
        boxShadow: '0 6px 24px rgba(0,0,0,0.45)', userSelect: 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#fff', fontWeight: 700 }}>
          <span>📺</span>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={shown}>{shown}</span>
        </div>
        <VideoControlBar
          registry={registry}
          targetId={targetId}
          onSeekBy={onSeekBy}
          onSeekTo={onSeekTo}
          onTogglePlay={onTogglePlay}
          onChangeUrl={onChangeUrl}
        />
      </div>
    </Html>
  );
}
