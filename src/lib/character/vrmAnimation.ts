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
import { ANIM_SLOTS, type AnimSlot, type HumanoidBoneName } from './humanoid';

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

/** VRMA → 특정 VRM 인스턴스용 AnimationClip.
 *  hips position track 무조건 strip — animation Y 가 author 캐릭터 절대값이라 mismatch 로 sink/float.
 *  Crouch 슬롯의 hips lowering 은 HumanoidMesh 에서 calibrateCrouchHipsTrack 으로 자동 측정 후 주입. */
export function vrmaToClip(vrma: VRMAnimation, vrm: VRM, name?: string): THREE.AnimationClip {
  const clip = createVRMAnimationClip(vrma, vrm);
  if (name) clip.name = name;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hipsBone = (vrm as any).humanoid?.getNormalizedBoneNode?.('hips');
  if (hipsBone?.name) {
    const target = `${hipsBone.name}.position`;
    clip.tracks = clip.tracks.filter((t) => t.name !== target);
  }
  return clip;
}

/**
 * Mixamo bone → VRM humanoid bone 표준 매핑.
 * 공식 three-vrm/examples/humanoidAnimation/mixamoVRMRigMap.js 그대로.
 */
const mixamoVRMRigMap: Record<string, string> = {
  mixamorigHips: 'hips',
  mixamorigSpine: 'spine',
  mixamorigSpine1: 'chest',
  mixamorigSpine2: 'upperChest',
  mixamorigNeck: 'neck',
  mixamorigHead: 'head',
  mixamorigLeftShoulder: 'leftShoulder',
  mixamorigLeftArm: 'leftUpperArm',
  mixamorigLeftForeArm: 'leftLowerArm',
  mixamorigLeftHand: 'leftHand',
  mixamorigLeftHandThumb1: 'leftThumbMetacarpal',
  mixamorigLeftHandThumb2: 'leftThumbProximal',
  mixamorigLeftHandThumb3: 'leftThumbDistal',
  mixamorigLeftHandIndex1: 'leftIndexProximal',
  mixamorigLeftHandIndex2: 'leftIndexIntermediate',
  mixamorigLeftHandIndex3: 'leftIndexDistal',
  mixamorigLeftHandMiddle1: 'leftMiddleProximal',
  mixamorigLeftHandMiddle2: 'leftMiddleIntermediate',
  mixamorigLeftHandMiddle3: 'leftMiddleDistal',
  mixamorigLeftHandRing1: 'leftRingProximal',
  mixamorigLeftHandRing2: 'leftRingIntermediate',
  mixamorigLeftHandRing3: 'leftRingDistal',
  mixamorigLeftHandPinky1: 'leftLittleProximal',
  mixamorigLeftHandPinky2: 'leftLittleIntermediate',
  mixamorigLeftHandPinky3: 'leftLittleDistal',
  mixamorigRightShoulder: 'rightShoulder',
  mixamorigRightArm: 'rightUpperArm',
  mixamorigRightForeArm: 'rightLowerArm',
  mixamorigRightHand: 'rightHand',
  mixamorigRightHandPinky1: 'rightLittleProximal',
  mixamorigRightHandPinky2: 'rightLittleIntermediate',
  mixamorigRightHandPinky3: 'rightLittleDistal',
  mixamorigRightHandRing1: 'rightRingProximal',
  mixamorigRightHandRing2: 'rightRingIntermediate',
  mixamorigRightHandRing3: 'rightRingDistal',
  mixamorigRightHandMiddle1: 'rightMiddleProximal',
  mixamorigRightHandMiddle2: 'rightMiddleIntermediate',
  mixamorigRightHandMiddle3: 'rightMiddleDistal',
  mixamorigRightHandIndex1: 'rightIndexProximal',
  mixamorigRightHandIndex2: 'rightIndexIntermediate',
  mixamorigRightHandIndex3: 'rightIndexDistal',
  mixamorigRightHandThumb1: 'rightThumbMetacarpal',
  mixamorigRightHandThumb2: 'rightThumbProximal',
  mixamorigRightHandThumb3: 'rightThumbDistal',
  mixamorigLeftUpLeg: 'leftUpperLeg',
  mixamorigLeftLeg: 'leftLowerLeg',
  mixamorigLeftFoot: 'leftFoot',
  mixamorigLeftToeBase: 'leftToes',
  mixamorigRightUpLeg: 'rightUpperLeg',
  mixamorigRightLeg: 'rightLowerLeg',
  mixamorigRightFoot: 'rightFoot',
  mixamorigRightToeBase: 'rightToes',
};

