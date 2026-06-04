/**
 * 통합 Humanoid 표준 — VRChat 식. FBX/GLB/VRM 어떤 포맷이든 같은 본 이름으로 정규화.
 *
 * VRM 1.0 의 humanoid bone naming 을 그대로 채택 — VRM 모델은 1:1 자동, 다른 포맷은 alias 매칭.
 *
 * 본 매핑 흐름:
 *   1. VRM: vrm.humanoid.getRawBoneNode(name) → 정확
 *   2. FBX/GLB: 본 이름 alias DB 검색 (mixamorig*, J_Bip_*, DEF-*, Armature_*, etc)
 *   3. 자동 매칭 실패 시 사용자 수동 매핑 UI (저장: appearance.boneMap[humanoidName] = actualBoneName)
 */

/** VRM 1.0 표준 humanoid 본 — Required + Optional 전부. */
export const HUMANOID_BONES = [
  // 필수 — 척추
  'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
  // 필수 — 팔
  'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
  'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  // 필수 — 다리
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes',
  'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes',
  // 선택 — 머리
  'leftEye', 'rightEye', 'jaw',
  // 선택 — 손가락 (15 × 2 = 30개)
  'leftThumbMetacarpal', 'leftThumbProximal', 'leftThumbDistal',
  'leftIndexProximal', 'leftIndexIntermediate', 'leftIndexDistal',
  'leftMiddleProximal', 'leftMiddleIntermediate', 'leftMiddleDistal',
  'leftRingProximal', 'leftRingIntermediate', 'leftRingDistal',
  'leftLittleProximal', 'leftLittleIntermediate', 'leftLittleDistal',
  'rightThumbMetacarpal', 'rightThumbProximal', 'rightThumbDistal',
  'rightIndexProximal', 'rightIndexIntermediate', 'rightIndexDistal',
  'rightMiddleProximal', 'rightMiddleIntermediate', 'rightMiddleDistal',
  'rightRingProximal', 'rightRingIntermediate', 'rightRingDistal',
  'rightLittleProximal', 'rightLittleIntermediate', 'rightLittleDistal',
] as const;
export type HumanoidBoneName = typeof HUMANOID_BONES[number];

/** 필수 본 — retargeting 최소 요구. 이게 다 매핑 안 되면 캐릭터 사용 불가. */
export const REQUIRED_HUMANOID_BONES: readonly HumanoidBoneName[] = [
  'hips', 'spine', 'head',
  'leftUpperArm', 'leftLowerArm', 'leftHand',
  'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot',
  'rightUpperLeg', 'rightLowerLeg', 'rightFoot',
];

/**
 * 다양한 rig 의 본 이름 → humanoid 표준 이름 매핑.
 * cleanBoneName 으로 prefix 제거 후 lowercase 비교.
 *
 * 지원 rig: Mixamo, ReadyPlayerMe, Unity Humanoid, Blender Rigify, VRoid J_Bip_,
 *           MMD 영문, MakeHuman, AccuRig, CC4.
 */
