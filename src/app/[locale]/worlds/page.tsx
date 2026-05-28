'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { session } from '@/lib/api';
import CreatorNav from '@/components/creator/CreatorNav';

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

type Tab  = 'mine' | 'public';
type Sort = 'popular' | 'latest' | 'updated' | 'name';

/** 이름+설명에서 #해시태그 추출. 중복 제거. */
function extractTags(w: World): string[] {
  const text = `${w.name || ''} ${w.description || ''}`;
  const matches = text.match(/#[\p{L}\p{N}_-]+/gu) || [];
  return Array.from(new Set(matches.map(t => t.replace(/^#/, '').trim()).filter(Boolean))).slice(0, 8);
}

export default function WorldsPage() {
  const t      = useTranslations('Worlds');
  const locale = useLocale();
  const [tab, setTab]                = useState<Tab>('public');
  const [myWorlds, setMyWorlds]      = useState<World[]>([]);
  const [publicWorlds, setPubWorlds] = useState<World[]>([]);
  const [loading, setLoading]        = useState(true);
  const [loggedIn, setLoggedIn]      = useState(false);

  // 공개 월드 검색/정렬 state
  const [search, setSearch] = useState('');
  const [sort, setSort]     = useState<Sort>('popular');
  const [tagFilter, setTagFilter] = useState<string>(''); // 선택된 태그 (빈 = 전체)

  const token = () => session.getToken() || '';

  // 내 월드는 1번만 fetch
  useEffect(() => {
    const hasToken = !!session.getToken();
    setLoggedIn(hasToken);
    if (hasToken) {
      fetch(`${API}/api/worlds/my`, { headers: { Authorization: `Bearer ${token()}` } })
        .then(r => r.json()).then(d => setMyWorlds(d.worlds || [])).catch(() => {});
    }
  }, []);

  // 공개 월드는 검색/정렬/태그 바뀔 때마다 fetch (debounce 300ms)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLoading(true);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (tagFilter)     params.set('tag', tagFilter);
      params.set('sort', sort);
      fetch(`${API}/api/worlds/public?${params.toString()}`)
        .then(r => r.json())
        .then(d => { setPubWorlds(d.worlds || []); setLoading(false); })
        .catch(() => { setPubWorlds([]); setLoading(false); });
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, sort, tagFilter]);

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

  async function deleteWorld(w: World) {
    if (!confirm(t('confirmDelete', { name: w.name }))) return;
    const res = await fetch(`${API}/api/worlds/${w.id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token()}` },
    });
    if (res.ok) setMyWorlds(prev => prev.filter(m => m.id !== w.id));
  }

  // 현재 공개 결과에서 등장하는 태그들 (인기순 — 등장 횟수 많은 순)
  const popularTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of publicWorlds) {
      for (const tg of extractTags(w)) counts.set(tg, (counts.get(tg) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 16).map(([name, n]) => ({ name, count: n }));
  }, [publicWorlds]);

  const list = tab === 'mine' ? myWorlds : publicWorlds;

  const sortOptions: Array<{ key: Sort; label: string }> = [
    { key: 'popular', label: t('sortPopular') },
    { key: 'latest',  label: t('sortLatest')  },
    { key: 'updated', label: t('sortUpdated') },
    { key: 'name',    label: t('sortName')    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#0a0e1a', color: '#fff', fontFamily: "-apple-system,'Apple SD Gothic Neo',sans-serif" }}>
      <CreatorNav />

      {/* 헤더 */}
      <div style={{ padding: '24px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 28 }}>🌍</span>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{t('title')}</h1>
            <p style={{ margin: '2px 0 0', fontSize: 13, opacity: 0.5 }}>{t('subtitle')}</p>
          </div>
        </div>
        <a href={`/${locale}/studio`} style={{ padding: '10px 20px', borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none', boxShadow: '0 4px 16px rgba(99,102,241,0.35)' }}>
          + {t('newWorld')}
        </a>
      </div>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 24px 60px' }}>
        {/* 탭 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {([
            ['public', t('tabPublic'), publicWorlds.length],
            ['mine',   t('tabMine'),   loggedIn ? myWorlds.length : null],
          ] as const).map(([key, label, count]) => (
            <button key={key} onClick={() => setTab(key as Tab)} style={{
              background: 'none', border: 'none', padding: '12px 18px', cursor: 'pointer',
              color: tab === key ? '#fff' : 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: 700,
              borderBottom: `2px solid ${tab === key ? '#818cf8' : 'transparent'}`, marginBottom: -1,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {label}
              {count !== null && (
                <span style={{ opacity: 0.5, fontSize: 11, background: 'rgba(255,255,255,0.08)', padding: '1px 7px', borderRadius: 10 }}>{count}</span>
              )}
            </button>
          ))}
        </div>

        {/* 공개 탭일 때만 검색/정렬/태그 컨트롤 */}
        {tab === 'public' && (
          <>
            {/* 검색바 + 정렬 */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: '1 1 280px', minWidth: 240 }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 14, opacity: 0.5 }}>🔍</span>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 10, padding: '10px 14px 10px 38px',
                    color: '#fff', fontSize: 13, outline: 'none',
                  }}
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(255,255,255,0.6)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 11 }}
                  >✕</button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 4 }}>
                {sortOptions.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setSort(opt.key)}
                    style={{
                      padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
                      background: sort === opt.key ? 'rgba(99,102,241,0.85)' : 'transparent',
                      color: sort === opt.key ? '#fff' : 'rgba(255,255,255,0.55)',
                      fontSize: 12, fontWeight: 700,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 활성 태그 필터 표시 */}
            {tagFilter && (
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, opacity: 0.5 }}>{t('filteringByTag')}</span>
                <span style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  #{tagFilter}
                  <button onClick={() => setTagFilter('')} style={{ background: 'rgba(255,255,255,0.25)', border: 'none', color: '#fff', borderRadius: 999, width: 18, height: 18, cursor: 'pointer', fontSize: 10, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </span>
              </div>
            )}

            {/* 인기 태그 칩 */}
            {!tagFilter && popularTags.length > 0 && (
              <div style={{ marginBottom: 18, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontSize: 11, opacity: 0.45, alignSelf: 'center', marginRight: 4 }}>{t('popularTags')}</span>
                {popularTags.map(tg => (
                  <button
                    key={tg.name}
                    onClick={() => setTagFilter(tg.name)}
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'rgba(255,255,255,0.8)',
                      padding: '4px 10px', borderRadius: 999, fontSize: 11, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                    }}
                  >
                    <span>#{tg.name}</span>
                    <span style={{ opacity: 0.45, fontSize: 10 }}>{tg.count}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* 로딩 */}
        {loading && tab === 'public' && (
          <div style={{ textAlign: 'center', padding: 60, opacity: 0.4 }}>{t('loading')}</div>
        )}

        {/* 빈 상태 */}
        {!loading && list.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60, opacity: 0.4, fontSize: 14, lineHeight: 1.6 }}>
            {tab === 'mine'
              ? (loggedIn
                  ? <>{t('noMineLoggedIn')}<br /><a href={`/${locale}/studio`} style={{ color: '#818cf8' }}>{t('studioLink')}</a> {t('studioHere')}.</>
                  : t('loginRequired')
                )
              : (search || tagFilter ? t('noMatches') : t('noPublic'))
            }
          </div>
        )}

        {/* 카드 그리드 */}
        {!loading && list.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 18 }}>
            {list.map(w => {
              const tags = extractTags(w);
              return (
                <div key={w.id} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden', transition: 'transform .15s, border-color .15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(129,140,248,0.4)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  <a href={`/${locale}/world?id=${w.id}`} target="_blank" rel="noreferrer" style={{
                    display: 'block', width: '100%', aspectRatio: '16/9', position: 'relative', textDecoration: 'none',
                    background: w.thumbnailUrl ? `url(${w.thumbnailUrl}) center/cover` : 'linear-gradient(135deg,#1e293b,#0a0e1a)',
                  }}>
                    {!w.thumbnailUrl && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 50, opacity: 0.5 }}>🌍</div>}
                    {tab === 'mine' && (
                      <span style={{ position: 'absolute', top: 8, left: 8, background: w.isPublic ? 'rgba(16,185,129,0.9)' : 'rgba(100,116,139,0.85)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4 }}>
                        {w.isPublic ? t('badgePublic') : t('badgePrivate')}
                      </span>
                    )}
                    {w.playCount > 0 && (
                      <span style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', color: '#fff', fontSize: 10, padding: '3px 8px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700 }}>
                        ▶ {w.playCount.toLocaleString()}
                      </span>
                    )}
                  </a>

                  <div style={{ padding: '12px 14px' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.name}</div>
                    {tab === 'public' && w.creator && (
                      <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 6 }}>{t('by')} <span style={{ color: 'rgba(255,255,255,0.7)' }}>{w.creator.username}</span></div>
                    )}
                    {w.description && (
                      <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4, minHeight: 30 }}>{w.description}</div>
                    )}
                    {tags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                        {tags.slice(0, 4).map(tg => (
                          <button
                            key={tg}
                            onClick={(e) => { e.preventDefault(); setTagFilter(tg); }}
                            style={{
                              background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)',
                              color: '#a5b4fc', borderRadius: 999, padding: '2px 8px',
                              fontSize: 10, cursor: 'pointer',
                            }}
                          >#{tg}</button>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      <a href={`/${locale}/world?id=${w.id}`} target="_blank" rel="noreferrer"
                        style={{ flex: 1, textAlign: 'center', textDecoration: 'none', padding: '7px 0', borderRadius: 7, fontSize: 12, fontWeight: 700, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff' }}>
                        ▶ {t('play')}
                      </a>
                      {tab === 'mine' && (
                        <>
                          <a href={`/${locale}/studio?id=${w.id}`}
                            style={{ padding: '7px 10px', borderRadius: 7, textDecoration: 'none', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12 }}>{t('edit')}</a>
                          <button onClick={() => togglePublic(w)} style={{ padding: '7px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', background: w.isPublic ? 'rgba(16,185,129,0.18)' : 'rgba(255,255,255,0.08)', color: w.isPublic ? '#6ee7b7' : 'rgba(255,255,255,0.6)', fontSize: 12 }}>
                            {w.isPublic ? t('togglePrivate') : t('togglePublic')}
                          </button>
                          <button onClick={() => deleteWorld(w)} style={{ padding: '7px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', background: 'rgba(239,68,68,0.12)', color: '#fca5a5', fontSize: 12 }}>🗑️</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
