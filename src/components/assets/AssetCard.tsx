'use client';
/**
 * 에셋 카드 — kind 핸들러에서 Thumbnail/Editor 가져옴
 * 미등록 kind 는 일반 박스로 fallback (다운로드만 가능)
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Asset, AssetKind } from '@/lib/assets/types';
import { detectKindFromUrl } from '@/lib/assets/types';
import { getKind } from '@/lib/assets/registry';
import { session } from '@/lib/api';

interface Props {
  asset: Asset;
  kinds: AssetKind[];
  selectedTags?: string[];
  selectedFolder?: string | null;
  selected?: boolean;
  onEdit: (a: Asset) => void;
  onPreview: (a: Asset) => void;
  onEditTags: (a: Asset) => void;
  onEditFolder: (a: Asset) => void;
  onClickTag: (tag: string) => void;
  onClickFolder: (folder: string) => void;
  onToggleSelect: (id: string, e: React.MouseEvent) => void;
  onTogglePublic: (a: Asset) => void;
  onDelete: (id: string) => void;
  onEditVersions: (a: Asset) => void;
  /** 이름 변경 — 성공 시 부모가 state 갱신 */
  onRename: (a: Asset, newName: string) => Promise<void> | void;
  /** 드래그 시작 — 부모가 어떤 id 들 함께 보낼지 결정 */
  onDragStart: (a: Asset, e: React.DragEvent) => void;
  onDragEnd: () => void;
}

const MAX_VISIBLE_TAGS = 3;

