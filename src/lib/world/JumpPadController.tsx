'use client';
/**
 * 점프대 (jumpPad) — 트리거 박스 진입 시 setVelocity 로 impulse.
 *  - mode 'up': vy = power. preserveHorizontal=true 면 vx/vz 유지, false 면 0.
 *  - mode 'forward': rotY 기준 정면 방향(+Z) 으로 power, vy 는 0 (수평 부스터).
 *  - mode 'custom': vx/vy/vz = customX/Y/Z 그대로.
 *  - 한 점프대 cooldown 동안 재발동 차단 (Set<padId, time>).
 *  - 박스 밖으로 나가면 cooldown 즉시 해제 — 재진입 시 발동.
 *
 * 멀티: 본인 위치만 영향. 다른 플레이어는 자체 본인 클라가 점프대 통과 시 발동.
 */
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { JumpPadSpot } from './components';
import type { PlayerControlWithVel } from './LadderController';

export default function JumpPadController({
  pads,
  localPoseRef,
  playerCtlRef,
}: {
  pads: JumpPadSpot[];
  localPoseRef: React.MutableRefObject<{ x: number; y: number; z: number; rotY: number }> | null | undefined;
  playerCtlRef: React.MutableRefObject<PlayerControlWithVel | null> | null | undefined;
}) {
  // padId → (cooldownUntilMs | -1 if currently inside still cooling). -1 = inside; > now = waiting.
  const lastFired = useRef<Map<string, number>>(new Map());
  // padId → 현재 박스 안인지 (박스에서 나가야 다시 fire 가능)
  const inside = useRef<Map<string, boolean>>(new Map());
  const elapsed = useRef(0);

  // pads 변동 시 사라진 id 정리
  useEffect(() => {
    const ids = new Set(pads.map(p => p.id));
    for (const k of [...lastFired.current.keys()]) if (!ids.has(k)) lastFired.current.delete(k);
    for (const k of [...inside.current.keys()])     if (!ids.has(k)) inside.current.delete(k);
  }, [pads]);

  function isInside(p: JumpPadSpot, x: number, y: number, z: number) {
    return Math.abs(x - p.cx) <= p.hx && Math.abs(y - p.cy) <= p.hy && Math.abs(z - p.cz) <= p.hz;
  }

  useFrame((_state, dt) => {
    elapsed.current += dt;
    const now = elapsed.current;
    const pose = localPoseRef?.current;
    const ctl = playerCtlRef?.current;
    if (!pose || !ctl) return;

    for (const pad of pads) {
      const within = isInside(pad, pose.x, pose.y, pose.z);
      const wasIn = !!inside.current.get(pad.id);
      inside.current.set(pad.id, within);
      if (!within) continue;

      // 박스 안: 직전 fire 후 cooldown 안 끝났으면 skip
      const cd = lastFired.current.get(pad.id);
      if (cd != null && now < cd) continue;
      // 박스 처음 진입이거나 (wasIn=false), 머무는 동안 cooldown 지났으면 다시 fire 가능

      // velocity 계산
      const v = ctl.getVelocity?.() ?? { x: 0, y: 0, z: 0 };
      let nx = v.x, ny = v.y, nz = v.z;
      if (pad.mode === 'up') {
        ny = pad.power;
        if (!pad.preserveHorizontal) { nx = 0; nz = 0; }
      } else if (pad.mode === 'forward') {
        // rotY 기준 +Z 정면 (three: cos*Z + sin*X, sin/cos 부호 주의)
        const s = Math.sin(pad.rotY), c = Math.cos(pad.rotY);
        nx = s * pad.power;
        nz = c * pad.power;
        ny = 0;
      } else {
        nx = pad.customX;
        ny = pad.customY;
        nz = pad.customZ;
      }
      try { ctl.setVelocity?.(nx, ny, nz); } catch { /* noop */ }

      lastFired.current.set(pad.id, now + pad.cooldown);
      // wasIn 이 false 였으면 fresh entry — 위 fire 가 그것을 처리. true 였으면 cooldown 지나 재발동.
      void wasIn;
    }
  });

  return null;
}
