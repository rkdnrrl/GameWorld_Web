'use client';
/**
 * 사다리 / 오르기 — ladder 컴포넌트 박스에 들어오면 자동으로 climbing 모드.
 *  - 중력 OFF
 *  - 매 frame: W/↑ → +climbSpeed, S/↓ → -climbSpeed, 둘 다 아니면 vy=0
 *  - X/Z 속도는 사용자 입력 그대로 유지 (옆으로 빠지면 박스 밖 → 자동 해제)
 *  - Space 점프 → climbing 해제 + 위로 jumpExitV 임펄스 (사다리 위로 올라타 빠져나가기)
 *
 * 멀티: 본인 위치 자동 broadcast → 다른 플레이어도 사다리 위에서 위/아래로 움직이는 게 보임.
 */
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { LadderSpot } from './components';
import type { PlayerControl } from './SeatController';

export interface PlayerControlWithVel extends PlayerControl {
  getVelocity?: () => { x: number; y: number; z: number };
}

export default function LadderController({
  ladders,
  localPoseRef,
  playerCtlRef,
}: {
  ladders: LadderSpot[];
  localPoseRef: React.MutableRefObject<{ x: number; y: number; z: number; rotY: number }> | null | undefined;
  playerCtlRef: React.MutableRefObject<PlayerControlWithVel | null> | null | undefined;
}) {
  const climbingRef = useRef<LadderSpot | null>(null);
  const keys = useRef({ up: false, down: false, jump: false });

  // 키 입력 — 자체 keydown/keyup. 채팅 입력 박스 안에선 무시.
  useEffect(() => {
    const isInput = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && /^(INPUT|TEXTAREA)$/.test(el.tagName);
    };
    const set = (e: KeyboardEvent, on: boolean) => {
      if (isInput(e.target)) return;
      if (e.code === 'KeyW' || e.code === 'ArrowUp')   keys.current.up   = on;
      else if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.current.down = on;
      else if (e.code === 'Space') keys.current.jump = on;
    };
    const d = (e: KeyboardEvent) => set(e, true);
    const u = (e: KeyboardEvent) => set(e, false);
    window.addEventListener('keydown', d);
    window.addEventListener('keyup', u);
    return () => {
      window.removeEventListener('keydown', d);
      window.removeEventListener('keyup', u);
    };
  }, []);

  function inside(l: LadderSpot, x: number, y: number, z: number) {
    return Math.abs(x - l.cx) <= l.hx && Math.abs(y - l.cy) <= l.hy && Math.abs(z - l.cz) <= l.hz;
  }

  function findEnclosing(x: number, y: number, z: number): LadderSpot | null {
    for (const l of ladders) if (inside(l, x, y, z)) return l;
    return null;
  }

  useFrame(() => {
    const pose = localPoseRef?.current;
    const ctl = playerCtlRef?.current;
    if (!pose || !ctl) return;

    const cur = climbingRef.current;
    if (cur) {
      const still = inside(cur, pose.x, pose.y, pose.z);
      // Space 누르면 점프 이탈 — 위로 임펄스 + 중력 복원
      if (keys.current.jump) {
        const v = ctl.getVelocity?.() ?? { x: 0, y: 0, z: 0 };
        try { ctl.setGravityEnabled?.(true); } catch { /* noop */ }
        try { ctl.setVelocity?.(v.x, cur.jumpExitV, v.z); } catch { /* noop */ }
        climbingRef.current = null;
        return;
      }
      if (!still) {
        // 박스 밖으로 빠짐 — climbing 해제
        try { ctl.setGravityEnabled?.(true); } catch { /* noop */ }
        climbingRef.current = null;
        return;
      }
      // 진행: vy 만 강제, x/z 는 사용자 입력 그대로
      const v = ctl.getVelocity?.() ?? { x: 0, y: 0, z: 0 };
      const vy = keys.current.up ? cur.climbSpeed : keys.current.down ? -cur.climbSpeed : 0;
      try { ctl.setVelocity?.(v.x, vy, v.z); } catch { /* noop */ }
    } else {
      // 박스 안으로 들어왔는지 체크 — 자동 climbing 진입
      const enter = findEnclosing(pose.x, pose.y, pose.z);
      if (enter) {
        climbingRef.current = enter;
        try { ctl.setGravityEnabled?.(false); } catch { /* noop */ }
        const v = ctl.getVelocity?.() ?? { x: 0, y: 0, z: 0 };
        try { ctl.setVelocity?.(v.x, 0, v.z); } catch { /* noop */ }
      }
    }
  });

  // 안전 복귀
  useEffect(() => () => {
    if (climbingRef.current) {
      try { playerCtlRef?.current?.setGravityEnabled?.(true); } catch { /* noop */ }
      climbingRef.current = null;
    }
  }, [playerCtlRef]);

  return null;
}
