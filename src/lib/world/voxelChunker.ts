/**
 * voxelChunker — 순수 청크 메싱 + 밀도장 상태 (THREE/React/DOM 무관).
 * 웹워커와 동기 폴백이 공유하는 코어. id별로 밀도장을 보유하고 영향받은 청크만 재메시.
 */

import {
  createBaseField, applyDeformToField, fieldToGeometry, deformCellRange, computeVoxelColors,
  type VoxelVolumeData, type VoxelDeform,
} from './voxelVolume';

/** 청크 1개 메시 결과 — transferable 버퍼. */
export interface MeshChunk {
  idx: number;
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
}

export function chunkParams(res: number): { CPA: number; C: number } {
  const CPA = Math.max(2, Math.min(6, Math.round(res / 8)));
  return { CPA, C: Math.ceil(res / CPA) };
}

const fields = new Map<string, { field: Float32Array; data: VoxelVolumeData }>();

function buildChunk(field: Float32Array, data: VoxelVolumeData, CPA: number, C: number, idx: number): MeshChunk {
  const ck = Math.floor(idx / (CPA * CPA));
  const rem = idx % (CPA * CPA);
  const cj = Math.floor(rem / CPA);
  const ci = rem % CPA;
  const bounds = {
    x0: ci * C, x1: Math.min(data.res, (ci + 1) * C),
    y0: cj * C, y1: Math.min(data.res, (cj + 1) * C),
    z0: ck * C, z1: Math.min(data.res, (ck + 1) * C),
  };
  const mc = fieldToGeometry(field, data, bounds);
  const colors = computeVoxelColors(mc.positions, data);
  return { idx, positions: mc.positions, normals: mc.normals, colors };
}

/** id 밀도장 생성(base + 모든 deforms) + 전체 청크 메시. */
export function initChunks(id: string, data: VoxelVolumeData): MeshChunk[] {
  const field = createBaseField(data);
  for (const d of data.deforms) applyDeformToField(field, data, d);
  fields.set(id, { field, data });
  const { CPA, C } = chunkParams(data.res);
  const out: MeshChunk[] = [];
  for (let i = 0; i < CPA * CPA * CPA; i++) out.push(buildChunk(field, data, CPA, C, i));
  return out;
}

/** 변형 1개 적용 → 닿은 청크만 재메시. */
export function deformChunks(id: string, def: VoxelDeform): MeshChunk[] {
  const st = fields.get(id);
  if (!st) return [];
  const { field, data } = st;
  const { CPA, C } = chunkParams(data.res);
  applyDeformToField(field, data, def);
  const cr = deformCellRange(data, def);
  const ci0 = Math.max(0, Math.floor(cr.x0 / C)), ci1 = Math.min(CPA - 1, Math.floor((cr.x1 - 1) / C));
  const cj0 = Math.max(0, Math.floor(cr.y0 / C)), cj1 = Math.min(CPA - 1, Math.floor((cr.y1 - 1) / C));
  const ck0 = Math.max(0, Math.floor(cr.z0 / C)), ck1 = Math.min(CPA - 1, Math.floor((cr.z1 - 1) / C));
  const out: MeshChunk[] = [];
  for (let ck = ck0; ck <= ck1; ck++)
    for (let cj = cj0; cj <= cj1; cj++)
      for (let ci = ci0; ci <= ci1; ci++)
        out.push(buildChunk(field, data, CPA, C, ci + cj * CPA + ck * CPA * CPA));
  return out;
}

export function disposeChunks(id: string): void {
  fields.delete(id);
}
