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
  EffectComposer, Bloom, Vignette, ChromaticAberration, BrightnessContrast, ToneMapping,
  HueSaturation, Noise, Pixelation, Scanline, Sepia, ColorAverage, N8AO, DepthOfField, SMAA, wrapEffect,
} from '@react-three/postprocessing';
import { ToneMappingMode, Effect } from 'postprocessing';
import { envFx } from './envFx';

/** 색상 틴트 — 화면 전체를 지정 색으로 물들임 (강도 0~1). 언리얼 Color Grading 의 간이판. */
class TintEffectImpl extends Effect {
  constructor({ color = '#ffffff', intensity = 0 }: { color?: string; intensity?: number } = {}) {
    super(
      'TintEffect',
      `uniform vec3 tColor; uniform float tInt;
       void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
         outputColor = vec4(mix(inputColor.rgb, inputColor.rgb * tColor, tInt), inputColor.a);
       }`,
      { uniforms: new Map<string, THREE.Uniform>([
        ['tColor', new THREE.Uniform(new THREE.Color(color))],
        ['tInt', new THREE.Uniform(intensity)],
      ]) },
    );
  }
}
const Tint = wrapEffect(TintEffectImpl);

/** 일렁임 — 화면 UV를 sin 파동으로 흔들어 수중/열기 같은 왜곡 효과 (amount=강도). */
class WobbleEffectImpl extends Effect {
  constructor({ amount = 0, speed = 1, frequency = 8 }: { amount?: number; speed?: number; frequency?: number } = {}) {
    super(
      'WobbleEffect',
      `uniform float uAmt; uniform float uSpd; uniform float uFreq; uniform float uTime;
       void mainUv(inout vec2 uv){
         uv.x += sin(uv.y * uFreq + uTime * uSpd) * uAmt;
         uv.y += cos(uv.x * uFreq + uTime * uSpd * 0.8) * uAmt;
       }`,
      { uniforms: new Map<string, THREE.Uniform>([
        ['uAmt', new THREE.Uniform(amount)],
        ['uSpd', new THREE.Uniform(speed)],
        ['uFreq', new THREE.Uniform(frequency)],
        ['uTime', new THREE.Uniform(0)],
      ]) },
    );
  }
  update(_renderer: unknown, _input: unknown, dt: number) {
    const u = this.uniforms.get('uTime'); if (u) u.value += dt;
  }
}
const Wobble = wrapEffect(WobbleEffectImpl);

/** 필름 컬러그레이드 — 색온도(웜/쿨) + filmic S커브 대비 + 섀도 리프트.
 *  실시간 렌더가 "플랫" 해 보이는 핵심 원인(선형 톤·차가운 그림자)을 영화처럼 보정. */
class FilmicGradeImpl extends Effect {
  constructor({ temperature = 0, filmic = 0, lift = 0 }: { temperature?: number; filmic?: number; lift?: number } = {}) {
    super(
      'FilmicGrade',
      `uniform float uTemp; uniform float uFilmic; uniform float uLift;
       void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
         vec3 c = inputColor.rgb;
         c.r += uTemp * 0.06; c.b -= uTemp * 0.06;       // 색온도: +웜(R↑B↓) / -쿨
         c = max(c, 0.0);
         c = c + uLift * (1.0 - c);                       // 섀도 리프트(어두운 영역 띄움 = 필름 느낌)
         // filmic S커브는 [0,1] 표시 범위에서만 — HDR(>1, 예: 태양)에 적용하면 (3-2c)<0 으로
         // 음수가 돼 밝은 영역이 검게 죽는다. [0,1] 부분만 S커브, HDR 초과분은 그대로 보존(블룸/톤매핑용).
         vec3 cc = clamp(c, 0.0, 1.0);
         vec3 s = cc * cc * (3.0 - 2.0 * cc);             // smoothstep S커브(토/숄더)
         c = mix(cc, s, uFilmic) + (c - cc);              // filmic 대비 블렌딩 + HDR 보존
         outputColor = vec4(c, inputColor.a);
       }`,
      { uniforms: new Map<string, THREE.Uniform>([
        ['uTemp', new THREE.Uniform(temperature)],
        ['uFilmic', new THREE.Uniform(filmic)],
        ['uLift', new THREE.Uniform(lift)],
      ]) },
    );
  }
}
const FilmicGrade = wrapEffect(FilmicGradeImpl);

