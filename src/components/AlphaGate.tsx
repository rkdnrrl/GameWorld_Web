'use client';
/**
 * 오픈 알파 접속 게이트.
 * 로그인했지만 알파 승인(alphaApproved)이 안 된 유저에게 전체 화면 오버레이로 "알파 접속 코드" 입력을 요구.
 * 운영자(operatorAccess)는 통과. 비로그인 유저는 게이트 없음(로그인 플로우가 처리, 로그인 전엔 아무것도 못 함).
 * 코드 입력 → api.redeemCode(tier='alpha') → alphaApproved=true → 게이트 해제.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiError, session, SESSION_CHANGE_EVENT } from '@/lib/api';

export default function AlphaGate() {
  const t = useTranslations('AlphaGate');
  // null = 아직 확인 안 됨(로딩), true = 통과, false = 게이트 표시
  const [approved, setApproved] = useState<boolean | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const check = useCallback(async () => {
    const token = session.getToken();
    if (!token) { setApproved(true); return; }   // 비로그인 → 게이트 안 함
    try {
      const { user } = await api.me(token);
      setApproved(!!(user.alphaApproved || user.operatorAccess));
    } catch {
      setApproved(true);   // me 실패(네트워크 등) → 막지 않음 (오탐 방지)
    }
  }, []);

  useEffect(() => {
    check();
    window.addEventListener(SESSION_CHANGE_EVENT, check);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, check);
  }, [check]);

  async function submit() {
    const token = session.getToken();
    if (!token || !code.trim() || busy) return;
    setBusy(true); setError('');
    try {
      await api.redeemCode(token, code.trim());
      // 권위 있는 상태 재확인
      const { user } = await api.me(token);
      if (user.alphaApproved || user.operatorAccess) setApproved(true);
      else setError(t('notAlphaCode'));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('redeemFailed'));
    } finally {
      setBusy(false);
    }
  }

  if (approved !== false) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2147483000,
      background: 'radial-gradient(ellipse at top, #1e293b, #020617)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{
        width: 'min(420px, 94vw)', textAlign: 'center', color: '#fff',
        background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 16, padding: '32px 28px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🔒</div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{t('title')}</h1>
        <p style={{ margin: '10px 0 22px', fontSize: 13, lineHeight: 1.6, color: 'rgba(255,255,255,0.65)' }}>{t('desc')}</p>

        <input
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          placeholder={t('placeholder')}
          autoFocus
          style={{
            width: '100%', padding: '12px 14px', fontSize: 16, fontFamily: 'monospace',
            letterSpacing: 2, textAlign: 'center', textTransform: 'uppercase',
            background: 'rgba(0,0,0,0.4)', color: '#fff',
            border: '1px solid rgba(255,255,255,0.18)', borderRadius: 10, outline: 'none',
          }}
        />
        {error && <div style={{ marginTop: 10, color: '#fca5a5', fontSize: 12 }}>{error}</div>}

        <button
          onClick={submit}
          disabled={busy || !code.trim()}
          style={{
            width: '100%', marginTop: 16, padding: '12px', fontSize: 14, fontWeight: 800,
            border: 'none', borderRadius: 10, cursor: busy ? 'default' : 'pointer',
            background: code.trim() ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'rgba(255,255,255,0.1)',
            color: '#fff', opacity: busy ? 0.7 : 1,
          }}
        >{busy ? t('checking') : t('enter')}</button>

        <button
          onClick={() => { session.clear(); window.location.href = '/'; }}
          style={{ marginTop: 14, background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
        >{t('logout')}</button>
      </div>
    </div>
  );
}