export const HUMANOID_ALIASES: Partial<Record<HumanoidBoneName, string[]>> = {
  // ── 척추
  hips:        ['hips', 'pelvis', 'root', 'mixamorighips', 'jbiphips', 'jbipchips', 'defhips', 'cogspine', 'bipcom', 'cog', 'bone_pelvis', 'cccbasepelvis'],
  spine:       ['spine', 'spine0', 'mixamorigspine', 'jbipspine', 'jbipcspine', 'defspine', 'lowerwaist', 'upperbody', 'bone_spine01'],
  chest:       ['spine1', 'chest', 'spine01', 'mixamorigspine1', 'jbipchest', 'jbipcchest', 'defspine1', 'upperwaist', 'upperbody1', 'bone_spine02'],
  upperChest:  ['spine2', 'upperchest', 'spine02', 'mixamorigspine2', 'jbipupperchest', 'jbipcupperchest', 'defspine2', 'chestcenter', 'upperbody2', 'bone_spine03'],
  neck:        ['neck', 'mixamorigneck', 'jbipneck', 'jbipcneck', 'defneck', 'bone_neck'],
  head:        ['head', 'mixamorighead', 'jbiphead', 'jbipchead', 'defhead', 'bone_head', 'cccbasehead'],

  // ── 왼팔
  leftShoulder:  ['leftshoulder', 'lshoulder', 'shoulderl', 'leftclavicle', 'claviclel', 'mixamorigleftshoulder', 'jbiplshoulder', 'defshoulderl'],
  leftUpperArm:  ['leftarm', 'lupperarm', 'upperarml', 'leftupperarm', 'mixamorigleftarm', 'jbiplupperarm', 'defupperarml'],
  leftLowerArm:  ['leftforearm', 'lforearm', 'leftlowerarm', 'lowerarml', 'forearml', 'mixamorigleftforearm', 'jbipllowerarm', 'defforearml'],
  leftHand:      ['lefthand', 'lhand', 'handl', 'mixamoriglefthand', 'jbiplhand', 'defhandl'],

  // ── 오른팔
  rightShoulder: ['rightshoulder', 'rshoulder', 'shoulderr', 'rightclavicle', 'clavicler', 'mixamorigrightshoulder', 'jbiprshoulder', 'defshoulderr'],
  rightUpperArm: ['rightarm', 'rupperarm', 'upperarmr', 'rightupperarm', 'mixamorigrightarm', 'jbiprupperarm', 'defupperarmr'],
  rightLowerArm: ['rightforearm', 'rforearm', 'rightlowerarm', 'lowerarmr', 'forearmr', 'mixamorigrightforearm', 'jbiprlowerarm', 'defforearmr'],
  rightHand:     ['righthand', 'rhand', 'handr', 'mixamorigrighthand', 'jbiprhand', 'defhandr'],

  // ── 왼다리
  leftUpperLeg:  ['leftupleg', 'leftupperleg', 'leftthigh', 'thighl', 'upperlegl', 'lthigh', 'mixamorigleftupleg', 'jbiplupperleg', 'defthighl'],
  leftLowerLeg:  ['leftleg', 'leftlowerleg', 'leftshin', 'shinl', 'calfl', 'lowerlegl', 'mixamorigleftleg', 'jbipllowerleg', 'defshinl'],
  leftFoot:      ['leftfoot', 'lfoot', 'footl', 'mixamorigleftfoot', 'jbiplfoot', 'deffootl'],
  leftToes:      ['lefttoebase', 'lefttoe', 'toel', 'mixamoriglefttoebase', 'jbipltoes', 'deftoel'],

  // ── 오른다리
  rightUpperLeg: ['rightupleg', 'rightupperleg', 'rightthigh', 'thighr', 'upperlegr', 'rthigh', 'mixamorigrightupleg', 'jbiprupperleg', 'defthighr'],
  rightLowerLeg: ['rightleg', 'rightlowerleg', 'rightshin', 'shinr', 'calfr', 'lowerlegr', 'mixamorigrightleg', 'jbiprlowerleg', 'defshinr'],
  rightFoot:     ['rightfoot', 'rfoot', 'footr', 'mixamorigrightfoot', 'jbiprfoot', 'deffootr'],
  rightToes:     ['righttoebase', 'righttoe', 'toer', 'mixamorigrighttoebase', 'jbiprtoes', 'deftoer'],
};

/** 본 이름 정규화 — prefix 제거 + lowercase + 특수문자 제거. */
export function cleanBoneName(name: string): string {
  return name
    .replace(/^.*[:|]/, '')         // Armature|, mixamorig:, mmd: 등 prefix
    .replace(/^mixamorig/i, '')     // mixamorig
    .replace(/^def[-_]?/i, '')      // Rigify DEF-
    .replace(/^armature[-_]?/i, '') // ReadyPlayerMe Armature_
    .replace(/^cccbase[-_]?/i, '')  // CC4 CCCBase
    .replace(/^bone[-_]?/i, '')     // Bone_
    .replace(/[_\-\s.]/g, '')
    .toLowerCase();
}

/** 모든 alias 의 cleaned 이름 → humanoid name lookup map. */
const ALIAS_LOOKUP = new Map<string, HumanoidBoneName>();
for (const [humanoidName, aliases] of Object.entries(HUMANOID_ALIASES)) {
  if (!aliases) continue;
  for (const a of aliases) ALIAS_LOOKUP.set(cleanBoneName(a), humanoidName as HumanoidBoneName);
}

/** 본 이름 1개 → 매칭되는 humanoid 표준 이름 (없으면 null). */
export function detectHumanoidName(boneName: string): HumanoidBoneName | null {
  return ALIAS_LOOKUP.get(cleanBoneName(boneName)) ?? null;
}

/** 표정 표준 이름 — VRM 1.0 expression preset. 모든 캐릭터에 통일 적용. */
export const HUMANOID_EXPRESSIONS = [
  'happy', 'sad', 'angry', 'surprised', 'relaxed', 'neutral',
  // lipSync viseme (5포인트)
  'aa', 'ih', 'ou', 'ee', 'oh',
  // blink
  'blink', 'blinkLeft', 'blinkRight',
] as const;
export type HumanoidExpressionName = typeof HUMANOID_EXPRESSIONS[number];

