'use client';
/**
 * 모바일 사다리 버튼 그룹 — 사다리 안에 있거나 가까이 있을 때 ↑/↓ + 점프 이탈 버튼.
 *  - prompt === 'ladder' 일 때만 표시. 데스크탑은 영향 0.
 *  - ↑: KeyW press/release dispatch (LadderController 가 W 키로 climbing up)
 *  - ↓: KeyS press/release (climbing down)
 *  - ↗ (점프): Space press → LadderController 가 점프 이탈 + 위 임펄스
 *  - 위치: 우하단 InteractButton 자리에 더 큰 그룹 (E 는 ladder 일 땐 비활성)
 */
import { useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useInteractPrompt } from './interactPrompt';

interface KeySpec { code: string; key: string }

function makeDispatch(spec: KeySpec) {
  return {
    down: () => window.dispatchEvent(new KeyboardEvent('keydown', { code: spec.code, key: spec.key, bubbles: true })),
    up:   () => window.dispatchEvent(new KeyboardEvent('keyup',   { code: spec.code, key: spec.key, bubbles: true })),
  };
}

const UP_KEY    = makeDispatch({ code: 'KeyW',  key: 'w' });
const DOWN_KEY  = makeDispatch({ code: 'KeyS',  key: 's' });
const JUMP_KEY  = makeDispatch({ code: 'Space', key: ' ' });

function btnStyle(color: string): React.CSSProperties {
  return {
    width: 64, height: 64, borderRadius: '50%',
    background: color, color: '#fff',
    border: '2px solid #fff', fontSize: 22, fontWeight: 800,
    fontFamily: 'system-ui, sans-serif',
    boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
    pointerEvents: 'auto', userSelect: 'none', touchAction: 'none',
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    lineHeight: 1,
  };
}

export default function LadderButton({ isMobile }: { isMobile: boolean }) {
  const prompt = useInteractPrompt();
  const hold = useCallback((dispatch: { down: () => void; up: () => void }) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); dispatch.down(); },
    onPointerUp:   (e: React.PointerEvent) => { e.preventDefault(); dispatch.up();   },
    onPointerCancel: () => dispatch.up(),
  }), []);

  if (!isMobile || prompt !== 'ladder' || typeof document === 'undefined') return null;

  return createPortal(
    <div style={{
      position: 'fixed',
      right: 24,
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 156px)',
      zIndex: 16777275,
      display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center',
    }}>
      <button aria-label="climb-up"   style={btnStyle('#10b981')} {...hold(UP_KEY)}>▲</button>
      <button aria-label="climb-down" style={btnStyle('#0ea5e9')} {...hold(DOWN_KEY)}>▼</button>
      <button aria-label="ladder-jump" style={{ ...btnStyle('#f59e0b'), fontSize: 16 }} {...hold(JUMP_KEY)}>↗</button>
    </div>,
    document.body,
  );
}
