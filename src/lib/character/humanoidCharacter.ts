/**
 * 통합 Humanoid 캐릭터 — 포맷 무관 단일 인터페이스 (VRChat 식).
 *
 * VRM/FBX/GLB 어떤 모델이든 같은 API:
 *   - mixer + 슬롯별 actions (idle/walk/run/jump/fall)
 *   - lipSync (음성 진폭 → 입 모양)
 *   - setExpression (표정 6 + viseme 5 + blink)
 *   - lookAt (카메라/타깃 시선 추적)
 *   - setHeadVisible (1인칭 머리 숨김)
 *
 * VRM 인스턴스가 있으면 그 features 활용, 없으면 humanoid 본 + morph target fallback.
 */

import * as THREE from 'three';
import type { HumanoidLoadResult } from './humanoidLoader';
import { loadHumanoid, type HumanoidLoadOptions } from './humanoidLoader';
import { createHumanoidLipSync, type HumanoidLipSync } from './humanoidLipSync';
import { retargetClipsToHumanoid } from './humanoidAnimation';
import { resolveSlot, type HumanoidBoneName, type HumanoidExpressionName, type AnimSlot } from './humanoid';

export interface HumanoidCharacter {
  /** 렌더링 root (씬에 add 할 Object3D). */
  scene: THREE.Object3D;
  /** humanoid 표준 본 → 실제 Three.js Object3D 매핑. */
  bones: Partial<Record<HumanoidBoneName, THREE.Object3D>>;
  /** VRM 인스턴스 (VRM 일 때만). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vrm?: any;
  /** 본 매칭 진단. UI 에 "32 중 28" 같이 표시. */
  diagnosis: HumanoidLoadResult['diagnosis'];
  /** 본 이름 후보 (수동 매핑 UI 용). */
  allBoneNames: string[];
  /** 표정 morph 후보 (표정 매핑 UI 용). */
  allMorphTargets: string[];

  /** mixer — 외부에서 직접 update 안 해도 됨. update(dt) 가 호출. */
  mixer: THREE.AnimationMixer;
  /** 슬롯별 action map. */
  actions: Map<AnimSlot, THREE.AnimationAction>;
  /** 현재 활성 슬롯. */
  readonly currentSlot: AnimSlot | null;
  /** 슬롯별 clip 등록 — humanoid 표준 본 이름 기준 클립을 받음. 내부에서 retarget. */
  setClips: (clips: Map<AnimSlot, THREE.AnimationClip>) => void;
  /** 슬롯 전환 (crossFade 0.25s). */
  setSlot: (slot: AnimSlot, fadeSec?: number) => void;

  /** lipSync API. */
  lipSync: HumanoidLipSync;
  /** lookAt 타깃 설정 — 카메라/Object3D 응시 또는 null=해제. */
  setLookAtTarget: (target: THREE.Object3D | null) => void;
  /** 표정. */
  setExpression: (name: HumanoidExpressionName, value: number) => void;
  /** 1인칭 머리 숨김. */
  setHeadVisible: (visible: boolean) => void;
  /** 매 frame 호출 — mixer + vrm.update + lookAt 갱신. */
  update: (dt: number) => void;
  /** 자원 정리. */
  dispose: () => void;
}

/** 캐릭터 1개 로드 + HumanoidCharacter 통합 인터페이스 생성. */
export async function createHumanoidCharacter(
  url: string,
  opts: HumanoidLoadOptions = {},
): Promise<HumanoidCharacter> {
  const loaded = await loadHumanoid(url, opts);
  const { root, bones, vrm, allBoneNames, allMorphTargets, diagnosis } = loaded;

  // VRM spring bone — 모델 원본 설정 그대로 사용. 우리가 stiffness/center 손대지 않음.
  // vrm-viewer.ownverse.world 와 동일 패턴: vrm.update(dt) 통합 호출만.

  // mixer root = vrm.scene (또는 root). HumanoidMesh 에서 VRMA clip 의 track name 을
  // raw bone 이름으로 rewrite → mixer 가 raw scene 안의 raw bone 직접 driving.
  // update 순서: vrm.update 먼저 (humanoid.update 의 normalized → raw mirror),
  //             mixer.update 나중 (raw bone 회전을 clip 값으로 덮어씀).
  // 이 흐름이 — vrm.humanoid mirror 가 mixer 의 회전을 덮어쓰는 문제 해결.
  const mixer = new THREE.AnimationMixer(root);
  const actions = new Map<AnimSlot, THREE.AnimationAction>();
  let currentSlot: AnimSlot | null = null;

  const lipSync = createHumanoidLipSync(root, vrm);

  // 머리 본 — 1인칭 hideHead
  const headNode = bones.head ?? null;

  // lookAt 타깃 ref — vrm.lookAt 또는 없으면 head bone 회전 fallback
  let lookAtTarget: THREE.Object3D | null = null;
  const lookAtFallback = !vrm?.lookAt && !!headNode;

  const character: HumanoidCharacter = {
    scene: root,
    bones,
    vrm,
    diagnosis,
    allBoneNames,
    allMorphTargets,
    mixer,
    actions,
    get currentSlot() { return currentSlot; },
    setClips: (clipMap) => {
      // 기존 action 정리
      for (const a of actions.values()) a.stop();
      actions.clear();
      currentSlot = null;
      // 새 clip 들 retarget + action 등록
      for (const [slot, rawClip] of clipMap) {
        const retargeted = retargetClipsToHumanoid([rawClip], bones)[0];
        const action = mixer.clipAction(retargeted);
        action.loop = THREE.LoopRepeat;
        action.enabled = true;
        actions.set(slot, action);
      }
    },
    setSlot: (slot, fadeSec = 0.15) => {
      // 누락 슬롯 fallback — 운영자가 일부만 등록해도 재생
      const available = new Set(actions.keys());
      const resolved = available.has(slot) ? slot : resolveSlot(slot, available);
      if (!resolved) return;
      const next = actions.get(resolved);
      if (!next || currentSlot === resolved) return;
      const prev = currentSlot ? actions.get(currentSlot) : undefined;
      next.reset().play();
      if (prev && prev !== next) {
        next.crossFadeFrom(prev, fadeSec, true);
      } else {
        next.weight = 1;
      }
      currentSlot = resolved;
    },
    lipSync,
    setLookAtTarget: (target) => {
      lookAtTarget = target;
      if (vrm?.lookAt) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (vrm.lookAt as any).target = target ?? undefined;
      }
    },
    setExpression: (name, value) => lipSync.setExpression(name, value),
    setHeadVisible: (visible) => {
      if (!headNode) return;
      headNode.scale.setScalar(visible ? 1 : 0.001);
    },
    update: (dt) => {
      // vrm-viewer 와 동일: vrm.update(dt) 통합 호출 → mixer.update(dt). dt 만 cap (큰 dt 시 진동).
      if (vrm?.update) {
        try { vrm.update(Math.min(dt, 0.05)); } catch { /* noop */ }
      }
      mixer.update(dt);
      // VRM 없을 때 head bone 으로 lookAt fallback — 머리만 타깃 응시
      if (lookAtFallback && lookAtTarget && headNode) {
        const tmp = new THREE.Vector3();
        lookAtTarget.getWorldPosition(tmp);
        headNode.lookAt(tmp);
      }
    },
    dispose: () => {
      mixer.stopAllAction();
      actions.clear();
      currentSlot = null;
    },
  };
  return character;
}
