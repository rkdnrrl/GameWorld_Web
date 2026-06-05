/**
 * 포맷 무관 애니메이션 retargeting.
 *
 * 어떤 클립이든 (Mixamo FBX, GLB embedded, VRMA) 캐릭터의 humanoid 본에 적용.
 *
 * 흐름:
 *   1. 운영자가 idle/walk/run/jump/fall VRMA 또는 Mixamo FBX 업로드 → 1번 등록
 *   2. 캐릭터별 humanoid bones map (포맷 무관) 가지고 있음
 *   3. retargetClipToHumanoid(clip, bones) → 클립의 track 이름을 캐릭터의 실제 본 이름으로 변환
 *   4. AnimationMixer 가 그 캐릭터에 적용
 *
 * VRMA 와 Mixamo FBX 둘 다 지원 — 운영자 편의.
 */

import * as THREE from 'three';
import { detectHumanoidName, type HumanoidBoneName } from './humanoid';

/** source skeleton + clip — SkeletonUtils.retargetClip 으로 캐릭터별 rest-pose 보정 retarget. */
export interface AnimationSource {
  /** source FBX/GLB 의 root Object3D (skeleton 포함) */
  root: THREE.Object3D;
  /** source 의 원본 clip (본 이름 변환 안 된 raw) */
  clip: THREE.AnimationClip;
}

/** 어떤 포맷의 애니메이션 파일이든 raw source 로드 (source root + clip). SkeletonUtils retarget 용. */
export async function loadAnimationSource(url: string, name?: string): Promise<AnimationSource> {
  const ext = (url.split('?')[0].split('#')[0].split('.').pop() || '').toLowerCase();
  if (ext === 'fbx') {
    const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
    const fbx = await new Promise<THREE.Object3D & { animations?: THREE.AnimationClip[] }>((resolve, reject) =>
      new FBXLoader().load(url, resolve as never, undefined, reject)
    );
    const clip = fbx.animations?.[0];
    if (!clip) throw new Error(`FBX 에 애니메이션 없음: ${url}`);
    if (name) clip.name = name;
    return { root: fbx, clip };
  }
  if (ext === 'glb' || ext === 'gltf' || ext === 'vrma') {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const gltf = await new Promise<{ scene: THREE.Object3D; animations?: THREE.AnimationClip[] }>((resolve, reject) =>
      new GLTFLoader().load(url, resolve as never, undefined, reject)
    );
    const clip = gltf.animations?.[0];
    if (!clip) throw new Error(`GLB/VRMA 에 애니메이션 없음: ${url}`);
    if (name) clip.name = name;
    return { root: gltf.scene, clip };
  }
  throw new Error(`지원 안 함 확장자: ${ext}`);
}

/** FBX/GLB 애니메이션 → target 캐릭터 본 이름 매핑.
 *
 *  이전엔 SkeletonUtils.retargetClip 사용했지만 출력 트랙 이름이 `bones[xxx].quaternion`
 *  형식 (skeleton binding) 이라 우리 mixer (scene root) 와 호환 안 됨 → 트랙 binding 실패
 *  또는 잘못된 본 driving. 단순 본 이름 rename 으로 대체:
 *    1. source 트랙 이름 → humanoid 표준 (alias 검색)
 *    2. humanoid → target 본 객체 → 트랙 이름을 그 본 이름으로 rewrite
 *
 *  Mixamo 캐릭터 + Mixamo 애니메이션처럼 rest pose 가 동일한 케이스는 완벽 동작.
 *  rest pose 가 다른 경우 (T-pose vs A-pose) 는 fbxToVrmClip 경로 (VRM 한정) 가 처리.
 *
 *  @param source 사용 안 함 (호환성 유지 — 옛 시그니처)
 *  @param clip source clip (raw 본 이름)
 *  @param targetBones 캐릭터의 humanoid → 실제 본 매핑
 */
export async function retargetWithSkeletonUtils(
  source: THREE.Object3D,
  clip: THREE.AnimationClip,
  targetBones: Partial<Record<HumanoidBoneName, THREE.Object3D>>,
): Promise<THREE.AnimationClip> {
  void source;
  const normalized = normalizeClipToHumanoidNames(clip);
  const retargeted = retargetClipToHumanoid(normalized, targetBones);
  if (!retargeted.tracks.length) {
    throw new Error('단순 본 이름 매핑 결과가 비어있음 (humanoid alias 미매칭)');
  }
  return retargeted;
}

/**
 * 어떤 포맷의 애니메이션 파일이든 → humanoid normalized clip 으로 로드.
 *   .fbx / .glb / .gltf: 자체 anims[0] → normalizeClipToHumanoidNames
 *   .vrma: VRMA 의 본 이름이 이미 humanoid 표준 → 그대로 사용 (raw GLTF animations 추출)
 *
 * 반환된 clip 은 본 이름이 humanoid 표준 (hips, spine, head, ...).
 * 각 캐릭터는 retargetClipToHumanoid(clip, bones) 로 자기 본 이름에 매핑.
 */
