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

/** 표준 캐릭터 애니메이션 슬롯 — VRChat 식 5종. */
export type CharacterAnimSlot = 'idle' | 'walk' | 'run' | 'jump' | 'fall';
export const CHARACTER_ANIM_SLOTS: readonly CharacterAnimSlot[] = ['idle', 'walk', 'run', 'jump', 'fall'];

/** 슬롯별 VRMA URL 매핑 → 각 슬롯의 AnimationClip 생성.
 *  URL 누락된 슬롯은 skip — idle 만 있어도 동작 가능 (다른 슬롯은 idle 로 fallback). */
export async function buildClipMap(
  vrm: VRM,
  urls: Partial<Record<CharacterAnimSlot, string>>,
): Promise<Map<CharacterAnimSlot, THREE.AnimationClip>> {
  const result = new Map<CharacterAnimSlot, THREE.AnimationClip>();
  const entries = Object.entries(urls).filter(([, u]) => !!u) as [CharacterAnimSlot, string][];
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
