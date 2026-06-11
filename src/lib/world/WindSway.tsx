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
import { G } from './globalWind';

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

// 전역 공유 유니폼(G)은 ./globalWind 에 있음 — 폴리지 셰이더 + 캐릭터 스프링본이 공유.
// 활성 WindSway 수 — 0 이 되면(바람 제거) 변위를 0 으로 (나무 똑바로)
let activeCount = 0;

const VERT_UNIFORMS =
  'uniform float uWindTime; uniform vec2 uWindDir; uniform float uWindStr; uniform float uWindSpeed; uniform float uWindTurb; uniform float uWindBaseY; uniform float uWindLeaf;\n';

// #include <begin_vertex> 뒤에 주입 — transformed(로컬 정점), modelMatrix(월드 변환) 사용
const VERT_BODY = `
{
  vec4 wWind = modelMatrix * vec4(transformed, 1.0);
  // 모델 스케일 — bendWind 는 world m 단위인데 local 정점(transformed)에 더하므로,
  // 스케일로 나눠 줘야 world 변위가 스케일에 무관하게 일정(안 그러면 크게 스케일한 에셋이 심하게 일그러짐).
  vec3 sWind = max(vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz)), vec3(0.0001));
  float hWind = clamp(wWind.y - uWindBaseY, 0.0, 4.0);      // base 위 높이(월드 m), 과한 굽힘 방지 클램프
  float tWind = uWindTime * uWindSpeed;
  // ⚠️ 웨이브 제거: 위상을 월드위치(부드러운 전파 → 파도가 숲을 가로지름)로 정하지 않는다.
  //   - 나무별 랜덤 위상(원점 해시): 나무끼리만 어긋남, 전파(웨이브) 없음.
  //   - 정점별 랜덤 위상(로컬 position 해시): 잎이 코히어런트 물결이 아니라 잡음성으로 셔머.
  float treePhase = fract(sin(dot(modelMatrix[3].xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453) * 6.2831;
  float leafPhase = fract(sin(dot(position, vec3(12.9898, 78.233, 37.719))) * 43758.5453) * 6.2831;
  // 메인 굽힘(줄기 포함 전체) — 나무 한 그루가 한 위상으로 통째 기욺(웨이브 없음).
  //   **세기의 제곱에 비례** → 약풍엔 거의 0(줄기 정지), 강풍에만 눈에 띄게 휨.
  float strBend = uWindStr * uWindStr;
  float bendWind = clamp(
    (sin(tWind + treePhase) * 0.7 + sin(tWind * 1.7 + treePhase) * 0.3) * hWind * strBend * 0.001,
    -0.35, 0.35);
  // 잎 펄럭임 — **잎 머티리얼(uWindLeaf=1)만** (줄기는 0 → 펄럭임 0 = 부피 출렁임 없음).
  //   정점별 랜덤 위상 → 잡음성 셔머(웨이브 아님).
  float flWind = clamp(
    sin(tWind * 5.0 + leafPhase + treePhase) * hWind * uWindStr * uWindTurb * 0.012,
    -0.045, 0.045) * uWindLeaf;
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
export function patchWindMaterial(mat: THREE.Material, baseYValue: number, isLeaf: boolean) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ud = mat.userData as any;
  if (ud.__windUniform) {
    ud.__windUniform.value = baseYValue;                         // 이미 패치 — 값만 갱신
    if (ud.__windLeafUniform) ud.__windLeafUniform.value = isLeaf ? 1 : 0;
    return;
  }
  const u = { value: baseYValue };
  const ul = { value: isLeaf ? 1 : 0 };  // 잎 머티리얼이면 1(펄럭임 ON), 줄기면 0(굽힘만)
  ud.__windUniform = u;
  ud.__windLeafUniform = ul;
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
    shader.uniforms.uWindLeaf  = ul;
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
    // **식물 오브젝트(__windFoliage) 전체를 패치** — 줄기 포함. 단 펄럭임은 잎 슬롯(__windLeafSlots[i])만(uWindLeaf).
    // 줄기: 굽힘만(강풍에서만 휨) / 잎: 굽힘+펄럭임. 통나무·바닥 등 비-식물은 __windFoliage 없어 패치 안 됨.
    // (baseY 갱신도 겸함. AssetMesh 가 compileAsync 전에 미리 패치하므로 여기선 보통 값 갱신만.)
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const m = mesh.material;
      if (!m || !mesh.userData?.__windFoliage) return;
      const slots = mesh.userData?.__windLeafSlots as boolean[] | undefined;
      if (Array.isArray(m)) m.forEach((mm, i) => patchWindMaterial(mm, by, !!(slots && slots[i])));
      else patchWindMaterial(m, by, !!(slots && slots[0]));
    });
  });

  return <group ref={ref}>{children}</group>;
}
