'use client';
/**
 * Performance Manager — 매 N프레임 scene 을 traverse 해 distance culling 적용.
 *
 * 동작:
 *  - cullDistance > 0 일 때만 활성. 카메라에서 그 거리 너머의 Mesh/SkinnedMesh 를 visible=false.
 *  - userData.alpNoCull = true 면 옵트아웃 (UI gizmo, debug helper 등이 직접 표시).
 *  - 자체 토글한 mesh 만 자기가 풀어줌 (alpCulled flag 로 표시) — 다른 코드의 visible 토글과 충돌 X.
 *
 * 트레이드오프:
 *  - 매 8 프레임 (~7.5Hz @60fps) 거리 재계산 — 거리 변화에 약간 늦게 반응 (한 두 프레임).
 *  - distance 임계 근처에서 깜빡임 가능 (히스테리시스 마진 5%).
 *  - mesh 위치가 group/parent 안에서 매우 빠르게 변하면 culling 이 살짝 지각.
 */
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

export function PerfManager({ cullDistance }: { cullDistance: number }) {
  const frameRef = useRef(0);
  const tmp = useRef(new THREE.Vector3());

  useFrame((state) => {
    if (cullDistance <= 0) return;
    // 매 8 프레임만 traverse — 거리 계산 비용 절감
    frameRef.current = (frameRef.current + 1) & 7;
    if (frameRef.current !== 0) return;

    const onCutoff  = cullDistance * cullDistance;            // 보일 한계 (cullDistance 안이면 보임)
    const offCutoff = (cullDistance * 1.05) ** 2;             // 히스테리시스 — 임계 근처 깜빡임 방지
    const cam = state.camera.position;
    const v = tmp.current;

    state.scene.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (!m.isMesh && !(m as unknown as THREE.SkinnedMesh).isSkinnedMesh) return;
      if (obj.userData.alpNoCull) return;
      obj.getWorldPosition(v);
      const d2 = v.distanceToSquared(cam);
      const culled = obj.userData.alpCulled === true;
      if (!culled && d2 > offCutoff) {
        // 처음 cull — 원래 visible 백업 후 숨김
        obj.userData.alpCulled = true;
        obj.userData.alpVisBackup = obj.visible;
        obj.visible = false;
      } else if (culled && d2 <= onCutoff) {
        // 풀기 — 백업된 visible 복원
        obj.userData.alpCulled = false;
        obj.visible = obj.userData.alpVisBackup !== false;
      }
    });
  });

  return null;
}
