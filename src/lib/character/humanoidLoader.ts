/**
 * 포맷 무관 Humanoid 로더 — VRChat 식.
 *
 * 어떤 포맷이든 같은 humanoid bone map 으로 정규화:
 *   - VRM: vrm.humanoid 의 normalized bone → 정확 (alias 불필요)
 *   - FBX/GLB/GLTF/DAE/OBJ: 본 이름 alias 검색 + 사용자 수동 매핑 fallback
 *
 * 반환된 bones map 은 humanoidCharacter 가 lipSync/lookAt/retargeting 에 사용.
 */

import * as THREE from 'three';
import {
  detectHumanoidName,
  HUMANOID_BONES,
  REQUIRED_HUMANOID_BONES,
  type HumanoidBoneName,
} from './humanoid';

export interface HumanoidLoadResult {
  /** 렌더링 대상 root (씬에 add 할 Object3D). */
  root: THREE.Object3D;
  /** humanoid 표준 본 이름 → 실제 Three.js Bone 또는 Object3D 객체. */
  bones: Partial<Record<HumanoidBoneName, THREE.Object3D>>;
  /** VRM 일 때만 채워짐 — humanoidCharacter 가 lookAt/expression 등 직접 활용. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vrm?: any;
  /** 모델 안에 존재하는 모든 bone 이름 (수동 매핑 UI 의 드롭다운 옵션). */
  allBoneNames: string[];
  /** 모델 안 morph target 이름 모음 (표정 매핑 UI 용). */
  allMorphTargets: string[];
  /** 자동 매칭 진단 — UI 에 표시. */
  diagnosis: {
    total: number;
    matched: number;
    missingRequired: HumanoidBoneName[];
    missingOptional: HumanoidBoneName[];
  };
}

export interface HumanoidLoadOptions {
  /** 사용자 수동 매핑 — 자동 매칭 결과 위에 덮어씀.
   *  자동 매칭이 틀린 본을 사용자가 character page 에서 수정 → DB 저장 → 다음 로드 시 적용. */
  manualBoneMap?: Partial<Record<HumanoidBoneName, string>>;
}

/** 확장자 기반 포맷 감지. */
function detectExt(url: string): 'vrm' | 'glb' | 'gltf' | 'fbx' | 'dae' | 'obj' | null {
  const m = url.split('?')[0].split('#')[0].toLowerCase().match(/\.(vrm|glb|gltf|fbx|dae|obj)$/);
  return m ? (m[1] as 'vrm' | 'glb' | 'gltf' | 'fbx' | 'dae' | 'obj') : null;
}

/** scene 안 bone 들 + morph target 모음. */
function collectBonesAndMorphs(root: THREE.Object3D): {
  boneByName: Map<string, THREE.Object3D>;
  morphTargets: string[];
} {
  const boneByName = new Map<string, THREE.Object3D>();
  const morphSet = new Set<string>();
  root.traverse((o) => {
    // 1) 명시적 Bone
    if ((o as THREE.Bone).isBone) boneByName.set(o.name, o);
    // 2) SkinnedMesh.skeleton.bones (Bone 인스턴스가 scene tree 밖에 있을 수도)
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh && sm.skeleton?.bones) {
      for (const b of sm.skeleton.bones) boneByName.set(b.name, b);
      // morphTargetDictionary 수집
      const dict = (sm.morphTargetDictionary || (sm as unknown as { geometry?: { morphAttributes?: unknown } }).geometry);
      if (sm.morphTargetDictionary) {
        for (const n of Object.keys(sm.morphTargetDictionary)) morphSet.add(n);
      }
      void dict;
    }
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.morphTargetDictionary) {
      for (const n of Object.keys(mesh.morphTargetDictionary)) morphSet.add(n);
    }
  });
  return { boneByName, morphTargets: [...morphSet].sort() };
}

