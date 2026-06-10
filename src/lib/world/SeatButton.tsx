'use client';
/**
 * 모바일 F 키 버튼 — seat 가까이 있거나 앉아 있을 때만 표시.
 *  - InteractButton (E 키) 옆에 살짝 위로. 같은 createPortal 우하단 그룹.
 *  - prompt === 'seat' 일 때만 visible (가까이 또는 앉음). 데스크탑 영향 0.
 *  - pointerDown → KeyboardEvent('keydown', KeyF) dispatch → SeatController 가 받음.
 */
import { useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useInteractPrompt } from './interactPrompt';

export default function SeatButton({ isMobile }: { isMobile: boolean }) {
  const prompt = useInteractPrompt();
  const dispatch = useCallback((type: 'keydown' | 'keyup') => {
    const ev = new KeyboardEvent(type, { code: 'KeyF', key: 'f', bubbles: true });
    window.dispatchEvent(ev);
  }, []);

  if (!isMobile || prompt !== 'seat' || typeof document === 'undefined') return null;

  return createPortal(
    <button
      aria-label="seat"
      onPointerDown={(e) => { e.preventDefault(); dispatch('keydown'); }}
      onPointerUp={(e) => { e.preventDefault(); dispatch('keyup'); }}
      onPointerCancel={() => dispatch('keyup')}
      style={{
        position: 'fixed',
        right: 24,
        // InteractButton 위쪽으로 띄움 (E 버튼은 bottom: 160px, F 버튼은 + 88px)
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 248px)',
        zIndex: 16777275,
        width: 64,
        height: 64,
        borderRadius: '50%',
        background: '#0ea5e9',
        color: '#fff',
        border: '2px solid #fff',
        fontSize: 22,
        fontWeight: 800,
        fontFamily: 'system-ui, sans-serif',
        boxShadow: '0 0 24px rgba(14,165,233,0.6)',
        pointerEvents: 'auto',
        userSelect: 'none',
        touchAction: 'none',
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        lineHeight: 1,
      }}
    >
      <span style={{ fontSize: 20 }}>🪑</span>
      <span style={{ fontSize: 10, marginTop: 2 }}>F</span>
    </button>,
    document.body,
  );
}
