'use client';
/**
 * 스튜디오 안에서 띄우는 마켓플레이스 모달.
 * 공개 에셋을 검색·둘러보고 "내 라이브러리로" 가져오면(clone) → onImported() 로 스튜디오 에셋 목록 즉시 동기화.
 * /assets/browse 페이지의 마켓을 모달 형태로 재사용 (api.listPublicAssets + cloneAsset).
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import type { Asset } from '@/lib/assets/types';

const PAGE_SIZE = 24;

export default function StudioMarketModal({ token, onClose, onImported }: {
  token: string;
  onClose: () => void;
  /** 가져오기(clone) 성공 시 호출 — 스튜디오가 myAssets 를 재조회해 즉시 반영. */
  onImported: () => void;
}) {
  const t = useTranslations('Assets');
  const [q, setQ] = useState('');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const qRef = useRef('');

  const load = async (pageNum: number, query: string, append: boolean) => {
    setLoading(true); setError('');
    try {
      const res = await api.listPublicAssets({ q: query || undefined, sort: 'popular', page: pageNum, pageSize: PAGE_SIZE }, token);
      setAssets(prev => append ? [...prev, ...(res.assets as Asset[])] : (res.assets as Asset[]));
      setHasMore(res.hasMore);
      setPage(pageNum);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('marketEmpty'));
    } finally {
      setLoading(false);
    }
  };

  // 최초 로드 + 검색어 변경 시 (300ms 디바운스)
  useEffect(() => {
    qRef.current = q;
    const id = setTimeout(() => { if (qRef.current === q) load(1, q, false); }, q ? 300 : 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // ESC 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function importAsset(a: Asset) {
    if (importingId || importedIds.has(a.id)) return;
    setImportingId(a.id); setError('');
    try {
      await api.cloneAsset(token, a.id);
      setImportedIds(prev => new Set(prev).add(a.id));
      onImported();   // ← 스튜디오 myAssets 즉시 재조회
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('marketImporting'));
    } finally {
      setImportingId(null);
    }
  }

  return createPortal((
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.82)', zIndex: 16777000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 'min(900px, 96vw)', height: 'min(680px, 90vh)', display: 'flex', flexDirection: 'column',
        background: '#0f172a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14,
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)', color: '#fff', fontFamily: 'system-ui, sans-serif', overflow: 'hidden',
      }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <strong style={{ fontSize: 16, fontWeight: 800 }}>🛒 {t('marketTitle')}</strong>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={t('searchPlaceholder')}
            autoFocus
            style={{ flex: 1, padding: '8px 12px', fontSize: 13, background: 'rgba(0,0,0,0.4)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, outline: 'none' }}
          />
          <button onClick={onClose} aria-label="close" style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        {error && <div style={{ padding: '8px 18px', color: '#fca5a5', fontSize: 12 }}>{error}</div>}

        {/* 그리드 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {assets.length === 0 && !loading && (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', padding: '60px 0', fontSize: 14 }}>{t('marketEmpty')}</div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {assets.map(a => {
              const imported = importedIds.has(a.id);
              return (
                <div key={a.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ aspectRatio: '1 / 1', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {a.thumbnailUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={a.thumbnailUrl} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 32, opacity: 0.5 }}>📦</span>}
                  </div>
                  <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                    <button
                      onClick={() => importAsset(a)}
                      disabled={importing(importingId, a.id) || imported}
                      style={{ marginTop: 'auto', padding: '6px 8px', fontSize: 12, fontWeight: 700, borderRadius: 6, border: 'none', cursor: imported ? 'default' : 'pointer',
                        background: imported ? 'rgba(16,185,129,0.18)' : 'rgba(99,102,241,0.85)', color: imported ? '#6ee7b7' : '#fff' }}>
                      {imported ? `✓ ${t('marketImported')}` : importing(importingId, a.id) ? t('marketImporting') : `↓ ${t('marketImport')}`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {hasMore && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button onClick={() => load(page + 1, q, true)} disabled={loading}
                style={{ padding: '8px 20px', fontSize: 13, fontWeight: 700, background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                {loading ? t('marketLoading') : t('marketLoadMore')}
              </button>
            </div>
          )}
          {loading && assets.length === 0 && <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', padding: '60px 0' }}>{t('marketLoading')}</div>}
        </div>
      </div>
    </div>
  ), document.body);
}

function importing(importingId: string | null, id: string): boolean {
  return importingId === id;
}