/** 빗방울 화면 효과 — 비 올 때 화면(렌즈)에 물방울이 맺힌 듯 굴절 + 가장자리 하이라이트.
 *  uInt 는 envFx.rainWet 로 부드럽게 ramp(자체 update). 비 멈추면 0 → 효과 사라짐. */
class RainDropletsImpl extends Effect {
  constructor() {
    super(
      'RainDroplets',
      `uniform float uTime; uniform float uInt;
       vec3 _drop(vec2 uv){
         vec2 gv = uv * vec2(7.0, 5.0);
         gv.y += uTime * 0.35;                          // 방울 전체가 천천히 아래로
         vec2 id = floor(gv);
         vec2 f = fract(gv) - 0.5;
         float n  = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);
         float n2 = fract(n * 91.7);
         vec2 c = (vec2(n, n2) - 0.5) * 0.7;
         c.y += sin(uTime * (0.4 + n) + n * 6.2831) * 0.05;
         float d = length((f - c) * vec2(1.0, 1.2));
         float r = 0.12 + n2 * 0.10;
         float present = step(0.55, n);                 // 일부 셀에만 방울
         float mask = smoothstep(r, r * 0.4, d) * present;
         vec2 off = normalize(f - c + 1e-5) * mask;      // 방울 중심 향한 굴절 방향
         return vec3(off, mask);
       }
       void mainUv(inout vec2 uv){
         vec3 dp = _drop(uv);
         uv -= dp.xy * 0.012 * uInt;                     // 렌즈 굴절(작게)
       }
       void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
         float m = _drop(uv).z * uInt;
         vec3 col = inputColor.rgb;
         col += m * 0.12;                                // 방울 가장자리 하이라이트
         col *= 1.0 - m * 0.05;                          // 중심 살짝 어둡게
         outputColor = vec4(col, inputColor.a);
       }`,
      { uniforms: new Map<string, THREE.Uniform>([
        ['uTime', new THREE.Uniform(0)],
        ['uInt', new THREE.Uniform(0)],
      ]) },
    );
  }
  update(_renderer: unknown, _input: unknown, dt: number) {
    const tU = this.uniforms.get('uTime'); if (tU) tU.value += dt;
    const iU = this.uniforms.get('uInt');
    if (iU) {
      const tgt = envFx.rainWet;
      iU.value += (tgt - iU.value) * (1 - Math.exp(-Math.min(dt, 0.1) / (tgt > iU.value ? 2.0 : 5.0)));
    }
  }
}
const RainDroplets = wrapEffect(RainDropletsImpl);
import { findComponent, getProp, type ComponentInstance } from '@/lib/world/components';

export interface PostFXSettings {
  enabled: boolean;
  preset: string;            // 'none' = 수동, 그 외 = 큐레이팅된 시네마틱 룩 자동 적용
  temperature: number; filmic: number; lift: number;   // 컬러그레이드 (웜/쿨, 필름 S커브, 섀도 리프트)
  bloom: boolean; bloomIntensity: number; bloomThreshold: number;
  vignette: number;          // 0 = off
  ao: boolean; aoIntensity: number;   // SSAO 앰비언트 오클루전
  chromatic: number;         // 0 = off
  brightness: number; contrast: number;
  tintColor: string; tintStrength: number;   // 색상 틴트 (화면을 이 색으로 물들임, 0=끔)
  wobble: number;            // 일렁임(화면 왜곡) 강도 0 = off
  saturation: number; hue: number;       // 색 보정 (saturation -1..1, hue 라디안)
  grain: number;             // 필름 노이즈 0 = off
  pixelate: number;          // 픽셀화 0 = off (픽셀 크기)
  scanline: number;          // CRT 스캔라인 0 = off (밀도)
  sepia: boolean;            // 세피아 톤
  grayscale: boolean;        // 흑백
  dof: boolean; dofFocus: number; dofFocalLength: number; dofBokeh: number;
  toneMapping: boolean;
  toneMapMode: string;       // 'aces' | 'agx' | 'neutral' — 톤매핑 곡선 (toneMapping 켜졌을 때)
}

