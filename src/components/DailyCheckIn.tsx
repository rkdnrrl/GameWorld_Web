'use client';
/**
 * 데일리 출석 보상 — 홈 위젯. 로그인 유저에게 오늘의 출석 보상(코인) + 연속 출석 streak 표시.
 * 코인 경제 활성화: 받으면 Profile.coins 증가 → 헤더/계정의 코인 잔액이 실제로 오름.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, session, ApiError } from '@/lib/api';
import { useLoggedIn } from '@/lib/useLoggedIn';

type Status = { claimedToday: boolean; streak: number; reward: number; coins: number };

export default function DailyCheckIn() {
  const t = useTranslations('DailyCheckIn');
  const loggedIn = useLoggedIn();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [justClaimed, setJustClaimed] = useState(false);

  const load = useCallback(async () => {
    const tk = session.getToken();
    if (!tk) { setStatus(null); return; }
    try { setStatus(await api.getAttendanceStatus(tk)); }
    catch { setStatus(null); }
  }, []);

  useEffect(() => { if (loggedIn) load(); else setStatus(null); }, [loggedIn, load]);

  async function claim() {
    const tk = session.getToken();
    if (!tk || busy || status?.claimedToday) return;
    setBusy(true);
    try {
      const r = await api.claimAttendance(tk);
      setStatus({ claimedToday: true, streak: r.streak, reward: r.reward, coins: r.coins });
      setJustClaimed(true);
    } catch (e) {
      if (e instanceof ApiError) await load();   // 이미 출석 등 → 상태 재동기화
    } finally { setBusy(false); }
  }

  if (!loggedIn || !status) return null;

  const cycleDay = ((status.streak - 1) % 7) + 1; // 7일 주기에서 오늘이 몇 번째

  return (
    <div style={{
      maxWidth: 720, margin: '0 auto 24px', padding: '16px 18px', borderRadius: 14,
      background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(16,185,129,0.14))',
      border: '1px solid rgba(255,255,255,0.1)', color: '#fff',
      display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
    }}>
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
          📅 {t('title')}
          <span style={{ fontSize: 11, fontWeight: 700, color: '#fcd34d' }}>🔥 {t('streak', { count: status.streak })}</span>
        </div>
        {/* 7일 주기 도트 */}
        <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
          {Array.from({ length: 7 }, (_, i) => {
            const day = i + 1;
            const filled = day <= cycleDay && (status.claimedToday || day < cycleDay);
            const isToday = day === cycleDay;
            return (
              <div key={i} style={{
                width: 26, height: 26, borderRadius: 7, fontSize: 10, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: filled ? '#10b981' : isToday ? 'rgba(99,102,241,0.45)' : 'rgba(255,255,255,0.08)',
                border: isToday && !status.claimedToday ? '1px solid #818cf8' : '1px solid transparent',
                color: filled ? '#fff' : 'rgba(255,255,255,0.6)',
              }} title={`${day}일차`}>{filled ? '✓' : day === 7 ? '🎁' : day}</div>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>
          🪙 {t('balance', { coins: status.coins.toLocaleString() })}
        </div>
      </div>

      <div style={{ flex: '0 0 auto', textAlign: 'center' }}>
        {status.claimedToday ? (
          <div style={{ fontSize: 13, fontWeight: 800, color: '#6ee7b7' }}>
            {justClaimed ? `🎉 +${status.reward} 🪙` : '✓ ' + t('doneToday')}
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>{t('comeBack')}</div>
          </div>
        ) : (
          <button onClick={claim} disabled={busy} style={{
            padding: '11px 22px', borderRadius: 10, border: 'none', cursor: busy ? 'default' : 'pointer',
            background: 'linear-gradient(135deg,#6366f1,#10b981)', color: '#fff', fontSize: 14, fontWeight: 800,
            opacity: busy ? 0.7 : 1, boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          }}>{busy ? t('claiming') : t('claim', { reward: status.reward })}</button>
        )}
      </div>
    </div>
  );
}
