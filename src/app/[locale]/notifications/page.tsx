'use client';
/**
 * 전체 알림 페이지 — 페이지네이션, 읽음/안읽음 시각화
 * 진입 시 자동 read-all
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, session, ApiError } from '@/lib/api';

interface Notif {
  id: string;
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
  readAt: string | null;
  createdAt: string;
}

export default function NotificationsPage() {
  const t = useTranslations('Notifications');
  const router = useRouter();
  const [items, setItems] = useState<Notif[]>([]);
  const [page, setPage]   = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const tk = session.getToken();
    if (!tk) { setNeedsLogin(true); return; }
    setLoading(true);
    api.listNotifications(tk, { page: 1 })
      .then(d => {
        setItems(d.notifications);
        setTotal(d.total);
        setHasMore(d.hasMore);
        // 진입 시 모두 읽음
        if (d.unread > 0) api.markAllNotificationsRead(tk).catch(() => {});
      })
      .catch(e => setError(e instanceof ApiError ? e.message : 'load failed'))
      .finally(() => setLoading(false));
  }, []);

  async function loadMore() {
    if (loading || !hasMore) return;
    const tk = session.getToken();
    if (!tk) return;
    setLoading(true);
    try {
      const next = page + 1;
      const d = await api.listNotifications(tk, { page: next });
      setItems(prev => [...prev, ...d.notifications]);
      setPage(next);
      setHasMore(d.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }

  if (needsLogin) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
          <div style={{ marginBottom: 12 }}>{t('needsLogin')}</div>
          <button onClick={() => router.push('/login')}
            style={{ padding: '10px 24px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
            {t('loginCta')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#fff', fontFamily: "-apple-system,'Apple SD Gothic Neo',sans-serif" }}>
      <div style={{ padding: '20px 32px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 26 }}>🔔</span>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{t('pageTitle')}</h1>
          <p style={{ margin: 0, fontSize: 13, opacity: 0.5 }}>{t('pageSubtitle', { count: total })}</p>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 32px' }}>
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 10, padding: '10px 16px', color: '#fca5a5', fontSize: 13, marginBottom: 14,
          }}>
            ⚠️ {error}
          </div>
        )}

        {items.length === 0 && !loading ? (
          <div style={{ textAlign: 'center', opacity: 0.4, padding: '60px 0', fontSize: 14 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
            {t('empty')}
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {items.map(n => <Row key={n.id} notif={n} />)}
          </ul>
        )}

        {hasMore && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <button onClick={loadMore} disabled={loading}
              style={{
                padding: '10px 24px', fontSize: 13, fontWeight: 700,
                background: 'rgba(99,102,241,0.18)', color: '#c7d2fe',
                border: 'none', borderRadius: 8, cursor: 'pointer',
              }}>
              {loading ? t('loading') : t('loadMore')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ notif }: { notif: Notif }) {
  const t = useTranslations('Notifications');
  const { type, payload } = notif;
  const wasUnread = !notif.readAt;

  let icon = '🔔', text: React.ReactNode = type, href: string | null = null;
  if (type === 'asset_liked') {
    icon = '♥';
    text = t('asset_liked', { actor: payload.actorName || '?', asset: payload.assetName || '' });
  } else if (type === 'user_followed') {
    icon = '+';
    text = t('user_followed', { actor: payload.actorName || '?' });
    if (payload.actorName) href = `/users/${encodeURIComponent(payload.actorName)}`;
  } else if (type === 'asset_imported') {
    icon = '↓';
    text = t('asset_imported', { actor: payload.actorName || '?', asset: payload.assetName || '' });
  } else if (type === 'report_resolved') {
    icon = payload.resolution === 'delete' ? '🗑' : '⚠';
    text = t(`report_resolved_${payload.resolution}`, { asset: payload.assetName || '' });
  } else if (type === 'asset_auto_hidden') {
    icon = '⚠';
    text = t('asset_auto_hidden', { asset: payload.assetName || '' });
  }

  const inner = (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '14px 16px',
      background: wasUnread ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.03)',
      borderRadius: 12, marginBottom: 6,
      border: '1px solid rgba(255,255,255,0.05)',
    }}>
      <span style={{ fontSize: 20, lineHeight: 1, width: 24, textAlign: 'center' }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, lineHeight: 1.4 }}>{text}</div>
        <div style={{ fontSize: 11, opacity: 0.45, marginTop: 4 }}>
          {new Date(notif.createdAt).toLocaleString()}
        </div>
      </div>
      {wasUnread && <span style={{ width: 8, height: 8, borderRadius: 4, background: '#6366f1', marginTop: 8, flexShrink: 0 }} />}
    </div>
  );

  return (
    <li>
      {href ? <Link href={href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>{inner}</Link> : inner}
    </li>
  );
}
