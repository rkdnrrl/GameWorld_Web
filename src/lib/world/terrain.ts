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
export function makeFlatTerrain(size = 50, segments = 64, baseColor = '#5a8a4a'): TerrainData {
  const n = (segments + 1) * (segments + 1);
  return { size, segments, heights: new Array(n).fill(0), baseColor, textureRepeat: 8 };
}

/** Perlin-ish 노이즈 (값 노이즈 + 옥타브) — 자연스러운 언덕. */
export function generateNoiseTerrain(size = 50, segments = 64, amplitude = 4, scale = 0.05, seed = 1): TerrainData {
  const n1 = segments + 1;
  const heights = new Array(n1 * n1).fill(0);
  // 단순 hash 노이즈 — 결정적, 시드 기반. 1d sin/cos 합성으로 부드러움.
  const noise = (x: number, y: number) => {
    let v = 0;
    let amp = amplitude;
    let freq = scale;
    for (let oct = 0; oct < 4; oct++) {
      const a = Math.sin((x * freq * 12.9898 + y * freq * 78.233 + seed * 7.31) * 43758.5453);
      const b = Math.sin((x * freq * 39.346 + y * freq * 11.135 + seed * 3.93) * 31415.9265);
      v += (a - Math.floor(a) + b - Math.floor(b) - 1) * amp;
      amp *= 0.5; freq *= 2.1;
    }
    return v;
  };
  for (let y = 0; y < n1; y++) {
    for (let x = 0; x < n1; x++) {
      heights[y * n1 + x] = noise(x, y);
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
