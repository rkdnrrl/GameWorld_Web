'use client';
/**
 * Terrain Mesh — heightmap 기반 plane subdivision 렌더.
 *
 * 정점: (segments+1)x(segments+1). 각 정점에 heights[idx] Y 적용.
 * normal 자동 계산 (computeVertexNormals).
 *
 * 텍스처: 단일 textureUrl, 또는 슬로프/높이 블렌딩(평지/경사면/낮은곳 3겹).
 *  - cliff(가파른 경사) 또는 low(낮은 높이) 텍스처가 지정되면 셰이더로 자동 혼합.
 *  - 둘 다 없으면 기존 단일 텍스처/단색 동작(기존 맵 영향 없음).
 */
import React, { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { normalizeTerrain, type TerrainData } from './terrain';
import { envFx } from './envFx';

interface Props {
  terrain: TerrainData;
  /** 선택 강조 (편집 모드) */
  selected?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/** URL → 반복 텍스처. url 없으면 null. */
function makeRepeatTexture(url: string | undefined, repeat: number): THREE.Texture | null {
  if (!url) return null;
  const tex = new THREE.TextureLoader().load(url);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function TerrainMesh({ terrain, selected, castShadow = false, receiveShadow = true }: Props) {
  const t = normalizeTerrain(terrain);

  // BufferGeometry — heights 변경되면 새로 만듦 (segments 변경, 페인트 등).
  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(t.size, t.size, t.segments, t.segments);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, t.heights[i] ?? 0);
    pos.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }, [t.size, t.segments, t.heights]);
  useEffect(() => () => { geom.dispose(); }, [geom]);

  const repeat = Math.max(1, t.textureRepeat ?? 8);
  const blend = !!(t.textureUrl && (t.textureCliffUrl || t.textureLowUrl));

  const baseTex = useMemo(() => makeRepeatTexture(t.textureUrl, repeat), [t.textureUrl, repeat]);
  // cliff/low 미지정 시 base 로 폴백 → 블렌딩이 시각적 no-op.
  const cliffTex = useMemo(() => makeRepeatTexture(t.textureCliffUrl || t.textureUrl, repeat), [t.textureCliffUrl, t.textureUrl, repeat]);
  const lowTex = useMemo(() => makeRepeatTexture(t.textureLowUrl || t.textureUrl, repeat), [t.textureLowUrl, t.textureUrl, repeat]);
  useEffect(() => () => { baseTex?.dispose(); cliffTex?.dispose(); lowTex?.dispose(); }, [baseTex, cliffTex, lowTex]);

  // 비선택 시 기준색. 젖음에 의한 어둡게/거칠기/반사는 useFrame 에서 매 프레임 적용(비 자동연동 ramp).
  const baseCol = useMemo(
    () => new THREE.Color(selected ? '#a5b4fc' : (t.baseColor || '#5a8a4a')),
    [selected, t.baseColor],
  );

  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: baseTex ?? undefined,
      color: baseCol.clone(),
      roughness: 0.95,
      metalness: 0,
      envMapIntensity: 1,
    });
    const slopeCos = Math.cos((t.slopeThreshold ?? 35) * Math.PI / 180);
    const lowH = t.lowHeight ?? 0;
    const lowB = Math.max(0.1, t.lowBlend ?? 2);
    // 젖음/반사 유니폼 — useFrame 이 매 프레임 envFx 값으로 갱신(머티리얼.userData 로 공유).
    const wetU = {
      uWet:       { value: 0 },
      uPuddle:    { value: 0 },
      uSkyTop:    { value: new THREE.Color('#3f7fd6') },
      uSkyHoriz:  { value: new THREE.Color('#dfeaf2') },
      uGlintDir:  { value: new THREE.Vector3(0, 1, 0) },
      uGlintColor:{ value: new THREE.Color('#fff4e0') },
      uGlintSharp:{ value: 250 },
    };
    m.userData.wetUniforms = wetU;
    m.onBeforeCompile = (shader) => {
      // 슬로프/높이 텍스처 블렌딩 유니폼(블렌딩 켜진 경우만).
      if (blend) {
        shader.uniforms.tCliff = { value: cliffTex };
        shader.uniforms.tLow = { value: lowTex };
        shader.uniforms.uSlopeThresh = { value: slopeCos };
        shader.uniforms.uLowH = { value: lowH };
        shader.uniforms.uLowBlend = { value: lowB };
      }
      // 젖음 반사 유니폼(항상) — 같은 객체 참조라 useFrame 갱신이 그대로 전달됨.
      shader.uniforms.uWet = wetU.uWet;
      shader.uniforms.uPuddle = wetU.uPuddle;
      shader.uniforms.uSkyTop = wetU.uSkyTop;
      shader.uniforms.uSkyHoriz = wetU.uSkyHoriz;
      shader.uniforms.uGlintDir = wetU.uGlintDir;
      shader.uniforms.uGlintColor = wetU.uGlintColor;
      shader.uniforms.uGlintSharp = wetU.uGlintSharp;

      // 정점 — 월드 위치/노멀 varying (반사·블렌딩 공통)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>',
          '#include <common>\nvarying float vTerrH;\nvarying float vTerrSlope;\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 _wp = modelMatrix * vec4(position, 1.0);
          vWPos = _wp.xyz;
          vTerrH = _wp.y;
          vec3 _wn = normalize(mat3(modelMatrix) * objectNormal);
          vWNorm = _wn;
          vTerrSlope = _wn.y;`);

      // 프래그먼트 — 공통 선언(반사 유니폼 + 노이즈 + 선택적 블렌딩 유니폼)
      const blendUniforms = blend
        ? '\nuniform sampler2D tCliff;\nuniform sampler2D tLow;\nuniform float uSlopeThresh;\nuniform float uLowH;\nuniform float uLowBlend;'
        : '';
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uWet;
          uniform float uPuddle;
          uniform vec3 uSkyTop;
          uniform vec3 uSkyHoriz;
          uniform vec3 uGlintDir;
          uniform vec3 uGlintColor;
          uniform float uGlintSharp;
          varying float vTerrH;
          varying float vTerrSlope;
          varying vec3 vWPos;
          varying vec3 vWNorm;${blendUniforms}
          float _wHash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
          float _wNoise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
            float a=_wHash(i), b=_wHash(i+vec2(1.0,0.0)), c=_wHash(i+vec2(0.0,1.0)), d=_wHash(i+vec2(1.0,1.0));
            return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }`);

      // 블렌딩(있으면) + 젖음 반사값 계산. 변수는 main() 스코프라 dithering 단계까지 유효.
      const blendBlock = blend ? `
        vec3 _b = texture2D(map, vMapUv).rgb;
        vec3 _cl = texture2D(tCliff, vMapUv).rgb;
        vec3 _lo = texture2D(tLow, vMapUv).rgb;
        float _cliffF = 1.0 - smoothstep(uSlopeThresh - 0.1, uSlopeThresh + 0.1, clamp(vTerrSlope, 0.0, 1.0));
        vec3 _flat = mix(_b, _cl, _cliffF);
        float _lowF = (1.0 - smoothstep(uLowH, uLowH + uLowBlend, vTerrH)) * (1.0 - _cliffF);
        diffuseColor.rgb *= mix(_flat, _lo, _lowF);` : '';
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>${blendBlock}
          // ── 젖은 땅 하늘 반사(절차적) + 물웅덩이 마스크 ──
          vec3 _N = normalize(vWNorm);
          vec3 _V = normalize(cameraPosition - vWPos);
          float _fres = pow(clamp(1.0 - max(dot(_N, _V), 0.0), 0.0, 1.0), 4.0);
          vec3 _Rd = reflect(-_V, _N);
          vec3 _sky = mix(uSkyHoriz, uSkyTop, smoothstep(0.0, 0.55, clamp(_Rd.y, 0.0, 1.0)));
          float _glint = pow(max(dot(_Rd, normalize(uGlintDir)), 0.0), uGlintSharp);
          vec3 _refl = _sky + uGlintColor * _glint;
          // 웅덩이: uPuddle=0 → 전면 균일, 1 → 노이즈 영역만 거울
          float _cov = mix(1.0, smoothstep(0.55, 0.8, _wNoise(vWPos.xz * 0.25)), clamp(uPuddle, 0.0, 1.0));
          float _wetK = uWet * _cov;
          float _reflK = clamp(_fres * _wetK, 0.0, 0.9);`)
        // 반사를 emissive 에 더해 적용 — 씬 톤매핑과 일관(water 와 동일 패턴, GLSL 버전 무관).
        .replace('#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n totalEmissiveRadiance += _refl * _reflK;');
    };
    return m;
  }, [blend, baseTex, cliffTex, lowTex, baseCol, t.slopeThreshold, t.lowHeight, t.lowBlend]);
  useEffect(() => () => { mat.dispose(); }, [mat]);

  // 매 프레임 — 비 자동연동(envFx.rainWet) + 수동 젖음 합쳐 부드럽게 ramp, 머티리얼/유니폼 갱신.
  const curWet = useRef(0);
  useFrame((_, dt) => {
    const manual = Math.max(0, Math.min(1, t.wetness ?? 0));
    const target = Math.max(manual, envFx.rainWet);
    const tau = target > curWet.current ? 2.5 : 9;        // 젖는 건 빠르게, 마르는 건 천천히
    curWet.current += (target - curWet.current) * (1 - Math.exp(-Math.min(dt, 0.1) / tau));
    const w = curWet.current;
    mat.roughness = 0.95 - 0.78 * w;
    mat.envMapIntensity = 1 + 1.6 * w;
    if (selected) mat.color.copy(baseCol);
    else mat.color.copy(baseCol).multiplyScalar(1 - 0.45 * w);
    const u = mat.userData.wetUniforms as undefined | {
      uWet: { value: number }; uPuddle: { value: number };
      uSkyTop: { value: THREE.Color }; uSkyHoriz: { value: THREE.Color };
      uGlintDir: { value: THREE.Vector3 }; uGlintColor: { value: THREE.Color }; uGlintSharp: { value: number };
    };
    if (u) {
      u.uWet.value = w;
      u.uPuddle.value = Math.max(0, Math.min(1, t.puddles ?? 0));
      u.uSkyTop.value.copy(envFx.skyTop);
      u.uSkyHoriz.value.copy(envFx.skyHoriz);
      u.uGlintDir.value.copy(envFx.glintDir);
      u.uGlintColor.value.copy(envFx.glintColor);
      u.uGlintSharp.value = envFx.glintSharp;
    }
  });

  return (
    <mesh
      geometry={geom}
      material={mat}
      rotation={[-Math.PI / 2, 0, 0]}   // XZ 평면 (지면)
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    />
  );
}
