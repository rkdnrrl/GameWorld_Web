'use client';
/**
 * DM 채팅방 (Phase 19) — Supabase Realtime 으로 실시간 수신
 */
import { useState, useEffect, useRef, useCallback, use } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, session, ApiError } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { setActiveDmConversation, DM_PUSH_EVENT, DM_READ_EVENT, type DmPush } from '@/lib/notifications/useNotificationStream';

interface Message { id: string; senderId: string; body: string; createdAt: string; readAt: string | null }
interface OtherUser { id: string; username: string; profileImageUrl: string | null; iconEmoji: string | null; themeColor: string | null; bio: string | null }

export default function DmRoom({ params }: { params: Promise<{ id: string }> }) {
  const t = useTranslations('Messages');
  const { id } = use(params);

  const [other, setOther] = useState<OtherUser | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);

  // 대화방 + 메시지 로드
  useEffect(() => {
    const tk = session.getToken();
    if (!tk) { setNeedsLogin(true); setLoading(false); return; }
    const u = session.getUser();
    setMyId(u?.id || null);

    Promise.all([
      api.getConversation(tk, id),
      api.listMessages(tk, id),
    ]).then(([conv, msgs]) => {
      setOther(conv.conversation.other);
      setMessages(msgs.messages);
      // 진입 시 읽음 처리 → 배지 갱신 이벤트
      api.markConversationRead(tk, id)
        .then(() => window.dispatchEvent(new Event(DM_READ_EVENT)))
        .catch(() => {});
    }).catch(e => {
      setError(e instanceof ApiError ? e.message : 'load failed');
    }).finally(() => setLoading(false));
  }, [id]);

  // 새 메시지 도착 시 스크롤
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  // 이 대화방을 보는 동안 DM 토스트 억제
  useEffect(() => {
    setActiveDmConversation(id);
    return () => setActiveDmConversation(null);
  }, [id]);

  // NotifyHub DM push — 이 대화면 즉시 재조회 (Supabase Realtime 백업)
  useEffect(() => {
    function onDm(e: Event) {
      const dm = (e as CustomEvent).detail as DmPush;
      if (dm.conversationId !== id) return;
      const tk = session.getToken(); if (!tk) return;
      api.listMessages(tk, id).then(d => {
        setMessages(d.messages);
        api.markConversationRead(tk, id)
          .then(() => window.dispatchEvent(new Event(DM_READ_EVENT)))
          .catch(() => {});
      }).catch(() => {});
    }
    window.addEventListener(DM_PUSH_EVENT, onDm);
    return () => window.removeEventListener(DM_PUSH_EVENT, onDm);
  }, [id]);

  // Supabase Realtime 구독 (dm_messages INSERT)
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`dm:${id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dm_messages', filter: `conversationId=eq.${id}` },
        (payload) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const row: any = payload.new;
          setMessages(prev => {
            if (prev.find(m => m.id === row.id)) return prev; // 중복 방지
            return [...prev, {
              id: row.id, senderId: row.senderId,
              body: row.body, createdAt: row.createdAt, readAt: row.readAt,
            }];
          });
          // 상대가 보낸 메시지면 즉시 읽음 처리
          const tk = session.getToken();
          if (tk && row.senderId !== myId) api.markConversationRead(tk, id).catch(() => {});
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, myId]);

  const send = useCallback(async () => {
    const body = input.trim();
    if (!body) return;
    const tk = session.getToken(); if (!tk) return;
    setSending(true); setError('');
    try {
      const d = await api.sendMessage(tk, id, body);
      setMessages(prev => prev.find(m => m.id === d.message.id) ? prev : [...prev, d.message]);
      setInput('');
      window.dispatchEvent(new Event(DM_READ_EVENT)); // 대화목록 미리보기·정렬 즉시 갱신
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'send failed');
    } finally { setSending(false); }
  }, [input, id]);

  if (needsLogin) return <main className="max-w-2xl mx-auto px-4 py-8"><p className="text-slate-400">{t('loginRequired')}</p></main>;

  return (
    <main className="flex flex-col h-[calc(100vh-64px)] max-w-2xl mx-auto">
      {/* 헤더 */}
      <header className="flex items-center gap-3 p-3 border-b border-slate-700 bg-slate-900/50">
        <Link href="/messages" className="text-slate-400 hover:text-white">←</Link>
        {other ? (
          <Link href={`/users/${encodeURIComponent(other.username)}`} className="flex items-center gap-2 flex-1 min-w-0 hover:text-emerald-300">
            {other.profileImageUrl
              ? <img src={other.profileImageUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
              : <div className="w-9 h-9 rounded-full flex items-center justify-center text-lg"
                  style={{ background: other.themeColor || '#475569' }}>
                  {other.iconEmoji || '👤'}
                </div>}
            <div className="min-w-0">
              <p className="font-medium truncate">{other.username}</p>
              {other.bio && <p className="text-xs text-slate-500 truncate">{other.bio}</p>}
            </div>
          </Link>
        ) : <div className="flex-1 text-slate-500 text-sm">{t('loading')}</div>}
      </header>

      {error && <div className="mx-3 mt-2 p-2 bg-rose-900/30 text-rose-300 text-sm rounded">{error}</div>}

      {/* 메시지 목록 */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading && <p className="text-slate-500 text-sm text-center">{t('loading')}</p>}
        {!loading && messages.length === 0 && <p className="text-slate-500 text-sm text-center py-8">{t('noMessages')}</p>}
        {messages.map(m => (
          <Bubble key={m.id} msg={m} isMine={m.senderId === myId} />
        ))}
      </div>

      {/* 입력창 */}
      <div className="p-3 border-t border-slate-700 flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !sending) { e.preventDefault(); send(); } }}
          placeholder={t('inputPlaceholder')}
          maxLength={2000}
          className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm"
        />
        <button
          onClick={send}
          disabled={sending || !input.trim()}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded disabled:opacity-50 text-sm"
        >
          {sending ? '…' : t('send')}
        </button>
      </div>
    </main>
  );
}

function Bubble({ msg, isMine }: { msg: Message; isMine: boolean }) {
  const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] px-3 py-2 rounded-lg ${isMine ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-100'}`}>
        <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
        <p className={`text-[10px] mt-1 ${isMine ? 'text-emerald-100/80' : 'text-slate-400'}`}>
          {time}{isMine && msg.readAt ? ' · ✓' : ''}
        </p>
      </div>
    </div>
  );
}
