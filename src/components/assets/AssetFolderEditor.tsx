'use client';
/**
 * 폴더 편집 모달 — 단일 에셋의 폴더 경로 변경
 * 기존 폴더 자동완성 + 루트로 이동 옵션
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Asset } from '@/lib/assets/types';
import { listFolders, normalizeFolder } from '@/lib/assets/folders';

interface Props {
  asset: Asset;
  allAssets: Asset[];
  onClose: () => void;
  onSave: (folder: string | null) => Promise<void> | void;
}

export default function AssetFolderEditor({ asset, allAssets, onClose, onSave }: Props) {
  const t = useTranslations('Assets');
  const tCommon = useTranslations('Common');
  const [input, setInput] = useState(asset.folder || '');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  // 자동완성 후보
  const allFolders = useMemo(() => listFolders(allAssets), [allAssets]);
  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q) return allFolders.slice(0, 10);
    return allFolders.filter(f => f.toLowerCase().includes(q)).slice(0, 10);
  }, [allFolders, input]);

  const normalized = normalizeFolder(input);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function commit(folder: string | null) {
    setSaving(true);
    try {
      await onSave(folder);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460,
          background: '#1e293b', borderRadius: 16,
          padding: 24, color: '#fff',
          fontFamily: "-apple-system,'Apple SD Gothic Neo',sans-serif",
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, opacity: 0.5 }}>{t('folderEditorFor')}</div>
            <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{asset.name}</div>
          </div>
          <button onClick={onClose} aria-label={tCommon('close')}
            style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', opacity: 0.6 }}>
            ✕
          </button>
        </div>

        {/* 입력 */}
        <div style={{ marginBottom: 8 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="/캐릭터/주인공"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') commit(normalized); }}
            style={{
              width: '100%', padding: '10px 12px', fontSize: 14,
              background: 'rgba(0,0,0,0.3)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
              outline: 'none', fontFamily: 'monospace',
            }}
          />
        </div>

        {/* 미리보기 */}
        <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 12 }}>
          {normalized
            ? <>{t('folderPreview')}: <code style={{ color: '#a5b4fc' }}>{normalized}</code></>
            : <em style={{ opacity: 0.6 }}>{t('folderRootPreview')}</em>}
        </div>

        {/* 자동완성 */}
        {suggestions.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t('folderSuggestions')}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {suggestions.map(f => (
                <button key={f} onClick={() => setInput(f)}
                  style={{
                    padding: '4px 10px', fontSize: 11,
                    background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)',
                    border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6,
                    cursor: 'pointer', fontFamily: 'monospace',
                  }}>
                  📁 {f}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <div style={{ fontSize: 12, color: '#fca5a5', marginBottom: 12 }}>⚠️ {error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={() => commit(null)} disabled={saving}
            style={{
              padding: '8px 14px', fontSize: 12,
              background: 'rgba(239,68,68,0.12)', color: '#fca5a5',
              border: 'none', borderRadius: 8, cursor: 'pointer',
            }}>
            {t('moveToRoot')}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} disabled={saving}
              style={{
                padding: '8px 16px', fontSize: 13,
                background: 'rgba(255,255,255,0.06)', color: '#fff',
                border: 'none', borderRadius: 8, cursor: 'pointer',
              }}>
              {t('cancel')}
            </button>
            <button onClick={() => commit(normalized)} disabled={saving}
              style={{
                padding: '8px 18px', fontSize: 13, fontWeight: 700,
                background: '#6366f1', color: '#fff',
                border: 'none', borderRadius: 8, cursor: 'pointer',
                opacity: saving ? 0.6 : 1,
              }}>
              {saving ? t('saving') : t('save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