export default function AssetCard({
  asset, kinds, selectedTags = [], selectedFolder, selected = false,
  onEdit, onPreview, onEditTags, onEditFolder, onClickTag, onClickFolder,
  onToggleSelect, onTogglePublic, onDelete, onEditVersions, onRename,
  onDragStart, onDragEnd,
}: Props) {
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(asset.name);
  const [saving, setSaving]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOperator, setIsOperator] = useState(false);

  useEffect(() => { setDraft(asset.name); }, [asset.name]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);
  useEffect(() => { setIsOperator(!!session.getUser()?.isOperator); }, []);

  // 다운로드는 자신이 올린 에셋이거나 운영자일 때만 — 참조(가져온) 에셋은 원본 소유자 파일이라 제외
  const canDownload = !asset.metadata?.referenceOnly || isOperator;

  async function commitRename() {
    const next = draft.trim().slice(0, 100);
    if (!next || next === asset.name) { setEditing(false); setDraft(asset.name); return; }
    setSaving(true);
    try {
      await onRename(asset, next);
      setEditing(false);
    } catch {
      // 에러 시 원복
      setDraft(asset.name);
    } finally {
      setSaving(false);
    }
  }
  const t = useTranslations('Assets');
  const kindId  = asset.kind || detectKindFromUrl(asset.modelUrl, kinds);
  const kindDef = kinds.find(k => k.id === kindId);
  const handler = getKind(kindId);
  const Thumb   = handler?.Thumbnail;

  // Editor 우선, 없으면 Preview, 둘 다 없으면 클릭 불가 (다운로드 only)
  const clickAction: 'edit' | 'preview' | null =
    handler?.Editor ? 'edit' : handler?.Preview ? 'preview' : null;

  return (
    <div
      draggable
      onDragStart={e => { setDragging(true); onDragStart(asset, e); }}
      onDragEnd={() => { setDragging(false); onDragEnd(); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: selected ? 'rgba(99,102,241,0.10)' : 'rgba(255,255,255,0.05)',
        borderRadius: 14,
        border: `1px solid ${selected ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.08)'}`,
        overflow: 'hidden',
        transition: 'border-color .15s, background .15s, opacity .15s',
        position: 'relative',
        opacity: dragging ? 0.4 : 1,
        cursor: 'grab',
      }}>
      {/* 썸네일 영역 */}
      <div
        onClick={() => {
          if (clickAction === 'edit') onEdit(asset);
          else if (clickAction === 'preview') onPreview(asset);
        }}
        style={{
          width: '100%', aspectRatio: '1', background: 'rgba(255,255,255,0.03)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', cursor: clickAction ? 'pointer' : 'default',
          overflow: 'hidden',
        }}>
        {Thumb
          ? <Thumb asset={asset} />
          : <span style={{ fontSize: 44, opacity: 0.4 }}>{kindDef?.icon || '📄'}</span>}

        {/* 선택 체크박스 — 좌상단, 선택/호버 시 표시 */}
        <button
          onClick={e => { e.stopPropagation(); onToggleSelect(asset.id, e); }}
          title={t('selectToggle')}
          aria-label={t('selectToggle')}
          style={{
            position: 'absolute', top: 6, left: 6, zIndex: 2,
            width: 22, height: 22, padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: selected ? '#6366f1' : 'rgba(0,0,0,0.55)',
            color: '#fff', fontSize: 12, fontWeight: 900,
            border: `1px solid ${selected ? '#a5b4fc' : 'rgba(255,255,255,0.3)'}`,
            borderRadius: 4, cursor: 'pointer',
            backdropFilter: 'blur(4px)',
            opacity: (selected || hovered) ? 1 : 0,
            transition: 'opacity .12s',
          }}>
          {selected ? '✓' : ''}
        </button>

        {/* kind 배지 — 체크박스와 겹치지 않도록 우측 정렬 */}
        {kindDef && (
          <span style={{
            position: 'absolute', top: 8, left: 32,
            background: 'rgba(0,0,0,0.55)', color: '#fff',
            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
            backdropFilter: 'blur(4px)',
          }}>
            {kindDef.icon} {kindDef.label}
          </span>
        )}

        {asset.isPublic && (
          <span style={{
            position: 'absolute', top: 8, right: 8,
            background: 'rgba(16,185,129,0.9)', color: '#fff',
            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
          }}>{t('publishing')}</span>
        )}
      </div>

      {/* 정보 */}
      <div style={{ padding: '10px 12px' }}>
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            disabled={saving}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
              else if (e.key === 'Escape') { setEditing(false); setDraft(asset.name); }
            }}
            onClick={e => e.stopPropagation()}
            maxLength={100}
            style={{
              width: '100%', padding: '4px 6px', fontSize: 13, fontWeight: 700,
              background: 'rgba(0,0,0,0.4)', color: '#fff',
              border: '1px solid rgba(99,102,241,0.5)', borderRadius: 4,
              outline: 'none', marginBottom: 6,
            }}
          />
        ) : (
          <div
            onClick={e => { e.stopPropagation(); setEditing(true); }}
            title={t('renameHint')}
            style={{
              fontWeight: 700, fontSize: 13, marginBottom: 6,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              cursor: 'text', padding: '4px 6px', margin: '-4px -6px 2px',
              borderRadius: 4,
              background: hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
              transition: 'background .12s',
            }}>
            {asset.name}
            {hovered && <span style={{ marginLeft: 6, opacity: 0.4, fontSize: 10, fontWeight: 400 }}>✎</span>}
          </div>
        )}

        {/* 폴더 배지 — 클릭=필터, 길게 클릭/우클릭=편집 (간단히 ⋯ 버튼으로) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, minHeight: 18 }}>
          {asset.folder ? (
            <button
              onClick={e => { e.stopPropagation(); onClickFolder(asset.folder!); }}
              title={t('folderClickToFilter')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 7px', fontSize: 10,
                background: selectedFolder === asset.folder ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.05)',
                color: selectedFolder === asset.folder ? '#fff' : 'rgba(255,255,255,0.65)',
                border: 'none', borderRadius: 4,
                cursor: 'pointer', maxWidth: '70%',
                fontFamily: 'monospace',
              }}>
              <span style={{ flexShrink: 0 }}>📁</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.folder}</span>
            </button>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); onEditFolder(asset); }}
              title={t('moveToFolder')}
              style={{
                padding: '0 7px', fontSize: 10,
                background: 'transparent', color: 'rgba(255,255,255,0.35)',
                border: '1px dashed rgba(255,255,255,0.12)', borderRadius: 4,
                cursor: 'pointer',
              }}>
              📁 {t('noFolder')}
            </button>
          )}
          {asset.folder && (
            <button
              onClick={e => { e.stopPropagation(); onEditFolder(asset); }}
              title={t('moveAsset')}
              style={{
                padding: '0 4px', fontSize: 10,
                background: 'transparent', color: 'rgba(255,255,255,0.4)',
                border: 'none', cursor: 'pointer',
              }}>
              ⋯
            </button>
          )}
        </div>

        {/* 태그 라인 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8, minHeight: 18 }}>
          {(asset.tags || []).slice(0, MAX_VISIBLE_TAGS).map(tag => {
            const active = selectedTags.includes(tag);
            return (
              <button key={tag}
                onClick={e => { e.stopPropagation(); onClickTag(tag); }}
                title={t('tagClickToFilter')}
                style={{
                  padding: '1px 6px', fontSize: 10,
                  background: active ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.06)',
                  color: active ? '#fff' : 'rgba(255,255,255,0.65)',
                  border: 'none', borderRadius: 4,
                  cursor: 'pointer', fontWeight: active ? 700 : 500,
                }}>
                #{tag}
              </button>
            );
          })}
          {(asset.tags || []).length > MAX_VISIBLE_TAGS && (
            <span style={{ fontSize: 10, opacity: 0.5, padding: '1px 4px' }}>
              +{(asset.tags || []).length - MAX_VISIBLE_TAGS}
            </span>
          )}
          <button
            onClick={e => { e.stopPropagation(); onEditTags(asset); }}
            title={t('editTags')}
            style={{
              padding: '0 6px', fontSize: 10,
              background: 'transparent', color: 'rgba(255,255,255,0.4)',
              border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 4,
              cursor: 'pointer',
            }}>
            + {t('tag')}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {canDownload && (
            <a
              href={asset.modelUrl}
              download
              style={{ fontSize: 11, color: '#818cf8', textDecoration: 'none', padding: '3px 8px', background: 'rgba(99,102,241,0.15)', borderRadius: 5 }}
            >
              {t('download')}
            </a>
          )}
          {(asset.metadata?.referenceOnly || asset.metadata?.importedFrom) ? (
            // 마켓에서 가져온(참조) 에셋 — 원본 소유자 것이라 공개/비공개 전환 불가.
            // 옛 데이터 호환: referenceOnly 가 없어도 importedFrom 있으면 동일 취급.
            <span
              title={t('referencedHint')}
              style={{
                fontSize: 11, padding: '3px 8px', borderRadius: 5,
                background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)',
                display: 'inline-flex', alignItems: 'center', gap: 3,
              }}
            >
              🔗 {t('referenced')}
            </span>
          ) : (
            <button
              onClick={() => onTogglePublic(asset)}
              style={{
                fontSize: 11, cursor: 'pointer', padding: '3px 8px', borderRadius: 5, border: 'none',
                background: asset.isPublic ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.08)',
                color: asset.isPublic ? '#6ee7b7' : 'rgba(255,255,255,0.5)',
              }}
            >
              {asset.isPublic ? t('publishing') : t('private')}
            </button>
          )}
          <button
            onClick={() => onEditVersions(asset)}
            title={t('versionsTitle')}
            style={{
              fontSize: 11, cursor: 'pointer', padding: '3px 8px', borderRadius: 5, border: 'none',
              background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)',
            }}
          >
            v{asset.currentVersion ?? 1}
          </button>
          <button
            onClick={() => onDelete(asset.id)}
            style={{
              fontSize: 11, cursor: 'pointer', padding: '3px 8px', borderRadius: 5, border: 'none',
              background: 'rgba(239,68,68,0.12)', color: '#fca5a5',
            }}
          >
            {t('delete')}
          </button>
        </div>
      </div>
    </div>
  );
}
