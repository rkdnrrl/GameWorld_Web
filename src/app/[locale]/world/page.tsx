'use client';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useGameSocket } from '@/lib/world/useGameSocket';
import { useGraphicsSettings } from '@/lib/world/graphicsSettings';
import { session } from '@/lib/api';

const WorldCanvas = dynamic(() => import('@/components/world/WorldCanvas'), { ssr: false });
const GraphicsPanel = dynamic(() => import('@/components/world/GraphicsPanel'), { ssr: false });

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const worldIdParam = searchParams.get('id');
  const worldSocketKey = worldIdParam ? `world:${worldIdParam}` : 'home:default';
  const API = process.env.NEXT_PUBLIC_API_URL || 'https://airliveplay.com';

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

  const [hubOpen, setHubOpen] = useState(false);
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [charModalOpen, setCharModalOpen] = useState(false);
  const [mapTab, setMapTab] = useState<'home' | 'mine' | 'public'>('home');
  const [mapSearch, setMapSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [mapSort, setMapSort] = useState<'popular' | 'latest'>('popular');
  const [previewWorldKey, setPreviewWorldKey] = useState('');
  const [previewCharId, setPreviewCharId] = useState('');
  const [switchingCharId, setSwitchingCharId] = useState('');
  const [myChars, setMyChars] = useState<MyCharacter[]>([]);
  const [myWorlds, setMyWorlds] = useState<HubWorld[]>([]);
  const [publicWorlds, setPublicWorlds] = useState<HubWorld[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // 이모트 (커스텀 애니메이션 슬롯 트리거)
  const [emoteSlot, setEmoteSlot] = useState<string | null>(null);
  const [emotePanel, setEmotePanel] = useState(false);
  const [emoteLoopMap, setEmoteLoopMap] = useState<Record<string, boolean>>({}); // true=루프, false=한번만
  const [platformEmoteSlots, setPlatformEmoteSlots] = useState<string[]>([]);
  const CORE_ANIM_SLOTS = useMemo(() => new Set(['idle', 'walk', 'run', 'jump', 'fall', 'crouch', 'crouch_walk', 'prone', 'prone_move']), []);

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

  useEffect(() => {
    async function load() {
      const token = session.getToken();
      if (!token) {
        router.replace('/');
        return;
      }

      try {
        const [meRes, charRes] = await Promise.all([
          fetch(`${API}/api/me`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API}/api/characters/me`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        if (!meRes.ok) {
          router.replace('/');
          return;
        }
        const { id, nickname } = await meRes.json();
        setUserId(id);
        setUsername(nickname || 'player');

        if (!charRes.ok) {
          router.replace('/character');
          return;
        }
        const { character: activeChar } = await charRes.json();
        if (!activeChar) {
          router.replace('/character');
          return;
        }

        setCharacter(activeChar);
        setMyChars([activeChar]);
        setReady(true);
      } catch {
        router.replace('/');
      }
    }
    load();
  }, [API, router]);

  useEffect(() => {
    if (!worldIdParam) {
      setCustomObjects(null);
      return;
    }
    setCustomObjects(null);
    const tok = session.getToken();
    const headers: Record<string, string> = tok ? { Authorization: `Bearer ${tok}` } : {};
    fetch(`${API}/api/worlds/${worldIdParam}`, { headers })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`world fetch failed: ${r.status}`))))
      .then((d) => {
        if (!d.world) {
          setCustomObjects([]);
          return;
        }
        setCustomObjects(Array.isArray(d.world.mapData?.objects) ? d.world.mapData.objects : []);
        setSceneSettings(d.world.mapData?.sceneSettings ?? null);
      })
      .catch(() => {
        // stale map object carry-over 방지
        setCustomObjects([]);
      });
  }, [API, worldIdParam]);

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

  const { players, posesRef, chatLog, chatBubbles, connected, sendMove, sendChat, sendScriptEvent, sendObjectStates, sendObjClaim, sendObjRelease, sendObjSpawn, sendObjDestroy, hostId } = useGameSocket({
    worldId: worldSocketKey,
    playerId: userId,
    username,
    character: character ?? {},
    enabled: ready && !!userId,
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
  });

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

  function moveWorld(nextId: string) {
    const current = worldIdParam || '';
    if (nextId === current) return;
    if (!nextId) router.replace('/world');
    else router.replace(`/world?id=${encodeURIComponent(nextId)}`);
  }

  function openMapBrowser() {
    setMapTab('home');
    setMapSearch('');
    setSelectedTag('');
    setMapSort('popular');
    setPreviewWorldKey('__home__');
    setMapModalOpen(true);
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

  const previewCandidates = useMemo(() => {
    if (mapTab === 'home') {
      return [{
        id: '__home__',
        worldId: '',
        name: t('homeHubMap'),
        description: '',
        thumbnailUrl: null as string | null,
        ownerName: username || '-',
        playCount: 0,
        tags: [] as string[],
      }];
    }
    return filteredWorlds.map((w) => ({
      id: `world-${w.id}`,
      worldId: w.id,
      name: w.name,
      description: w.description || '',
      thumbnailUrl: w.thumbnailUrl || null,
      ownerName: w.ownerName || '-',
      playCount: w.playCount || 0,
      tags: w.tags || [],
    }));
  }, [mapTab, filteredWorlds, t, username]);

  const previewWorld = useMemo(
    () => previewCandidates.find((c) => c.id === previewWorldKey) || previewCandidates[0] || null,
    [previewCandidates, previewWorldKey],
  );
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
      <WorldCanvas
        key={worldSocketKey}
        character={character ?? {}}
        playerId={userId}
        players={players}
        posesRef={posesRef}
        chatBubbles={chatBubbles}
        onMove={sendMove}
        customObjects={worldIdParam ? (customObjects ?? undefined) : undefined}
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
      />

      <GraphicsPanel settings={graphics} updateSettings={updateGraphics} applyPreset={applyGraphicsPreset} />

      <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.45)', borderRadius: 20, padding: '6px 16px', color: '#fff', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10, backdropFilter: 'blur(8px)', zIndex: 1000 }}>
        <span style={{ color: connected ? '#4ade80' : '#f87171', fontSize: 9 }}>●</span>
        <span style={{ fontWeight: 700 }}>{t('alpWorld')}</span>
        <span style={{ opacity: 0.5 }}>|</span>
        <span style={{ opacity: 0.7 }}>{username}</span>
        {hostId === userId && <span style={{ color: '#fbbf24', fontWeight: 700 }}>👑 호스트</span>}
        {hostId && hostId !== userId && <span style={{ color: '#94a3b8', fontSize: 11 }}>(호스트: {players[hostId]?.username ?? '...'})</span>}
        <span style={{ opacity: 0.5 }}>|</span>
        <span style={{ opacity: 0.7 }}>{t('playersOnline', { count: Object.keys(players).length + 1 })}</span>
      </div>

      <div style={{ position: 'absolute', top: 60, left: 16, background: 'rgba(0,0,0,0.4)', borderRadius: 12, padding: '8px 12px', color: '#fff', fontSize: 12, backdropFilter: 'blur(6px)', minWidth: 120, zIndex: 1000 }}>
        <div style={{ fontWeight: 700, marginBottom: 6, opacity: 0.7 }}>{t('playersList')}</div>
        <div style={{ color: '#4ade80' }}>● {username} {t('youSuffix')}</div>
        {Object.values(players).map((p) => (
          <div key={p.id} style={{ opacity: 0.8 }}>● {p.username}</div>
        ))}
      </div>

      <div style={{ position: 'absolute', top: 60, right: 16, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 1000 }}>
        <button
          onClick={toggleFullscreen}
          style={{ alignSelf: 'flex-end', border: 'none', cursor: 'pointer', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 700, background: 'rgba(0,0,0,0.45)', color: '#fff', backdropFilter: 'blur(6px)' }}
        >
          {isFullscreen ? t('exitFullscreen') : t('enterFullscreen')}
        </button>
        <button
          onClick={() => setHubOpen((v) => !v)}
          style={{ alignSelf: 'flex-end', border: 'none', cursor: 'pointer', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 700, background: hubOpen ? '#4f46e5' : 'rgba(0,0,0,0.45)', color: '#fff', backdropFilter: 'blur(6px)' }}
        >
          {t('hubControl')}
        </button>

        {hubOpen && (
          <div style={{ width: 320, maxHeight: '65vh', overflowY: 'auto', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: 10, backdropFilter: 'blur(8px)' }}>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginBottom: 6 }}>{t('currentCharacter')}</div>
            <div style={{ color: '#fff', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{(character?.name ? String(character.name) : t('unknownCharacter'))}</div>

            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginBottom: 6 }}>{t('changeCharacter')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              <button
                onClick={openCharacterBrowser}
                style={{ border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '8px 10px', textAlign: 'left', cursor: 'pointer', background: 'rgba(79,70,229,0.25)', color: '#fff', fontSize: 12, fontWeight: 700 }}
              >
                {t('changeCharacter')}
              </button>
            </div>

            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginBottom: 6 }}>{t('moveMap')}</div>
            <button
              onClick={openMapBrowser}
              style={{ width: '100%', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '8px 10px', textAlign: 'left', cursor: 'pointer', background: 'rgba(79,70,229,0.25)', color: '#fff', fontSize: 12, fontWeight: 700 }}
            >
              {t('moveMap')}
            </button>

            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 12, marginBottom: 6 }}>{th('develop')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <button
                onClick={() => router.push('/assets')}
                style={{ border: '1px solid rgba(255,255,255,0.18)', borderRadius: 8, padding: '7px 9px', textAlign: 'left', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 12, fontWeight: 700 }}
              >
                📦 {th('inventory')}
              </button>
              <button
                onClick={() => router.push('/worlds')}
                style={{ border: '1px solid rgba(255,255,255,0.18)', borderRadius: 8, padding: '7px 9px', textAlign: 'left', cursor: 'pointer', background: 'rgba(16,185,129,0.2)', color: '#fff', fontSize: 12, fontWeight: 700 }}
              >
                🛠 {th('develop')}
              </button>
              <button
                onClick={() => router.push('/character')}
                style={{ border: '1px solid rgba(255,255,255,0.18)', borderRadius: 8, padding: '7px 9px', textAlign: 'left', cursor: 'pointer', background: 'rgba(79,70,229,0.2)', color: '#fff', fontSize: 12, fontWeight: 700, gridColumn: '1 / -1' }}
              >
                🧍 {t('manageCharacters')}
              </button>
            </div>
          </div>
        )}
      </div>

      {charModalOpen && (
        <div
          onClick={() => setCharModalOpen(false)}
          style={{ position: 'absolute', inset: 0, background: 'rgba(3,7,18,0.72)', backdropFilter: 'blur(6px)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(980px, 96vw)', maxHeight: '90vh', overflow: 'hidden', borderRadius: 14, border: '1px solid rgba(255,255,255,0.16)', background: 'linear-gradient(180deg, rgba(14,23,46,0.97) 0%, rgba(8,14,30,0.97) 100%)', color: '#fff' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{t('changeCharacter')}</div>
              <button
                onClick={() => setCharModalOpen(false)}
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
                        onClick={() => router.push('/character')}
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
          onClick={() => setMapModalOpen(false)}
          style={{ position: 'absolute', inset: 0, background: 'rgba(3,7,18,0.72)', backdropFilter: 'blur(6px)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(1100px, 96vw)', maxHeight: '90vh', overflow: 'hidden', borderRadius: 14, border: '1px solid rgba(255,255,255,0.16)', background: 'linear-gradient(180deg, rgba(14,23,46,0.97) 0%, rgba(8,14,30,0.97) 100%)', color: '#fff' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{t('moveMap')}</div>
              <button
                onClick={() => setMapModalOpen(false)}
                style={{ border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.06)', color: '#fff', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}
              >
                X
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <button onClick={() => setMapTab('home')} style={{ border: '1px solid rgba(255,255,255,0.15)', borderRadius: 999, padding: '6px 12px', cursor: 'pointer', background: mapTab === 'home' ? 'rgba(79,70,229,0.45)' : 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 12, fontWeight: 700 }}>
                {t('homeHubMap')}
              </button>
              <button onClick={() => setMapTab('mine')} style={{ border: '1px solid rgba(255,255,255,0.15)', borderRadius: 999, padding: '6px 12px', cursor: 'pointer', background: mapTab === 'mine' ? 'rgba(79,70,229,0.45)' : 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 12, fontWeight: 700 }}>
                {t('changeCharacter')}
              </button>
              <button onClick={() => setMapTab('public')} style={{ border: '1px solid rgba(255,255,255,0.15)', borderRadius: 999, padding: '6px 12px', cursor: 'pointer', background: mapTab === 'public' ? 'rgba(79,70,229,0.45)' : 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 12, fontWeight: 700 }}>
                {t('playersList')}
              </button>
            </div>

            <div style={{ padding: 16, overflowY: 'auto', maxHeight: 'calc(90vh - 130px)' }}>
              {mapTab !== 'home' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setMapSort('popular')}
                      style={{ border: '1px solid rgba(255,255,255,0.2)', borderRadius: 999, padding: '5px 10px', cursor: 'pointer', background: mapSort === 'popular' ? 'rgba(79,70,229,0.45)' : 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 12, fontWeight: 700 }}
                    >
                      🔥 {tg('sortPopular')}
                    </button>
                    <button
                      onClick={() => setMapSort('latest')}
                      style={{ border: '1px solid rgba(255,255,255,0.2)', borderRadius: 999, padding: '5px 10px', cursor: 'pointer', background: mapSort === 'latest' ? 'rgba(79,70,229,0.45)' : 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 12, fontWeight: 700 }}
                    >
                      🕒
                    </button>
                  </div>
                  <input
                    value={mapSearch}
                    onChange={(e) => setMapSearch(e.target.value)}
                    placeholder={tc('search')}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 9, color: '#fff', fontSize: 13, padding: '8px 10px', outline: 'none' }}
                  />
                  {availableTags.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => setSelectedTag('')}
                        style={{ border: '1px solid rgba(255,255,255,0.2)', borderRadius: 999, padding: '5px 10px', cursor: 'pointer', background: selectedTag ? 'rgba(255,255,255,0.05)' : 'rgba(79,70,229,0.45)', color: '#fff', fontSize: 12, fontWeight: 700 }}
                      >
                        {tc('reset')}
                      </button>
                      {availableTags.map((tag) => (
                        <button
                          key={tag}
                          onClick={() => setSelectedTag((prev) => (prev === tag ? '' : tag))}
                          style={{ border: '1px solid rgba(255,255,255,0.2)', borderRadius: 999, padding: '5px 10px', cursor: 'pointer', background: selectedTag === tag ? 'rgba(16,185,129,0.35)' : 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 12, fontWeight: 700 }}
                        >
                          #{tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {previewWorld && (
                <div style={{ border: '1px solid rgba(255,255,255,0.22)', borderRadius: 12, overflow: 'hidden', background: 'rgba(255,255,255,0.04)', marginBottom: 12 }}>
                  <div
                    key={`preview-hero-${previewWorld.id}`}
                    style={{
                      height: 220,
                      background: previewWorld.thumbnailUrl
                        ? `url(${previewWorld.thumbnailUrl}) center/cover`
                        : 'linear-gradient(135deg, #1d4ed8 0%, #0f766e 100%)',
                      animation: 'worldPreviewFadeIn 220ms ease',
                    }}
                  />
                  <div style={{ padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 18, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{previewWorld.name}</div>
                        {!!previewWorld.description && <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>{previewWorld.description}</div>}
                        <div style={{ fontSize: 11, opacity: 0.65, marginTop: 6 }}>
                          {previewWorld.ownerName} · {previewWorld.playCount}
                        </div>
                      </div>
                      <button
                        onClick={() => { moveWorld(previewWorld.worldId); setMapModalOpen(false); }}
                        style={{ border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', background: 'rgba(16,185,129,0.28)', color: '#fff', fontSize: 13, fontWeight: 800, flexShrink: 0 }}
                      >
                        {t('moveMap')}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, maxHeight: 210, overflowY: 'auto', paddingRight: 2 }}>
                {previewCandidates.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => setPreviewWorldKey(w.id)}
                    style={{ border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: 0, overflow: 'hidden', background: previewWorldKey === w.id ? 'rgba(79,70,229,0.4)' : 'rgba(255,255,255,0.06)', cursor: 'pointer', color: '#fff', textAlign: 'left', transition: 'transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
                      e.currentTarget.style.borderColor = 'rgba(99,102,241,0.85)';
                      e.currentTarget.style.boxShadow = '0 10px 20px rgba(37,99,235,0.28)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0) scale(1)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div style={{ height: 84, backgroundImage: w.thumbnailUrl ? `url(${w.thumbnailUrl})` : 'linear-gradient(135deg, #334155 0%, #111827 100%)', backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
                      {((w.worldId || '') === (worldIdParam || '') || (w.worldId === '' && !worldIdParam)) && (
                        <div style={{ position: 'absolute', top: 6, right: 6, padding: '2px 6px', borderRadius: 999, background: 'rgba(16,185,129,0.9)', color: '#fff', fontSize: 10, fontWeight: 800 }}>
                          {t('activeCharacter')}
                        </div>
                      )}
                    </div>
                    <div style={{ padding: '8px 9px' }}>
                      <div style={{ fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.name}</div>
                    </div>
                  </button>
                ))}
              </div>

              <div style={{ display: 'none', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                {mapTab === 'home' && (
                  <button
                    onClick={() => { moveWorld(''); setMapModalOpen(false); }}
                    style={{ border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: 0, overflow: 'hidden', background: !worldIdParam ? 'rgba(16,185,129,0.22)' : 'rgba(255,255,255,0.06)', cursor: 'pointer', color: '#fff', textAlign: 'left' }}
                  >
                    <div style={{ height: 120, background: 'linear-gradient(135deg, #1d4ed8 0%, #0f766e 100%)' }} />
                    <div style={{ padding: 10 }}>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>{t('homeHubMap')}</div>
                    </div>
                  </button>
                )}

                {filteredWorlds.map((w) => (
                  <button
                    key={`${mapTab}-${w.id}`}
                    onClick={() => { moveWorld(w.id); setMapModalOpen(false); }}
                    style={{ border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: 0, overflow: 'hidden', background: worldIdParam === w.id ? 'rgba(16,185,129,0.22)' : 'rgba(255,255,255,0.06)', cursor: 'pointer', color: '#fff', textAlign: 'left' }}
                  >
                    <div style={{ height: 120, backgroundImage: w.thumbnailUrl ? `url(${w.thumbnailUrl})` : 'linear-gradient(135deg, #334155 0%, #111827 100%)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
                    <div style={{ padding: 10 }}>
                      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>{w.name}</div>
                      {!!w.description && <div style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.35, marginBottom: 6 }}>{w.description}</div>}
                      {!!(w.tags && w.tags.length > 0) && (
                        <div style={{ marginTop: 6, marginBottom: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {w.tags.slice(0, 3).map((tag) => (
                            <span key={`${w.id}-${tag}`} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999, background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.9)' }}>
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div style={{ fontSize: 11, opacity: 0.65 }}>
                        {(w.ownerName || '-')} · {(w.playCount ?? 0)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
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
            position: 'absolute', bottom: 72, right: 16, zIndex: 1000,
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
          position: 'absolute', bottom: 128, right: 16, zIndex: 1000,
          background: 'rgba(10,10,20,0.85)', borderRadius: 14,
          padding: '10px 8px', backdropFilter: 'blur(12px)',
          display: 'flex', flexDirection: 'column', gap: 6,
          minWidth: 180, boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}>
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0 6px 4px' }}>
            커스텀 애니메이션
          </div>
          {emoteSlots.map(slot => {
            const active = emoteSlot === slot;
            const isLoop = emoteLoopMap[slot] !== false; // 기본값 루프
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

      <style jsx global>{`
        @keyframes worldPreviewFadeIn {
          from { opacity: 0.45; transform: scale(1.01); }
          to   { opacity: 1;    transform: scale(1); }
        }
      `}</style>

      <div style={{ position: 'absolute', bottom: 24, right: 16, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 1000 }}>
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
