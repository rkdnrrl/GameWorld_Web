'use client';
/**
 * 하늘 분위기 공통 요소 — 거리 안개 + 구름 + 태양 위치.
 * World/Studio 양쪽 Canvas 에서 동일하게 써서 WYSIWYG 유지.
 *
 *  - SceneFog: scene.fog 에 옅은 FogExp2 — 지형 가장자리·원경을 하늘색으로 녹여 깊이감.
 *  - SkyClouds: drei 볼류메트릭 구름 몇 점 (가벼운 빌보드).
 *  - skySunPosition: dirlight 회전 → Sky 태양 위치(빛 방향의 반대). 그림자와 태양 글로우 일치.
 *
 * 셋 다 야외(showSky)일 때만 호출되도록 호출 측에서 게이팅한다.
 */
import React, { useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { Clouds, Cloud } from '@react-three/drei';
import { computeSunDir } from './CsmSun';

/** dirlight 회전(있으면) → Sky 태양 위치. 빛이 나아가는 방향의 반대편이 태양. 없으면 기본 오전 햇살. */
export function skySunPosition(dirlightRotation?: [number, number, number]): [number, number, number] {
  if (!dirlightRotation) return [20, 10, 10];
  const d = computeSunDir(dirlightRotation);
  return [-d[0] * 100, -d[1] * 100, -d[2] * 100];
}

/** 전역 거리 안개 — 마운트 동안만 scene.fog 설정, 언마운트 시 원복(수중 PostFX 등과 충돌 없음). */
export function SceneFog({ color = '#cfe8f5', density = 0.0022 }: { color?: string; density?: number }) {
  const { scene } = useThree();
  useEffect(() => {
    const prev = scene.fog;
    // three 씬 변이는 표준 패턴(언마운트 시 원복). react-compiler immutability 규칙만 예외.
    // eslint-disable-next-line react-hooks/immutability
    scene.fog = new THREE.FogExp2(new THREE.Color(color), density);
    return () => { scene.fog = prev; };
  }, [scene, color, density]);
  return null;
}

/** 하늘 구름 — 빛 영향 없는 흰 빌보드(MeshBasicMaterial)라 태양 강도와 무관하게 항상 밝음. */
export function SkyClouds() {
  return (
    <Clouds material={THREE.MeshBasicMaterial} frustumCulled={false}>
      <Cloud seed={1} segments={24} bounds={[80, 6, 80]} volume={26} smallestVolume={0.4}
        position={[12, 46, -24]} color="#ffffff" opacity={0.5} speed={0.16} growth={6} />
      <Cloud seed={7} segments={18} bounds={[70, 5, 70]} volume={20} smallestVolume={0.4}
        position={[-44, 54, 28]} color="#eef4fb" opacity={0.42} speed={0.11} growth={5} />
    </Clouds>
  );
}