/** 자동 매칭 + 수동 매핑 적용 → 최종 humanoid bones map. */
function buildBoneMap(
  boneByName: Map<string, THREE.Object3D>,
  manualMap: Partial<Record<HumanoidBoneName, string>> = {},
): Partial<Record<HumanoidBoneName, THREE.Object3D>> {
  const result: Partial<Record<HumanoidBoneName, THREE.Object3D>> = {};

  // 1) 자동 매칭 — 본 이름 alias 검색
  for (const [boneName, bone] of boneByName) {
    const humanoidName = detectHumanoidName(boneName);
    if (humanoidName && !result[humanoidName]) result[humanoidName] = bone;
  }

  // 2) 수동 매핑 override — 사용자 지정이 최우선
  for (const [humanoidNameKey, boneName] of Object.entries(manualMap)) {
    if (!boneName) continue;
    const bone = boneByName.get(boneName);
    if (bone) result[humanoidNameKey as HumanoidBoneName] = bone;
  }

  return result;
}

/** 매칭 진단 — UI 에 "32 중 28 매칭" 같은 피드백 표시. */
function diagnose(bones: Partial<Record<HumanoidBoneName, THREE.Object3D>>): HumanoidLoadResult['diagnosis'] {
  const total = HUMANOID_BONES.length;
  const matched = Object.keys(bones).length;
  const missingRequired: HumanoidBoneName[] = [];
  const missingOptional: HumanoidBoneName[] = [];
  for (const name of HUMANOID_BONES) {
    if (bones[name]) continue;
    if ((REQUIRED_HUMANOID_BONES as readonly HumanoidBoneName[]).includes(name)) missingRequired.push(name);
    else missingOptional.push(name);
  }
  return { total, matched, missingRequired, missingOptional };
}

