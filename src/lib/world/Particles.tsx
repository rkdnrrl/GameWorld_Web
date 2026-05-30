'use client';
/**
 * 파티클 시스템 — 'particle' 컴포넌트를 붙인 오브젝트 위치에서 입자를 방출.
 *
 * 방식(mode):
 *  - 'continuous' : 계속 방출 (눈/연기/불/비/반짝임). 프리셋이 방향·속도·블렌딩을 결정.
 *  - 'click'      : 평소엔 숨김. 1인칭에서 그 오브젝트를 클릭(정조준 후 좌클릭)할 때마다
 *                   중심에서 사방으로 한 번 터졌다가 페이드아웃 (클릭 이펙트).
 *                   에디터 미리보기에서는 1.4초마다 자동 반복 재생해 모양을 보여줌.
 *
 * 텍스처: s.texture(이미지 URL) 가 있으면 그걸 입자 스프라이트로, 없으면 기본 부드러운 원형.
 *
 * 오브젝트 로컬 공간에서 방출 → 호출부에서 오브젝트 월드 TRS group 안에 렌더하면
 * 위치/회전/스케일이 자동 반영됨. (StudioCanvas 편집·시뮬, WorldCanvas 플레이 공용)
 *
 * 클릭 버스트 트리거: 호출부가 objId + burstRef(Map<objId, nonce>) 를 넘기면,
 * Player 의 클릭 핸들러가 burstRef 의 nonce 를 증가시키고, 여기서 매 프레임 폴링해 재생.
 */
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getProp, type ComponentInstance } from '@/lib/world/components';

export type ParticlePreset = 'snow' | 'smoke' | 'fire' | 'rain' | 'sparkles';
export type ParticleMode = 'continuous' | 'click';

export interface ParticleSettings {
  mode: ParticleMode;
  preset: ParticlePreset;
  count: number;
  size: number;     // 기본 크기에 곱하는 배율
  speed: number;    // 기본 속도에 곱하는 배율
  area: number;     // 가로 방출 반경 (click 모드에선 초기 퍼짐 + 폭발 거리에 영향)
  height: number;   // 세로 방출 범위 (continuous 전용)
  opacity: number;
  color: string;    // '#ffffff' = 프리셋 기본색 사용
  texture: string;  // 이미지 URL ('' = 기본 원형 스프라이트)
}

