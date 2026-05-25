'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useGameSocket } from '@/lib/world/useGameSocket';
import { session } from '@/lib/api';

const WorldCanvas = dynamic(() => import('@/components/world/WorldCanvas'), { ssr: false });

interface MapObject {
  id: string;
  kind: 'cube' | 'sphere' | 'cylinder' | 'plane' | 'asset';
  assetUrl?: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
}

export default function WorldPage() {
  const t = useTranslations('World');
  const router = useRouter();
  const searchParams = useSearchParams();
  const worldIdParam = searchParams.get('id');
  const [character, setCharacter] = useState<Record<string, unknown> | null>(null);
  const [userId, setUserId]       = useState('');
  const [username, setUsername]   = useState('');
  const [ready, setReady]         = useState(false);
  const [chatOpen, setChatOpen]   = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [customObjects, setCustomObjects] = useState<MapObject[] | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  const API = process.env.NEXT_PUBLIC_API_URL || 'https://airliveplay.com';

  /* 유저 + 캐릭터 로드 */
  useEffect(() => {
    async function load() {
      const token = session.getToken();
      if (!token) { router.replace('/'); return; }

      try {
        const [meRes, charRes] = await Promise.all([
          fetch(`${API}/api/me`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API}/api/characters/me`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        if (!meRes.ok) { router.replace('/'); return; }
        const { id, nickname } = await meRes.json();
        setUserId(id);
        setUsername(nickname || '익명');

        if (charRes.ok) {
          const { character: char } = await charRes.json();
          if (char) {
            setCharacter(char);
            setReady(true);
          } else {
            // 캐릭터 없음 → 생성 페이지로
            router.replace('/character');
          }
        } else {
          router.replace('/character');
        }
      } catch {
        router.replace('/');
      }
    }
    load();
  }, [API, router]);

  /* 유저 제작 월드 로드 (비공개 월드는 본인 토큰 필요) */
  useEffect(() => {
    if (!worldIdParam) return;
    const tok = session.getToken();
    const headers: Record<string, string> = tok ? { Authorization: `Bearer ${tok}` } : {};
    fetch(`${API}/api/worlds/${worldIdParam}`, { headers })
      .then(r => r.json())
      .then(d => {
        if (d.world) setCustomObjects(d.world.mapData?.objects || []);
        else console.warn('[world] 로드 실패:', d.error?.message);
      })
      .catch((e) => console.warn('[world] 네트워크 오류:', e));
  }, [API, worldIdParam]);

  const { players, posesRef, chatLog, connected, sendMove, sendChat } = useGameSocket({
    worldId:   worldIdParam || 'default',
    playerId:  userId,
    username,
    character: character ?? {},
    enabled:   ready && !!userId,
  });

  /* 채팅 자동 스크롤 */
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatLog]);

  const submitChat = () => {
    const msg = chatInput.trim();
    if (!msg) return;
    sendChat(msg);
    setChatInput('');
  };

  if (!ready) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#fff', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 40 }}>🌍</div>
        <div style={{ fontSize: 18, opacity: 0.7 }}>{t('loading')}</div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Three.js 캔버스 */}
      <WorldCanvas
        character={character ?? {}}
        players={players}
        posesRef={posesRef}
        onMove={sendMove}
        customObjects={customObjects ?? undefined}
      />

      {/* HUD — 상단 */}
      <div style={{
        position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.45)', borderRadius: 20, padding: '6px 16px',
        color: '#fff', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10,
        backdropFilter: 'blur(8px)',
      }}>
        <span style={{ color: connected ? '#4ade80' : '#f87171', fontSize: 9 }}>●</span>
        <span style={{ fontWeight: 700 }}>{t('alpWorld')}</span>
        <span style={{ opacity: 0.5 }}>|</span>
        <span style={{ opacity: 0.7 }}>{username}</span>
        <span style={{ opacity: 0.5 }}>|</span>
        <span style={{ opacity: 0.7 }}>{t('playersOnline', { count: Object.keys(players).length + 1 })}</span>
      </div>

      {/* HUD — 왼쪽 플레이어 목록 */}
      <div style={{
        position: 'absolute', top: 60, left: 16,
        background: 'rgba(0,0,0,0.4)', borderRadius: 12, padding: '8px 12px',
        color: '#fff', fontSize: 12, backdropFilter: 'blur(6px)', minWidth: 120,
      }}>
        <div style={{ fontWeight: 700, marginBottom: 6, opacity: 0.7 }}>{t('playersList')}</div>
        <div style={{ color: '#4ade80' }}>● {username} {t('youSuffix')}</div>
        {Object.values(players).map(p => (
          <div key={p.id} style={{ opacity: 0.8 }}>● {p.username}</div>
        ))}
      </div>

      {/* HUD — 조작법 */}
      <div style={{
        position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.35)', borderRadius: 10, padding: '5px 14px',
        color: 'rgba(255,255,255,0.6)', fontSize: 11, backdropFilter: 'blur(6px)',
        textAlign: 'center', pointerEvents: 'none',
      }}>
        {t('controlHint')}
      </div>

      {/* 채팅 */}
      <div style={{
        position: 'absolute', bottom: 24, right: 16,
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        {/* 채팅 로그 */}
        {chatOpen && (
          <div style={{
            background: 'rgba(0,0,0,0.5)', borderRadius: 12, padding: '8px 10px',
            width: 260, maxHeight: 200, overflowY: 'auto', backdropFilter: 'blur(8px)',
          }} ref={chatRef}>
            {chatLog.length === 0 && <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>{t('chatEmpty')}</div>}
            {chatLog.map((m, i) => (
              <div key={i} style={{ color: '#fff', fontSize: 12, marginBottom: 3 }}>
                <span style={{ fontWeight: 700, color: '#a5b4fc' }}>{m.username}</span>
                <span style={{ opacity: 0.85 }}> {m.message}</span>
              </div>
            ))}
          </div>
        )}
        {/* 입력창 */}
        {chatOpen && (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitChat(); } }}
              placeholder={t('chatPlaceholder')}
              style={{
                flex: 1, background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8, color: '#fff', fontSize: 12, padding: '6px 10px', outline: 'none',
              }}
            />
            <button onClick={submitChat} style={{
              background: '#4f46e5', border: 'none', borderRadius: 8, color: '#fff',
              fontWeight: 700, fontSize: 12, padding: '6px 12px', cursor: 'pointer',
            }}>↑</button>
          </div>
        )}
        {/* 채팅 토글 */}
        <button
          onClick={() => setChatOpen(v => !v)}
          style={{
            alignSelf: 'flex-end',
            background: chatOpen ? '#4f46e5' : 'rgba(0,0,0,0.45)',
            border: 'none', borderRadius: '50%', width: 44, height: 44,
            color: '#fff', fontSize: 20, cursor: 'pointer', backdropFilter: 'blur(6px)',
          }}
        >
          💬
        </button>
      </div>
    </div>
  );
}
