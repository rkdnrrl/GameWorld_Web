'use client';
/**
 * 헤더 알림 벨
 * - 30초마다 unread-count 폴링 (로그인 시에만)
 * - 클릭 시 드롭다운 (최근 10개 + "전체 보기")
 * - 드롭다운 열면 자동 read-all
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, session } from '@/lib/api';

const POLL_MS = 30_000;
const DROPDOWN_LIMIT = 10;

type NotifType = 'asset_liked' | 'user_followed' | 'asset_imported' | 'report_resolved' | 'asset_auto_hidden';
interface Notif {
  id: string;
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
  readAt: string | null;
  createdAt: string;
}

export default function NotificationBell() {
  const t = useTranslations('Notifications');
  const [unread, setUnread] = useState(0);
  const [open, setOpen]     = useState(false);
  const [items, setItems]   = useState<Notif[] | null>(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchUnread = useCallback(() => {
    const tk = session.getToken();
    if (!tk) { setUnread(0); return; }
    api.notificationsUnreadCount(tk)
      .then(d => setUnread(d.unread))
      .catch(() => {});
  }, []);

  // 폴링
  useEffect(() => {
    fetchUnread();
    const id = setInterval(fetchUnread, POLL_MS);
    return () => clearInterval(id);
  }, [fetchUnread]);

  // 외부 클릭 닫기
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function toggle() {
    const tk = session.getToken();
    if (!tk) return;
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      try {
        const d = await api.listNotifications(tk, { page: 1 });
        setItems(d.notifications.slice(0, DROPDOWN_LIMIT));
        // 드롭다운을 열면 모두 읽음 처리 (배지 즉시 사라짐)
        if (d.unread > 0) {
          api.markAllNotificationsRead(tk).catch(() => {});
          setUnread(0);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
  }

  if (!session.getToken()) return null;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={toggle}
        aria-label={t('aria')}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        <span className="text-lg leading-none">🔔</span>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[340px] max-w-[calc(100vw-32px)] rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900 z-50">
          <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center">
            <div className="flex-1 font-semibold text-sm text-zinc-900 dark:text-white">{t('title')}</div>
            <Link href="/notifications" onClick={() => setOpen(false)}
              className="text-xs text-indigo-500 hover:underline">
              {t('viewAll')}
            </Link>
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="px-4 py-8 text-center text-xs text-zinc-400">{t('loading')}</div>
            ) : !items || items.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-zinc-400">{t('empty')}</div>
            ) : (
              <ul>
                {items.map(n => (
                  <NotifRow key={n.id} notif={n as Notif & { type: NotifType }} onClose={() => setOpen(false)} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotifRow({ notif, onClose }: { notif: Notif; onClose: () => void }) {
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

  const content = (
    <div className={`flex items-start gap-3 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 ${wasUnread ? 'bg-indigo-50/40 dark:bg-indigo-900/10' : ''}`}>
      <span className="text-lg leading-none mt-0.5 w-5 text-center">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-zinc-700 dark:text-zinc-200 leading-snug">{text}</div>
        <div className="text-[10px] text-zinc-400 mt-0.5">{relTime(notif.createdAt, t)}</div>
      </div>
      {wasUnread && <span className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0" />}
    </div>
  );

  return (
    <li>
      {href ? <Link href={href} onClick={onClose}>{content}</Link> : content}
    </li>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function relTime(iso: string, t: any): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)         return t('relJustNow');
  if (s < 3600)       return t('relMinAgo', { n: Math.floor(s / 60) });
  if (s < 86400)      return t('relHourAgo', { n: Math.floor(s / 3600) });
  if (s < 86400 * 7)  return t('relDayAgo', { n: Math.floor(s / 86400) });
  return new Date(iso).toLocaleDateString();
}
