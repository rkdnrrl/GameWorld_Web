'use client';
/**
 * 상단 툴바 — 검색·정렬·공개여부 필터
 */
import { useTranslations } from 'next-intl';
import type { SortMode, VisibilityFilter } from '@/lib/assets/filters';

interface Props {
  q: string;
  onQ: (v: string) => void;
  sort: SortMode;
  onSort: (v: SortMode) => void;
  visibility: VisibilityFilter;
  onVisibility: (v: VisibilityFilter) => void;
  resultCount: number;
}

export default function AssetToolbar(p: Props) {
  const t = useTranslations('Assets');
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
      padding: '12px 0', marginBottom: 14,
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      {/* 검색 */}
      <div style={{ flex: '1 1 240px', maxWidth: 320, position: 'relative' }}>
        <input
          value={p.q}
          onChange={e => p.onQ(e.target.value)}
          placeholder={t('searchPlaceholder')}
          style={{
            width: '100%', padding: '8px 12px 8px 32px', fontSize: 13,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8, color: '#fff', outline: 'none',
          }}
        />
        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}>🔍</span>
      </div>

      {/* 공개여부 칩 */}
      <ChipGroup
        value={p.visibility}
        onChange={v => p.onVisibility(v as VisibilityFilter)}
        options={[
          { value: 'all',     label: t('all') },
          { value: 'private', label: t('private') },
          { value: 'public',  label: t('publishing') },
        ]}
      />

      {/* 정렬 */}
      <select
        value={p.sort}
        onChange={e => p.onSort(e.target.value as SortMode)}
        style={{
          padding: '7px 10px', fontSize: 12,
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8, color: '#fff', outline: 'none', cursor: 'pointer',
        }}
      >
        <option value="recent">{t('sortRecent')}</option>
        <option value="oldest">{t('sortOldest')}</option>
        <option value="name">{t('sortName')}</option>
        <option value="kind">{t('sortKind')}</option>
      </select>

      <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.5 }}>
        {t('resultCount', { count: p.resultCount })}
      </div>
    </div>
  );
}

function ChipGroup<T extends string>({ value, onChange, options }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.05)', padding: 3, borderRadius: 9 }}>
      {options.map(o => (
        <button key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            padding: '5px 11px', fontSize: 12, border: 'none', borderRadius: 6, cursor: 'pointer',
            background: value === o.value ? 'rgba(99,102,241,0.35)' : 'transparent',
            color: value === o.value ? '#fff' : 'rgba(255,255,255,0.55)',
            fontWeight: value === o.value ? 700 : 500,
            transition: 'all .12s',
          }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
