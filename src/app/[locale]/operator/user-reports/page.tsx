'use client';
/**
 * 운영자 — 인-월드 플레이어 신고 검토 큐.
 * 상태별(대기/무시/처리완료) 목록 + 처리(resolve)/무시(dismiss) 버튼.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, session, ApiError } from '@/lib/api';

type Report = {
  id: string; reporterId: string; reportedId: string;
  reporterName: string | null; reportedName: string | null;
  reason: string; status: string; createdAt: string;
};
type Status = 'pending' | 'dismissed' | 'resolved' | 'all';

export default function OperatorUserReportsPage() {
  const t = useTranslations('OpUserReports');
  const [status, setStatus] = useState<Status>('pending');
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (st: Status) => {
    setLoading(true); setError('');
    const tk = session.getToken();
    if (!tk) { setError(t('needLogin')); setLoading(false); return; }
    try {
      const d = await api.operatorListPlayerReports(tk, st);
      setReports(d.reports);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('loadFailed'));
    } finally { setLoading(false); }
  }, [t]);

  useEffect(() => { load(status); }, [status, load]);

  async function resolve(id: string, next: 'dismissed' | 'resolved') {
    const tk = session.getToken(); if (!tk) return;
    try {
      await api.operatorResolvePlayerReport(tk, id, next);
      setReports(prev => prev.filter(r => r.id !== id || status === 'all'));
      if (status === 'all') setReports(prev => prev.map(r => r.id === id ? { ...r, status: next } : r));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('actionFailed'));
    }
  }

  const TABS: Status[] = ['pending', 'resolved', 'dismissed', 'all'];

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#fff', padding: 24, fontFamily: "-apple-system,'Apple SD Gothic Neo',sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>🚩 {t('title')}</h1>
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 18 }}>{t('subtitle')}</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map(s => (
          <button key={s} onClick={() => setStatus(s)}
            style={{ padding: '6px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
              background: status === s ? '#6366f1' : 'rgba(255,255,255,0.08)', color: '#fff' }}>
            {t(`tab_${s}`)}
          </button>
        ))}
      </div>

      {error && <p style={{ color: '#fca5a5', fontSize: 13 }}>{error}</p>}
      {loading && <p style={{ opacity: 0.5, fontSize: 13 }}>{t('loading')}</p>}
      {!loading && reports.length === 0 && <p style={{ opacity: 0.5, fontSize: 13 }}>{t('empty')}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {reports.map(r => (
          <div key={r.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 14 }}>
              <strong style={{ color: '#fca5a5' }}>{r.reportedName || r.reportedId}</strong>
              <span style={{ opacity: 0.5, fontSize: 12 }}>← {t('reportedBy')} {r.reporterName || r.reporterId}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.4 }}>{new Date(r.createdAt).toLocaleString()}</span>
            </div>
            <p style={{ margin: '8px 0 10px', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{r.reason}</p>
            {r.status === 'pending' ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => resolve(r.id, 'resolved')} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: 'rgba(34,197,94,0.25)', color: '#86efac', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>✓ {t('resolve')}</button>
                <button onClick={() => resolve(r.id, 'dismissed')} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>{t('dismiss')}</button>
              </div>
            ) : (
              <span style={{ fontSize: 11, opacity: 0.5 }}>{t(`tab_${r.status as Status}`)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
