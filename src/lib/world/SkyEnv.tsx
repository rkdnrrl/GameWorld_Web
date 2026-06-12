'use client';
/**
 * 하늘 분위기 공통 요소 — 거리 안개 + 구름 + 태양 위치.
 * World/Studio 양쪽 Canvas 에서 동일하게 써서 WYSIWYG 유지.
 *
 *  - SceneFog: scene.fog 에 옅은 FogExp2 — 지형 가장자리·원경을 하늘색으로 녹여 깊이감.
 *  - SkyClouds: drei 볼류메트릭 구름 몇 점 (가벼운 빌보드).
 *  - skySunPosition: dirlight 회전 → Sky 태양 위치(빛 방향의 반대). 그림자와 태양 글로우 일치.
 *
 * 셋 다 야외(showSky)일 때만 호출되도록 호출 측에서 게이팅한다.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { Clouds, Cloud, Stars } from '@react-three/drei';
import { computeSunDir } from './CsmSun';
import { envFx, setRain } from './envFx';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** dirlight 회전(있으면) → Sky 태양 위치. 빛이 나아가는 방향의 반대편이 태양. 없으면 기본 오전 햇살. */
export function skySunPosition(dirlightRotation?: [number, number, number]): [number, number, number] {
  if (!dirlightRotation) return [20, 10, 10];
  const d = computeSunDir(dirlightRotation);
  return [-d[0] * 100, -d[1] * 100, -d[2] * 100];
}

/** 밤 정도 — 0(낮) ~ 1(완전한 밤, 해가 지평선 아래). 달·별 게이팅/페이드용. */
export function nightFactor(sunPos: [number, number, number]): number {
  const len = Math.hypot(sunPos[0], sunPos[1], sunPos[2]) || 1;
  const hN = sunPos[1] / len;                  // -1(아래) ~ 1(천정)
  return clamp01((0.05 - hN) / 0.25);           // hN≥0.05 → 0(낮), hN≤-0.2 → 1(밤)
}

