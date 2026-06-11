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
import { useEffect, useRef, type ReactNode } from 'react';
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
  // 모델 스케일 — bendWind 는 world m 단위인데 local 정점(transformed)에 더하므로,
  // 스케일로 나눠 줘야 world 변위가 스케일에 무관하게 일정(안 그러면 크게 스케일한 에셋이 심하게 일그러짐).
  vec3 sWind = max(vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz)), vec3(0.0001));
  float hWind = clamp(wWind.y - uWindBaseY, 0.0, 4.0);      // base 위 높이(월드 m), 과한 굽힘 방지 클램프
  float phWind = (wWind.x * uWindDir.x + wWind.z * uWindDir.y) * 0.25;  // 위치 위상(물결)
  float tWind = uWindTime * uWindSpeed;
  // 메인 굽힘 — 높이 비례 + **world 변위 상한 클램프**(세기 높여도 그로테스크하게 안 찢어지게).
  float bendWind = clamp(
    (sin(tWind - phWind) * 0.7 + sin(tWind * 1.7 - phWind * 1.3) * 0.3) * hWind * uWindStr * 0.05,
    -0.5, 0.5);
  // 잎 펄럭임 — 고주파 소진폭, 상한 클램프.
  float flWind = clamp(
    sin(tWind * 5.0 - phWind + wWind.x * 3.0 + wWind.z * 3.0) * hWind * uWindStr * uWindTurb * 0.02,
    -0.1, 0.1);
  transformed.x += (bendWind * uWindDir.x + flWind) / sWind.x;
  transformed.z += (bendWind * uWindDir.y + flWind * 0.6) / sWind.z;
  transformed.y -= (abs(flWind) * 0.2) / sWind.y;
}
`;

/**
 * 머티리얼에 바람 변위 셰이더를 1회 주입(멱등). 이미 패치됐으면 baseY 값만 갱신.
 * AssetMesh 가 compileAsync **전에** 호출 → 바람 포함 셰이더로 한 번에 컴파일(재컴파일 hitch 제거).
 * WindSway 의 useFrame 도 매 프레임 호출하지만 이미 패치됐으면 값만 갱신 → 재컴파일 X.
 */
export function patchWindMaterial(mat: THREE.Material, baseYValue: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ud = mat.userData as any;
  if (ud.__windUniform) { ud.__windUniform.value = baseYValue; return; } // 이미 패치 — 값만 갱신
  const u = { value: baseYValue };
  ud.__windUniform = u;
  const prev = mat.onBeforeCompile;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mat.onBeforeCompile = (shader: any, renderer: any) => {
    if (prev) prev.call(mat, shader, renderer);
    shader.uniforms.uWindTime  = G.uWindTime;
    shader.uniforms.uWindDir   = G.uWindDir;
    shader.uniforms.uWindStr   = G.uWindStr;
    shader.uniforms.uWindSpeed = G.uWindSpeed;
    shader.uniforms.uWindTurb  = G.uWindTurb;
    shader.uniforms.uWindBaseY = u;
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
    const by = wpos.current.y;
    // **식물(잎 cutout)만 흔든다** — 로더가 mesh.userData.__windFoliage 로 표시. 통나무·바닥 등은 패치 안 함.
    // (baseY 갱신도 겸함. AssetMesh 가 compileAsync 전에 미리 패치하므로 여기선 보통 값 갱신만.)
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const m = mesh.material;
      if (!m || !mesh.userData?.__windFoliage) return;
      if (Array.isArray(m)) m.forEach((mm) => patchWindMaterial(mm, by));
      else patchWindMaterial(m, by);
    });
  });

  return <group ref={ref}>{children}</group>;
}
