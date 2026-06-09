/**
 * VRChat 스타일 — 월드에서 다른 유저 클릭 시 표시되는 정보 패널
 * - 닉네임 + 후원자 배지 + bio + 통계
 * - 액션: 프로필 보기, 친구 신청, 메시지 보내기, 팔로우
 */
'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, session, ApiError } from '@/lib/api';
import { SupporterBadge } from '@/components/SupporterBadge';
import { DmChatModal } from '@/components/world/DmChatModal';
import { useBlockState, setMuted, setBlocked } from '@/lib/world/blocklist';
import type { RemotePlayer } from '@/lib/world/useGameSocket';

interface FullProfile {
  id: string;
  username: string;
  joinedAt: string;
  bio: string | null;
  profileImageUrl: string | null;
  bannerUrl?: string | null;
  iconEmoji?: string | null;
  themeColor?: string | null;
  publicCount: number;
  followerCount: number;
  followingCount: number;
  friendCount: number;
  supporterTier?: string | null;
  isFollowing: boolean;
  isMe: boolean;
}

interface VoiceProps {
  /** 이 유저가 마이크 켰는지 — false 면 슬라이더 disabled */
  micOn?: boolean;
  /** 지금 말하고 있는지 */
  speaking?: boolean;
  /** 0~1, 미지정 시 1.0 */
  voiceGain?: number;
  onVoiceGainChange?: (v: number) => void;
}

