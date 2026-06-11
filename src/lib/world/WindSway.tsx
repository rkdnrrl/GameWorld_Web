'use client';
/**
 * 바람 흔들림 — 버텍스 셰이더 기반 폴리지 바람. (예전: 그룹 통째 회전 → 부자연스러움)
 *
 * 자식 mesh 들의 머티리얼 셰이더에 바람 변위를 주입한다:
 *  - 밑동(base) 은 거의 고정, **높이(h)에 비례해 휨** → 나무가 자연스럽게 굽음
 *  - 높은 곳(잎)일수록 **고주파 소진폭 펄럭임** → 나뭇잎이 잘게 흔들림
 *  - 위상이 월드 위치 기반 → 같은 바람이 물결처럼 코히어런트하게 퍼짐
 *
 * 전역 유니폼(uWindTime 등)은 모든 나무가 공유(한 바람). 높이 기준 base Y 만 오브젝트별.
 * StudioCanvas(편집·시뮬) / WorldCanvas(플레이) 공용.
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export interface WindSettings {
  strength: number;   // 휨 세기
  speed: number;      // 흔들림 속도
  direction: number;  // 바람 방향 (도, XZ 평면)
  turbulence: number; // 잎 펄럭임 강도
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

// ── 전역 공유 유니폼 (모든 나무 = 한 바람) ──
const G = {
  uWindTime:  { value: 0 },
  uWindDir:   { value: new THREE.Vector2(1, 0) },
  uWindStr:   { value: 0 },
  uWindSpeed: { value: 1 },
  uWindTurb:  { value: 0.4 },
};
// 활성 WindSway 수 — 0 이 되면(바람 제거) 변위를 0 으로 (나무 똑바로)
let activeCount = 0;

const VERT_UNIFORMS =
  'uniform float uWindTime; uniform vec2 uWindDir; uniform float uWindStr; uniform float uWindSpeed; uniform float uWindTurb; uniform float uWindBaseY;\n';

// #include <begin_vertex> 뒤에 주입 — transformed(로컬 정점), modelMatrix(월드 변환) 사용
const VERT_BODY = `
{
  vec4 wWind = modelMatrix * vec4(transformed, 1.0);
  float hWind = max(wWind.y - uWindBaseY, 0.0);              // base 위 높이(월드 m)
  float phWind = (wWind.x * uWindDir.x + wWind.z * uWindDir.y) * 0.25;  // 위치 위상(물결)
  float tWind = uWindTime * uWindSpeed;
  // 메인 굽힘 — 높이에 비례(밑동 고정, 위로 휨). 2종 사인 합성으로 자연스럽게.
  float bendWind = (sin(tWind - phWind) * 0.7 + sin(tWind * 1.7 - phWind * 1.3) * 0.3) * hWind * uWindStr * 0.06;
  // 잎 펄럭임 — 고주파 소진폭, 높이·정점 위치 기반.
  float flWind = sin(tWind * 5.0 - phWind + wWind.x * 3.0 + wWind.z * 3.0) * hWind * uWindStr * uWindTurb * 0.03;
  transformed.x += bendWind * uWindDir.x + flWind;
  transformed.z += bendWind * uWindDir.y + flWind * 0.6;
  transformed.y -= abs(flWind) * 0.2;
}
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function patchMaterial(mat: THREE.Material, baseY: { value: number }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ud = mat.userData as any;
  if (ud.__windBaseY === baseY) return; // 이미 이 인스턴스로 패치됨
  const prev = ud.__windHadOBC ? ud.__windPrevOBC : mat.onBeforeCompile;
  ud.__windHadOBC = true;
  ud.__windPrevOBC = prev;
  ud.__windBaseY = baseY;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mat.onBeforeCompile = (shader: any, renderer: any) => {
    if (prev) prev.call(mat, shader, renderer);
    shader.uniforms.uWindTime  = G.uWindTime;
    shader.uniforms.uWindDir   = G.uWindDir;
    shader.uniforms.uWindStr   = G.uWindStr;
    shader.uniforms.uWindSpeed = G.uWindSpeed;
    shader.uniforms.uWindTurb  = G.uWindTurb;
    shader.uniforms.uWindBaseY = baseY;
    if (!shader.vertexShader.includes('uWindTime')) {
      shader.vertexShader = VERT_UNIFORMS + shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>' + VERT_BODY,
      );
    }
  };
  mat.needsUpdate = true;
}

export default function WindSway({ wind, children }: { wind: WindSettings; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const baseY = useMemo(() => ({ value: 0 }), []);
  const wpos = useRef(new THREE.Vector3());

  useEffect(() => {
    activeCount++;
    return () => { activeCount--; if (activeCount <= 0) G.uWindStr.value = 0; };
  }, []);

  useFrame((state) => {
    // 전역 바람 유니폼 갱신 (모든 WindSway 가 같은 값 씀 — 한 바람)
    G.uWindTime.value = state.clock.elapsedTime;
    const d = (wind.direction * Math.PI) / 180;
    G.uWindDir.value.set(Math.cos(d), Math.sin(d));
    G.uWindStr.value   = Math.max(0, wind.strength);
    G.uWindSpeed.value = Math.max(0.05, wind.speed);
    G.uWindTurb.value  = Math.max(0, wind.turbulence);

    const g = ref.current;
    if (!g) return;
    g.getWorldPosition(wpos.current);
    baseY.value = wpos.current.y;
    // 서브트리 머티리얼에 바람 셰이더 주입 (미패치만 — patchMaterial 이 조기 반환)
    g.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!m) return;
      if (Array.isArray(m)) m.forEach((mm) => patchMaterial(mm, baseY));
      else patchMaterial(m, baseY);
    });
  });

  return <group ref={ref}>{children}</group>;
}
