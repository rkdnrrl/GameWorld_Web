/**
 * Hand IK — 손을 월드 타깃 좌표로 보내는 Two-Bone Analytical IK (등반 grip 등).
 *
 * 발 IK(humanoidFootIK)와 동일한 알고리즘:
 *   상완(upperArm) → 전완(lowerArm) → 손(hand) 두 뼈를 cosine law 로 풀어
 *   손끝이 target 에 닿게 굽힘. rest pose 에서 팔꿈치 굽힘 축 자동 감지.
 *
 * target=null 이면 그 손은 IK 미적용 (애니메이션 그대로). setTarget 으로 매 프레임 갱신.
 * 적용 시점: mixer/vrm 업데이트 '후' (애니 포즈 위에 덮어씀). HumanoidMesh useFrame 끝에서 호출.
 */
import * as THREE from 'three';
import type { HumanoidBoneName } from './humanoid';

interface ArmChain {
  upper: THREE.Object3D;
  lower: THREE.Object3D;
  hand: THREE.Object3D;
  l1: number;
  l2: number;
  elbowAxisLocal: THREE.Vector3;
  upperRestLocalQ: THREE.Quaternion;
  lowerRestLocalQ: THREE.Quaternion;
}

export interface HumanoidHandIK {
  enabled: boolean;
  smoothing: number;
  /** 손 target (월드 좌표). null 이면 그 손 IK 미적용. */
  leftTarget: THREE.Vector3 | null;
  rightTarget: THREE.Vector3 | null;
  /** 잡은 벽면 노멀 (월드). 있으면 손을 벽에 맞춰 회전 (손가락이 벽 안쪽으로 안 뚫게). */
  leftNormal: THREE.Vector3 | null;
  rightNormal: THREE.Vector3 | null;
  update: () => void;
}

const TMP_V1 = new THREE.Vector3();
const TMP_V2 = new THREE.Vector3();
const TMP_V3 = new THREE.Vector3();
const TMP_V4 = new THREE.Vector3();
const TMP_V5 = new THREE.Vector3();
const TMP_Q1 = new THREE.Quaternion();
const TMP_Q2 = new THREE.Quaternion();
const TMP_Q3 = new THREE.Quaternion();
const TMP_Q4 = new THREE.Quaternion();
const TMP_Q5 = new THREE.Quaternion();

/**
 * 손을 벽면에 맞춰 회전 — 솔브 후 호출. 손가락(전완 연장 방향)이 벽 안쪽을 향하던 걸
 * 벽면을 따라 위로 향하게 돌려서 손이 벽을 뚫지 않게 한다. 리그 독립적(기하만 사용).
 */
function orientHandToWall(chain: ArmChain, normal: THREE.Vector3, smoothing: number): void {
  const { lower, hand } = chain;
  if (!hand.parent) return;
  lower.updateMatrixWorld(true);   // 솔브로 바뀐 팔 포즈 반영

  const lowerPos = lower.getWorldPosition(TMP_V1);
  const handPos = hand.getWorldPosition(TMP_V2);
  const cur = TMP_V3.subVectors(handPos, lowerPos);   // 손이 현재 향하는 방향(전완 연장 ≈ 손가락)
  if (cur.lengthSq() < 1e-8) return;
  cur.normalize();

  // 원하는 손가락 방향 = up 을 벽 평면에 투영(벽면 따라 위로). 벽이 수평이면 노멀 바깥으로 fallback.
  const nn = TMP_V4.copy(normal).normalize();
  const desired = TMP_V5.set(0, 1, 0);
  desired.addScaledVector(nn, -desired.dot(nn));   // up - (up·n)n
  if (desired.lengthSq() < 1e-6) desired.copy(nn);
  desired.normalize();

  // cur → desired 회전을 손 월드 쿼터니언 앞에 곱해 적용
  const deltaQ = TMP_Q3.setFromUnitVectors(cur, desired);
  const handWorldQ = hand.getWorldQuaternion(TMP_Q4);
  const newWorldQ = deltaQ.multiply(handWorldQ);             // deltaQ * handWorldQ (deltaQ 이 mutate 됨)
  const parentQinv = hand.parent.getWorldQuaternion(TMP_Q5).invert();
  const localQ = parentQinv.multiply(newWorldQ);            // 부모 로컬로 변환 (parentQinv mutate)
  hand.quaternion.slerp(localQ, smoothing);
}

