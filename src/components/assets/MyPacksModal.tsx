'use client';
/**
 * 내 팩 관리 모달
 * - 팩 리스트 (공개/비공개·에셋 수·가져간 횟수)
 * - 클릭하면 편집
 * - "+ 새 팩 만들기"
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, session, type FolderPack } from '@/lib/api';
import type { Asset } from '@/lib/assets/types';
import FolderPackEditor from './FolderPackEditor';

interface PackWithCount extends FolderPack { assetCount: number }

interface Props {
  allAssets: Asset[];
  onClose: () => void;
}

export default function MyPacksModal({ allAssets, onClose }: Props) {
  const t = useTranslations('Assets');
  const [packs, setPacks] = useState<PackWithCount[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ pack: FolderPack | null; initialPath?: string } | null>(null);

  function load() {
    const tk = session.getToken() || '';
    api.listMyPacks(tk)
      .then(d => { setPacks(d.packs); setError(''); })
      .catch(e => setError(e instanceof Error ? e.message : 'load failed'));
  }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !editing) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, editing]);

  return (
    <>
      {editing && (
        <FolderPackEditor
          initialPack={editing.pack}
          initialPath={editing.initialPath}
          allAssets={allAssets}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
          onDeleted={() => { setEditing(null); load(); }}
        />
      )}

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
            width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto',
            background: '#1e293b', borderRadius: 16, padding: 24, color: '#fff',
            fontFamily: "-apple-system,'Apple SD Gothic Neo',sans-serif",
          }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, opacity: 0.5 }}>{t('myPacksSubtitle')}</div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>📦 {t('myPacksTitle')}</div>
            </div>
            <button onClick={() => setEditing({ pack: null })}
              style={{
                padding: '7px 14px', fontSize: 12, fontWeight: 700,
                background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer',
              }}>
              + {t('packCreateNew')}
            </button>
            <button onClick={onClose}
              style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', opacity: 0.6, marginLeft: 8 }}>
              ✕
            </button>
          </div>

          {error && <div style={{ fontSize: 12, color: '#fca5a5', marginBottom: 12 }}>⚠️ {error}</div>}

          {packs === null ? (
            <div style={{ textAlign: 'center', opacity: 0.5, padding: 20, fontSize: 12 }}>{t('marketLoading')}</div>
          ) : packs.length === 0 ? (
            <div style={{ textAlign: 'center', opacity: 0.45, padding: '40px 0', fontSize: 13 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📦</div>
              {t('myPacksEmpty')}
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {packs.map(p => (
                <li key={p.id}
                  onClick={() => setEditing({ pack: p })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px', marginBottom: 6,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: 10, cursor: 'pointer',
                  }}>
                  <div style={{ fontSize: 22 }}>📦</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.path}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>
                      {t('packIncluded', { count: p.assetCount })}
                      {p.importCount > 0 && <> · ↓ {p.importCount}</>}
                    </div>
                    {p.description && (
                      <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        “{p.description}”
                      </div>
                    )}
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
                    background: p.isPublic ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.08)',
                    color: p.isPublic ? '#6ee7b7' : 'rgba(255,255,255,0.55)',
                  }}>
                    {p.isPublic ? t('publishing') : t('private')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
