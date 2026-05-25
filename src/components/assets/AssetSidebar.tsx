'use client';
/**
 * 좌측 사이드바 — 카테고리(kind) + 태그 자동 노출
 * Phase 5 에서 폴더 섹션 추가 예정 (지금은 placeholder)
 */
import { useMemo, useState } from 'react';
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
  /** 드래그 중 여부 — 드롭 타겟 강조 활성화 */
  dragActive?: boolean;
  onSelectKinds: (next: string[]) => void;
  onToggleTag: (tag: string) => void;
  onSelectFolder: (folder: string | null) => void;
  /** 폴더에 에셋 드롭 — folder null = 루트로 */
  onDropToFolder: (folder: string | null) => void;
}

const INITIAL_TAG_LIMIT = 12;

export default function AssetSidebar({
  assets, kinds, selectedKinds, selectedTags, selectedFolder,
  onSelectKinds, onToggleTag, onSelectFolder,
}: Props) {
  const t = useTranslations('Assets');
  const counts     = countByKind(assets, kinds);
  const totalCount = assets.length;
  const isAll      = selectedKinds.length === 0;

  const tags    = topTags(assets);
  const [tagExpanded, setTagExpanded] = useState(false);
  const visibleTags = tagExpanded ? tags : tags.slice(0, INITIAL_TAG_LIMIT);

  // 폴더 트리
  const folderTree = useMemo(() => buildFolderTree(listFolders(assets)), [assets]);
  const rootCount  = useMemo(
    () => assets.filter(a => !normalizeFolder(a.folder)).length,
    [assets],
  );

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
      <div style={{ fontSize: 10, opacity: 0.4, textTransform: 'uppercase', letterSpacing: 0.5, padding: '20px 8px 6px' }}>
        {t('sidebarFolder')}
      </div>
      {folderTree.length === 0 && rootCount === 0 ? (
        <div style={{ padding: '6px 10px', fontSize: 11, opacity: 0.35 }}>{t('noFoldersYet')}</div>
      ) : (
        <AssetFolderTree
          nodes={folderTree}
          selectedFolder={selectedFolder}
          rootCount={rootCount}
          onSelect={onSelectFolder}
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
