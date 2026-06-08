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
  update: () => void;
}

const TMP_V1 = new THREE.Vector3();
const TMP_V2 = new THREE.Vector3();
const TMP_V3 = new THREE.Vector3();
const TMP_Q1 = new THREE.Quaternion();
const TMP_Q2 = new THREE.Quaternion();

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
    update() {
      if (!this.enabled) return;
      if (leftChain && this.leftTarget)  { try { solveArm(leftChain, this.leftTarget, this.smoothing); } catch { /* noop */ } }
      if (rightChain && this.rightTarget) { try { solveArm(rightChain, this.rightTarget, this.smoothing); } catch { /* noop */ } }
    },
  };
}
