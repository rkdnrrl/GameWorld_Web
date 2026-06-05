'use client';
/**
 * 배치 모드 오버레이 — 월드 안에서 spawn 시점을 결정.
 *
 * - 화면 상단 힌트 텍스트 + ESC 취소 안내
 * - 화면 중앙 펄스 링 (크로스헤어 근처에 spawn 위치 시각화)
 * - 캔버스 어디든 클릭 → onConfirm. ESC → onCancel.
 *
 * UI 버튼 (cancel 등) 없음 — 어떤 click 이든 confirm 으로 잡힘.
 * 취소는 ESC 만. 단순한 의도 = 단순한 입력.
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export function PlacementOverlay({
  name, onConfirm, onCancel, hintText, cancelText,
}: {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
  hintText: string;
  cancelText: string;
}) {
  // 클릭 = 확정. capture phase 로 잡아서 WorldCanvas onClick (오브젝트 클릭 등) 보다 먼저 처리.
  // stopImmediatePropagation 으로 같은 window 의 다른 listener 도 차단.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0) return;  // 좌클릭만
      // UI 패널 (헤더·바닥 채팅 등) 클릭은 무시.
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.closest('button, input, textarea, a, select, [data-no-placement]'))) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onConfirm();
    };
    window.addEventListener('click', onClick, { capture: true });
    return () => window.removeEventListener('click', onClick, { capture: true });
  }, [onConfirm]);

  // ESC = 취소. stopImmediatePropagation 으로 world page 의 ESC (설정 토글) 차단.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [onCancel]);

  if (typeof document === 'undefined') return null;

  return createPortal((
    <>
      {/* 상단 힌트 텍스트 — 3D PlacementGhost 가 위치/방향 시각화하므로 화면 중앙 펄스 링은 redundant. */}
      <div data-no-placement style={{
        position: 'fixed', left: '50%', top: 24,
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        zIndex: 2147483500,
        padding: '10px 18px',
        background: 'rgba(15,23,42,0.92)',
        border: '1px solid rgba(168,85,247,0.5)',
        borderRadius: 10,
        color: '#fff',
        fontSize: 14,
        fontWeight: 600,
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(8px)',
        textAlign: 'center',
      }}>
        🎯 <span style={{ color: '#fbbf24' }}>{name}</span> {hintText}
        <div style={{ marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 400 }}>{cancelText}</div>
      </div>
    </>
  ), document.body);
}
