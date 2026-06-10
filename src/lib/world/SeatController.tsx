'use client';
/**
 * 의자 / 앉기 시스템 — seat 컴포넌트가 붙은 오브젝트 목록을 받아:
 *  - 매 frame 가장 가까운 seat 거리 체크 → 범위 안 + 안 앉음이면 "F: 앉기" HUD
 *  - F 키 토글: 앉기 / 일어나기
 *  - 앉아 있는 동안 매 frame playerCtl.teleport + setVelocity(0) + setGravityEnabled(false)
 *    → 사용자 입력은 효과 없이 흡수됨 (Player 코드 수정 불필요)
 *  - 일어날 때 seat 의 정면 방향으로 exitForward 만큼 빠지고 중력 복원
 *
 * Canvas 외부에 React state 로 prompt 노출 → HUD 컴포넌트가 읽어 표시.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFrame } from '@react-three/fiber';
import type { SeatSpot } from './components';
import { setInteractPrompt } from './interactPrompt';

export interface PlayerControl {
  teleport?: (x: number, y: number, z: number) => void;
  setVelocity?: (x: number, y: number, z: number) => void;
  setGravityEnabled?: (on: boolean) => void;
}

export interface SeatStatus {
  prompt: boolean;     // 가까운 seat 가 있고 안 앉음 → "F: 앉기" 표시
  sitting: boolean;    // 현재 앉아 있음 → "F: 일어나기" 표시
}

export default function SeatController({
  seats,
  localPoseRef,
  playerCtlRef,
  onStatusChange,
}: {
  seats: SeatSpot[];
  localPoseRef: React.MutableRefObject<{ x: number; y: number; z: number; rotY: number }> | null | undefined;
  playerCtlRef: React.MutableRefObject<PlayerControl | null> | null | undefined;
  onStatusChange?: (s: SeatStatus) => void;
}) {
  const sittingOnRef = useRef<SeatSpot | null>(null);
  const [hudText, setHudText] = useState<string>(''); // '' = HUD 숨김, 그 외 = HUD 텍스트
  const lastStatus = useRef<SeatStatus>({ prompt: false, sitting: false });
  const fHeldRef = useRef(false);

  // F 키 토글 — keydown 한 번에 1회 발화 (auto-repeat 무시)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyF') return;
      // 입력 박스 안이면 무시
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
      if (e.repeat) return;
      if (fHeldRef.current) return;
      fHeldRef.current = true;
      handleToggle();
    };
    const onUp = (e: KeyboardEvent) => { if (e.code === 'KeyF') fHeldRef.current = false; };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
    };
    // handleToggle 은 ref 만 쓰니 deps 없어도 됨
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pushStatus(s: SeatStatus) {
    if (s.prompt === lastStatus.current.prompt && s.sitting === lastStatus.current.sitting) return;
    lastStatus.current = s;
    onStatusChange?.(s);
    setHudText(s.sitting ? '🪑 F: 일어나기' : s.prompt ? '🪑 F: 앉기' : '');
    setInteractPrompt(s.prompt || s.sitting ? 'seat' : null);
  }

  function handleToggle() {
    const ctl = playerCtlRef?.current;
    if (!ctl) return;
    if (sittingOnRef.current) {
      // 일어남 — seat 의 정면 방향으로 빠지고 중력 복원
      const s = sittingOnRef.current;
      const ex = s.sx + Math.sin(s.rotY) * s.exitForward;
      const ez = s.sz + Math.cos(s.rotY) * s.exitForward;
      try { ctl.teleport?.(ex, s.sy + 0.6, ez); } catch { /* noop */ }
      try { ctl.setGravityEnabled?.(true); } catch { /* noop */ }
      sittingOnRef.current = null;
      pushStatus({ prompt: false, sitting: false });
    } else {
      // 가장 가까운 seat 가 범위 안이면 앉음
      const target = nearestInRange();
      if (!target) return;
      sittingOnRef.current = target;
      try { ctl.setGravityEnabled?.(false); } catch { /* noop */ }
      try { ctl.setVelocity?.(0, 0, 0); } catch { /* noop */ }
      try { ctl.teleport?.(target.sx, target.sy, target.sz); } catch { /* noop */ }
      pushStatus({ prompt: false, sitting: true });
    }
  }

  function nearestInRange(): SeatSpot | null {
    const pose = localPoseRef?.current;
    if (!pose) return null;
    let best: SeatSpot | null = null;
    let bestD = Infinity;
    for (const s of seats) {
      const dx = s.sx - pose.x, dy = s.sy - pose.y, dz = s.sz - pose.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d <= s.range && d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  useFrame(() => {
    const ctl = playerCtlRef?.current;
    if (!ctl) return;
    const sit = sittingOnRef.current;
    if (sit) {
      // 매 frame 강제 — 사용자 입력 무력화 + 의자에 묶기
      try { ctl.teleport?.(sit.sx, sit.sy, sit.sz); } catch { /* noop */ }
      try { ctl.setVelocity?.(0, 0, 0); } catch { /* noop */ }
      pushStatus({ prompt: false, sitting: true });
    } else {
      const near = nearestInRange();
      pushStatus({ prompt: !!near, sitting: false });
    }
  });

  // 컴포넌트 unmount / seats 사라짐 등에서 안전 복귀
  useEffect(() => () => {
    if (sittingOnRef.current) {
      try { playerCtlRef?.current?.setGravityEnabled?.(true); } catch { /* noop */ }
      sittingOnRef.current = null;
    }
    setInteractPrompt(null);
  }, [playerCtlRef]);

  // HUD prompt — 화면 하단 중앙. createPortal 로 document.body 에 띄워 R3F 외부 위치.
  if (!hudText || typeof document === 'undefined') return null;
  return createPortal(
    <div style={{
      position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
      zIndex: 2147480000, pointerEvents: 'none',
      padding: '8px 16px', borderRadius: 999,
      background: 'rgba(0,0,0,0.65)', color: '#fff',
      fontSize: 14, fontWeight: 700, fontFamily: 'system-ui, sans-serif',
      backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.18)',
    }}>{hudText}</div>,
    document.body,
  );
}
