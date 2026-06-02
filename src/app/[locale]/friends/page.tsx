'use client';
/**
 * 친구 페이지 (Phase 16)
 * 3개 탭: 친구 목록 / 받은 신청 / 보낸 신청
 */
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, session, ApiError } from '@/lib/api';
import { SupporterIcon } from '@/components/SupporterBadge';

type Tab = 'friends' | 'received' | 'sent';

interface UserMini {
  id: string;
  username: string;
  profileImageUrl: string | null;
  bio: string | null;
  supporterTier?: string | null;
}

interface Friend { friendshipId: string; since: string; friend: UserMini }
interface ReceivedReq { friendshipId: string; createdAt: string; from: UserMini }
interface SentReq { friendshipId: string; createdAt: string; to: UserMini }

export default function FriendsPage() {
  const t = useTranslations('Friends');
  const [tab, setTab] = useState<Tab>('friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [received, setReceived] = useState<ReceivedReq[]>([]);
  const [sent, setSent] = useState<SentReq[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);

  const load = useCallback(async () => {
    const tk = session.getToken();
    if (!tk) { setNeedsLogin(true); return; }
    setLoading(true); setError('');
    try {
      const [f, r, s] = await Promise.all([
        api.listFriends(tk),
        api.listFriendRequestsReceived(tk),
        api.listFriendRequestsSent(tk),
      ]);
      setFriends(f.friends);
      setReceived(r.requests);
      setSent(s.requests);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function onAccept(id: string) {
    const tk = session.getToken(); if (!tk) return;
    try { await api.acceptFriendRequest(tk, id); load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'accept failed'); }
  }
  async function onReject(id: string) {
    const tk = session.getToken(); if (!tk) return;
    try { await api.rejectFriendRequest(tk, id); load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'reject failed'); }
  }
  async function onCancel(id: string) {
    const tk = session.getToken(); if (!tk) return;
    try { await api.cancelFriendRequest(tk, id); load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'cancel failed'); }
  }
  async function onRemove(userId: string) {
    if (!confirm(t('confirmRemove'))) return;
    const tk = session.getToken(); if (!tk) return;
    try { await api.removeFriend(tk, userId); load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'remove failed'); }
  }

  if (needsLogin) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-slate-400">{t('loginRequired')}</p>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">{t('title')}</h1>
      <p className="text-sm text-slate-400 mb-6">{t('subtitle')}</p>

      {/* 탭 */}
      <div className="flex gap-2 border-b border-slate-700 mb-4">
        <TabBtn active={tab === 'friends'}  onClick={() => setTab('friends')}>
          {t('tabFriends')} ({friends.length})
        </TabBtn>
        <TabBtn active={tab === 'received'} onClick={() => setTab('received')}>
          {t('tabReceived')} {received.length > 0 && <span className="ml-1 px-1.5 py-0.5 text-xs bg-pink-500 text-white rounded">{received.length}</span>}
        </TabBtn>
        <TabBtn active={tab === 'sent'}     onClick={() => setTab('sent')}>
          {t('tabSent')} ({sent.length})
        </TabBtn>
      </div>

      {error && <div className="mb-3 p-2 bg-rose-900/30 text-rose-300 text-sm rounded">{error}</div>}
      {loading && <p className="text-slate-500 text-sm">{t('loading')}</p>}

      {tab === 'friends' && (
        friends.length === 0 ? <Empty text={t('emptyFriends')} />
        : <ul className="space-y-2">
            {friends.map(f => (
              <UserRow key={f.friendshipId} user={f.friend} subtitle={t('friendSince', { date: new Date(f.since).toLocaleDateString() })}>
                <button onClick={() => onRemove(f.friend.id)} className="px-3 py-1 text-sm border border-slate-600 text-slate-400 hover:bg-rose-900/30 hover:text-rose-300 hover:border-rose-700 rounded">
                  {t('btnRemove')}
                </button>
              </UserRow>
            ))}
          </ul>
      )}

      {tab === 'received' && (
        received.length === 0 ? <Empty text={t('emptyReceived')} />
        : <ul className="space-y-2">
            {received.map(r => (
              <UserRow key={r.friendshipId} user={r.from} subtitle={new Date(r.createdAt).toLocaleString()}>
                <button onClick={() => onAccept(r.friendshipId)} className="px-3 py-1 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded">
                  {t('btnAccept')}
                </button>
                <button onClick={() => onReject(r.friendshipId)} className="px-3 py-1 text-sm border border-slate-600 text-slate-400 hover:bg-rose-900/30 hover:text-rose-300 rounded">
                  {t('btnReject')}
                </button>
              </UserRow>
            ))}
          </ul>
      )}

      {tab === 'sent' && (
        sent.length === 0 ? <Empty text={t('emptySent')} />
        : <ul className="space-y-2">
            {sent.map(s => (
              <UserRow key={s.friendshipId} user={s.to} subtitle={new Date(s.createdAt).toLocaleString()}>
                <button onClick={() => onCancel(s.friendshipId)} className="px-3 py-1 text-sm border border-slate-600 text-slate-400 hover:bg-slate-700 rounded">
                  {t('btnCancel')}
                </button>
              </UserRow>
            ))}
          </ul>
      )}
    </main>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm border-b-2 -mb-px ${active ? 'border-emerald-500 text-emerald-300' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
    >
      {children}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-slate-500 text-sm py-8 text-center">{text}</p>;
}

function UserRow({ user, subtitle, children }: { user: UserMini; subtitle: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 p-3 bg-slate-800/50 border border-slate-700 rounded">
      <Link href={`/users/${encodeURIComponent(user.username)}`} className="shrink-0">
        {user.profileImageUrl
          ? <img src={user.profileImageUrl} alt="" className="w-12 h-12 rounded-full object-cover" />
          : <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-xl">👤</div>}
      </Link>
      <div className="flex-1 min-w-0">
        <Link href={`/users/${encodeURIComponent(user.username)}`} className="font-medium hover:text-emerald-300">{user.username}<SupporterIcon tier={user.supporterTier} /></Link>
        {user.bio && <p className="text-xs text-slate-400 truncate">{user.bio}</p>}
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      <div className="flex gap-2 shrink-0">{children}</div>
    </li>
  );
}
