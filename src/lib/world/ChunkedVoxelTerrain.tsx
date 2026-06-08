'use client';

/**
 * ChunkedVoxelTerrain — 복셀 지형을 청크로 쪼개 렌더 (성능 4단계 + 웹워커).
 * 메싱은 voxelMesher(웹워커 또는 동기 폴백)에서 수행 → 메인스레드 블로킹 없음.
 * 파기/쌓기 시 영향받은 청크만 비동기로 재메시 + 그 청크 trimesh 콜라이더만 재빌드.
 *
 * 청크별 RigidBody 를 직접 렌더 (바깥 RigidBody 없이 단독 사용).
 * 모든 청크는 동일한 오브젝트 transform 공유, 메시 정점만 청크별로 다름(오브젝트 로컬).
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RigidBody } from '@react-three/rapier';
import { voxelMesher } from './voxelMesher';
import type { VoxelVolumeData } from './voxelVolume';
import type { MeshChunk } from './voxelChunker';

type Tri = [number, number, number];
type Slot = { geo: THREE.BufferGeometry; ver: number } | undefined;

function geoFromChunk(mc: MeshChunk): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(mc.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(mc.normals, 3));   // 밀도장 그래디언트 법선
  g.setAttribute('color', new THREE.BufferAttribute(mc.colors, 3));     // 깊이별 층 색
  return g;
}

export function ChunkedVoxelTerrain({
  objectId, data, position, rotation, scale, roughness = 0.95,
}: {
  objectId: string;
  data: VoxelVolumeData;
  position: Tri;
  rotation: Tri;
  scale: Tri;
  color?: string;     // (호환용 — 색은 깊이별 팔레트가 결정)
  roughness?: number;
}) {
  const [chunks, setChunks] = useState<Slot[]>([]);
  const chunksRef = useRef<Slot[]>([]);
  chunksRef.current = chunks;
  const appliedRef = useRef(0);
  const baseKeyRef = useRef('');

  const baseKey = `${data.res}|${data.size}|${data.seed}|${data.base}|${data.ground ?? 0}|${data.amp ?? 0}|${(data.palette ?? []).join(',')}`;
  const depKey = `${baseKey}|${data.deforms.length}`;

  // 도착한 청크들을 state 에 병합 (idx 위치에 배치, 이전 지오메트리 dispose)
  function mergeChunks(mcs: MeshChunk[]) {
    setChunks(prev => {
      const next = prev.slice();
      for (const mc of mcs) {
        const old = next[mc.idx];
        old?.geo.dispose();
        next[mc.idx] = { geo: geoFromChunk(mc), ver: (old?.ver ?? 0) + 1 };
      }
      return next;
    });
  }

  useEffect(() => {
    // base 파라미터 변경 → 전체 (재)생성
    if (baseKeyRef.current !== baseKey) {
      baseKeyRef.current = baseKey;
      appliedRef.current = data.deforms.length;
      setChunks(prev => { prev.forEach(c => c?.geo.dispose()); return []; });
      voxelMesher.init(objectId, data, mergeChunks);
      return;
    }
    // 증분: 새 변형만 워커로 전송 → 닿은 청크만 비동기 재메시
    if (data.deforms.length > appliedRef.current) {
      for (let i = appliedRef.current; i < data.deforms.length; i++) {
        voxelMesher.deform(objectId, data.deforms[i]);
      }
      appliedRef.current = data.deforms.length;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey]);

  // 언마운트 — 워커 밀도장 해제 + 지오메트리 정리
  useEffect(() => () => {
    voxelMesher.dispose(objectId);
    chunksRef.current.forEach(c => c?.geo.dispose());
  }, [objectId]);

  return (
    <>
      {chunks.map((ch, idx) => (ch && ch.geo.attributes.position && ch.geo.attributes.position.count > 0) ? (
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