/** 표정 alias — VRM expression name OR morph target name 후보. */
export const EXPRESSION_ALIASES: Partial<Record<HumanoidExpressionName, string[]>> = {
  happy:     ['happy', 'joy', 'fun', 'smile', 'mouthsmile'],
  sad:       ['sad', 'sorrow', 'cry', 'mouthfrown'],
  angry:     ['angry', 'mad'],
  surprised: ['surprised', 'wow', 'eyeswide'],
  relaxed:   ['relaxed', 'calm', 'peace'],
  neutral:   ['neutral', 'default'],
  aa:        ['aa', 'ah', 'mouthopen', 'a', 'jawopen'],
  ih:        ['ih', 'i', 'mouthsmile'],
  ou:        ['ou', 'u', 'mouthpucker'],
  ee:        ['ee', 'e'],
  oh:        ['oh', 'o', 'mouthround'],
  blink:     ['blink', 'eyeblink', 'eyeclose'],
  blinkLeft: ['blinkleft', 'eyeblinkleft', 'eyecloseleft'],
  blinkRight:['blinkright', 'eyeblinkright', 'eyecloseright'],
};

/**
 * 캐릭터 애니메이션 슬롯 — VRChat 식 13종.
 *
 * 카테고리:
 *   - idle: 정지
 *   - locomotion: 4방향 walk + 2방향 run (strafing)
 *   - jump: start (kick-off) → loop (공중) → land (착지) 3단 상태머신
 *   - fall: 공중 자유낙하
 *   - crouch: 앉아 idle + 앉아 이동
 *
 * 운영자가 13슬롯에 vrma/fbx URL 등록 → 모든 캐릭터 공용.
 * 누락 슬롯은 자동 fallback (예: walk_left 없으면 walk_fwd).
 */
export type AnimSlot =
  | 'idle'
  | 'walk_fwd' | 'walk_bwd' | 'walk_left' | 'walk_right'
  | 'run_fwd' | 'run_bwd'
  | 'jump_start' | 'jump_loop' | 'jump_land'
  | 'fall'
  | 'crouch_idle' | 'crouch_walk';

export const ANIM_SLOTS: readonly AnimSlot[] = [
  'idle',
  'walk_fwd', 'walk_bwd', 'walk_left', 'walk_right',
  'run_fwd', 'run_bwd',
  'jump_start', 'jump_loop', 'jump_land',
  'fall',
  'crouch_idle', 'crouch_walk',
];

/** 카테고리 그룹 — 운영자 UI 용. */
export const ANIM_SLOT_GROUPS: ReadonlyArray<{ key: string; slots: readonly AnimSlot[] }> = [
  { key: 'idle',       slots: ['idle'] },
  { key: 'locomotion', slots: ['walk_fwd', 'walk_bwd', 'walk_left', 'walk_right', 'run_fwd', 'run_bwd'] },
  { key: 'jump',       slots: ['jump_start', 'jump_loop', 'jump_land', 'fall'] },
  { key: 'crouch',     slots: ['crouch_idle', 'crouch_walk'] },
];

/**
 * 누락 슬롯 fallback chain — 운영자가 일부만 등록해도 작동.
 * 예: walk_left 없으면 walk_fwd 사용. jump_start 없으면 jump_loop.
 */
export const ANIM_SLOT_FALLBACK: Partial<Record<AnimSlot, AnimSlot[]>> = {
  walk_bwd:    ['walk_fwd', 'idle'],
  walk_left:   ['walk_fwd', 'idle'],
  walk_right:  ['walk_fwd', 'idle'],
  run_bwd:     ['run_fwd', 'walk_fwd', 'idle'],
  run_fwd:     ['walk_fwd', 'idle'],
  jump_start:  ['jump_loop', 'idle'],
  jump_land:   ['jump_loop', 'idle'],
  jump_loop:   ['fall', 'idle'],
  fall:        ['jump_loop', 'idle'],
  crouch_idle: ['idle'],
  crouch_walk: ['crouch_idle', 'walk_fwd', 'idle'],
};

/**
 * Legacy 슬롯명 (5종) → 새 13종 매핑.
 * 운영자가 예전 5슬롯 (`walk`, `run`, `jump`) 으로 등록한 데이터 호환.
 */
export const ANIM_SLOT_LEGACY_ALIAS: Record<string, AnimSlot> = {
  walk: 'walk_fwd',
  run:  'run_fwd',
  jump: 'jump_loop',
};

/** 슬롯 + 등록된 슬롯 set → 실제 재생할 슬롯 (fallback 적용). null 이면 idle. */
export function resolveSlot(want: AnimSlot, available: Set<AnimSlot>): AnimSlot | null {
  if (available.has(want)) return want;
  const chain = ANIM_SLOT_FALLBACK[want] ?? [];
  for (const f of chain) if (available.has(f)) return f;
  return available.has('idle') ? 'idle' : null;
}
