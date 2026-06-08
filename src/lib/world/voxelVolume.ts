/**
 * Voxel Volume — 아스트로니어식 변형 지형 데이터.
 *
 * 모델: base(시드 생성) + deforms(파기/쌓기 편집 목록). 결정적 → 멀티 동기화·영속 간단.
 * 밀도장 규약: density < 0 = 고체, > 0 = 공기 (marchingCubes iso=0).
 *
 * 로컬 좌표: 볼륨 중심이 원점(0,0,0). 범위 [-half, +half], half = size/2.
 */

import { marchingCubes, type MarchResult, type CellBounds } from './marchingCubes';

/** 파기/쌓기 편집 1개 — 볼륨 로컬 좌표(중심 0) 기준 구. */
export interface VoxelDeform {
  x: number; y: number; z: number;  // 구 중심 (로컬, m)
  r: number;                          // 반지름 (m)
  dig: boolean;                       // true=파기(공기), false=쌓기(고체)
}

export interface VoxelVolumeData {
  res: number;       // 축당 셀 수 (예: 32). 샘플 격자 = (res+1)^3
  size: number;      // 축당 월드 크기 (m). voxelSize = size/res
  seed: number;
  base: 'flat' | 'noise' | 'solid';
  ground?: number;   // flat/noise 표면 높이 (로컬 y, 기본 0)
  amp?: number;      // noise 진폭 (기본 size*0.15)
  deforms: VoxelDeform[];
}

/** 값 노이즈 (marchingCubes 지형과 무관한 단순 2D) — 결정적. */
function noise2(x: number, z: number, seed: number): number {
  const h = Math.sin(x * 12.9898 + z * 78.233 + seed * 37.71) * 43758.5453;
  return h - Math.floor(h);
}
function smoothNoise(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const tx = x - x0, tz = z - z0;
  const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
  const a = noise2(x0, z0, seed), b = noise2(x0 + 1, z0, seed);
  const c = noise2(x0, z0 + 1, seed), d = noise2(x0 + 1, z0 + 1, seed);
  return (a * (1 - sx) + b * sx) * (1 - sz) + (c * (1 - sx) + d * sx) * sz;
}

/** base 밀도장 생성 (deforms 적용 전). 길이 (res+1)^3. */
export function createBaseField(data: VoxelVolumeData): Float32Array {
  const n = data.res + 1;
  const vs = data.size / data.res;
  const half = data.size / 2;
  const field = new Float32Array(n * n * n);
  const ground = data.ground ?? 0;
  const amp = data.amp ?? data.size * 0.15;
  for (let zi = 0; zi < n; zi++) {
    const lz = zi * vs - half;
    for (let yi = 0; yi < n; yi++) {
      const ly = yi * vs - half;
      for (let xi = 0; xi < n; xi++) {
        const lx = xi * vs - half;
        let density: number;
        if (data.base === 'solid') {
          density = -1;                       // 전부 고체 (깎을 바위)
        } else if (data.base === 'noise') {
          const surf = ground + (smoothNoise(lx * 0.12, lz * 0.12, data.seed) * 2 - 1) * amp;
          density = ly - surf;                // 표면 아래 고체
        } else {
          density = ly - ground;              // flat
        }
        // 외곽 셸은 항상 공기 → 볼륨 경계에서 표면이 닫힘(고체 블록의 면 생성)
        const border = xi === 0 || yi === 0 || zi === 0 || xi === n - 1 || yi === n - 1 || zi === n - 1;
        field[xi + yi * n + zi * n * n] = border ? Math.max(density, 0.6) : density;
      }
    }
  }
  return field;
}

/** 단일 변형을 밀도장에 in-place 적용 (런타임 파기/쌓기). 영향받은 샘플만 순회. */
export function applyDeformToField(field: Float32Array, data: VoxelVolumeData, d: VoxelDeform): void {
  const n = data.res + 1;
  const vs = data.size / data.res;
  const half = data.size / 2;
  // 로컬 좌표 → 샘플 인덱스. 영향 범위 = 구 반경 + 1셀.
  const toIdx = (c: number) => (c + half) / vs;
  const cx = toIdx(d.x), cy = toIdx(d.y), cz = toIdx(d.z);
  const rIdx = d.r / vs;
  // 외곽 셸(0, n-1)은 건드리지 않음 → 경계 표면 유지(항상 닫힘)
  const x0 = Math.max(1, Math.floor(cx - rIdx - 1)), x1 = Math.min(n - 2, Math.ceil(cx + rIdx + 1));
  const y0 = Math.max(1, Math.floor(cy - rIdx - 1)), y1 = Math.min(n - 2, Math.ceil(cy + rIdx + 1));
  const z0 = Math.max(1, Math.floor(cz - rIdx - 1)), z1 = Math.min(n - 2, Math.ceil(cz + rIdx + 1));
  for (let zi = z0; zi <= z1; zi++) {
    const dz = (zi - cz) * vs;
    for (let yi = y0; yi <= y1; yi++) {
      const dy = (yi - cy) * vs;
      for (let xi = x0; xi <= x1; xi++) {
        const dx = (xi - cx) * vs;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const sphere = d.r - dist;            // 구 안쪽에서 양수
        const idx = xi + yi * n + zi * n * n;
        if (d.dig) field[idx] = Math.max(field[idx], sphere);    // 공기로 (파기)
        else       field[idx] = Math.min(field[idx], -sphere);   // 고체로 (쌓기)
      }
    }
  }
}

/** base + 모든 deforms → 완성된 밀도장 (init / late-join 재생성). */
export function createField(data: VoxelVolumeData): Float32Array {
  const field = createBaseField(data);
  for (const d of data.deforms) applyDeformToField(field, data, d);
  return field;
}

/** 밀도장 → 월드 스케일·중심 정렬된 삼각 메시 정점. bounds 주면 그 셀 영역만(청크). */
export function fieldToGeometry(field: Float32Array, data: VoxelVolumeData, bounds?: CellBounds): MarchResult {
  const n = data.res + 1;
  const vs = data.size / data.res;
  const half = data.size / 2;
  const mc = marchingCubes(field, n, n, n, 0, bounds);
  // marchingCubes 정점은 격자 인덱스 단위 → voxelSize 스케일 + 중심 정렬
  const p = mc.positions;
  for (let i = 0; i < p.length; i += 3) {
    p[i] = p[i] * vs - half;
    p[i + 1] = p[i + 1] * vs - half;
    p[i + 2] = p[i + 2] * vs - half;
  }
  return mc;
}

/** 변형(구)이 영향을 주는 셀 인덱스 범위(AABB). 청크 dirty 판정용. */
export function deformCellRange(data: VoxelVolumeData, d: VoxelDeform): CellBounds {
  const vs = data.size / data.res;
  const half = data.size / 2;
  const toIdx = (c: number) => (c + half) / vs;
  const cx = toIdx(d.x), cy = toIdx(d.y), cz = toIdx(d.z);
  const ri = d.r / vs + 1;
  return {
    x0: Math.floor(cx - ri), x1: Math.ceil(cx + ri),
    y0: Math.floor(cy - ri), y1: Math.ceil(cy + ri),
    z0: Math.floor(cz - ri), z1: Math.ceil(cz + ri),
  };
}
