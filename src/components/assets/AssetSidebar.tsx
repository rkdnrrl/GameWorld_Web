'use client';
/**
 * 좌측 사이드바 — 카테고리(kind) 자동 노출 + 카운트
 * Phase 2/3 에서 태그·폴더 섹션 추가 예정 (지금은 placeholder)
 */
import { useTranslations } from 'next-intl';
import type { Asset, AssetKind } from '@/lib/assets/types';
import { countByKind } from '@/lib/assets/filters';

interface Props {
  assets: Asset[];
  kinds: AssetKind[];
  selectedKinds: string[];               // 빈 배열 = 전체
  onSelectKinds: (next: string[]) => void;
}

export default function AssetSidebar({ assets, kinds, selectedKinds, onSelectKinds }: Props) {
  const t = useTranslations('Assets');
  const counts = countByKind(assets, kinds);
  const totalCount = assets.length;
  const isAll = selectedKinds.length === 0;

  return (
    <aside style={{
      width: 220, flexShrink: 0, padding: '20px 12px',
      borderRight: '1px solid rgba(255,255,255,0.08)',
      fontSize: 13,
    }}>
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
          onClick={() => {
            // 단일 선택 (Phase 1) — 멀티 토글은 Phase 2 에서
            onSelectKinds(selectedKinds.includes(k.id) ? [] : [k.id]);
          }}
        />
      ))}

      {/* Phase 2/3 자리 — 시각적 힌트만 */}
      <div style={{ fontSize: 10, opacity: 0.25, textTransform: 'uppercase', letterSpacing: 0.5, padding: '20px 8px 6px' }}>
        {t('sidebarTag')} <span style={{ fontSize: 9 }}>· {t('comingSoon')}</span>
      </div>
      <div style={{ fontSize: 10, opacity: 0.25, textTransform: 'uppercase', letterSpacing: 0.5, padding: '12px 8px 6px' }}>
        {t('sidebarFolder')} <span style={{ fontSize: 9 }}>· {t('comingSoon')}</span>
      </div>
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
