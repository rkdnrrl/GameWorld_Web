'use client';
/**
 * Terrain 조각(sculpt) 메시 — 유니티/언리얼식 브러시로 지형 올리고/내리기.
 * 스튜디오 편집 모드에서 터레인 도구가 활성일 때 TerrainMesh 대신 렌더된다.
 *
 * 동작: 메시 위 포인터 드래그 → hit 지점 중심 반경(radius) 안 정점들의 높이를 brush 로 수정.
 *  - raise/lower: ± strength * falloff
 *  - flatten: 드래그 시작점 높이로 평탄화
 *  - smooth: 주변 평균으로 부드럽게
 * 라이브로 geometry 를 직접 mutate(반응 빠름), 드래그 끝나면 onCommit(heights) 로 데이터 저장.
 */
import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { type ThreeEvent } from '@react-three/fiber';
import { normalizeTerrain, type TerrainData } from './terrain';

export type TerrainTool = 'raise' | 'lower' | 'smooth' | 'flatten';

interface Props {
  terrain: TerrainData;
  /** 터레인 오브젝트의 월드 위치 (그룹 변환). 브러시 좌표 변환에 사용. */
  worldPos: [number, number, number];
  tool: TerrainTool;
  /** 브러시 반경 (m). */
  radius: number;
  /** 브러시 세기 (이벤트당 높이 변화 m). */
  strength: number;
  /** 드래그 끝나면 수정된 heights 배열 전달 (데이터 저장). */
  onCommit: (heights: number[]) => void;
  /** 드래그 시작/종료 알림 — OrbitControls 등 비활성화용. */
  onActiveChange?: (active: boolean) => void;
}

export function TerrainSculptMesh({ terrain, worldPos, tool, radius, strength, onCommit, onActiveChange }: Props) {
  const t = normalizeTerrain(terrain);
  // 작업용 높이 복사본 — geom 의 정점 index 와 1:1.
  const heightsRef = useRef<number[]>(t.heights.slice());
  // terrain 데이터가 바뀌면(다른 도구 커밋 등) 복사본 동기화.
  useEffect(() => { heightsRef.current = normalizeTerrain(terrain).heights.slice(); }, [terrain]);

  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(t.size, t.size, t.segments, t.segments);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, heightsRef.current[i] ?? 0);
    pos.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.size, t.segments]);
  useEffect(() => () => { geom.dispose(); }, [geom]);

  const dragging = useRef(false);

  // 브러시 1회 적용 — hit 월드 지점 중심.
  const applyBrush = (worldX: number, worldZ: number) => {
    const pos = geom.attributes.position as THREE.BufferAttribute;
    const heights = heightsRef.current;
    const r2 = radius * radius;
    const sign = tool === 'lower' ? -1 : 1;

    // flatten: 드래그 시작점(중심) 높이를 타깃으로. smooth: 영향 정점 평균.
    let target = 0; let avgSum = 0; let avgCount = 0;
    const affected: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const vx = worldPos[0] + pos.getX(i);
      const vz = worldPos[2] - pos.getY(i);   // plane y → world -z (mesh -90° X 회전)
      const dx = vx - worldX, dz = vz - worldZ;
      const d2 = dx * dx + dz * dz;
      if (d2 > r2) continue;
      affected.push(i);
      const h = heights[i] ?? 0;
      avgSum += h; avgCount += 1;
    }
    if (affected.length === 0) return;
    if (tool === 'smooth') target = avgSum / avgCount;
    if (tool === 'flatten') {
      // 중심에 가장 가까운 정점 높이를 타깃으로
      let best = -1, bestD = Infinity;
      for (let k = 0; k < affected.length; k++) {
        const i = affected[k];
        const vx = worldPos[0] + pos.getX(i);
        const vz = worldPos[2] - pos.getY(i);
        const d = (vx - worldX) ** 2 + (vz - worldZ) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
      target = heights[best] ?? 0;
    }

    for (let k = 0; k < affected.length; k++) {
      const i = affected[k];
      const vx = worldPos[0] + pos.getX(i);
      const vz = worldPos[2] - pos.getY(i);
      const dist = Math.sqrt((vx - worldX) ** 2 + (vz - worldZ) ** 2);
      const fall = 1 - dist / radius;          // 가장자리 0, 중심 1
      const falloff = fall * fall * (3 - 2 * fall);   // smoothstep
      let h = heights[i] ?? 0;
      if (tool === 'raise' || tool === 'lower') h += sign * strength * falloff;
      else h += (target - h) * Math.min(1, strength * 2) * falloff;   // smooth/flatten: 타깃으로 보간
      heights[i] = h;
      pos.setZ(i, h);
    }
    pos.needsUpdate = true;
    geom.computeVertexNormals();
  };

  const handleDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    dragging.current = true;
    onActiveChange?.(true);
    try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch { /* noop */ }
    applyBrush(e.point.x, e.point.z);
  };
  const handleMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return;
    e.stopPropagation();
    applyBrush(e.point.x, e.point.z);
  };
  const endDrag = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return;
    dragging.current = false;
    onActiveChange?.(false);
    try { (e.target as Element).releasePointerCapture?.(e.pointerId); } catch { /* noop */ }
    onCommit(heightsRef.current.slice());
  };

  const texture = useMemo(() => {
    if (!t.textureUrl) return null;
    const tex = new THREE.TextureLoader().load(t.textureUrl);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(Math.max(1, t.textureRepeat ?? 8), Math.max(1, t.textureRepeat ?? 8));
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [t.textureUrl, t.textureRepeat]);
  useEffect(() => () => { texture?.dispose(); }, [texture]);

  return (
    <mesh
      geometry={geom}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={endDrag}
    >
      <meshStandardMaterial map={texture ?? undefined} color={t.baseColor || '#5a8a4a'} roughness={0.95} metalness={0} />
    </mesh>
  );
}
