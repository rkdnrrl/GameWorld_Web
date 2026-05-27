'use client';
/**
 * 좌측 사이드바 — 카테고리(kind) + 태그 자동 노출
 * Phase 5 에서 폴더 섹션 추가 예정 (지금은 placeholder)
 */
import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Asset, AssetKind } from '@/lib/assets/types';
import { countByKind, topTags } from '@/lib/assets/filters';
import { buildFolderTree, listFolders, normalizeFolder } from '@/lib/assets/folders';
import AssetFolderTree from './AssetFolderTree';

interface Props {
  assets: Asset[];
  kinds: AssetKind[];
  selectedKinds: string[];
  selectedTags: string[];
  selectedFolder: string | null;
  /** assets.folder 에 없지만 사용자가 명시적으로 만든 빈 폴더들 */
  manualFolders?: string[];
  /** 내부 카드 드래그 중 여부 — 드롭 타겟 강조 활성화 */
  dragActive?: boolean;
  onSelectKinds: (next: string[]) => void;
  onToggleTag: (tag: string) => void;
  onSelectFolder: (folder: string | null) => void;
  onDropToFolder: (folder: string | null, files?: File[]) => void;
  onCreateFolder: (path: string) => void;
  onDeleteFolder?: (path: string) => void;
  onFolderMove?: (fromPath: string, toParentPath: string | null) => void;
}

const INITIAL_TAG_LIMIT = 12;

