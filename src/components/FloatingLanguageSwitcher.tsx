'use client';
/**
 * 모든 화면에 떠 있는 언어 변경 위젯 (우하단 floating).
 * 클릭 시 4언어 (ko/en/ja/zh) 토글 메뉴 펼침.
 *
 * - 헤더가 노출되는 홈 (/) 에서는 숨김 (헤더 셀렉트와 중복)
 * - 풀스크린 캔버스 페이지에도 떠야 하므로 z-index 매우 높음 (16777200)
 * - 모바일에서도 잘 보이도록 우하단 고정 (다른 floating UI 와 충돌 시 위치 조정 가능)
 */
import { useState, useEffect, useRef } from 'react';
import { useLocale } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';

const LANGS = [
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
] as const;

export default function FloatingLanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // 홈 (/) 에서는 헤더에 이미 있으니 숨김
  if (pathname === '/') return null;

  const current = LANGS.find(l => l.code === locale) || LANGS[0];

  function change(code: string) {
    setOpen(false);
    router.replace(pathname, { locale: code });
  }

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        right: 16,
        top: 14,
        zIndex: 16777200,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            background: 'rgba(15,23,42,0.95)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10,
            padding: 4,
            minWidth: 140,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          {LANGS.map(l => {
            const active = l.code === locale;
            return (
              <button
                key={l.code}
                onClick={() => change(l.code)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '8px 12px',
                  background: active ? 'rgba(99,102,241,0.25)' : 'transparent',
                  border: 'none',
                  borderRadius: 6,
                  color: active ? '#a5b4fc' : '#fff',
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ fontSize: 16 }}>{l.flag}</span>
                <span>{l.label}</span>
                {active && <span style={{ marginLeft: 'auto', fontSize: 11 }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}

      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Language"
        title="Language / 언어 / 言語 / 语言"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 12px',
          background: 'rgba(15,23,42,0.85)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 999,
          color: '#fff',
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}
      >
        <span style={{ fontSize: 16 }}>{current.flag}</span>
        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{current.code}</span>
        <span style={{ fontSize: 9, opacity: 0.6 }}>{open ? '▲' : '▼'}</span>
      </button>
    </div>
  );
}
