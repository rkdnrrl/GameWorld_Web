/**
 * 후원자 배지 (Phase 20)
 * 사용:  <SupporterBadge tier={user.supporterTier} />
 * 크기:  size="sm" | "md" | "lg"
 */
import { useTranslations } from 'next-intl';

export type SupporterTier = 'none' | 'bronze' | 'silver' | 'gold' | 'legend';

const TIER_STYLE: Record<SupporterTier, { icon: string; bg: string; color: string; border: string }> = {
  none:   { icon: '',   bg: 'transparent', color: 'inherit', border: 'transparent' },
  bronze: { icon: '🥉', bg: 'linear-gradient(135deg,#a16207,#92400e)', color: '#fef3c7', border: '#a16207' },
  silver: { icon: '🥈', bg: 'linear-gradient(135deg,#94a3b8,#64748b)', color: '#f1f5f9', border: '#94a3b8' },
  gold:   { icon: '🏆', bg: 'linear-gradient(135deg,#facc15,#eab308)', color: '#78350f', border: '#facc15' },
  legend: { icon: '👑', bg: 'linear-gradient(135deg,#a855f7,#ec4899,#facc15)', color: '#fff', border: '#a855f7' },
};

const SIZE_MAP = {
  sm: { padX: 4,  padY: 1, fontSize: 9,  iconSize: 11, gap: 2 },
  md: { padX: 6,  padY: 2, fontSize: 11, iconSize: 13, gap: 3 },
  lg: { padX: 10, padY: 4, fontSize: 14, iconSize: 16, gap: 5 },
};

export function SupporterBadge({
  tier,
  size = 'sm',
  iconOnly = false,
  withLabel = false,
}: {
  tier?: string | null;
  size?: 'sm' | 'md' | 'lg';
  iconOnly?: boolean;
  withLabel?: boolean;
}) {
  const t = useTranslations('Supporters');
  if (!tier || tier === 'none') return null;
  const s = TIER_STYLE[tier as SupporterTier] || TIER_STYLE.bronze;
  const sz = SIZE_MAP[size];

  // 아이콘만 (username 옆 작은 ⭐)
  if (iconOnly) {
    return (
      <span
        title={t(`tier_${tier}`)}
        style={{ fontSize: sz.iconSize, lineHeight: 1, marginLeft: 2, display: 'inline-block' }}
      >{s.icon}</span>
    );
  }

  return (
    <span
      title={t(`tier_${tier}`)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: sz.gap,
        padding: `${sz.padY}px ${sz.padX}px`,
        background: s.bg,
        color: s.color,
        fontSize: sz.fontSize, fontWeight: 700, lineHeight: 1,
        borderRadius: 999,
        border: `1px solid ${s.border}`,
        verticalAlign: 'middle',
        textShadow: tier === 'legend' ? '0 0 4px rgba(0,0,0,0.4)' : 'none',
      }}
    >
      <span style={{ fontSize: sz.iconSize, lineHeight: 1 }}>{s.icon}</span>
      {withLabel && <span>{t(`tier_${tier}`)}</span>}
    </span>
  );
}

/** username 옆에 inline 으로 ⭐ 표시할 때의 유틸 (no-translate, JSX 짧게) */
export function SupporterIcon({ tier, size = 13 }: { tier?: string | null; size?: number }) {
  if (!tier || tier === 'none') return null;
  const icon = TIER_STYLE[tier as SupporterTier]?.icon || '';
  if (!icon) return null;
  return <span style={{ marginLeft: 3, fontSize: size, lineHeight: 1, display: 'inline-block' }}>{icon}</span>;
}
