'use client';
/**
 * 바람 흔들림 — 'wind' 컴포넌트가 붙은 오브젝트의 mesh 를 감싸 매 프레임 기울인다.
 * 그룹 원점 기준으로 회전하므로, 원점이 바닥인 모델(나무 등)은 밑동에서 휘어진다.
 * StudioCanvas(편집·시뮬) / WorldCanvas(플레이) 공용.
 *
 * 세기(각도) · 속도 · 방향(°) · 난기류(불규칙) + 오브젝트별 위상으로 각자 다르게 흔들림.
 */
import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export interface WindSettings {
  strength: number;   // 최대 기울기 (≈ strength × 7°)
  speed: number;      // 흔들림 속도
  direction: number;  // 바람 방향 (도, XZ 평면)
  turbulence: number; // 난기류 — 빠른 작은 떨림 비율
}

export function deriveWind(props: Record<string, unknown> | undefined): WindSettings {
  const p = props || {};
  return {
    strength:   Number(p.strength   ?? 1),
    speed:      Number(p.speed      ?? 1),
    direction:  Number(p.direction  ?? 0),
    turbulence: Number(p.turbulence ?? 0.4),
  };
}

export default function WindSway({ wind, children }: { wind: WindSettings; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  // 오브젝트마다 다른 위상 — 같은 바람이어도 제각각 흔들리게
  const phase = useMemo(() => Math.random() * Math.PI * 2, []);
  const dir = (wind.direction * Math.PI) / 180;
  const cosD = Math.cos(dir);
  const sinD = Math.sin(dir);
  const amp = 0.12 * Math.max(0, wind.strength);   // 라디안. strength 1 ≈ ~7°
  const spd = Math.max(0.05, wind.speed);
  const turb = Math.max(0, wind.turbulence);

  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    // 완만한 기본 바람 + 빠른 난기류 합성
    const base = Math.sin(t * spd + phase);
    const gust = Math.sin(t * spd * 2.7 + phase * 1.3) * turb;
    const tilt = (base + gust) * amp;
    // 바람 방향으로 기울임: +X 방향 → Z축 -회전, +Z 방향 → X축 +회전
    g.rotation.z = -cosD * tilt;
    g.rotation.x = sinD * tilt;
  });

  return <group ref={ref}>{children}</group>;
}
