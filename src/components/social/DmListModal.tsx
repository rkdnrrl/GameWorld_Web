'use client';
/**
 * DM 대화 목록 모달 — SocialPanel 의 "메시지" 진입점. 페이지 전환 없이 모달 안에서:
 *  - 대화 목록 표시 (api.listConversations)
 *  - 행 클릭 시 같은 모달 위에 DmChatModal 띄움 (RemotePlayerInfoPanel 과 동일 패턴)
 *  - "전체 메시지 보기" 링크로 /messages 페이지 진입 가능 (백그라운드용)
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api, session, ApiError } from '@/lib/api';
import { DM_PUSH_EVENT } from '@/lib/notifications/useNotificationStream';
import { DmChatModal } from '@/components/world/DmChatModal';

type Conv = {
  id: string;
  other: { id: string; username: string; profileImageUrl: string | null; iconEmoji: string | null; themeColor: string | null } | null;
  lastMessageAt: string | null;
  lastMessageText: string | null;
  lastSenderId: string | null;
  unread: number;
};

export default function DmListModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations('Social');
  const [convs, setConvs] = useState<Conv[] | null>(null);
  const [error, setError] = useState('');
  const [active, setActive] = useState<Conv | null>(null);

  const load = useCallback(() => {
    const tk = session.getToken();
    if (!tk) { setError(t('needLogin')); return; }
    api.listConversations(tk)
      .then(d => setConvs(d.conversations as Conv[]))
      .catch(e => setError(e instanceof ApiError ? e.message : t('loadFailed')));
  }, [t]);

  useEffect(() => { load(); }, [load]);

  // 실시간 DM 수신 시 목록 갱신 (열려있을 때)
  useEffect(() => {
    const onDm = () => load();
    window.addEventListener(DM_PUSH_EVENT, onDm);
    return () => window.removeEventListener(DM_PUSH_EVENT, onDm);
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (active) setActive(null); else onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onClose]);

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 2147482010,
        background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif', padding: 16,
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          width: 'min(420px, 100%)', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          background: '#0f172a', color: '#fff',
          borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <strong style={{ fontSize: 15 }}>💬 {t('messages')}</strong>
            <button onClick={onClose} aria-label={t('close')}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
            {error && <div style={{ padding: 16, color: '#fca5a5', fontSize: 13 }}>{error}</div>}
            {!error && convs === null && <div style={{ padding: 16, opacity: 0.5, fontSize: 13 }}>{t('loading')}</div>}
            {convs && convs.length === 0 && (
              <div style={{ padding: 30, textAlign: 'center', opacity: 0.5, fontSize: 13, lineHeight: 1.6 }}>
                {t('dmEmpty')}
              </div>
            )}
            {convs && convs.map(c => (
              <button key={c.id} onClick={() => setActive(c)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 10, marginBottom: 6, cursor: 'pointer', textAlign: 'left', color: '#fff',
              }}>
                <Avatar other={c.other} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.other?.username ?? '?'}</span>
                    {c.unread > 0 && (
                      <span style={{ background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 800, padding: '0 6px', borderRadius: 9, minWidth: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{c.unread > 99 ? '99+' : c.unread}</span>
                    )}
                    {c.lastMessageAt && (
                      <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.45 }}>{relTime(c.lastMessageAt)}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                    {c.lastMessageText || t('dmNoMessages')}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {convs && convs.length > 0 && (
            <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' }}>
              <Link href="/messages" onClick={onClose}
                style={{ fontSize: 12, color: '#a5b4fc', textDecoration: 'none' }}>
                {t('viewAllMessages')} →
              </Link>
            </div>
          )}
        </div>
      </div>

      {active && active.other && (
        <DmChatModal
          conversationId={active.id}
          other={{
            username: active.other.username,
            profileImageUrl: active.other.profileImageUrl,
            iconEmoji: active.other.iconEmoji,
            themeColor: active.other.themeColor,
          }}
          onClose={() => setActive(null)}
        />
      )}
    </>
  );
}

function Avatar({ other }: { other: Conv['other'] }) {
  const bg = other?.profileImageUrl
    ? `url(${other.profileImageUrl}) center/cover`
    : other?.themeColor
      ? `linear-gradient(135deg, ${other.themeColor}, ${other.themeColor}aa)`
      : 'linear-gradient(135deg,#6366f1,#8b5cf6)';
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%', background: bg, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#fff',
    }}>
      {!other?.profileImageUrl && (other?.iconEmoji || other?.username.slice(0, 1).toUpperCase() || '?')}
    </div>
  );
}

function relTime(iso: string): string {
  const d = new Date(iso).getTime();
  const s = (Date.now() - d) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
