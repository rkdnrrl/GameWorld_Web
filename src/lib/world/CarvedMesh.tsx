'use client';

/**
 * CSG 깎기 메시 — 단위 큐브(1×1×1)에서 절삭 도형들을 불리언 빼기(SUBTRACTION)해서
 * 구멍/홈이 파인 지오메트리를 만든다. cuts 는 단위 큐브 로컬 좌표(중심 0).
 * RigidBody 의 scale 이 실제 크기를 입히므로 여기선 항상 단위 큐브 기준.
 *
 * 사용: <RigidBody colliders="trimesh"><CarvedMesh cuts={...} color=.../></RigidBody>
 */

import { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';

/** 절삭 한 번 — 단위 큐브 로컬 기준. */
export interface CsgCut {
  shape: 'box' | 'sphere' | 'cylinder';
  /** 절삭 도형 중심 (단위 큐브 로컬, 중심 0). */
  pos: [number, number, number];
  /** 절삭 도형 크기 (지름/한 변). */
  size: [number, number, number];
  /** 회전 (라디안, 선택). */
  rot?: [number, number, number];
}

const _evaluator = new Evaluator();

/** cuts 로 깎인 BufferGeometry 생성. 호출부에서 dispose 책임. */
export function buildCarvedGeometry(cuts: CsgCut[]): THREE.BufferGeometry {
  let result = new Brush(new THREE.BoxGeometry(1, 1, 1));
  result.updateMatrixWorld();
  for (const cut of cuts) {
    let g: THREE.BufferGeometry;
    if (cut.shape === 'sphere')        g = new THREE.SphereGeometry(0.5, 20, 14);
    else if (cut.shape === 'cylinder') g = new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
    else                               g = new THREE.BoxGeometry(1, 1, 1);
    const tool = new Brush(g);
    tool.position.set(cut.pos[0], cut.pos[1], cut.pos[2]);
    tool.scale.set(Math.max(0.01, cut.size[0]), Math.max(0.01, cut.size[1]), Math.max(0.01, cut.size[2]));
    if (cut.rot) tool.rotation.set(cut.rot[0], cut.rot[1], cut.rot[2]);
    tool.updateMatrixWorld();
    const next = _evaluator.evaluate(result, tool, SUBTRACTION);
    result = next;
    g.dispose();
  }
  result.geometry.computeVertexNormals();
  return result.geometry;
}

export function CarvedMesh({
  cuts, color = '#ffffff', roughness = 0.7, metalness = 0, castShadow = true, receiveShadow = true,
}: {
  cuts: CsgCut[];
  color?: string;
  roughness?: number;
  metalness?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const geometry = useMemo(() => buildCarvedGeometry(cuts), [cuts]);
  const prevGeo = useRef<THREE.BufferGeometry | null>(null);
  // geometry 교체 시 이전 것 dispose (메모리 누수 방지)
  useEffect(() => {
    const old = prevGeo.current;
    prevGeo.current = geometry;
    return () => { if (old && old !== geometry) old.dispose(); };
  }, [geometry]);
  useEffect(() => () => { if (prevGeo.current) prevGeo.current.dispose(); }, []);

  return (
    <mesh geometry={geometry} castShadow={castShadow} receiveShadow={receiveShadow}>
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
    </mesh>
  );
}
