'use client';

/**
 * CsmSun — Cascaded Shadow Maps 기반 "태양" (유니티식 그림자 품질).
 *
 * 단일 방향광 그림자맵을 카메라 거리별 cascade(여러 장)로 쪼개, 가까운 영역에 훨씬 촘촘한
 * 그림자를 준다 → 밀폐 공간 이음새 누수/줄무늬가 거의 사라짐. 카메라 추적은 CSM 내장.
 *
 * 제약(단일 태양): CSM은 방향광 하나만 담당. 씬의 다른 방향광(내장 sun·유저 dirlight)은
 * 이중 태양을 막기 위해 빛/그림자를 끈다(매 프레임 traverse). 방향/색/세기는 props 로 받아
 * 유저 dirlight 가 그 값을 결정(상위에서 계산해 전달).
 *
 * 머티리얼: CSM 은 그림자 받는 모든 머티리얼에 setupMaterial() 호출 필요 → 씬을 매 프레임
 * 순회하며 아직 안 한 표준 머티리얼만 1회 셋업(WeakSet 추적). 동적 생성(복셀·캐릭터·스폰)도 커버.
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { CSM } from 'three/examples/jsm/csm/CSM.js';

type CSMInst = {
  lights: THREE.DirectionalLight[];
  lightDirection: THREE.Vector3;
  fade: boolean;
  update: () => void;
  updateFrustums: () => void;
  setupMaterial: (m: THREE.Material) => void;
  remove: () => void;
  dispose: () => void;
};

/** dirlight 오브젝트의 회전 → 태양 shine 방향벡터 (기본 오프셋 (0.5,-1,0.5) 을 회전). */
export function computeSunDir(rotation: [number, number, number]): [number, number, number] {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation[0], rotation[1], rotation[2], 'XYZ'));
  const v = new THREE.Vector3(0.5, -1, 0.5).applyQuaternion(q).normalize();
  return [v.x, v.y, v.z];
}

function isCsmMaterial(m: THREE.Material): boolean {
  const mm = m as THREE.Material & {
    isMeshStandardMaterial?: boolean; isMeshPhysicalMaterial?: boolean;
    isMeshPhongMaterial?: boolean; isMeshLambertMaterial?: boolean;
  };
  return !!(mm.isMeshStandardMaterial || mm.isMeshPhysicalMaterial || mm.isMeshPhongMaterial || mm.isMeshLambertMaterial);
}

export function CsmSun({
  direction, color = '#ffffff', intensity = 1,
  cascades = 4, shadowMapSize = 2048, maxFar = 120,
}: {
  direction: [number, number, number];
  color?: string;
  intensity?: number;
  cascades?: number;
  shadowMapSize?: number;
  maxFar?: number;
}) {
  const scene = useThree(s => s.scene);
  const camera = useThree(s => s.camera);
  const csmRef = useRef<CSMInst | null>(null);
  const setupRef = useRef<WeakSet<THREE.Material>>(new WeakSet());
  const ownRef = useRef<Set<THREE.Object3D>>(new Set());

  // CSM 생성/파기 — camera·cascade·해상도 바뀔 때만 재생성
  useEffect(() => {
    const dir = new THREE.Vector3(...direction);
    if (dir.lengthSq() < 1e-6) dir.set(0.5, -1, 0.5);
    dir.normalize();
    const csm = new CSM({
      maxFar, cascades, mode: 'practical', parent: scene, shadowMapSize,
      lightDirection: dir, lightIntensity: intensity, camera, lightMargin: 100,
      shadowBias: -0.0002,
    }) as unknown as CSMInst;
    csm.fade = true;   // cascade 경계 부드럽게 블렌딩 — 안 켜면 가까운/먼 cascade 경계에 가로 이음새가 보임
    // normalBias — CSM 기본 bias(0.000001)는 너무 낮아 빛을 향한 grazing 면에 acne(지글거림)가 생김.
    // 표면 법선 방향 오프셋으로 self-shadow 지글거림 제거. (CSM 생성자엔 normalBias 옵션 없어 직접 세팅)
    for (const l of csm.lights) {
      l.color.set(color); l.intensity = intensity;
      l.shadow.normalBias = 0.05;
      ownRef.current.add(l);
    }
    csmRef.current = csm;
    setupRef.current = new WeakSet();
    return () => {
      try { csm.remove(); } catch { /* noop */ }
      try { csm.dispose(); } catch { /* noop */ }
      csmRef.current = null;
      ownRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, camera, cascades, shadowMapSize, maxFar]);

  // 방향/색/세기 변경 반영 (재생성 없이)
  useEffect(() => {
    const csm = csmRef.current; if (!csm) return;
    const dir = new THREE.Vector3(...direction);
    if (dir.lengthSq() > 1e-6) { dir.normalize(); csm.lightDirection.copy(dir); csm.updateFrustums(); }
    for (const l of csm.lights) { l.color.set(color); l.intensity = intensity; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction[0], direction[1], direction[2], color, intensity]);

  useFrame(() => {
    const csm = csmRef.current; if (!csm) return;
    const own = ownRef.current;
    const setup = setupRef.current;
    scene.traverse((o) => {
      const asLight = o as THREE.DirectionalLight;
      if (asLight.isDirectionalLight && !own.has(o)) {
        // 다른 방향광(내장/유저) 억제 — CSM 이 유일 태양 (이중 태양·중복 그림자 방지)
        if (asLight.intensity !== 0) asLight.intensity = 0;
        if (asLight.castShadow) asLight.castShadow = false;
        return;
      }
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        if (mat && isCsmMaterial(mat) && !setup.has(mat)) {
          try { csm.setupMaterial(mat); } catch { /* noop */ }
          setup.add(mat);
        }
      }
    });
    csm.update();
  });

  return null;
}
