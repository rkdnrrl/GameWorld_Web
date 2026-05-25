'use client';
/**
 * 그리드 — Asset[] 받아서 카드 나열만
 */
import type { Asset, AssetKind } from '@/lib/assets/types';
import AssetCard from './AssetCard';

interface Props {
  assets: Asset[];
  kinds: AssetKind[];
  emptyMessage: string;
  onEdit: (a: Asset) => void;
  onTogglePublic: (a: Asset) => void;
  onDelete: (id: string) => void;
}

export default function AssetGrid({ assets, kinds, emptyMessage, onEdit, onTogglePublic, onDelete }: Props) {
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
          onEdit={onEdit}
          onTogglePublic={onTogglePublic}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
