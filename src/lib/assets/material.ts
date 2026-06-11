/**
 * 에셋 머티리얼 빌더 — 저장된 materialConfig(프리셋/색/텍스처)를 THREE 머티리얼로.
 * AssetMaterialEditor(편집·미리보기) 와 모델 썸네일 뷰어가 공유한다.
 */
import * as THREE from 'three';
import type { MaterialOverrides } from '@/lib/world/materialOverride';

export type MaterialPreset = 'default' | 'wood' | 'metal' | 'stone' | 'glass' | 'plastic' | 'emissive';

export interface MaterialConfig {
  material?:        MaterialPreset;
  materialColor?:   string;
  textureAlbedo?:    string;
  textureNormal?:    string;
  textureRoughness?: string;
  textureTilingX?:   number;
  textureTilingY?:   number;
  materialOverrides?: MaterialOverrides;  // 부위별(머티리얼이름→텍스처) — 멀티 머티리얼 모델
}

export const PRESETS: Record<Exclude<MaterialPreset, 'default'>, {
  metalness: number; roughness: number; opacity?: number; transparent?: boolean;
  defaultColor: string; emissive?: string; emissiveIntensity?: number;
}> = {
  wood:     { defaultColor: '#8b6f47', metalness: 0,   roughness: 0.85 },
  metal:    { defaultColor: '#b0b0b0', metalness: 1.0, roughness: 0.3  },
  stone:    { defaultColor: '#7a7a7a', metalness: 0,   roughness: 0.95 },
  glass:    { defaultColor: '#a0c8e0', metalness: 0,   roughness: 0.05, opacity: 0.3, transparent: true },
  plastic:  { defaultColor: '#ffffff', metalness: 0,   roughness: 0.5  },
  emissive: { defaultColor: '#ffffff', metalness: 0,   roughness: 0.6, emissive: '#ffaa44', emissiveIntensity: 1.5 },
};

export function loadTex(url: string, colorSpace: THREE.ColorSpace, tx: number, ty: number, onLoad: () => void): THREE.Texture {
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  const tex = loader.load(url, () => { tex.needsUpdate = true; onLoad(); });
  tex.colorSpace = colorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(tx, ty);
  return tex;
}

/** materialConfig → MeshStandardMaterial. default(설정 없음) 면 null 반환(원본 유지). */
export function buildMat(cfg: MaterialConfig, onTexLoad?: () => void): THREE.MeshStandardMaterial | null {
  const presetKey = cfg.material && cfg.material !== 'default' ? cfg.material : null;
  const preset = presetKey ? PRESETS[presetKey] : null;
  const hasAnyTex = cfg.textureAlbedo || cfg.textureNormal || cfg.textureRoughness;
  if (!presetKey && !hasAnyTex && !cfg.materialColor) return null; // default = 원본 유지

  const baseColor = cfg.materialColor || (preset ? preset.defaultColor : '#ffffff');
  const mat = new THREE.MeshStandardMaterial({
    color:       hasAnyTex && !cfg.materialColor ? '#ffffff' : baseColor,
    metalness:   preset?.metalness ?? 0,
    roughness:   preset?.roughness ?? 0.5,
    opacity:     preset?.opacity ?? 1,
    transparent: preset?.transparent ?? false,
    emissive:    preset?.emissive ?? '#000000',
    emissiveIntensity: preset?.emissiveIntensity ?? 0,
  });
  const tx = cfg.textureTilingX || 1;
  const ty = cfg.textureTilingY || 1;
  const trig = () => { mat.needsUpdate = true; onTexLoad?.(); };
  if (cfg.textureAlbedo)    mat.map          = loadTex(cfg.textureAlbedo,    THREE.SRGBColorSpace, tx, ty, trig);
  if (cfg.textureNormal)    mat.normalMap    = loadTex(cfg.textureNormal,    THREE.NoColorSpace,   tx, ty, trig);
  if (cfg.textureRoughness) mat.roughnessMap = loadTex(cfg.textureRoughness, THREE.NoColorSpace,   tx, ty, trig);
  return mat;
}

export function disposeMat(mat: THREE.MeshStandardMaterial) {
  mat.map?.dispose(); mat.normalMap?.dispose(); mat.roughnessMap?.dispose(); mat.dispose();
}
