'use client';
/**
 * 배치 모드 고스트 mesh — Canvas (react-three-fiber) 안에서 렌더링.
 *
 * 매 프레임 localPoseRef 읽어서 캐릭터 forward 2.5m 위치 갱신.
 * 각 part 는 root group 하위 — local 위치/회전 그대로 적용.
 * 펄스 애니메이션 + 반투명 + emissive 로 "여기 생성됩니다" 느낌.
 */
import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlacementGhost } from '@/lib/world/placementGhost';

const DIST = 2.5;

export function PlacementGhostMesh({ ghost, localPoseRef }: {
  ghost: PlacementGhost;
  localPoseRef: React.MutableRefObject<{ x: number; y: number; z: number; rotY: number }> | undefined;
}) {
  const rootRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const _fwd = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }) => {
    const g = rootRef.current;
    if (!g) return;
    // 카메라 forward (수평만) 기반 — 캐릭터 rotY 가 아니라 카메라가 바라보는 방향을 따라가서
    // 마우스만 움직여도 즉시 ghost 위치 갱신됨 (1인칭/3인칭 모두). VRChat/FPS 식.
    _fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
    else _fwd.normalize();
    const yaw = Math.atan2(_fwd.x, _fwd.z) + Math.PI;  // forward yaw (ALP: forward = (sin, cos))
    // 위치: 캐릭터 발 높이 유지 + 카메라 forward 2.5m. 캐릭터 pose 가 없으면 카메라 위치 사용 (fallback).
    const p = localPoseRef?.current;
    const baseX = p?.x ?? camera.position.x;
    const baseY = p?.y ?? camera.position.y - 1.6;
    const baseZ = p?.z ?? camera.position.z;
    g.position.set(baseX + _fwd.x * DIST, baseY, baseZ + _fwd.z * DIST);
    g.rotation.y = ghost.faceCamera ? yaw + Math.PI : yaw;
    // 펄스 — 1.0 ~ 1.08 scale 진동 (시각적 신호)
    const pulse = 1.0 + Math.sin(clock.elapsedTime * 4) * 0.04;
    g.scale.setScalar(pulse);
  });

  return (
    <group ref={rootRef}>
      {ghost.parts.map((part, i) => (
        <GhostPartMesh key={i} part={part} />
      ))}
    </group>
  );
}

function GhostPartMesh({ part }: { part: PlacementGhost['parts'][number] }) {
  const color = part.color;

  // 공통 머티리얼 props — 반투명 + emissive
  const matProps = {
    color,
    emissive: color,
    emissiveIntensity: 0.4,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  };

  // wireframe 외곽 — 모양 강조
  const wireMatProps = {
    color,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  };

  let geometry: React.ReactNode;
  let wireGeometry: React.ReactNode = null;

  switch (part.shape) {
    case 'sphere':
      geometry = <sphereGeometry args={[0.5, 24, 16]} />;
      wireGeometry = <sphereGeometry args={[0.51, 16, 12]} />;
      break;
    case 'cylinder':
      geometry = <cylinderGeometry args={[0.5, 0.5, 1, 24]} />;
      wireGeometry = <cylinderGeometry args={[0.51, 0.51, 1.02, 16]} />;
      break;
    case 'plane':
      geometry = <planeGeometry args={[1, 1]} />;
      wireGeometry = <planeGeometry args={[1.01, 1.01]} />;
      break;
    case 'asset':
      // 실제 모델 로드 X — wireframe box 로 bounding 표시
      geometry = <boxGeometry args={[1, 1, 1]} />;
      wireGeometry = <boxGeometry args={[1.02, 1.02, 1.02]} />;
      break;
    case 'box':
    default:
      geometry = <boxGeometry args={[1, 1, 1]} />;
      wireGeometry = <boxGeometry args={[1.02, 1.02, 1.02]} />;
      break;
  }

  return (
    <group position={part.localPos} rotation={part.localRot} scale={part.scale}>
      {/* 채워진 반투명 — 본체 */}
      <mesh renderOrder={9998}>
        {geometry}
        <meshStandardMaterial {...matProps} side={part.shape === 'plane' ? THREE.DoubleSide : THREE.FrontSide} />
      </mesh>
      {/* wireframe 외곽 — 모양 강조 */}
      {wireGeometry && (
        <mesh renderOrder={9999}>
          {wireGeometry}
          <meshBasicMaterial {...wireMatProps} wireframe side={part.shape === 'plane' ? THREE.DoubleSide : THREE.FrontSide} />
        </mesh>
      )}
    </group>
  );
}
