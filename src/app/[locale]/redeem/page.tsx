'use client';
/**
 * /redeem — 후원자 코드 입력 페이지.
 * 텀블벅 등 외부 결제 후원자가 받은 1회용 코드 → ALP supporter tier 자동 부여.
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { api, session } from '@/lib/api';

const TIER_LABEL: Record<string, string> = {
  bronze: '🥉 Bronze',
  silver: '🥈 Silver',
  gold:   '🥇 Gold',
  legend: '🏆 Legend',
};

export default function RedeemPage() {
  const t = useTranslations('Redeem');
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ tier: string; upgraded: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const token = session.getToken();
    if (!token) {
      router.replace('/login?redirect=/redeem');
      return;
    }
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.redeemCode(token, code);
      setResult({ tier: r.tier, upgraded: r.upgraded });
      setCode('');
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = e as any;
      const errCode = err?.body?.error?.code;
      const map: Record<string, string> = {
        EMPTY:        t('errEmpty'),
        NOT_FOUND:    t('errNotFound'),
        REVOKED:      t('errRevoked'),
        ALREADY_USED: t('errAlreadyUsed'),
        EXPIRED:      t('errExpired'),
        NO_PROFILE:   t('errNoProfile'),
      };
      setError(map[errCode] || err?.message || t('errGeneric'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)' }}>
      <div style={{ width: '100%', maxWidth: 480, background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(12px)', borderRadius: 18, padding: 36, border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 56, marginBottom: 8 }}>🎁</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, marginBottom: 6 }}>{t('title')}</h1>
          <p style={{ fontSize: 13, opacity: 0.6, margin: 0, lineHeight: 1.5 }}>{t('desc')}</p>
        </div>

        {!result && (
          <>
            <label style={{ display: 'block', fontSize: 11, opacity: 0.55, marginBottom: 6, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>{t('inputLabel')}</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="XXXX-XXXX"
              autoFocus
              spellCheck={false}
              style={{
                width: '100%', boxSizing: 'border-box',
                fontSize: 22, fontWeight: 700, letterSpacing: 4, textAlign: 'center',
                padding: '16px 14px',
                background: 'rgba(255,255,255,0.06)',
                border: `2px solid ${error ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.12)'}`,
                borderRadius: 12, color: '#fff', fontFamily: 'monospace',
                outline: 'none',
              }}
            />
            {error && <div style={{ marginTop: 10, fontSize: 12, color: '#fca5a5', textAlign: 'center' }}>{error}</div>}
            <button
              onClick={submit}
              disabled={loading || !code.trim()}
              style={{
                width: '100%', marginTop: 18, padding: '13px 0',
                background: loading || !code.trim() ? 'rgba(99,102,241,0.3)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff', border: 'none', borderRadius: 11, fontSize: 14, fontWeight: 800,
                cursor: loading || !code.trim() ? 'not-allowed' : 'pointer',
                transition: 'opacity .15s',
              }}
            >
              {loading ? t('submitting') : t('submitBtn')}
            </button>
            <p style={{ marginTop: 18, fontSize: 11, opacity: 0.45, textAlign: 'center', lineHeight: 1.6 }}>{t('hint')}</p>
          </>
        )}

        {result && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 64, marginBottom: 12 }}>🎉</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>{t('successTitle')}</div>
            <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 20 }}>
              {result.upgraded
                ? t('successUpgraded', { tier: TIER_LABEL[result.tier] || result.tier })
                : t('successNoUpgrade', { tier: TIER_LABEL[result.tier] || result.tier })
              }
            </div>
            <button
              onClick={() => router.push('/account')}
              style={{ padding: '10px 24px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginRight: 8 }}
            >
              {t('goAccount')}
            </button>
            <button
              onClick={() => { setResult(null); setError(null); }}
              style={{ padding: '10px 24px', background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              {t('addAnother')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
