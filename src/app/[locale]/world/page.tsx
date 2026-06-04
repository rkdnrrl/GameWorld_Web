'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useGameSocket } from '@/lib/world/useGameSocket';
import { useGraphicsSettings } from '@/lib/world/graphicsSettings';
import { session } from '@/lib/api';

const WorldCanvas = dynamic(() => import('@/components/world/WorldCanvas'), { ssr: false });
const GraphicsPanel = dynamic(() => import('@/components/world/GraphicsPanel'), { ssr: false });
const SessionPicker = dynamic(() => import('@/components/world/SessionPicker'), { ssr: false });

interface MapObject {
  id: string;
  kind: 'cube' | 'sphere' | 'cylinder' | 'plane' | 'asset';
  assetUrl?: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
}

interface MyCharacter {
  id: string;
  name: string;
  appearance: Record<string, unknown>;
  isActive: boolean;
}

interface HubWorld {
  id: string;
  name: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  playCount?: number;
  ownerName?: string | null;
  tags?: string[];
  creator?: { username?: string };
  createdAt?: string;
  updatedAt?: string;
}

export default function WorldPage() {
  const t = useTranslations('World');
  const tc = useTranslations('Common');
  const tg = useTranslations('Games');
  const th = useTranslations('Header');
  const tw = useTranslations('Worlds');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const worldIdParam = searchParams.get('id');
  const sessionIdParam = searchParams.get('s'); // 세션 id — 같은 worldId 안의 분리된 DO 인스턴스
  const API = process.env.NEXT_PUBLIC_API_URL || 'https://airliveplay.com';

  // 운영자가 지정한 홈허브 worldId. undefined = 로딩 중, null = 미지정, string = 홈허브 id.
  // 항상 조회 — worldIdParam 이 홈허브 id 와 같으면 personal 모드 강제.
  const [homeHubId, setHomeHubId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    fetch(`${API}/api/worlds/home-hub`)
      .then(r => r.ok ? r.json() : { worldId: null })
      .then(d => setHomeHubId(d.worldId || null))
      .catch(() => setHomeHubId(null));
  }, [API]);

  // 실제로 로드할 월드 id — 명시 파라미터 우선, 없으면 홈허브, 그것도 없으면 데모 섬
  const effectiveWorldId = worldIdParam || (homeHubId ?? null);
  // worldSocketKey = DO routing key. SessionPicker / Lobby DO 가 같은 key 로 조회하므로
  // 'world:' 접두사 없이 raw worldId 그대로 사용해야 매칭됨. (이전엔 prefix 때문에 Lobby miss)
  const worldSocketKey = effectiveWorldId || 'home_default';
  // 홈허브 = 개인 모드 (각자 자기 DO 인스턴스). 다른 맵 = 공개 세션 분리.
  const isHomeHub = !!homeHubId && effectiveWorldId === homeHubId;
  // 월드 메타 (kind, maxPlayers) — undefined = 로딩 중. 백엔드 응답 후 'personal' 또는 'multi'.
  const [worldKind, setWorldKind] = useState<'personal' | 'multi' | undefined>(undefined);
  const [worldMaxPlayers, setWorldMaxPlayers] = useState<number>(50);
  const [worldName, setWorldName] = useState<string>('');

  const [character, setCharacter] = useState<Record<string, unknown> | null>(null);
  const [userId, setUserId] = useState('');
  const [username, setUsername] = useState('');
  const [ready, setReady] = useState(false);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [customObjects, setCustomObjects] = useState<MapObject[] | null>(null);
  const [sceneSettings, setSceneSettings] = useState<Record<string, unknown> | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // 통합 설정 모달 — ⚙ 클릭 또는 ESC 키로 열림. 그래픽/전체화면/허브 옵션 모두 포함.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'graphics' | 'display' | 'hub' | 'develop'>('graphics');
  // 설정에서 하위 모달(캐릭터/맵/포탈) 진입 시 true → 그 모달 X 닫을 때 설정으로 복귀.
  const [returnToSettings, setReturnToSettings] = useState(false);
  const closeCharModal = () => {
    setCharModalOpen(false);
    if (returnToSettings) { setReturnToSettings(false); setSettingsOpen(true); }
  };
  const closeMapModal = () => {
    setMapModalOpen(false);
    setPortalPickMode(false);
    if (returnToSettings) { setReturnToSettings(false); setSettingsOpen(true); }
  };
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [charModalOpen, setCharModalOpen] = useState(false);
  // 캐릭터 관리 (편집/생성) 모달 — iframe 으로 /character 페이지 임베드
  const [charManagerOpen, setCharManagerOpen] = useState(false);
  const closeCharManager = () => {
    setCharManagerOpen(false);
    if (returnToSettings) { setReturnToSettings(false); setSettingsOpen(true); }
  };
  // 활성 캐릭터 다시 fetch — 캐릭터 모달에서 저장 후 자동 반영용.
  // cache: 'no-store' 로 브라우저 캐시 우회 + 새 객체 reference 로 강제 React re-render.
  const reloadActiveCharacter = useCallback(async () => {
    const token = session.getToken();
    if (!token) return;
    try {
      const res = await fetch(`${API}/api/characters/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      const active = data?.character;
      if (active?.id) {
        const fresh = { ...active, appearance: { ...(active.appearance ?? {}) } };
        console.log('[world] setCharacter fresh:', fresh.id, 'modelUrl:', fresh.appearance?.modelUrl, 'modelScale:', fresh.appearance?.modelScale);
        setCharacter(fresh);
        setMyChars(prev => prev.map(c => c.id === active.id ? fresh : c));
      }
      // 캐릭터 목록도 갱신 (새 캐릭터 생성 등)
      const listRes = await fetch(`${API}/api/characters`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (listRes.ok) {
        const list = await listRes.json().catch(() => null);
        if (Array.isArray(list?.characters)) setMyChars(list.characters);
      }
    } catch (e) { console.warn('[world] reloadActiveCharacter failed:', e); }
  }, [API]);

  // iframe 안에서 캐릭터 저장 완료 시 postMessage 받음 → 모달 닫고 캐릭터 즉시 반영.
  useEffect(() => {
    if (!charManagerOpen) return;
    const onMsg = (e: MessageEvent) => {
      console.log('[world] message received:', e.data, 'origin:', e.origin);
      if (e.origin !== window.location.origin) return;
      if ((e.data as { type?: string })?.type === 'alp:character-saved') {
        console.log('[world] character-saved → reloading active character');
        reloadActiveCharacter();
        closeCharManager();
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charManagerOpen, reloadActiveCharacter]);
  const [mapTab, setMapTab] = useState<'home' | 'mine' | 'public'>('home');
  const [mapSearch, setMapSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [mapSort, setMapSort] = useState<'popular' | 'latest'>('popular');
  const [previewCharId, setPreviewCharId] = useState('');
  const [switchingCharId, setSwitchingCharId] = useState('');
  const [myChars, setMyChars] = useState<MyCharacter[]>([]);
  const [myWorlds, setMyWorlds] = useState<HubWorld[]>([]);
  const [publicWorlds, setPublicWorlds] = useState<HubWorld[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // 카메라 시점 (1인칭/3인칭) — 월드 설정에서 선택, localStorage 에 저장. WorldCanvas 의 V키 토글과 동기화.
  const [cameraMode, setCameraMode] = useState<'first' | 'third'>('third');
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('alp_world_cameraMode') : null;
    if (saved === 'first' || saved === 'third') setCameraMode(saved);
  }, []);
  const changeCameraMode = useCallback((m: 'first' | 'third') => {
    setCameraMode(m);
    try { localStorage.setItem('alp_world_cameraMode', m); } catch { /* noop */ }
  }, []);
  // 1인칭 시야각(FOV) — 50~110°, 기본 75
  const [fpFov, setFpFov] = useState(75);
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? Number(localStorage.getItem('alp_world_fpFov')) : NaN;
    if (Number.isFinite(saved) && saved >= 50 && saved <= 110) setFpFov(saved);
  }, []);
  const changeFpFov = useCallback((v: number) => {
    const clamped = Math.max(50, Math.min(110, Math.round(v)));
    setFpFov(clamped);
    try { localStorage.setItem('alp_world_fpFov', String(clamped)); } catch { /* noop */ }
  }, []);
  // VRChat 식 포탈 — WorldCanvas 가 등록하는 API + 열린 포탈 배너 + 맵 피커 포탈 모드
  const portalApiRef = useRef<{ open: (worldId: string, name: string) => void; close: () => void } | null>(null);
  const [portalPickMode, setPortalPickMode] = useState(false);
  const [openedPortal, setOpenedPortal] = useState<{ worldId: string; name: string } | null>(null);
  const [teleporting, setTeleporting] = useState(false);
  // 이모트 (커스텀 애니메이션 슬롯 트리거)
  const [emoteSlot, setEmoteSlot] = useState<string | null>(null);
  const [emotePanel, setEmotePanel] = useState(false);
  const [emoteLoopMap, setEmoteLoopMap] = useState<Record<string, boolean>>({}); // true=루프, false=한번만
  const [platformEmoteSlots, setPlatformEmoteSlots] = useState<string[]>([]);
  // CORE (코어) 슬롯 = 이동·점프·앉기·prone — 이모트 바에서 제외 (자동으로 캐릭터 컨트롤러가 사용).
  // 13 표준 슬롯 + legacy 5 + prone 변형 모두 코어로 처리.
  const CORE_ANIM_SLOTS = useMemo(() => new Set([
    // 13 표준
    'idle',
    'walk_fwd', 'walk_bwd', 'walk_left', 'walk_right',
    'run_fwd', 'run_bwd',
    'jump_start', 'jump_loop', 'jump_land',
    'fall',
    'crouch_idle', 'crouch_walk',
    // legacy 5 (운영자가 예전에 등록한 데이터 호환)
    'walk', 'run', 'jump', 'crouch',
    // prone 변형 (예비)
    'prone', 'prone_move',
  ]), []);

  // 운영자 등록 플랫폼 애니메이션 중 비코어 슬롯 → 이모트 바에 표시
  useEffect(() => {
    fetch(`${API}/api/character-animations`)
      .then(r => r.json())
      .then((d: { slots?: Record<string, { enabled?: boolean }>; order?: string[] }) => {
        const order = d.order || Object.keys(d.slots || {});
        const nonCore = order.filter(s => !CORE_ANIM_SLOTS.has(s) && d.slots?.[s]?.enabled !== false);
        setPlatformEmoteSlots(nonCore);
      })
      .catch(() => {});
  }, [API, CORE_ANIM_SLOTS]);

  const emoteSlots = useMemo(() => {
    // 플랫폼 슬롯(운영자 등록) + 캐릭터 개인 매핑 슬롯 합산, 중복 제거
    const set = new Set(platformEmoteSlots);
    if (character) {
      const ap = (character.appearance || {}) as Record<string, unknown>;
      const slots = (ap.animSlots as Record<string, string>) || {};
      const slotUrls = (ap.animSlotUrls as Record<string, string>) || {};
      Object.keys(slots).forEach(s => {
        if (!CORE_ANIM_SLOTS.has(s) && (slots[s] || slotUrls[s])) set.add(s);
      });
    }
    return [...set];
  }, [character, platformEmoteSlots, CORE_ANIM_SLOTS]);

  // 키보드 단축키 — 1~9 키로 emote 슬롯 즉시 트리거. 채팅창·input·iframe 안에선 무시.
  useEffect(() => {
    if (emoteSlots.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      // 채팅/검색 등 input 안에서는 비활성
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if ((e.target as HTMLElement | null)?.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // 1~9 → emoteSlots[0..8]
      if (e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key, 10) - 1;
        const slot = emoteSlots[idx];
        if (!slot) return;
        e.preventDefault();
        setEmoteSlot(prev => prev === slot ? null : slot);
      } else if (e.key === '0' || e.key === 'Escape') {
        // 0 또는 ESC → emote 해제
        if (emoteSlot) {
          e.preventDefault();
          setEmoteSlot(null);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [emoteSlots, emoteSlot]);

  useEffect(() => {
    // 견고한 redirect 헬퍼 — next-intl router 가 안 먹는 경우 window.location 으로 강제.
    function goCharacter() {
      console.log('[world] no active character → redirect /character');
      try { router.replace('/character'); } catch {}
      // safety net: 200ms 후에도 URL 안 바뀌면 강제
      setTimeout(() => {
        if (typeof window !== 'undefined' && window.location.pathname.includes('/world')) {
          window.location.replace(window.location.pathname.replace(/\/world.*$/, '/character'));
        }
      }, 200);
    }
    function goHome() {
      try { router.replace('/'); } catch {}
      setTimeout(() => {
        if (typeof window !== 'undefined' && window.location.pathname.includes('/world')) {
          window.location.replace('/');
        }
      }, 200);
    }
    async function load() {
      const token = session.getToken();
      if (!token) { goHome(); return; }

      try {
        const [meRes, charRes] = await Promise.all([
          fetch(`${API}/api/me`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API}/api/characters/me`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        if (!meRes.ok) { goHome(); return; }
        const { id, nickname } = await meRes.json();
        setUserId(id);
        setUsername(nickname || 'player');

        if (!charRes.ok) { goCharacter(); return; }
        const charData = await charRes.json().catch(() => null);
        const activeChar = charData?.character;
        // null, undefined, 또는 id 없는 객체 모두 "없음" 으로 처리
        if (!activeChar || !activeChar.id) { goCharacter(); return; }

        setCharacter(activeChar);
        setMyChars([activeChar]);
        setReady(true);
      } catch (e) {
        console.error('[world] load failed:', e);
        goHome();
      }
    }
    load();
  }, [API, router]);

  useEffect(() => {
    if (!effectiveWorldId) {
      setCustomObjects(null);
      setWorldKind(undefined);
      return;
    }
    setCustomObjects(null);
    setWorldKind(undefined); // 새 월드 로딩 시작 — picker 노출 결정 보류
    const tok = session.getToken();
    const headers: Record<string, string> = tok ? { Authorization: `Bearer ${tok}` } : {};
    fetch(`${API}/api/worlds/${effectiveWorldId}`, { headers })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`world fetch failed: ${r.status}`))))
      .then((d) => {
        if (!d.world) {
          setCustomObjects([]);
          setWorldKind('multi'); // 응답 없으면 multi 로 처리해서 picker 흐름 진행
          return;
        }
        setCustomObjects(Array.isArray(d.world.mapData?.objects) ? d.world.mapData.objects : []);
        setSceneSettings(d.world.mapData?.sceneSettings ?? null);
        // 월드 메타 — 백엔드가 보내면 사용, 없으면 default 'multi'.
        const k = d.world.kind === 'personal' ? 'personal' : 'multi';
        setWorldKind(k);
        if (typeof d.world.maxPlayers === 'number' && d.world.maxPlayers > 0) setWorldMaxPlayers(d.world.maxPlayers);
        if (typeof d.world.name === 'string') setWorldName(d.world.name);
      })
      .catch(() => {
        setCustomObjects([]);
        setWorldKind('multi');
      });
  }, [API, effectiveWorldId]);

  // 실제로 사용할 sessionId 결정 로직:
  // - 홈허브 OR kind=personal → 본인 id (각자 자기 DO)
  // - sessionId 파라미터 있음 → 그대로 사용
  // - 그 외 → null (= picker 노출 트리거)
  //
  // 단, homeHubId 와 worldKind 가 둘 다 로드된 후에만 판정 — race condition 방지.
  // (로딩 중에 잘못 multi 로 처리해서 picker 띄우거나 잘못된 세션에 입장하는 것 막음)
  const metaLoaded = homeHubId !== undefined && worldKind !== undefined;
  const isPersonalMode = metaLoaded && (isHomeHub || worldKind === 'personal');
  const effectiveSessionId: string | null = !metaLoaded
    ? null
    : isPersonalMode
      ? (userId || null)
      : (sessionIdParam || null);
  // 세션 picker — 메타 로드 후 multi 모드 + sessionId 없을 때만 노출
  const showSessionPicker = metaLoaded && ready && !!effectiveWorldId && !isPersonalMode && !effectiveSessionId;

  useEffect(() => {
    if (!ready) return;
    const token = session.getToken();
    if (!token) return;

    Promise.all([
      fetch(`${API}/api/characters`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : { characters: [] }))
        .then((d) => (d.characters || []) as MyCharacter[])
        .catch(() => [] as MyCharacter[]),
      fetch(`${API}/api/worlds/my`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : { worlds: [] }))
        .then((d) => (d.worlds || []) as HubWorld[])
        .catch(() => [] as HubWorld[]),
      fetch(`${API}/api/worlds/public`)
        .then((r) => (r.ok ? r.json() : { worlds: [] }))
        .then((d) => (d.worlds || []) as HubWorld[])
        .catch(() => [] as HubWorld[]),
    ])
      .then(([chars, mine, pub]) => {
        const normalizeWorld = (w: HubWorld): HubWorld => {
          const ownerName = w.ownerName || w.creator?.username || null;
          const rawTags = Array.isArray(w.tags) ? w.tags : [];
          const text = `${w.name || ''} ${w.description || ''}`;
          const hashTags = Array.from(
            new Set((text.match(/#[\p{L}\p{N}_-]+/gu) || []).map((tag) => tag.replace(/^#/, '').trim()).filter(Boolean)),
          );
          return { ...w, ownerName, tags: Array.from(new Set([...rawTags, ...hashTags])).slice(0, 20) };
        };
        if (chars.length > 0) setMyChars(chars);
        setMyWorlds(mine.map(normalizeWorld));
        setPublicWorlds(pub.map(normalizeWorld));
      });
  }, [API, ready]);

  const { settings: graphics, updateSettings: updateGraphics, applyPreset: applyGraphicsPreset } = useGraphicsSettings();
  // WorldCanvas가 핸들러를 등록하는 ref들 (소켓 → WorldCanvas 콜백)
  const scriptEventRef = useRef<((objectId: string, event: string, data: Record<string, unknown>, fromId: string) => void) | null>(null);
  type ObjState = { id: string; pos: [number, number, number]; rot: [number, number, number]; scl: [number, number, number]; vis: boolean };
  const objectStatesRef = useRef<((states: ObjState[], fromId: string) => void) | null>(null);
  const objectOwnerRef = useRef<((objectId: string, ownerId: string | null) => void) | null>(null);
  // 런타임 spawn/destroy 동기화
  type RuntimeSpec = import('@/lib/world/useGameSocket').RuntimeObjectSpec;
  const objSpawnRef   = useRef<((spec: RuntimeSpec) => void) | null>(null);
  const objDestroyRef = useRef<((objectId: string) => void) | null>(null);

  // 호스트가 보낸 씬 스냅샷 — 입장 시 받으면 API customObjects 대신 이걸 사용
  const [sceneFromHost, setSceneFromHost] = useState<MapObject[] | null>(null);
  // 월드 바뀌면 스냅샷 초기화 (홈허브 → 다른 월드 이동 포함)
  useEffect(() => { setSceneFromHost(null); }, [effectiveWorldId]);

  const { players, posesRef, chatLog, chatBubbles, connected, sendMove, sendChat, sendScriptEvent, sendObjectStates, sendObjClaim, sendObjRelease, sendObjSpawn, sendObjDestroy, sendSceneRegister, hostId, socketRef } = useGameSocket({
    worldId: worldSocketKey,
    sessionId: effectiveSessionId || 'pending',
    playerId: userId,
    username,
    character: character ?? {},
    // 세션 미정이면 connect 안 함 (picker 단계)
    enabled: ready && !!userId && !!effectiveSessionId,
    onScriptEvent: (msg) => {
      scriptEventRef.current?.(msg.objectId, msg.event, msg.data, msg.fromId);
    },
    onObjectStates: (states, fromId) => {
      objectStatesRef.current?.(states, fromId);
    },
    onObjectOwnership: (objectId, ownerId) => {
      objectOwnerRef.current?.(objectId, ownerId);
    },
    onObjSpawn: (spec) => {
      objSpawnRef.current?.(spec);
    },
    onObjDestroy: (objectId) => {
      objDestroyRef.current?.(objectId);
    },
    onSceneSnapshot: (objects) => {
      // 첫 스냅샷만 적용. 후속 스냅샷(예: 새 플레이어 입장 broadcast)은 무시 — 매번 새 array ref 로
      // customObjects 가 갈아엎혀 영상 mesh 자식 컴포넌트들이 reconcile 되며 iframe player 가 재생성됨
      // (영상 처음부터 + registry 핸들 잠깐 비어 리모컨 무반응). 동적 transform 은 별도 sendObjectStates
      // 채널로 처리되므로 첫 스냅샷만으로 콘텐츠 동기화 충분.
      setSceneFromHost(prev => prev ? prev : (objects as MapObject[]));
    },
  });

  // WorldCanvas 에 넘길 customObjects.
  // 호스트 스냅샷은 "라이브 위치(transform)"용 — videoUrl/재질/스크립트 같은 정적 콘텐츠는
  // API(저장) 데이터가 권위. 스냅샷으로 통째로 교체하면 오래된 스냅샷이 신선한 콘텐츠를 덮어써
  // (예: 나중에 추가한 YouTube videoUrl 이 다른 계정에 안 보임) → transform 만 합치고 콘텐츠는 API 우선.
  const effectiveCustomObjects = useMemo(() => {
    if (!sceneFromHost) return customObjects;
    if (!customObjects) return sceneFromHost;
    const apiById = new Map(customObjects.map(o => [o.id, o]));
    const sameTRS = (a: [number, number, number], b: [number, number, number]) =>
      a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
    const merged = sceneFromHost.map(snap => {
      const api = apiById.get(snap.id);
      if (!api) return snap;
      // transform 이 변하지 않았으면 **api 객체 ref 그대로** — 새 객체 만들면 React reconcile 시
      // 영상 mesh 자식(YouTube iframe) 의 useEffect 가 같은 dep 라도 props 변경으로 stale 폐기 →
      // iframe player 재생성 = 영상 처음부터 + registry 핸들 잠깐 비어 리모컨 먹통.
      if (sameTRS(api.position, snap.position) && sameTRS(api.rotation, snap.rotation) && sameTRS(api.scale, snap.scale)) {
        return api;
      }
      return { ...api, position: snap.position, rotation: snap.rotation, scale: snap.scale };
    });
    const snapIds = new Set(sceneFromHost.map(o => o.id));
    for (const o of customObjects) if (!snapIds.has(o.id)) merged.push(o);  // 스냅샷이 누락한 것 보강
    return merged;
  }, [sceneFromHost, customObjects]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatLog]);

  useEffect(() => {
    if (!chatOpen) return;
    const t = setTimeout(() => chatInputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [chatOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // ESC — 설정 모달 토글. 단 INPUT/TEXTAREA 포커스 중엔 (채팅 등) 무시.
      if (e.key === 'Escape') {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        // ESC 는 브라우저가 마우스 락도 자동 해제 — 두 동작 동시 발생 자연스러움
        setSettingsOpen(v => !v);
        return;
      }
      if (e.key !== 'Enter') return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      setChatOpen(true);
      setTimeout(() => chatInputRef.current?.focus(), 0);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const sync = () => setIsFullscreen(!!document.fullscreenElement);
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const activeCharId = character?.id ? String(character.id) : '';

  async function switchCharacter(id: string) {
    if (!id || id === activeCharId || switchingCharId) return;
    const token = session.getToken();
    if (!token) return;
    setSwitchingCharId(id);
    try {
      const res = await fetch(`${API}/api/characters/${encodeURIComponent(id)}/select`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const picked = myChars.find((c) => c.id === id);
      if (picked) setCharacter(picked as unknown as Record<string, unknown>);
      setMyChars((prev) => prev.map((c) => ({ ...c, isActive: c.id === id })));
    } finally {
      setSwitchingCharId('');
    }
  }

  /**
   * 맵 이동 트리거.
   * - 홈허브 (빈 id 또는 homeHubId 와 일치) → 바로 이동 (personal 모드라 세션 불필요)
   * - 그 외 → 그 월드의 세션 picker 를 띄움. 세션 고르면 풀 URL 로 navigate.
   */
  function moveWorld(nextId: string, nextName?: string) {
    const current = worldIdParam || '';
    if (nextId === current) return;
    // 빈 id 또는 명시적으로 홈허브 id 클릭한 경우 — picker 없이 바로 이동
    const isTargetHomeHub = !nextId || (!!homeHubId && nextId === homeHubId);
    if (isTargetHomeHub) {
      // /world (no id) → 페이지가 home-hub API 로 해석. 홈허브 = personal 모드 → sessionId=playerId 자동.
      window.location.assign(`/${locale}/world`);
      return;
    }
    // 그 외 맵 → 먼저 세션 picker 띄움 (현재 페이지에서)
    setPickerForWorld({ id: nextId, name: nextName || nextId });
    setMapModalOpen(false); // map browser 모달 닫기
  }

  // picker 가 보여줄 대상 월드 — 맵 카드의 "Move to Map" 클릭 시 set
  const [pickerForWorld, setPickerForWorld] = useState<{ id: string; name: string } | null>(null);

  function openMapBrowser() {
    setPortalPickMode(false); // 일반 맵 이동 모드
    setMapTab('public'); // 기본 탭 = 공개 (탐색 우선)
    setMapSearch('');
    setSelectedTag('');
    setMapSort('popular');
    setMapModalOpen(true);
  }

  /** 포탈 열기 — 맵 피커를 "포탈 모드"로 띄움. 맵 선택 시 캐릭터 앞에 포탈 생성. */
  function openPortalBrowser() {
    setMapTab('public');
    setMapSearch('');
    setSelectedTag('');
    setMapSort('popular');
    setMapModalOpen(true);
    setPortalPickMode(true);
  }

  /** 맵 피커에서 월드 선택 — 포탈 모드면 포탈 생성, 아니면 기존 맵 이동. */
  function handleWorldPick(w: HubWorld) {
    if (portalPickMode) {
      if (w.id === effectiveWorldId) return; // 현재 맵으로의 포탈은 의미 없음
      portalApiRef.current?.open(w.id, w.name);
      setOpenedPortal({ worldId: w.id, name: w.name });
      setPortalPickMode(false);
      setMapModalOpen(false);
    } else {
      moveWorld(w.id, w.name);
    }
  }

  /** 포탈에 걸어 들어감 — 그 월드로 이동 (전체 리로드, 목적지에서 세션 해석). */
  function enterPortal(worldId: string) {
    if (!worldId || worldId === effectiveWorldId || teleporting) return;
    setTeleporting(true);
    setOpenedPortal(null);
    window.location.assign(`/${locale}/world?id=${encodeURIComponent(worldId)}`);
  }

  function openCharacterBrowser() {
    const firstId = (myChars.find((c) => c.id === activeCharId)?.id || myChars[0]?.id || '');
    setPreviewCharId(firstId);
    setCharModalOpen(true);
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // ignore
    }
  }

  const currentWorldList = useMemo(() => {
    if (mapTab === 'mine') return myWorlds;
    if (mapTab === 'public') return publicWorlds;
    return [] as HubWorld[];
  }, [mapTab, myWorlds, publicWorlds]);

  const availableTags = useMemo(() => {
    const counts = new Map<string, number>();
    currentWorldList.forEach((w) => {
      (w.tags || []).forEach((tag) => {
        const key = tag.trim();
        if (!key) return;
        counts.set(key, (counts.get(key) || 0) + 1);
      });
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 24)
      .map(([tag]) => tag);
  }, [currentWorldList]);

  const filteredWorlds = useMemo(() => {
    const q = mapSearch.trim().toLowerCase();
    const list = currentWorldList.filter((w) => {
      if (selectedTag && !(w.tags || []).includes(selectedTag)) return false;
      if (!q) return true;
      const hay = `${w.name || ''} ${w.description || ''} ${w.ownerName || ''} ${(w.tags || []).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });

    list.sort((a, b) => {
      if (mapSort === 'popular') return (b.playCount || 0) - (a.playCount || 0);
      const at = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bt = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bt - at;
    });
    return list;
  }, [currentWorldList, mapSearch, selectedTag, mapSort]);

  const previewChar = useMemo(
    () => myChars.find((c) => c.id === previewCharId) || myChars.find((c) => c.id === activeCharId) || myChars[0] || null,
    [myChars, previewCharId, activeCharId],
  );

  const submitChat = (closeAfter = false) => {
    const msg = chatInput.trim();
    if (!msg) return;
    sendChat(msg);
    setChatInput('');
    if (closeAfter) {
      setChatOpen(false);
      chatInputRef.current?.blur();
    }
  };

  if (!ready) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#fff', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 40 }}>🎮</div>
        <div style={{ fontSize: 18, opacity: 0.7 }}>{t('loading')}</div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {showSessionPicker && (
        <SessionPicker
          worldId={effectiveWorldId!}
          worldName={worldName}
          maxPlayersDefault={worldMaxPlayers}
          onPick={(sid) => {
            // URL 갱신 + 풀 리로드. next-intl router 의 query string 갱신이 불완전해서
            // useSearchParams 가 안 바뀌는 케이스 있음 → location.assign 으로 확실히 reconnect.
            const url = new URL(window.location.href);
            url.searchParams.set('s', sid);
            window.location.assign(url.toString());
          }}
        />
      )}
      {/* 맵 이동 트리거 시 — 그 대상 월드의 세션 picker. 세션 선택 → 그 URL 로 풀 navigate */}
      {pickerForWorld && (
        <SessionPicker
          worldId={pickerForWorld.id}
          worldName={pickerForWorld.name}
          maxPlayersDefault={50}
          onClose={() => setPickerForWorld(null)}
          onPick={(sid) => {
            window.location.assign(`/${locale}/world?id=${encodeURIComponent(pickerForWorld.id)}&s=${encodeURIComponent(sid)}`);
          }}
        />
      )}
      <WorldCanvas
        key={worldSocketKey}
        worldId={effectiveWorldId ?? undefined}
        character={character ?? {}}
        playerId={userId}
        players={players}
        socketRef={socketRef}
        posesRef={posesRef}
        chatBubbles={chatBubbles}
        onMove={sendMove}
        customObjects={effectiveWorldId ? (effectiveCustomObjects ?? undefined) : undefined}
        sceneSettings={sceneSettings ?? undefined}
        graphics={graphics}
        chatInputActive={chatOpen}
        emoteSlot={emoteSlot}
        emoteOneShotOverride={Object.entries(emoteLoopMap).filter(([,v])=>!v).map(([k])=>k)}
        sendScriptEvent={sendScriptEvent}
        scriptEventRef={scriptEventRef}
        sendObjectStates={sendObjectStates}
        objectStatesRef={objectStatesRef}
        hostId={hostId}
        sendObjClaim={sendObjClaim}
        sendObjRelease={sendObjRelease}
        objectOwnerRef={objectOwnerRef}
        sendObjSpawn={sendObjSpawn}
        sendObjDestroy={sendObjDestroy}
        objSpawnRef={objSpawnRef}
        objDestroyRef={objDestroyRef}
        sendSceneRegister={sendSceneRegister}
        portalApiRef={portalApiRef}
        onPortalEnter={enterPortal}
        cameraMode={cameraMode}
        onCameraModeChange={changeCameraMode}
        firstPersonFov={fpFov}
      />

      {/* 우상단 단일 설정 버튼 — 클릭 또는 ESC 로 통합 모달 오픈 */}
      <button
        onClick={() => setSettingsOpen(v => !v)}
        title={t('settings')}
        style={{
          position: 'absolute', top: 16, right: 16, zIndex: 16777274,
          width: 40, height: 40, borderRadius: '50%',
          background: settingsOpen ? '#4f46e5' : 'rgba(0,0,0,0.45)',
          border: 'none', color: '#fff', fontSize: 18,
          cursor: 'pointer', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        ⚙️
      </button>

      <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.45)', borderRadius: 20, padding: '6px 16px', color: '#fff', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10, backdropFilter: 'blur(8px)', zIndex: 16777274 }}>
        <span style={{ color: connected ? '#4ade80' : '#f87171', fontSize: 9 }}>●</span>
        <span style={{ fontWeight: 700 }}>{t('alpWorld')}</span>
        <span style={{ opacity: 0.5 }}>|</span>
        <span style={{ opacity: 0.7 }}>{username}</span>
        {hostId === userId && <span style={{ color: '#fbbf24', fontWeight: 700 }}>👑 호스트</span>}
        {hostId && hostId !== userId && <span style={{ color: '#94a3b8', fontSize: 11 }}>(호스트: {players[hostId]?.username ?? '...'})</span>}
        <span style={{ opacity: 0.5 }}>|</span>
        <span style={{ opacity: 0.7 }}>{t('playersOnline', { count: Object.keys(players).length + 1 })}</span>
      </div>

      <div style={{ position: 'absolute', top: 60, left: 16, background: 'rgba(0,0,0,0.4)', borderRadius: 12, padding: '8px 12px', color: '#fff', fontSize: 12, backdropFilter: 'blur(6px)', minWidth: 120, zIndex: 16777274 }}>
        <div style={{ fontWeight: 700, marginBottom: 6, opacity: 0.7 }}>{t('playersList')}</div>
        <div style={{ color: '#4ade80' }}>● {username} {t('youSuffix')}</div>
        {Object.values(players).map((p) => (
          <div key={p.id} style={{ opacity: 0.8 }}>● {p.username}</div>
        ))}
      </div>

      {/* 통합 설정 모달 — 사이드바 탭으로 그룹화 (모던·심플). ESC 로 토글. */}
      {settingsOpen && (() => {
        const TABS = [
          { id: 'graphics', icon: '🎨', label: t('graphics') },
          { id: 'display',  icon: '🖥', label: t('display') },
          { id: 'hub',      icon: '🌐', label: t('hubControl') },
          { id: 'develop',  icon: '🛠', label: th('develop') },
        ] as const;
        const tabBtn = (active: boolean): React.CSSProperties => ({
          display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
          padding: '11px 14px', borderRadius: 10, border: 'none',
          background: active ? 'rgba(99,102,241,0.22)' : 'transparent',
          color: active ? '#fff' : 'rgba(255,255,255,0.65)',
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
          transition: 'background 0.12s',
        });
        const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 };
        const card: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14 };
        const actionBtn: React.CSSProperties = { width: '100%', textAlign: 'left', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#fff', borderRadius: 9, padding: '11px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 };
        return (
          <div
            onClick={() => setSettingsOpen(false)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(2,6,23,0.78)', backdropFilter: 'blur(8px)', zIndex: 16777276, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                width: 'min(760px, 96vw)', height: 'min(560px, 88vh)',
                background: '#0b1020', border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 16, color: '#fff', display: 'flex', flexDirection: 'column',
                boxShadow: '0 24px 60px rgba(0,0,0,0.55)',
                overflow: 'hidden',
              }}
            >
              {/* 헤더 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>⚙️ {t('settings')}</div>
                <button
                  onClick={() => setSettingsOpen(false)}
                  title="ESC"
                  style={{ border: 'none', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >×</button>
              </div>

              {/* 본문 — 사이드바 + 콘텐츠 */}
              <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
                {/* 사이드바 탭 */}
                <nav style={{ width: 180, padding: 12, borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                  {TABS.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setSettingsTab(tab.id)}
                      style={tabBtn(settingsTab === tab.id)}
                    >
                      <span style={{ fontSize: 16 }}>{tab.icon}</span>
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </nav>

                {/* 콘텐츠 */}
                <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto' }}>
                  {/* 🎨 그래픽 */}
                  {settingsTab === 'graphics' && (
                    <GraphicsPanel
                      settings={graphics}
                      updateSettings={updateGraphics}
                      applyPreset={applyGraphicsPreset}
                      mode="embedded"
                    />
                  )}

                  {/* 🖥 디스플레이 + 시점 */}
                  {settingsTab === 'display' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                      <div>
                        <div style={sectionTitle}>{t('display')}</div>
                        <button onClick={toggleFullscreen} style={actionBtn}>
                          ⛶ {isFullscreen ? t('exitFullscreen') : t('enterFullscreen')}
                        </button>
                      </div>

                      <div>
                        <div style={sectionTitle}>{t('viewMode')}</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {([['first', '👁', t('firstPerson')], ['third', '🎥', t('thirdPerson')]] as const).map(([m, icon, label]) => (
                            <button
                              key={m}
                              onClick={() => changeCameraMode(m)}
                              style={{
                                flex: 1, padding: '11px 12px', borderRadius: 10, cursor: 'pointer',
                                border: `1px solid ${cameraMode === m ? 'rgba(99,102,241,0.55)' : 'rgba(255,255,255,0.10)'}`,
                                background: cameraMode === m ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.03)',
                                color: '#fff', fontSize: 13, fontWeight: 600,
                              }}
                            >
                              {icon} {label}
                            </button>
                          ))}
                        </div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>{t('viewModeHint')}</div>
                      </div>

                      {/* FOV — 1인칭에서만 활성 */}
                      <div style={{ ...card, opacity: cameraMode === 'first' ? 1 : 0.5 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{t('fov')}</span>
                          <span style={{ fontSize: 13, color: '#a5b4fc', fontWeight: 700 }}>{fpFov}°</span>
                        </div>
                        <input type="range" min={50} max={110} step={1} value={fpFov}
                          onChange={(e) => changeFpFov(Number(e.target.value))}
                          disabled={cameraMode !== 'first'}
                          style={{ width: '100%', accentColor: '#6366f1' }} />
                        {cameraMode !== 'first' && (
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>{t('fovFirstOnly')}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 🌐 허브 */}
                  {settingsTab === 'hub' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div style={card}>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>{t('currentCharacter')}</div>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>{character?.name ? String(character.name) : t('unknownCharacter')}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button onClick={() => { setSettingsOpen(false); setReturnToSettings(true); openCharacterBrowser(); }} style={actionBtn}>
                          🧍 {t('changeCharacter')}
                        </button>
                        <button onClick={() => { setSettingsOpen(false); setReturnToSettings(true); openMapBrowser(); }} style={actionBtn}>
                          🗺 {t('moveMap')}
                        </button>
                        <button onClick={() => { setSettingsOpen(false); setReturnToSettings(true); openPortalBrowser(); }}
                          style={{ ...actionBtn, border: '1px solid rgba(34,211,238,0.4)', background: 'rgba(34,211,238,0.12)' }}>
                          🌀 {t('portalOpen')}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 🛠 개발 */}
                  {settingsTab === 'develop' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <button onClick={() => router.push('/assets')} style={actionBtn}>
                        📦 {th('inventory')}
                      </button>
                      <button onClick={() => router.push('/worlds')}
                        style={{ ...actionBtn, border: '1px solid rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.12)' }}>
                        🛠 {th('develop')}
                      </button>
                      <button onClick={() => { setSettingsOpen(false); setReturnToSettings(true); setCharManagerOpen(true); }} style={actionBtn}>
                        🧍 {t('manageCharacters')}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 푸터 힌트 */}
              <div style={{ padding: '10px 18px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'right' }}>
                ESC {t('escToToggle')}
              </div>
            </div>
          </div>
        );
      })()}

      {charManagerOpen && (
        <div
          onClick={closeCharManager}
          style={{ position: 'absolute', inset: 0, background: 'rgba(3,7,18,0.78)', backdropFilter: 'blur(8px)', zIndex: 16777276, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(1100px, 97vw)', height: 'min(900px, 92vh)', display: 'flex', flexDirection: 'column', borderRadius: 14, border: '1px solid rgba(255,255,255,0.16)', background: '#0b1220', color: '#fff', overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>🧍 {t('manageCharacters')}</div>
              <button onClick={closeCharManager} aria-label="Close" style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>✕</button>
            </div>
            <iframe
              src="/character"
              title={t('manageCharacters')}
              style={{ flex: 1, width: '100%', border: 'none', background: '#0b1220' }}
              // sandbox 안 줌 — 같은 origin 이라 fetch/localStorage 등 필요
            />
          </div>
        </div>
      )}

      {charModalOpen && (
        <div
          onClick={closeCharModal}
          style={{ position: 'absolute', inset: 0, background: 'rgba(3,7,18,0.72)', backdropFilter: 'blur(6px)', zIndex: 16777275, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(980px, 96vw)', maxHeight: '90vh', overflow: 'hidden', borderRadius: 14, border: '1px solid rgba(255,255,255,0.16)', background: 'linear-gradient(180deg, rgba(14,23,46,0.97) 0%, rgba(8,14,30,0.97) 100%)', color: '#fff' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{t('changeCharacter')}</div>
              <button
                onClick={closeCharModal}
                style={{ border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.06)', color: '#fff', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}
              >
                X
              </button>
            </div>

            <div style={{ padding: 16, overflowY: 'auto', maxHeight: 'calc(90vh - 80px)' }}>
              {previewChar && (
                <div style={{ border: '1px solid rgba(255,255,255,0.2)', borderRadius: 12, overflow: 'hidden', background: 'rgba(255,255,255,0.04)', marginBottom: 12 }}>
                  <div style={{ height: 180, background: 'linear-gradient(135deg, #1d4ed8 0%, #0f766e 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 56 }}>
                    🧍
                  </div>
                  <div style={{ padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>{previewChar.name}</div>
                      <div style={{ fontSize: 12, opacity: 0.72 }}>
                        {previewChar.id === activeCharId ? t('activeCharacter') : t('changeCharacter')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => switchCharacter(previewChar.id)}
                        disabled={!!switchingCharId || previewChar.id === activeCharId}
                        style={{ border: '1px solid rgba(255,255,255,0.2)', borderRadius: 9, padding: '9px 12px', cursor: (switchingCharId || previewChar.id === activeCharId) ? 'default' : 'pointer', background: previewChar.id === activeCharId ? 'rgba(255,255,255,0.12)' : 'rgba(16,185,129,0.28)', color: '#fff', fontSize: 12, fontWeight: 800 }}
                      >
                        {previewChar.id === activeCharId ? t('activeCharacter') : t('changeCharacter')}
                      </button>
                      <button
                        onClick={() => { setCharModalOpen(false); setCharManagerOpen(true); }}
                        style={{ border: '1px solid rgba(255,255,255,0.2)', borderRadius: 9, padding: '9px 12px', cursor: 'pointer', background: 'rgba(79,70,229,0.25)', color: '#fff', fontSize: 12, fontWeight: 800 }}
                      >
                        {t('manageCharacters')}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, maxHeight: 240, overflowY: 'auto', paddingRight: 2 }}>
                {myChars.map((ch) => (
                  <button
                    key={ch.id}
                    onClick={() => setPreviewCharId(ch.id)}
                    style={{ border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, overflow: 'hidden', background: previewChar?.id === ch.id ? 'rgba(79,70,229,0.4)' : 'rgba(255,255,255,0.06)', color: '#fff', textAlign: 'left', cursor: 'pointer', padding: 0 }}
                  >
                    <div style={{ height: 78, background: 'linear-gradient(135deg, #334155 0%, #111827 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>🧍</div>
                    <div style={{ padding: '8px 9px' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ch.name}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {mapModalOpen && (
        <div
          onClick={closeMapModal}
          style={{ position: 'absolute', inset: 0, background: 'rgba(3,7,18,0.72)', backdropFilter: 'blur(6px)', zIndex: 16777275, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(1100px, 96vw)', maxHeight: '90vh', overflow: 'hidden', borderRadius: 14, border: `1px solid ${portalPickMode ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.16)'}`, background: 'linear-gradient(180deg, rgba(14,23,46,0.97) 0%, rgba(8,14,30,0.97) 100%)', color: '#fff' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{portalPickMode ? `🌀 ${t('portalPickTitle')}` : t('moveMap')}</div>
              <button
                onClick={closeMapModal}
                style={{ border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.06)', color: '#fff', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}
              >
                X
              </button>
            </div>

            {/* 탭 — 공개 / 내가 만든 / 홈 */}
            <div style={{ display: 'flex', gap: 4, padding: '10px 16px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {([
                ['public', `🌐 ${tw('tabPublic')}`,    publicWorlds.length],
                ['mine',   `🛠 ${tw('tabMine')}`,      myWorlds.length],
                ['home',   `🏠 ${t('homeHubMap')}`,    null as number | null],
              ] as const).map(([key, label, count]) => (
                <button key={key} onClick={() => setMapTab(key as 'home' | 'mine' | 'public')} style={{
                  background: 'none', border: 'none', padding: '10px 14px', cursor: 'pointer',
                  color: mapTab === key ? '#fff' : 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: 700,
                  borderBottom: `2px solid ${mapTab === key ? '#818cf8' : 'transparent'}`, marginBottom: -1,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {label}
                  {count !== null && (
                    <span style={{ opacity: 0.5, fontSize: 11, background: 'rgba(255,255,255,0.08)', padding: '1px 7px', borderRadius: 10 }}>{count}</span>
                  )}
                </button>
              ))}
            </div>

            <div style={{ padding: 16, overflowY: 'auto', maxHeight: 'calc(90vh - 140px)' }}>
              {/* 홈 탭 — 단일 카드 */}
              {mapTab === 'home' && (
                <button
                  onClick={() => { moveWorld(''); setMapModalOpen(false); }}
                  style={{ width: '100%', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: 0, overflow: 'hidden', background: 'rgba(255,255,255,0.04)', cursor: 'pointer', color: '#fff', textAlign: 'left' }}
                >
                  <div style={{ height: 200, background: 'linear-gradient(135deg, #1d4ed8 0%, #0f766e 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64 }}>🏠</div>
                  <div style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{t('homeHubMap')}</div>
                    <div style={{ fontSize: 12, opacity: 0.6 }}>{t('homeHubHint')}</div>
                  </div>
                </button>
              )}

              {/* 공개/내가 만든 탭 — 검색/정렬/태그 + 그리드 */}
              {mapTab !== 'home' && (
                <>
                  {/* 검색바 + 정렬 */}
                  <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
                      <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 13, opacity: 0.5 }}>🔍</span>
                      <input
                        value={mapSearch}
                        onChange={(e) => setMapSearch(e.target.value)}
                        placeholder={tw('searchPlaceholder')}
                        style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '9px 12px 9px 36px', color: '#fff', fontSize: 13, outline: 'none' }}
                      />
                      {mapSearch && (
                        <button
                          onClick={() => setMapSearch('')}
                          style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(255,255,255,0.6)', borderRadius: 6, padding: '3px 7px', cursor: 'pointer', fontSize: 10 }}
                        >✕</button>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 3 }}>
                      <button
                        onClick={() => setMapSort('popular')}
                        style={{ padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', background: mapSort === 'popular' ? 'rgba(99,102,241,0.85)' : 'transparent', color: mapSort === 'popular' ? '#fff' : 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: 700 }}
                      >🔥 {tw('sortPopular')}</button>
                      <button
                        onClick={() => setMapSort('latest')}
                        style={{ padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', background: mapSort === 'latest' ? 'rgba(99,102,241,0.85)' : 'transparent', color: mapSort === 'latest' ? '#fff' : 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: 700 }}
                      >🕒 {tw('sortLatest')}</button>
                    </div>
                  </div>

                  {/* 활성 태그 표시 */}
                  {selectedTag && (
                    <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, opacity: 0.5 }}>{tw('filteringByTag')}</span>
                      <span style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', padding: '3px 11px', borderRadius: 999, fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        #{selectedTag}
                        <button onClick={() => setSelectedTag('')} style={{ background: 'rgba(255,255,255,0.25)', border: 'none', color: '#fff', borderRadius: 999, width: 16, height: 16, cursor: 'pointer', fontSize: 9, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                      </span>
                    </div>
                  )}

                  {/* 인기 태그 칩 */}
                  {!selectedTag && availableTags.length > 0 && (
                    <div style={{ marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      <span style={{ fontSize: 11, opacity: 0.45, alignSelf: 'center', marginRight: 4 }}>{tw('popularTags')}</span>
                      {availableTags.slice(0, 12).map((tag) => (
                        <button
                          key={tag}
                          onClick={() => setSelectedTag(tag)}
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)', padding: '3px 9px', borderRadius: 999, fontSize: 11, cursor: 'pointer' }}
                        >#{tag}</button>
                      ))}
                    </div>
                  )}

                  {/* 그리드 */}
                  {filteredWorlds.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 48, opacity: 0.4, fontSize: 13 }}>
                      {mapSearch || selectedTag ? tw('noMatches') : (mapTab === 'mine' ? tw('noMineLoggedIn') : tw('noPublic'))}
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
                      {filteredWorlds.map((w) => {
                        const isCurrent = worldIdParam === w.id;
                        return (
                          <div key={`${mapTab}-${w.id}`}
                            style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${isCurrent ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 12, overflow: 'hidden', transition: 'transform .15s, border-color .15s' }}
                            onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.borderColor = 'rgba(129,140,248,0.4)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                            onMouseLeave={(e) => { if (!isCurrent) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                          >
                            <button
                              onClick={() => handleWorldPick(w)}
                              style={{ display: 'block', width: '100%', aspectRatio: '16/9', position: 'relative', background: w.thumbnailUrl ? `url(${w.thumbnailUrl}) center/cover` : 'linear-gradient(135deg,#334155,#111827)', border: 'none', padding: 0, cursor: 'pointer' }}
                            >
                              {!w.thumbnailUrl && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, opacity: 0.5 }}>🌍</div>}
                              {isCurrent && (
                                <span style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(16,185,129,0.9)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4 }}>{tw('badgePublic')} · 현재</span>
                              )}
                              {(w.playCount ?? 0) > 0 && (
                                <span style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10, padding: '3px 8px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700 }}>
                                  ▶ {(w.playCount ?? 0).toLocaleString()}
                                </span>
                              )}
                            </button>
                            <div style={{ padding: '11px 12px' }}>
                              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.name}</div>
                              {w.ownerName && (
                                <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 6 }}>{tw('by')} <span style={{ color: 'rgba(255,255,255,0.7)' }}>{w.ownerName}</span></div>
                              )}
                              {!!(w.tags && w.tags.length > 0) && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                                  {w.tags.slice(0, 3).map((tag) => (
                                    <button key={`${w.id}-${tag}`} onClick={() => setSelectedTag(tag)}
                                      style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: '#a5b4fc', borderRadius: 999, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}
                                    >#{tag}</button>
                                  ))}
                                </div>
                              )}
                              <button
                                onClick={() => handleWorldPick(w)}
                                disabled={isCurrent}
                                style={{ width: '100%', padding: '7px 0', borderRadius: 7, border: 'none', cursor: isCurrent ? 'default' : 'pointer', fontSize: 12, fontWeight: 700, background: isCurrent ? 'rgba(255,255,255,0.08)' : (portalPickMode ? 'linear-gradient(135deg,#06b6d4,#3b82f6)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)'), color: isCurrent ? 'rgba(255,255,255,0.5)' : '#fff' }}
                              >
                                {isCurrent ? '✓ 현재 맵' : (portalPickMode ? `🌀 ${t('portalHere')}` : `▶ ${t('moveMap')}`)}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 이모트 패널 토글 버튼 */}
      {emoteSlots.length > 0 && (
        <button
          type="button"
          onClick={() => setEmotePanel(p => !p)}
          style={{
            position: 'absolute', bottom: 72, right: 16, zIndex: 16777274,
            width: 48, height: 48, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: emotePanel ? 'rgba(99,102,241,0.85)' : 'rgba(0,0,0,0.5)',
            color: '#fff', fontSize: 22, backdropFilter: 'blur(8px)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)', transition: 'background 0.15s',
          }}
          title="애니메이션"
        >
          🎭
        </button>
      )}

      {/* 이모트 패널 */}
      {emotePanel && emoteSlots.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 128, right: 16, zIndex: 16777274,
          background: 'rgba(10,10,20,0.85)', borderRadius: 14,
          padding: '10px 8px', backdropFilter: 'blur(12px)',
          display: 'flex', flexDirection: 'column', gap: 6,
          minWidth: 180, boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}>
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0 6px 4px' }}>
            커스텀 애니메이션 · 1~9 키
          </div>
          {emoteSlots.map((slot, idx) => {
            const active = emoteSlot === slot;
            const isLoop = emoteLoopMap[slot] !== false; // 기본값 루프
            const hotkey = idx < 9 ? String(idx + 1) : null;
            return (
              <div key={slot} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 2px' }}>
                {/* 재생/정지 버튼 */}
                <button
                  type="button"
                  onClick={() => setEmoteSlot(active ? null : slot)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', gap: 7,
                    background: active ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.07)',
                    border: active ? '1px solid #818cf8' : '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8, padding: '6px 8px', cursor: 'pointer', color: '#fff',
                    transition: 'background 0.12s', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 13 }}>{active ? '■' : '▶'}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{slot}</span>
                  {hotkey && <span style={{ fontSize: 10, opacity: 0.5, fontWeight: 700, padding: '1px 5px', background: 'rgba(255,255,255,0.08)', borderRadius: 4 }}>{hotkey}</span>}
                </button>
                {/* 루프/한번만 토글 */}
                <button
                  type="button"
                  onClick={() => setEmoteLoopMap(prev => ({ ...prev, [slot]: !isLoop }))}
                  title={isLoop ? '루프 (클릭하면 한번만)' : '한번만 (클릭하면 루프)'}
                  style={{
                    width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)',
                    background: isLoop ? 'rgba(52,211,153,0.2)' : 'rgba(251,191,36,0.2)',
                    color: isLoop ? '#34d399' : '#fbbf24', cursor: 'pointer', fontSize: 14,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    transition: 'background 0.12s',
                  }}
                >
                  {isLoop ? '🔁' : '1️⃣'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.35)', borderRadius: 10, padding: '5px 14px', color: 'rgba(255,255,255,0.6)', fontSize: 11, backdropFilter: 'blur(6px)', textAlign: 'center', pointerEvents: 'none' }}>
        {t('controlHint')}
      </div>

      {/* 빠른 포탈 열기 버튼 (우상단, 설정 기어 왼쪽) */}
      <button
        onClick={openPortalBrowser}
        title={t('portalOpen')}
        style={{
          position: 'absolute', top: 16, right: 64, zIndex: 16777274,
          width: 40, height: 40, borderRadius: '50%',
          background: 'rgba(34,211,238,0.18)', border: '1px solid rgba(34,211,238,0.5)',
          color: '#a5f3fc', fontSize: 18, cursor: 'pointer', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        🌀
      </button>

      {/* 열린 포탈 배너 (상단 중앙) */}
      {openedPortal && (
        <div style={{
          position: 'absolute', top: 96, left: '50%', transform: 'translateX(-50%)', zIndex: 16777274,
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px 8px 16px',
          background: 'rgba(8,15,30,0.85)', border: '1px solid rgba(34,211,238,0.55)',
          borderRadius: 999, color: '#a5f3fc', fontSize: 13, fontWeight: 700, backdropFilter: 'blur(10px)',
          boxShadow: '0 0 20px rgba(34,211,238,0.35)',
        }}>
          🌀 {t('portalOpenedHint', { name: openedPortal.name })}
          <button
            onClick={() => { portalApiRef.current?.close(); setOpenedPortal(null); }}
            style={{ border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff', borderRadius: 999, width: 24, height: 24, cursor: 'pointer', fontSize: 12, lineHeight: 1 }}
          >✕</button>
        </div>
      )}

      {/* 이동 중 오버레이 */}
      {teleporting && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 2000, background: 'rgba(2,6,23,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: '#a5f3fc' }}>
          <div style={{ fontSize: 48 }}>🌀</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{t('teleporting')}</div>
        </div>
      )}

      <style jsx global>{`
        @keyframes worldPreviewFadeIn {
          from { opacity: 0.45; transform: scale(1.01); }
          to   { opacity: 1;    transform: scale(1); }
        }
      `}</style>

      <div style={{ position: 'absolute', bottom: 24, right: 16, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 16777274 }}>
        {chatOpen && (
          <div style={{ background: 'rgba(0,0,0,0.5)', borderRadius: 12, padding: '8px 10px', width: 260, maxHeight: 200, overflowY: 'auto', backdropFilter: 'blur(8px)' }} ref={chatRef}>
            {chatLog.length === 0 && <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>{t('chatEmpty')}</div>}
            {chatLog.map((m, i) => (
              <div key={i} style={{ color: '#fff', fontSize: 12, marginBottom: 3 }}>
                <span style={{ fontWeight: 700, color: '#a5b4fc' }}>{m.username}</span>
                <span style={{ opacity: 0.85 }}> {m.message}</span>
              </div>
            ))}
          </div>
        )}

        {chatOpen && (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              ref={chatInputRef}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitChat(true); } }}
              placeholder={t('chatPlaceholder')}
              style={{ flex: 1, background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: 12, padding: '6px 10px', outline: 'none' }}
            />
            <button onClick={() => submitChat()} style={{ background: '#4f46e5', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 12, padding: '6px 12px', cursor: 'pointer' }}>
              {t('send')}
            </button>
          </div>
        )}

        <button
          onClick={() => setChatOpen((v) => !v)}
          style={{ alignSelf: 'flex-end', background: chatOpen ? '#4f46e5' : 'rgba(0,0,0,0.45)', border: 'none', borderRadius: '50%', width: 44, height: 44, color: '#fff', fontSize: 20, cursor: 'pointer', backdropFilter: 'blur(6px)' }}
        >
          💬
        </button>
      </div>
    </div>
  );
}
