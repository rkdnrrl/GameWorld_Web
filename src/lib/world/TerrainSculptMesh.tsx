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
import React, { useRef, useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';
import { type ThreeEvent } from '@react-three/fiber';
import { normalizeTerrain, type TerrainData, type FoliageInstance } from './terrain';
import { FoliageInstances } from './FoliageInstances';

export type TerrainTool = 'raise' | 'lower' | 'smooth' | 'flatten' | 'grass' | 'tree' | 'flower' | 'rock' | 'erase';
const FOLIAGE_TOOLS = new Set<TerrainTool>(['grass', 'tree', 'flower', 'rock', 'erase']);
// 흩뿌리기(밀집) vs 간격 배치(드문드문).
const SCATTER_TOOLS = new Set<TerrainTool>(['grass', 'flower']);
const SPACED_TOOLS = new Set<TerrainTool>(['tree', 'rock']);
const TAU = Math.PI * 2;

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
  /** 풀/나무/지우개 도구 — 드래그 끝나면 수정된 foliage 배열 전달. */
  onFoliageCommit?: (foliage: FoliageInstance[]) => void;
  /** 칠할 에셋 variant 인덱스 (foliageAssets[k] 기준). undefined = 위치 해시로 랜덤 선택. */
  variant?: number;
  /** 드래그 시작/종료 알림 — OrbitControls 등 비활성화용. */
  onActiveChange?: (active: boolean) => void;
}

export function TerrainSculptMesh({ terrain, worldPos, tool, radius, strength, onCommit, onFoliageCommit, variant, onActiveChange }: Props) {
  const t = normalizeTerrain(terrain);
  // 작업용 높이 복사본 — geom 의 정점 index 와 1:1.
  const heightsRef = useRef<number[]>(t.heights.slice());
  // terrain 데이터가 바뀌면(다른 도구 커밋 등) 복사본 동기화.
  useEffect(() => { heightsRef.current = normalizeTerrain(terrain).heights.slice(); }, [terrain]);

  // ── 식생(풀/나무) 작업용 복사본 + 라이브 표시 상태 ──
  const foliageRef = useRef<FoliageInstance[]>((terrain.foliage || []).slice());
  const [liveFoliage, setLiveFoliage] = useState<FoliageInstance[]>(foliageRef.current);
  useEffect(() => {
    foliageRef.current = (terrain.foliage || []).slice();
    setLiveFoliage(foliageRef.current);
  }, [terrain]);
  const lastPaintRef = useRef(0);

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
  // 콜백을 ref 로 — 윈도우 리스너에서 항상 최신 호출 (재구독 없이).
  const onCommitRef = useRef(onCommit); onCommitRef.current = onCommit;
  const onFoliageCommitRef = useRef(onFoliageCommit); onFoliageCommitRef.current = onFoliageCommit;
  const onActiveChangeRef = useRef(onActiveChange); onActiveChangeRef.current = onActiveChange;
  const toolRef = useRef(tool); toolRef.current = tool;
  // 도구 종류에 따라 heights or foliage 커밋.
  const commit = () => {
    if (FOLIAGE_TOOLS.has(toolRef.current)) onFoliageCommitRef.current?.(foliageRef.current.slice());
    else onCommitRef.current(heightsRef.current.slice());
  };
  // 윈도우 pointerup — 드래그를 메시 밖에서 떼도(또는 setPointerCapture 실패해도) 반드시 커밋. (취소 버그 수정)
  useEffect(() => {
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      onActiveChangeRef.current?.(false);
      commit();
    };
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => { window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // 식생 페인트 — 풀/꽃 흩뿌리기, 나무/돌 간격 배치, 지우개. hit 월드 지점 → terrain-local 변환 후 적용.
  // 종류별 상한 + 간격(드문드문 배치용) + 크기 변주 범위.
  // 풀·꽃은 InstancedMesh(종류당 1 draw call)라 대량도 가벼움 → 브러시로 계속 심을 수 있게 상한 크게.
  // 나무·돌은 콜라이더+그림자라 무거워 보수적으로 유지.
  const FOL_CAP: Record<string, number> = { grass: 50000, flower: 30000, tree: 400, rock: 300 };
  const FOL_SPACING: Record<string, number> = { tree: 2.2, rock: 1.4 };
  const paintFoliage = (worldX: number, worldZ: number) => {
    const lx0 = worldX - worldPos[0], lz0 = worldZ - worldPos[2];
    const arr = foliageRef.current;
    if (tool === 'erase') {
      const r2 = radius * radius;
      foliageRef.current = arr.filter(f => (f.x - lx0) ** 2 + (f.z - lz0) ** 2 > r2);
      setLiveFoliage(foliageRef.current);
      return;
    }
    // 드래그 중 과다 생성 방지 — 35ms 스로틀.
    const now = Date.now();
    if (now - lastPaintRef.current < 35) return;
    lastPaintRef.current = now;
    const k = tool as 'grass' | 'flower' | 'tree' | 'rock';
    if (arr.filter(f => f.k === k).length >= (FOL_CAP[k] ?? 2000)) return;
    const spaced = SPACED_TOOLS.has(tool);
    const spacing = FOL_SPACING[k] ?? 0;
    // 흩뿌리기는 세기만큼 여러 개, 간격 배치는 한 번에 1개(밀도 게이트로 솎음).
    const count = spaced ? 1 : (k === 'flower' ? Math.max(1, Math.round(strength * 3)) : Math.max(1, Math.round(strength * 6)));
    const sLo = k === 'tree' ? 0.8 : k === 'rock' ? 0.6 : 0.7;
    const sRange = k === 'rock' ? 0.8 : k === 'flower' ? 0.5 : 0.6;
    const added: FoliageInstance[] = [];
    for (let i = 0; i < count; i++) {
      // 브러시 원 안 균일 분포.
      const ang = Math.random() * TAU, rr = Math.sqrt(Math.random()) * radius;
      const lx = lx0 + Math.cos(ang) * rr, lz = lz0 + Math.sin(ang) * rr;
      if (spaced) {
        if (Math.random() > strength) continue; // 밀도 게이트
        const sp2 = spacing * spacing;
        const near = arr.concat(added).some(f => f.k === k && (f.x - lx) ** 2 + (f.z - lz) ** 2 < sp2);
        if (near) continue; // 최소 간격
      }
      added.push({ k, x: lx, z: lz, s: sLo + Math.random() * sRange, r: Math.random() * TAU, ...(variant != null ? { v: variant } : {}) });
    }
    if (added.length) {
      foliageRef.current = arr.concat(added);
      setLiveFoliage(foliageRef.current);
    }
  };

  // 도구에 따라 높이 조각 or 식생 페인트.
  const applyAt = (worldX: number, worldZ: number) => {
    if (FOLIAGE_TOOLS.has(tool)) paintFoliage(worldX, worldZ);
    else applyBrush(worldX, worldZ);
  };

  const handleDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    dragging.current = true;
    onActiveChange?.(true);
    try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch { /* noop */ }
    applyAt(e.point.x, e.point.z);
  };
  const handleMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return;
    e.stopPropagation();
    applyAt(e.point.x, e.point.z);
  };
  const endDrag = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return;
    dragging.current = false;
    onActiveChange?.(false);
    try { (e.target as Element).releasePointerCapture?.(e.pointerId); } catch { /* noop */ }
    commit();
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
    <group>
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
      {/* 라이브 식생 — 페인트 중 즉시 보이게. group-local (x,h,z) 라 회전된 메시와 별개 형제. */}
      <FoliageInstances terrain={{ ...t, foliage: liveFoliage }} />
    </group>
  );
}
