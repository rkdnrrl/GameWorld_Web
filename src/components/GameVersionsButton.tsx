'use client';
/**
 * 게임 버전 히스토리 — 버튼 클릭 시 모달 열기.
 *  - 운영자 승인 시점 game_versions INSERT 된 행을 최신순으로 표시
 *  - V1 = read-only (목록·날짜·승인자만). 롤백/메모 추가는 V2.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';

interface VersionRow {
  id: string;
  version: number;
  note: string | null;
  createdAt: string;
  approvedBy: string | null;
}

export default function GameVersionsButton({ slug }: { slug: string }) {
  const t = useTranslations('GameVersions');
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ currentVersion: number; versions: VersionRow[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError('');
    api.listGameVersions(slug)
      .then(d => setData(d))
      .catch(e => setError(e instanceof ApiError ? e.message : 'load failed'))
      .finally(() => setLoading(false));
  }, [open, slug]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function fmtDate(s: string) {
    try { return new Date(s).toLocaleString(); } catch { return s; }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: '6px 12px', fontSize: 12, fontWeight: 600,
          background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)',
          border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
          cursor: 'pointer',
        }}
      >📜 {t('button')}</button>
      {open && (
        <div
          role="dialog"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <div style={{
            width: 'min(620px, 92vw)', maxHeight: '80vh', overflow: 'auto',
            background: '#0f172a', color: '#fff', borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)',
            }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>📜 {t('title')}</div>
              <button onClick={() => setOpen(false)} aria-label="close"
                style={{
                  background: 'transparent', border: 'none', color: '#fff',
                  fontSize: 22, cursor: 'pointer', padding: 4, lineHeight: 1,
                }}>✕</button>
            </div>
            <div style={{ padding: '14px 20px' }}>
              {loading && <div style={{ opacity: 0.5, padding: '20px 0', textAlign: 'center' }}>…</div>}
              {error && <div style={{ color: '#fca5a5', padding: '10px 0' }}>{error}</div>}
              {data && data.versions.length === 0 && (
                <div style={{ opacity: 0.5, padding: '24px 0', textAlign: 'center' }}>{t('empty')}</div>
              )}
              {data && data.versions.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.versions.map(v => (
                    <div key={v.id} style={{
                      padding: '10px 14px', borderRadius: 8,
                      background: v.version === data.currentVersion ? 'rgba(16,185,129,0.18)' : 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontWeight: 800 }}>
                          v{v.version}
                          {v.version === data.currentVersion && (
                            <span style={{ marginLeft: 8, fontSize: 11, color: '#34d399' }}>● {t('current')}</span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, opacity: 0.6 }}>{fmtDate(v.createdAt)}</div>
                      </div>
                      {v.note && <div style={{ fontSize: 13, marginTop: 4, opacity: 0.85 }}>{v.note}</div>}
                      {v.approvedBy && (
                        <div style={{ fontSize: 11, marginTop: 4, opacity: 0.55 }}>
                          {t('approvedBy', { name: v.approvedBy })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
