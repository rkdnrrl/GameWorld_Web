/**
 * Foot IK — 정통 Two-Bone Analytical IK + knee bend axis 자동 감지.
 *
 * 알고리즘:
 *   1. 캐릭터 로드 시 rest pose 캡처 — l1 (upper→lower), l2 (lower→foot),
 *      그리고 knee bend axis = (upper→lower) × (lower→foot) — 모델별 자동.
 *   2. 매 frame: 발의 target = ground raycast hit + offset
 *   3. Cosine law 로 무릎 각 + upperLeg aim 회전 계산
 *   4. upperLeg / lowerLeg 의 local quaternion 만 set → 다리 본 직접 driving
 *   5. hips 안 건드림 → mesh 전체 안 내려감
 *
 * 이전 시도 (1,0,0 가정) 와 차이 — knee bend axis 가 rest pose 의 무릎 굽힘 평면 normal
 * 로 자동 계산되어 모델별 본 local 축 차이 자동 처리.
 *
 * 한계: rest pose 가 완전 T-pose (무릎 0° 굽힘) 인 모델은 cross product = 0 → fallback.
 *       VRoid/Mixamo 표준은 무릎 약간 앞으로 굽혀 있어 정상.
 */

import * as THREE from 'three';
import type { HumanoidBoneName } from './humanoid';

interface LegChain {
  upper: THREE.Object3D;
  lower: THREE.Object3D;
  foot: THREE.Object3D;
  l1: number;          // upper → lower 거리
  l2: number;          // lower → foot 거리
  kneeAxisLocal: THREE.Vector3;  // upperLeg local 좌표계의 무릎 굽힘 축
  upperRestLocalQ: THREE.Quaternion;  // rest pose 의 upper local quaternion
  lowerRestLocalQ: THREE.Quaternion;  // rest pose 의 lower local quaternion
}

export interface HumanoidFootIK {
  enabled: boolean;
  groundOffset: number;
  rayRange: number;
  /** target 으로 부드럽게 transition 강도 (0~1). */
  smoothing: number;
  /** 발과 ground 의 차이가 이보다 크면 적용 안 함 (점프·낙하 보호). */
  maxDelta: number;
  update: (scene: THREE.Object3D) => void;
}

const TMP_V1 = new THREE.Vector3();
const TMP_V2 = new THREE.Vector3();
const TMP_V3 = new THREE.Vector3();
const TMP_Q1 = new THREE.Quaternion();
const TMP_Q2 = new THREE.Quaternion();
const TMP_RAY = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);

function buildLegChain(
  upper: THREE.Object3D | undefined,
  lower: THREE.Object3D | undefined,
  foot: THREE.Object3D | undefined,
): LegChain | null {
  if (!upper || !lower || !foot) return null;
  upper.updateMatrixWorld(true);

  const upperPos = upper.getWorldPosition(new THREE.Vector3());
  const lowerPos = lower.getWorldPosition(new THREE.Vector3());
  const footPos = foot.getWorldPosition(new THREE.Vector3());

  const l1 = upperPos.distanceTo(lowerPos);
  const l2 = lowerPos.distanceTo(footPos);
  if (l1 <= 0 || l2 <= 0) return null;

  // knee bend axis (world) — rest pose 의 upper→lower 와 lower→foot 의 cross.
  // 무릎이 약간 굽혀 있을 때 그 굽힘 평면의 normal.
  const u2l = new THREE.Vector3().subVectors(lowerPos, upperPos);
  const l2f = new THREE.Vector3().subVectors(footPos, lowerPos);
  const kneeAxisWorld = new THREE.Vector3().crossVectors(u2l, l2f);

  // fallback — cross 가 0 이면 (완전 직선) 캐릭터 left 방향 가정
  if (kneeAxisWorld.lengthSq() < 1e-6) {
    // upperPos → lowerPos 가 -y down 이면 (다리 down), bend axis = world +x 또는 -x
    // 보통 사람 무릎은 앞 (-z 또는 +z) 으로 굽힘. 모델 forward = world -z 가정.
    // upper local 좌표계의 +x 가 보통 옆 → bend axis 후보.
    kneeAxisWorld.set(1, 0, 0);
  } else {
    kneeAxisWorld.normalize();
  }

  // upperLeg local 좌표계로 변환 (parent 의 world rotation 의 inverse + upperLeg 자체 quaternion)
  // 실제: upper.matrixWorld 의 rotation 만 추출 → invert 후 곱
  const upperWorldQInv = upper.getWorldQuaternion(new THREE.Quaternion()).invert();
  const kneeAxisLocal = kneeAxisWorld.applyQuaternion(upperWorldQInv).normalize();

  return {
    upper, lower, foot, l1, l2, kneeAxisLocal,
    upperRestLocalQ: upper.quaternion.clone(),
    lowerRestLocalQ: lower.quaternion.clone(),
  };
}

function raycastGround(
  foot: THREE.Object3D,
  scene: THREE.Object3D,
  characterRoot: THREE.Object3D | null,
  rayRange: number,
): number | null {
  foot.updateMatrixWorld(true);
  const footPos = foot.getWorldPosition(TMP_V1);
  TMP_RAY.set(new THREE.Vector3(footPos.x, footPos.y + rayRange, footPos.z), DOWN);
  TMP_RAY.far = rayRange * 2;
  const hits = TMP_RAY.intersectObject(scene, true);
  for (const h of hits) {
    let isSelf = false;
    if (characterRoot) {
      let o: THREE.Object3D | null = h.object;
      while (o) {
        if (o === characterRoot) { isSelf = true; break; }
        o = o.parent;
      }
    }
    if (!isSelf) return h.point.y;
  }
  return null;
}

