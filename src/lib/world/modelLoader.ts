/**
 * 정적 3D 모델 범용 로더 — 확장자 기반 자동 dispatch.
 * 지원: FBX, GLB/GLTF, COLLADA(.dae), OBJ
 *
 * 캐릭터 애니메이션 시스템(WorldCanvas CustomModel) 은 별도로 FBX 만 사용.
 * 이 헬퍼는 맵 오브젝트(가구, 소품, SketchUp export 모델 등) 용.
 */

import * as THREE from 'three';

export type SupportedModelExt = 'fbx' | 'glb' | 'gltf' | 'dae' | 'obj';

export const SUPPORTED_MODEL_EXTENSIONS: readonly SupportedModelExt[] = ['fbx', 'glb', 'gltf', 'dae', 'obj'];

/** URL 의 확장자에서 모델 타입 추론. 쿼리스트링 안전. */
export function detectModelExt(url: string): SupportedModelExt | null {
  const clean = url.split('?')[0].split('#')[0].toLowerCase();
  const ext = clean.split('.').pop();
  if (!ext) return null;
  if (SUPPORTED_MODEL_EXTENSIONS.includes(ext as SupportedModelExt)) return ext as SupportedModelExt;
  return null;
}

/**
 * 확장자에 맞는 로더로 모델 로드.
 * Promise 반환 — 성공 시 Object3D, 실패 시 reject.
 */
export async function loadStaticModel(url: string): Promise<THREE.Object3D> {
  const ext = detectModelExt(url);

  if (ext === 'glb' || ext === 'gltf') {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    return new Promise((resolve, reject) => {
      new GLTFLoader().load(url, (gltf) => resolve(gltf.scene), undefined, reject);
    });
  }

  if (ext === 'dae') {
    const { ColladaLoader } = await import('three/examples/jsm/loaders/ColladaLoader.js');
    return new Promise((resolve, reject) => {
      new ColladaLoader().load(url, (col) => {
        if (col?.scene) resolve(col.scene);
        else reject(new Error('COLLADA scene 없음'));
      }, undefined, reject);
    });
  }

  if (ext === 'obj') {
    const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
    return new Promise((resolve, reject) => {
      new OBJLoader().load(url, resolve, undefined, reject);
    });
  }

  // 기본 FBX (확장자 없거나 모름이면 FBX 시도)
  const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
  return new Promise((resolve, reject) => {
    new FBXLoader().load(url, resolve, undefined, reject);
  });
}