const OFF: PostFXSettings = {
  enabled: false, preset: 'none', temperature: 0, filmic: 0, lift: 0,
  bloom: false, bloomIntensity: 0, bloomThreshold: 0,
  vignette: 0, ao: false, aoIntensity: 0, chromatic: 0, brightness: 0, contrast: 0,
  tintColor: '#ffffff', tintStrength: 0, wobble: 0,
  saturation: 0, hue: 0, grain: 0, pixelate: 0, scanline: 0, sepia: false, grayscale: false,
  dof: false, dofFocus: 0, dofFocalLength: 0, dofBokeh: 0, toneMapping: false, toneMapMode: 'aces',
};

function settingsFromInst(inst: ComponentInstance): PostFXSettings {
  return {
    enabled:        getProp(inst, 'enabled', true),
    preset:         getProp(inst, 'preset', 'none'),
    temperature:    getProp(inst, 'temperature', 0),
    filmic:         getProp(inst, 'filmic', 0),
    lift:           getProp(inst, 'lift', 0),
    bloom:          getProp(inst, 'bloom', true),
    bloomIntensity: getProp(inst, 'bloomIntensity', 0.6),
    bloomThreshold: getProp(inst, 'bloomThreshold', 0.85),
    vignette:       getProp(inst, 'vignette', 0.3),
    ao:             getProp(inst, 'ao', false),
    aoIntensity:    getProp(inst, 'aoIntensity', 1),
    chromatic:      getProp(inst, 'chromatic', 0),
    brightness:     getProp(inst, 'brightness', 0),
    contrast:       getProp(inst, 'contrast', 0),
    tintColor:      getProp(inst, 'tintColor', '#ffffff'),
    tintStrength:   getProp(inst, 'tintStrength', 0),
    wobble:         getProp(inst, 'wobble', 0),
    saturation:     getProp(inst, 'saturation', 0),
    hue:            getProp(inst, 'hue', 0),
    grain:          getProp(inst, 'grain', 0),
    pixelate:       getProp(inst, 'pixelate', 0),
    scanline:       getProp(inst, 'scanline', 0),
    sepia:          getProp(inst, 'sepia', false),
    grayscale:      getProp(inst, 'grayscale', false),
    dof:            getProp(inst, 'dof', false),
    dofFocus:       getProp(inst, 'dofFocus', 0.1),
    dofFocalLength: getProp(inst, 'dofFocalLength', 0.5),
    dofBokeh:       getProp(inst, 'dofBokeh', 2),
    toneMapping:    getProp(inst, 'toneMapping', false),
    toneMapMode:    getProp(inst, 'toneMapMode', 'aces'),
  };
}

/** 전역 postProcess 볼륨 → 설정. 없으면 비활성. zone=true(영역 한정) / 물 오브젝트(물 안에서만) 는 제외. */
export function derivePostFX(objects: ReadonlyArray<{ kind?: string; components?: ComponentInstance[] }>): PostFXSettings {
  for (const o of objects) {
    if (o.kind === 'water') continue;   // 물의 PostProcess 는 물 안에서만 적용 (collectWaterPostFX)
    const inst = findComponent(o.components, 'postProcess');
    if (inst && !getProp(inst, 'zone', false)) return settingsFromInst(inst);
  }
  return OFF;
}

