'use client';
import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { session } from '@/lib/api';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://airliveplay.com';

interface World {
  id: string;
  name: string;
  description: string | null;
  thumbnailUrl: string | null;
  isPublic: boolean;
  playCount: number;
  createdAt: string;
  updatedAt?: string;
  creator?: { username: string };
}

type Tab = 'mine' | 'public';

export default function WorldsPage() {
  const locale = useLocale();
  const [tab, setTab]                 = useState<Tab>('mine');
  const [myWorlds, setMyWorlds]       = useState<World[]>([]);
  const [publicWorlds, setPubWorlds]  = useState<World[]>([]);
  const [loading, setLoading]         = useState(true);
  const [loggedIn, setLoggedIn]       = useState(false);

  const token = () => session.getToken() || '';

  /* 로드 */
  useEffect(() => {
    const hasToken = !!session.getToken();
    setLoggedIn(hasToken);

    Promise.all([
      hasToken
        ? fetch(`${API}/api/worlds/my`, { headers: { Authorization: `Bearer ${token()}` } })
            .then(r => r.json()).then(d => d.worlds || [])
            .catch(() => [])
        : Promise.resolve([]),
      fetch(`${API}/api/worlds/public`).then(r => r.json()).then(d => d.worlds || []).catch(() => []),
    ]).then(([mine, pub]) => {
      setMyWorlds(mine);
      setPubWorlds(pub);
      setLoading(false);
    });
  }, []);

  /* 공개 토글 */
  async function togglePublic(w: World) {
    const res = await fetch(`${API}/api/worlds/${w.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ isPublic: !w.isPublic }),
    });
    if (res.ok) {
      const { world } = await res.json();
      setMyWorlds(prev => prev.map(m => m.id === world.id ? { ...m, ...world } : m));
    }
  }

  /* 삭제 */
  async function deleteWorld(w: World) {
    if (!confirm(`"${w.name}" 월드를 삭제할까요?`)) return;
    const res = await fetch(`${API}/api/worlds/${w.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (res.ok) setMyWorlds(prev => prev.filter(m => m.id !== w.id));
  }

  const list = tab === 'mine' ? myWorlds : publicWorlds;

  return (
    <div style={{
      minHeight: '100vh', background: '#0f172a', color: '#fff',
      fontFamily: "-apple-system,'Apple SD Gothic Neo',sans-serif",
    }}>
      {/* 헤더 */}
      <div style={{
        padding: '20px 32px', borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 26 }}>🌍</span>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>월드</h1>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.5 }}>내가 만든 맵과 다른 사람들이 공개한 맵</p>
          </div>
        </div>
        <a href={`/${locale}/studio`} style={{
          padding: '10px 18px', borderRadius: 10,
          background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
          color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none',
        }}>
          + 새 월드 만들기
        </a>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px' }}>
        {/* 탭 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {([
            ['mine',   '🛠️ 내가 만든', loggedIn ? myWorlds.length : null],
            ['public', '🌐 공개 월드', publicWorlds.length],
          ] as const).map(([key, label, count]) => (
            <button key={key} onClick={() => setTab(key)} style={{
              background: 'none', border: 'none',
              padding: '12px 18px', cursor: 'pointer',
              color: tab === key ? '#fff' : 'rgba(255,255,255,0.4)',
              fontSize: 14, fontWeight: 700,
              borderBottom: `2px solid ${tab === key ? '#6366f1' : 'transparent'}`,
              marginBottom: -1,
            }}>
              {label} {count !== null && <span style={{ opacity: 0.5, fontSize: 12 }}>({count})</span>}
            </button>
          ))}
        </div>

        {/* 로딩 */}
        {loading && (
          <div style={{ textAlign: 'center', padding: 60, opacity: 0.4 }}>로딩 중…</div>
        )}

        {/* 비어있음 */}
        {!loading && list.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60, opacity: 0.4, fontSize: 14 }}>
            {tab === 'mine'
              ? (loggedIn
                  ? <>만든 월드가 없습니다.<br /><a href={`/${locale}/studio`} style={{ color: '#818cf8' }}>스튜디오</a> 에서 만들어보세요.</>
                  : <>로그인이 필요합니다.</>
                )
              : '공개된 월드가 아직 없습니다.'
            }
          </div>
        )}

        {/* 카드 그리드 */}
        {!loading && list.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 18 }}>
            {list.map(w => (
              <div key={w.id} style={{
                background: 'rgba(255,255,255,0.05)', borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden',
                transition: 'border-color .15s',
              }}>
                {/* 썸네일 영역 */}
                <a href={`/${locale}/world?id=${w.id}`} target="_blank" rel="noreferrer" style={{
                  display: 'block', width: '100%', aspectRatio: '16/9',
                  background: w.thumbnailUrl
                    ? `url(${w.thumbnailUrl}) center/cover`
                    : 'linear-gradient(135deg,#1e293b,#0f172a)',
                  position: 'relative',
                  textDecoration: 'none',
                }}>
                  {!w.thumbnailUrl && (
                    <div style={{
                      position: 'absolute', inset: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 50, opacity: 0.5,
                    }}>🌍</div>
                  )}
                  {/* 공개 배지 */}
                  {tab === 'mine' && (
                    <span style={{
                      position: 'absolute', top: 8, left: 8,
                      background: w.isPublic ? 'rgba(16,185,129,0.9)' : 'rgba(100,116,139,0.85)',
                      color: '#fff', fontSize: 10, fontWeight: 700,
                      padding: '2px 8px', borderRadius: 4,
                    }}>{w.isPublic ? '공개' : '비공개'}</span>
                  )}
                  {/* 플레이 카운트 */}
                  {w.playCount > 0 && (
                    <span style={{
                      position: 'absolute', top: 8, right: 8,
                      background: 'rgba(0,0,0,0.55)', color: '#fff',
                      fontSize: 10, padding: '2px 7px', borderRadius: 4,
                      display: 'flex', alignItems: 'center', gap: 3,
                    }}>▶ {w.playCount.toLocaleString()}</span>
                  )}
                  {/* 호버 오버레이 */}
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'rgba(0,0,0,0.55)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: 0, transition: 'opacity .15s',
                    fontSize: 26, fontWeight: 800,
                  }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
                  >▶ PLAY</div>
                </a>

                {/* 정보 */}
                <div style={{ padding: '10px 12px' }}>
                  <div style={{
                    fontWeight: 700, fontSize: 14, marginBottom: 3,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{w.name}</div>
                  {tab === 'public' && w.creator && (
                    <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 8 }}>by {w.creator.username}</div>
                  )}
                  {w.description && (
                    <div style={{
                      fontSize: 11, opacity: 0.5, marginBottom: 8,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>{w.description}</div>
                  )}

                  {/* 액션 버튼 */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    <a href={`/${locale}/world?id=${w.id}`} target="_blank" rel="noreferrer"
                      style={{
                        flex: 1, textAlign: 'center', textDecoration: 'none',
                        padding: '6px 0', borderRadius: 6, fontSize: 12, fontWeight: 700,
                        background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff',
                      }}>▶ 플레이</a>

                    {tab === 'mine' && (
                      <>
                        <a href={`/${locale}/studio?id=${w.id}`}
                          style={{
                            padding: '6px 10px', borderRadius: 6, textDecoration: 'none',
                            background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12,
                          }}>편집</a>
                        <button onClick={() => togglePublic(w)} style={{
                          padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                          background: w.isPublic ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.08)',
                          color: w.isPublic ? '#6ee7b7' : 'rgba(255,255,255,0.6)', fontSize: 12,
                        }}>{w.isPublic ? '비공개' : '공개'}</button>
                        <button onClick={() => deleteWorld(w)} style={{
                          padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                          background: 'rgba(239,68,68,0.12)', color: '#fca5a5', fontSize: 12,
                        }}>🗑️</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
