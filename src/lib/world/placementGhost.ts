/**
 * 배치 모드 고스트 미리보기 — WorldCanvas 가 캐릭터 앞에 그릴 반투명 3D 모양.
 *
 * 모달에서 선택한 spec 을 ghost 로 변환:
 *   - asset (FBX/GLB) → 'asset' shape (wireframe box; 실제 모델 로드는 비용 커서 skip)
 *   - plane (이미지/비디오) → 'plane'
 *   - sound → 'sphere' (작은 표식)
 *   - cube/sphere/cylinder → 같은 primitive
 *   - prefab → 트리 각 노드를 part 로 (root 기준 local position 유지)
 */

import type { SpawnPayload, PrefabSpawnPayload } from '@/components/world/WorldSpawnModal';

export type GhostShape = 'box' | 'sphere' | 'cylinder' | 'plane' | 'asset';

export interface GhostPart {
  shape: GhostShape;
  /** root (0,0,0) 기준 local 위치 */
  localPos: [number, number, number];
  localRot: [number, number, number];
  scale: [number, number, number];
  color: string;
}

/** ghost 의 현재 world 위치/회전 — PlacementGhostMesh 가 매 frame 갱신, spawn 핸들러가 읽음. */
export interface GhostPose {
  x: number; y: number; z: number; rotY: number;
}

export interface PlacementGhost {
  parts: GhostPart[];
  /** plane 류 (이미지/비디오) 는 본인쪽으로 향해야 자연스러움 → root rotation 반대로 회전 */
  faceCamera: boolean;
  /** PlacementGhostMesh 가 매 frame 갱신하는 현재 world 위치. spawn 핸들러가 이걸 우선 사용. */
  poseRef?: { current: GhostPose | null };
}

/** 단일 에셋 (모델/이미지/비디오/오디오) → 고스트 */
export function ghostFromSpawnPayload(payload: SpawnPayload): PlacementGhost {
  const poseRef = { current: null as GhostPose | null };
  if (payload.worldKind === 'plane') {
    return {
      parts: [{ shape: 'plane', localPos: [0, 0, 0], localRot: [0, 0, 0], scale: payload.defaultScale, color: '#a78bfa' }],
      faceCamera: true,
      poseRef,
    };
  }
  if (payload.worldKind === 'sound') {
    return {
      parts: [{ shape: 'sphere', localPos: [0, 0, 0], localRot: [0, 0, 0], scale: [0.3, 0.3, 0.3], color: '#fbbf24' }],
      faceCamera: false,
      poseRef,
    };
  }
  // worldKind === 'asset' — wireframe box (실제 모델 로드 X — 너무 무거움)
  return {
    parts: [{ shape: 'asset', localPos: [0, 0, 0], localRot: [0, 0, 0], scale: payload.defaultScale, color: '#a78bfa' }],
    faceCamera: false,
    poseRef,
  };
}

/** Prefab tree → 고스트. root 는 첫 노드, 자식은 parentId 가 root 또는 다른 자식 가리킴. */
export function ghostFromPrefab(prefab: PrefabSpawnPayload): PlacementGhost {
  const parts: GhostPart[] = [];
  for (const raw of prefab.tree) {
    const o = raw as {
      kind?: string;
      scale?: [number, number, number];
      position?: [number, number, number];
      rotation?: [number, number, number];
      color?: string;
      parentId?: string;
    };
    parts.push({
      shape: kindToShape(o.kind || 'cube'),
      localPos: o.position || [0, 0, 0],
      localRot: o.rotation || [0, 0, 0],
      scale: o.scale || [1, 1, 1],
      color: o.color || '#a78bfa',
    });
  }
  return { parts, faceCamera: false, poseRef: { current: null } };
}

function kindToShape(kind: string): GhostShape {
  switch (kind) {
    case 'sphere':   return 'sphere';
    case 'cylinder': return 'cylinder';
    case 'plane':    return 'plane';
    case 'asset':    return 'asset';
    case 'cube':
    default:         return 'box';
  }
}
