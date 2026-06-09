'use client';
/**
 * 운영자 — 인-앱 피드백 / 버그 신고 검토 큐.
 * 상태별(신규/검토완료) 목록 + 검토완료 처리.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, session, ApiError } from '@/lib/api';

type Item = {
  id: string; userId: string | null; username: string | null;
  kind: string; message: string; context: string | null; status: string; createdAt: string;
};
type Status = 'new' | 'reviewed' | 'all';

const KIND_ICON: Record<string, string> = { bug: '🐛', idea: '💡', other: '💬' };

export default function OperatorFeedbackPage() {
  const t = useTranslations('OpFeedback');
  const [status, setStatus] = useState<Status>('new');
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (st: Status) => {
    setLoading(true); setError('');
    const tk = session.getToken();
    if (!tk) { setError(t('needLogin')); setLoading(false); return; }
    try {
      const d = await api.operatorListFeedback(tk, st);
      setItems(d.items);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('loadFailed'));
    } finally { setLoading(false); }
  }, [t]);

  useEffect(() => { load(status); }, [status, load]);

  async function markReviewed(id: string) {
    const tk = session.getToken(); if (!tk) return;
    try {
      await api.operatorResolveFeedback(tk, id, 'reviewed');
      setItems(prev => status === 'all' ? prev.map(i => i.id === id ? { ...i, status: 'reviewed' } : i) : prev.filter(i => i.id !== id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('actionFailed'));
    }
  }

  const TABS: Status[] = ['new', 'reviewed', 'all'];

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#fff', padding: 24, fontFamily: "-apple-system,'Apple SD Gothic Neo',sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>💬 {t('title')}</h1>
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
      {!loading && items.length === 0 && <p style={{ opacity: 0.5, fontSize: 13 }}>{t('empty')}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map(i => (
          <div key={i.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
              <span style={{ fontSize: 16 }}>{KIND_ICON[i.kind] || '💬'}</span>
              <strong>{i.username || t('anonymous')}</strong>
              <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.4 }}>{new Date(i.createdAt).toLocaleString()}</span>
            </div>
            <p style={{ margin: '8px 0 6px', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{i.message}</p>
            {i.context && <p style={{ margin: '0 0 10px', fontSize: 10, opacity: 0.35, wordBreak: 'break-all' }}>{i.context}</p>}
            {i.status === 'new' ? (
              <button onClick={() => markReviewed(i.id)} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: 'rgba(34,197,94,0.25)', color: '#86efac', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>✓ {t('markReviewed')}</button>
            ) : (
              <span style={{ fontSize: 11, opacity: 0.5 }}>{t('tab_reviewed')}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
