'use client';
/**
 * 작가 공개 페이지 — /users/[username]
 * 헤더(이름·통계·가입일) + 그 작가의 공개 에셋 그리드 (좋아요/가져오기 재사용)
 */
import { useState, useEffect, useCallback, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, session, ApiError } from '@/lib/api';

import type { Asset, AssetKind } from '@/lib/assets/types';
import { getKind } from '@/lib/assets/registry';
import '@/lib/assets/kinds';

import AssetMarketCard from '@/components/assets/AssetMarketCard';
import AssetReportModal, { type ReportReason } from '@/components/assets/AssetReportModal';

interface MarketAsset extends Asset {
  creator?: { username: string | null };
  liked?: boolean;
  likeCount?: number;
  importCount?: number;
}

interface UserProfile {
  id: string;
  username: string;
  joinedAt: string;
  bio: string | null;
  profileImageUrl: string | null;
  publicCount: number;
  likesTotal: number;
  importsTotal: number;
  followerCount: number;
  followingCount: number;
  friendCount: number;
  isFollowing: boolean;
  isMe: boolean;
}

type FriendState = 'self' | 'none' | 'pending_sent' | 'pending_received' | 'accepted' | 'blocked';

const PAGE_SIZE = 40;

export default function UserPage({ params }: { params: Promise<{ username: string }> }) {
  const t = useTranslations('Assets');
  const router       = useRouter();
  const searchParams = useSearchParams();
  // Next.js 16 — params 는 Promise (React.use 로 unwrap)
  const { username } = use(params);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileError, setProfileError] = useState('');

  const [kinds, setKinds]   = useState<AssetKind[]>([]);
  const [assets, setAssets] = useState<MarketAsset[]>([]);
  const [total,  setTotal]  = useState(0);
  const [page,   setPage]   = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [likingId, setLikingId]       = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
  const [reportingAsset, setReportingAsset] = useState<Asset | null>(null);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());

  const kindSel = searchParams.get('kind') || '';
  const sort    = (searchParams.get('sort') || 'popular') as 'recent' | 'name' | 'popular';

  const setQuery = useCallback((patch: Record<string, string | null>) => {
    const sp = new URLSearchParams(searchParams.toString());
    Object.entries(patch).forEach(([k, v]) => {
      if (!v) sp.delete(k); else sp.set(k, v);
    });
    router.replace(`?${sp.toString()}`, { scroll: false });
  }, [router, searchParams]);

  // 프로필 + kinds 로드 (한 번)
  useEffect(() => {
    const tk = session.getToken() || undefined;
    api.getUserProfile(username, tk)
      .then(d => setProfile(d.profile))
      .catch(e => setProfileError(e instanceof ApiError ? e.message : 'load failed'));
    api.listAssetKinds().then(d => setKinds(d.kinds)).catch(() => {});
  }, [username]);

  // 친구 관계 상태 (Phase 16)
  const [friendState, setFriendState] = useState<FriendState>('none');
  const [friendshipId, setFriendshipId] = useState<string | undefined>();
  const [friendBusy, setFriendBusy] = useState(false);
  const tFriends = useTranslations('Friends');

  useEffect(() => {
    if (!profile || profile.isMe) return;
    const tk = session.getToken();
    if (!tk) return;
    api.checkFriendship(tk, profile.id)
      .then(d => { setFriendState(d.state); setFriendshipId(d.friendshipId); })
      .catch(() => {});
  }, [profile?.id, profile?.isMe]);

  async function onFriendAction() {
    if (!profile || profile.isMe || friendBusy) return;
    const tk = session.getToken();
    if (!tk) { router.push('/login'); return; }
    setFriendBusy(true);
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
        if (!confirm(tFriends('confirmRemove'))) return;
        await api.removeFriend(tk, profile.id);
        setFriendState('none'); setFriendshipId(undefined);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'friend action failed');
    } finally {
      setFriendBusy(false);
    }
  }

  const [followBusy, setFollowBusy] = useState(false);
  async function toggleFollow() {
    if (!profile || profile.isMe) return;
    const tk = session.getToken();
    if (!tk) { router.push('/login'); return; }
    setFollowBusy(true);
    try {
      const res = profile.isFollowing
        ? await api.unfollowUser(tk, profile.username)
        : await api.followUser(tk, profile.username);
      setProfile({ ...profile, isFollowing: res.isFollowing, followerCount: res.followerCount });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'follow failed');
    } finally {
      setFollowBusy(false);
    }
  }

  // 에셋 목록 — 필터 변경 시 1페이지부터
  useEffect(() => {
    if (!profile) return;
    setLoading(true);
    setPage(1);
    const tk = session.getToken() || undefined;
    api.listUserAssets(username, { kind: kindSel, sort, page: 1, pageSize: PAGE_SIZE }, tk)
      .then(d => {
        setAssets(d.assets as MarketAsset[]);
        setTotal(d.total);
        setHasMore(d.hasMore);
        setError('');
      })
      .catch(e => setError(e instanceof ApiError ? e.message : 'load failed'))
      .finally(() => setLoading(false));
  }, [username, profile, kindSel, sort]);

  async function loadMore() {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const next = page + 1;
      const tk = session.getToken() || undefined;
      const d = await api.listUserAssets(username, { kind: kindSel, sort, page: next, pageSize: PAGE_SIZE }, tk);
      setAssets(prev => [...prev, ...(d.assets as MarketAsset[])]);
      setPage(next);
      setHasMore(d.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }

  async function importAsset(a: Asset) {
    const tk = session.getToken();
    if (!tk) { router.push('/login'); return; }
    setImportingId(a.id);
    try {
      await api.cloneAsset(tk, a.id);
      setImportedIds(prev => new Set(prev).add(a.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'import failed');
    } finally {
      setImportingId(null);
    }
  }

  async function submitReport(reason: ReportReason, comment: string) {
    if (!reportingAsset) return;
    const tk = session.getToken();
    if (!tk) { router.push('/login'); return; }
    await api.reportAsset(tk, reportingAsset.id, { reason, comment });
    setReportedIds(prev => new Set(prev).add(reportingAsset.id));
  }

  async function toggleLike(a: MarketAsset) {
    const tk = session.getToken();
    if (!tk) { router.push('/login'); return; }
    setLikingId(a.id);
    try {
      const res = a.liked ? await api.unlikeAsset(tk, a.id) : await api.likeAsset(tk, a.id);
      setAssets(prev => prev.map(x => x.id === a.id ? { ...x, liked: res.liked, likeCount: res.likeCount } : x));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'like failed');
    } finally {
      setLikingId(null);
    }
  }

  const previewHandler = previewAsset ? getKind(previewAsset.kind) : null;
  const PreviewComp    = previewHandler?.Preview;

  if (profileError) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', opacity: 0.6 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🤷</div>
          <div>{profileError}</div>
          <Link href="/assets/browse" style={{ marginTop: 16, display: 'inline-block', color: '#a5b4fc' }}>
            ← {t('marketBackToBrowse')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {previewAsset && PreviewComp && (
        <PreviewComp asset={previewAsset} onClose={() => setPreviewAsset(null)} />
      )}
      {reportingAsset && (
        <AssetReportModal
          asset={reportingAsset}
          onClose={() => setReportingAsset(null)}
          onSubmit={submitReport}
        />
      )}

      <div style={{ minHeight: '100vh', background: '#0f172a', color: '#fff', fontFamily: "-apple-system,'Apple SD Gothic Neo',sans-serif" }}>
        {/* 배너 (Phase 17) */}
        {profile?.bannerUrl && (
          <div style={{
            height: 200,
            background: `url(${profile.bannerUrl}) center/cover`,
          }} />
        )}
        {!profile?.bannerUrl && profile?.themeColor && (
          <div style={{
            height: 120,
            background: `linear-gradient(135deg, ${profile.themeColor} 0%, ${profile.themeColor}aa 100%)`,
          }} />
        )}

        {/* 헤더 */}
        <div style={{ padding: '24px 32px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            {/* 아바타 (이미지 > 이모지 > 이니셜) */}
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: profile?.profileImageUrl
                ? `url(${profile.profileImageUrl}) center/cover`
                : profile?.themeColor
                  ? `linear-gradient(135deg, ${profile.themeColor}, ${profile.themeColor}aa)`
                  : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, fontWeight: 800, color: '#fff', flexShrink: 0,
              overflow: 'hidden',
            }}>
              {!profile?.profileImageUrl && (profile?.iconEmoji || username.slice(0, 1).toUpperCase())}
            </div>

            <div style={{ flex: 1, minWidth: 200 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{username}</h1>
              {profile?.bio && <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.8 }}>{profile.bio}</p>}
              <div style={{ fontSize: 12, opacity: 0.5, marginTop: 4 }}>
                {profile && t('userJoinedOn', { date: new Date(profile.joinedAt).toLocaleDateString() })}
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
                <Stat label={t('userPublicCount')} value={profile?.publicCount ?? '—'} />
                <Stat label={t('userLikesTotal')}  value={profile?.likesTotal ?? '—'} icon="♥" />
                <Stat label={t('userImportsTotal')} value={profile?.importsTotal ?? '—'} icon="↓" />
                <Stat label={t('userFollowers')}   value={profile?.followerCount ?? '—'} />
                <Stat label={t('userFollowing')}   value={profile?.followingCount ?? '—'} />
              </div>
            </div>

            {profile && !profile.isMe && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={toggleFollow}
                  disabled={followBusy}
                  style={{
                    fontSize: 13, fontWeight: 700, cursor: followBusy ? 'default' : 'pointer',
                    padding: '8px 20px', border: 'none', borderRadius: 8,
                    background: profile.isFollowing ? 'rgba(255,255,255,0.08)' : '#6366f1',
                    color: profile.isFollowing ? 'rgba(255,255,255,0.8)' : '#fff',
                    opacity: followBusy ? 0.6 : 1,
                  }}>
                  {followBusy ? '…' : profile.isFollowing ? '✓ ' + t('following') : '+ ' + t('follow')}
                </button>
                <button
                  onClick={async () => {
                    const tk = session.getToken();
                    if (!tk) { router.push('/login'); return; }
                    const d = await api.openConversation(tk, profile.id);
                    router.push(`/messages/${d.conversation.id}`);
                  }}
                  style={{
                    fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    padding: '8px 20px', border: 'none', borderRadius: 8,
                    background: 'rgba(59,130,246,0.18)', color: '#93c5fd',
                  }}>
                  💬 {tFriends('btnMessage')}
                </button>
                <button
                  onClick={onFriendAction}
                  disabled={friendBusy || friendState === 'blocked'}
                  style={{
                    fontSize: 13, fontWeight: 700, cursor: friendBusy ? 'default' : 'pointer',
                    padding: '8px 20px', border: 'none', borderRadius: 8,
                    background:
                      friendState === 'accepted' ? 'rgba(34,197,94,0.18)' :
                      friendState === 'pending_received' ? '#22c55e' :
                      friendState === 'pending_sent' ? 'rgba(255,255,255,0.08)' :
                      friendState === 'blocked' ? 'rgba(255,255,255,0.05)' : '#22c55e',
                    color:
                      friendState === 'accepted' ? '#86efac' :
                      friendState === 'pending_sent' || friendState === 'blocked' ? 'rgba(255,255,255,0.6)' : '#fff',
                    opacity: friendBusy ? 0.6 : 1,
                  }}>
                  {friendBusy ? '…'
                    : friendState === 'accepted' ? '✓ ' + tFriends('btnFriend')
                    : friendState === 'pending_sent' ? tFriends('btnPending')
                    : friendState === 'pending_received' ? tFriends('btnAccept')
                    : friendState === 'blocked' ? tFriends('blocked')
                    : '+ ' + tFriends('btnAddFriend')}
                </button>
              </div>
            )}

            <Link href="/assets/browse" style={{
              fontSize: 12, color: '#a5b4fc', textDecoration: 'none',
              padding: '7px 14px', background: 'rgba(99,102,241,0.18)', borderRadius: 8,
            }}>
              ← {t('marketBackToBrowse')}
            </Link>
          </div>
        </div>

        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 32px' }}>
          {/* 필터 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.05)', padding: 3, borderRadius: 9 }}>
              <KindChip active={!kindSel} label={t('all')} onClick={() => setQuery({ kind: null })} />
              {kinds.map(k => (
                <KindChip key={k.id}
                  active={kindSel === k.id}
                  label={`${k.icon || ''} ${k.label}`.trim()}
                  onClick={() => setQuery({ kind: k.id === kindSel ? null : k.id })} />
              ))}
            </div>

            <select
              value={sort}
              onChange={e => setQuery({ sort: e.target.value === 'popular' ? null : e.target.value })}
              style={{
                padding: '7px 10px', fontSize: 12,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8, color: '#fff', outline: 'none', cursor: 'pointer',
              }}>
              <option value="popular">{t('sortPopular')}</option>
              <option value="recent">{t('sortRecent')}</option>
              <option value="name">{t('sortName')}</option>
            </select>

            <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.55 }}>
              {t('marketTotalCount', { count: total })}
            </div>
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 10, padding: '10px 16px', color: '#fca5a5', fontSize: 13, marginBottom: 14,
            }}>
              ⚠️ {error}
            </div>
          )}

          {assets.length === 0 && !loading ? (
            <div style={{ textAlign: 'center', opacity: 0.4, padding: '60px 0', fontSize: 14 }}>
              {t('userNoPublicAssets')}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
              {assets.map(a => (
                <AssetMarketCard
                  key={a.id}
                  asset={a}
                  kinds={kinds}
                  importing={importingId === a.id}
                  imported={importedIds.has(a.id)}
                  liking={likingId === a.id}
                  reported={reportedIds.has(a.id)}
                  onPreview={setPreviewAsset}
                  onImport={importAsset}
                  onToggleLike={toggleLike}
                  onReport={setReportingAsset}
                />
              ))}
            </div>
          )}

          {hasMore && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <button onClick={loadMore} disabled={loading}
                style={{
                  padding: '10px 24px', fontSize: 13, fontWeight: 700,
                  background: 'rgba(99,102,241,0.18)', color: '#c7d2fe',
                  border: 'none', borderRadius: 8, cursor: 'pointer',
                }}>
                {loading ? t('marketLoading') : t('marketLoadMore')}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, icon }: { label: string; value: number | string; icon?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>
        {icon && <span style={{ marginRight: 4, opacity: 0.7 }}>{icon}</span>}
        {value}
      </div>
      <div style={{ fontSize: 10, opacity: 0.45, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    </div>
  );
}

function KindChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{
        padding: '5px 11px', fontSize: 12, border: 'none', borderRadius: 6, cursor: 'pointer',
        background: active ? 'rgba(99,102,241,0.35)' : 'transparent',
        color: active ? '#fff' : 'rgba(255,255,255,0.55)',
        fontWeight: active ? 700 : 500,
        transition: 'all .12s',
      }}>
      {label}
    </button>
  );
}
