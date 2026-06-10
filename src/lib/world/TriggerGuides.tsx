'use client';
/**
 * 트리거 영역 시각화 — Studio 편집 모드 전용.
 *  - jumpPad / checkpoint / killZone / raceStart / raceFinish 박스를 wireframe 으로 표시
 *  - 색상별 구분 + 반투명. 시뮬 모드에는 마운트하지 않음 (게임플레이 방해 X)
 *  - selectedId 가 있으면 그 박스만 강조 (불투명 + 굵게), 나머지는 옅게
 *
 * V1: root-level position 기준 (부모 transform 미반영). 그룹 안 nested 트리거는 V2.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import {
  computeJumpPads, computeCheckpoints, computeKillZones,
  computeRaceStarts, computeRaceFinishes,
  type ComponentInstance,
} from './components';

interface Box {
  id: string;
  ownerId: string;        // 원래 오브젝트 id (선택 강조용)
  cx: number; cy: number; cz: number;
  hx: number; hy: number; hz: number;
  color: string;
  label: string;
}

interface BoxLike { id: string; cx: number; cy: number; cz: number; hx: number; hy: number; hz: number }
function spotsToBox(spots: BoxLike[], color: string, label: string): Box[] {
  return spots.map(s => ({
    id: `${label}|${s.id}`,
    ownerId: s.id,
    cx: s.cx, cy: s.cy, cz: s.cz,
    hx: s.hx, hy: s.hy, hz: s.hz,
    color, label,
  }));
}

const BOX_GEO = new THREE.BoxGeometry(1, 1, 1);
const EDGES_CACHE = new Map<string, THREE.EdgesGeometry>();
function getEdges(w: number, h: number, d: number) {
  const k = `${w}|${h}|${d}`;
  let g = EDGES_CACHE.get(k);
  if (!g) { g = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)); EDGES_CACHE.set(k, g); }
  return g;
}

export interface TriggerGuideObject {
  id?: string;
  position?: number[];
  rotation?: number[];
  scale?: number[];
  components?: ComponentInstance[];
  hidden?: boolean;
}

export default function TriggerGuides({
  objects,
  selectedId,
}: {
  objects: TriggerGuideObject[] | undefined | null;
  selectedId: string | null;
}) {
  const boxes: Box[] = useMemo(() => {
    if (!objects) return [];
    return [
      ...spotsToBox(computeJumpPads(objects),     '#fb923c', 'jumpPad'),
      ...spotsToBox(computeCheckpoints(objects),  '#34d399', 'checkpoint'),
      ...spotsToBox(computeKillZones(objects),    '#ef4444', 'killZone'),
      ...spotsToBox(computeRaceStarts(objects),   '#06b6d4', 'raceStart'),
      ...spotsToBox(computeRaceFinishes(objects), '#facc15', 'raceFinish'),
    ];
  }, [objects]);

  if (boxes.length === 0) return null;

  return (
    <>
      {boxes.map(b => {
        const isSelected = !!selectedId && b.ownerId === selectedId;
        const w = b.hx * 2, h = b.hy * 2, d = b.hz * 2;
        const fillOpacity  = isSelected ? 0.18 : 0.06;
        const edgeOpacity  = isSelected ? 0.95 : 0.35;
        return (
          <group key={b.id} position={[b.cx, b.cy, b.cz]}>
            {/* 반투명 채우기 */}
            <mesh geometry={BOX_GEO} scale={[w, h, d]} renderOrder={9999}>
              <meshBasicMaterial color={b.color} transparent opacity={fillOpacity} depthWrite={false} />
            </mesh>
            {/* wireframe 모서리 */}
            <lineSegments geometry={getEdges(w, h, d)} renderOrder={10000}>
              <lineBasicMaterial color={b.color} transparent opacity={edgeOpacity} depthTest={false} />
            </lineSegments>
          </group>
        );
      })}
    </>
  );
}