export async function loadHumanoidClip(url: string, name: string): Promise<THREE.AnimationClip> {
  const ext = (url.split('?')[0].split('#')[0].split('.').pop() || '').toLowerCase();
  if (ext === 'fbx') {
    const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
    const fbx = await new Promise<THREE.Object3D & { animations?: THREE.AnimationClip[] }>((resolve, reject) =>
      new FBXLoader().load(url, resolve as never, undefined, reject)
    );
    const clip = fbx.animations?.[0];
    if (!clip) throw new Error(`FBX 에 애니메이션 없음: ${url}`);
    const normalized = normalizeClipToHumanoidNames(clip);
    normalized.name = name;
    return normalized;
  }
  if (ext === 'glb' || ext === 'gltf' || ext === 'vrma') {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    // VRMA 도 GLTF 기반 — 일반 GLTFLoader 로 animations 추출 가능 (humanoid bone 이름 그대로)
    const gltf = await new Promise<{ animations?: THREE.AnimationClip[] }>((resolve, reject) =>
      new GLTFLoader().load(url, resolve as never, undefined, reject)
    );
    const clip = gltf.animations?.[0];
    if (!clip) throw new Error(`GLB/VRMA 에 애니메이션 없음: ${url}`);
    const normalized = normalizeClipToHumanoidNames(clip);
    normalized.name = name;
    return normalized;
  }
  throw new Error(`지원 안 함 확장자: ${ext}`);
}

/** 한 클립 → 특정 캐릭터의 humanoid bones map 에 맞게 본 이름 변환.
 *  hips position track 은 제외 — animation author 의 캐릭터 키와 우리 캐릭터 키 차이로
 *  캐릭터가 위로 뜨거나 가라앉음. Rapier body 가 world 위치 제어하므로 회전만 적용해도 충분.
 *  VRMA path (vrmaToClip / vrmaToUniversalClip) 와 일관성 유지. */
export function retargetClipToHumanoid(
  clip: THREE.AnimationClip,
  bones: Partial<Record<HumanoidBoneName, THREE.Object3D>>,
): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  for (const track of clip.tracks) {
    const dotIdx = track.name.indexOf('.');
    if (dotIdx <= 0) { tracks.push(track.clone()); continue; }
    const trackBoneName = track.name.slice(0, dotIdx);
    const suffix = track.name.slice(dotIdx);

    // 1) 트랙의 본 이름 → humanoid 표준 이름 (alias 검색)
    const humanoidName = detectHumanoidName(trackBoneName);
    if (!humanoidName) {
      // 손가락 본 등 매칭 못 한 트랙은 skip (캐릭터에 없을 가능성)
      continue;
    }

    // hips position 제외 (회전은 유지)
    if (humanoidName === 'hips' && suffix === '.position') continue;

    // 2) 캐릭터의 그 humanoid 본 객체 → 실제 Three.js 이름 추출
    const targetBone = bones[humanoidName];
    if (!targetBone) continue;  // 그 본이 캐릭터에 매핑 안 됨 → 트랙 무시

    const cloned = track.clone();
    cloned.name = `${targetBone.name}${suffix}`;
    tracks.push(cloned);
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks, clip.blendMode);
}

/** 여러 클립 일괄 retarget. */
export function retargetClipsToHumanoid(
  clips: THREE.AnimationClip[],
  bones: Partial<Record<HumanoidBoneName, THREE.Object3D>>,
): THREE.AnimationClip[] {
  return clips.map((c) => retargetClipToHumanoid(c, bones));
}

/** AnimationClip 의 root motion (hips.position) 제거 — 캐릭터가 제자리에서 움직이게.
 *  WorldCanvas 가 캐릭터 위치를 직접 제어하므로 hip translation 은 noise. */
export function stripRootMotion(clip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks = clip.tracks.filter((t) => {
    // hips.position 트랙만 제거. hips.quaternion / hips.scale 은 유지.
    return !/\.position$/i.test(t.name) || !/hips?$/i.test(t.name.split('.')[0]);
  });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks, clip.blendMode);
}

/** 클립을 humanoid 표준 본 이름으로 직접 (캐릭터 매핑 전) 정규화.
 *  운영자가 등록하는 마스터 클립을 "humanoid normalized" 형태로 저장 →
 *  모든 캐릭터가 본인 매핑만 적용해서 사용 가능.
 *
 *  Hips position 단위 보정 — Mixamo FBX 는 cm (값 수십~수백), VRM 은 m (1.0).
 *  hips.position 의 절대값이 10 이상이면 cm 단위로 가정해 × 0.01 — VRM 캐릭터로
 *  날아가는 버그 방지. (그 이하면 m 단위 그대로) */
export function normalizeClipToHumanoidNames(clip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  for (const track of clip.tracks) {
    const dotIdx = track.name.indexOf('.');
    if (dotIdx <= 0) { tracks.push(track.clone()); continue; }
    const trackBoneName = track.name.slice(0, dotIdx);
    const suffix = track.name.slice(dotIdx);
    const humanoidName = detectHumanoidName(trackBoneName);
    if (!humanoidName) continue;
    const cloned = track.clone();
    cloned.name = `${humanoidName}${suffix}`;

    // Mixamo cm → m 자동 보정 — hips.position 만 검사 (다른 본의 position 은 거의 없음)
    if (humanoidName === 'hips' && suffix === '.position' && cloned.values.length > 0) {
      let maxAbs = 0;
      for (let i = 0; i < cloned.values.length; i++) {
        const v = Math.abs(cloned.values[i]);
        if (v > maxAbs) maxAbs = v;
      }
      if (maxAbs > 10) {
        // cm 단위 가정 — m 로 변환
        for (let i = 0; i < cloned.values.length; i++) cloned.values[i] *= 0.01;
      }
    }
    tracks.push(cloned);
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks, clip.blendMode);
}
