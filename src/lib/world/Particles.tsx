'use client';
/**
 * 파티클 시스템 — 'particle' 컴포넌트를 붙인 오브젝트 위치에서 입자를 방출.
 *
 * 프리셋(눈/연기/불/비/반짝임)이 색·방향·기본 속도/크기·블렌딩을 결정하고,
 * props(개수·크기배율·속도배율·반경·높이·투명도·색)로 세부 조절.
 * THREE.Points + 부드러운 원형 스프라이트. useFrame 으로 이동·재활용(wrap).
 *
 * 오브젝트 로컬 공간에서 방출 → 호출부에서 오브젝트 월드 TRS group 안에 렌더하면
 * 위치/회전/스케일이 자동 반영됨. (StudioCanvas 편집·시뮬, WorldCanvas 플레이 공용)
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getProp, type ComponentInstance } from '@/lib/world/components';

export type ParticlePreset = 'snow' | 'smoke' | 'fire' | 'rain' | 'sparkles';

export interface ParticleSettings {
  preset: ParticlePreset;
  count: number;
  size: number;     // 기본 크기에 곱하는 배율
  speed: number;    // 기본 속도에 곱하는 배율
  area: number;     // 가로 방출 반경
  height: number;   // 세로 방출 범위
  opacity: number;
  color: string;    // '#ffffff' = 프리셋 기본색 사용
}

/** 'particle' 컴포넌트 인스턴스 → 설정 (기본값 fallback). */
export function deriveParticleSettings(inst: ComponentInstance): ParticleSettings {
  return {
    preset:  getProp(inst, 'preset', 'snow') as ParticlePreset,
    count:   getProp(inst, 'count', 300),
    size:    getProp(inst, 'size', 1),
    speed:   getProp(inst, 'speed', 1),
    area:    getProp(inst, 'area', 6),
    height:  getProp(inst, 'height', 8),
    opacity: getProp(inst, 'opacity', 0.85),
    color:   getProp(inst, 'color', '#ffffff'),
  };
}

interface PresetCfg {
  color: string;
  dir: 1 | -1;        // -1 = 아래로(눈/비), +1 = 위로(연기/불/반짝임)
  baseSpeed: number;
  baseSize: number;
  blending: THREE.Blending;
  sway: number;       // 가로 흔들림 진폭
  swaySpeed: number;
  opacityMul: number;
}

const PRESETS: Record<ParticlePreset, PresetCfg> = {
  snow:     { color: '#ffffff', dir: -1, baseSpeed: 1.2, baseSize: 0.08, blending: THREE.NormalBlending,   sway: 0.5,  swaySpeed: 0.6, opacityMul: 1 },
  smoke:    { color: '#8a8f99', dir:  1, baseSpeed: 0.6, baseSize: 0.55, blending: THREE.NormalBlending,   sway: 0.3,  swaySpeed: 0.3, opacityMul: 0.45 },
  fire:     { color: '#ff5a1f', dir:  1, baseSpeed: 1.9, baseSize: 0.22, blending: THREE.AdditiveBlending, sway: 0.18, swaySpeed: 1.3, opacityMul: 0.9 },
  rain:     { color: '#9bbcff', dir: -1, baseSpeed: 5.0, baseSize: 0.05, blending: THREE.NormalBlending,   sway: 0,    swaySpeed: 0,   opacityMul: 0.8 },
  sparkles: { color: '#ffe9a3', dir:  1, baseSpeed: 0.4, baseSize: 0.07, blending: THREE.AdditiveBlending, sway: 0.4,  swaySpeed: 0.9, opacityMul: 1 },
};

// 부드러운 원형 스프라이트 — 모듈 1회 생성 후 공유 (사각 점 방지)
let SPRITE: THREE.Texture | null = null;
function softSprite(): THREE.Texture | null {
  if (SPRITE) return SPRITE;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  SPRITE = tex;
  return tex;
}

export default function Particles({ s }: { s: ParticleSettings }) {
  const cfg = PRESETS[s.preset] ?? PRESETS.snow;
  const count = Math.max(1, Math.min(3000, Math.floor(s.count)));
  const area = Math.max(0.1, s.area);
  const height = Math.max(0.1, s.height);
  const color = s.color && s.color.toLowerCase() !== '#ffffff' ? s.color : cfg.color;

  const pointsRef = useRef<THREE.Points>(null);
  const sprite = useMemo(softSprite, []);

  // 초기 위치 + 입자별 속도 편차/위상 — count·area·height 바뀌면 재생성
  const { positions, speeds, phases } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() * 2 - 1) * area;
      positions[i * 3 + 1] = (Math.random() - 0.5) * height;
      positions[i * 3 + 2] = (Math.random() * 2 - 1) * area;
      speeds[i] = 0.6 + Math.random() * 0.8;
      phases[i] = Math.random() * Math.PI * 2;
    }
    return { positions, speeds, phases };
  }, [count, area, height]);

  useFrame((state, dt) => {
    const pts = pointsRef.current;
    if (!pts) return;
    const attr = pts.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!attr) return;
    const arr = attr.array as Float32Array;
    const d = Math.min(dt, 0.05);
    const vy = cfg.dir * cfg.baseSpeed * s.speed;
    const t = state.clock.elapsedTime;
    const half = height / 2;
    for (let i = 0; i < count; i++) {
      const k = i * 3;
      arr[k + 1] += vy * speeds[i] * d;
      if (cfg.sway) arr[k] += Math.sin(t * cfg.swaySpeed + phases[i]) * cfg.sway * d;
      const y = arr[k + 1];
      // 범위 밖으로 나가면 반대편에서 재방출 (가로 위치도 새로 뽑음)
      if (cfg.dir < 0 ? y < -half : y > half) {
        arr[k] = (Math.random() * 2 - 1) * area;
        arr[k + 1] = cfg.dir < 0 ? half : -half;
        arr[k + 2] = (Math.random() * 2 - 1) * area;
      }
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} frustumCulled={false} raycast={() => null}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={Math.max(0.001, cfg.baseSize * s.size)}
        color={color}
        map={sprite ?? undefined}
        transparent
        opacity={Math.max(0, Math.min(1, s.opacity * cfg.opacityMul))}
        depthWrite={false}
        blending={cfg.blending}
        sizeAttenuation
      />
    </points>
  );
}
