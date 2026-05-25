'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
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
}

export default function WorldPage() {
  const t = useTranslations('World');
  const router = useRouter();
  const searchParams = useSearchParams();
  const worldIdParam = searchParams.get('id');
  const API = process.env.NEXT_PUBLIC_API_URL || 'https://airliveplay.com';

  const [character, setCharacter] = useState<Record<string, unknown> | null>(null);
  const [userId, setUserId] = useState('');
  const [username, setUsername] = useState('');
  const [ready, setReady] = useState(false);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [customObjects, setCustomObjects] = useState<MapObject[] | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  const [hubOpen, setHubOpen] = useState(false);
  const [switchingCharId, setSwitchingCharId] = useState('');
  const [myChars, setMyChars] = useState<MyCharacter[]>([]);
  const [myWorlds, setMyWorlds] = useState<HubWorld[]>([]);
  const [publicWorlds, setPublicWorlds] = useState<HubWorld[]>([]);

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
    if (!worldIdParam) return;
    const tok = session.getToken();
    const headers: Record<string, string> = tok ? { Authorization: `Bearer ${tok}` } : {};
    fetch(`${API}/api/worlds/${worldIdParam}`, { headers })
      .then((r) => r.json())
      .then((d) => {
        if (d.world) setCustomObjects(d.world.mapData?.objects || []);
      })
      .catch(() => {});
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
        if (chars.length > 0) setMyChars(chars);
        setMyWorlds(mine);
        setPublicWorlds(pub);
      });
  }, [API, ready]);

  const { settings: graphics, updateSettings: updateGraphics, applyPreset: applyGraphicsPreset } = useGraphicsSettings();
  const { players, posesRef, chatLog, connected, sendMove, sendChat } = useGameSocket({
    worldId: worldIdParam || 'default',
    playerId: userId,
    username,
    character: character ?? {},
    enabled: ready && !!userId,
  });

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatLog]);

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

  const submitChat = () => {
    const msg = chatInput.trim();
    if (!msg) return;
    sendChat(msg);
    setChatInput('');
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
        character={character ?? {}}
        players={players}
        posesRef={posesRef}
        onMove={sendMove}
        customObjects={worldIdParam ? (customObjects ?? undefined) : undefined}
        graphics={graphics}
      />

      <GraphicsPanel settings={graphics} updateSettings={updateGraphics} applyPreset={applyGraphicsPreset} />

      <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.45)', borderRadius: 20, padding: '6px 16px', color: '#fff', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10, backdropFilter: 'blur(8px)' }}>
        <span style={{ color: connected ? '#4ade80' : '#f87171', fontSize: 9 }}>●</span>
        <span style={{ fontWeight: 700 }}>{t('alpWorld')}</span>
        <span style={{ opacity: 0.5 }}>|</span>
        <span style={{ opacity: 0.7 }}>{username}</span>
        <span style={{ opacity: 0.5 }}>|</span>
        <span style={{ opacity: 0.7 }}>{t('playersOnline', { count: Object.keys(players).length + 1 })}</span>
      </div>

      <div style={{ position: 'absolute', top: 60, left: 16, background: 'rgba(0,0,0,0.4)', borderRadius: 12, padding: '8px 12px', color: '#fff', fontSize: 12, backdropFilter: 'blur(6px)', minWidth: 120 }}>
        <div style={{ fontWeight: 700, marginBottom: 6, opacity: 0.7 }}>{t('playersList')}</div>
        <div style={{ color: '#4ade80' }}>● {username} {t('youSuffix')}</div>
        {Object.values(players).map((p) => (
          <div key={p.id} style={{ opacity: 0.8 }}>● {p.username}</div>
        ))}
      </div>

      <div style={{ position: 'absolute', top: 60, right: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
              {myChars.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => switchCharacter(ch.id)}
                  disabled={!!switchingCharId}
                  style={{ border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '7px 10px', textAlign: 'left', cursor: switchingCharId ? 'default' : 'pointer', background: ch.id === activeCharId ? 'rgba(79,70,229,0.35)' : 'rgba(255,255,255,0.07)', color: '#fff', fontSize: 12, fontWeight: 600 }}
                >
                  {ch.name} {ch.id === activeCharId ? `(${t('activeCharacter')})` : ''}
                </button>
              ))}
              <button
                onClick={() => router.push('/character')}
                style={{ border: '1px dashed rgba(255,255,255,0.3)', borderRadius: 8, padding: '7px 10px', textAlign: 'left', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: 600 }}
              >
                {t('manageCharacters')}
              </button>
            </div>

            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginBottom: 6 }}>{t('moveMap')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                onClick={() => moveWorld('')}
                style={{ border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '7px 10px', textAlign: 'left', cursor: 'pointer', background: !worldIdParam ? 'rgba(16,185,129,0.22)' : 'rgba(255,255,255,0.07)', color: '#fff', fontSize: 12, fontWeight: 600 }}
              >
                {t('homeHubMap')}
              </button>
              {myWorlds.map((w) => (
                <button
                  key={`my-${w.id}`}
                  onClick={() => moveWorld(w.id)}
                  style={{ border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '7px 10px', textAlign: 'left', cursor: 'pointer', background: worldIdParam === w.id ? 'rgba(16,185,129,0.22)' : 'rgba(255,255,255,0.07)', color: '#fff', fontSize: 12, fontWeight: 600 }}
                >
                  {w.name}
                </button>
              ))}
              {publicWorlds.slice(0, 20).map((w) => (
                <button
                  key={`pub-${w.id}`}
                  onClick={() => moveWorld(w.id)}
                  style={{ border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '7px 10px', textAlign: 'left', cursor: 'pointer', background: worldIdParam === w.id ? 'rgba(16,185,129,0.22)' : 'rgba(255,255,255,0.07)', color: '#fff', fontSize: 12, fontWeight: 600 }}
                >
                  {w.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.35)', borderRadius: 10, padding: '5px 14px', color: 'rgba(255,255,255,0.6)', fontSize: 11, backdropFilter: 'blur(6px)', textAlign: 'center', pointerEvents: 'none' }}>
        {t('controlHint')}
      </div>

      <div style={{ position: 'absolute', bottom: 24, right: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
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
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitChat(); } }}
              placeholder={t('chatPlaceholder')}
              style={{ flex: 1, background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: 12, padding: '6px 10px', outline: 'none' }}
            />
            <button onClick={submitChat} style={{ background: '#4f46e5', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 12, padding: '6px 12px', cursor: 'pointer' }}>
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
