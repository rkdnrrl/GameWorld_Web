'use client';
/**
 * 후원 안내 페이지 (Phase 20)
 *  - 머그컵·기타 외부 후원 링크
 *  - 등급별 혜택
 *  - 후원자 명단 (크레딧)
 */
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { SupporterBadge } from '@/components/SupporterBadge';

// 미설정 시 머그컵 카드 자체 숨김. 결정되면 Vercel env 에 NEXT_PUBLIC_MUGCUP_URL 등록.
const MUGCUP_URL = process.env.NEXT_PUBLIC_MUGCUP_URL?.trim() || '';
const TOSS_URL   = '/ko/donate';                       // 토스페이먼츠 (기존 /donate 페이지)

interface Supporter {
  id: string; username: string; profileImageUrl: string | null; iconEmoji: string | null;
  themeColor: string | null; supporterTier: string; supporterSince: string | null;
  supporterNote: string | null; bio: string | null;
}

export default function SupportPage() {
  const t = useTranslations('Supporters');
  const [supporters, setSupporters] = useState<Supporter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listSupporters()
      .then(d => setSupporters(d.supporters))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // 등급별 분리
  const byTier: Record<string, Supporter[]> = { legend: [], gold: [], silver: [], bronze: [] };
  supporters.forEach(s => { if (byTier[s.supporterTier]) byTier[s.supporterTier].push(s); });

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      {/* 히어로 */}
      <section className="text-center mb-12">
        <h1 className="text-3xl font-bold mb-3">{t('heroTitle')}</h1>
        <p className="text-slate-400 max-w-2xl mx-auto">{t('heroDesc')}</p>
      </section>

      {/* 후원 채널 — 머그컵 URL 미설정 시 토스만 노출 */}
      <section className={`grid gap-4 mb-12 ${MUGCUP_URL ? 'sm:grid-cols-2' : 'sm:grid-cols-1'}`}>
        {MUGCUP_URL && (
          <a
            href={MUGCUP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-6 rounded-xl border-2 border-amber-500/40 bg-gradient-to-br from-amber-900/30 to-amber-800/10 hover:border-amber-400 transition"
          >
            <div className="text-3xl mb-2">☕</div>
            <h3 className="text-lg font-bold text-amber-300">{t('mugcupTitle')}</h3>
            <p className="text-sm text-slate-300 mt-1">{t('mugcupDesc')}</p>
            <p className="text-xs text-amber-200 mt-3">→ {new URL(MUGCUP_URL).hostname}</p>
          </a>
        )}
        <Link
          href={TOSS_URL}
          className="block p-6 rounded-xl border-2 border-indigo-500/40 bg-gradient-to-br from-indigo-900/30 to-indigo-800/10 hover:border-indigo-400 transition"
        >
          <div className="text-3xl mb-2">💎</div>
          <h3 className="text-lg font-bold text-indigo-300">{t('tossTitle')}</h3>
          <p className="text-sm text-slate-300 mt-1">{t('tossDesc')}</p>
          <p className="text-xs text-indigo-200 mt-3">→ {t('tossLink')}</p>
        </Link>
      </section>

      {/* 등급별 혜택 표 */}
      <section className="mb-12">
        <h2 className="text-xl font-bold mb-4">{t('tiersTitle')}</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <TierCard tier="bronze" />
          <TierCard tier="silver" />
          <TierCard tier="gold"   />
          <TierCard tier="legend" />
        </div>
        <p className="text-xs text-slate-500 mt-3">{t('tiersNote')}</p>
      </section>

      {/* 후원자 명단 */}
      <section>
        <h2 className="text-xl font-bold mb-4">{t('creditsTitle')}</h2>
        {loading && <p className="text-slate-500 text-sm">{t('loading')}</p>}
        {!loading && supporters.length === 0 && (
          <p className="text-slate-500 text-sm">{t('creditsEmpty')}</p>
        )}

        {(['legend', 'gold', 'silver', 'bronze'] as const).map(tier => byTier[tier].length > 0 && (
          <div key={tier} className="mb-6">
            <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
              <SupporterBadge tier={tier} size="md" withLabel />
              <span className="text-slate-500">×{byTier[tier].length}</span>
            </h3>
            <ul className="flex flex-wrap gap-2">
              {byTier[tier].map(s => (
                <li key={s.id}>
                  <Link
                    href={`/users/${encodeURIComponent(s.username)}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800/60 hover:bg-slate-700 border border-slate-700 rounded-full text-sm"
                  >
                    {s.profileImageUrl
                      ? <img src={s.profileImageUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
                      : <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs"
                          style={{ background: s.themeColor || '#475569' }}>{s.iconEmoji || '👤'}</span>}
                    <span>{s.username}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </main>
  );
}

function TierCard({ tier }: { tier: 'bronze' | 'silver' | 'gold' | 'legend' }) {
  const t = useTranslations('Supporters');
  return (
    <div className="p-4 rounded-lg border border-slate-700 bg-slate-800/50">
      <SupporterBadge tier={tier} size="md" withLabel />
      <ul className="mt-3 space-y-1.5 text-xs text-slate-300">
        {t.raw(`benefits_${tier}`).split('|').map((line: string, i: number) => (
          <li key={i}>• {line}</li>
        ))}
      </ul>
    </div>
  );
}
