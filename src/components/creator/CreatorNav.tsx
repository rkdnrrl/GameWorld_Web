'use client';
/**
 * 크리에이터 도구 네비게이션 — Assets/Character/Studio 사이 이동
 * (월드 탭은 게임 화면 안의 설정 모달 → 맵 이동 으로 통합)
 * 각 페이지 상단에 한 줄 추가만으로 동작. usePathname 으로 현재 탭 자동 강조.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

type Tab = {
  /** 경로 prefix — pathname 이 이걸로 시작하면 active */
  match: string;
  /** 실제 이동 href (locale prefix 는 next-intl 이 자동 처리) */
  href: string;
  icon: string;
  labelKey: string;
};

const TABS: Tab[] = [
  { match: '/assets',    href: '/assets',    icon: '📦', labelKey: 'navAssets' },
  { match: '/character', href: '/character', icon: '🎮', labelKey: 'navCharacter' },
  { match: '/studio',    href: '/studio',    icon: '🏗️', labelKey: 'navStudio' },
];

export default function CreatorNav() {
  const t = useTranslations('CreatorNav');
  const pathname = usePathname() || '';

  // locale prefix(/ko, /en, ...) 떼고 매칭
  const path = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '') || '/';

  return (
    <nav style={{
      display: 'flex', justifyContent: 'center', gap: 4,
      padding: '10px 16px',
      background: 'rgba(0,0,0,0.25)',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      position: 'sticky', top: 0, zIndex: 50,
      backdropFilter: 'blur(8px)',
    }}>
      {TABS.map(tab => {
        const active = path === tab.match || path.startsWith(tab.match + '/');
        return (
          <Link key={tab.match} href={tab.href}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', fontSize: 13,
              borderRadius: 8, textDecoration: 'none',
              fontWeight: active ? 700 : 500,
              background: active ? 'rgba(99,102,241,0.25)' : 'transparent',
              color: active ? '#c7d2fe' : 'rgba(255,255,255,0.65)',
              border: `1px solid ${active ? 'rgba(99,102,241,0.4)' : 'transparent'}`,
              transition: 'all .15s',
            }}>
            <span style={{ fontSize: 14 }}>{tab.icon}</span>
            <span>{t(tab.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
