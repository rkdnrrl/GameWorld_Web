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
import React, { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { normalizeTerrain, type TerrainData } from './terrain';

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

  const mat = useMemo(() => {
    // 젖음(wetness): 거칠기↓(반들), 색 어둡게, 환경 반사↑ — 비로 축축한 땅.
    const wet = Math.max(0, Math.min(1, t.wetness ?? 0));
    const col = new THREE.Color(selected ? '#a5b4fc' : (t.baseColor || '#5a8a4a'));
    if (!selected) col.multiplyScalar(1 - 0.45 * wet);
    const m = new THREE.MeshStandardMaterial({
      map: baseTex ?? undefined,
      color: col,
      roughness: 0.95 - 0.78 * wet,
      metalness: 0,
      envMapIntensity: 1 + 1.6 * wet,
    });
    if (blend) {
      const slopeCos = Math.cos((t.slopeThreshold ?? 35) * Math.PI / 180);
      const lowH = t.lowHeight ?? 0;
      const lowB = Math.max(0.1, t.lowBlend ?? 2);
      m.onBeforeCompile = (shader) => {
        shader.uniforms.tCliff = { value: cliffTex };
        shader.uniforms.tLow = { value: lowTex };
        shader.uniforms.uSlopeThresh = { value: slopeCos };
        shader.uniforms.uLowH = { value: lowH };
        shader.uniforms.uLowBlend = { value: lowB };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying float vTerrH;\nvarying float vTerrSlope;')
          .replace('#include <begin_vertex>',
            '#include <begin_vertex>\n vTerrH = (modelMatrix * vec4(position, 1.0)).y;\n vTerrSlope = normalize(mat3(modelMatrix) * objectNormal).y;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>',
            '#include <common>\nuniform sampler2D tCliff;\nuniform sampler2D tLow;\nuniform float uSlopeThresh;\nuniform float uLowH;\nuniform float uLowBlend;\nvarying float vTerrH;\nvarying float vTerrSlope;')
          .replace('#include <map_fragment>', `
            vec3 _b = texture2D(map, vMapUv).rgb;
            vec3 _cl = texture2D(tCliff, vMapUv).rgb;
            vec3 _lo = texture2D(tLow, vMapUv).rgb;
            float _cliffF = 1.0 - smoothstep(uSlopeThresh - 0.1, uSlopeThresh + 0.1, clamp(vTerrSlope, 0.0, 1.0));
            vec3 _flat = mix(_b, _cl, _cliffF);
            float _lowF = (1.0 - smoothstep(uLowH, uLowH + uLowBlend, vTerrH)) * (1.0 - _cliffF);
            vec3 _col = mix(_flat, _lo, _lowF);
            diffuseColor.rgb *= _col;
          `);
      };
    }
    return m;
  }, [blend, baseTex, cliffTex, lowTex, selected, t.baseColor, t.slopeThreshold, t.lowHeight, t.lowBlend, t.wetness]);
  useEffect(() => () => { mat.dispose(); }, [mat]);

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
