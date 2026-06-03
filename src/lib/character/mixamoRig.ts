import * as THREE from 'three';

/**
 * 본 이름 alias DB — Mixamo 표준 본 → 다른 rig 시스템의 동등 본 이름들.
 * cleanBoneName() 으로 prefix/separator 정리 후 lowercase 비교.
 *
 * 지원 rig: Mixamo, ReadyPlayerMe(Armature_), Unity Humanoid/Mecanim,
 *           Blender Rigify(DEF-prefix), VRoid(J_Bip_), MMD 영문 본 이름.
 *
 * VRM 모델은 modelLoader 가 scene.userData.vrmHumanoid 에 humanoid 인스턴스를 부착 →
 * findCompatibleBones 가 그걸 우선 사용 (string alias 불필요).
 */
const MIXAMO_ALIASES: Record<string, string[]> = {
  // ─ 코어 (척추)
  hips:   ['hips', 'pelvis', 'root', 'mixamorighips', 'jbiphips', 'jbipchips',
           'defhips', 'cogspine', 'bipcom', 'centeroflowerbody', 'cog'],
  spine:  ['spine', 'spine0', 'mixamorigspine', 'jbipspine', 'jbipcspine',
           'defspine', 'lowerwaist', 'upperbody'],
  spine1: ['spine1', 'chest', 'spine01', 'mixamorigspine1', 'jbipchest',
           'jbipcchest', 'defspine1', 'upperwaist', 'upperbody1'],
  spine2: ['spine2', 'upperchest', 'spine02', 'mixamorigspine2', 'jbipupperchest',
           'jbipcupperchest', 'defspine2', 'chestcenter', 'upperbody2'],
  neck:   ['neck', 'mixamorigneck', 'jbipneck', 'jbipcneck', 'defneck'],
  head:   ['head', 'mixamorighead', 'jbiphead', 'jbipchead', 'defhead'],

  // ─ 왼팔
  leftShoulder: ['leftshoulder', 'lshoulder', 'shoulderl', 'leftclavicle', 'claviclel',
                 'mixamorigleftshoulder', 'jbiplshoulder', 'jbiplshoulder',
                 'defshoulderl', 'leftshoulder1'],
  leftArm:      ['leftarm', 'lupperarm', 'upperarml', 'leftupperarm',
                 'mixamorigleftarm', 'jbiplupperarm',
                 'defupperarml', 'leftarm1'],
  leftForeArm:  ['leftforearm', 'lforearm', 'leftlowerarm', 'lowerarml', 'forearml',
                 'mixamorigleftforearm', 'jbipllowerarm',
                 'defforearml'],
  leftHand:     ['lefthand', 'lhand', 'handl', 'mixamoriglefthand',
                 'jbiplhand', 'defhandl'],

  // ─ 오른팔
  rightShoulder: ['rightshoulder', 'rshoulder', 'shoulderr', 'rightclavicle', 'clavicler',
                  'mixamorigrightshoulder', 'jbiprshoulder',
                  'defshoulderr', 'rightshoulder1'],
  rightArm:      ['rightarm', 'rupperarm', 'upperarmr', 'rightupperarm',
                  'mixamorigrightarm', 'jbiprupperarm',
                  'defupperarmr', 'rightarm1'],
  rightForeArm:  ['rightforearm', 'rforearm', 'rightlowerarm', 'lowerarmr', 'forearmr',
                  'mixamorigrightforearm', 'jbiprlowerarm',
                  'defforearmr'],
  rightHand:     ['righthand', 'rhand', 'handr', 'mixamorigrighthand',
                  'jbiprhand', 'defhandr'],

  // ─ 왼다리
  leftUpLeg:    ['leftupleg', 'leftupperleg', 'leftthigh', 'thighl', 'upperlegl', 'lthigh',
                 'mixamorigleftupleg', 'jbiplupperleg',
                 'defthighl', 'leftleg'],
  leftLeg:      ['leftleg', 'leftlowerleg', 'leftshin', 'shinl', 'calfl', 'lowerlegl',
                 'mixamorigleftleg', 'jbipllowerleg',
                 'defshinl', 'leftknee'],
  leftFoot:     ['leftfoot', 'lfoot', 'footl', 'mixamorigleftfoot',
                 'jbiplfoot', 'deffootl'],
  leftToeBase:  ['lefttoebase', 'lefttoe', 'toel', 'mixamoriglefttoebase',
                 'jbipltoes', 'deftoel'],

  // ─ 오른다리
  rightUpLeg:   ['rightupleg', 'rightupperleg', 'rightthigh', 'thighr', 'upperlegr', 'rthigh',
                 'mixamorigrightupleg', 'jbiprupperleg',
                 'defthighr', 'rightleg'],
  rightLeg:     ['rightleg', 'rightlowerleg', 'rightshin', 'shinr', 'calfr', 'lowerlegr',
                 'mixamorigrightleg', 'jbiprlowerleg',
                 'defshinr', 'rightknee'],
  rightFoot:    ['rightfoot', 'rfoot', 'footr', 'mixamorigrightfoot',
                 'jbiprfoot', 'deffootr'],
  rightToeBase: ['righttoebase', 'righttoe', 'toer', 'mixamorigrighttoebase',
                 'jbiprtoes', 'deftoer'],
};

/**
 * VRM humanoid 표준 본 이름 ↔ Mixamo 본 이름 매핑.
 * VRM 의 humanoid.getRawBoneNode(vrmName) 으로 직접 본을 찾음 → string-match 불필요.
 */
