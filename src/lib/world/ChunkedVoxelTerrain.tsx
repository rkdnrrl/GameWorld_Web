'use client';

/**
 * ChunkedVoxelTerrain — 복셀 지형을 청크로 쪼개 렌더 (성능 4단계).
 * 파기/쌓기 시 영향받은 청크만 재메시 + 그 청크의 trimesh 콜라이더만 재빌드.
 *
 * 자체적으로 청크별 RigidBody 를 렌더하므로 바깥 RigidBody 없이 단독 사용.
 * 모든 청크는 동일한 오브젝트 transform(position/rotation/scale)을 공유,
 * 메시 정점만 청크별로 다름(오브젝트 로컬 좌표).
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RigidBody } from '@react-three/rapier';
import {
  createBaseField, applyDeformToField, fieldToGeometry, deformCellRange, type VoxelVolumeData,
} from './voxelVolume';
import { applyVoxelColors } from './VoxelTerrainMesh';

type Tri = [number, number, number];

function chunksPerAxis(res: number): number {
  return Math.max(2, Math.min(6, Math.round(res / 8)));
}

export function ChunkedVoxelTerrain({
  objectId, data, position, rotation, scale, color = '#7a6b55', roughness = 0.95,
}: {
  objectId: string;
  data: VoxelVolumeData;
  position: Tri;
  rotation: Tri;
  scale: Tri;
  color?: string;
  roughness?: number;
}) {
  const CPA = chunksPerAxis(data.res);
  const C = Math.ceil(data.res / CPA);
  const [chunks, setChunks] = useState<{ geo: THREE.BufferGeometry; ver: number }[]>([]);
  const fieldRef = useRef<Float32Array | null>(null);
  const appliedRef = useRef(0);
  const baseKeyRef = useRef('');
  const chunksRef = useRef<{ geo: THREE.BufferGeometry; ver: number }[]>([]);
  chunksRef.current = chunks;
  const cpaRef = useRef(CPA);
  cpaRef.current = CPA;

  // 청크 1개 지오메트리 빌드 (해당 셀 영역만 마칭큐브)
  function buildChunk(field: Float32Array, ci: number, cj: number, ck: number): THREE.BufferGeometry {
    const bounds = {
      x0: ci * C, x1: Math.min(data.res, (ci + 1) * C),
      y0: cj * C, y1: Math.min(data.res, (cj + 1) * C),
      z0: ck * C, z1: Math.min(data.res, (ck + 1) * C),
    };
    const mc = fieldToGeometry(field, data, bounds);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(mc.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(mc.normals, 3));   // 밀도장 그래디언트 법선(청크 경계 매끄러움)
    applyVoxelColors(g, data);
    return g;
  }

  const baseKey = `${data.res}|${data.size}|${data.seed}|${data.base}|${data.ground ?? 0}|${data.amp ?? 0}`;
  const depKey = `${baseKey}|${data.deforms.length}`;

  useEffect(() => {
    // base 파라미터 변경 → 전체 재빌드
    if (baseKeyRef.current !== baseKey) {
      baseKeyRef.current = baseKey;
      const field = createBaseField(data);
      for (const d of data.deforms) applyDeformToField(field, data, d);
      fieldRef.current = field;
      appliedRef.current = data.deforms.length;
      const next: { geo: THREE.BufferGeometry; ver: number }[] = [];
      for (let ck = 0; ck < CPA; ck++)
        for (let cj = 0; cj < CPA; cj++)
          for (let ci = 0; ci < CPA; ci++)
            next.push({ geo: buildChunk(field, ci, cj, ck), ver: 0 });
      setChunks(prev => { prev.forEach(c => c.geo.dispose()); return next; });
      return;
    }
    // 증분: 새로 추가된 변형만 적용 → 닿은 청크만 재메시
    const field = fieldRef.current;
    if (!field || data.deforms.length <= appliedRef.current) return;
    const dirty = new Set<number>();
    for (let i = appliedRef.current; i < data.deforms.length; i++) {
      const d = data.deforms[i];
      applyDeformToField(field, data, d);
      const cr = deformCellRange(data, d);
      const ci0 = Math.max(0, Math.floor(cr.x0 / C)), ci1 = Math.min(CPA - 1, Math.floor((cr.x1 - 1) / C));
      const cj0 = Math.max(0, Math.floor(cr.y0 / C)), cj1 = Math.min(CPA - 1, Math.floor((cr.y1 - 1) / C));
      const ck0 = Math.max(0, Math.floor(cr.z0 / C)), ck1 = Math.min(CPA - 1, Math.floor((cr.z1 - 1) / C));
      for (let ck = ck0; ck <= ck1; ck++)
        for (let cj = cj0; cj <= cj1; cj++)
          for (let ci = ci0; ci <= ci1; ci++)
            dirty.add(ci + cj * CPA + ck * CPA * CPA);
    }
    appliedRef.current = data.deforms.length;
    setChunks(prev => {
      const next = prev.slice();
      for (const idx of dirty) {
        const ck = Math.floor(idx / (CPA * CPA));
        const rem = idx % (CPA * CPA);
        const cj = Math.floor(rem / CPA);
        const ci = rem % CPA;
        const old = next[idx];
        old?.geo.dispose();
        next[idx] = { geo: buildChunk(field, ci, cj, ck), ver: (old?.ver ?? 0) + 1 };
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey]);

  // 언마운트 시 전체 지오메트리 정리 (ref 로 최신 청크 참조 — stale 회피)
  useEffect(() => () => { chunksRef.current.forEach(c => c.geo.dispose()); }, []);

  return (
    <>
      {chunks.map((ch, idx) => (ch.geo.attributes.position && ch.geo.attributes.position.count > 0) ? (
        <RigidBody key={`${objectId}-${idx}-${ch.ver}`} type="fixed" colliders="trimesh"
          userData={{ objectId }} position={position} rotation={rotation} scale={scale}>
          <mesh geometry={ch.geo} castShadow receiveShadow>
            <meshStandardMaterial vertexColors color="#ffffff" roughness={roughness} metalness={0} />
          </mesh>
        </RigidBody>
      ) : null)}
    </>
  );
}
