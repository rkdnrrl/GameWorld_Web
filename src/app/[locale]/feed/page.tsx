'use client';
/**
 * 활동 피드 (Phase 18) — 친구 + 팔로잉 사용자들의 최근 활동 타임라인
 */
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, session, ApiError } from '@/lib/api';
import { SupporterIcon } from '@/components/SupporterBadge';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Event { id: string; type: string; targetId: string | null; payload: any; createdAt: string; actor: { id: string; username: string; profileImageUrl: string | null; iconEmoji: string | null; supporterTier?: string | null } | null; }

export default function FeedPage() {
  const t = useTranslations('Feed');
  const [events, setEvents] = useState<Event[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);

  const load = useCallback(async (p: number) => {
    const tk = session.getToken();
    if (!tk) { setNeedsLogin(true); return; }
    setLoading(true); setError('');
    try {
      const d = await api.getActivityFeed(tk, p);
      setEvents(prev => p === 1 ? d.events : [...prev, ...d.events]);
      setPage(d.page); setHasMore(d.hasMore);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'load failed');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(1); }, [load]);

  if (needsLogin) {
    return <main className="max-w-2xl mx-auto px-4 py-8"><p className="text-slate-400">{t('loginRequired')}</p></main>;
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-1">{t('title')}</h1>
      <p className="text-sm text-slate-400 mb-6">{t('subtitle')}</p>

      {error && <div className="mb-3 p-2 bg-rose-900/30 text-rose-300 text-sm rounded">{error}</div>}

      {events.length === 0 && !loading && (
        <div className="py-12 text-center">
          <p className="text-slate-500 mb-3">{t('empty')}</p>
          <Link href="/assets/browse" className="text-emerald-300 hover:text-emerald-200 text-sm">→ {t('emptyBrowseUsers')}</Link>
        </div>
      )}

      <ul className="space-y-3">
        {events.map(e => <EventRow key={e.id} event={e} t={t} />)}
      </ul>

      {hasMore && (
        <button
          onClick={() => load(page + 1)}
          disabled={loading}
          className="mt-6 mx-auto block px-4 py-2 text-sm border border-slate-600 hover:bg-slate-700 rounded disabled:opacity-50"
        >
          {loading ? t('loading') : t('loadMore')}
        </button>
      )}
    </main>
  );
}

function EventRow({ event, t }: { event: Event; t: (k: string, v?: Record<string, string | number>) => string }) {
  const actor = event.actor;
  const time = new Date(event.createdAt).toLocaleString();

  // 이벤트 타입별 메시지
  let body: React.ReactNode = null;
  if (event.type === 'friend_accepted') {
    body = <span>{t('eventFriendAccepted')}</span>;
  } else if (event.type === 'user_followed') {
    body = <span>{t('eventUserFollowed')}</span>;
  } else if (event.type === 'asset_published') {
    const name = event.payload?.name || '';
    body = <span>{t('eventAssetPublished', { name })}</span>;
  } else if (event.type === 'world_created') {
    const name = event.payload?.name || '';
    body = <span>{t('eventWorldCreated', { name })}</span>;
  } else if (event.type === 'post_created') {
    const title = event.payload?.title || '';
    body = <span>{t('eventPostCreated', { title })}</span>;
  } else {
    body = <span className="text-slate-500">{event.type}</span>;
  }

  return (
    <li className="flex items-start gap-3 p-3 bg-slate-800/50 border border-slate-700 rounded">
      {actor ? (
        <Link href={`/users/${encodeURIComponent(actor.username)}`} className="shrink-0">
          {actor.profileImageUrl
            ? <img src={actor.profileImageUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
            : actor.iconEmoji ? <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-xl">{actor.iconEmoji}</div>
            : <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">👤</div>}
        </Link>
      ) : <div className="w-10 h-10 rounded-full bg-slate-700" />}
      <div className="flex-1 min-w-0">
        <p className="text-sm">
          {actor && <Link href={`/users/${encodeURIComponent(actor.username)}`} className="font-medium hover:text-emerald-300">{actor.username}<SupporterIcon tier={actor.supporterTier} /></Link>}{' '}
          {body}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">{time}</p>
      </div>
    </li>
  );
}