/** 'particle' 컴포넌트 인스턴스 → 설정 (기본값 fallback). */
export function deriveParticleSettings(inst: ComponentInstance): ParticleSettings {
  return {
    mode:    getProp(inst, 'mode', 'continuous') as ParticleMode,
    preset:  getProp(inst, 'preset', 'snow') as ParticlePreset,
    count:   getProp(inst, 'count', 300),
    size:    getProp(inst, 'size', 1),
    speed:   getProp(inst, 'speed', 1),
    area:    getProp(inst, 'area', 6),
    height:  getProp(inst, 'height', 8),
    opacity: getProp(inst, 'opacity', 0.85),
    color:   getProp(inst, 'color', '#ffffff'),
    texture: getProp(inst, 'texture', ''),
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

const BURST_DUR = 0.85;  // 클릭 버스트 1회 지속 시간(초)

export default function Particles({ s, objId, burstRef }: {
  s: ParticleSettings;
  objId?: string;
  burstRef?: React.MutableRefObject<Map<string, number>>;
}) {
  const cfg = PRESETS[s.preset] ?? PRESETS.snow;
  const count = Math.max(1, Math.min(3000, Math.floor(s.count)));
  const area = Math.max(0.1, s.area);
  const height = Math.max(0.1, s.height);
  const color = s.color && s.color.toLowerCase() !== '#ffffff' ? s.color : cfg.color;
  const isClick = s.mode === 'click';
  const baseOpacity = Math.max(0, Math.min(1, s.opacity * cfg.opacityMul));

  const pointsRef = useRef<THREE.Points>(null);
  const fallback = useMemo(softSprite, []);
  // 사용자 텍스처 — URL 있으면 로드(비동기, 로드되면 자동 반영), 없으면 기본 원형
  const customTex = useMemo(() => {
    if (!s.texture) return null;
    const tex = new THREE.TextureLoader().load(s.texture);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [s.texture]);
  useEffect(() => () => { customTex?.dispose(); }, [customTex]);
  const sprite = customTex ?? fallback;

  // 초기 위치 + 입자별 속도 편차/위상 + 방향(버스트용 단위벡터) — count·area·height 바뀌면 재생성
  const { positions, speeds, phases, dirs } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const phases = new Float32Array(count);
    const dirs = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() * 2 - 1) * area;
      positions[i * 3 + 1] = (Math.random() - 0.5) * height;
      positions[i * 3 + 2] = (Math.random() * 2 - 1) * area;
      speeds[i] = 0.6 + Math.random() * 0.8;
      phases[i] = Math.random() * Math.PI * 2;
      // 구면 균등 분포 단위벡터 (버스트 폭발 방향)
      const theta = Math.random() * Math.PI * 2;
      const cosP = 2 * Math.random() - 1;
      const sinP = Math.sqrt(Math.max(0, 1 - cosP * cosP));
      dirs[i * 3 + 0] = sinP * Math.cos(theta);
      dirs[i * 3 + 1] = Math.abs(cosP) * 0.7 + 0.3;     // 위쪽으로 약간 치우치게
      dirs[i * 3 + 2] = sinP * Math.sin(theta);
    }
    return { positions, speeds, phases, dirs };
  }, [count, area, height]);

  // 버스트 상태
  const burstAge = useRef(-1);            // -1 = 비활성(숨김)
  const lastNonce = useRef(0);
  const autoTimer = useRef(BURST_DUR + 0.4);

  useFrame((state, dt) => {
    const pts = pointsRef.current;
    if (!pts) return;
    const attr = pts.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!attr) return;
    const arr = attr.array as Float32Array;
    const d = Math.min(dt, 0.05);

    // ── 클릭 버스트 모드 ──
    if (isClick) {
      // 트리거 감지: burstRef 있으면 nonce 폴링, 없으면(에디터 미리보기) 자동 반복
      let trigger = false;
      if (burstRef && objId) {
        const n = burstRef.current.get(objId) ?? 0;
        if (n !== lastNonce.current) { lastNonce.current = n; trigger = true; }
      } else {
        autoTimer.current += d;
        if (burstAge.current < 0 && autoTimer.current > BURST_DUR + 0.5) { autoTimer.current = 0; trigger = true; }
      }
      if (trigger) {
        burstAge.current = 0;
        for (let i = 0; i < count; i++) {
          const k = i * 3;
          arr[k]     = dirs[k]     * area * 0.05;
          arr[k + 1] = dirs[k + 1] * area * 0.05;
          arr[k + 2] = dirs[k + 2] * area * 0.05;
        }
        attr.needsUpdate = true;
      }
      const mat = pts.material as THREE.PointsMaterial;
      if (burstAge.current < 0) { pts.visible = false; return; }
      pts.visible = true;
      burstAge.current += d;
      if (burstAge.current > BURST_DUR) { burstAge.current = -1; pts.visible = false; return; }
      const prog = burstAge.current / BURST_DUR;          // 0→1
      const ease = 1 - prog * 0.6;                         // 점점 느려지게
      const explodeV = Math.max(0.5, cfg.baseSpeed * s.speed) * (area * 0.45 + 1.5);
      for (let i = 0; i < count; i++) {
        const k = i * 3;
        arr[k]     += dirs[k]     * explodeV * speeds[i] * ease * d;
        arr[k + 1] += dirs[k + 1] * explodeV * speeds[i] * ease * d;
        arr[k + 2] += dirs[k + 2] * explodeV * speeds[i] * ease * d;
      }
      attr.needsUpdate = true;
      mat.opacity = baseOpacity * (1 - prog);              // 페이드아웃
      return;
    }

    // ── 연속 방출 모드 (기존) ──
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
    <points ref={pointsRef} frustumCulled={false} raycast={() => null} visible={!isClick}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={Math.max(0.001, cfg.baseSize * s.size)}
        color={color}
        map={sprite ?? undefined}
        transparent
        opacity={baseOpacity}
        depthWrite={false}
        blending={cfg.blending}
        sizeAttenuation
      />
    </points>
  );
}
