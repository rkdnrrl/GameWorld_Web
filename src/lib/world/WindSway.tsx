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

// 공간 주파수 — 위상이 위치에 따라 얼마나 빨리 변하는지. 작을수록 넓은 영역이 비슷하게 흔들림.
// 0.25 ≈ 파장 ~25m: 가까운 나무는 거의 같이, 먼 나무는 살짝 시차를 두고 물결치듯.
const WAVE_FREQ = 0.25;

export default function WindSway({ wind, children }: { wind: WindSettings; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  // 같은 바람이어도 완전히 똑같진 않게 — 아주 작은 개체 편차만 (랜덤 위상 X)
  const jitter = useMemo(() => (Math.random() - 0.5) * 0.5, []);
  const wpos = useRef(new THREE.Vector3());
  const dir = (wind.direction * Math.PI) / 180;
  const cosD = Math.cos(dir);
  const sinD = Math.sin(dir);
  const amp = 0.12 * Math.max(0, wind.strength);   // 라디안. strength 1 ≈ ~7°
  const spd = Math.max(0.05, wind.speed);
  const turb = Math.max(0, wind.turbulence);

  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    // 위치 기반 위상 — 바람 진행축에 투영한 좌표로 위상을 결정해, 같은 바람이 물결처럼 퍼지게.
    // 가까운(바람축에 수직인) 나무들은 비슷하게, 바람 방향으로 갈수록 시차가 생김.
    g.getWorldPosition(wpos.current);
    const phase = (wpos.current.x * cosD + wpos.current.z * sinD) * WAVE_FREQ + jitter;
    const t = state.clock.elapsedTime;
    // 완만한 기본 바람 + 느린 난기류 합성 (난기류도 위치 기반이라 전체가 코히어런트)
    const base = Math.sin(t * spd - phase);
    const gust = Math.sin(t * spd * 2.3 - phase * 1.2) * turb;
    const tilt = (base + gust) * amp;
    // 바람 방향으로 기울임: +X 방향 → Z축 -회전, +Z 방향 → X축 +회전
    g.rotation.z = -cosD * tilt;
    g.rotation.x = sinD * tilt;
  });

  return <group ref={ref}>{children}</group>;
}
