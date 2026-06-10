'use client';
/**
 * 체크포인트 + 킬존 시스템 — 한 controller 가 두 컴포넌트 같이 처리.
 *  - checkpoint 박스 진입 → lastCheckpoint ref 갱신 (다른 체크포인트면) + 토스트.
 *  - killZone 박스 진입 → playerCtl.teleport(lastCheckpoint or worldSpawn) + 토스트.
 *  - 같은 체크포인트 재진입은 무시. killZone 은 짧은 cooldown(0.5s) 으로 반복 텔레포트 방지.
 *
 * spawn fallback: lastCheckpoint 없으면 worldSpawnRef 의 위치 사용.
 *   WorldCanvas/StudioCanvas 에서 prop 으로 spawn 좌표 전달.
 * 멀티: 본인 캐릭터만. 다른 플레이어는 본인 클라가 자체 부활.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFrame } from '@react-three/fiber';
import type { CheckpointSpot, KillZoneSpot } from './components';
import type { PlayerControl } from './SeatController';

type Toast = { text: string; ts: number };

export default function CheckpointController({
  checkpoints,
  killZones,
  worldSpawn,
  localPoseRef,
  playerCtlRef,
}: {
  checkpoints: CheckpointSpot[];
  killZones: KillZoneSpot[];
  worldSpawn: [number, number, number] | null | undefined;
  localPoseRef: React.MutableRefObject<{ x: number; y: number; z: number; rotY: number }> | null | undefined;
  playerCtlRef: React.MutableRefObject<PlayerControl | null> | null | undefined;
}) {
  const lastCheckpointId = useRef<string | null>(null);
  // 부활 위치(체크포인트의 cy + offsetY 반영) — id 가 살아 있으면 항상 그 체크포인트 좌표로 다시 계산
  const lastSpawnPos = useRef<[number, number, number] | null>(null);
  const cooldownUntil = useRef(0);
  const elapsed = useRef(0);
  const [toast, setToast] = useState<Toast | null>(null);

  const pushToast = (text: string) => {
    setToast({ text, ts: elapsed.current });
  };

  // toast 자동 fade
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(curr => curr?.ts === toast.ts ? null : curr), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // 체크포인트 사라지면 정리
  useEffect(() => {
    if (lastCheckpointId.current && !checkpoints.find(c => c.id === lastCheckpointId.current)) {
      lastCheckpointId.current = null;
      lastSpawnPos.current = null;
    }
  }, [checkpoints]);

  function isInside(
    cx: number, cy: number, cz: number,
    hx: number, hy: number, hz: number,
    px: number, py: number, pz: number,
  ) {
    return Math.abs(px - cx) <= hx && Math.abs(py - cy) <= hy && Math.abs(pz - cz) <= hz;
  }

  useFrame((_state, dt) => {
    elapsed.current += dt;
    const pose = localPoseRef?.current;
    const ctl = playerCtlRef?.current;
    if (!pose) return;

    // 체크포인트 진입 체크
    for (const cp of checkpoints) {
      if (!isInside(cp.cx, cp.cy, cp.cz, cp.hx, cp.hy, cp.hz, pose.x, pose.y, pose.z)) continue;
      if (lastCheckpointId.current === cp.id) break; // 이미 등록된 체크포인트
      lastCheckpointId.current = cp.id;
      lastSpawnPos.current = [cp.cx, cp.cy + cp.offsetY, cp.cz];
      if (!cp.silent) pushToast(`🚩 ${cp.label}`);
      break;
    }

    // 킬존 진입 체크
    if (elapsed.current < cooldownUntil.current) return;
    for (const kz of killZones) {
      if (!isInside(kz.cx, kz.cy, kz.cz, kz.hx, kz.hy, kz.hz, pose.x, pose.y, pose.z)) continue;
      // 부활
      let spawn = lastSpawnPos.current;
      if (!spawn && worldSpawn) spawn = [worldSpawn[0], worldSpawn[1], worldSpawn[2]];
      if (!spawn) spawn = [0, 4, 0];
      try { ctl?.setVelocity?.(0, 0, 0); } catch { /* noop */ }
      try { ctl?.teleport?.(spawn[0], spawn[1], spawn[2]); } catch { /* noop */ }
      cooldownUntil.current = elapsed.current + 0.6;
      if (kz.toast) pushToast(kz.toast);
      // kill 모드는 V1에서 respawn 과 동일 동작 (health 통합은 V2)
      break;
    }
  });

  return (
    <>
      {toast && typeof document !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed', top: 96, left: '50%', transform: 'translateX(-50%)',
          zIndex: 2147480000, pointerEvents: 'none',
          padding: '10px 18px', borderRadius: 999,
          background: 'rgba(15,23,42,0.9)', color: '#fff',
          fontSize: 15, fontWeight: 700, fontFamily: 'system-ui, sans-serif',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          border: '1px solid rgba(255,255,255,0.15)',
        }}>{toast.text}</div>,
        document.body,
      )}
    </>
  );
}
