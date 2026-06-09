'use client';
/**
 * 인-앱 피드백 / 버그 신고 — 오픈 알파 학습 루프.
 * 로그인 유저에게 좌하단 플로팅 버튼 → 모달(유형 + 내용). 현재 경로/브라우저 자동 첨부.
 * 몰입형(월드/스튜디오) 화면에서는 자체 UI와 겹치지 않게 숨김.
 */
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, session, ApiError } from '@/lib/api';
import { useLoggedIn } from '@/lib/useLoggedIn';

type Kind = 'bug' | 'idea' | 'other';
const KINDS: { k: Kind; icon: string }[] = [
  { k: 'bug', icon: '🐛' },
  { k: 'idea', icon: '💡' },
  { k: 'other', icon: '💬' },
];

export default function FeedbackButton() {
  const t = useTranslations('Feedback');
  const loggedIn = useLoggedIn();
  const pathname = usePathname() || '';
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>('bug');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // 몰입형 화면(월드/스튜디오)에서는 숨김 — 자체 UI와 충돌 방지
  const immersive = /\/(world|studio)(\/|$|\?)/.test(pathname);
  if (!loggedIn || immersive) return null;

  async function submit() {
    const tk = session.getToken();
    if (!tk || !message.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const context = `${pathname} · ${typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : ''}`;
      await api.submitFeedback(tk, { kind, message: message.trim(), context });
      setDone(true);
      setMessage('');
      setTimeout(() => { setOpen(false); setDone(false); }, 1400);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('failed'));
    } finally { setBusy(false); }
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label={t('button')}
          style={{
            position: 'fixed', left: 16, bottom: 16, zIndex: 2147482000,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '9px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
            background: 'rgba(99,102,241,0.95)', color: '#fff', fontSize: 13, fontWeight: 700,
            boxShadow: '0 6px 20px rgba(0,0,0,0.3)', fontFamily: 'system-ui, sans-serif',
          }}
        >💬 {t('button')}</button>
      )}

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 2147482001, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-start', padding: 16 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(360px, 94vw)', background: '#0f172a', color: '#fff',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 18,
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)', fontFamily: 'system-ui, sans-serif',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <strong style={{ fontSize: 15 }}>💬 {t('title')}</strong>
              <button onClick={() => setOpen(false)} aria-label={t('close')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>{t('desc')}</p>

            {done ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: '#86efac', fontSize: 14, fontWeight: 700 }}>✓ {t('thanks')}</div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  {KINDS.map(({ k, icon }) => (
                    <button key={k} onClick={() => setKind(k)}
                      style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: '1px solid ' + (kind === k ? '#6366f1' : 'rgba(255,255,255,0.12)'),
                        background: kind === k ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      {icon} {t(`kind_${k}`)}
                    </button>
                  ))}
                </div>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder={t('placeholder')}
                  rows={4}
                  autoFocus
                  style={{ width: '100%', resize: 'vertical', padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
                {error && <div style={{ marginTop: 6, color: '#fca5a5', fontSize: 12 }}>{error}</div>}
                <button
                  onClick={submit}
                  disabled={busy || !message.trim()}
                  style={{ width: '100%', marginTop: 12, padding: 11, borderRadius: 8, border: 'none', cursor: busy ? 'default' : 'pointer',
                    background: message.trim() ? '#6366f1' : 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, fontWeight: 800, opacity: busy ? 0.7 : 1 }}
                >{busy ? t('sending') : t('send')}</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