export default function AssetSidebar({
  assets, kinds, selectedKinds, selectedTags, selectedFolder,
  manualFolders = [], dragActive = false,
  onSelectKinds, onToggleTag, onSelectFolder, onDropToFolder, onCreateFolder, onDeleteFolder, onFolderMove,
}: Props) {
  const t = useTranslations('Assets');
  const counts     = countByKind(assets, kinds);
  const totalCount = assets.length;
  const isAll      = selectedKinds.length === 0;

  const tags    = topTags(assets);
  const [tagExpanded, setTagExpanded] = useState(false);
  const visibleTags = tagExpanded ? tags : tags.slice(0, INITIAL_TAG_LIMIT);

  // 폴더 트리 — 에셋이 가진 폴더 + 사용자가 만든 빈 폴더 머지
  const folderTree = useMemo(() => {
    const fromAssets = listFolders(assets);
    const all = Array.from(new Set([...fromAssets, ...manualFolders])).sort();
    return buildFolderTree(all);
  }, [assets, manualFolders]);
  const rootCount  = useMemo(
    () => assets.filter(a => !normalizeFolder(a.folder)).length,
    [assets],
  );

  // 새 폴더 입력 UI
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  function commitCreate() {
    const normalized = normalizeFolder(draft);
    if (normalized) onCreateFolder(normalized);
    setCreating(false);
    setDraft('');
  }

  return (
    <aside style={{
      width: 220, flexShrink: 0, padding: '20px 12px',
      borderRight: '1px solid rgba(255,255,255,0.08)',
      fontSize: 13,
    }}>
      {/* ── 카테고리 ── */}
      <div style={{ fontSize: 10, opacity: 0.4, textTransform: 'uppercase', letterSpacing: 0.5, padding: '0 8px', marginBottom: 6 }}>
        {t('sidebarCategory')}
      </div>

      <SidebarRow
        icon="📦"
        label={t('all')}
        count={totalCount}
        active={isAll}
        onClick={() => onSelectKinds([])}
      />

      {kinds.map(k => (
        <SidebarRow
          key={k.id}
          icon={k.icon || '•'}
          label={k.label}
          count={counts[k.id] || 0}
          active={!isAll && selectedKinds.includes(k.id)}
          onClick={() => onSelectKinds(selectedKinds.includes(k.id) ? [] : [k.id])}
        />
      ))}

      {/* ── 태그 ── */}
      <div style={{ fontSize: 10, opacity: 0.4, textTransform: 'uppercase', letterSpacing: 0.5, padding: '20px 8px 6px' }}>
        {t('sidebarTag')}
      </div>

      {tags.length === 0 ? (
        <div style={{ padding: '6px 10px', fontSize: 11, opacity: 0.35 }}>{t('noTagsYet')}</div>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '0 4px' }}>
            {visibleTags.map(({ tag, count }) => {
              const active = selectedTags.includes(tag);
              return (
                <button key={tag} onClick={() => onToggleTag(tag)}
                  style={{
                    padding: '3px 8px', fontSize: 11,
                    background: active ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.05)',
                    color: active ? '#fff' : 'rgba(255,255,255,0.7)',
                    border: 'none', borderRadius: 5, cursor: 'pointer',
                    fontWeight: active ? 700 : 500,
                  }}>
                  {tag} <span style={{ opacity: 0.5, fontSize: 10 }}>{count}</span>
                </button>
              );
            })}
          </div>
          {tags.length > INITIAL_TAG_LIMIT && (
            <button onClick={() => setTagExpanded(!tagExpanded)}
              style={{
                width: '100%', marginTop: 6,
                padding: '4px', fontSize: 10,
                background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)',
                cursor: 'pointer',
              }}>
              {tagExpanded ? t('showLess') : t('showMoreTags', { count: tags.length - INITIAL_TAG_LIMIT })}
            </button>
          )}
        </>
      )}

      {/* ── 폴더 ── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '20px 8px 6px',
      }}>
        <div style={{ flex: 1, fontSize: 10, opacity: 0.4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {t('sidebarFolder')}
        </div>
        <button
          onClick={() => {
            setCreating(true);
            setDraft(selectedFolder && selectedFolder !== '' ? `${selectedFolder}/` : '/');
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          title={t('createFolderTitle')}
          style={{
            width: 20, height: 20, padding: 0,
            background: 'transparent', color: 'rgba(255,255,255,0.5)',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4,
            cursor: 'pointer', fontSize: 12, lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          +
        </button>
      </div>

      {creating && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 4px 6px' }}>
          <span style={{ fontSize: 14 }}>📁</span>
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitCreate(); }
              else if (e.key === 'Escape') { setCreating(false); setDraft(''); }
            }}
            onBlur={commitCreate}
            placeholder={t('createFolderPlaceholder')}
            style={{
              flex: 1, padding: '4px 6px', fontSize: 11,
              background: 'rgba(0,0,0,0.4)', color: '#fff',
              border: '1px solid rgba(99,102,241,0.5)', borderRadius: 4,
              outline: 'none', fontFamily: 'monospace', minWidth: 0,
            }}
          />
        </div>
      )}

      {folderTree.length === 0 && rootCount === 0 && !dragActive && !creating ? (
        <div style={{ padding: '6px 10px', fontSize: 11, opacity: 0.35 }}>{t('noFoldersYet')}</div>
      ) : (
        <AssetFolderTree
          nodes={folderTree}
          selectedFolder={selectedFolder}
          rootCount={rootCount}
          dragActive={dragActive}
          onSelect={onSelectFolder}
          onDrop={onDropToFolder}
          onDeleteFolder={onDeleteFolder}
          onFolderMove={onFolderMove}
        />
      )}
    </aside>
  );
}

function SidebarRow({ icon, label, count, active, onClick }: {
  icon: string;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 10px', marginBottom: 2,
        background: active ? 'rgba(99,102,241,0.18)' : 'transparent',
        border: 'none', borderRadius: 8,
        color: active ? '#c7d2fe' : 'rgba(255,255,255,0.78)',
        fontSize: 13, cursor: 'pointer', textAlign: 'left',
        transition: 'background .12s',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ width: 18, textAlign: 'center' }}>{icon}</span>
      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <span style={{ fontSize: 11, opacity: 0.45 }}>{count}</span>
    </button>
  );
}
