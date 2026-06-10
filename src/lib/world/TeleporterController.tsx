'use client';
/**
 * 텔레포터 — 매 frame 플레이어 위치가 텔레포터 박스 안에 들어왔는지 판정.
 *  - 들어왔으면 → playerCtl.teleport(dest) + (옵션) setRotY 강제
 *  - 도착 후 cooldown 동안 그 텔레포터 재진입 무시 (무한 루프 방지)
 *  - 도착지 자체에 또 다른 텔레포터가 있으면 그것도 일단 cooldown 으로 봉인
 *    (출구 텔레포터에 doExit 같은 게 따로 없어도 ping-pong 안 일어남)
 */
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { TeleporterSpot } from './components';
import type { PlayerControl } from './SeatController';

export interface PlayerControlWithRot extends PlayerControl {
  setRotationY?: (rotY: number) => void;
}

export default function TeleporterController({
  teleporters,
  localPoseRef,
  playerCtlRef,
}: {
  teleporters: TeleporterSpot[];
  localPoseRef: React.MutableRefObject<{ x: number; y: number; z: number; rotY: number }> | null | undefined;
  playerCtlRef: React.MutableRefObject<PlayerControlWithRot | null> | null | undefined;
}) {
  // cooldown 풀리는 시각 (performance.now ms). teleporter id → 시각.
  const cooldownUntil = useRef<Map<string, number>>(new Map());

  useEffect(() => () => { cooldownUntil.current.clear(); }, []);

  useFrame(() => {
    const pose = localPoseRef?.current;
    const ctl = playerCtlRef?.current;
    if (!pose || !ctl) return;
    const now = performance.now();
    for (const t of teleporters) {
      // 쿨다운 중인 텔레포터는 진입해도 무시
      const until = cooldownUntil.current.get(t.id) ?? 0;
      if (now < until) continue;
      // 박스 in/out
      const inside =
        Math.abs(pose.x - t.cx) <= t.hx &&
        Math.abs(pose.y - t.cy) <= t.hy &&
        Math.abs(pose.z - t.cz) <= t.hz;
      if (!inside) continue;
      // 진입 → 텔레포트 + 본인 cooldown + 도착지 근처의 모든 텔레포터에도 cooldown 걸기 (ping-pong 방지)
      try { ctl.teleport?.(t.dx, t.dy, t.dz); } catch { /* noop */ }
      if (t.setRotY) {
        try { ctl.setRotationY?.(t.drotY); } catch { /* noop */ }
      }
      const cdMs = t.cooldown * 1000;
      cooldownUntil.current.set(t.id, now + cdMs);
      for (const other of teleporters) {
        if (other.id === t.id) continue;
        const dx = other.cx - t.dx, dy = other.cy - t.dy, dz = other.cz - t.dz;
        const distSq = dx * dx + dy * dy + dz * dz;
        const r = Math.max(other.hx, other.hy, other.hz) + 0.5;
        if (distSq <= r * r) cooldownUntil.current.set(other.id, now + cdMs);
      }
      break; // 한 frame 에 한 번만 텔레포트
    }
  });

  return null;
}
