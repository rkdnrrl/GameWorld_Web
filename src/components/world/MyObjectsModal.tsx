'use client';
/**
 * 내 spawn 오브젝트 관리 모달.
 *
 * - mySpawned Map<rootId, { name, childIds }> 표시
 * - 각 항목 삭제 버튼 → onDestroy(rootId) (DO 가 자식 cascade 삭제 처리)
 * - 카운트 "X/5" 표시. 5개면 더 spawn 안 됨.
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export function MyObjectsModal({
  open, onClose, items, onDestroy, limit, title, emptyHint, countLabel, deleteLabel, closeLabel,
}: {
  open: boolean;
  onClose: () => void;
  items: Array<{ id: string; name: string; childCount: number }>;
  onDestroy: (id: string) => void;
  limit: number;
  title: string;
  emptyHint: string;
  countLabel: string;       // "{count}/{limit} 사용 중"
  deleteLabel: string;
  closeLabel: string;
}) {
  // ESC 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const used = items.length;
  const full = used >= limit;

  return createPortal((
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2147483600 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: 520, maxWidth: '92vw', maxHeight: '80vh', background: '#1e1b4b', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 12, color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
          <button onClick={onClose} aria-label={closeLabel}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        {/* 사용량 바 */}
        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
            <span style={{ color: 'rgba(255,255,255,0.7)' }}>{countLabel}</span>
            <span style={{ fontWeight: 700, color: full ? '#f87171' : '#34d399' }}>{used} / {limit}</span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, (used / limit) * 100)}%`,
              background: full
                ? 'linear-gradient(90deg, #ef4444, #f87171)'
                : 'linear-gradient(90deg, #6366f1, #a855f7)',
              transition: 'width 0.3s',
            }} />
          </div>
        </div>

        {/* 목록 */}
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 100 }}>
          {items.length === 0 && (
            <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 30, fontSize: 13 }}>
              {emptyHint}
            </div>
          )}
          {items.map((it) => (
            <div key={it.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
            }}>
              <span style={{ fontSize: 18 }}>🧩</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</div>
                {it.childCount > 0 && (
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>+{it.childCount}</div>
                )}
              </div>
              <button onClick={() => onDestroy(it.id)}
                style={{
                  padding: '6px 12px',
                  background: 'rgba(239,68,68,0.18)',
                  border: '1px solid rgba(239,68,68,0.4)',
                  borderRadius: 6,
                  color: '#fca5a5',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}>
                🗑 {deleteLabel}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  ), document.body);
}