/** 물(water) 오브젝트에 붙은 postProcess → 물 부피(수면~바닥) + 설정. 카메라/플레이어가 그 물 안일 때만 적용. */
export interface WaterPostFX {
  cx: number; cy: number; cz: number;   // 수면 중심 (cy = 수면 Y)
  hx: number; hz: number; scaleY: number;
  waveStrength: number; waveSpeed: number; waveFreq: number; offset: number;
  s: PostFXSettings;
}
export function collectWaterPostFX(
  objects: ReadonlyArray<{ kind?: string; position?: number[]; scale?: number[]; components?: ComponentInstance[]; hidden?: boolean }>,
): WaterPostFX[] {
  const out: WaterPostFX[] = [];
  for (const o of objects) {
    if (o.kind !== 'water' || o.hidden) continue;
    const pp = findComponent(o.components, 'postProcess');
    if (!pp || !getProp(pp, 'enabled', true)) continue;
    const pos = o.position || [0, 0, 0];
    const scl = o.scale || [1, 1, 1];
    const wave = findComponent(o.components, 'wave');
    const buoy = findComponent(o.components, 'buoyancy');
    out.push({
      cx: Number(pos[0]) || 0, cy: Number(pos[1]) || 0, cz: Number(pos[2]) || 0,
      hx: Math.abs(Number(scl[0]) || 1) / 2, hz: Math.abs(Number(scl[2]) || 1) / 2, scaleY: Math.abs(Number(scl[1]) || 1),
      // 보이는 수면(WaterMesh)은 wave 컴포넌트 강도로 항상 출렁 → 후처리 경계도 동일하게 (waveBob 은 플레이어 부력용이라 무관).
      waveStrength: wave ? Number(getProp(wave, 'strength', 1)) : 0,
      waveSpeed: wave ? Number(getProp(wave, 'speed', 1)) : 1,
      waveFreq: wave ? Number(getProp(wave, 'frequency', 1)) : 1,
      offset: buoy ? Number(getProp(buoy, 'offset', 0)) : 0,
      s: settingsFromInst(pp),
    });
  }
  return out;
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

/** 원클릭 시네마틱 프리셋 — 큐레이팅된 효과 조합(노브 안 만져도 좋은 룩).
 *  toneMapping:true 필수 — PostFX 활성 시 캔버스 톤매핑이 꺼지므로 여기서 ACES 복원. */
const PRESETS: Record<string, Partial<PostFXSettings>> = {
  // 따뜻하고 영화적 — 부드러운 블룸 + 약한 비네팅·그레인 + 웜 그레이드
  // (SSAO[ao]는 프리셋에서 제외 — 무거운 depth 패스라 일부 GPU에서 멈춤. 필요하면 고급 토글로 수동 ON.)
  cinematic: { toneMapping: true, bloom: true, bloomIntensity: 0.5, bloomThreshold: 0.85,
    vignette: 0.4, grain: 0.03, contrast: 0.06, saturation: 0.1, temperature: 0.15, filmic: 0.5, lift: 0.03 },
  // 골든아워 — 강한 웜 + 부드러운 대비
  warm: { toneMapping: true, bloom: true, bloomIntensity: 0.5, vignette: 0.3, grain: 0.02,
    saturation: 0.12, temperature: 0.38, filmic: 0.4, lift: 0.02 },
  // 차갑고 청량 — 쿨 틴트 + 약간 쨍
  cool: { toneMapping: true, bloom: true, bloomIntensity: 0.45, vignette: 0.3,
    saturation: 0.06, temperature: -0.32, filmic: 0.4, lift: 0.0 },
  // 생생하게 — 채도·대비 강조
  vivid: { toneMapping: true, bloom: true, bloomIntensity: 0.6, vignette: 0.25,
    saturation: 0.35, contrast: 0.1, filmic: 0.45 },
  // 누아르 흑백 — 강한 대비·비네팅·그레인
  noir: { toneMapping: true, grayscale: true, bloom: true, bloomIntensity: 0.2,
    vignette: 0.55, grain: 0.05, contrast: 0.22, filmic: 0.6 },
  // 몽환 — 큰 블룸 + 옅은 색수차
  dream: { toneMapping: true, bloom: true, bloomIntensity: 1.0, bloomThreshold: 0.6,
    vignette: 0.35, saturation: 0.15, temperature: 0.1, chromatic: 0.0012, grain: 0.015, filmic: 0.3 },
};

/** preset 이 설정돼 있으면 그 룩으로 치환(enabled/zone 보존). 'none' 이면 수동 설정 그대로. */
function withPreset(s: PostFXSettings): PostFXSettings {
  if (!s.preset || s.preset === 'none' || !PRESETS[s.preset]) return s;
  return { ...OFF, ...PRESETS[s.preset], enabled: s.enabled };
}

export default function PostFX({ s: raw, raining = false }: { s: PostFXSettings; raining?: boolean }) {
  // 비 올 때는 유저 postProcess 볼륨이 없어도(또는 꺼져 있어도) 빗방울만 위해 컴포저를 띄운다.
  if (!raw.enabled && !raining) return null;
  const s = raw.enabled ? withPreset(raw) : OFF;

  const fx: React.ReactElement[] = [];
  // SSAO 는 가장 먼저 (씬 깊이 기반 접지 음영) — 색보정·블룸 전에 적용.
  if (s.ao) fx.push(<N8AO key="ao" halfRes aoRadius={1.5} intensity={s.aoIntensity} distanceFalloff={1} />);
  if (s.wobble > 0) fx.push(<Wobble key="wob" amount={s.wobble} speed={1.2} frequency={9} />);
  if (s.pixelate > 0) fx.push(<Pixelation key="px" granularity={s.pixelate} />);
  // 피사계심도(DoF) — 깊이 기반이라 색보정·블룸 전에 (보케 하이라이트가 블룸을 타게)
  if (s.dof) fx.push(<DepthOfField key="dof" focusDistance={s.dofFocus} focalLength={s.dofFocalLength} bokehScale={s.dofBokeh} />);
  // 컬러그레이드 (웜/쿨·필름 S커브·섀도 리프트) — 톤 보정의 핵심
  if (s.temperature !== 0 || s.filmic > 0 || s.lift !== 0) fx.push(<FilmicGrade key="grade" temperature={s.temperature} filmic={s.filmic} lift={s.lift} />);
  // 색 보정
  if (s.brightness !== 0 || s.contrast !== 0) fx.push(<BrightnessContrast key="bc" brightness={s.brightness} contrast={s.contrast} />);
  if (s.saturation !== 0 || s.hue !== 0) fx.push(<HueSaturation key="hs" hue={s.hue} saturation={s.saturation} />);
  if (s.tintStrength > 0) fx.push(<Tint key="tint" color={s.tintColor} intensity={s.tintStrength} />);
  if (s.grayscale) fx.push(<ColorAverage key="gray" />);
  if (s.sepia) fx.push(<Sepia key="sep" intensity={1} />);
  if (s.bloom && s.bloomIntensity > 0) fx.push(<Bloom key="bloom" intensity={s.bloomIntensity} luminanceThreshold={s.bloomThreshold} luminanceSmoothing={0.9} mipmapBlur />);
  if (s.chromatic > 0) fx.push(<ChromaticAberration key="ca" offset={new THREE.Vector2(s.chromatic, s.chromatic)} />);
  if (s.scanline > 0) fx.push(<Scanline key="sl" density={s.scanline} />);
  if (s.grain > 0) fx.push(<Noise key="noise" premultiply opacity={s.grain} />);
  if (s.vignette > 0) fx.push(<Vignette key="vig" offset={0.3} darkness={s.vignette} />);
  if (s.toneMapping) {
    // ACES(기본) / AgX(더 자연스러운 필믹, 하이라이트 덜 탐) / Neutral(Khronos PBR 중립)
    const tmMode = s.toneMapMode === 'agx' ? ToneMappingMode.AGX
      : s.toneMapMode === 'neutral' ? ToneMappingMode.NEUTRAL
      : ToneMappingMode.ACES_FILMIC;
    fx.push(<ToneMapping key="tm" mode={tmMode} />);
  }

  // 빗방울 렌즈 효과 — 색보정·블룸 다 끝난 최종 이미지 위에(렌즈처럼). 비 올 때만.
  if (raining) fx.push(<RainDroplets key="raindrops" />);
  if (fx.length === 0) return null;
  // SMAA — 컴포저가 켜지면 캔버스 MSAA 가 무시되므로(자체 버퍼 렌더) 가장자리 계단 방지용으로 마지막에 적용.
  fx.push(<SMAA key="smaa" />);
  return <EffectComposer>{fx}</EffectComposer>;
}
