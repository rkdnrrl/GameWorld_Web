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
  emptyMessage: string;
  onEdit: (a: Asset) => void;
  onPreview: (a: Asset) => void;
  onEditTags: (a: Asset) => void;
  onEditFolder: (a: Asset) => void;
  onClickTag: (tag: string) => void;
  onClickFolder: (folder: string) => void;
  onTogglePublic: (a: Asset) => void;
  onDelete: (id: string) => void;
}

export default function AssetGrid({
  assets, kinds, selectedTags, selectedFolder, emptyMessage,
  onEdit, onPreview, onEditTags, onEditFolder, onClickTag, onClickFolder,
  onTogglePublic, onDelete,
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
          onEdit={onEdit}
          onPreview={onPreview}
          onEditTags={onEditTags}
          onEditFolder={onEditFolder}
          onClickTag={onClickTag}
          onClickFolder={onClickFolder}
          onTogglePublic={onTogglePublic}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
