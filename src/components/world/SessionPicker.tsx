'use client';

/**
 * 월드 세션 선택 모달.
 * - 활성 공개 세션 리스트 표시 (인원수)
 * - "새 세션 만들기" 버튼
 * - 친구한테 공유 가능한 코드/링크 표시
 *
 * 사용: /world?id=X (sessionId 없음) 일 때 노출.
 * 선택 시 부모가 sessionId 받아서 URL 갱신 + 입장.
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { listWorldSessions, generateSessionId, type WorldSession } from '@/lib/api';

interface Props {
  worldId:    string;
  worldName?: string;
  maxPlayersDefault?: number;
  onPick: (sessionId: string, opts?: { private?: boolean }) => void;
  onClose?: () => void;
}

export default function SessionPicker({ worldId, worldName, maxPlayersDefault = 50, onPick, onClose }: Props) {
  const t = useTranslations('Session');
  const [sessions, setSessions] = useState<WorldSession[] | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const list = await listWorldSessions(worldId);
    setSessions(list);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000); // 5초마다 자동 갱신
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId]);

  const [code, setCode] = useState('');

  const createNew = () => {
    onPick(generateSessionId());
  };
  const createPrivate = () => {
    onPick(generateSessionId(), { private: true });
  };
  const joinByCode = () => {
    const c = code.trim().toUpperCase();
    if (c) onPick(c);
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(2,6,23,0.85)', backdropFilter: 'blur(8px)',
        zIndex: 16777274, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)', maxHeight: '88vh',
          background: 'linear-gradient(180deg, rgba(30,41,59,0.97), rgba(15,23,42,0.97))',
          border: '1px solid rgba(255,255,255,0.16)', borderRadius: 14,
          color: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* 헤더 */}
        <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{worldName || t('title')}</div>
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>{t('subtitle')}</div>
        </div>

        {/* 새 세션 만들기 (공개 / 비공개) */}
        <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={createNew}
              style={{
                flex: 1, padding: '11px 14px', borderRadius: 10,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                border: 'none', color: '#fff',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >
              ✨ {t('createNew')}
            </button>
            <button
              type="button"
              onClick={createPrivate}
              title={t('privateHint')}
              style={{
                flex: 1, padding: '11px 14px', borderRadius: 10,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.16)', color: '#fff',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >
              🔒 {t('createPrivate')}
            </button>
          </div>

          {/* 코드로 참가 (초대받은 사람) */}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={code}
              onChange={e => setCode(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') joinByCode(); }}
              placeholder={t('codePlaceholder')}
              maxLength={6}
              style={{
                flex: 1, padding: '9px 12px', borderRadius: 8,
                background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.14)',
                color: '#fff', fontSize: 14, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase',
              }}
            />
            <button
              type="button"
              onClick={joinByCode}
              disabled={!code.trim()}
              style={{
                padding: '9px 16px', borderRadius: 8,
                background: code.trim() ? 'rgba(99,102,241,0.85)' : 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.14)', color: '#fff',
                fontSize: 13, fontWeight: 700, cursor: code.trim() ? 'pointer' : 'not-allowed',
                opacity: code.trim() ? 1 : 0.5, whiteSpace: 'nowrap',
              }}
            >
              {t('joinByCode')}
            </button>
          </div>
        </div>

        {/* 세션 리스트 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 16px' }}>
          <div style={{ fontSize: 11, opacity: 0.55, padding: '6px 6px 8px', fontWeight: 700, letterSpacing: 0.5 }}>
            {t('activeSessions')} ({sessions?.length ?? 0})
          </div>

          {loading && !sessions && (
            <div style={{ fontSize: 12, opacity: 0.5, textAlign: 'center', padding: 24 }}>
              {t('loading')}
            </div>
          )}

          {sessions && sessions.length === 0 && (
            <div style={{ fontSize: 12, opacity: 0.45, textAlign: 'center', padding: 24, lineHeight: 1.5 }}>
              {t('emptyHint')}
            </div>
          )}

          {sessions?.map(s => {
            const full = s.count >= s.maxPlayers;
            return (
              <button
                key={s.id}
                type="button"
                disabled={full}
                onClick={() => onPick(s.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', marginBottom: 6,
                  background: full ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
                  color: '#fff', cursor: full ? 'not-allowed' : 'pointer',
                  opacity: full ? 0.45 : 1, textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 16 }}>🌐</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{s.name}</span>
                  <span style={{ display: 'block', fontSize: 11, opacity: 0.55, marginTop: 2 }}>
                    {s.count > 0 ? t('countActive', { count: s.count, max: s.maxPlayers }) : t('countEmpty', { max: s.maxPlayers })}
                  </span>
                </span>
                <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 700 }}>
                  {full ? t('full') : t('join')}
                </span>
              </button>
            );
          })}
        </div>

        {onClose && (
          <div style={{ padding: '10px 18px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', textAlign: 'right' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '7px 14px', borderRadius: 8,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              {t('cancel')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
