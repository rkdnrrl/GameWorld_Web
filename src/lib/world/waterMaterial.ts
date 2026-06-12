'use client';
/**
 * 반사·광택 강화 물 머티리얼.
 *  - 낮은 거칠기 + envMapIntensity → 씬 환경(HDRI/Environment)이 있으면 실제 반사.
 *  - fresnel: 시선이 수면과 평행할수록(가장자리) 하늘색 반사감 → HDRI 없어도 반사처럼 보임.
 *  - 은은한 잔물결 글린트(움직이는 반짝임).
 * userData.uTime.value 를 호출부 useFrame 에서 매 프레임 갱신.
 *
 * ※ 진짜 거울 반사(planar mirror)는 별도 render pass 라 비용/리스크 큼 → 여기선 셰이딩 기반.
 */
import * as THREE from 'three';

export function makeWaterMaterial(color: string, reflect = false): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity: reflect ? 0.45 : 0.82,   // 거울 반사 켜면 아래 reflector 가 비치도록 더 투명하게
    roughness: 0.1,
    metalness: 0.0,
    side: THREE.DoubleSide,
    envMapIntensity: 1.5,
  });
  const uT = { value: 0 };
  m.userData.uTime = uT;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uT;
    // 윗면 가장자리(물가) 거품 띠 — position.xz 가 ±0.5 에 가까운 정점(top, y>-0.5)만.
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vEdge;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float _ev = max(abs(position.x), abs(position.z));
        vEdge = (position.y > -0.5) ? smoothstep(0.40, 0.49, _ev) : 0.0;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vEdge;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec3 _vd = normalize(vViewPosition);
        float _fres = pow(1.0 - clamp(dot(normalize(normal), _vd), 0.0, 1.0), 3.0);   // 가장자리 반사
        vec3 _sky = vec3(0.5, 0.68, 0.9);
        float _g = sin(vViewPosition.x * 0.7 + uTime * 1.4) * cos(vViewPosition.z * 0.7 - uTime * 1.1);
        float _glint = pow(max(0.0, _g), 16.0) * 0.25;                                 // 움직이는 반짝임
        float _foam = vEdge * (0.55 + 0.45 * sin(vViewPosition.x * 3.0 + uTime * 3.0));// 물가 거품(일렁임)
        totalEmissiveRadiance += _sky * _fres * 0.45 + vec3(_glint) + vec3(max(0.0, _foam) * 0.5);
      `);
  };
  return m;
}
