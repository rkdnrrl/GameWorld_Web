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
  HueSaturation, Noise, Pixelation, Scanline, Sepia, ColorAverage,
} from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { findComponent, getProp, type ComponentInstance } from '@/lib/world/components';

export interface PostFXSettings {
  enabled: boolean;
  bloom: boolean; bloomIntensity: number; bloomThreshold: number;
  vignette: number;          // 0 = off
  chromatic: number;         // 0 = off
  brightness: number; contrast: number;
  saturation: number; hue: number;       // 색 보정 (saturation -1..1, hue 라디안)
  grain: number;             // 필름 노이즈 0 = off
  pixelate: number;          // 픽셀화 0 = off (픽셀 크기)
  scanline: number;          // CRT 스캔라인 0 = off (밀도)
  sepia: boolean;            // 세피아 톤
  grayscale: boolean;        // 흑백
  dof: boolean; dofFocus: number; dofFocalLength: number; dofBokeh: number;
  toneMapping: boolean;
}

const OFF: PostFXSettings = {
  enabled: false, bloom: false, bloomIntensity: 0, bloomThreshold: 0,
  vignette: 0, chromatic: 0, brightness: 0, contrast: 0,
  saturation: 0, hue: 0, grain: 0, pixelate: 0, scanline: 0, sepia: false, grayscale: false,
  dof: false, dofFocus: 0, dofFocalLength: 0, dofBokeh: 0, toneMapping: false,
};

function settingsFromInst(inst: ComponentInstance): PostFXSettings {
  return {
    enabled:        getProp(inst, 'enabled', true),
    bloom:          getProp(inst, 'bloom', true),
    bloomIntensity: getProp(inst, 'bloomIntensity', 0.6),
    bloomThreshold: getProp(inst, 'bloomThreshold', 0.85),
    vignette:       getProp(inst, 'vignette', 0.3),
    chromatic:      getProp(inst, 'chromatic', 0),
    brightness:     getProp(inst, 'brightness', 0),
    contrast:       getProp(inst, 'contrast', 0),
    saturation:     getProp(inst, 'saturation', 0),
    hue:            getProp(inst, 'hue', 0),
    grain:          getProp(inst, 'grain', 0),
    pixelate:       getProp(inst, 'pixelate', 0),
    scanline:       getProp(inst, 'scanline', 0),
    sepia:          getProp(inst, 'sepia', false),
    grayscale:      getProp(inst, 'grayscale', false),
    dof:            getProp(inst, 'dof', false),
    dofFocus:       getProp(inst, 'dofFocus', 0.02),
    dofFocalLength: getProp(inst, 'dofFocalLength', 0.05),
    dofBokeh:       getProp(inst, 'dofBokeh', 2),
    toneMapping:    getProp(inst, 'toneMapping', false),
  };
}

/** 전역(존 아님) postProcess 볼륨 → 설정. 없으면 비활성. zone=true 인 건 제외(영역 한정). */
export function derivePostFX(objects: ReadonlyArray<{ components?: ComponentInstance[] }>): PostFXSettings {
  for (const o of objects) {
    const inst = findComponent(o.components, 'postProcess');
    if (inst && !getProp(inst, 'zone', false)) return settingsFromInst(inst);
  }
  return OFF;
}

/** 영역 한정(zone=true) postProcess 볼륨들 → 박스 경계 + 설정. 플레이어가 박스 안일 때만 적용. */
export interface PostFXZone {
  cx: number; cy: number; cz: number;   // 중심
  hx: number; hy: number; hz: number;   // 반-범위 (= scale/2)
  s: PostFXSettings;
}
export function collectPostFXZones(
  objects: ReadonlyArray<{ position?: number[]; scale?: number[]; components?: ComponentInstance[]; hidden?: boolean }>,
): PostFXZone[] {
  const out: PostFXZone[] = [];
  for (const o of objects) {
    if (o.hidden) continue;
    const inst = findComponent(o.components, 'postProcess');
    if (!inst || !getProp(inst, 'zone', false)) continue;
    const pos = o.position || [0, 0, 0];
    const scl = o.scale || [1, 1, 1];
    out.push({
      cx: Number(pos[0]) || 0, cy: Number(pos[1]) || 0, cz: Number(pos[2]) || 0,
      hx: Math.abs(Number(scl[0]) || 1) / 2,
      hy: Math.abs(Number(scl[1]) || 1) / 2,
      hz: Math.abs(Number(scl[2]) || 1) / 2,
      s: settingsFromInst(inst),
    });
  }
  return out;
}

export default function PostFX({ s }: { s: PostFXSettings }) {
  if (!s.enabled) return null;

  const fx: React.ReactElement[] = [];
  // DOF 는 먼저(깊이 기반)
  if (s.dof) fx.push(<DepthOfField key="dof" focusDistance={s.dofFocus} focalLength={s.dofFocalLength} bokehScale={s.dofBokeh} />);
  if (s.pixelate > 0) fx.push(<Pixelation key="px" granularity={s.pixelate} />);
  // 색 보정
  if (s.brightness !== 0 || s.contrast !== 0) fx.push(<BrightnessContrast key="bc" brightness={s.brightness} contrast={s.contrast} />);
  if (s.saturation !== 0 || s.hue !== 0) fx.push(<HueSaturation key="hs" hue={s.hue} saturation={s.saturation} />);
  if (s.grayscale) fx.push(<ColorAverage key="gray" />);
  if (s.sepia) fx.push(<Sepia key="sep" intensity={1} />);
  if (s.bloom && s.bloomIntensity > 0) fx.push(<Bloom key="bloom" intensity={s.bloomIntensity} luminanceThreshold={s.bloomThreshold} luminanceSmoothing={0.9} mipmapBlur />);
  if (s.chromatic > 0) fx.push(<ChromaticAberration key="ca" offset={new THREE.Vector2(s.chromatic, s.chromatic)} />);
  if (s.scanline > 0) fx.push(<Scanline key="sl" density={s.scanline} />);
  if (s.grain > 0) fx.push(<Noise key="noise" premultiply opacity={s.grain} />);
  if (s.vignette > 0) fx.push(<Vignette key="vig" offset={0.3} darkness={s.vignette} />);
  if (s.toneMapping) fx.push(<ToneMapping key="tm" mode={ToneMappingMode.ACES_FILMIC} />);

  if (fx.length === 0) return null;
  return <EffectComposer>{fx}</EffectComposer>;
}