const VRM_TO_MIXAMO: Record<string, string> = {
  hips: 'hips',
  spine: 'spine',
  chest: 'spine1',
  upperChest: 'spine2',
  neck: 'neck',
  head: 'head',
  leftShoulder: 'leftShoulder',
  leftUpperArm: 'leftArm',
  leftLowerArm: 'leftForeArm',
  leftHand: 'leftHand',
  rightShoulder: 'rightShoulder',
  rightUpperArm: 'rightArm',
  rightLowerArm: 'rightForeArm',
  rightHand: 'rightHand',
  leftUpperLeg: 'leftUpLeg',
  leftLowerLeg: 'leftLeg',
  leftFoot: 'leftFoot',
  leftToes: 'leftToeBase',
  rightUpperLeg: 'rightUpLeg',
  rightLowerLeg: 'rightLeg',
  rightFoot: 'rightFoot',
  rightToes: 'rightToeBase',
};

const ALIAS_TO_MIXAMO = new Map<string, string>();
for (const [mixamoName, aliases] of Object.entries(MIXAMO_ALIASES)) {
  for (const alias of aliases) ALIAS_TO_MIXAMO.set(cleanBoneName(alias), mixamoName);
}

function cleanBoneName(name: string): string {
  return name
    .replace(/^.*[:|]/, '')
    .replace(/^mixamorig/i, '')
    .replace(/^def[-_]?/i, '')      // Rigify DEF- prefix
    .replace(/^armature[-_]?/i, '') // ReadyPlayerMe Armature_ prefix
    .replace(/[_\-\s.]/g, '')
    .toLowerCase();
}

function splitTrackName(name: string): { target: string; suffix: string } | null {
  const dot = name.indexOf('.');
  if (dot <= 0) return null;
  return { target: name.slice(0, dot), suffix: name.slice(dot) };
}

function canonicalBoneName(name: string): string | null {
  return ALIAS_TO_MIXAMO.get(cleanBoneName(name)) || null;
}

/** FBX 오브젝트에 뼈(Bone)가 하나라도 있으면 true */
export function hasSkeleton(root: THREE.Object3D): boolean {
  let found = false;
  root.traverse(child => { if ((child as THREE.Bone).isBone) found = true; });
  return found;
}

/** VRM humanoid 인스턴스의 최소 인터페이스 (modelLoader 가 scene.userData.vrmHumanoid 에 저장). */
interface VrmHumanoidLike {
  getRawBoneNode?: (name: string) => { name: string } | null | undefined;
  getNormalizedBoneNode?: (name: string) => { name: string } | null | undefined;
}

/**
 * Mixamo 표준 본 → 실제 모델의 본 이름 매핑.
 * VRM 모델은 humanoid API 우선 (정확). 아니면 string alias DB.
 *
 * @returns Map<mixamoBoneName, actualBoneName>
 */
export function findMixamoCompatibleBones(root: THREE.Object3D): Map<string, string> {
  const bones = new Map<string, string>();

  // 1) VRM humanoid API 우선 — modelLoader 가 vrm.humanoid 를 userData 에 부착했으면 사용
  const vrmHumanoid = root.userData?.vrmHumanoid as VrmHumanoidLike | undefined;
  if (vrmHumanoid) {
    for (const [vrmName, mixamoName] of Object.entries(VRM_TO_MIXAMO)) {
      const node = vrmHumanoid.getRawBoneNode?.(vrmName) || vrmHumanoid.getNormalizedBoneNode?.(vrmName);
      if (node?.name && !bones.has(mixamoName)) bones.set(mixamoName, node.name);
    }
  }

  // 2) string alias 매칭 — VRM 매핑에서 못 찾은 본만 보강
  root.traverse((child) => {
    if (!(child as THREE.Bone).isBone) return;
    const canonical = canonicalBoneName(child.name);
    if (canonical && !bones.has(canonical)) bones.set(canonical, child.name);
  });
  return bones;
}

/**
 * 매칭 진단 결과 — UI 에 "32 중 28 매칭" 같은 피드백 표시용.
 * 사용자가 캐릭터 등록 시 어떤 본이 빠졌는지 알 수 있게.
 */
export interface BoneMatchReport {
  total: number;
  matched: number;
  missing: string[];
}
export function diagnoseMatching(root: THREE.Object3D): BoneMatchReport {
  const matched = findMixamoCompatibleBones(root);
  const allMixamoNames = Object.keys(MIXAMO_ALIASES);
  const missing = allMixamoNames.filter(n => !matched.has(n));
  return { total: allMixamoNames.length, matched: matched.size, missing };
}

export function retargetClipsToModel(
  clips: THREE.AnimationClip[],
  targetRoot: THREE.Object3D,
): THREE.AnimationClip[] {
  const targetBones = findMixamoCompatibleBones(targetRoot);
  if (targetBones.size === 0) return clips;

  return clips.map((clip) => {
    const tracks = clip.tracks.map((track) => {
      const parts = splitTrackName(track.name);
      if (!parts) return track.clone();

      const canonical = canonicalBoneName(parts.target);
      const targetName = canonical ? targetBones.get(canonical) : null;
      const cloned = track.clone();
      if (targetName) cloned.name = `${targetName}${parts.suffix}`;
      return cloned;
    });

    return new THREE.AnimationClip(clip.name, clip.duration, tracks, clip.blendMode);
  });
}
