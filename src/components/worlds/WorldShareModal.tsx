'use client';
/**
 * 월드 초대 모달 — 친구에게 DM 으로 월드 링크 자동 전송 + 외부 공유.
 *  - 친구 목록 fetch (api.listFriends)
 *  - 검색 input
 *  - 친구 카드 클릭 → openConversation + sendMessage("함께 가요! {url}") → 토스트
 *  - 외부 공유 버튼 (navigator.share / 클립보드)
 *  - ESC / 바깥 클릭 / 닫기 버튼 으로 닫기
 *  - 비로그인 상태면 외부 공유 옵션만
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, session, ApiError } from '@/lib/api';

interface Friend {
  id: string;
  username: string;
  profileImageUrl: string | null;
}

export default function WorldShareModal({
  world,
  url,
  onClose,
}: {
  world: { id: string; name: string };
  url: string;
  onClose: () => void;
}) {
  const t = useTranslations('Worlds');
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null); // 전송 중인 friend id
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const loggedIn = !!session.getToken();

  useEffect(() => {
    if (!loggedIn) return;
    const tk = session.getToken();
    if (!tk) return;
    api.listFriends(tk)
      .then(d => setFriends(d.friends.map(f => f.friend)))
      .catch(e => setError(e instanceof ApiError ? e.message : 'load failed'));
  }, [loggedIn]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    if (!friends) return [];
    const q = search.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter(f => f.username.toLowerCase().includes(q));
  }, [friends, search]);

  function pushToast(s: string) {
    setToast(s);
    setTimeout(() => setToast(curr => curr === s ? '' : curr), 2400);
  }

  async function sendInvite(friend: Friend) {
    const tk = session.getToken();
    if (!tk) return;
    if (busy || sentTo.has(friend.id)) return;
    setBusy(friend.id);
    try {
      const { conversation } = await api.openConversation(tk, friend.id);
      const body = `${t('inviteMessage', { name: world.name })} ${url}`;
      await api.sendMessage(tk, conversation.id, body);
      // VRChat 식 invite 알림 (헤더 종 + /notifications) — DM 과 별개의 즉시 알림
      api.sendWorldInvite(tk, { friendId: friend.id, worldId: world.id, worldName: world.name }).catch(() => {});
      setSentTo(prev => new Set(prev).add(friend.id));
      pushToast(t('inviteSent', { name: friend.username }));
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message || 'send failed';
      pushToast(`✕ ${msg}`);
    } finally {
      setBusy(null);
    }
  }

  async function externalShare() {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ title: world.name, text: world.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      pushToast(t('shareCopied'));
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        pushToast(t('shareCopied'));
      } catch {
        pushToast(t('shareError'));
      }
    }
  }

  return (
    <div
      role="dialog"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 2200,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{
        width: 'min(520px, 92vw)', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        background: '#0f172a', color: '#fff', borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.55, letterSpacing: 0.3 }}>{t('inviteTitle')}</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 380 }}>{world.name}</div>
          </div>
          <button onClick={onClose} aria-label="close" style={{
            background: 'transparent', border: 'none', color: '#fff', fontSize: 22,
            cursor: 'pointer', padding: 4, lineHeight: 1,
          }}>✕</button>
        </div>

        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8 }}>
          <button onClick={externalShare} style={{
            flex: 1, padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700,
            background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)',
            cursor: 'pointer',
          }}>🔗 {t('shareExternal')}</button>
        </div>

        {loggedIn ? (
          <>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('inviteSearchPlaceholder')}
                style={{
                  width: '100%', padding: '8px 12px', fontSize: 13,
                  background: 'rgba(255,255,255,0.05)', color: '#fff',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, outline: 'none',
                }}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
              {!friends && !error && (
                <div style={{ padding: 30, textAlign: 'center', opacity: 0.5, fontSize: 13 }}>…</div>
              )}
              {error && (
                <div style={{ padding: 20, color: '#fca5a5', fontSize: 12 }}>{error}</div>
              )}
              {friends && filtered.length === 0 && (
                <div style={{ padding: 30, textAlign: 'center', opacity: 0.5, fontSize: 13 }}>
                  {friends.length === 0 ? t('inviteNoFriends') : t('inviteNoMatches')}
                </div>
              )}
              {friends && filtered.map(f => {
                const isSent = sentTo.has(f.id);
                const isBusy = busy === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => sendInvite(f)}
                    disabled={isBusy || isSent}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 18px', background: 'transparent',
                      border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)',
                      color: '#fff', cursor: isBusy || isSent ? 'default' : 'pointer',
                      textAlign: 'left',
                      opacity: isSent ? 0.5 : 1,
                    }}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%',
                      background: f.profileImageUrl ? `url(${f.profileImageUrl}) center/cover` : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                      flex: '0 0 auto',
                    }} />
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.username}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>
                      {isBusy ? '…' : isSent ? `✓ ${t('inviteSentLabel')}` : `→ ${t('inviteSendLabel')}`}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div style={{ padding: 24, textAlign: 'center', opacity: 0.55, fontSize: 13 }}>
            {t('inviteLoginPrompt')}
          </div>
        )}

        {toast && (
          <div style={{
            position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(15,23,42,0.95)', color: '#fff', fontWeight: 700, fontSize: 12,
            padding: '8px 16px', borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.15)',
            pointerEvents: 'none',
          }}>{toast}</div>
        )}
      </div>
    </div>
  );
}
