'use client';
/**
 * Flashlight 컴포넌트 런타임 — 오브젝트에 부착된 spotlight.
 *
 * followCamera 가 true 이고 obj 를 본인이 1인칭으로 잡고 있으면 → 카메라 위치/forward 사용.
 * 아니면 오브젝트 group 위치 + forward(+Z) 사용 (그룹 회전 적용).
 *
 * on 토글 — 인스펙터에서 끄면 빛 안 나옴. 스크립트로 self.setIntensity(0) 가능.
 */
import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { ComponentInstance } from './components';

interface Props {
  comp: ComponentInstance;
  /** 부착된 오브젝트의 group ref — 위치/회전 source */
  groupRef: React.MutableRefObject<THREE.Group | null>;
  /** obj id + grab 상태 검색 — 매 프레임 체크. 본인이 1인칭으로 잡으면 카메라 follow. */
  objId: string;
  playerId: string;
  grabbedStateRef: React.MutableRefObject<Map<string, string>>;
}

export function FlashlightLight({ comp, groupRef, objId, playerId, grabbedStateRef }: Props) {
  const range     = Number(comp.props?.range ?? 15);
  const angleDeg  = Number(comp.props?.angle ?? 35);
  const intensity = Number(comp.props?.intensity ?? 5);
  const color     = String(comp.props?.color || '#fff5dd');
  const followCam = comp.props?.followCamera !== false;
  const on        = comp.props?.on !== false;

  const lightRef  = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  const { camera, scene } = useThree();

  // light.target 은 scene 에 add 되어야 동작
  useEffect(() => {
    const tgt = targetRef.current;
    if (tgt && !tgt.parent) scene.add(tgt);
    return () => { if (tgt) scene.remove(tgt); };
  }, [scene]);

  const tmpPos = useRef(new THREE.Vector3());
  const tmpFwd = useRef(new THREE.Vector3());

  useFrame(() => {
    const l = lightRef.current;
    const t = targetRef.current;
    if (!l || !t) return;
    if (!on) { l.intensity = 0; return; }
    l.intensity = intensity;
    // 위치/방향 결정 — followCamera + 본인이 1인칭 잡음 → 카메라 follow.
    const grabbedBy = grabbedStateRef.current.get(objId);
    const isGrabbedByMe = grabbedBy === playerId;
    if (followCam && isGrabbedByMe) {
      // 카메라 위치 + 카메라 forward. 손전등 그립 효과 — 카메라 살짝 아래/앞에서 출발.
      camera.getWorldPosition(tmpPos.current);
      camera.getWorldDirection(tmpFwd.current);
      l.position.copy(tmpPos.current).addScaledVector(tmpFwd.current, 0.3);
    } else {
      const g = groupRef.current;
      if (!g) return;
      g.getWorldPosition(tmpPos.current);
      // 그룹 forward(+Z) — three.js 기본 mesh forward 는 -Z 인데 손전등은 +Z 로 가정 (사용자가 회전으로 조정)
      tmpFwd.current.set(0, 0, 1).applyQuaternion(g.getWorldQuaternion(new THREE.Quaternion()));
      l.position.copy(tmpPos.current);
    }
    t.position.copy(tmpPos.current).addScaledVector(tmpFwd.current, range);
    t.updateMatrixWorld();
  });

  return (
    <>
      <spotLight
        ref={lightRef}
        color={color}
        intensity={on ? intensity : 0}
        distance={range}
        angle={(angleDeg * Math.PI) / 180}
        penumbra={0.4}
        decay={1}
        castShadow={false}
      />
      <object3D ref={targetRef} />
    </>
  );
}
