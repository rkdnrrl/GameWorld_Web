'use client';
/**
 * 소셜 패널 — 모든 페이지 우하단 플로팅. 로그인 유저만.
 * 버튼 클릭 시 우측 슬라이드 패널, 그 안에서 탭(친구/메시지/알림)을 전부 인라인 처리.
 *  - 페이지 이동 없이 친구추가·요청수락·채팅·알림을 패널 안에서 (롤/디스코드 식)
 *  - 실시간 알림/DM push → 배지 즉시 갱신 + 상단 토스트
 * 몰입형 화면(월드/스튜디오)은 버튼 위치만 위로.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { api, session, ApiError } from '@/lib/api';
import { useLoggedIn } from '@/lib/useLoggedIn';
import {
  useNotificationStream, getActiveDmConversation,
  NOTIFICATION_PUSH_EVENT, DM_PUSH_EVENT, DM_READ_EVENT,
  type PushNotification, type DmPush,
} from '@/lib/notifications/useNotificationStream';
import FriendsTab from '@/components/social/FriendsTab';
import DmListModal from '@/components/social/DmListModal';
import NotificationsModal from '@/components/social/NotificationsModal';

type Tab = 'friends' | 'messages' | 'notifications';
type ToastView = { icon: string; text: string; href: string | null };

export default function SocialPanel() {
  const t = useTranslations('Social');
  const tn = useTranslations('Notifications');
  const router = useRouter();
  const loggedIn = useLoggedIn();
  const pathname = usePathname() || '';
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('friends');
  const [dmUnread, setDmUnread] = useState(0);
  const [notifUnread, setNotifUnread] = useState(0);
  const [reqCount, setReqCount] = useState(0);
  const [toast, setToast] = useState<ToastView | null>(null);
  // 플로팅 버튼 드래그 이동 — 위치를 localStorage 에 저장. null 이면 기본(우하단).
  const [btnPos, setBtnPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef({ dragging: false, moved: false, ox: 0, oy: 0, sx: 0, sy: 0 });
  const justDraggedRef = useRef(false);

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

  useEffect(() => {
    if (!loggedIn) return;
    loadUnread();
    const iv = setInterval(loadUnread, 60_000);
    return () => clearInterval(iv);
  }, [loggedIn, loadUnread]);
  useEffect(() => { if (open) loadUnread(); }, [open, loadUnread]);

  // 실시간 연결 — 연결만 유지, 이벤트는 window 로
  useNotificationStream();

  // 알림/DM push → 배지 즉시 갱신 + 토스트
  useEffect(() => {
    function onNotif(e: Event) {
      loadUnread();
      setToast(notifView((e as CustomEvent).detail as PushNotification));
    }
    function onDm(e: Event) {
      const dm = (e as CustomEvent).detail as DmPush;
      loadUnread();
      if (dm.conversationId !== getActiveDmConversation()) {
        setToast({ icon: '💬', text: `${dm.fromUsername}: ${dm.preview}`, href: `/messages/${dm.conversationId}` });
      }
    }
    const onRead = () => loadUnread();
    window.addEventListener(NOTIFICATION_PUSH_EVENT, onNotif);
    window.addEventListener(DM_PUSH_EVENT, onDm);
    window.addEventListener(DM_READ_EVENT, onRead);
    return () => {
      window.removeEventListener(NOTIFICATION_PUSH_EVENT, onNotif);
      window.removeEventListener(DM_PUSH_EVENT, onDm);
      window.removeEventListener(DM_READ_EVENT, onRead);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadUnread]);

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

  // 저장된 버튼 위치 로드 + 창 크기 변동 시 화면 안으로 보정
  useEffect(() => {
    const BTN = 52, M = 8;
    const clamp = (p: { x: number; y: number }) => ({
      x: Math.max(M, Math.min(p.x, window.innerWidth - BTN - M)),
      y: Math.max(M, Math.min(p.y, window.innerHeight - BTN - M)),
    });
    try {
      const raw = localStorage.getItem('alp_social_btn_pos');
      if (raw) { const p = JSON.parse(raw); if (typeof p?.x === 'number' && typeof p?.y === 'number') setBtnPos(clamp(p)); }
    } catch { /* noop */ }
    const onResize = () => setBtnPos(prev => prev ? clamp(prev) : prev);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function notifView(n: PushNotification): ToastView {
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
    const href = toast.href;
    setToast(null);
    if (href) router.push(href);
    else { setTab('notifications'); setOpen(true); }
  }

  // ── 플로팅 버튼 드래그 ──
  const BTN = 52, MARGIN = 8;
  function clampPos(x: number, y: number) {
    return {
      x: Math.max(MARGIN, Math.min(x, window.innerWidth - BTN - MARGIN)),
      y: Math.max(MARGIN, Math.min(y, window.innerHeight - BTN - MARGIN)),
    };
  }
  function onBtnPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = { dragging: true, moved: false, ox: e.clientX - rect.left, oy: e.clientY - rect.top, sx: e.clientX, sy: e.clientY };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
  }
  function onBtnPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = dragRef.current;
    if (!d.dragging) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 4) d.moved = true;
    if (!d.moved) return;
    setBtnPos(clampPos(e.clientX - d.ox, e.clientY - d.oy));
  }
  function onBtnPointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    const d = dragRef.current;
    if (!d.dragging) return;
    d.dragging = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    if (d.moved) {
      const p = clampPos(e.clientX - d.ox, e.clientY - d.oy);
      setBtnPos(p);
      try { localStorage.setItem('alp_social_btn_pos', JSON.stringify(p)); } catch { /* noop */ }
      justDraggedRef.current = true;            // 직후 click(패널 열기) 억제
      setTimeout(() => { justDraggedRef.current = false; }, 60);
    }
  }

  if (!loggedIn) return null;

  const totalBadge = dmUnread + notifUnread + reqCount;
  const btnBottom = immersive ? 156 : 16;

  return (
    <>
      {/* 실시간 토스트 — 상단 중앙 */}
      {toast && (
        <div
          role="button" tabIndex={0}
          onClick={onToastClick}
          onKeyDown={(e) => { if (e.key === 'Enter') onToastClick(); }}
          style={{
            position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
            zIndex: 2147483000, maxWidth: 'min(420px, 92vw)',
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
            background: 'linear-gradient(135deg,#1e1b4b,#312e81)', color: '#fff',
            border: '1px solid rgba(139,92,246,0.5)', boxShadow: '0 10px 32px rgba(0,0,0,0.45)',
            fontFamily: 'system-ui, sans-serif', animation: 'alp-toast-in 0.22s ease-out',
          }}
        >
          <style>{`@keyframes alp-toast-in { from { opacity: 0; transform: translate(-50%, -12px); } to { opacity: 1; transform: translate(-50%, 0); } }`}</style>
          <span style={{ fontSize: 20, lineHeight: 1, marginTop: 1 }}>{toast.icon}</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.4 }}>{toast.text}</span>
          <button onClick={(e) => { e.stopPropagation(); setToast(null); }} aria-label={t('close')}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 18, cursor: 'pointer', lineHeight: 1, marginTop: -2 }}>×</button>
        </div>
      )}

      {/* 플로팅 버튼 (드래그로 이동 가능, 위치 저장) */}
      <button
        onClick={() => { if (justDraggedRef.current) return; setOpen(true); }}
        onPointerDown={onBtnPointerDown}
        onPointerMove={onBtnPointerMove}
        onPointerUp={onBtnPointerUp}
        aria-label={t('open')}
        title={t('open')}
        style={{
          position: 'fixed', zIndex: 2147482000,
          ...(btnPos ? { left: btnPos.x, top: btnPos.y } : { right: 16, bottom: btnBottom }),
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 52, height: 52, borderRadius: '50%', border: 'none',
          cursor: 'grab', touchAction: 'none',
          background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff',
          fontSize: 22, fontWeight: 700, boxShadow: '0 6px 20px rgba(0,0,0,0.35)', fontFamily: 'system-ui, sans-serif',
        }}
      >
        👥
        {totalBadge > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
            background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #0f172a',
          }}>{totalBadge > 99 ? '99+' : totalBadge}</span>
        )}
      </button>

      {open && (
        <div onClick={() => setOpen(false)} style={{
          position: 'fixed', inset: 0, zIndex: 2147482001, background: 'rgba(0,0,0,0.45)',
          display: 'flex', justifyContent: 'flex-end', fontFamily: 'system-ui, sans-serif',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: 'min(400px, 94vw)', height: '100%', background: '#0f172a', color: '#fff',
            borderLeft: '1px solid rgba(255,255,255,0.1)', boxShadow: '-20px 0 60px rgba(0,0,0,0.5)',
            display: 'flex', flexDirection: 'column', animation: 'alp-slide-in 0.18s ease-out',
          }}>
            <style>{`@keyframes alp-slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

            {/* 헤더 */}
            <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <strong style={{ fontSize: 16 }}>👥 {t('title')}</strong>
              <button onClick={() => setOpen(false)} aria-label={t('close')}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            {/* 탭바 */}
            <div style={{ display: 'flex', padding: '0 8px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <TabBtn active={tab === 'friends'} onClick={() => setTab('friends')} label={t('friends')} badge={reqCount} />
              <TabBtn active={tab === 'messages'} onClick={() => setTab('messages')} label={t('messages')} badge={dmUnread} />
              <TabBtn active={tab === 'notifications'} onClick={() => setTab('notifications')} label={t('notifications')} badge={notifUnread} />
            </div>

            {/* 탭 내용 */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {tab === 'friends' && <FriendsTab onRequestsChange={setReqCount} />}
              {tab === 'messages' && <DmListModal embedded />}
              {tab === 'notifications' && <NotificationsModal embedded onAllRead={() => setNotifUnread(0)} />}
            </div>

            {/* 보조 링크 (페이지 — 보조 기능) */}
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 12 }}>
              <Link href="/presence" onClick={() => setOpen(false)} style={{ color: '#a5b4fc', textDecoration: 'none' }}>🟢 {t('online')}</Link>
              <Link href="/feed" onClick={() => setOpen(false)} style={{ color: '#a5b4fc', textDecoration: 'none' }}>📰 {t('feed')}</Link>
              <Link href="/assets/browse" onClick={() => setOpen(false)} style={{ color: '#a5b4fc', textDecoration: 'none' }}>🔎 {t('findPeople')}</Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TabBtn({ active, onClick, label, badge }: { active: boolean; onClick: () => void; label: string; badge: number }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '11px 6px', background: 'none', border: 'none', cursor: 'pointer',
      color: active ? '#fff' : 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 700,
      borderBottom: active ? '2px solid #8b5cf6' : '2px solid transparent',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    }}>
      {label}
      {badge > 0 && (
        <span style={{ background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 800, padding: '0 5px', borderRadius: 8, minWidth: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{badge > 99 ? '99+' : badge}</span>
      )}
    </button>
  );
}
