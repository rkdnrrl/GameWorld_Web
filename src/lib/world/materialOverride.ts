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
  metalness?: string;
  ao?: string;
  emissive?: string;
}
export type MatSlot = keyof MatOverride;
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
  return !!ov && !!(ov.albedo || ov.normal || ov.roughness || ov.metalness || ov.ao || ov.emissive);
}

/**
 * 메시 하나의 최종 머티리얼을 결정한다. 단일 머티리얼 + **머티리얼 배열(서브머티리얼)** 둘 다 처리.
 * 우선순위: 부위별 오버라이드 > 글로벌 머티리얼 > 원본.
 * 모델이 "한 메시 + 머티리얼 배열"(줄기/잎이 서브머티리얼) 구조여도 이름별로 정확히 교체됨.
 *
 * @param made  새로 만든 머티리얼을 여기에 push (호출부가 dispose 용으로 수집). globalMat 은 push 안 함(호출부가 따로 관리).
 * @returns 메시에 할당할 머티리얼(배열일 수 있음). null 이면 변경 없음.
 */
export function resolveMeshMaterial(
  orig: THREE.Material | THREE.Material[] | undefined,
  overrides: MaterialOverrides | undefined,
  globalMat: THREE.MeshStandardMaterial | null,
  loadTex: LoadTexFn,
  onLoad: (() => void) | undefined,
  made: THREE.MeshStandardMaterial[],
): THREE.Material | THREE.Material[] | null {
  if (Array.isArray(orig)) {
    let changed = false;
    const arr = orig.map((sub) => {
      const ov = sub?.name && overrides ? overrides[sub.name] : undefined;
      if (hasOverride(ov)) { const nm = buildOverrideMaterial(sub, ov, loadTex, onLoad); made.push(nm); changed = true; return nm; }
      if (globalMat) { changed = true; return globalMat; }
      return sub;
    });
    return changed ? arr : orig;
  }
  const name = orig?.name;
  const ov = name && overrides ? overrides[name] : undefined;
  if (hasOverride(ov)) { const nm = buildOverrideMaterial(orig, ov, loadTex, onLoad); made.push(nm); return nm; }
  if (globalMat) return globalMat;
  return orig ?? null;
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
  if (ov.albedo) {
    m.map = loadTex(ov.albedo, THREE.SRGBColorSpace, 1, 1, trig);
    // 알파 컷아웃 — 잎/풀 등 투명 PNG 가 검게 안 나오게 (유니티 Alpha Clip). 불투명 텍스처(알파=1)엔 무영향.
    m.alphaTest = 0.5;
    m.transparent = false;
    m.side = THREE.DoubleSide;   // 잎 카드 양면 표시
  }
  if (ov.normal)    m.normalMap    = loadTex(ov.normal,    THREE.NoColorSpace,   1, 1, trig);
  if (ov.roughness) m.roughnessMap = loadTex(ov.roughness, THREE.NoColorSpace,   1, 1, trig);
  if (ov.metalness) { m.metalnessMap = loadTex(ov.metalness, THREE.NoColorSpace, 1, 1, trig); m.metalness = 1; }
  if (ov.ao)        { m.aoMap = loadTex(ov.ao, THREE.NoColorSpace, 1, 1, trig); m.aoMap.channel = 0; }
  if (ov.emissive)  { m.emissiveMap = loadTex(ov.emissive, THREE.SRGBColorSpace, 1, 1, trig); m.emissive.set('#ffffff'); if (!m.emissiveIntensity) m.emissiveIntensity = 1; }
  m.needsUpdate = true;
  return m;
}
