'use client';
/**
 * 소셜 버튼 + 사이드 패널 — 모든 페이지 우하단 플로팅. 로그인 유저만.
 * 버튼에는 DM·알림 unread 합계 배지. 클릭 시 우측 슬라이드 패널 — 친구·메시지·알림 진입 카드.
 * 몰입형 화면(월드/스튜디오)은 자체 UI 와 겹치지 않게 숨김 (FeedbackButton 과 동일 정책).
 */
import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { api, session, ApiError } from '@/lib/api';
import { useLoggedIn } from '@/lib/useLoggedIn';
import { useNotificationStream, type PushNotification } from '@/lib/notifications/useNotificationStream';
import DmListModal from '@/components/social/DmListModal';
import NotificationsModal from '@/components/social/NotificationsModal';

export default function SocialPanel() {
  const t = useTranslations('Social');
  const tn = useTranslations('Notifications');
  const router = useRouter();
  const loggedIn = useLoggedIn();
  const pathname = usePathname() || '';
  const [open, setOpen] = useState(false);
  const [dmModal, setDmModal] = useState(false);
  const [notifModal, setNotifModal] = useState(false);
  const [dmUnread, setDmUnread] = useState(0);
  const [notifUnread, setNotifUnread] = useState(0);
  const [toast, setToast] = useState<PushNotification | null>(null);

  // 몰입형 (월드/스튜디오) — 안 숨기고 위치만 위로 올려서 우하단 채팅/캐릭터 버튼들과 안 겹치게.
  const immersive = /\/(world|studio)(\/|$|\?)/.test(pathname);

  const loadUnread = useCallback(async () => {
    const tk = session.getToken();
    if (!tk) { setDmUnread(0); setNotifUnread(0); return; }
    try {
      const [dm, n] = await Promise.all([
        api.dmUnreadCount(tk).catch(() => ({ unread: 0 })),
        api.notificationsUnreadCount(tk).catch(() => ({ unread: 0 })),
      ]);
      setDmUnread(dm.unread || 0);
      setNotifUnread(n.unread || 0);
    } catch (e) {
      if (e instanceof ApiError) { /* noop */ }
    }
  }, []);

  // 60초 폴링 + 패널 열 때마다 즉시 갱신
  useEffect(() => {
    if (!loggedIn) return;
    loadUnread();
    const iv = setInterval(loadUnread, 60_000);
    return () => clearInterval(iv);
  }, [loggedIn, loadUnread]);
  useEffect(() => { if (open) loadUnread(); }, [open, loadUnread]);

  // 실시간 알림 수신(NotifyHub WS) — 배지 즉시 갱신 + 토스트 팝업.
  // 30초 폴링은 백업으로 유지(연결 끊김 대비).
  useNotificationStream((n) => { loadUnread(); setToast(n); });

  // 토스트 자동 사라짐
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(id);
  }, [toast]);

  // ESC 로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // 토스트 표시용 — NotifRow(NotificationBell) 와 동일한 라벨/링크 규칙.
  function notifView(n: PushNotification): { icon: string; text: string; href: string | null } {
    const { type, payload } = n;
    if (type === 'world_invite')   return { icon: '🌍', text: tn('world_invite',   { actor: payload.actorName || '?', world: payload.worldName || '' }), href: payload.worldId ? `/world?id=${encodeURIComponent(payload.worldId)}` : null };
    if (type === 'asset_liked')    return { icon: '♥',  text: tn('asset_liked',    { actor: payload.actorName || '?', asset: payload.assetName || '' }), href: null };
    if (type === 'user_followed')  return { icon: '+',  text: tn('user_followed',  { actor: payload.actorName || '?' }), href: payload.actorName ? `/users/${encodeURIComponent(payload.actorName)}` : null };
    if (type === 'asset_imported') return { icon: '↓',  text: tn('asset_imported', { actor: payload.actorName || '?', asset: payload.assetName || '' }), href: null };
    if (type === 'report_resolved') return { icon: payload.resolution === 'delete' ? '🗑' : '⚠', text: tn(`report_resolved_${payload.resolution}`, { asset: payload.assetName || '' }), href: null };
    if (type === 'asset_auto_hidden') return { icon: '⚠', text: tn('asset_auto_hidden', { asset: payload.assetName || '' }), href: null };
    return { icon: '🔔', text: type, href: null };
  }

  function onToastClick() {
    if (!toast) return;
    const { href } = notifView(toast);
    setToast(null);
    if (href) router.push(href);
    else setNotifModal(true);
  }

  if (!loggedIn) return null;

  const totalBadge = dmUnread + notifUnread;
  const toastView = toast ? notifView(toast) : null;
  // 몰입형은 우하단에 채팅(🗨)·캐릭터(🎭) 버튼이 stack 돼 있어 그 위로 올림.
  const btnBottom = immersive ? 156 : 16;

  return (
    <>
      {/* 실시간 알림 토스트 — 상단 중앙. 어느 페이지에서든 즉시 표시. */}
      {toastView && (
        <div
          role="button"
          tabIndex={0}
          onClick={onToastClick}
          onKeyDown={(e) => { if (e.key === 'Enter') onToastClick(); }}
          style={{
            position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
            zIndex: 2147483000, maxWidth: 'min(420px, 92vw)',
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
            background: 'linear-gradient(135deg,#1e1b4b,#312e81)', color: '#fff',
            border: '1px solid rgba(139,92,246,0.5)',
            boxShadow: '0 10px 32px rgba(0,0,0,0.45)',
            fontFamily: 'system-ui, sans-serif',
            animation: 'alp-toast-in 0.22s ease-out',
          }}
        >
          <style>{`@keyframes alp-toast-in { from { opacity: 0; transform: translate(-50%, -12px); } to { opacity: 1; transform: translate(-50%, 0); } }`}</style>
          <span style={{ fontSize: 20, lineHeight: 1, marginTop: 1 }}>{toastView.icon}</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.4 }}>{toastView.text}</span>
          <button
            onClick={(e) => { e.stopPropagation(); setToast(null); }}
            aria-label={t('close')}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 18, cursor: 'pointer', lineHeight: 1, marginTop: -2 }}
          >×</button>
        </div>
      )}

      {/* 플로팅 버튼 — 우하단. FeedbackButton(좌하단) 과 짝. */}
      <button
        onClick={() => setOpen(true)}
        aria-label={t('open')}
        style={{
          position: 'fixed', right: 16, bottom: btnBottom, zIndex: 2147482000,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 52, height: 52, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff',
          fontSize: 22, fontWeight: 700,
          boxShadow: '0 6px 20px rgba(0,0,0,0.35)', fontFamily: 'system-ui, sans-serif',
        }}
      >
        👥
        {totalBadge > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18,
            padding: '0 5px', borderRadius: 9,
            background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid #0f172a',
          }}>{totalBadge > 99 ? '99+' : totalBadge}</span>
        )}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2147482001,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', justifyContent: 'flex-end',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(380px, 92vw)', height: '100%',
              background: '#0f172a', color: '#fff',
              borderLeft: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '-20px 0 60px rgba(0,0,0,0.5)',
              display: 'flex', flexDirection: 'column',
              animation: 'alp-slide-in 0.18s ease-out',
            }}
          >
            <style>{`@keyframes alp-slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
            <div style={{ padding: '18px 18px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <strong style={{ fontSize: 16 }}>👥 {t('title')}</strong>
              <button onClick={() => setOpen(false)} aria-label={t('close')}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            <nav style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
              {/* 메시지·알림: 페이지 전환 대신 모달 — 빠른 미리보기 + 액션 */}
              <SocialAction icon="💬" label={t('messages')} desc={t('messagesDesc')} badge={dmUnread} onClick={() => { setOpen(false); setDmModal(true); }} />
              <SocialAction icon="🔔" label={t('notifications')} desc={t('notificationsDesc')} badge={notifUnread} onClick={() => { setOpen(false); setNotifModal(true); }} />
              {/* 친구·피드: 긴 콘텐츠/맥락 유지 — 전용 페이지 */}
              <SocialLink href="/presence" icon="🟢" label={t('online')} desc={t('onlineDesc')} onNavigate={() => setOpen(false)} />
              <SocialLink href="/friends" icon="🤝" label={t('friends')} desc={t('friendsDesc')} onNavigate={() => setOpen(false)} />
              <SocialLink href="/feed" icon="📰" label={t('feed')} desc={t('feedDesc')} onNavigate={() => setOpen(false)} />
              {/* 사람 찾기 = 마켓플레이스의 크리에이터 둘러보기 (/users 미존재) */}
              <SocialLink href="/assets/browse" icon="🔎" label={t('findPeople')} desc={t('findPeopleDesc')} onNavigate={() => setOpen(false)} />
            </nav>
          </div>
        </div>
      )}

      {/* 메시지·알림 모달 — 패널 닫힌 상태에서 단독으로도 띄울 수 있음 */}
      {dmModal && <DmListModal onClose={() => { setDmModal(false); loadUnread(); }} />}
      {notifModal && <NotificationsModal onClose={() => { setNotifModal(false); loadUnread(); }} onAllRead={() => setNotifUnread(0)} />}
    </>
  );
}

// 카드 공통 콘텐츠 (아이콘 + 라벨 + 설명 + 옵셔널 배지)
function CardInner({ icon, label, desc, badge }: { icon: string; label: string; desc: string; badge?: number }) {
  return (
    <>
      <span style={{ fontSize: 24 }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700 }}>
          {label}
          {badge && badge > 0 ? (
            <span style={{ minWidth: 18, height: 18, padding: '0 6px', borderRadius: 9, background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{badge > 99 ? '99+' : badge}</span>
          ) : null}
        </span>
        <span style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{desc}</span>
      </span>
      <span style={{ color: 'rgba(255,255,255,0.4)' }}>›</span>
    </>
  );
}

const CARD_STYLE: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12,
  padding: '12px 14px', borderRadius: 10,
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
  color: '#fff', textDecoration: 'none', cursor: 'pointer', textAlign: 'left',
};

function SocialLink({ href, icon, label, desc, badge, onNavigate }: {
  href: string; icon: string; label: string; desc: string; badge?: number; onNavigate: () => void;
}) {
  return (
    <Link href={href} onClick={onNavigate} style={CARD_STYLE}>
      <CardInner icon={icon} label={label} desc={desc} badge={badge} />
    </Link>
  );
}

function SocialAction({ icon, label, desc, badge, onClick }: {
  icon: string; label: string; desc: string; badge?: number; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} style={{ ...CARD_STYLE, font: 'inherit' }}>
      <CardInner icon={icon} label={label} desc={desc} badge={badge} />
    </button>
  );
}
