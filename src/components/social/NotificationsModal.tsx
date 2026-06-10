'use client';
/**
 * 알림 목록 모달 — SocialPanel 의 "알림" 진입점. 페이지 전환 없이 최근 알림 표시.
 *  - 헤더 NotificationBell 과 동일 데이터(api.listNotifications)
 *  - 열면 자동 읽음 처리(api.notificationsReadAll) — Bell 과 동일 정책
 *  - "전체 보기" 링크로 /notifications 페이지 (히스토리 페이지네이션 용)
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api, session, ApiError } from '@/lib/api';

interface Notif {
  id: string;
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
  readAt: string | null;
  createdAt: string;
}

const LIMIT = 15;

export default function NotificationsModal({ onClose, onAllRead }: { onClose: () => void; onAllRead?: () => void }) {
  const t = useTranslations('Social');
  const tn = useTranslations('Notifications');
  const [items, setItems] = useState<Notif[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const tk = session.getToken();
    if (!tk) { setError(t('needLogin')); return; }
    api.listNotifications(tk, { page: 1 })
      .then(d => {
        setItems((d.notifications as Notif[]).slice(0, LIMIT));
        // 열자마자 모두 읽음 처리 — 패널 배지 갱신
        api.markAllNotificationsRead(tk).then(() => onAllRead?.()).catch(() => {});
      })
      .catch(e => setError(e instanceof ApiError ? e.message : t('loadFailed')));
  }, [t, onAllRead]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 2147482010,
      background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(440px, 100%)', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        background: '#0f172a', color: '#fff',
        borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <strong style={{ fontSize: 15 }}>🔔 {t('notifications')}</strong>
          <button onClick={onClose} aria-label={t('close')}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
          {error && <div style={{ padding: 16, color: '#fca5a5', fontSize: 13 }}>{error}</div>}
          {!error && items === null && <div style={{ padding: 16, opacity: 0.5, fontSize: 13 }}>{t('loading')}</div>}
          {items && items.length === 0 && (
            <div style={{ padding: 30, textAlign: 'center', opacity: 0.5, fontSize: 13, lineHeight: 1.6 }}>
              {t('notifEmpty')}
            </div>
          )}
          {items && items.map(n => <Row key={n.id} notif={n} onNavigate={onClose} tn={tn} />)}
        </div>

        {items && items.length > 0 && (
          <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' }}>
            <Link href="/notifications" onClick={onClose}
              style={{ fontSize: 12, color: '#a5b4fc', textDecoration: 'none' }}>
              {t('viewAllNotifications')} →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ notif, onNavigate, tn }: { notif: Notif; onNavigate: () => void; tn: ReturnType<typeof useTranslations> }) {
  const { type, payload } = notif;
  const wasUnread = !notif.readAt;

  let icon = '🔔', text: React.ReactNode = type, href: string | null = null;
  if (type === 'asset_liked') {
    icon = '♥';
    text = tn('asset_liked', { actor: payload.actorName || '?', asset: payload.assetName || '' });
  } else if (type === 'user_followed') {
    icon = '+';
    text = tn('user_followed', { actor: payload.actorName || '?' });
    if (payload.actorName) href = `/users/${encodeURIComponent(payload.actorName)}`;
  } else if (type === 'asset_imported') {
    icon = '↓';
    text = tn('asset_imported', { actor: payload.actorName || '?', asset: payload.assetName || '' });
  } else if (type === 'report_resolved') {
    icon = payload.resolution === 'delete' ? '🗑' : '⚠';
    text = tn(`report_resolved_${payload.resolution}`, { asset: payload.assetName || '' });
  } else if (type === 'asset_auto_hidden') {
    icon = '⚠';
    text = tn('asset_auto_hidden', { asset: payload.assetName || '' });
  }

  const inner = (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '12px 14px',
      background: wasUnread ? 'rgba(99,102,241,0.10)' : 'rgba(255,255,255,0.03)',
      borderRadius: 10, marginBottom: 6,
      border: '1px solid rgba(255,255,255,0.05)',
    }}>
      <span style={{ fontSize: 18, lineHeight: 1, width: 22, textAlign: 'center' }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, lineHeight: 1.4 }}>{text}</div>
        <div style={{ fontSize: 11, opacity: 0.45, marginTop: 4 }}>
          {new Date(notif.createdAt).toLocaleString()}
        </div>
      </div>
      {wasUnread && <span style={{ width: 7, height: 7, borderRadius: 4, background: '#6366f1', marginTop: 8, flexShrink: 0 }} />}
    </div>
  );

  return href
    ? <Link href={href} onClick={onNavigate} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>{inner}</Link>
    : inner;
}
