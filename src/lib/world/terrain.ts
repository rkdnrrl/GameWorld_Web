/**
 * Terrain 데이터 모델 + 헬퍼.
 *
 * Heightmap 기반 — (segments+1) x (segments+1) 정점, 각 정점 Y 높이 (m).
 * heights 배열은 Float32Array 의 base64 또는 일반 array (JSON 직렬화).
 *
 * Phase 1: 데이터 + 단순 generator (flat / perlin-ish noise).
 * Phase 2~: 브러시 편집, 텍스처 페인팅, 물리.
 */

/** 지형 위에 심은 식생(풀/나무) 1개. 좌표는 terrain-local (스케일/회전 적용 전). */
export interface FoliageInstance {
  /** 종류 — 풀 / 나무 / 꽃 / 돌 / 덤불(통과 가능 + 그림자, 안 휘어짐). */
  k: 'grass' | 'tree' | 'flower' | 'rock' | 'bush';
  /** terrain-local X (-size/2 ~ +size/2). */
  x: number;
  /** terrain-local Z (-size/2 ~ +size/2). */
  z: number;
  /** 크기 배율 (개체 변주). */
  s: number;
  /** Y축 회전 (rad). */
  r: number;
  /** 사용할 에셋 variant 인덱스 (foliageAssets[k] 배열 기준). 없으면 위치 해시로 자동 선택. */
  v?: number;
}

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
  /** 노말맵 URL (선택) — 지면 표면 요철. OpenGL(GL) 규약 노말맵. */
  textureNormalUrl?: string;
  /** 러프니스맵 URL (선택) — 흰=거침, 검=반들. material.roughness 에 곱해짐. */
  textureRoughnessUrl?: string;
  /** 텍스처 반복 횟수 (UV 곱). */
  textureRepeat?: number;
  /** 슬로프/높이 블렌딩 — 가파른 경사면 텍스처(바위). 지정 시 textureUrl(평지)과 섞임. */
  textureCliffUrl?: string;
  /** 슬로프/높이 블렌딩 — 낮은 곳 텍스처(모래/흙, 물가). */
  textureLowUrl?: string;
  /** 경사 블렌딩 시작 각도(도). 이보다 가파르면 cliff 텍스처. 기본 35. */
  slopeThreshold?: number;
  /** 이 월드 높이(Y, m) 이하를 low 텍스처로. 기본 0. */
  lowHeight?: number;
  /** low 블렌딩 폭(m). 기본 2. */
  lowBlend?: number;
  /** 젖음 정도 0~1 — 비로 축축해진 땅. 높을수록 거칠기↓(반들), 색 어둡게, 환경 반사↑. */
  wetness?: number;
  /** true 면 비(envFx.rainWet)로 자동 젖지 않음 — 수동 wetness 슬라이더만 적용. 기본(undefined)=비에 젖음. */
  ignoreRainWet?: boolean;
  /** 물웅덩이 정도 0~1 — 0이면 전면 균일 젖음, 클수록 노이즈 영역(웅덩이)에만 거울 반사 집중. */
  puddles?: number;
  /** 지형 위에 심은 풀/나무 (선택). */
  foliage?: FoliageInstance[];
  /** 식생 종류별 사용자 에셋(모델 URL). 지정 시 절차적 기본 모양 대신 그 모델을 인스턴싱.
   *  종류별로 여러 개(배열) 지정 가능 — 개체는 위치 해시로 variant 를 골라 다양하게 흩뿌린다.
   *  구버전 데이터(단일 객체)도 헬퍼(foliageVariantsOf)가 배열로 정규화해 호환.
   *  overrides = 그 에셋의 부위별 텍스처(materialConfig) — 잎 etc. 알파 텍스처를 머티리얼 이름별로 입힘. */
  foliageAssets?: Partial<Record<FoliageInstance['k'], FoliageVariant | FoliageVariant[]>>;
}

/** 식생 에셋 1종(variant) — 모델 URL + 크기 배율 + 부위별 텍스처. */
export interface FoliageVariant {
  url: string;
  scale?: number;
  overrides?: import('./materialOverride').MaterialOverrides;
  /** 앨베도 텍스처 URL (선택) — 모델에 텍스처가 없을 때 직접 입힘. 모든 머티리얼 map 으로 적용. */
  textureUrl?: string;
}

/** foliageAssets[k] 를 항상 배열로 정규화 — 구버전(단일 객체)·신버전(배열)·미지정 모두 처리. */
export function foliageVariantsOf(
  fa: TerrainData['foliageAssets'] | undefined,
  k: FoliageInstance['k'],
): FoliageVariant[] {
  const v = fa?.[k];
  if (!v) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.filter((x): x is FoliageVariant => !!x && !!x.url);
}

/** 위치 기반 결정적 variant 인덱스 (0~n-1). 같은 좌표 = 항상 같은 모델 → 렌더·콜라이더 일치, 리렌더 안정. */
export function foliageVariantIndex(x: number, z: number, n: number): number {
  if (n <= 1) return 0;
  const h = Math.sin(x * 49.17 + z * 19.93) * 43758.5453;
  return Math.floor((h - Math.floor(h)) * n) % n;
}

/** 개체가 쓸 variant 인덱스 — 명시값(it.v)이 유효하면 그걸, 아니면 위치 해시. 렌더·콜라이더 공용. */
export function resolveVariantIndex(it: FoliageInstance, n: number): number {
  if (n <= 1) return 0;
  if (it.v != null && it.v >= 0 && it.v < n) return it.v;
  return foliageVariantIndex(it.x, it.z, n);
}

/** terrain-local (lx,lz) 에서 heightmap 을 bilinear 샘플 → Y 높이 (m).
 *  식생을 지형 표면에 앉히는 데 사용. 좌표 매핑은 TerrainMesh/TerrainSculptMesh 와 동일
 *  (col = (lx+half)/size*seg, row = (lz+half)/size*seg, idx = row*n1 + col). */
export function sampleTerrainHeight(t: TerrainData, lx: number, lz: number): number {
  const n1 = t.segments + 1;
  const half = t.size / 2;
  const gx = (lx + half) / t.size * t.segments;
  const gz = (lz + half) / t.size * t.segments;
  let x0 = Math.floor(gx), z0 = Math.floor(gz);
  // 범위 밖이면 가장자리로 clamp.
  if (x0 < 0 || z0 < 0 || x0 >= t.segments || z0 >= t.segments) {
    const cx = Math.max(0, Math.min(t.segments, Math.round(gx)));
    const cz = Math.max(0, Math.min(t.segments, Math.round(gz)));
    return t.heights[cz * n1 + cx] ?? 0;
  }
  const tx = gx - x0, tz = gz - z0;
  const h00 = t.heights[z0 * n1 + x0] ?? 0;
  const h10 = t.heights[z0 * n1 + x0 + 1] ?? 0;
  const h01 = t.heights[(z0 + 1) * n1 + x0] ?? 0;
  const h11 = t.heights[(z0 + 1) * n1 + x0 + 1] ?? 0;
  return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
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
