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

/** 한 클립 → 특정 캐릭터의 humanoid bones map 에 맞게 본 이름 변환. */
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
 *  모든 캐릭터가 본인 매핑만 적용해서 사용 가능. */
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
    tracks.push(cloned);
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks, clip.blendMode);
}
