/**
 * Terrain 데이터 모델 + 헬퍼.
 *
 * Heightmap 기반 — (segments+1) x (segments+1) 정점, 각 정점 Y 높이 (m).
 * heights 배열은 Float32Array 의 base64 또는 일반 array (JSON 직렬화).
 *
 * Phase 1: 데이터 + 단순 generator (flat / perlin-ish noise).
 * Phase 2~: 브러시 편집, 텍스처 페인팅, 물리.
 */

export interface TerrainData {
  /** 가로/세로 길이 (m). 정사각형. */
  size: number;
  /** 정점 segments — (segments+1)x(segments+1) 정점. 권장 32~256. */
  segments: number;
  /** 정점별 Y 높이 (m). 배열 길이 (segments+1)^2. row-major: idx = y*(segments+1) + x. */
  heights: number[];
  /** 베이스 색 (텍스처 없거나 추가로 곱셈). */
  baseColor: string;
  /** 알베도 텍스처 URL (선택). */
  textureUrl?: string;
  /** 텍스처 반복 횟수 (UV 곱). */
  textureRepeat?: number;
}

/** 평탄 (모두 0) 기본 terrain. */
export function makeFlatTerrain(size = 50, segments = 128, baseColor = '#5a8a4a'): TerrainData {
  const n = (segments + 1) * (segments + 1);
  return { size, segments, heights: new Array(n).fill(0), baseColor, textureRepeat: 8 };
}

/** 진짜 coherent value noise — 격자점 해시 랜덤 + Hermite smoothstep bilinear 보간, fBm 4 octaves.
 *  옛 버전은 per-vertex 해시 랜덤이라 가시밭이 됐음. 이제 자연스러운 굴곡. */
export function generateNoiseTerrain(size = 50, segments = 128, amplitude = 4, scale = 0.06, seed = 1): TerrainData {
  const n1 = segments + 1;
  const heights = new Array(n1 * n1).fill(0);
  const hash = (xi: number, yi: number, s: number) => {
    const h = Math.sin(xi * 127.1 + yi * 311.7 + s * 74.7) * 43758.5453;
    return (h - Math.floor(h)) * 2 - 1;
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const value2d = (x: number, y: number, f: number, s: number) => {
    const xs = x * f, ys = y * f;
    const x0 = Math.floor(xs), y0 = Math.floor(ys);
    const tx = smooth(xs - x0), ty = smooth(ys - y0);
    const a = hash(x0,     y0,     s);
    const b = hash(x0 + 1, y0,     s);
    const c = hash(x0,     y0 + 1, s);
    const d = hash(x0 + 1, y0 + 1, s);
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
  for (let y = 0; y < n1; y++) {
    for (let x = 0; x < n1; x++) {
      let v = 0, amp = amplitude, freq = scale;
      for (let oct = 0; oct < 4; oct++) {
        v += value2d(x, y, freq, seed + oct) * amp;
        amp *= 0.5; freq *= 2.0;
      }
      heights[y * n1 + x] = v;
    }
  }
  return { size, segments, heights, baseColor: '#5a8a4a', textureRepeat: 8 };
}

/** Terrain 데이터 유효성 보정 — segments 변경 등으로 길이 불일치 시 0 으로 채움/잘라냄. */
export function normalizeTerrain(t: TerrainData): TerrainData {
  const expected = (t.segments + 1) * (t.segments + 1);
  if (t.heights.length === expected) return t;
  const next = new Array(expected).fill(0);
  const copy = Math.min(expected, t.heights.length);
  for (let i = 0; i < copy; i++) next[i] = t.heights[i] ?? 0;
  return { ...t, heights: next };
}
