/**
 * VRM Animation (.vrma) 로더 — VRM 1.0 표준 포맷.
 *
 * VRMA 는 VRM humanoid bone + expression + lookAt 트랙을 가진 GLB.
 * @pixiv/three-vrm-animation 의 createVRMAnimationClip(vrmAnim, vrm) →
 * vrm 인스턴스에 적용 가능한 THREE.AnimationClip 생성.
 *
 * Mixamo FBX retargeting 완전 폐기 — VRMA 만 사용.
 */

import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip, type VRMAnimation } from '@pixiv/three-vrm-animation';
import { ANIM_SLOTS, HUMANOID_BONES, detectHumanoidName, type AnimSlot, type HumanoidBoneName } from './humanoid';

/** .vrma 파일 1개 로드 → VRMAnimation 인스턴스. */
export async function loadVRMA(url: string): Promise<VRMAnimation> {
  const gltf = await new Promise<{ userData: { vrmAnimations?: VRMAnimation[] } }>((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
    loader.load(url, resolve as never, undefined, reject);
  });
  const list = gltf.userData?.vrmAnimations;
  if (!list || list.length === 0) throw new Error('VRMA 데이터가 없습니다');
  return list[0];
}

/** VRMA → 특정 VRM 인스턴스용 AnimationClip. */
export function vrmaToClip(vrma: VRMAnimation, vrm: VRM, name?: string): THREE.AnimationClip {
  const clip = createVRMAnimationClip(vrma, vrm);
  if (name) clip.name = name;
  return clip;
}

/**
 * FBX → VRM AnimationClip — OWNverse vrm-viewer 방식.
 *
 * Mixamo FBX (또는 다른 humanoid 표준 rig) 의 본 회전을 직접 VRM 의 normalized humanoid 본에 적용.
 * vrm.humanoid 가 rest pose 보정 자동 처리. Mixamo T-pose ↔ VRM T-pose 호환.
 *
 * @param url .fbx 파일 URL
 * @param vrm 캐릭터의 VRM 인스턴스
 * @param name clip 이름
 */
export async function fbxToVrmClip(
  url: string,
  vrm: VRM,
  name: string,
): Promise<THREE.AnimationClip> {
  const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
  const fbx = await new Promise<THREE.Object3D & { animations?: THREE.AnimationClip[] }>(
    (resolve, reject) => new FBXLoader().load(url, resolve as never, undefined, reject)
  );
  const clip = fbx.animations?.[0];
  if (!clip) throw new Error(`FBX 에 애니메이션 없음: ${url}`);

  // humanoid name → normalized bone 이름 매핑 (캐릭터의 vrm 기준)
  const humanoidToNormName = new Map<HumanoidBoneName, string>();
  for (const h of HUMANOID_BONES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const node = (vrm as any).humanoid?.getNormalizedBoneNode?.(h);
    if (node?.name) humanoidToNormName.set(h, node.name);
  }

  const validTracks: THREE.KeyframeTrack[] = [];
  for (const track of clip.tracks) {
    const dotIdx = track.name.indexOf('.');
    if (dotIdx < 0) continue;
    const fbxBoneName = track.name.substring(0, dotIdx);
    const prop = track.name.substring(dotIdx + 1);

    // scale 트랙 제외 — VRMA spec 위반 + Mixamo 노이즈
    if (prop.startsWith('scale')) continue;
    // position 은 hips 만 — 나머지는 본 길이가 달라 어색 (VRMA spec 도 hips position 만 허용)
    const humanoidName = detectHumanoidName(fbxBoneName);
    if (!humanoidName) continue;
    if (prop.startsWith('position') && humanoidName !== 'hips') continue;

    const targetBoneName = humanoidToNormName.get(humanoidName);
    if (!targetBoneName) continue;

    const cloned = track.clone();
    cloned.name = `${targetBoneName}.${prop}`;
    validTracks.push(cloned);
  }

  if (validTracks.length === 0) throw new Error('FBX → VRM 매핑 결과 비어있음');
  return new THREE.AnimationClip(name, clip.duration, validTracks);
}

/**
 * Universal VRMA → AnimationClip — vrm 인스턴스 없이 humanoid bones map 만으로 retarget.
 *
 * VRChat 식 — 캐릭터 측 humanoid abstraction (bones map) 통과시켜
 * VRM / Mixamo FBX / ReadyPlayerMe / 어떤 포맷이든 같은 모션 적용.
 *
 * VRMA 의 humanoidTracks (이미 humanoid bone 단위로 분리됨) 의 track name 을
 * 캐릭터의 실제 본 이름으로 rename. mixer 가 raw scene 에서 직접 binding.
 *
 * @param vrma 로드된 VRMAnimation
 * @param bones humanoid name → 실제 Object3D 매핑 (humanoidLoader 가 만든 것)
 * @param name clip 이름
 */
export function vrmaToUniversalClip(
  vrma: VRMAnimation,
  bones: Partial<Record<HumanoidBoneName, THREE.Object3D>>,
  name: string,
): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];

  // 회전 track — humanoid bone 별 quaternion
  for (const [humanoidName, track] of vrma.humanoidTracks.rotation) {
    const bone = bones[humanoidName as HumanoidBoneName];
    if (!bone || !bone.name) continue;
    const cloned = track.clone();
    cloned.name = `${bone.name}.quaternion`;
    tracks.push(cloned);
  }

  // hips position track — 유일한 translation
  for (const [humanoidName, track] of vrma.humanoidTracks.translation) {
    const bone = bones[humanoidName as HumanoidBoneName];
    if (!bone || !bone.name) continue;
    const cloned = track.clone();
    cloned.name = `${bone.name}.position`;
    tracks.push(cloned);
  }

  return new THREE.AnimationClip(name, vrma.duration, tracks);
}

/**
 * 표준 캐릭터 애니메이션 슬롯 — humanoid.ts 의 13슬롯 재사용.
 * 이전 이름 (CharacterAnimSlot) 은 alias 로 유지 (코드 호환).
 */
export type CharacterAnimSlot = AnimSlot;
export const CHARACTER_ANIM_SLOTS: readonly AnimSlot[] = ANIM_SLOTS;

/** 슬롯별 VRMA URL 매핑 → 각 슬롯의 AnimationClip 생성.
 *  URL 누락된 슬롯은 skip — setSlot 내부 fallback chain 으로 자동 대체. */
export async function buildClipMap(
  vrm: VRM,
  urls: Partial<Record<AnimSlot, string>>,
): Promise<Map<AnimSlot, THREE.AnimationClip>> {
  const result = new Map<AnimSlot, THREE.AnimationClip>();
  const entries = Object.entries(urls).filter(([, u]) => !!u) as [AnimSlot, string][];
  await Promise.all(entries.map(async ([slot, url]) => {
    try {
      const vrma = await loadVRMA(url);
      result.set(slot, vrmaToClip(vrma, vrm, slot));
    } catch (e) {
      console.warn(`[vrm-anim] ${slot} 로드 실패:`, e);
    }
  }));
  return result;
}
