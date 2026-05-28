'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';

interface StudioTopBarProps {
  name: string;
  onNameChange: (name: string) => void;
  savedId: string | null;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  simulating: boolean;
  onStartSim: () => void;
  onStopSim: () => void;
}

export default function StudioTopBar({
  name, onNameChange,
  savedId, dirty, saving, onSave,
  canUndo, canRedo, onUndo, onRedo,
  simulating, onStartSim, onStopSim,
}: StudioTopBarProps) {
  const t = useTranslations('Studio');
  const router = useRouter();

  const confirmAndExit = () => {
    if (dirty && !confirm(`${t('tbDirty')}\n\n${t('tbExitTooltip')}`)) return;
    router.push('/world');
  };

  // 저장 상태 배지
  const statusBadge = saving
    ? { text: t('tbSaving'), color: '#fbbf24', bg: 'rgba(251,191,36,0.15)', border: 'rgba(251,191,36,0.4)' }
    : !savedId
    ? { text: t('tbNew'), color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.3)' }
    : dirty
    ? { text: t('tbDirty'), color: '#f87171', bg: 'rgba(248,113,113,0.15)', border: 'rgba(248,113,113,0.4)' }
    : { text: t('tbSaved'), color: '#34d399', bg: 'rgba(52,211,153,0.15)', border: 'rgba(52,211,153,0.4)' };

  const iconBtn = (active: boolean, disabled = false): React.CSSProperties => ({
    width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: active ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.05)',
    border: `1px solid ${active ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)'}`,
    borderRadius: 8, color: disabled ? 'rgba(255,255,255,0.25)' : '#fff',
    fontSize: 14, cursor: disabled ? 'default' : 'pointer',
    flexShrink: 0,
  });

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      height: 52, padding: '0 12px',
      background: 'linear-gradient(180deg, rgba(15,23,42,0.98), rgba(10,15,30,0.98))',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      flexShrink: 0, zIndex: 100,
    }}>
      {/* 좌측 — 나가기 + 월드 이름 + 상태 */}
      <button onClick={confirmAndExit} title={t('tbExitTooltip')}
        style={{
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700,
          padding: '7px 12px', cursor: 'pointer', flexShrink: 0,
        }}>
        {t('tbExit')}
      </button>

      <input
        value={name}
        onChange={e => onNameChange(e.target.value)}
        placeholder={t('tbNamePlaceholder')}
        maxLength={100}
        style={{
          minWidth: 0, flex: '0 1 280px',
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600,
          padding: '7px 11px', outline: 'none',
        }}
      />

      <div style={{
        background: statusBadge.bg, border: `1px solid ${statusBadge.border}`,
        borderRadius: 999, color: statusBadge.color,
        fontSize: 11, fontWeight: 700, padding: '4px 10px', flexShrink: 0,
        whiteSpace: 'nowrap',
      }}>
        {statusBadge.text}
      </div>

      {/* 중앙 spacer */}
      <div style={{ flex: 1 }} />

      {/* 중앙(논리적) — 시뮬레이션 */}
      <button
        onClick={simulating ? onStopSim : onStartSim}
        style={{
          background: simulating ? 'rgba(239,68,68,0.85)' : 'rgba(34,197,94,0.85)',
          border: `1px solid ${simulating ? 'rgba(248,113,113,0.6)' : 'rgba(74,222,128,0.6)'}`,
          borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700,
          padding: '8px 16px', cursor: 'pointer', flexShrink: 0,
          letterSpacing: 0.3,
        }}>
        {simulating ? t('tbStop') : t('tbPlay')}
      </button>

      <div style={{ flex: 1 }} />

      {/* 우측 — Undo / Redo / 저장 / 플레이테스트 */}
      <button onClick={onUndo} disabled={!canUndo} title={t('tbUndoTooltip')}
        style={iconBtn(false, !canUndo)}>↶</button>
      <button onClick={onRedo} disabled={!canRedo} title={t('tbRedoTooltip')}
        style={iconBtn(false, !canRedo)}>↷</button>

      <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />

      <button onClick={onSave} disabled={saving}
        style={{
          background: 'linear-gradient(135deg, #10b981, #06b6d4)',
          border: 'none', borderRadius: 8, color: '#fff',
          fontSize: 13, fontWeight: 800, padding: '8px 16px',
          cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
          flexShrink: 0, boxShadow: '0 2px 8px rgba(16,185,129,0.3)',
        }}>
        {saving ? t('tbSaving') : t('tbSave')}
      </button>

      {savedId && (
        <a href={`/world?id=${savedId}`} target="_blank" rel="noreferrer"
          title={t('tbPlayTestTooltip')}
          style={{
            background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.5)',
            borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700,
            padding: '7px 14px', textDecoration: 'none', flexShrink: 0,
          }}>
          {t('tbPlayTest')}
        </a>
      )}
    </div>
  );
}
