'use client';
/**
 * 발자국 먼지 — 캐릭터가 걷기/달리기 중일 때 발밑에 작은 먼지 퍼프를 피움.
 *
 * 월드 공간이어야(걸어가면 퍼프는 그 자리에 남음) 해서 createPortal 로 scene 에 직접 Points 를 띄운다.
 * HumanoidMesh 안에서 캐릭터 1개당 1풀 — 본인·원격·World·Studio 모두 자동 적용.
 *
 * 움직임 감지: animStateRef('walk_*' / 'run_*') 폴링. 케이던스로 좌/우 발 교대 방출.
 * additive 블렌딩 — 알파를 색 페이드로 처리(투명도 어트리뷰트 없이 단순). 흙먼지 톤.
 */
import { useCallback, useMemo, useRef } from 'react';
import { useFrame, useThree, createPortal } from '@react-three/fiber';
import * as THREE from 'three';
import { sfxStep } from '@/lib/world/sfx';

const N = 20;  // 퍼프 풀 크기

let _sprite: THREE.Texture | null = null;
function dustSprite(): THREE.Texture | null {
  if (_sprite) return _sprite;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _sprite = tex;
  return tex;
}

export function FootstepDust({ groupRef, animStateRef, userScale = 1 }: {
  groupRef: React.RefObject<THREE.Group | null>;
  animStateRef: React.RefObject<string>;
  userScale?: number;
}) {
  const scene = useThree(s => s.scene);
  const camera = useThree(s => s.camera);
  const ptsRef = useRef<THREE.Points>(null);
  const sprite = useMemo(dustSprite, []);
  const DUST = useMemo(() => new THREE.Color('#cdbb9a'), []);
  const _wp = useMemo(() => new THREE.Vector3(), []);

  // 풀 상태 — 어트리뷰트(position/color/aScale) + 퍼프별 메타(emit 위치·수명·상승속도)
  const B = useMemo(() => ({
    position: new Float32Array(N * 3),
    color: new Float32Array(N * 3),
    aScale: new Float32Array(N),
    emit: new Float32Array(N * 3),
    base: new Float32Array(N),
    age: new Float32Array(N).fill(1e9),
    life: new Float32Array(N).fill(1),
    vy: new Float32Array(N),
  }), []);
  const emitTimer = useRef(0);
  const cursor = useRef(0);
  const footSide = useRef(1);

  // PointsMaterial 의 size 는 전역 — per-puff aScale 로 곱해 크기 다양화.
  const onBeforeCompile = useCallback((sh: THREE.WebGLProgramParametersWithUniforms) => {
    sh.vertexShader = 'attribute float aScale;\n' + sh.vertexShader.replace(
      'gl_PointSize = size;', 'gl_PointSize = size * aScale;',
    );
  }, []);

  useFrame((_, dt) => {
    const pts = ptsRef.current;
    if (!pts) return;
    const d = Math.min(dt, 0.05);
    const g = groupRef.current;
    const st = animStateRef.current || '';
    const moving = /^(walk|run)/.test(st);

    // ── 방출 ──
    if (moving && g) {
      const running = st.startsWith('run');
      emitTimer.current += d;
      const interval = running ? 0.26 : 0.42;
      if (emitTimer.current >= interval) {
        emitTimer.current = 0;
        g.getWorldPosition(_wp);
        footSide.current = -footSide.current;
        const i = cursor.current; cursor.current = (cursor.current + 1) % N;
        const k = i * 3;
        B.emit[k] = _wp.x + footSide.current * 0.12 * userScale;
        B.emit[k + 1] = _wp.y + 0.03;
        B.emit[k + 2] = _wp.z;
        B.age[i] = 0;
        B.life[i] = running ? 0.5 : 0.65;
        B.base[i] = (running ? 1.5 : 1.1) * userScale;
        B.vy[i] = 0.35 * userScale;
        // 발소리 — 카메라 거리로 볼륨 감쇠(로컬=가까움→큼, 원격=멀수록 작음)
        const dist = _wp.distanceTo(camera.position);
        const vol = Math.max(0, 1 - dist / 18);
        if (vol > 0.02) sfxStep({ volume: vol, running });
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
      pa[k] = B.emit[k];
      pa[k + 1] = B.emit[k + 1] + B.vy[i] * B.age[i];   // 위로 천천히 상승
      pa[k + 2] = B.emit[k + 2];
      const alpha = (1 - t) * 0.45;                       // 페이드아웃 (additive → 색으로 알파)
      sa[i] = B.base[i] * (0.6 + t * 1.8);                // 점점 커짐
      ca[k] = DUST.r * alpha; ca[k + 1] = DUST.g * alpha; ca[k + 2] = DUST.b * alpha;
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
        size={0.18}
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
