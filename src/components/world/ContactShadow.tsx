'use client';
/**
 * 접지 그림자(블롭) — 캐릭터 발밑에 부드러운 원형 어둠 데칼을 깔아 "땅에 붙은" 느낌을 준다.
 *
 * 실제 방향광 그림자/컬링과 무관하게 항상 접지감을 보장(원격 플레이어가 떠 보이는 문제에 특히 효과적).
 * 월드 공간이어야(캐릭터 그룹의 scale/offsetY 안 물려야) 해서 createPortal 로 scene 에 직접 띄운다.
 *
 * 점프/낙하 중에는 마지막 접지 Y 에 그림자를 남기고 높이에 따라 옅게+살짝 크게(공중 그림자처럼).
 */
import { useMemo, useRef } from 'react';
import { useFrame, useThree, createPortal } from '@react-three/fiber';
import * as THREE from 'three';
import { footstepWet } from '@/lib/world/waterRegistry';

const BASE_OPACITY = 0.42;
const BASE_RADIUS = 0.34;   // m (userScale=1 기준)
const FADE_H = 2.0;         // 이 높이(m)에서 완전히 사라짐

let _sprite: THREE.Texture | null = null;
function blobSprite(): THREE.Texture | null {
  if (_sprite) return _sprite;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.4)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  _sprite = tex;
  return tex;
}

export function ContactShadow({ groupRef, animStateRef, userScale = 1 }: {
  groupRef: React.RefObject<THREE.Group | null>;
  animStateRef: React.RefObject<string>;
  userScale?: number;
}) {
  const scene = useThree(s => s.scene);
  const meshRef = useRef<THREE.Mesh>(null);
  const sprite = useMemo(blobSprite, []);
  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);   // 수평 (땅에 누움)
    return g;
  }, []);
  const _wp = useMemo(() => new THREE.Vector3(), []);
  const groundY = useRef(0);
  const seeded = useRef(false);

  useFrame(() => {
    const m = meshRef.current;
    const g = groupRef.current;
    if (!m || !g) return;
    g.getWorldPosition(_wp);
    const st = animStateRef.current || '';
    const airborne = /^(jump|fall)/.test(st);
    if (!airborne || !seeded.current) { groundY.current = _wp.y; seeded.current = true; }
    const height = Math.max(0, _wp.y - groundY.current);
    const t = Math.min(1, height / FADE_H);
    const mat = m.material as THREE.MeshBasicMaterial;
    // 물 위/속이면 숨김(검은 디스크가 수면에 뜬 것처럼 보임)
    const wet = footstepWet(_wp.x, groundY.current, _wp.z);
    mat.opacity = wet ? 0 : BASE_OPACITY * (1 - t);
    const visible = mat.opacity > 0.01;
    if (m.visible !== visible) m.visible = visible;
    if (!visible) return;
    const r = BASE_RADIUS * userScale * (2 + t);   // 지름; 공중일수록 살짝 커짐
    m.scale.set(r, 1, r);
    m.position.set(_wp.x, groundY.current + 0.02, _wp.z);
  });

  return createPortal(
    <mesh ref={meshRef} geometry={geom} frustumCulled={false} raycast={() => null} renderOrder={-1} visible={false}>
      <meshBasicMaterial
        map={sprite ?? undefined}
        transparent
        opacity={BASE_OPACITY}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
        color="#000000"
      />
    </mesh>,
    scene,
  );
}
