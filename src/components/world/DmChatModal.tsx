/**
 * 월드 내 DM 채팅 모달 — 페이지 이동 없이 오버레이로 1:1 채팅.
 * RemotePlayerInfoPanel 의 "메시지" 버튼이 페이지 이동 대신 이 모달을 연다.
 * Supabase Realtime 으로 실시간 수신 (DM 페이지와 동일 로직).
 *
 * keydown 은 컨테이너에서 stopPropagation — 월드의 이동키(WASD) 가 발동되지 않게.
 */
'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { api, session, ApiError } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { setActiveDmConversation } from '@/lib/notifications/useNotificationStream';
import { linkify } from '@/lib/linkify';

interface Message { id: string; senderId: string; body: string; createdAt: string; readAt: string | null }
interface OtherLite { username: string; profileImageUrl?: string | null; iconEmoji?: string | null; themeColor?: string | null }

export function DmChatModal({ conversationId, other, onClose }: {
  conversationId: string;
  other: OtherLite;
  onClose: () => void;
}) {
  const t = useTranslations('Messages');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [myId, setMyId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tk = session.getToken();
    if (!tk) { setLoading(false); setError(t('loginRequired')); return; }
    setMyId(session.getUser()?.id || null);
    api.listMessages(tk, conversationId)
      .then(d => { setMessages(d.messages); api.markConversationRead(tk, conversationId).catch(() => {}); })
      .catch(e => setError(e instanceof ApiError ? e.message : 'load failed'))
      .finally(() => setLoading(false));
  }, [conversationId, t]);

  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [messages]);

  // 이 대화창을 보는 동안 DM 토스트 억제 (SocialPanel 이 참조)
  useEffect(() => {
    setActiveDmConversation(conversationId);
    return () => setActiveDmConversation(null);
  }, [conversationId]);

  // Supabase Realtime — 새 메시지 수신
  useEffect(() => {
    const ch = supabase
      .channel(`dm:${conversationId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dm_messages', filter: `conversationId=eq.${conversationId}` },
        (payload) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const row: any = payload.new;
          setMessages(prev => prev.find(m => m.id === row.id) ? prev
            : [...prev, { id: row.id, senderId: row.senderId, body: row.body, createdAt: row.createdAt, readAt: row.readAt }]);
          const tk = session.getToken();
          if (tk && row.senderId !== myId) api.markConversationRead(tk, conversationId).catch(() => {});
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId, myId]);

  const send = useCallback(async () => {
    const body = input.trim();
    if (!body) return;
    const tk = session.getToken(); if (!tk) return;
    setSending(true); setError('');
    try {
      const d = await api.sendMessage(tk, conversationId, body);
      setMessages(prev => prev.find(m => m.id === d.message.id) ? prev : [...prev, d.message]);
      setInput('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'send failed');
    } finally { setSending(false); }
  }, [input, conversationId]);

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 16777276, backdropFilter: 'blur(2px)' }} />
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}   // 월드 이동키(WASD) 발동 방지
        style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 'min(420px, 94vw)', height: 'min(560px, 86vh)', display: 'flex', flexDirection: 'column',
          background: '#0f172a', color: '#fff', borderRadius: 16, overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)', zIndex: 16777277, border: '1px solid rgba(255,255,255,0.1)',
          fontFamily: "-apple-system,'Apple SD Gothic Neo',sans-serif",
        }}
      >
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
            background: other.profileImageUrl ? `url(${other.profileImageUrl}) center/cover` : (other.themeColor || '#475569'),
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
          }}>{!other.profileImageUrl && (other.iconEmoji || other.username.slice(0, 1).toUpperCase())}</div>
          <div style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {other.username}
          </div>
          <button onClick={onClose} aria-label={t('close') || 'close'} style={{
            width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: 'none',
            color: '#fff', cursor: 'pointer', fontSize: 18,
          }}>×</button>
        </div>

        {error && <div style={{ margin: '8px 12px 0', padding: 8, background: 'rgba(244,63,94,0.18)', color: '#fca5a5', fontSize: 12, borderRadius: 6 }}>{error}</div>}

        {/* 메시지 목록 */}
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {loading && <p style={{ textAlign: 'center', opacity: 0.5, fontSize: 12 }}>{t('loading')}</p>}
          {!loading && messages.length === 0 && <p style={{ textAlign: 'center', opacity: 0.5, fontSize: 12, padding: '24px 0' }}>{t('noMessages')}</p>}
          {messages.map(m => {
            const mine = m.senderId === myId;
            const time = new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '76%', padding: '7px 11px', borderRadius: 12,
                  background: mine ? '#059669' : 'rgba(255,255,255,0.1)', color: mine ? '#fff' : '#e2e8f0',
                }}>
                  <p style={{ margin: 0, fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{linkify(m.body)}</p>
                  <p style={{ margin: '3px 0 0', fontSize: 10, opacity: 0.7 }}>{time}{mine && m.readAt ? ' · ✓' : ''}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* 입력 */}
        <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <input
            autoFocus
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !sending) { e.preventDefault(); send(); } }}
            placeholder={t('inputPlaceholder')}
            maxLength={2000}
            style={{ flex: 1, padding: '9px 12px', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 8, fontSize: 13, outline: 'none' }}
          />
          <button onClick={send} disabled={sending || !input.trim()} style={{
            padding: '9px 16px', background: '#059669', border: 'none', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 700,
            cursor: sending || !input.trim() ? 'default' : 'pointer', opacity: sending || !input.trim() ? 0.5 : 1,
          }}>{sending ? '…' : t('send')}</button>
        </div>
      </div>
    </>
  );
}
