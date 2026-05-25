'use client';
/**
 * 버전 관리 모달 — 목록 + 새 버전 업로드 + 복원 + 삭제
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, session, ApiError } from '@/lib/api';
import type { Asset } from '@/lib/assets/types';

type Version = Awaited<ReturnType<typeof api.listAssetVersions>>['versions'][number];

interface Props {
  asset: Asset;
  onClose: () => void;
  /** 에셋 자체가 업데이트됐을 때 부모에 알림 (modelUrl/version 등) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onAssetChanged: (updated: any) => void;
}

export default function AssetVersionsModal({ asset, onClose, onAssetChanged }: Props) {
  const t = useTranslations('Assets');
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [current, setCurrent]   = useState<number>(asset.currentVersion ?? 1);
  const [error, setError]   = useState('');
  const [acting, setActing] = useState<number | null>(null);

  // 업로드 상태
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [note, setNote]           = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function load() {
    const tk = session.getToken();
    if (!tk) return;
    api.listAssetVersions(tk, asset.id)
      .then(d => {
        setVersions(d.versions);
        setCurrent(d.currentVersion);
      })
      .catch(e => setError(e instanceof ApiError ? e.message : 'load failed'));
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [asset.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function uploadFile(file: File) {
    const tk = session.getToken();
    if (!tk) return;
    setUploading(true);
    setProgress(0);
    setError('');
    try {
      const res = await api.uploadAssetVersion(tk, asset.id, file, note.trim() || undefined, p => setProgress(p));
      onAssetChanged(res.asset);
      setNote('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'upload failed');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  async function revert(v: number) {
    const tk = session.getToken();
    if (!tk) return;
    setActing(v);
    try {
      const res = await api.revertAssetVersion(tk, asset.id, v);
      onAssetChanged(res.asset);
      setCurrent(v);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'revert failed');
    } finally {
      setActing(null);
    }
  }

  async function remove(v: number) {
    if (!confirm(t('versionDeleteConfirm'))) return;
    const tk = session.getToken();
    if (!tk) return;
    setActing(v);
    try {
      await api.deleteAssetVersion(tk, asset.id, v);
      setVersions(prev => prev?.filter(x => x.version !== v) ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'delete failed');
    } finally {
      setActing(null);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto',
          background: '#1e293b', borderRadius: 16, padding: 24, color: '#fff',
          fontFamily: "-apple-system,'Apple SD Gothic Neo',sans-serif",
        }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, opacity: 0.5 }}>{t('versionsTitle')}</div>
            <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {asset.name}
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', opacity: 0.6 }}>
            ✕
          </button>
        </div>

        {/* 새 버전 업로드 */}
        <div style={{
          background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.25)',
          borderRadius: 12, padding: 16, marginBottom: 16,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#a5b4fc' }}>
            ⬆ {t('versionUploadNew')}
          </div>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={t('versionNotePlaceholder')}
            maxLength={300}
            disabled={uploading}
            style={{
              width: '100%', padding: '8px 10px', fontSize: 12, marginBottom: 8,
              background: 'rgba(0,0,0,0.3)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, outline: 'none',
            }}
          />
          <input
            ref={fileRef}
            type="file"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ''; }}
          />
          {uploading ? (
            <>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
                {t('uploadingPercent', { progress })}
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3 }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  background: 'linear-gradient(90deg,#6366f1,#8b5cf6)',
                  width: `${progress}%`, transition: 'width 0.2s ease',
                }} />
              </div>
            </>
          ) : (
            <button onClick={() => fileRef.current?.click()}
              style={{
                width: '100%', padding: '8px', fontSize: 12, fontWeight: 700,
                background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
              }}>
              {t('versionPickFile')}
            </button>
          )}
        </div>

        {error && <div style={{ fontSize: 12, color: '#fca5a5', marginBottom: 12 }}>⚠️ {error}</div>}

        {/* 버전 목록 */}
        {versions === null ? (
          <div style={{ textAlign: 'center', opacity: 0.5, padding: 20, fontSize: 12 }}>{t('marketLoading')}</div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {versions.map(v => {
              const isCurrent = v.version === current;
              return (
                <li key={v.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', marginBottom: 6,
                  background: isCurrent ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${isCurrent ? 'rgba(16,185,129,0.35)' : 'rgba(255,255,255,0.05)'}`,
                  borderRadius: 10,
                }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
                    background: isCurrent ? '#10b981' : 'rgba(255,255,255,0.08)',
                    color: isCurrent ? '#0f172a' : '#fff',
                  }}>
                    v{v.version} {isCurrent && '✓'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      {new Date(v.createdAt).toLocaleString()}
                      {v.fileSize && <> · {(Number(v.fileSize) / 1024 / 1024).toFixed(2)} MB</>}
                    </div>
                    {v.note && (
                      <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2, fontStyle: 'italic' }}>
                        “{v.note}”
                      </div>
                    )}
                  </div>
                  <a href={v.modelUrl} download
                    style={{ fontSize: 10, color: '#a5b4fc', textDecoration: 'none', padding: '4px 8px', background: 'rgba(255,255,255,0.06)', borderRadius: 4 }}>
                    ↓
                  </a>
                  {!isCurrent && (
                    <>
                      <button onClick={() => revert(v.version)} disabled={acting === v.version}
                        style={{
                          fontSize: 10, fontWeight: 700, padding: '4px 8px', border: 'none', borderRadius: 4, cursor: 'pointer',
                          background: 'rgba(99,102,241,0.3)', color: '#c7d2fe',
                          opacity: acting === v.version ? 0.5 : 1,
                        }}>
                        {t('versionRevert')}
                      </button>
                      <button onClick={() => remove(v.version)} disabled={acting === v.version}
                        style={{
                          fontSize: 10, padding: '4px 8px', border: 'none', borderRadius: 4, cursor: 'pointer',
                          background: 'rgba(239,68,68,0.15)', color: '#fca5a5',
                        }}>
                        🗑
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
