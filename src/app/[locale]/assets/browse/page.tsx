'use client';
/**
 * 마켓플레이스 — 모든 유저의 공개 에셋 둘러보기
 *  ?q=검색어 &kind=image &tag=태그 &sort=recent|name
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, session, ApiError } from '@/lib/api';

import type { Asset, AssetKind } from '@/lib/assets/types';
import { getKind } from '@/lib/assets/registry';
import '@/lib/assets/kinds';   // 사이드이펙트 import

import AssetMarketCard from '@/components/assets/AssetMarketCard';
import AssetDetailModal from '@/components/assets/AssetDetailModal';
import AssetReportModal, { type ReportReason } from '@/components/assets/AssetReportModal';
import PackCard from '@/components/assets/PackCard';
import type { FolderPack } from '@/lib/api';

type PackWithMeta = FolderPack & { creator: { username: string | null } | null; assetCount: number; cover: unknown };

interface MarketAsset extends Asset {
  creator?: { username: string | null };
  liked?: boolean;
  likeCount?: number;
  importCount?: number;
}

const PAGE_SIZE = 40;

export default function AssetBrowsePage() {
  const t = useTranslations('Assets');
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [kinds,  setKinds]  = useState<AssetKind[]>([]);
  const [assets, setAssets] = useState<MarketAsset[]>([]);
  const [total,  setTotal]  = useState(0);
  const [page,   setPage]   = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [likingId, setLikingId]       = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
  const [reportingAsset, setReportingAsset] = useState<Asset | null>(null);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
  // 카드 클릭 상세 모달 — id 로 잡고 assets 에서 파생(좋아요/비공개 즉시 반영)
  const [detailId, setDetailId] = useState<string | null>(null);
  const [unpublishingId, setUnpublishingId] = useState<string | null>(null);
  // 반응형 — 좁은 화면에선 사이드바를 가로 카테고리 칩으로 전환
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // 팩 탭 상태
  const [packs, setPacks] = useState<PackWithMeta[]>([]);
  const [packTotal, setPackTotal] = useState(0);
  const [packPage, setPackPage]   = useState(1);
  const [packHasMore, setPackHasMore] = useState(false);
  const [packLoading, setPackLoading] = useState(false);
  const [importingPackId, setImportingPackId] = useState<string | null>(null);
  const [importedPackIds, setImportedPackIds] = useState<Set<string>>(new Set());

  // 검색 입력 — URL 동기화 + 디바운스
  const q       = searchParams.get('q') || '';
  const kindSel = searchParams.get('kind') || '';
  const tagSel  = searchParams.get('tag') || '';
  const sort    = (searchParams.get('sort') || 'popular') as 'recent' | 'name' | 'popular';
  const tab     = (searchParams.get('tab') || 'assets') as 'assets' | 'packs';
  const [qInput, setQInput] = useState(q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const setQuery = useCallback((patch: Record<string, string | null>) => {
    const sp = new URLSearchParams(searchParams.toString());
    Object.entries(patch).forEach(([k, v]) => {
      if (!v) sp.delete(k); else sp.set(k, v);
    });
    router.replace(`?${sp.toString()}`, { scroll: false });
  }, [router, searchParams]);

  // 검색어 입력 디바운스
  useEffect(() => {
    if (qInput === q) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setQuery({ q: qInput || null });
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);

  // kinds 로드
  useEffect(() => {
    api.listAssetKinds().then(d => setKinds(d.kinds)).catch(() => {});
  }, []);

  // 필터 변경 시 첫 페이지부터 다시 로드 (로그인 상태면 liked 함께)
  useEffect(() => {
    setLoading(true);
    setPage(1);
    const tk = session.getToken() || undefined;
    api.listPublicAssets({ q, kind: kindSel, tag: tagSel, sort, page: 1, pageSize: PAGE_SIZE }, tk)
      .then(d => {
        setAssets(d.assets as MarketAsset[]);
        setTotal(d.total);
        setHasMore(d.hasMore);
        setError('');
      })
      .catch(e => setError(e instanceof ApiError ? e.message : 'load failed'))
      .finally(() => setLoading(false));
  }, [q, kindSel, tagSel, sort]);

  async function loadMore() {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const next = page + 1;
      const tk = session.getToken() || undefined;
      const d = await api.listPublicAssets({ q, kind: kindSel, tag: tagSel, sort, page: next, pageSize: PAGE_SIZE }, tk);
      setAssets(prev => [...prev, ...(d.assets as MarketAsset[])]);
      setPage(next);
      setHasMore(d.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }

  // 팩 탭 로드
  useEffect(() => {
    if (tab !== 'packs') return;
    setPackLoading(true);
    setPackPage(1);
    api.listPublicPacks({ q, sort: sort === 'name' ? 'recent' : sort, page: 1, pageSize: 24 })
      .then(d => {
        setPacks(d.packs as PackWithMeta[]);
        setPackTotal(d.total);
        setPackHasMore(d.hasMore);
        setError('');
      })
      .catch(e => setError(e instanceof ApiError ? e.message : 'load failed'))
      .finally(() => setPackLoading(false));
  }, [tab, q, sort]);

  async function loadMorePacks() {
    if (packLoading || !packHasMore) return;
    setPackLoading(true);
    try {
      const next = packPage + 1;
      const d = await api.listPublicPacks({ q, sort: sort === 'name' ? 'recent' : sort, page: next, pageSize: 24 });
      setPacks(prev => [...prev, ...(d.packs as PackWithMeta[])]);
      setPackPage(next);
      setPackHasMore(d.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed');
    } finally {
      setPackLoading(false);
    }
  }

  async function importPack(p: PackWithMeta) {
    const tk = session.getToken();
    if (!tk) { router.push('/login'); return; }
    setImportingPackId(p.id);
    try {
      await api.importPack(tk, p.id);
      setImportedPackIds(prev => new Set(prev).add(p.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'import failed');
    } finally {
      setImportingPackId(null);
    }
  }

  async function submitReport(reason: ReportReason, comment: string) {
    if (!reportingAsset) return;
    const tk = session.getToken();
    if (!tk) { router.push('/login'); return; }
    await api.reportAsset(tk, reportingAsset.id, { reason, comment });
    setReportedIds(prev => new Set(prev).add(reportingAsset.id));
  }

  async function toggleLike(a: MarketAsset) {
    const tk = session.getToken();
    if (!tk) { router.push('/login'); return; }
    setLikingId(a.id);
    try {
      const res = a.liked
        ? await api.unlikeAsset(tk, a.id)
        : await api.likeAsset(tk, a.id);
      setAssets(prev => prev.map(x => x.id === a.id ? { ...x, liked: res.liked, likeCount: res.likeCount } : x));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'like failed');
    } finally {
      setLikingId(null);
    }
  }

  async function importAsset(a: Asset) {
    const tk = session.getToken();
    if (!tk) { router.push('/login'); return; }
    setImportingId(a.id);
    setError('');
    try {
      await api.cloneAsset(tk, a.id);
      setImportedIds(prev => new Set(prev).add(a.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'import failed');
    } finally {
      setImportingId(null);
    }
  }

  // 내 에셋 비공개 전환 — 마켓 목록에서 제거 (라이브러리에서 다시 공개 가능)
  async function unpublishAsset(a: MarketAsset) {
    const tk = session.getToken();
    if (!tk) { router.push('/login'); return; }
    setUnpublishingId(a.id);
    setError('');
    try {
      await api.batchUpdateAssets(tk, { ids: [a.id], action: 'setPublic', value: false });
      setAssets(prev => prev.filter(x => x.id !== a.id));
      setTotal(prev => Math.max(0, prev - 1));
      setDetailId(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'unpublish failed');
    } finally {
      setUnpublishingId(null);
    }
  }

  // 상세 모달 대상 — 항상 최신 assets 에서 파생
  const detailAsset = useMemo(() => assets.find(a => a.id === detailId) || null, [assets, detailId]);

  /* ── 프리뷰 (kind 핸들러) ── */
  const previewHandler = previewAsset ? getKind(previewAsset.kind) : null;
  const PreviewComp    = previewHandler?.Preview;

  const activeKindDef = useMemo(() => kinds.find(k => k.id === kindSel), [kinds, kindSel]);

  return (
    <>
      {previewAsset && PreviewComp && (
        <PreviewComp asset={previewAsset} onClose={() => setPreviewAsset(null)} />
      )}
      {detailAsset && (
        <AssetDetailModal
          asset={detailAsset}
          kinds={kinds}
          importing={importingId === detailAsset.id}
          imported={importedIds.has(detailAsset.id)}
          liking={likingId === detailAsset.id}
          reported={reportedIds.has(detailAsset.id)}
          unpublishing={unpublishingId === detailAsset.id}
          onClose={() => setDetailId(null)}
          onImport={importAsset}
          onToggleLike={toggleLike}
          onReport={(a) => { setDetailId(null); setReportingAsset(a); }}
          onUnpublish={unpublishAsset}
          onPreview={(a) => { setDetailId(null); setPreviewAsset(a); }}
        />
      )}
      {reportingAsset && (
        <AssetReportModal
          asset={reportingAsset}
          onClose={() => setReportingAsset(null)}
          onSubmit={submitReport}
        />
      )}

      <div style={{ minHeight: '100vh', background: '#0b1020', color: '#fff', fontFamily: "-apple-system,'Apple SD Gothic Neo',sans-serif" }}>
        {/* 스티키 상단 바 */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 30,
          padding: '12px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(11,16,32,0.85)', backdropFilter: 'blur(10px)',
        }}>
          <span style={{ fontSize: 20 }}>🛒</span>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 800, flex: 1 }}>{t('marketTitle')}</h1>
          <Link href="/assets/following" style={{
            fontSize: 12, color: '#a5b4fc', textDecoration: 'none',
            padding: '7px 14px', background: 'rgba(99,102,241,0.18)', borderRadius: 8,
          }}>
            📡 {t('feedLink')}
          </Link>
          <Link href="/assets" style={{
            fontSize: 12, color: '#a5b4fc', textDecoration: 'none',
            padding: '7px 14px', background: 'rgba(99,102,241,0.18)', borderRadius: 8,
          }}>
            ← {t('marketBackToLibrary')}
          </Link>
        </header>

        {/* 히어로 — 타이틀 + 서브 + 큰 검색창 */}
        <div style={{
          padding: '36px 24px 32px',
          background: 'radial-gradient(1200px 300px at 50% -40%, rgba(129,140,248,0.28), transparent 70%), linear-gradient(180deg, rgba(99,102,241,0.12), transparent)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 28, fontWeight: 900, letterSpacing: -0.5 }}>{t('marketTitle')}</h2>
            <p style={{ margin: '8px 0 20px', fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>{t('marketSubtitle')}</p>
            <div style={{ position: 'relative', maxWidth: 560, margin: '0 auto' }}>
              <input
                value={qInput}
                onChange={e => setQInput(e.target.value)}
                placeholder={t('searchPlaceholder')}
                style={{
                  width: '100%', padding: '13px 16px 13px 44px', fontSize: 14,
                  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
                  borderRadius: 12, color: '#fff', outline: 'none', boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
                }}
              />
              <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', opacity: 0.45, fontSize: 16 }}>🔍</span>
            </div>
          </div>
        </div>

        {/* 본문 — 좌측 카테고리 사이드바 + 우측 그리드 (모바일은 세로 스택) */}
        <div style={{ maxWidth: 1680, margin: '0 auto', padding: '20px 24px 56px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 14 : 24, alignItems: 'flex-start' }}>
          {/* 사이드바 */}
          <aside style={{ width: isMobile ? '100%' : 220, flexShrink: 0, position: isMobile ? 'static' : 'sticky', top: 72, alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: isMobile ? 10 : 16 }}>
            {/* 콘텐츠 탭 (에셋 / 팩) */}
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 4, gap: 4 }}>
              <SegBtn active={tab === 'assets'} onClick={() => setQuery({ tab: null })}>🎲 {t('tabAssets')}</SegBtn>
              <SegBtn active={tab === 'packs'} onClick={() => setQuery({ tab: 'packs' })}>📦 {t('tabPacks')}</SegBtn>
            </div>

            {/* 카테고리 (에셋 탭 전용) */}
            {tab === 'assets' && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: 'rgba(255,255,255,0.4)', padding: '0 10px 8px' }}>
                  {t('sidebarCategory')}
                </div>
                <nav style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: isMobile ? 6 : 2, overflowX: isMobile ? 'auto' : 'visible', paddingBottom: isMobile ? 4 : 0 }}>
                  <SideCat active={!kindSel} icon="🗂️" label={t('all')} inline={isMobile} onClick={() => setQuery({ kind: null })} />
                  {kinds.map(k => (
                    <SideCat key={k.id}
                      active={kindSel === k.id}
                      icon={k.icon || '📄'}
                      label={k.label}
                      inline={isMobile}
                      onClick={() => setQuery({ kind: k.id === kindSel ? null : k.id })} />
                  ))}
                </nav>

                {/* 활성 태그 필터 */}
                {tagSel && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: 'rgba(255,255,255,0.4)', padding: '0 10px 8px' }}>
                      {t('activeFilters')}
                    </div>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4, margin: '0 10px',
                      padding: '4px 4px 4px 10px', fontSize: 12,
                      background: 'rgba(99,102,241,0.2)', color: '#c7d2fe', borderRadius: 7,
                    }}>
                      # {tagSel}
                      <button onClick={() => setQuery({ tag: null })}
                        style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13, padding: '0 3px' }}>
                        ✕
                      </button>
                    </span>
                  </div>
                )}
              </div>
            )}
          </aside>

          {/* 메인 */}
          <main style={{ flex: 1, minWidth: 0 }}>
            {/* 결과 툴바 — 개수 + 정렬 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {tab === 'assets' ? (
                  <>{t('marketTotalCount', { count: total })}{activeKindDef && <span style={{ opacity: 0.55, fontWeight: 400 }}> · {activeKindDef.label}</span>}</>
                ) : (
                  <>{t('marketTotalCount', { count: packTotal })}</>
                )}
              </div>
              <select
                value={sort}
                onChange={e => setQuery({ sort: e.target.value === 'popular' ? null : e.target.value })}
                style={{
                  marginLeft: 'auto', padding: '8px 12px', fontSize: 12.5,
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 9, color: '#fff', outline: 'none', cursor: 'pointer',
                }}>
                <option value="popular">{t('sortPopular')}</option>
                <option value="recent">{t('sortRecent')}</option>
                <option value="name">{t('sortName')}</option>
              </select>
            </div>

            {error && (
              <div style={{
                background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 10, padding: '10px 16px', color: '#fca5a5', fontSize: 13, marginBottom: 14,
              }}>
                ⚠️ {error}
              </div>
            )}

            {/* 그리드 — 탭에 따라 분기 */}
            {tab === 'assets' ? (
              <>
                {assets.length === 0 && !loading ? (
                  <div style={{ textAlign: 'center', opacity: 0.4, padding: '60px 0', fontSize: 14 }}>
                    {t('marketEmpty')}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                    {assets.map(a => (
                      <AssetMarketCard
                        key={a.id}
                        asset={a}
                        kinds={kinds}
                        importing={importingId === a.id}
                        imported={importedIds.has(a.id)}
                        liking={likingId === a.id}
                        reported={reportedIds.has(a.id)}
                        onPreview={setPreviewAsset}
                        onOpenDetail={() => setDetailId(a.id)}
                        onImport={importAsset}
                        onToggleLike={toggleLike}
                        onReport={setReportingAsset}
                      />
                    ))}
                  </div>
                )}
                {hasMore && (
                  <div style={{ textAlign: 'center', padding: '28px 0' }}>
                    <button onClick={loadMore} disabled={loading}
                      style={{
                        padding: '11px 28px', fontSize: 13, fontWeight: 700,
                        background: 'rgba(99,102,241,0.18)', color: '#c7d2fe',
                        border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10, cursor: 'pointer',
                      }}>
                      {loading ? t('marketLoading') : t('marketLoadMore')}
                    </button>
                  </div>
                )}
                {!hasMore && assets.length > 0 && (
                  <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 11, opacity: 0.4 }}>
                    {t('marketEndOfList')}
                  </div>
                )}
              </>
            ) : (
              <>
                {packs.length === 0 && !packLoading ? (
                  <div style={{ textAlign: 'center', opacity: 0.4, padding: '60px 0', fontSize: 14 }}>
                    {t('packMarketEmpty')}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
                    {packs.map(p => (
                      <PackCard
                        key={p.id}
                        pack={p}
                        importing={importingPackId === p.id}
                        imported={importedPackIds.has(p.id)}
                        onImport={importPack}
                      />
                    ))}
                  </div>
                )}
                {packHasMore && (
                  <div style={{ textAlign: 'center', padding: '28px 0' }}>
                    <button onClick={loadMorePacks} disabled={packLoading}
                      style={{
                        padding: '11px 28px', fontSize: 13, fontWeight: 700,
                        background: 'rgba(99,102,241,0.18)', color: '#c7d2fe',
                        border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10, cursor: 'pointer',
                      }}>
                      {packLoading ? t('marketLoading') : t('marketLoadMore')}
                    </button>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </>
  );
}

/* 사이드바 콘텐츠 탭 버튼 (에셋/팩) */
function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      style={{
        flex: 1, padding: '7px 8px', fontSize: 12.5, fontWeight: active ? 700 : 500,
        border: 'none', borderRadius: 7, cursor: 'pointer',
        background: active ? 'rgba(99,102,241,0.9)' : 'transparent',
        color: active ? '#fff' : 'rgba(255,255,255,0.6)',
        transition: 'all .12s',
      }}>
      {children}
    </button>
  );
}

/* 사이드바 카테고리 행 (데스크톱=세로 리스트 / 모바일 inline=가로 칩) */
function SideCat({ active, icon, label, onClick, inline }: { active: boolean; icon: string; label: string; onClick: () => void; inline?: boolean }) {
  return (
    <button onClick={onClick}
      style={{
        textAlign: 'left', display: 'flex', alignItems: 'center', gap: 9,
        padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
        background: active ? 'rgba(99,102,241,0.16)' : 'transparent',
        color: active ? '#c7d2fe' : 'rgba(255,255,255,0.72)',
        fontWeight: active ? 700 : 500, fontSize: 13,
        transition: 'background .12s, color .12s',
        ...(inline
          ? { flexShrink: 0, whiteSpace: 'nowrap', border: `1px solid ${active ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)'}` }
          : { width: '100%', border: 'none', borderLeft: `3px solid ${active ? '#6366f1' : 'transparent'}` }),
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
      <span style={{ fontSize: 15, flexShrink: 0 }}>{icon}</span>
      <span style={{ ...(inline ? {} : { flex: 1 }), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  );
}
