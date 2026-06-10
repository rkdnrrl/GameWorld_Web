'use client';
/**
 * 모바일 인터랙트 버튼 — 화면 우하단에 큰 둥근 E 버튼.
 *  - 모바일은 키보드 없어서 dialogue / vendingMachine / door / ladder 등 E 키 인터랙트 불가능.
 *  - 이 버튼이 KeyE keydown/keyup 을 window 에 dispatch → 기존 controller 들이 capture phase 에서 받음.
 *  - 모바일 (`isMobile=true`) 일 때만 렌더. 데스크탑은 영향 0.
 *  - 위치: 우하단 (모바일 컨트롤 점프/스프린트 버튼 위쪽). createPortal 로 document.body.
 *
 * V1 한계: F 키 (seat) 같은 다른 인터랙트 키는 별도. 추후 멀티 키 버튼 그룹화 V2.
 */
import { useCallback } from 'react';
import { createPortal } from 'react-dom';

export default function InteractButton({ isMobile }: { isMobile: boolean }) {
  const dispatch = useCallback((type: 'keydown' | 'keyup') => {
    // KeyboardEvent dispatch — 기존 controller 들이 window keydown capture 로 받음
    const ev = new KeyboardEvent(type, { code: 'KeyE', key: 'e', bubbles: true });
    window.dispatchEvent(ev);
  }, []);

  if (!isMobile || typeof document === 'undefined') return null;

  return createPortal(
    <button
      aria-label="interact"
      onPointerDown={(e) => {
        e.preventDefault();
        dispatch('keydown');
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        dispatch('keyup');
      }}
      onPointerCancel={() => dispatch('keyup')}
      style={{
        position: 'fixed',
        right: 24,
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 160px)',
        zIndex: 16777275,
        width: 72,
        height: 72,
        borderRadius: '50%',
        background: 'rgba(15, 23, 42, 0.78)',
        color: '#fff',
        border: '2px solid rgba(255,255,255,0.45)',
        fontSize: 26,
        fontWeight: 800,
        fontFamily: 'system-ui, sans-serif',
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        pointerEvents: 'auto',
        userSelect: 'none',
        touchAction: 'none',
        cursor: 'pointer',
      }}
    >E</button>,
    document.body,
  );
}
