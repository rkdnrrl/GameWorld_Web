'use client';
/**
 * 팩 편집 모달 — 단일 팩 생성/수정
 * - 폴더 경로 (자동완성)
 * - 공개 여부
 * - 설명
 * - 커버 에셋 (해당 폴더 안의 이미지 자산 중 선택)
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, session, type FolderPack } from '@/lib/api';
import type { Asset } from '@/lib/assets/types';
import { listFolders, normalizeFolder } from '@/lib/assets/folders';

interface Props {
  /** 수정 모드면 기존 팩, 신규면 null */
  initialPack: FolderPack | null;
  /** 신규일 때 폴더 prefill */
  initialPath?: string;
  allAssets: Asset[];
  onClose: () => void;
  onSaved: (pack: FolderPack) => void;
  onDeleted?: (id: string) => void;
}

export default function FolderPackEditor({ initialPack, initialPath, allAssets, onClose, onSaved, onDeleted }: Props) {
  const t = useTranslations('Assets');
  const [pathInput, setPathInput]   = useState(initialPack?.path || initialPath || '');
  const [isPublic, setIsPublic]     = useState(initialPack?.isPublic ?? true);
  const [description, setDescription] = useState(initialPack?.description || '');
  const [coverId, setCoverId]       = useState<string | null>(initialPack?.coverAssetId || null);
  const [saving, setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError]     = useState('');

  const normalizedPath = normalizeFolder(pathInput);

  // 자동완성: 기존 폴더 목록
  const allFolders = useMemo(() => listFolders(allAssets), [allAssets]);
  const folderSuggestions = useMemo(() => {
    const q = pathInput.trim().toLowerCase();
    return allFolders.filter(f => f.toLowerCase().includes(q)).slice(0, 8);
  }, [allFolders, pathInput]);

  // 팩에 포함될 에셋들 (현재 폴더 기준)
  const includedAssets = useMemo(() => {
    if (!normalizedPath) return [];
    return allAssets.filter(a => {
      const f = a.folder || '';
      return f === normalizedPath || f.startsWith(normalizedPath + '/');
    });
  }, [allAssets, normalizedPath]);

  // 커버 후보 (이미지 자산 우선)
  const coverCandidates = useMemo(() => {
    const imgs = includedAssets.filter(a => a.kind === 'image');
    return imgs.length > 0 ? imgs : includedAssets;
  }, [includedAssets]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function save() {
    if (!normalizedPath) { setError(t('packPathInvalid')); return; }
    setSaving(true); setError('');
    try {
      const tk = session.getToken() || '';
      const res = await api.upsertPack(tk, {
        path: normalizedPath, isPublic, description: description.trim() || undefined,
        coverAssetId: coverId,
      });
      onSaved(res.pack);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed');
      setSaving(false);
    }
  }

  async function remove() {
    if (!initialPack) return;
    if (!confirm(t('packDeleteConfirm'))) return;
    setDeleting(true);
    try {
      const tk = session.getToken() || '';
      await api.deletePack(tk, initialPack.id);
      onDeleted?.(initialPack.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'delete failed');
      setDeleting(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 110,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto',
          background: '#1e293b', borderRadius: 16, padding: 24, color: '#fff',
          fontFamily: "-apple-system,'Apple SD Gothic Neo',sans-serif",
        }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, opacity: 0.5 }}>{initialPack ? t('packEditTitle') : t('packCreateTitle')}</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>📦 {t('packTitle')}</div>
          </div>
          <button onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', opacity: 0.6 }}>
            ✕
          </button>
        </div>

        {/* 폴더 경로 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 6 }}>{t('packFolderPath')}</div>
          <input
            value={pathInput}
            onChange={e => setPathInput(e.target.value)}
            placeholder="/캐릭터/주인공"
            disabled={!!initialPack}                          // 수정 시 path 변경 불가 (다른 팩으로 보는 게 맞음)
            style={{
              width: '100%', padding: '8px 10px', fontSize: 13,
              background: 'rgba(0,0,0,0.3)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
              outline: 'none', fontFamily: 'monospace', opacity: initialPack ? 0.6 : 1,
            }}
          />
          {!initialPack && folderSuggestions.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
              {folderSuggestions.map(f => (
                <button key={f} onClick={() => setPathInput(f)}
                  style={{
                    padding: '3px 8px', fontSize: 10,
                    background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)',
                    border: 'none', borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace',
                  }}>
                  📁 {f}
                </button>
              ))}
            </div>
          )}
          <div style={{ fontSize: 10, opacity: 0.5, marginTop: 4 }}>
            {normalizedPath
              ? <>{t('packPreview')}: <code style={{ color: '#a5b4fc' }}>{normalizedPath}</code> · {t('packIncluded', { count: includedAssets.length })}</>
              : <em style={{ opacity: 0.6 }}>{t('packPathHint')}</em>}
          </div>
        </div>

        {/* 공개 토글 */}
        <label style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px', marginBottom: 12,
          background: isPublic ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${isPublic ? 'rgba(16,185,129,0.35)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 8, cursor: 'pointer',
        }}>
          <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)}
            style={{ accentColor: '#10b981', width: 16, height: 16 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{t('packIsPublic')}</div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>{t('packIsPublicHint')}</div>
          </div>
        </label>

        {/* 설명 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 6 }}>{t('packDescription')}</div>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={t('packDescriptionPlaceholder')}
            maxLength={500}
            rows={3}
            style={{
              width: '100%', padding: '8px 10px', fontSize: 13,
              background: 'rgba(0,0,0,0.3)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
              outline: 'none', resize: 'vertical', fontFamily: 'inherit',
            }}
          />
          <div style={{ textAlign: 'right', fontSize: 10, opacity: 0.4, marginTop: 2 }}>{description.length}/500</div>
        </div>

        {/* 커버 선택 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 6 }}>{t('packCover')}</div>
          {coverCandidates.length === 0 ? (
            <div style={{ fontSize: 11, opacity: 0.4, padding: '12px', textAlign: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
              {t('packCoverEmpty')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button onClick={() => setCoverId(null)}
                style={{
                  width: 56, height: 56, fontSize: 18,
                  background: coverId === null ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${coverId === null ? '#a5b4fc' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 6, cursor: 'pointer', color: '#fff',
                }}>📦</button>
              {coverCandidates.map(a => (
                <button key={a.id} onClick={() => setCoverId(a.id)}
                  style={{
                    width: 56, height: 56, padding: 0, overflow: 'hidden',
                    border: `1px solid ${coverId === a.id ? '#a5b4fc' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: 6, cursor: 'pointer', background: 'transparent',
                  }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.thumbnailUrl || a.modelUrl} alt={a.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {error && <div style={{ fontSize: 12, color: '#fca5a5', marginBottom: 12 }}>⚠️ {error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
          {initialPack ? (
            <button onClick={remove} disabled={deleting || saving}
              style={{
                padding: '8px 14px', fontSize: 12,
                background: 'rgba(239,68,68,0.15)', color: '#fca5a5',
                border: 'none', borderRadius: 8, cursor: 'pointer',
              }}>
              {deleting ? t('saving') : '🗑 ' + t('packDelete')}
            </button>
          ) : <div />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} disabled={saving || deleting}
              style={{
                padding: '8px 16px', fontSize: 13,
                background: 'rgba(255,255,255,0.06)', color: '#fff',
                border: 'none', borderRadius: 8, cursor: 'pointer',
              }}>
              {t('cancel')}
            </button>
            <button onClick={save} disabled={saving || deleting || !normalizedPath}
              style={{
                padding: '8px 18px', fontSize: 13, fontWeight: 700,
                background: '#6366f1', color: '#fff',
                border: 'none', borderRadius: 8, cursor: 'pointer',
                opacity: (saving || !normalizedPath) ? 0.6 : 1,
              }}>
              {saving ? t('saving') : t('save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
