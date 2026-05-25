'use client';
/**
 * 그리드 — Asset[] 받아서 카드 나열만
 */
import type { Asset, AssetKind } from '@/lib/assets/types';
import AssetCard from './AssetCard';

interface Props {
  assets: Asset[];
  kinds: AssetKind[];
  selectedTags?: string[];
  selectedFolder?: string | null;
  selectedIds?: Set<string>;
  emptyMessage: string;
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
  onRename: (a: Asset, newName: string) => Promise<void> | void;
  onDragStart: (a: Asset, e: React.DragEvent) => void;
  onDragEnd: () => void;
}

export default function AssetGrid({
  assets, kinds, selectedTags, selectedFolder, selectedIds, emptyMessage,
  onEdit, onPreview, onEditTags, onEditFolder, onClickTag, onClickFolder,
  onToggleSelect, onTogglePublic, onDelete, onEditVersions, onRename,
  onDragStart, onDragEnd,
}: Props) {
  if (assets.length === 0) {
    return (
      <div style={{ textAlign: 'center', opacity: 0.35, padding: '48px 0', fontSize: 14 }}>
        {emptyMessage}
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
      {assets.map(a => (
        <AssetCard
          key={a.id}
          asset={a}
          kinds={kinds}
          selectedTags={selectedTags}
          selectedFolder={selectedFolder}
          selected={selectedIds?.has(a.id) ?? false}
          onEdit={onEdit}
          onPreview={onPreview}
          onEditTags={onEditTags}
          onEditFolder={onEditFolder}
          onClickTag={onClickTag}
          onClickFolder={onClickFolder}
          onToggleSelect={onToggleSelect}
          onTogglePublic={onTogglePublic}
          onDelete={onDelete}
          onEditVersions={onEditVersions}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />
      ))}
    </div>
  );
}