/**
 * FBX (Mixamo) → VRM AnimationClip — 공식 three-vrm `loadMixamoAnimation.js` 알고리즘.
 *
 * 핵심: Mixamo bone 의 rest world rotation 의 inverse 와 parent rest world rotation 을
 * track quaternion 양옆에 곱해서 normalized humanoid bone 의 local rotation 으로 변환.
 *   new_quat = parentRestWorldRotation * track_quat * restRotationInverse
 *
 * hips position 도 캐릭터 키 비율로 scale.
 * VRM 0.x 일 때 x/z 축 부호 반전 (좌표계 차이).
 */
export async function fbxToVrmClip(
  url: string,
  vrm: VRM,
  name: string,
): Promise<THREE.AnimationClip> {
  const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
  const asset = await new Promise<THREE.Object3D & { animations: THREE.AnimationClip[] }>(
    (resolve, reject) => new FBXLoader().load(url, resolve as never, undefined, reject)
  );
  const clip = THREE.AnimationClip.findByName(asset.animations, 'mixamo.com') ?? asset.animations[0];
  if (!clip) throw new Error(`FBX 에 애니메이션 없음: ${url}`);

  const tracks: THREE.KeyframeTrack[] = [];
  const restRotationInverse = new THREE.Quaternion();
  const parentRestWorldRotation = new THREE.Quaternion();
  const _quatA = new THREE.Quaternion();

  // hips height ratio (Mixamo 캐릭터 vs VRM 캐릭터)
  const mixamoHips = asset.getObjectByName('mixamorigHips');
  const motionHipsHeight = mixamoHips?.position.y ?? 1;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vrmHipsHeight = (vrm as any).humanoid?.normalizedRestPose?.hips?.position?.[1] ?? 1;
  const hipsPositionScale = vrmHipsHeight / motionHipsHeight;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isVrm0 = (vrm as any).meta?.metaVersion === '0';

  for (const track of clip.tracks) {
    const [mixamoRigName, propertyName] = track.name.split('.');
    const vrmBoneName = mixamoVRMRigMap[mixamoRigName];
    if (!vrmBoneName) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vrmNode = (vrm as any).humanoid?.getNormalizedBoneNode(vrmBoneName);
    if (!vrmNode?.name) continue;
    const mixamoRigNode = asset.getObjectByName(mixamoRigName) as THREE.Object3D | undefined;
    if (!mixamoRigNode) continue;

    mixamoRigNode.getWorldQuaternion(restRotationInverse).invert();
    mixamoRigNode.parent?.getWorldQuaternion(parentRestWorldRotation);

    if (track instanceof THREE.QuaternionKeyframeTrack) {
      // 각 quaternion 키프레임: parentRest * track * restInverse
      for (let i = 0; i < track.values.length; i += 4) {
        const flat: number[] = Array.from(track.values.slice(i, i + 4));
        _quatA.fromArray(flat);
        _quatA.premultiply(parentRestWorldRotation).multiply(restRotationInverse);
        _quatA.toArray(flat);
        for (let j = 0; j < 4; j++) track.values[i + j] = flat[j];
      }
      // VRM 0.x: x, z 반전
      const values = Array.from(track.values).map((v, i) => isVrm0 && i % 2 === 0 ? -v : v);
      tracks.push(new THREE.QuaternionKeyframeTrack(`${vrmNode.name}.${propertyName}`, Array.from(track.times), values));
    }
    // hips position 무조건 strip — crouch lowering 은 HumanoidMesh 에서 calibrateCrouchHipsTrack 으로 주입.
    void hipsPositionScale;
  }

  if (tracks.length === 0) throw new Error('Mixamo → VRM 매핑 결과 비어있음 (mixamorig 본 이름 확인 필요)');
  return new THREE.AnimationClip(name, clip.duration, tracks);
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

  // hips position 무조건 strip — crouch lowering 은 HumanoidMesh 에서 calibrate 로 주입.
  void name;

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
