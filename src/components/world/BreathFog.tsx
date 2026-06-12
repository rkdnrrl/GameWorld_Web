'use client';
/**
 * 입김 — 밤이거나 추울 때(=비 올 때) 캐릭터 머리 앞으로 피어오르는 하얀 숨결.
 *
 * 캐릭터당 1풀 — HumanoidMesh 안에서 호출(본인·원격 모두). createPortal 로 scene 에 띄움.
 * 호흡 리듬으로 약 3초마다 1번 퍼프 방출 → 위로 천천히 퍼지며 사라짐(FootstepDust 와 동일 패턴).
 *
 * 트리거: envFx.night > 0.4 (밤) 또는 envFx.rainWet > 0 (비=추움). 낮+맑음엔 비활성.
 *   ※ ALP 에 온도 시스템이 없어 "추움"은 비(rainWet)로 근사한다.
 * additive 블렌딩 — 알파를 색 페이드로 처리(투명도 어트리뷰트 없이 단순). 차가운 흰 톤.
 */
import { useCallback, useMemo, useRef } from 'react';
import { useFrame, useThree, createPortal } from '@react-three/fiber';
import * as THREE from 'three';
import { envFx } from '@/lib/world/envFx';

const N = 8;  // 퍼프 풀 크기

let _sprite: THREE.Texture | null = null;
function breathSprite(): THREE.Texture | null {
  if (_sprite) return _sprite;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.28)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _sprite = tex;
  return tex;
}

export function BreathFog({ groupRef, userScale = 1 }: {
  groupRef: React.RefObject<THREE.Group | null>;
  userScale?: number;
}) {
  const scene = useThree(s => s.scene);
  const ptsRef = useRef<THREE.Points>(null);
  const sprite = useMemo(breathSprite, []);
  const FOG = useMemo(() => new THREE.Color('#eaf3ff'), []);   // 차가운 흰
  const _wp = useMemo(() => new THREE.Vector3(), []);
  const _q = useMemo(() => new THREE.Quaternion(), []);
  const _fwd = useMemo(() => new THREE.Vector3(), []);

  // 풀 — 어트리뷰트(position/color/aScale) + 퍼프별 메타(emit·수명·상승·전방드리프트)
  const B = useMemo(() => ({
    position: new Float32Array(N * 3),
    color: new Float32Array(N * 3),
    aScale: new Float32Array(N),
    emit: new Float32Array(N * 3),
    base: new Float32Array(N),
    age: new Float32Array(N).fill(1e9),
    life: new Float32Array(N).fill(1),
    vy: new Float32Array(N),
    fx: new Float32Array(N),
    fz: new Float32Array(N),
  }), []);
  const breathTimer = useRef(0);
  const cursor = useRef(0);

  // PointsMaterial size 는 전역 — per-puff aScale 로 곱해 크기 다양화.
  const onBeforeCompile = useCallback((sh: THREE.WebGLProgramParametersWithUniforms) => {
    sh.vertexShader = 'attribute float aScale;\n' + sh.vertexShader.replace(
      'gl_PointSize = size;', 'gl_PointSize = size * aScale;',
    );
  }, []);

  useFrame((_, dt) => {
    const pts = ptsRef.current;
    if (!pts) return;
    const d = Math.min(dt, 0.05);
    const cold = envFx.night > 0.4 || envFx.rainWet > 0;
    const g = groupRef.current;

    // ── 호흡 방출 ──
    if (cold && g && g.visible) {
      breathTimer.current += d;
      if (breathTimer.current >= 2.8) {
        breathTimer.current = 0;
        g.getWorldPosition(_wp);
        g.getWorldQuaternion(_q);
        _fwd.set(0, 0, 1).applyQuaternion(_q);   // 캐릭터 전방(대략) — 정면 미세 드리프트용
        const i = cursor.current; cursor.current = (cursor.current + 1) % N;
        const k = i * 3;
        B.emit[k] = _wp.x + _fwd.x * 0.18 * userScale;
        B.emit[k + 1] = _wp.y + 1.45 * userScale;            // 머리/입 높이
        B.emit[k + 2] = _wp.z + _fwd.z * 0.18 * userScale;
        B.fx[i] = _fwd.x; B.fz[i] = _fwd.z;
        B.age[i] = 0;
        B.life[i] = 1.6;
        B.base[i] = 0.5 * userScale;
        B.vy[i] = 0.5 * userScale;
      }
    }

    // ── 갱신 ──
    const posA = pts.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colA = pts.geometry.getAttribute('color') as THREE.BufferAttribute;
    const sclA = pts.geometry.getAttribute('aScale') as THREE.BufferAttribute;
    const pa = posA.array as Float32Array;
    const ca = colA.array as Float32Array;
    const sa = sclA.array as Float32Array;
    let any = false;
    for (let i = 0; i < N; i++) {
      const k = i * 3;
      if (B.age[i] >= B.life[i]) {
        if (ca[k] || ca[k + 1] || ca[k + 2]) { ca[k] = ca[k + 1] = ca[k + 2] = 0; }
        continue;
      }
      any = true;
      B.age[i] += d;
      const t = Math.min(1, B.age[i] / B.life[i]);
      pa[k] = B.emit[k] + B.fx[i] * 0.25 * userScale * t;       // 앞으로 천천히 흘러감
      pa[k + 1] = B.emit[k + 1] + B.vy[i] * B.age[i];           // 위로 상승
      pa[k + 2] = B.emit[k + 2] + B.fz[i] * 0.25 * userScale * t;
      const alpha = Math.sin(t * Math.PI) * 0.4;                // 부드럽게 떴다 사라짐(additive → 색으로 알파)
      sa[i] = B.base[i] * (0.7 + t * 2.2);                     // 점점 커짐
      ca[k] = FOG.r * alpha; ca[k + 1] = FOG.g * alpha; ca[k + 2] = FOG.b * alpha;
    }
    posA.needsUpdate = true; colA.needsUpdate = true; sclA.needsUpdate = true;
    if (pts.visible !== any) pts.visible = any;
  });

  return createPortal(
    <points ref={ptsRef} frustumCulled={false} raycast={() => null} visible={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[B.position, 3]} />
        <bufferAttribute attach="attributes-color" args={[B.color, 3]} />
        <bufferAttribute attach="attributes-aScale" args={[B.aScale, 1]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.16}
        vertexColors
        map={sprite ?? undefined}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
        onBeforeCompile={onBeforeCompile}
      />
    </points>,
    scene,
  );
}
