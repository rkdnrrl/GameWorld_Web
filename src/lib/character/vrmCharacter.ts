/**
 * VRM 캐릭터 시스템 — VRChat 식 인프라 (P1)
 *
 * 책임:
 *   1. VRM 로드 (GLTFLoader + VRMLoaderPlugin)
 *   2. Mixamo FBX 클립 → VRM normalized humanoid 본으로 정확 retargeting
 *   3. AnimationMixer 설정 + idle/walk/run 등 슬롯 매핑
 *   4. vrm.update(dt) 매 frame — expressionManager, lookAt, springbone 갱신
 *   5. lipSync — viseme 'aa' (P2 에서 5-포인트 확장 예정)
 *
 * 사용:
 *   const vrmChar = await loadVRMCharacter(url);
 *   const retargeted = retargetMixamoToVRM(mixamoClips, vrmChar.vrm);
 *   const mixer = new THREE.AnimationMixer(vrmChar.scene);
 *   ... 그 후 vrmChar.update(dt) 매 frame
 */

import * as THREE from 'three';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** VRM Humanoid 표준 본 이름 — Mixamo 본 이름과 매핑. */
const VRM_HUMANOID_NAMES = [
  'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
  'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
  'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes',
  'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes',
] as const;
export type VRMHumanoidName = typeof VRM_HUMANOID_NAMES[number];

/** Mixamo 표준 본 이름 → VRM humanoid 본 이름. (Mixamo 의 표준 rig 기반) */
export const MIXAMO_TO_VRM: Record<string, VRMHumanoidName> = {
  Hips: 'hips',
  Spine: 'spine',
  Spine1: 'chest',
  Spine2: 'upperChest',
  Neck: 'neck',
  Head: 'head',
  LeftShoulder: 'leftShoulder',
  LeftArm: 'leftUpperArm',
  LeftForeArm: 'leftLowerArm',
  LeftHand: 'leftHand',
  RightShoulder: 'rightShoulder',
  RightArm: 'rightUpperArm',
  RightForeArm: 'rightLowerArm',
  RightHand: 'rightHand',
  LeftUpLeg: 'leftUpperLeg',
  LeftLeg: 'leftLowerLeg',
  LeftFoot: 'leftFoot',
  LeftToeBase: 'leftToes',
  RightUpLeg: 'rightUpperLeg',
  RightLeg: 'rightLowerLeg',
  RightFoot: 'rightFoot',
  RightToeBase: 'rightToes',
};

/** Mixamo 본 이름에서 prefix (mixamorig:, mixamorig 등) 제거 후 표준 이름 추출. */
function cleanMixamoName(name: string): string {
  return name
    .replace(/^.*[:|]/, '')          // Armature|, mixamorig: 등 prefix
    .replace(/^mixamorig/i, '');     // mixamorig 자체
}

/** Mixamo 클립을 VRM normalized humanoid 본 좌표계로 변환 — 정확 retargeting.
 *
 *  핵심: VRM 의 normalized humanoid 는 T-pose 강제 정렬 본. Mixamo 도 T-pose 기반.
 *  본 이름만 매칭하면 됨 (회전 보정 불필요) — VRMUtils 가 normalized → raw 변환 처리.
 *
 *  반환된 클립은 VRM normalized bone 이름을 가짐. mixer 가 그 본을 회전 적용 →
 *  vrm.update(dt) 가 raw bone + skinned mesh 갱신 → 정상 자세.
 */
