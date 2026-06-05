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
    // 카메라 시선 3D forward — pitch 포함. 카메라가 위/아래 봐도 ghost 가 따라감 (크로스헤어 위치).
    _fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
    else _fwd.normalize();
    // 위치: 카메라 위치 + 시선 방향 2.5m (크로스헤어 정확히).
    g.position.copy(camera.position).addScaledVector(_fwd, DIST);
    // 회전은 yaw 만 (수평 방향) — 오브젝트가 뒤집어지지 않도록 pitch 무시.
    const fy = _fwd.x === 0 && _fwd.z === 0 ? 0 : Math.atan2(_fwd.x, _fwd.z) + Math.PI;
    g.rotation.y = ghost.faceCamera ? fy + Math.PI : fy;
    // spawn 시점에서 ghost 의 정확한 위치/회전을 읽을 수 있게 ref 에 기록.
    // (faceCamera 보정 전 raw yaw 를 저장 — spawn 코드가 자체 보정)
    if (ghost.poseRef) {
      ghost.poseRef.current = { x: g.position.x, y: g.position.y, z: g.position.z, rotY: fy };
    }
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
