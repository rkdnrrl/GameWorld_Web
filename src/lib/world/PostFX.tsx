'use client';
/**
 * 후처리(Post Processing) — 언리얼 "Post Process Volume" 식.
 * 오브젝트에 'postProcess' 컴포넌트(볼륨)를 붙이면 그 설정대로 화면에 효과 적용.
 * 여러 개면 첫 번째 볼륨만 적용. (worldPhysics 와 동일 규약)
 *
 * 효과: Bloom(발광) / Vignette(비네팅) / Chromatic Aberration(색수차) /
 *       Brightness·Contrast(밝기·대비) / Depth of Field(피사계심도) / Tone Mapping.
 * 활성 효과가 없으면 EffectComposer 자체를 렌더하지 않음(성능 0 비용).
 */
import * as THREE from 'three';
import {
  EffectComposer, Bloom, Vignette, ChromaticAberration, BrightnessContrast, DepthOfField, ToneMapping,
} from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { findComponent, getProp, type ComponentInstance } from '@/lib/world/components';

export interface PostFXSettings {
  enabled: boolean;
  bloom: boolean; bloomIntensity: number; bloomThreshold: number;
  vignette: number;          // 0 = off
  chromatic: number;         // 0 = off
  brightness: number; contrast: number;
  dof: boolean; dofFocus: number; dofFocalLength: number; dofBokeh: number;
  toneMapping: boolean;
}

const OFF: PostFXSettings = {
  enabled: false, bloom: false, bloomIntensity: 0, bloomThreshold: 0,
  vignette: 0, chromatic: 0, brightness: 0, contrast: 0,
  dof: false, dofFocus: 0, dofFocalLength: 0, dofBokeh: 0, toneMapping: false,
};

/** 오브젝트 목록에서 postProcess 볼륨 컴포넌트 → 설정. 없으면 비활성. */
export function derivePostFX(objects: ReadonlyArray<{ components?: ComponentInstance[] }>): PostFXSettings {
  for (const o of objects) {
    const inst = findComponent(o.components, 'postProcess');
    if (inst) return {
      enabled:        getProp(inst, 'enabled', true),
      bloom:          getProp(inst, 'bloom', true),
      bloomIntensity: getProp(inst, 'bloomIntensity', 0.6),
      bloomThreshold: getProp(inst, 'bloomThreshold', 0.85),
      vignette:       getProp(inst, 'vignette', 0.3),
      chromatic:      getProp(inst, 'chromatic', 0),
      brightness:     getProp(inst, 'brightness', 0),
      contrast:       getProp(inst, 'contrast', 0),
      dof:            getProp(inst, 'dof', false),
      dofFocus:       getProp(inst, 'dofFocus', 0.02),
      dofFocalLength: getProp(inst, 'dofFocalLength', 0.05),
      dofBokeh:       getProp(inst, 'dofBokeh', 2),
      toneMapping:    getProp(inst, 'toneMapping', false),
    };
  }
  return OFF;
}

export default function PostFX({ s }: { s: PostFXSettings }) {
  if (!s.enabled) return null;

  const fx: React.ReactElement[] = [];
  // DOF 는 먼저(깊이 기반)
  if (s.dof) fx.push(<DepthOfField key="dof" focusDistance={s.dofFocus} focalLength={s.dofFocalLength} bokehScale={s.dofBokeh} />);
  if (s.bloom && s.bloomIntensity > 0) fx.push(<Bloom key="bloom" intensity={s.bloomIntensity} luminanceThreshold={s.bloomThreshold} luminanceSmoothing={0.9} mipmapBlur />);
  if (s.chromatic > 0) fx.push(<ChromaticAberration key="ca" offset={new THREE.Vector2(s.chromatic, s.chromatic)} />);
  if (s.brightness !== 0 || s.contrast !== 0) fx.push(<BrightnessContrast key="bc" brightness={s.brightness} contrast={s.contrast} />);
  if (s.vignette > 0) fx.push(<Vignette key="vig" offset={0.3} darkness={s.vignette} />);
  if (s.toneMapping) fx.push(<ToneMapping key="tm" mode={ToneMappingMode.ACES_FILMIC} />);

  if (fx.length === 0) return null;
  return <EffectComposer>{fx}</EffectComposer>;
}
