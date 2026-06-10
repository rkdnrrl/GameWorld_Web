'use client';
/**
 * 친구 탭 (SocialPanel 인라인) — 페이지 이동 없이 패널 안에서:
 *  - 아이디(사용자 이름)로 친구 추가 (getUserProfile 로 id 해결 → sendFriendRequest)
 *  - 받은 친구 요청 수락/거절
 *  - 친구 목록 + presence(온라인/위치) + 바로 채팅 + 따라가기 + 삭제
 * 기존 API 재사용 (서버 변경 없음). DmChatModal 로 채팅.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api, session, ApiError } from '@/lib/api';
import { useFriendLocations } from '@/lib/world/useFriendLocations';
import { NOTIFICATION_PUSH_EVENT } from '@/lib/notifications/useNotificationStream';
import { DmChatModal } from '@/components/world/DmChatModal';

interface UserMini { id: string; username: string; profileImageUrl: string | null }
interface Friend { friendshipId: string; since: string; friend: UserMini }
interface ReceivedReq { friendshipId: string; createdAt: string; from: UserMini }

export default function FriendsTab({ onRequestsChange }: { onRequestsChange?: (n: number) => void }) {
  const t = useTranslations('Friends');
  const locale = useLocale();
  const { locations } = useFriendLocations();
  const locByUserId = new Map(locations.map(l => [l.userId, l]));

  const [friends, setFriends] = useState<Friend[]>([]);
  const [received, setReceived] = useState<ReceivedReq[]>([]);
  const [error, setError] = useState('');
  const [chatWith, setChatWith] = useState<UserMini | null>(null);

  // 친구 추가 입력 + 자동완성
  const [addName, setAddName] = useState('');
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [results, setResults] = useState<UserMini[]>([]);

  const load = useCallback(async () => {
    const tk = session.getToken();
    if (!tk) { setError(t('loginRequired')); return; }
    try {
      const [f, r] = await Promise.all([
        api.listFriends(tk),
        api.listFriendRequestsReceived(tk),
      ]);
      setFriends(f.friends);
      setReceived(r.requests);
      onRequestsChange?.(r.requests.length);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'load failed');
    }
  }, [t, onRequestsChange]);

  useEffect(() => { load(); }, [load]);

  // 친구 요청이 실시간으로 오면(friend_request 알림 push) 새로고침
  useEffect(() => {
    const onPush = () => load();
    window.addEventListener(NOTIFICATION_PUSH_EVENT, onPush);
    return () => window.removeEventListener(NOTIFICATION_PUSH_EVENT, onPush);
  }, [load]);

  // 입력하는 동안 일치하는 유저 자동완성 (디바운스 250ms, 2자 이상)
  useEffect(() => {
    const name = addName.trim();
    if (name.length < 2) { setResults([]); return; }
    const tk = session.getToken(); if (!tk) return;
    const id = setTimeout(() => {
      api.searchUsers(tk, name).then(d => setResults(d.users)).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(id);
  }, [addName]);

  // 드롭다운에서 특정 유저 선택 → 친구 요청
  async function requestUser(u: UserMini) {
    if (adding) return;
    const tk = session.getToken(); if (!tk) return;
    setAdding(true); setAddMsg(null); setResults([]); setAddName('');
    try {
      await api.sendFriendRequest(tk, u.id);
      setAddMsg({ ok: true, text: t('addSent', { name: u.username }) });
      load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setAddMsg({ ok: false, text: t('addErrAlready') });
      else setAddMsg({ ok: false, text: e instanceof ApiError ? e.message : t('addErrFailed') });
    } finally {
      setAdding(false);
    }
  }

  // 정확한 이름으로 추가 (Enter/추가 버튼 — 드롭다운 안 거치고)
  async function onAdd() {
    const name = addName.trim();
    if (!name || adding) return;
    const tk = session.getToken(); if (!tk) return;
    setAdding(true); setAddMsg(null);
    try {
      const { profile } = await api.getUserProfile(name, tk);
      if (profile.isMe) { setAddMsg({ ok: false, text: t('addErrSelf') }); return; }
      await api.sendFriendRequest(tk, profile.id);
      setAddMsg({ ok: true, text: t('addSent', { name: profile.username }) });
      setAddName(''); setResults([]);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setAddMsg({ ok: false, text: t('addErrNotFound') });
      else if (e instanceof ApiError && e.status === 409) setAddMsg({ ok: false, text: t('addErrAlready') });
      else setAddMsg({ ok: false, text: e instanceof ApiError ? e.message : t('addErrFailed') });
    } finally {
      setAdding(false);
    }
  }

  async function onAccept(id: string) {
    const tk = session.getToken(); if (!tk) return;
    try { await api.acceptFriendRequest(tk, id); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'failed'); }
  }
  async function onReject(id: string) {
    const tk = session.getToken(); if (!tk) return;
    try { await api.rejectFriendRequest(tk, id); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'failed'); }
  }
  async function onRemove(userId: string) {
    const tk = session.getToken(); if (!tk) return;
    if (!confirm(t('confirmRemove'))) return;
    try { await api.removeFriend(tk, userId); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'failed'); }
  }

  const onlineFirst = [...friends].sort((a, b) => (locByUserId.has(b.friend.id) ? 1 : 0) - (locByUserId.has(a.friend.id) ? 1 : 0));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* 아이디로 친구 추가 */}
      <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={addName}
            onChange={e => setAddName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onAdd(); }}
            placeholder={t('addPlaceholder')}
            maxLength={30}
            style={{ flex: 1, minWidth: 0, padding: '8px 10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 8, fontSize: 13, outline: 'none' }}
          />
          <button onClick={onAdd} disabled={adding || !addName.trim()} style={{
            padding: '8px 14px', background: '#6366f1', border: 'none', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 700,
            cursor: adding || !addName.trim() ? 'default' : 'pointer', opacity: adding || !addName.trim() ? 0.5 : 1, whiteSpace: 'nowrap',
          }}>{adding ? '…' : t('addBtn')}</button>
        </div>

        {/* 자동완성 — 입력과 일치하는 유저 목록 */}
        {results.length > 0 && (
          <div style={{ marginTop: 6, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, overflow: 'hidden' }}>
            {results.map(u => (
              <button key={u.id} onClick={() => requestUser(u)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
                background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', textAlign: 'left', color: '#fff',
              }}>
                <Avatar user={u} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.username}</span>
                <span style={{ fontSize: 16, color: '#a5b4fc', flexShrink: 0 }}>+</span>
              </button>
            ))}
          </div>
        )}

        {addMsg && (
          <div style={{ marginTop: 6, fontSize: 12, color: addMsg.ok ? '#6ee7b7' : '#fca5a5' }}>{addMsg.text}</div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
        {error && <div style={{ padding: 12, color: '#fca5a5', fontSize: 13 }}>{error}</div>}

        {/* 받은 요청 */}
        {received.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, opacity: 0.5, fontWeight: 700, padding: '2px 4px 6px' }}>{t('receivedTitle')} ({received.length})</div>
            {received.map(r => (
              <div key={r.friendshipId} style={rowStyle}>
                <Avatar user={r.from} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.from.username}</span>
                <button onClick={() => onAccept(r.friendshipId)} style={{ ...miniBtn, background: '#059669', borderColor: 'transparent' }}>{t('btnAccept')}</button>
                <button onClick={() => onReject(r.friendshipId)} style={miniBtn}>{t('btnReject')}</button>
              </div>
            ))}
          </div>
        )}

        {/* 친구 목록 */}
        {friends.length === 0 && received.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', opacity: 0.5, fontSize: 13, lineHeight: 1.6 }}>{t('emptyFriends')}</div>
        ) : (
          onlineFirst.map(f => {
            const loc = locByUserId.get(f.friend.id);
            const online = !!loc;
            const sub = loc
              ? (loc.worldIsPublic && loc.worldName ? `🟢 ${t('inWorld', { name: loc.worldName })}` : `🟢 ${t('onlinePrivate')}`)
              : t('friendSince', { date: new Date(f.since).toLocaleDateString() });
            return (
              <div key={f.friendshipId} style={rowStyle}>
                <Avatar user={f.friend} online={online} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.friend.username}</div>
                  <div style={{ fontSize: 11, opacity: 0.55, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
                </div>
                {loc && loc.worldIsPublic && (
                  <Link href={`/${locale}/world?id=${loc.worldId}`} style={{ ...miniBtn, background: '#059669', borderColor: 'transparent', textDecoration: 'none' }}>{t('btnFollow')}</Link>
                )}
                <button onClick={() => setChatWith(f.friend)} style={{ ...miniBtn, background: '#6366f1', borderColor: 'transparent' }}>{t('btnChat')}</button>
                <button onClick={() => onRemove(f.friend.id)} aria-label={t('btnRemove')} style={{ ...miniBtn, padding: '5px 8px' }}>×</button>
              </div>
            );
          })
        )}
      </div>

      {chatWith && (
        <DmChatModalLauncher user={chatWith} onClose={() => setChatWith(null)} />
      )}
    </div>
  );
}