function solveLeg(chain: LegChain, targetWorldPos: THREE.Vector3, smoothing: number): void {
  const { upper, lower, l1, l2, kneeAxisLocal } = chain;
  upper.updateMatrixWorld(true);
  const rootWorld = upper.getWorldPosition(TMP_V1);

  // root → target 의 distance D
  const toTarget = TMP_V2.subVectors(targetWorldPos, rootWorld);
  let D = toTarget.length();
  if (D < 1e-4) return;
  // over-extension 방지
  const reach = (l1 + l2) * 0.998;
  if (D > reach) D = reach;
  // 너무 가깝게는 무릎 완전 굽힘 — 최소 보장
  const minReach = Math.abs(l1 - l2) * 1.05 + 0.01;
  if (D < minReach) D = minReach;

  // upperLeg 의 parent world quaternion (root 회전 추출용)
  const parentQ = upper.parent
    ? upper.parent.getWorldQuaternion(new THREE.Quaternion())
    : new THREE.Quaternion();

  // toTarget 을 upper 의 parent local 좌표계로 변환 (그 안에서 upper 의 local quaternion 풀이)
  const targetLocalDir = TMP_V3.copy(toTarget).normalize().applyQuaternion(parentQ.clone().invert());

  // rest pose 에서 upper 의 local space 안 lower 방향 (rest 의 lower world pos - upper world pos)
  // → parent local 로 변환
  const restLowerWorld = lower.getWorldPosition(new THREE.Vector3());
  const restDirParentLocal = new THREE.Vector3().subVectors(restLowerWorld, rootWorld).normalize()
    .applyQuaternion(parentQ.clone().invert());

  // aim rotation — restDir → targetDir (parent local 에서)
  const aimQ = TMP_Q1.setFromUnitVectors(restDirParentLocal, targetLocalDir);

  // cosine law — 무릎 굽힘 각도
  const cosA = (l1 * l1 + D * D - l2 * l2) / (2 * l1 * D);
  const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const cosB = (l1 * l1 + l2 * l2 - D * D) / (2 * l1 * l2);
  const beta = Math.acos(Math.max(-1, Math.min(1, cosB)));

  // upperLeg local quaternion:
  //   parent local 에서 aim 적용 후 — upper local 자체에서 knee bend axis 기준 alpha 만큼 추가 회전 (반대 방향)
  // 결과 = aimQ * restLocalQ * extraQ
  // 단순화: upper quaternion = restLocalQ * (extra rotation toward target)
  // 정확: upper.quaternion = restLocalQ * (rest → aim 회전 in upper local) * extraBend

  // Approach: rest pose 의 upper.quaternion 위에 — knee bend axis 기준 alpha 추가 + aim 적용
  const upperBend = TMP_Q2.setFromAxisAngle(kneeAxisLocal, -alpha);
  // target upper local q = rest * (aim → upperLocal)
  // simpler: aimQ * restLocalQ * upperBend (parent local 좌표계 기준 누적)
  const targetUpperQ = new THREE.Quaternion().multiplyQuaternions(aimQ, chain.upperRestLocalQ).multiply(upperBend);

  // lowerLeg local quaternion = rest * (knee bend axis 기준 π-beta)
  const lowerBend = new THREE.Quaternion().setFromAxisAngle(kneeAxisLocal, Math.PI - beta);
  const targetLowerQ = new THREE.Quaternion().multiplyQuaternions(chain.lowerRestLocalQ, lowerBend);

  // smoothing — slerp from current to target
  upper.quaternion.slerp(targetUpperQ, smoothing);
  lower.quaternion.slerp(targetLowerQ, smoothing);
}

export function createHumanoidFootIK(
  bones: Partial<Record<HumanoidBoneName, THREE.Object3D>>,
  characterRoot: THREE.Object3D | null = null,
): HumanoidFootIK {
  const leftChain = buildLegChain(bones.leftUpperLeg, bones.leftLowerLeg, bones.leftFoot);
  const rightChain = buildLegChain(bones.rightUpperLeg, bones.rightLowerLeg, bones.rightFoot);
  const valid = !!(leftChain || rightChain);

  return {
    enabled: valid,
    groundOffset: 0.0,
    rayRange: 0.4,
    smoothing: 0.4,
    maxDelta: 0.25,
    update(scene) {
      if (!this.enabled) return;

      const process = (chain: LegChain | null) => {
        if (!chain) return;
        const groundY = raycastGround(chain.foot, scene, characterRoot, this.rayRange);
        if (groundY === null) return;

        const currentFootPos = chain.foot.getWorldPosition(new THREE.Vector3());
        const targetY = groundY + this.groundOffset;
        const delta = Math.abs(currentFootPos.y - targetY);
        if (delta < 0.005 || delta > this.maxDelta) return;

        // 발의 x, z 는 그대로 유지 (다리 옆으로 안 휘어짐), y 만 ground 로
        const targetPos = new THREE.Vector3(currentFootPos.x, targetY, currentFootPos.z);
        solveLeg(chain, targetPos, this.smoothing);
      };

      process(leftChain);
      process(rightChain);
    },
  };
}
