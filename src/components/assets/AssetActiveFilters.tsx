'use client';
/**
 * 활성 필터 칩바 — 선택된 kind/tag 시각화 + 개별/전체 제거
 * 아무 필터도 없으면 렌더 X
 */
import { useTranslations } from 'next-intl';
import type { AssetKind } from '@/lib/assets/types';

interface Props {
  selectedKinds: string[];
  selectedTags: string[];
  selectedFolder: string | null;
  kinds: AssetKind[];
  onRemoveKind: (id: string) => void;
  onRemoveTag: (tag: string) => void;
  onRemoveFolder: () => void;
  onClearAll: () => void;
}

export default function AssetActiveFilters(p: Props) {
  const t = useTranslations('Assets');
  const hasAny = p.selectedKinds.length > 0 || p.selectedTags.length > 0 || p.selectedFolder !== null;
  if (!hasAny) return null;

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6,
      padding: '8px 0', marginBottom: 10,
    }}>
      <span style={{ fontSize: 11, opacity: 0.45, marginRight: 4 }}>{t('activeFilters')}:</span>

      {p.selectedKinds.map(id => {
        const k = p.kinds.find(x => x.id === id);
        return (
          <FilterChip key={`k-${id}`} icon={k?.icon || '📦'}
            label={k?.label || id} onRemove={() => p.onRemoveKind(id)} />
        );
      })}

      {p.selectedFolder !== null && (
        <FilterChip icon="📁"
          label={p.selectedFolder === '' ? t('folderRoot') : p.selectedFolder}
          onRemove={p.onRemoveFolder} />
      )}

      {p.selectedTags.map(tag => (
        <FilterChip key={`t-${tag}`} icon="#" label={tag} onRemove={() => p.onRemoveTag(tag)} />
      ))}

      <button onClick={p.onClearAll}
        style={{
          marginLeft: 4, padding: '3px 8px', fontSize: 11,
          background: 'transparent', color: '#fca5a5',
          border: '1px solid rgba(239,68,68,0.3)', borderRadius: 5,
          cursor: 'pointer',
        }}>
        {t('clearFilters')}
      </button>
    </div>
  );
}

function FilterChip({ icon, label, onRemove }: { icon: string; label: string; onRemove: () => void }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 4px 3px 8px', fontSize: 11,
      background: 'rgba(99,102,241,0.18)', color: '#c7d2fe',
      borderRadius: 5,
    }}>
      <span style={{ opacity: 0.7 }}>{icon}</span>
      {label}
      <button onClick={onRemove}
        style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13, opacity: 0.7, padding: '0 3px' }}>
        ✕
      </button>
    </span>
  );
}
