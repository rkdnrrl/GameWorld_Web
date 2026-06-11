/**
 * 부위별(머티리얼별) 텍스처 오버라이드 — 멀티 머티리얼 모델(나무: 줄기+잎 등)에서
 * 각 머티리얼 이름마다 다른 텍스처를 입히기 위한 공유 헬퍼.
 *
 * 오브젝트의 `materialOverrides` (머티리얼이름 → {albedo,normal,roughness}) 를
 * StudioCanvas(편집)·WorldCanvas(플레이) 양쪽에서 동일하게 적용한다.
 */
import * as THREE from 'three';

export interface MatOverride {
  albedo?: string;
  normal?: string;
  roughness?: string;
}
export type MaterialOverrides = Record<string, MatOverride>;

/** loadTex / loadFreshTexture 의 공통 시그니처 — 각 파일의 로더를 주입받는다. */
export type LoadTexFn = (
  url: string,
  colorSpace: THREE.ColorSpace,
  tilingX: number,
  tilingY: number,
  onLoad: () => void,
) => THREE.Texture;

/** 모델의 고유 머티리얼 이름 목록 (이름 없는 건 제외). */
export function uniqueMaterialNames(
  origMats: Map<THREE.Mesh, THREE.Material | THREE.Material[]>,
): string[] {
  const set = new Set<string>();
  origMats.forEach((mat) => {
    (Array.isArray(mat) ? mat : [mat]).forEach((m) => { if (m?.name) set.add(m.name); });
  });
  return Array.from(set);
}

/** 메시의 (단일) 원본 머티리얼 이름. 배열(멀티 서브머티리얼)이면 null. */
export function meshMaterialName(orig: THREE.Material | THREE.Material[] | undefined): string | null {
  if (!orig || Array.isArray(orig)) return null;
  return orig.name || null;
}

export function hasOverride(ov: MatOverride | undefined): ov is MatOverride {
  return !!ov && !!(ov.albedo || ov.normal || ov.roughness);
}

/**
 * 원본 머티리얼의 컷아웃 속성(투명/alphaTest/면/정점색)을 보존한 채,
 * 오버라이드 텍스처(앨베도/노멀/러프니스)를 입힌 새 MeshStandardMaterial 을 만든다.
 * 새로 만든 맵은 전부 이 머티리얼 소유 → dispose 안전.
 */
export function buildOverrideMaterial(
  orig: THREE.Material | THREE.Material[] | undefined,
  ov: MatOverride,
  loadTex: LoadTexFn,
  onLoad?: () => void,
): THREE.MeshStandardMaterial {
  const b = (Array.isArray(orig) ? orig[0] : orig) as THREE.MeshStandardMaterial | undefined;
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: typeof b?.metalness === 'number' ? b.metalness : 0,
    roughness: typeof b?.roughness === 'number' ? b.roughness : 0.85,
    transparent: !!b?.transparent,
    alphaTest: b?.alphaTest || 0,
    side: b?.side ?? THREE.FrontSide,
  });
  if (b && (b as THREE.MeshStandardMaterial).vertexColors) m.vertexColors = true;
  const trig = () => { m.needsUpdate = true; onLoad?.(); };
  if (ov.albedo)    m.map          = loadTex(ov.albedo,    THREE.SRGBColorSpace, 1, 1, trig);
  if (ov.normal)    m.normalMap    = loadTex(ov.normal,    THREE.NoColorSpace,   1, 1, trig);
  if (ov.roughness) m.roughnessMap = loadTex(ov.roughness, THREE.NoColorSpace,   1, 1, trig);
  m.needsUpdate = true;
  return m;
}
