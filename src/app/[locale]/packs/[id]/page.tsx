'use client';
/**
 * 팩 상세 — /packs/[id]
 * 헤더(이름·작가·통계) + 안의 에셋 그리드 + "전체 가져오기"
 */
import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, session, ApiError, type FolderPack } from '@/lib/api';

import type { Asset, AssetKind } from '@/lib/assets/types';
import { getKind } from '@/lib/assets/registry';
import '@/lib/assets/kinds';

import AssetMarketCard from '@/components/assets/AssetMarketCard';

interface PackDetail extends FolderPack {
  creator: { username: string | null } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cover: any;
}

interface MarketAsset extends Asset {
  liked?: boolean;
  likeCount?: number;
  importCount?: number;
}

export default function PackDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const t = useTranslations('Assets');
  const router = useRouter();
  const { id } = use(params);

  const [pack, setPack]     = useState<PackDetail | null>(null);
  const [assets, setAssets] = useState<MarketAsset[]>([]);
  const [kinds, setKinds]   = useState<AssetKind[]>([]);
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(true);

  const [importing, setImporting] = useState(false);
  const [imported, setImported]   = useState(false);
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);

  useEffect(() => {
    const tk = session.getToken() || undefined;
    api.listAssetKinds().then(d => setKinds(d.kinds)).catch(() => {});
    setLoading(true);
    api.getPack(id, tk)
      .then(d => {
        setPack(d.pack as PackDetail);
        setAssets(d.assets as MarketAsset[]);
      })
      .catch(e => setError(e instanceof ApiError ? e.message : 'load failed'))
      .finally(() => setLoading(false));
  }, [id]);

  async function importAll() {
    const tk = session.getToken();
    if (!tk) { router.push('/login'); return; }
    if (!pack) return;
    setImporting(true);
    try {
      await api.importPack(tk, pack.id);
      setImported(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'import failed');
    } finally {
      setImporting(false);
    }
  }

  const previewHandler = previewAsset ? getKind(previewAsset.kind) : null;
  const PreviewComp    = previewHandler?.Preview;

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ opacity: 0.5 }}>{t('marketLoading')}</div>
      </div>
    );
  }

  if (error || !pack) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', opacity: 0.6 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
          <div>{error || t('packNotFound')}</div>
          <Link href="/assets/browse" style={{ marginTop: 16, display: 'inline-block', color: '#a5b4fc' }}>
            ← {t('marketBackToBrowse')}
          </Link>
        </div>
      </div>
    );
  }

  const coverSrc = pack.cover?.thumbnailUrl || (pack.cover?.kind === 'image' ? pack.cover?.modelUrl : null);

  return (
    <>
      {previewAsset && PreviewComp && (
        <PreviewComp asset={previewAsset} onClose={() => setPreviewAsset(null)} />
      )}

      <div style={{ minHeight: '100vh', background: '#0f172a', color: '#fff', fontFamily: "-apple-system,'Apple SD Gothic Neo',sans-serif" }}>
        {/* 커버 + 헤더 */}
        <div style={{ position: 'relative' }}>
          <div style={{
            height: 240, background: 'linear-gradient(135deg,#1e293b,#312e81)',
            backgroundImage: coverSrc ? `url(${coverSrc})` : undefined,
            backgroundSize: 'cover', backgroundPosition: 'center',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(180deg, rgba(15,23,42,0.4), rgba(15,23,42,0.95))',
            }} />
          </div>

          <div style={{
            maxWidth: 1100, margin: '-80px auto 0', padding: '0 32px',
            position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap',
          }}>
            <div style={{
              width: 120, height: 120, flexShrink: 0,
              background: '#1e293b', borderRadius: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)', overflow: 'hidden',
              border: '3px solid #0f172a',
            }}>
              {coverSrc
                ? <img src={coverSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 60 }}>📦</span>}
            </div>

            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontSize: 11, opacity: 0.6, fontFamily: 'monospace', marginBottom: 4 }}>
                📦 {pack.path}
              </div>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>
                {pack.path.split('/').filter(Boolean).pop()}
              </h1>
              <div style={{ fontSize: 13, opacity: 0.7, marginTop: 6 }}>
                {pack.creator?.username ? (
                  <Link href={`/users/${encodeURIComponent(pack.creator.username)}`}
                    style={{ color: '#a5b4fc', textDecoration: 'none' }}>
                    {t('byAuthor', { name: pack.creator.username })}
                  </Link>
                ) : t('byAuthor', { name: t('anonymousAuthor') })}
                <span style={{ margin: '0 8px', opacity: 0.4 }}>·</span>
                {t('packIncluded', { count: assets.length })}
                {pack.importCount > 0 && (
                  <>
                    <span style={{ margin: '0 8px', opacity: 0.4 }}>·</span>
                    ↓ {pack.importCount}
                  </>
                )}
              </div>
              {pack.description && (
                <div style={{ fontSize: 13, opacity: 0.75, marginTop: 10, fontStyle: 'italic', maxWidth: 600 }}>
                  “{pack.description}”
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <Link href="/assets/browse?tab=packs" style={{
                fontSize: 12, color: '#a5b4fc', textDecoration: 'none',
                padding: '10px 16px', background: 'rgba(99,102,241,0.18)', borderRadius: 8,
              }}>
                ← {t('marketBackToBrowse')}
              </Link>
              <button onClick={importAll} disabled={importing || imported}
                style={{
                  fontSize: 13, fontWeight: 700,
                  padding: '10px 22px', borderRadius: 8, border: 'none',
                  cursor: imported || importing ? 'default' : 'pointer',
                  background: imported ? 'rgba(16,185,129,0.25)' : '#6366f1',
                  color: imported ? '#6ee7b7' : '#fff',
                  opacity: importing ? 0.6 : 1,
                }}>
                {imported ? '✓ ' + t('packImported') : importing ? t('packImporting') : '↓ ' + t('packImportAll', { count: assets.length })}
              </button>
            </div>
          </div>
        </div>

        {/* 안의 에셋 그리드 */}
        <div style={{ maxWidth: 1100, margin: '40px auto 0', padding: '0 32px 40px' }}>
          <div style={{ fontSize: 12, opacity: 0.5, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {t('packIncluded', { count: assets.length })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
            {assets.map(a => (
              <AssetMarketCard
                key={a.id}
                asset={a}
                kinds={kinds}
                onPreview={setPreviewAsset}
                onImport={() => {}}      /* 개별 가져오기 비활성 — 팩 전체 받기 권장 */
                onToggleLike={() => {}}
                onReport={() => {}}
                imported
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
