'use client';
/**
 * 팔로잉 피드 — 내가 팔로우한 작가들의 최근 공개 에셋
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, session, ApiError } from '@/lib/api';

import type { Asset, AssetKind } from '@/lib/assets/types';
import { getKind } from '@/lib/assets/registry';
import '@/lib/assets/kinds';

import AssetMarketCard from '@/components/assets/AssetMarketCard';
import AssetReportModal, { type ReportReason } from '@/components/assets/AssetReportModal';

interface MarketAsset extends Asset {
  creator?: { username: string | null };
  liked?: boolean;
  likeCount?: number;
  importCount?: number;
}

export default function FollowingFeedPage() {
  const t = useTranslations('Assets');
  const router = useRouter();

  const [kinds, setKinds] = useState<AssetKind[]>([]);
  const [assets, setAssets] = useState<MarketAsset[]>([]);
  const [page, setPage]     = useState(1);
  const [total, setTotal]   = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [likingId, setLikingId] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
  const [reportingAsset, setReportingAsset] = useState<Asset | null>(null);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.listAssetKinds().then(d => setKinds(d.kinds)).catch(() => {});
  }, []);

  useEffect(() => {
    const tk = session.getToken();
    if (!tk) { setNeedsLogin(true); return; }
    setLoading(true);
    setPage(1);
    api.listFollowingFeed(tk, { page: 1 })
      .then(d => {
        setAssets(d.assets as MarketAsset[]);
        setTotal(d.total);
        setHasMore(d.hasMore);
        setError('');
      })
      .catch(e => setError(e instanceof ApiError ? e.message : t('errLoadFailed')))
      .finally(() => setLoading(false));
  }, []);

  async function loadMore() {
    if (loading || !hasMore) return;
    const tk = session.getToken();
    if (!tk) return;
    setLoading(true);
    try {
      const next = page + 1;
      const d = await api.listFollowingFeed(tk, { page: next });
      setAssets(prev => [...prev, ...(d.assets as MarketAsset[])]);
      setPage(next);
      setHasMore(d.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errLoadFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function importAsset(a: Asset) {
    const tk = session.getToken();
    if (!tk) return;
    setImportingId(a.id);
    try {
      await api.cloneAsset(tk, a.id);
      setImportedIds(prev => new Set(prev).add(a.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('errImportShortFailed'));
    } finally {
      setImportingId(null);
    }
  }

  async function toggleLike(a: MarketAsset) {
    const tk = session.getToken();
    if (!tk) return;
    setLikingId(a.id);
    try {
      const res = a.liked ? await api.unlikeAsset(tk, a.id) : await api.likeAsset(tk, a.id);
      setAssets(prev => prev.map(x => x.id === a.id ? { ...x, liked: res.liked, likeCount: res.likeCount } : x));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('errLikeFailed'));
    } finally {
      setLikingId(null);
    }
  }

  async function submitReport(reason: ReportReason, comment: string) {
    if (!reportingAsset) return;
    const tk = session.getToken();
    if (!tk) return;
    await api.reportAsset(tk, reportingAsset.id, { reason, comment });
    setReportedIds(prev => new Set(prev).add(reportingAsset.id));
  }

  const previewHandler = previewAsset ? getKind(previewAsset.kind) : null;
  const PreviewComp    = previewHandler?.Preview;

  if (needsLogin) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
          <div style={{ marginBottom: 12 }}>{t('feedNeedsLogin')}</div>
          <button onClick={() => router.push('/login')}
            style={{ padding: '10px 24px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
            {t('loginCta')}
          </button>
        </div>
      </div>
    );
  }

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
        <div style={{ padding: '20px 32px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 26 }}>📡</span>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{t('feedTitle')}</h1>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.5 }}>{t('feedSubtitle')}</p>
          </div>
          <Link href="/assets/browse" style={{
            fontSize: 12, color: '#a5b4fc', textDecoration: 'none',
            padding: '7px 14px', background: 'rgba(99,102,241,0.18)', borderRadius: 8,
          }}>
            🛒 {t('marketBrowseLink')}
          </Link>
        </div>

        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 32px' }}>
          <div style={{ fontSize: 12, opacity: 0.55, marginBottom: 14 }}>
            {t('marketTotalCount', { count: total })}
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 10, padding: '10px 16px', color: '#fca5a5', fontSize: 13, marginBottom: 14,
            }}>
              ⚠️ {error}
            </div>
          )}

          {assets.length === 0 && !loading ? (
            <div style={{ textAlign: 'center', opacity: 0.45, padding: '60px 20px', fontSize: 14 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
              {t('feedEmpty')}
              <div style={{ marginTop: 12 }}>
                <Link href="/assets/browse" style={{ color: '#a5b4fc', textDecoration: 'underline' }}>
                  {t('feedEmptyCta')}
                </Link>
              </div>
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
                  reported={reportedIds.has(a.id)}
                  onPreview={setPreviewAsset}
                  onImport={importAsset}
                  onToggleLike={toggleLike}
                  onReport={setReportingAsset}
                />
              ))}
            </div>
          )}

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
        </div>
      </div>
    </>
  );
}