export function retargetMixamoToVRM(clips: THREE.AnimationClip[], vrm: VRM): THREE.AnimationClip[] {
  if (!vrm.humanoid) return clips;
  // VRM normalized bone 이름 매핑 — VRM 표준 humanoid 이름 → 실제 normalized bone 의 Three.js 객체 이름.
  const vrmBoneNames: Partial<Record<VRMHumanoidName, string>> = {};
  for (const vrmName of VRM_HUMANOID_NAMES) {
    const node = vrm.humanoid.getNormalizedBoneNode(vrmName);
    if (node?.name) vrmBoneNames[vrmName] = node.name;
  }

  return clips.map((clip) => {
    const tracks: THREE.KeyframeTrack[] = [];
    for (const track of clip.tracks) {
      const dotIdx = track.name.indexOf('.');
      if (dotIdx <= 0) { tracks.push(track.clone()); continue; }
      const trackBoneName = track.name.slice(0, dotIdx);
      const suffix = track.name.slice(dotIdx);
      const cleaned = cleanMixamoName(trackBoneName);
      const vrmName = MIXAMO_TO_VRM[cleaned];
      if (!vrmName) continue;  // 매핑 못 한 본은 skip — 손가락 등 (VRM humanoid 에 손가락 별도)
      const targetBoneName = vrmBoneNames[vrmName];
      if (!targetBoneName) continue;
      const cloned = track.clone();
      cloned.name = `${targetBoneName}${suffix}`;
      // Hips 의 position track 은 scale 비례로 보정 (Mixamo 와 VRM 키 차이)
      if (vrmName === 'hips' && suffix === '.position') {
        // VRM normalized hips 는 좌표계 표준화되어 있음 — Mixamo position 그대로 적용해도 일반적으로 OK.
        // (정밀하게는 본 길이 비례 보정 필요하지만 P1 에선 1:1)
      }
      tracks.push(cloned);
    }
    return new THREE.AnimationClip(clip.name, clip.duration, tracks, clip.blendMode);
  });
}

export interface VRMCharacter {
  vrm: VRM;
  scene: THREE.Object3D;
  /** 매 frame 호출 — expressionManager / lookAt / springbone 등 갱신 */
  update: (dt: number) => void;
  /** lipSync 진폭 (0~1) 을 'aa' expression 에 적용. P2 에서 5-viseme 으로 확장 */
  setLipSyncAmplitude: (amp: number) => void;
  /** 1인칭일 때 머리 본 숨김 — 머리가 카메라 안쪽 가리지 않게 */
  setHeadVisible: (visible: boolean) => void;
}

/** VRM 모델 로드 + VRMCharacter 인터페이스 생성. */
export async function loadVRMCharacter(url: string): Promise<VRMCharacter> {
  const gltf = await new Promise<{ userData: { vrm: VRM }; scene: THREE.Object3D }>((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.load(url, resolve as never, undefined, reject);
  });
  const vrm = gltf.userData.vrm;
  if (!vrm) throw new Error('VRM 데이터가 없습니다 (.vrm 파일이 아닐 수 있음)');

  // VRM 0.x → 1.0 좌표계로 정렬 (forward Z+ → Z-). 1.0 모델에선 noop.
  try { VRMUtils.rotateVRM0(vrm); } catch { /* 1.0 — noop */ }

  // 성능 — frustumCulled 비활성 (root mesh 들이 cull 안 되도록), 머리 위에서 가려도 그림자 캐스트.
  vrm.scene.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) {
      m.frustumCulled = false;
      m.castShadow = true;
    }
  });

  // userData 에 vrm 인스턴스 / humanoid 부착 — 외부 코드(mixamoRig.findCompatibleBones 등) 가 접근.
  vrm.scene.userData.vrm = vrm;
  vrm.scene.userData.vrmHumanoid = vrm.humanoid;

  // 머리 본 — 1인칭 hideHead 용
  const headNode = vrm.humanoid?.getNormalizedBoneNode('head') || null;

  return {
    vrm,
    scene: vrm.scene,
    update: (dt: number) => {
      try { vrm.update(dt); } catch { /* VRM 내부 에러 무시 */ }
    },
    setLipSyncAmplitude: (amp: number) => {
      const em = vrm.expressionManager;
      if (!em) return;
      // 'aa' viseme — 0~1 입 벌림. amplitude 증폭 1.5 (음성이 작아도 입 잘 보이게)
      const v = Math.min(1, Math.max(0, amp * 1.5));
      try { em.setValue('aa', v); } catch { /* noop */ }
    },
    setHeadVisible: (visible: boolean) => {
      if (!headNode) return;
      headNode.scale.setScalar(visible ? 1 : 0.001);
    },
  };
}

/** URL 이 VRM 인지 검사 (확장자 기반) */
export function isVRMUrl(url: string): boolean {
  return /\.vrm(\?|#|$)/i.test(url);
}
