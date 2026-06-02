'use client';
/**
 * DM 대화방 목록 (Phase 19)
 */
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, session, ApiError } from '@/lib/api';
import { SupporterIcon } from '@/components/SupporterBadge';

interface Conv {
  id: string;
  other: { id: string; username: string; profileImageUrl: string | null; iconEmoji: string | null; themeColor: string | null; supporterTier?: string | null } | null;
  lastMessageAt: string | null;
  lastMessageText: string | null;
  lastSenderId: string | null;
  unread: number;
}

export default function MessagesPage() {
  const t = useTranslations('Messages');
  const [convs, setConvs] = useState<Conv[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);

  const load = useCallback(async () => {
    const tk = session.getToken();
    if (!tk) { setNeedsLogin(true); setLoading(false); return; }
    try {
      const d = await api.listConversations(tk);
      setConvs(d.conversations);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'load failed');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (needsLogin) return <main className="max-w-2xl mx-auto px-4 py-8"><p className="text-slate-400">{t('loginRequired')}</p></main>;

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-1">{t('title')}</h1>
      <p className="text-sm text-slate-400 mb-6">{t('subtitle')}</p>

      {error && <div className="mb-3 p-2 bg-rose-900/30 text-rose-300 text-sm rounded">{error}</div>}
      {loading && <p className="text-slate-500 text-sm">{t('loading')}</p>}

      {!loading && convs.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-slate-500 mb-3">{t('empty')}</p>
          <Link href="/friends" className="text-emerald-300 hover:text-emerald-200 text-sm">→ {t('emptyGoFriends')}</Link>
        </div>
      )}

      <ul className="space-y-1">
        {convs.map(c => (
          <li key={c.id}>
            <Link href={`/messages/${c.id}`} className="flex items-center gap-3 p-3 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded">
              {c.other?.profileImageUrl
                ? <img src={c.other.profileImageUrl} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
                : <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl shrink-0"
                    style={{ background: c.other?.themeColor || '#475569' }}>
                    {c.other?.iconEmoji || '👤'}
                  </div>}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium truncate">{c.other?.username || '(deleted)'}<SupporterIcon tier={c.other?.supporterTier} /></p>
                  {c.lastMessageAt && <p className="text-xs text-slate-500 shrink-0">{new Date(c.lastMessageAt).toLocaleDateString()}</p>}
                </div>
                <p className="text-sm text-slate-400 truncate">{c.lastMessageText || t('noMessages')}</p>
              </div>
              {c.unread > 0 && <span className="shrink-0 px-2 py-0.5 text-xs font-bold bg-pink-500 text-white rounded-full">{c.unread}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
