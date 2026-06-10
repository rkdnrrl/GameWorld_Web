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
import { useInteractPrompt } from './interactPrompt';

export default function InteractButton({ isMobile }: { isMobile: boolean }) {
  const prompt = useInteractPrompt();
  const dispatch = useCallback((type: 'keydown' | 'keyup') => {
    // KeyboardEvent dispatch — 기존 controller 들이 window keydown capture 로 받음
    const ev = new KeyboardEvent(type, { code: 'KeyE', key: 'e', bubbles: true });
    window.dispatchEvent(ev);
  }, []);

  if (!isMobile || typeof document === 'undefined') return null;

  // seat 은 F 키 — SeatButton 이 담당. E 키는 그 외 prompt 만 활성화.
  const activeKind = prompt === 'seat' ? null : prompt;
  const active = !!activeKind;
  const promptIcon = activeKind === 'door' ? '🚪' : activeKind === 'dialogue' ? '💬' : activeKind === 'vending' ? '🏪' : '';

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
        background: active ? '#10b981' : 'rgba(15, 23, 42, 0.55)',
        color: '#fff',
        border: active ? '2px solid #fff' : '2px solid rgba(255,255,255,0.25)',
        fontSize: 26,
        fontWeight: 800,
        fontFamily: 'system-ui, sans-serif',
        boxShadow: active ? '0 0 28px rgba(16,185,129,0.7)' : '0 4px 12px rgba(0,0,0,0.3)',
        opacity: active ? 1 : 0.55,
        pointerEvents: 'auto',
        userSelect: 'none',
        touchAction: 'none',
        cursor: 'pointer',
        transition: 'background 120ms, box-shadow 120ms, opacity 120ms',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        lineHeight: 1,
      }}
    >
      <span style={{ fontSize: 22 }}>{promptIcon || 'E'}</span>
      {promptIcon && <span style={{ fontSize: 11, marginTop: 2, opacity: 0.95 }}>E</span>}
    </button>,
    document.body,
  );
}
