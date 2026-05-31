'use client';
/**
 * Terrain Mesh — heightmap 기반 plane subdivision 렌더.
 *
 * 정점: (segments+1)x(segments+1). 각 정점에 heights[idx] Y 적용.
 * normal 자동 계산 (computeVertexNormals).
 *
 * Phase 1: 시각 렌더 + 텍스처. 물리(콜라이더)는 Phase 4 에서.
 */
import React, { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { normalizeTerrain, type TerrainData } from './terrain';

interface Props {
  terrain: TerrainData;
  /** 선택 강조 (편집 모드) */
  selected?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

export function TerrainMesh({ terrain, selected, castShadow = false, receiveShadow = true }: Props) {
  const t = normalizeTerrain(terrain);
  const n1 = t.segments + 1;

  // BufferGeometry — heights 변경되면 새로 만듦 (segments 변경, 페인트 등).
  // PlaneGeometry XY 평면 → -Z up. rotation 으로 XZ 평면 만듦.
  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(t.size, t.size, t.segments, t.segments);
    const pos = g.attributes.position as THREE.BufferAttribute;
    // PlaneGeometry 의 vertex 는 row-major 로 (segments+1)x(segments+1).
    // y 축 (PlaneGeometry 의 두 번째 축) → height 로 옮길 z 값.
    // PlaneGeometry는 Z=0 평면, rotation X=-90 후 XZ 평면. 그 전 Z 가 우리 높이.
    for (let i = 0; i < pos.count; i++) {
      pos.setZ(i, t.heights[i] ?? 0);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.size, t.segments, t.heights]);

  useEffect(() => () => { geom.dispose(); }, [geom]);

  // 텍스처 (선택) — UV 반복.
  const texture = useMemo(() => {
    if (!t.textureUrl) return null;
    const tex = new THREE.TextureLoader().load(t.textureUrl);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const r = Math.max(1, t.textureRepeat ?? 8);
    tex.repeat.set(r, r);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [t.textureUrl, t.textureRepeat]);
  useEffect(() => () => { texture?.dispose(); }, [texture]);

  return (
    <mesh
      geometry={geom}
      rotation={[-Math.PI / 2, 0, 0]}   // XZ 평면 (지면)
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      <meshStandardMaterial
        map={texture ?? undefined}
        color={selected ? '#a5b4fc' : (t.baseColor || '#5a8a4a')}
        roughness={0.95}
        metalness={0}
      />
    </mesh>
  );
}
