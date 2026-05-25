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
import AssetReportModal, { type ReportReason } from '@/components/assets/AssetReportModal';

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

  // 검색 입력 — URL 동기화 + 디바운스
  const q       = searchParams.get('q') || '';
  const kindSel = searchParams.get('kind') || '';
  const tagSel  = searchParams.get('tag') || '';
  const sort    = (searchParams.get('sort') || 'popular') as 'recent' | 'name' | 'popular';
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

  /* ── 프리뷰 (kind 핸들러) ── */
  const previewHandler = previewAsset ? getKind(previewAsset.kind) : null;
  const PreviewComp    = previewHandler?.Preview;

  const activeKindDef = useMemo(() => kinds.find(k => k.id === kindSel), [kinds, kindSel]);

  return (
    <>
      {previewAsset && PreviewComp && (
        <PreviewComp asset={previewAsset} onClose={() => setPreviewAsset(null)} />
      )}
      {reportingAsset && (
        <AssetReportModal
          asset={reportingAsset}
          onClose={() => setReportingAsset(null)}
          onSubmit={submitReport}
        />
      )}

      <div style={{ minHeight: '100vh', background: '#0f172a', color: '#fff', fontFamily: "-apple-system,'Apple SD Gothic Neo',sans-serif" }}>
        {/* 헤더 */}
        <div style={{ padding: '20px 32px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 26 }}>🛒</span>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{t('marketTitle')}</h1>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.5 }}>{t('marketSubtitle')}</p>
          </div>
          <Link href="/assets" style={{
            fontSize: 12, color: '#a5b4fc', textDecoration: 'none',
            padding: '7px 14px', background: 'rgba(99,102,241,0.18)', borderRadius: 8,
          }}>
            ← {t('marketBackToLibrary')}
          </Link>
        </div>

        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 32px' }}>
          {/* 검색 + 필터 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 16 }}>
            <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 360 }}>
              <input
                value={qInput}
                onChange={e => setQInput(e.target.value)}
                placeholder={t('searchPlaceholder')}
                style={{
                  width: '100%', padding: '8px 12px 8px 32px', fontSize: 13,
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8, color: '#fff', outline: 'none',
                }}
              />
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}>🔍</span>
            </div>

            {/* kind 선택 */}
            <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.05)', padding: 3, borderRadius: 9 }}>
              <KindChip active={!kindSel} label={t('all')} onClick={() => setQuery({ kind: null })} />
              {kinds.map(k => (
                <KindChip key={k.id}
                  active={kindSel === k.id}
                  label={`${k.icon || ''} ${k.label}`.trim()}
                  onClick={() => setQuery({ kind: k.id === kindSel ? null : k.id })} />
              ))}
            </div>

            <select
              value={sort}
              onChange={e => setQuery({ sort: e.target.value === 'popular' ? null : e.target.value })}
              style={{
                padding: '7px 10px', fontSize: 12,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8, color: '#fff', outline: 'none', cursor: 'pointer',
              }}>
              <option value="popular">{t('sortPopular')}</option>
              <option value="recent">{t('sortRecent')}</option>
              <option value="name">{t('sortName')}</option>
            </select>

            <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.55 }}>
              {t('marketTotalCount', { count: total })}
              {activeKindDef && <> · {activeKindDef.label}</>}
              {tagSel && <> · #{tagSel}</>}
            </div>
          </div>

          {/* 태그 필터 칩 (선택돼 있을 때만) */}
          {tagSel && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 11, opacity: 0.5 }}>{t('activeFilters')}:</span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 4px 3px 8px', fontSize: 11,
                background: 'rgba(99,102,241,0.18)', color: '#c7d2fe', borderRadius: 5,
              }}>
                # {tagSel}
                <button onClick={() => setQuery({ tag: null })}
                  style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13, padding: '0 3px' }}>
                  ✕
                </button>
              </span>
            </div>
          )}

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 10, padding: '10px 16px', color: '#fca5a5', fontSize: 13, marginBottom: 14,
            }}>
              ⚠️ {error}
            </div>
          )}

          {/* 그리드 */}
          {assets.length === 0 && !loading ? (
            <div style={{ textAlign: 'center', opacity: 0.4, padding: '60px 0', fontSize: 14 }}>
              {t('marketEmpty')}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
              {assets.map(a => (
                <AssetMarketCard
                  key={a.id}
                  asset={a}
                  kinds={kinds}
                  importing={importingId === a.id}
                  imported={importedIds.has(a.id)}
                  liking={likingId === a.id}
                  onPreview={setPreviewAsset}
                  onImport={importAsset}
                  onToggleLike={toggleLike}
                />
              ))}
            </div>
          )}

          {/* 더 보기 */}
          {hasMore && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <button onClick={loadMore} disabled={loading}
                style={{
                  padding: '10px 24px', fontSize: 13, fontWeight: 700,
                  background: 'rgba(99,102,241,0.18)', color: '#c7d2fe',
                  border: 'none', borderRadius: 8, cursor: 'pointer',
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
        </div>
      </div>
    </>
  );
}

function KindChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{
        padding: '5px 11px', fontSize: 12, border: 'none', borderRadius: 6, cursor: 'pointer',
        background: active ? 'rgba(99,102,241,0.35)' : 'transparent',
        color: active ? '#fff' : 'rgba(255,255,255,0.55)',
        fontWeight: active ? 700 : 500,
        transition: 'all .12s',
      }}>
      {label}
    </button>
  );
}
