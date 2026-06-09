'use client';
/**
 * 공용 광장 입장 CTA — "빈 월드 문제" 해결.
 * 운영자가 지정한 광장 월드(고정 세션)로 모두 입장 → 사람이 모임.
 * 라이브 접속자 수 표시(사회적 증거). 광장 미설정 시 렌더 안 함.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { getPlazaConfig, listWorldSessions } from '@/lib/api';

export default function PlazaButton() {
  const t = useTranslations('Home');
  const [worldId, setWorldId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState('plaza');
  const [count, setCount] = useState<number | null>(null);

  // 광장 설정 1회 로드
  useEffect(() => {
    let on = true;
    getPlazaConfig().then(c => { if (on) { setWorldId(c.worldId); setSessionId(c.sessionId); } });
    return () => { on = false; };
  }, []);

  // 광장 월드의 접속자 수 폴링 (8초)
  useEffect(() => {
    if (!worldId) return;
    let on = true;
    const tick = async () => {
      const sessions = await listWorldSessions(worldId);
      if (on) setCount(sessions.reduce((s, x) => s + (x.count || 0), 0));
    };
    tick();
    const iv = setInterval(tick, 8000);
    return () => { on = false; clearInterval(iv); };
  }, [worldId]);

  if (!worldId) return null;

  return (
    <Link
      href={`/world?id=${encodeURIComponent(worldId)}&s=${encodeURIComponent(sessionId)}`}
      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-7 py-3.5 text-sm font-bold shadow-lg shadow-emerald-900/50 transition hover:bg-emerald-500 hover:shadow-emerald-900/70 active:scale-95 sm:text-base"
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
      </span>
      🌐 {t('plazaEnter')}
      <span className="ml-1 rounded-full bg-black/25 px-2 py-0.5 text-xs font-semibold">
        {count !== null && count > 0 ? t('plazaCount', { count }) : t('plazaCountEmpty')}
      </span>
    </Link>
  );
}
