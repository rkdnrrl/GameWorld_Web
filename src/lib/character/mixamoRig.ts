import * as THREE from 'three';

const MIXAMO_ALIASES: Record<string, string[]> = {
  hips: ['hips', 'pelvis', 'root', 'mixamorighips'],
  spine: ['spine', 'spine0', 'mixamorigspine'],
  spine1: ['spine1', 'chest', 'spine01', 'mixamorigspine1'],
  spine2: ['spine2', 'upperchest', 'spine02', 'mixamorigspine2'],
  neck: ['neck', 'mixamorigneck'],
  head: ['head', 'mixamorighead'],

  leftShoulder: ['leftshoulder', 'lshoulder', 'shoulderl', 'leftclavicle', 'claviclel', 'mixamorigleftshoulder'],
  leftArm: ['leftarm', 'lupperarm', 'upperarml', 'leftupperarm', 'mixamorigleftarm'],
  leftForeArm: ['leftforearm', 'lforearm', 'leftlowerarm', 'lowerarml', 'forearml', 'mixamorigleftforearm'],
  leftHand: ['lefthand', 'lhand', 'handl', 'mixamoriglefthand'],

  rightShoulder: ['rightshoulder', 'rshoulder', 'shoulderr', 'rightclavicle', 'clavicler', 'mixamorigrightshoulder'],
  rightArm: ['rightarm', 'rupperarm', 'upperarmr', 'rightupperarm', 'mixamorigrightarm'],
  rightForeArm: ['rightforearm', 'rforearm', 'rightlowerarm', 'lowerarmr', 'forearmr', 'mixamorigrightforearm'],
  rightHand: ['righthand', 'rhand', 'handr', 'mixamorigrighthand'],

  leftUpLeg: ['leftupleg', 'leftupperleg', 'leftthigh', 'thighl', 'upperlegl', 'lthigh', 'mixamorigleftupleg'],
  leftLeg: ['leftleg', 'leftlowerleg', 'leftshin', 'shinl', 'calfl', 'lowerlegl', 'mixamorigleftleg'],
  leftFoot: ['leftfoot', 'lfoot', 'footl', 'mixamorigleftfoot'],
  leftToeBase: ['lefttoebase', 'lefttoe', 'toel', 'mixamoriglefttoebase'],

  rightUpLeg: ['rightupleg', 'rightupperleg', 'rightthigh', 'thighr', 'upperlegr', 'rthigh', 'mixamorigrightupleg'],
  rightLeg: ['rightleg', 'rightlowerleg', 'rightshin', 'shinr', 'calfr', 'lowerlegr', 'mixamorigrightleg'],
  rightFoot: ['rightfoot', 'rfoot', 'footr', 'mixamorigrightfoot'],
  rightToeBase: ['righttoebase', 'righttoe', 'toer', 'mixamorigrighttoebase'],
};

const ALIAS_TO_MIXAMO = new Map<string, string>();
for (const [mixamoName, aliases] of Object.entries(MIXAMO_ALIASES)) {
  for (const alias of aliases) ALIAS_TO_MIXAMO.set(cleanBoneName(alias), mixamoName);
}

function cleanBoneName(name: string): string {
  return name
    .replace(/^.*[:|]/, '')
    .replace(/^mixamorig/i, '')
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

export function findMixamoCompatibleBones(root: THREE.Object3D): Map<string, string> {
  const bones = new Map<string, string>();
  root.traverse((child) => {
    if (!(child as THREE.Bone).isBone) return;
    const canonical = canonicalBoneName(child.name);
    if (canonical && !bones.has(canonical)) bones.set(canonical, child.name);
  });
  return bones;
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