/** username 으로 대화방 id 를 열고 DmChatModal 띄움 */
function DmChatModalLauncher({ user, onClose }: { user: UserMini; onClose: () => void }) {
  const [convId, setConvId] = useState<string | null>(null);
  useEffect(() => {
    const tk = session.getToken(); if (!tk) { onClose(); return; }
    api.openConversation(tk, user.id)
      .then(d => setConvId(d.conversation.id))
      .catch(() => onClose());
  }, [user.id, onClose]);
  if (!convId) return null;
  return (
    <DmChatModal
      conversationId={convId}
      other={{ username: user.username, profileImageUrl: user.profileImageUrl }}
      onClose={onClose}
    />
  );
}

function Avatar({ user, online }: { user: UserMini; online?: boolean }) {
  return (
    <span style={{ position: 'relative', width: 34, height: 34, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', fontSize: 14, color: '#fff', fontWeight: 700 }}>
      {user.profileImageUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={user.profileImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : user.username.slice(0, 1).toUpperCase()}
      {online && <span style={{ position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: '50%', background: '#34d399', border: '2px solid #0f172a' }} />}
    </span>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 10, marginBottom: 6,
};

const miniBtn: React.CSSProperties = {
  padding: '5px 10px', fontSize: 12, fontWeight: 600, borderRadius: 7, cursor: 'pointer',
  background: 'transparent', border: '1px solid rgba(255,255,255,0.18)', color: '#fff', whiteSpace: 'nowrap',
};