function buildArmChain(
  upper: THREE.Object3D | undefined,
  lower: THREE.Object3D | undefined,
  hand: THREE.Object3D | undefined,
): ArmChain | null {
  if (!upper || !lower || !hand) return null;
  upper.updateMatrixWorld(true);

  const upperPos = upper.getWorldPosition(new THREE.Vector3());
  const lowerPos = lower.getWorldPosition(new THREE.Vector3());
  const handPos = hand.getWorldPosition(new THREE.Vector3());

  const l1 = upperPos.distanceTo(lowerPos);
  const l2 = lowerPos.distanceTo(handPos);
  if (l1 <= 0 || l2 <= 0) return null;

  // 팔꿈치 굽힘 축 = (upper→lower) × (lower→hand). rest pose 가 약간 굽어 있으면 그 평면 normal.
  const u2l = new THREE.Vector3().subVectors(lowerPos, upperPos);
  const l2h = new THREE.Vector3().subVectors(handPos, lowerPos);
  const elbowAxisWorld = new THREE.Vector3().crossVectors(u2l, l2h);
  if (elbowAxisWorld.lengthSq() < 1e-6) {
    // 완전 직선(T-pose) — 팔은 보통 아래로 굽힘. 캐릭터 up(+y) 가정 fallback.
    elbowAxisWorld.set(0, 1, 0);
  } else {
    elbowAxisWorld.normalize();
  }

  const upperWorldQInv = upper.getWorldQuaternion(new THREE.Quaternion()).invert();
  const elbowAxisLocal = elbowAxisWorld.applyQuaternion(upperWorldQInv).normalize();

  return {
    upper, lower, hand, l1, l2, elbowAxisLocal,
    upperRestLocalQ: upper.quaternion.clone(),
    lowerRestLocalQ: lower.quaternion.clone(),
  };
}

function solveArm(chain: ArmChain, targetWorldPos: THREE.Vector3, smoothing: number): void {
  const { upper, lower, l1, l2, elbowAxisLocal } = chain;
  upper.updateMatrixWorld(true);
  const rootWorld = upper.getWorldPosition(TMP_V1);

  const toTarget = TMP_V2.subVectors(targetWorldPos, rootWorld);
  let D = toTarget.length();
  if (D < 1e-4) return;
  const reach = (l1 + l2) * 0.998;
  if (D > reach) D = reach;
  const minReach = Math.abs(l1 - l2) * 1.05 + 0.01;
  if (D < minReach) D = minReach;

  const parentQ = upper.parent
    ? upper.parent.getWorldQuaternion(new THREE.Quaternion())
    : new THREE.Quaternion();
  const targetLocalDir = TMP_V3.copy(toTarget).normalize().applyQuaternion(parentQ.clone().invert());

  const restLowerWorld = lower.getWorldPosition(new THREE.Vector3());
  const restDirParentLocal = new THREE.Vector3().subVectors(restLowerWorld, rootWorld).normalize()
    .applyQuaternion(parentQ.clone().invert());

  const aimQ = TMP_Q1.setFromUnitVectors(restDirParentLocal, targetLocalDir);

  const cosA = (l1 * l1 + D * D - l2 * l2) / (2 * l1 * D);
  const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const cosB = (l1 * l1 + l2 * l2 - D * D) / (2 * l1 * l2);
  const beta = Math.acos(Math.max(-1, Math.min(1, cosB)));

  const upperBend = TMP_Q2.setFromAxisAngle(elbowAxisLocal, -alpha);
  const targetUpperQ = new THREE.Quaternion().multiplyQuaternions(aimQ, chain.upperRestLocalQ).multiply(upperBend);
  const lowerBend = new THREE.Quaternion().setFromAxisAngle(elbowAxisLocal, Math.PI - beta);
  const targetLowerQ = new THREE.Quaternion().multiplyQuaternions(chain.lowerRestLocalQ, lowerBend);

  upper.quaternion.slerp(targetUpperQ, smoothing);
  lower.quaternion.slerp(targetLowerQ, smoothing);
}

export function createHumanoidHandIK(
  bones: Partial<Record<HumanoidBoneName, THREE.Object3D>>,
): HumanoidHandIK {
  const leftChain = buildArmChain(bones.leftUpperArm, bones.leftLowerArm, bones.leftHand);
  const rightChain = buildArmChain(bones.rightUpperArm, bones.rightLowerArm, bones.rightHand);
  const valid = !!(leftChain || rightChain);

  return {
    enabled: valid,
    smoothing: 0.5,
    leftTarget: null,
    rightTarget: null,
    leftNormal: null,
    rightNormal: null,
    update() {
      if (!this.enabled) return;
      if (leftChain && this.leftTarget) {
        try {
          solveArm(leftChain, this.leftTarget, this.smoothing);
          if (this.leftNormal) orientHandToWall(leftChain, this.leftNormal, this.smoothing);
        } catch { /* noop */ }
      }
      if (rightChain && this.rightTarget) {
        try {
          solveArm(rightChain, this.rightTarget, this.smoothing);
          if (this.rightNormal) orientHandToWall(rightChain, this.rightNormal, this.smoothing);
        } catch { /* noop */ }
      }
    },
  };
}