export function RemotePlayerInfoPanel({
  player, onClose,
  micOn, speaking, voiceGain, onVoiceGainChange,
}: { player: RemotePlayer; onClose: () => void } & VoiceProps) {
  const router = useRouter();
  const t = useTranslations('PlayerPanel');
  const tFriends = useTranslations('Friends');

  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [friendState, setFriendState] = useState<'self' | 'none' | 'pending_sent' | 'pending_received' | 'accepted' | 'blocked' | null>(null);
  const [friendshipId, setFriendshipId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [dmConvId, setDmConvId] = useState<string | null>(null);   // DM 모달 (페이지 이동 대신)
  const block = useBlockState(player.username);                     // 음소거/차단 상태 (로컬)
  const [reported, setReported] = useState(false);

  async function reportPlayer() {
    if (!profile || profile.isMe || reported) return;
    const tk = session.getToken();
    if (!tk) { router.push('/login'); return; }
    const reason = window.prompt(t('reportReasonPrompt')) || '';
    if (!reason.trim()) return;
    setBusy(true);
    try {
      await api.reportPlayer(tk, profile.id, reason.trim());
      setReported(true);
      // 신고와 동시에 차단(보호) — 더 이상 안 보이게
      setBlocked(player.username, true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'report failed');
    } finally { setBusy(false); }
  }

  useEffect(() => {
    let cancelled = false;
    const tk = session.getToken() || undefined;
    api.getUserProfile(player.username, tk)
      .then(d => { if (!cancelled) setProfile(d.profile as unknown as FullProfile); })
      .catch(e => { if (!cancelled) setError(e instanceof ApiError ? e.message : 'load failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    if (tk) {
      // 친구 상태도 별도 로드
      api.checkFriendship(tk, '').catch(() => {});
    }
    return () => { cancelled = true; };
  }, [player.username]);

  // profile 로드 후 친구 상태 체크
  useEffect(() => {
    if (!profile || profile.isMe) return;
    const tk = session.getToken();
    if (!tk) return;
    api.checkFriendship(tk, profile.id)
      .then(d => { setFriendState(d.state); setFriendshipId(d.friendshipId); })
      .catch(() => {});
  }, [profile?.id, profile?.isMe]);

  async function goToProfile() {
    router.push(`/users/${encodeURIComponent(player.username)}`);
  }
  async function openDm() {
    if (!profile || profile.isMe) return;
    const tk = session.getToken();
    if (!tk) { router.push('/login'); return; }
    setBusy(true);
    try {
      const d = await api.openConversation(tk, profile.id);
      setDmConvId(d.conversation.id);   // 페이지 이동 대신 모달 열기
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'open dm failed');
    } finally { setBusy(false); }
  }
  async function toggleFollow() {
    if (!profile || profile.isMe) return;
    const tk = session.getToken();
    if (!tk) { router.push('/login'); return; }
    setBusy(true);
    try {
      const r = profile.isFollowing
        ? await api.unfollowUser(tk, profile.username)
        : await api.followUser(tk, profile.username);
      setProfile({ ...profile, isFollowing: r.isFollowing, followerCount: r.followerCount });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'follow failed');
    } finally { setBusy(false); }
  }
  async function onFriendAction() {
    if (!profile || profile.isMe) return;
    const tk = session.getToken();
    if (!tk) { router.push('/login'); return; }
    setBusy(true);
    try {
      if (friendState === 'none') {
        await api.sendFriendRequest(tk, profile.id);
        setFriendState('pending_sent');
      } else if (friendState === 'pending_sent' && friendshipId) {
        await api.cancelFriendRequest(tk, friendshipId);
        setFriendState('none'); setFriendshipId(undefined);
      } else if (friendState === 'pending_received' && friendshipId) {
        await api.acceptFriendRequest(tk, friendshipId);
        setFriendState('accepted');
      } else if (friendState === 'accepted') {
        if (!confirm(tFriends('confirmRemove'))) { setBusy(false); return; }
        await api.removeFriend(tk, profile.id);
        setFriendState('none'); setFriendshipId(undefined);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'friend failed');
    } finally { setBusy(false); }
  }

  return (
    <>
      {/* 배경 클릭 시 닫기 */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          zIndex: 16777274, backdropFilter: 'blur(2px)',
        }}
      />
      {/* 패널 */}
      <div
        style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 'min(380px, 92vw)', maxHeight: '90vh', overflowY: 'auto',
          background: '#0f172a', color: '#fff',
          borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          zIndex: 16777275, border: '1px solid rgba(255,255,255,0.1)',
          fontFamily: "-apple-system,'Apple SD Gothic Neo',sans-serif",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 배너 영역 + 닫기 버튼 */}
        <div style={{
          height: 90, position: 'relative',
          background: profile?.bannerUrl
            ? `url(${profile.bannerUrl}) center/cover`
            : `linear-gradient(135deg, ${profile?.themeColor || '#6366f1'} 0%, ${profile?.themeColor || '#6366f1'}88 100%)`,
          borderRadius: '16px 16px 0 0',
        }}>
          <button
            onClick={onClose}
            style={{
              position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: '50%',
              background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', cursor: 'pointer',
              fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >×</button>
        </div>

        {/* 아바타 (배너 위에 겹침) */}
        <div style={{ padding: '0 18px', marginTop: -32, position: 'relative' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            border: '3px solid #0f172a',
            background: profile?.profileImageUrl
              ? `url(${profile.profileImageUrl}) center/cover`
              : profile?.themeColor
                ? `linear-gradient(135deg, ${profile.themeColor}, ${profile.themeColor}aa)`
                : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, color: '#fff', flexShrink: 0,
          }}>
            {!profile?.profileImageUrl && (profile?.iconEmoji || player.username.slice(0, 1).toUpperCase())}
          </div>

          {/* 닉네임 + 배지 */}
          <h2 style={{ margin: '8px 0 0', fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {player.username}
            {profile?.supporterTier && profile.supporterTier !== 'none' && (
              <SupporterBadge tier={profile.supporterTier} size="md" withLabel />
            )}
          </h2>

          {/* bio */}
          {profile?.bio && (
            <p style={{ margin: '6px 0 0', fontSize: 13, opacity: 0.85, lineHeight: 1.4 }}>{profile.bio}</p>
          )}
        </div>

        {/* 통계 */}
        <div style={{
          padding: 14, margin: '12px 18px 0',
          display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4,
          background: 'rgba(255,255,255,0.04)', borderRadius: 10, fontSize: 12,
        }}>
          <Stat label={t('publicAssets')} value={profile?.publicCount} />
          <Stat label={t('followers')}    value={profile?.followerCount} />
          <Stat label={t('following')}    value={profile?.followingCount} />
          <Stat label={t('friends')}      value={profile?.friendCount} />
        </div>

        {loading && <p style={{ padding: 14, textAlign: 'center', opacity: 0.5, fontSize: 12 }}>{t('loading')}</p>}
        {error && <p style={{ padding: '6px 18px', color: '#fca5a5', fontSize: 12 }}>{error}</p>}

        {/* 음성 볼륨 — 본인이 아니고 onVoiceGainChange 가 있을 때만 */}
        {profile && !profile.isMe && onVoiceGainChange && (
          <div style={{
            margin: '8px 18px 0', padding: 12, borderRadius: 10,
            background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                {t('voiceVolumeTitle')}
                {micOn && (
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: speaking ? '#22c55e' : 'rgba(255,255,255,0.25)',
                    flexShrink: 0,
                  }} title={speaking ? t('voiceVolumeSpeaking') : ''} />
                )}
              </span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', minWidth: 36, textAlign: 'right' }}>
                {Math.round((voiceGain ?? 1) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0} max={1} step={0.01}
              value={voiceGain ?? 1}
              disabled={!micOn}
              onChange={(e) => onVoiceGainChange(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: '#6366f1', opacity: micOn ? 1 : 0.4 }}
            />
            {!micOn && (
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                {t('voiceVolumeOff')}
              </div>
            )}
          </div>
        )}

        {/* 액션 버튼들 */}
        {profile && !profile.isMe && (
          <div style={{ padding: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button onClick={goToProfile} style={btnStyle('rgba(255,255,255,0.08)', '#cbd5e1')}>
              👤 {t('viewProfile')}
            </button>
            <button onClick={openDm} disabled={busy} style={btnStyle('rgba(59,130,246,0.25)', '#93c5fd')}>
              💬 {t('message')}
            </button>
            <button onClick={toggleFollow} disabled={busy}
              style={btnStyle(profile.isFollowing ? 'rgba(255,255,255,0.08)' : '#6366f1', '#fff')}>
              {profile.isFollowing ? '✓ ' + t('following') : '+ ' + t('follow')}
            </button>
            <button onClick={onFriendAction} disabled={busy || friendState === 'blocked'}
              style={btnStyle(
                friendState === 'accepted' ? 'rgba(34,197,94,0.25)' :
                friendState === 'pending_sent' ? 'rgba(255,255,255,0.08)' :
                friendState === 'pending_received' ? '#22c55e' : '#22c55e',
                '#fff',
              )}>
              {friendState === 'accepted' ? '✓ ' + tFriends('btnFriend')
                : friendState === 'pending_sent' ? tFriends('btnPending')
                : friendState === 'pending_received' ? tFriends('btnAccept')
                : '+ ' + tFriends('btnAddFriend')}
            </button>
          </div>
        )}

        {/* 안전 — 음소거 / 차단 / 신고 (본인 아닐 때) */}
        {profile && !profile.isMe && (
          <div style={{ padding: '0 14px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <button onClick={() => setMuted(player.username, !block.muted)}
              style={btnStyle(block.muted ? 'rgba(245,158,11,0.25)' : 'rgba(255,255,255,0.06)', block.muted ? '#fcd34d' : '#cbd5e1')}>
              {block.muted ? '🔇 ' + t('unmute') : '🔊 ' + t('mute')}
            </button>
            <button onClick={() => setBlocked(player.username, !block.blocked)}
              style={btnStyle(block.blocked ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.06)', block.blocked ? '#fca5a5' : '#cbd5e1')}>
              {block.blocked ? '🚫 ' + t('unblock') : '🚫 ' + t('block')}
            </button>
            <button onClick={reportPlayer} disabled={busy || reported}
              style={btnStyle('rgba(239,68,68,0.15)', reported ? 'rgba(255,255,255,0.4)' : '#fca5a5')}>
              {reported ? '✓ ' + t('reported') : '🚩 ' + t('report')}
            </button>
          </div>
        )}

        {profile?.isMe && (
          <p style={{ padding: 14, textAlign: 'center', opacity: 0.5, fontSize: 12 }}>{t('thatsYou')}</p>
        )}
      </div>

      {/* DM 채팅 모달 — 페이지 이동 없이 오버레이 */}
      {dmConvId && profile && (
        <DmChatModal
          conversationId={dmConvId}
          other={{ username: profile.username, profileImageUrl: profile.profileImageUrl, iconEmoji: profile.iconEmoji, themeColor: profile.themeColor }}
          onClose={() => setDmConvId(null)}
        />
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{value ?? '—'}</div>
      <div style={{ fontSize: 10, opacity: 0.5 }}>{label}</div>
    </div>
  );
}

function btnStyle(bg: string, color: string): React.CSSProperties {
  return {
    padding: '8px 12px', borderRadius: 8, border: 'none',
    background: bg, color, fontSize: 12, fontWeight: 700,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
  };
}
