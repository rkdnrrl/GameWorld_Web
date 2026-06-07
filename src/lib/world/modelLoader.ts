/**
 * 정적 3D 모델 범용 로더 — 확장자 기반 자동 dispatch.
 * 지원: FBX, GLB/GLTF, COLLADA(.dae), OBJ
 *
 * 캐릭터 애니메이션 시스템(WorldCanvas CustomModel) 은 별도로 FBX 만 사용.
 * 이 헬퍼는 맵 오브젝트(가구, 소품, SketchUp export 모델 등) 용.
 */

import * as THREE from 'three';

// DRACO 디코더 (CDN 호스팅 WASM) — 같은 인스턴스를 모든 GLB 로드에 재사용 (워커 thread 풀 공유).
// 압축 GLB (DRACO 적용) 면 모델 크기 5~10× 작아지고 디코딩 후 같은 BufferGeometry.
let _dracoLoaderPromise: Promise<unknown> | null = null;
async function getSharedDracoLoader() {
  if (!_dracoLoaderPromise) {
    _dracoLoaderPromise = (async () => {
      const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js');
      const loader = new DRACOLoader();
      loader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
      loader.setDecoderConfig({ type: 'js' });   // 'wasm' 도 있지만 호환성 위해 js
      return loader;
    })();
  }
  return _dracoLoaderPromise;
}

// Meshopt 디코더 — gltf-pack 등으로 압축된 GLB 디코딩.
let _meshoptPromise: Promise<unknown> | null = null;
async function getSharedMeshopt() {
  if (!_meshoptPromise) {
    _meshoptPromise = (async () => {
      const mod = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
      // ready 가 Promise 면 await
      const decoder = (mod as { MeshoptDecoder: unknown }).MeshoptDecoder;
      const ready = (decoder as { ready?: Promise<void> }).ready;
      if (ready) await ready;
      return decoder;
    })();
  }
  return _meshoptPromise;
}

export type SupportedModelExt = 'fbx' | 'glb' | 'gltf' | 'vrm' | 'dae' | 'obj';

export const SUPPORTED_MODEL_EXTENSIONS: readonly SupportedModelExt[] = ['fbx', 'glb', 'gltf', 'vrm', 'dae', 'obj'];

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
 *
 * manager: 선택. 넘기면 로더(및 그 텍스처 로드)가 이 LoadingManager 를 사용 →
 * 호출부에서 텍스처 로드 완료 시점을 추적할 수 있다(썸네일 생성 등). 안 넘기면 기존 동작.
 */
export async function loadStaticModel(url: string, manager?: THREE.LoadingManager): Promise<THREE.Object3D> {
  const ext = detectModelExt(url);

  if (ext === 'glb' || ext === 'gltf' || ext === 'vrm') {
    // VRMLoaderPlugin 도 등록 — VRoid 등 VRM 캐릭터의 MToon 머티리얼 정상 복원.
    // 일반 GLB 면 plugin 이 noop, gltf.userData.vrm 은 undefined.
    const [{ GLTFLoader }, draco, meshopt, vrmMod] = await Promise.all([
      import('three/examples/jsm/loaders/GLTFLoader.js'),
      getSharedDracoLoader(),
      getSharedMeshopt(),
      import('@pixiv/three-vrm'),
    ]);
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader(manager);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      loader.setDRACOLoader(draco as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      loader.setMeshoptDecoder(meshopt as any);
      loader.register((parser) => new vrmMod.VRMLoaderPlugin(parser));
      loader.load(url, (gltf) => {
        const vrm = gltf.userData?.vrm;
        if (vrm) {
          // VRM 0.x 는 forward Z+, 1.0 정렬로 회전 (1.0 모델에선 throw → 무시)
          try { vrmMod.VRMUtils.rotateVRM0(vrm); } catch { /* noop */ }
          // mixamoRig.findMixamoCompatibleBones 가 VRM humanoid API 우선 사용하도록 부착.
          // string-match alias 의존 X → 본 매칭 신뢰성 100%.
          if (vrm.humanoid) vrm.scene.userData.vrmHumanoid = vrm.humanoid;
          // expressionManager / vrm 인스턴스 전체도 (lipSync 등이 접근).
          vrm.scene.userData.vrm = vrm;
          vrm.scene.animations = gltf.animations || [];   // Animator 컴포넌트가 재생할 클립 보존
          resolve(vrm.scene);
        } else {
          gltf.scene.animations = gltf.animations || [];  // Animator 컴포넌트가 재생할 클립 보존
          resolve(gltf.scene);
        }
      }, undefined, reject);
    });
  }

  if (ext === 'dae') {
    const { ColladaLoader } = await import('three/examples/jsm/loaders/ColladaLoader.js');
    return new Promise((resolve, reject) => {
      new ColladaLoader(manager).load(url, (col) => {
        if (col?.scene) resolve(col.scene);
        else reject(new Error('COLLADA scene 없음'));
      }, undefined, reject);
    });
  }

  if (ext === 'obj') {
    const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
    return new Promise((resolve, reject) => {
      new OBJLoader(manager).load(url, resolve, undefined, reject);
    });
  }

  // 기본 FBX (확장자 없거나 모름이면 FBX 시도)
  const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
  return new Promise((resolve, reject) => {
    new FBXLoader(manager).load(url, resolve, undefined, reject);
  });
}
