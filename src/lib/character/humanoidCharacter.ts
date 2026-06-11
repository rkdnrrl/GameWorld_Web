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
import { getGlobalWind } from '../world/globalWind';

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
  /** dt 진행 + (옵션) skipVrm=true 면 vrm.update(spring/expression/lookAt) skip, mixer 만. */
  update: (dt: number, skipVrm?: boolean) => void;
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

  // VRM spring bone — 위치 이동 흔들림 차단 + 제자리 자연스러움 유지:
  //   center = vrm.scene (모든 joint, 강제 override).
  //   three-vrm spring 은 center 의 local space 에서 inertia 계산 →
  //     - 캐릭터 root world 이동: 모든 joint 가 함께 이동 → spring 입장에서는 0 (흔들림 차단) ✅
  //     - hips 바운싱 (애니메이션 root motion) 은 vrm.scene 안에서 일어나므로 spring 에 정상 반영 → 머리카락 바운스 유지 ✅
  //     - 골격 회전·bone hierarchy 변형 정상 반영 → 자연 흔들림 ✅
  //   center = hips 로 하면 hips 바운싱까지 제거되어 제자리 흔들림이 부자연스러워짐.
  //   stiffness/dragForce 는 가슴처럼 단단 (1.5 / 0.8) — 잔진동 빠른 감쇠.
  // 바람용 — 스프링본 joint settings + 원본(base) 중력 캡처. 머리카락/옷자락을 바람에 날리려면
  // gravityDir/gravityPower 를 매 프레임 (base 중력 + 수평 바람) 으로 변조한다 (three-vrm 엔 외력 API 가 없음).
  // 스프링본 없는 모델(FBX 등)은 이 배열이 비어 → 바람 적용 안 됨(요구사항: 스프링본 있는 것만).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const windJoints: { settings: any; baseDir: THREE.Vector3; basePower: number; phase: number }[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = (vrm as any)?.springBoneManager;
  if (sb?.joints) {
    try {
      let ji = 0;
      for (const joint of sb.joints) {
        if (!joint) continue;
        joint.center = root;  // 강제 override — 캐릭터 root 가 spring 의 "고정 좌표계"
        const s = joint.settings;
        if (s) {
          if (typeof s.stiffness === 'number') {
            s.stiffness = Math.max(s.stiffness, 1.5);
          }
          if (typeof s.dragForce === 'number') {
            s.dragForce = Math.max(s.dragForce, 0.8);
          }
          if (s.gravityDir && typeof s.gravityPower === 'number') {
            windJoints.push({ settings: s, baseDir: s.gravityDir.clone(), basePower: s.gravityPower, phase: ji * 0.6 });
          }
        }
        ji++;
      }
    } catch { /* noop */ }
  }
  let windApplied = false;  // 바람이 0 으로 꺼졌을 때 base 중력 1회 복원용
  // 머리카락/옷자락 바람 — base 중력에 수평 바람(거스트)을 합성해 gravityDir/Power 변조.
  const applyWindToSpringBones = () => {
    if (windJoints.length === 0) return;
    const w = getGlobalWind();
    if (w.strength > 0.001) {
      for (const wj of windJoints) {
        const gust = 0.65 + 0.35 * Math.sin(w.time * w.speed * 2.0 + wj.phase);  // 시변 펄럭임
        const wp = Math.min(w.strength * 0.06, 0.6) * gust;                       // 수평 바람 세기(상한)
        const gx = wj.baseDir.x * wj.basePower + w.dirX * wp;
        const gy = wj.baseDir.y * wj.basePower;
        const gz = wj.baseDir.z * wj.basePower + w.dirZ * wp;
        const len = Math.hypot(gx, gy, gz) || 1e-5;
        wj.settings.gravityPower = len;
        wj.settings.gravityDir.set(gx / len, gy / len, gz / len);
      }
      windApplied = true;
    } else if (windApplied) {
      for (const wj of windJoints) { wj.settings.gravityPower = wj.basePower; wj.settings.gravityDir.copy(wj.baseDir); }
      windApplied = false;
    }
  };

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
  let headHidden = false;   // 1인칭 머리 숨김 상태 — 매 프레임 재적용(애니/vrm.update 가 스케일 되돌리는 것 방지)

  // hips 본 + rest pose local Y 캡처 — 애니메이션이 캐릭터를 위로 띄우는 것 방지 (crouch 등).
  // mixer 적용 후 hips.position.y > restHipsLocalY 면 clamp. 아래로는 (앉기·바운싱) 허용.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hipsBone: THREE.Object3D | null = bones.hips
    || (vrm as any)?.humanoid?.getRawBoneNode?.('hips')
    || (vrm as any)?.humanoid?.getNormalizedBoneNode?.('hips')
    || null;
  const restHipsLocalY = hipsBone ? hipsBone.position.y : 0;

  // lookAt — VRM 의 vrm.lookAt 만 지원. non-VRM 은 head bone 강제 회전이 어색해서 비활성.
  let lookAtTarget: THREE.Object3D | null = null;

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
      headHidden = !visible;
      if (!headNode) return;
      headNode.scale.setScalar(visible ? 1 : 0.001);
    },
    update: (dt, skipVrm = false) => {
      // vrm.update = spring bone + expression + lookAt 통합. skipVrm 면 mixer 만 돌림 — 본인
      // 1인칭에서 본인 vrm.update 의 비용 큰데 안 보이는 데 spring 시뮬레이션 의미 없어 skip.
      if (!skipVrm && vrm?.update) {
        applyWindToSpringBones();   // 머리카락/옷자락 바람 (스프링본 gravityDir/Power 변조)
        try { vrm.update(Math.min(dt, 0.05)); } catch { /* noop */ }
      }
      mixer.update(dt);
      // 1인칭 머리 숨김 재적용 — 달리기 등 애니메이션 본 트랙/vrm.update 가 머리뼈 스케일을 1로 되돌리는 걸 매 프레임 덮어씀.
      if (headHidden && headNode) headNode.scale.setScalar(0.001);
      // hips Y clamp — 애니메이션이 rest pose 위로 hips 를 올리는 경우 차단 (crouch 등이 위로 뜨는 버그).
      // 아래로 (앉기·바운싱) 는 영향 없음.
      if (hipsBone && hipsBone.position.y > restHipsLocalY) {
        hipsBone.position.y = restHipsLocalY;
      }
      void lookAtTarget;
    },
    dispose: () => {
      mixer.stopAllAction();
      actions.clear();
      currentSlot = null;
    },
  };
  return character;
}