/** 태양 높이로 안개색 결정 — 낮(하늘빛) → 지평선(노을) → 밤(어두운 청보라). 시간대 + 대기원근. */
export function skyFogColor(sunPos: [number, number, number]): string {
  const len = Math.hypot(sunPos[0], sunPos[1], sunPos[2]) || 1;
  const hN = sunPos[1] / len;
  const night = nightFactor(sunPos);
  const day = clamp01(hN / 0.35);
  const warm = (1 - day) * (1 - night);         // 지평선 근처에서 최대(노을)
  let r = 0xcf, g = 0xe8, b = 0xf5;             // 낮 하늘빛
  r += (0xf0 - r) * warm; g += (0xc8 - g) * warm; b += (0x9a - b) * warm;    // 노을빛
  r += (0x1a - r) * night; g += (0x1a - g) * night; b += (0x32 - b) * night;  // 밤 청보라
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

/** 부드러운 원형 글로우 텍스처 (달 헤일로용). 클라이언트에서만 생성. */
function makeGlowTexture(): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.Texture();
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(220,228,255,0.5)');
  g.addColorStop(1, 'rgba(170,190,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** 달 — 태양 반대편 하늘 높이에 발광 원반 + 헤일로. 카메라를 따라 고정 방향(천체처럼).
 *  fog/톤매핑 영향 안 받아 밤에도 밝게. opacity 로 밤 정도에 따라 페이드. */
export function SkyMoon({ sunPos, opacity = 1 }: { sunPos: [number, number, number]; opacity?: number }) {
  const ref = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const glow = useMemo(() => makeGlowTexture(), []);
  useEffect(() => () => { glow.dispose(); }, [glow]);
  const dir = useMemo<[number, number, number]>(() => {
    const len = Math.hypot(sunPos[0], sunPos[1], sunPos[2]) || 1;
    const dx = -sunPos[0] / len, dz = -sunPos[2] / len, dy = 0.55;   // 태양 반대편, 천정 쪽으로 띄움
    const n = Math.hypot(dx, dy, dz) || 1;
    return [dx / n, dy / n, dz / n];
  }, [sunPos]);
  const D = 300;
  useFrame(() => {
    if (ref.current) ref.current.position.set(camera.position.x + dir[0] * D, camera.position.y + dir[1] * D, camera.position.z + dir[2] * D);
  });
  return (
    <group ref={ref}>
      <sprite scale={[150, 150, 1]}>
        <spriteMaterial map={glow} color="#cdd8ff" opacity={0.5 * opacity} transparent depthWrite={false} blending={THREE.AdditiveBlending} fog={false} toneMapped={false} />
      </sprite>
      <mesh>
        <sphereGeometry args={[16, 28, 28]} />
        <meshBasicMaterial color="#eef2ff" fog={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** 밤하늘 별 — drei Starfield (가벼운 Points). */
export function SkyStars() {
  return <Stars radius={300} depth={50} count={2500} factor={5} saturation={0} fade speed={0.4} />;
}

/** 태양 위치·밤 정도·비 여부 → 젖은 땅 반사용 envFx 갱신.
 *  하늘 반사색은 안개색(skyFogColor)을 지평선으로 재사용해 하늘/안개와 톤 일치.
 *  글린트는 낮=태양, 밤=달(태양 반대편) 방향. */
function applyEnvFx(sunPos: [number, number, number], night: number, raining: boolean) {
  envFx.skyHoriz.set(skyFogColor(sunPos));
  // 천정색 — 낮 파랑 → 밤 짙은 청보라
  envFx.skyTop.set('#3f7fd6').lerp(_NIGHT_TOP, night);
  envFx.night = night;
  const len = Math.hypot(sunPos[0], sunPos[1], sunPos[2]) || 1;
  if (night < 0.5) {
    // 낮 — 태양 글린트(따뜻한 흰빛, 넓게)
    envFx.glintDir.set(sunPos[0] / len, sunPos[1] / len, sunPos[2] / len);
    envFx.glintColor.set('#fff4e0');
    envFx.glintSharp = 250;
  } else {
    // 밤 — 달 글린트(SkyMoon 과 동일 방향: 태양 반대편 + 천정으로 띄움, 차가운 빛, 또렷하게)
    let dx = -sunPos[0] / len, dz = -sunPos[2] / len;
    const dy = 0.55, n = Math.hypot(dx, dy, dz) || 1;
    envFx.glintDir.set(dx / n, dy / n, dz / n);
    envFx.glintColor.set('#cdd8ff');
    envFx.glintSharp = 600;
  }
  setRain(raining);
}
const _NIGHT_TOP = new THREE.Color('#070a18');

/** 씬 전역 환경효과(비 젖음 + 하늘 반사) 갱신기. 실내/실외 무관하게 렌더해 비 자동연동이 항상 동작.
 *  sunPos/night 는 호출측이 dirlight 로 계산해 넘김(없으면 기본 오전). */
export function EnvFxUpdater({ sunPos, night, raining }: {
  sunPos: [number, number, number]; night: number; raining: boolean;
}) {
  useEffect(() => { applyEnvFx(sunPos, night, raining); },
    [sunPos[0], sunPos[1], sunPos[2], night, raining]);
  // 언마운트 시 비 목표치 해제(다음 맵으로 누수 방지)
  useEffect(() => () => { setRain(false); }, []);
  return null;
}

/** 전역 거리 안개 — 마운트 동안만 scene.fog 설정, 언마운트 시 원복(수중 PostFX 등과 충돌 없음).
 *  비가 오면(envFx.rainWet) 밀도를 부드럽게 올려 악천후 깊이감을 준다. */
export function SceneFog({ color = '#cfe8f5', density = 0.0022 }: { color?: string; density?: number }) {
  const { scene } = useThree();
  const fogRef = useRef<THREE.FogExp2 | null>(null);
  const cur = useRef(density);
  useEffect(() => {
    const prev = scene.fog;
    const fog = new THREE.FogExp2(new THREE.Color(color), density);
    fogRef.current = fog;
    cur.current = density;
    // three 씬 변이는 표준 패턴(언마운트 시 원복). react-compiler immutability 규칙만 예외.
    // eslint-disable-next-line react-hooks/immutability
    scene.fog = fog;
    return () => { scene.fog = prev; fogRef.current = null; };
  }, [scene, color, density]);
  // 비 오면 안개 짙어짐 — rainWet(0~0.9) 따라 최대 ~2.6배까지 밀도 ramp(시정수 ~1s).
  useFrame((_, dt) => {
    const fog = fogRef.current;
    if (!fog) return;
    const target = density * (1 + envFx.rainWet * 1.8);
    cur.current += (target - cur.current) * Math.min(1, dt * 0.8);
    fog.density = cur.current;
  });
  return null;
}

/** 하늘 구름 — 빛 영향 없는 흰 빌보드(MeshBasicMaterial)라 태양 강도와 무관하게 항상 밝음. */
export function SkyClouds() {
  return (
    <Clouds material={THREE.MeshBasicMaterial} frustumCulled={false}>
      <Cloud seed={1} segments={24} bounds={[80, 6, 80]} volume={26} smallestVolume={0.4}
        position={[12, 46, -24]} color="#ffffff" opacity={0.5} speed={0.16} growth={6} />
      <Cloud seed={7} segments={18} bounds={[70, 5, 70]} volume={20} smallestVolume={0.4}
        position={[-44, 54, 28]} color="#eef4fb" opacity={0.42} speed={0.11} growth={5} />
    </Clouds>
  );
}
