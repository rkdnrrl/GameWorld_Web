'use client';

/**
 * VoxelTerrainMesh — 복셀 밀도장(VoxelVolumeData)을 마칭큐브 메시로 렌더.
 * 아스트로니어식 변형 지형. RigidBody colliders="trimesh" 안에 넣으면 걸어다님.
 *
 * 지오메트리는 base(시드) + deforms 로부터 재생성. deforms 가 바뀌면(파기/쌓기) 다시 메시.
 */

import { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createField, fieldToGeometry, type VoxelVolumeData } from './voxelVolume';

export function buildVoxelGeometry(data: VoxelVolumeData): THREE.BufferGeometry {
  const field = createField(data);
  const mc = fieldToGeometry(field, data);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(mc.positions, 3));
  geo.computeVertexNormals();
  return geo;
}

/** 재메시 트리거용 키 — 이 값이 바뀌면 지오메트리 재생성. */
function voxelKey(d: VoxelVolumeData): string {
  return `${d.res}|${d.size}|${d.seed}|${d.base}|${d.ground ?? 0}|${d.amp ?? 0}|${d.deforms.length}`;
}

export function VoxelTerrainMesh({
  data, color = '#7a6b55', roughness = 0.95, castShadow = true, receiveShadow = true,
}: {
  data: VoxelVolumeData;
  color?: string;
  roughness?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const key = voxelKey(data);
  const geometry = useMemo(() => buildVoxelGeometry(data), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const prev = useRef<THREE.BufferGeometry | null>(null);
  useEffect(() => {
    const old = prev.current;
    prev.current = geometry;
    return () => { if (old && old !== geometry) old.dispose(); };
  }, [geometry]);
  useEffect(() => () => { if (prev.current) prev.current.dispose(); }, []);

  return (
    <mesh geometry={geometry} castShadow={castShadow} receiveShadow={receiveShadow}>
      <meshStandardMaterial color={color} roughness={roughness} metalness={0} />
    </mesh>
  );
}