/** 메인 로더 — 어떤 포맷이든 HumanoidLoadResult 반환. */
export async function loadHumanoid(url: string, opts: HumanoidLoadOptions = {}): Promise<HumanoidLoadResult> {
  const ext = detectExt(url);
  if (!ext) throw new Error(`지원하지 않는 확장자: ${url}`);

  // ── 1) VRM: 가장 정확. humanoid 표준 본 이미 정의됨 ──
  if (ext === 'vrm') {
    const [{ GLTFLoader }, vrmMod] = await Promise.all([
      import('three/examples/jsm/loaders/GLTFLoader.js'),
      import('@pixiv/three-vrm'),
    ]);
    const gltf = await new Promise<{ userData: { vrm?: unknown }; scene: THREE.Object3D }>((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.register((parser) => new vrmMod.VRMLoaderPlugin(parser));
      loader.load(url, resolve as never, undefined, reject);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vrm: any = gltf.userData?.vrm;
    if (!vrm) throw new Error('.vrm 인데 VRM 데이터가 없음');

    // VRM 0.x → 1.0 좌표계 정렬 (1.0 모델에선 noop)
    try { vrmMod.VRMUtils.rotateVRM0(vrm); } catch { /* noop */ }
    // MToon(애니 툰 셰이더) → MeshStandardMaterial(물리 PBR) 변환.
    //   - MToon 은 비-PBR 툰 셰이더라 빛이 없어도 shade 색으로 항상 밝게 보임("빛 없이 빛남").
    //     PBR 로 바꾸면 빛 없으면 어두워지고/빛 있으면 밝아짐 = 조명에 정상 반응 + fps 약간 개선.
    //   - 텍스처/색/노멀/emissive(눈 등 발광부) 보존. transparent → alphaTest (depth sort 비용 0).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toStandard = (mat: any): THREE.Material => {
      const std = new THREE.MeshStandardMaterial({
        map: mat.map ?? null,
        color: mat.color?.clone?.() ?? new THREE.Color(0xffffff),
        normalMap: mat.normalMap ?? null,
        emissive: mat.emissive?.clone?.() ?? new THREE.Color(0x000000),
        emissiveMap: mat.emissiveMap ?? null,
        emissiveIntensity: typeof mat.emissiveIntensity === 'number' ? mat.emissiveIntensity : 1,
        roughness: 0.85,
        metalness: 0,
        side: mat.side ?? THREE.FrontSide,
      });
      std.name = mat.name;
      if (mat.transparent) { std.alphaTest = 0.5; std.depthWrite = true; }
      else if (typeof mat.alphaTest === 'number' && mat.alphaTest > 0) { std.alphaTest = mat.alphaTest; }
      try { mat.dispose?.(); } catch { /* noop */ }
      return std;
    };
    vrm.scene.traverse((c: THREE.Object3D) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const out = mats.map((mat) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (mat && (mat as any).isMToonMaterial) return toStandard(mat);
        // 비-MToon — transparent → alphaTest 만
        if (mat && mat.transparent) {
          mat.transparent = false; mat.alphaTest = 0.5; mat.depthWrite = true; mat.needsUpdate = true;
        }
        return mat;
      });
      m.material = Array.isArray(m.material) ? out : out[0];
    });

    const { boneByName, morphTargets } = collectBonesAndMorphs(vrm.scene);

    // VRM humanoid API → normalized bone 우선 (T-pose rest, Mixamo 모션과 호환).
    // raw bone driving 시 A-pose rest 와 T-pose 모션 합성으로 다리/관절 비틀림 발생.
    const bones: Partial<Record<HumanoidBoneName, THREE.Object3D>> = {};
    if (vrm.humanoid) {
      for (const name of HUMANOID_BONES) {
        const node = vrm.humanoid.getNormalizedBoneNode?.(name) || vrm.humanoid.getRawBoneNode?.(name);
        if (node?.name) bones[name] = node;
      }
    }
    // 자동 매칭 + 수동 매핑 — VRM humanoid 가 못 찾은 본 보강
    const aliasBones = buildBoneMap(boneByName, opts.manualBoneMap);
    for (const [k, v] of Object.entries(aliasBones)) {
      if (!bones[k as HumanoidBoneName] && v) bones[k as HumanoidBoneName] = v;
    }

    // userData 에 vrm 부착 — 외부 코드가 활용
    vrm.scene.userData.vrm = vrm;

    return {
      root: vrm.scene,
      bones,
      vrm,
      allBoneNames: [...boneByName.keys()].sort(),
      allMorphTargets: morphTargets,
      diagnosis: diagnose(bones),
    };
  }

  // ── 2) GLB / GLTF ──
  if (ext === 'glb' || ext === 'gltf') {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) => {
      new GLTFLoader().load(url, resolve as never, undefined, reject);
    });
    gltf.scene.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) { m.frustumCulled = false; m.castShadow = true; }
    });
    const { boneByName, morphTargets } = collectBonesAndMorphs(gltf.scene);
    const bones = buildBoneMap(boneByName, opts.manualBoneMap);
    return {
      root: gltf.scene,
      bones,
      allBoneNames: [...boneByName.keys()].sort(),
      allMorphTargets: morphTargets,
      diagnosis: diagnose(bones),
    };
  }

  // ── 3) FBX ──
  if (ext === 'fbx') {
    const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
    const fbx = await new Promise<THREE.Object3D>((resolve, reject) => {
      new FBXLoader().load(url, resolve, undefined, reject);
    });
    fbx.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) { m.frustumCulled = false; m.castShadow = true; }
    });
    const { boneByName, morphTargets } = collectBonesAndMorphs(fbx);
    const bones = buildBoneMap(boneByName, opts.manualBoneMap);
    return {
      root: fbx,
      bones,
      allBoneNames: [...boneByName.keys()].sort(),
      allMorphTargets: morphTargets,
      diagnosis: diagnose(bones),
    };
  }

  // ── 4) DAE / OBJ ── (잘 안 쓰이지만 호환성 유지)
  if (ext === 'dae') {
    const { ColladaLoader } = await import('three/examples/jsm/loaders/ColladaLoader.js');
    const col = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) => {
      new ColladaLoader().load(url, resolve as never, undefined, reject);
    });
    const { boneByName, morphTargets } = collectBonesAndMorphs(col.scene);
    const bones = buildBoneMap(boneByName, opts.manualBoneMap);
    return {
      root: col.scene,
      bones,
      allBoneNames: [...boneByName.keys()].sort(),
      allMorphTargets: morphTargets,
      diagnosis: diagnose(bones),
    };
  }
  if (ext === 'obj') {
    const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
    const obj = await new Promise<THREE.Object3D>((resolve, reject) => {
      new OBJLoader().load(url, resolve, undefined, reject);
    });
    // OBJ 는 본 없음 — 캐릭터 불가, mesh 만
    return {
      root: obj,
      bones: {},
      allBoneNames: [],
      allMorphTargets: [],
      diagnosis: { total: HUMANOID_BONES.length, matched: 0, missingRequired: [...REQUIRED_HUMANOID_BONES], missingOptional: [] },
    };
  }

  throw new Error(`알 수 없는 확장자: ${ext}`);
}
