/**
 * Foot IK — 발이 ground 에 닿게 하는 Two-Bone IK solver.
 *
 * 목적: VRoid 캐릭터 + Mixamo 모션의 본 비율 차이로 발이 떠 보이는·박혀 보이는 문제 보정.
 * VRChat 도 같은 방식 — 100% 자동 X, 80% 가리면 합격.
 *
 * 알고리즘:
 *   1. 발 base 위치 (애니메이션 적용 후) 에서 아래로 raycast.
 *   2. 지면이 발 base 위에 있으면 발 위치를 지면으로 올림 (offset = 0.05m).
 *   3. Analytical Two-Bone IK 로 upperLeg / lowerLeg 회전 계산 → foot 이 새 위치에 닿게.
 *
 * 사용:
 *   const ik = createHumanoidFootIK(bones);
 *   useFrame(() => { ik.update(scene); });
 */

import * as THREE from 'three';
import type { HumanoidBoneName } from './humanoid';

/** 발 한 쪽의 IK chain — upperLeg → lowerLeg → foot. */
interface LegChain {
  upperLeg: THREE.Object3D;
  lowerLeg: THREE.Object3D;
  foot: THREE.Object3D;
  /** rest pose 의 leg 길이 (upperLeg 끝 → foot). */
  totalLength: number;
  /** rest pose 의 upperLeg → lowerLeg 거리. */
  l1: number;
  /** rest pose 의 lowerLeg → foot 거리. */
  l2: number;
}

export interface HumanoidFootIK {
  enabled: boolean;
  /** ground 위에 발이 떠야 할 추가 offset (m). */
  groundOffset: number;
  /** raycast 검색 범위 (위/아래, m). */
  rayRange: number;
  /** 매 frame 호출 — animation mixer.update 이후. scene = ground 충돌 대상 root. */
  update: (scene: THREE.Object3D) => void;
}

const TMP_V1 = new THREE.Vector3();
const TMP_V2 = new THREE.Vector3();
const TMP_V3 = new THREE.Vector3();
const TMP_Q1 = new THREE.Quaternion();
const TMP_RAY = new THREE.Raycaster();

function buildChain(
  upper: THREE.Object3D | undefined,
  lower: THREE.Object3D | undefined,
  foot: THREE.Object3D | undefined,
): LegChain | null {
  if (!upper || !lower || !foot) return null;
  upper.updateMatrixWorld(true);
  const up = upper.getWorldPosition(new THREE.Vector3());
  const lo = lower.getWorldPosition(new THREE.Vector3());
  const ft = foot.getWorldPosition(new THREE.Vector3());
  const l1 = up.distanceTo(lo);
  const l2 = lo.distanceTo(ft);
  if (l1 <= 0 || l2 <= 0) return null;
  return { upperLeg: upper, lowerLeg: lower, foot, totalLength: l1 + l2, l1, l2 };
}

export function createHumanoidFootIK(
  bones: Partial<Record<HumanoidBoneName, THREE.Object3D>>,
): HumanoidFootIK {
  const leftLeg  = buildChain(bones.leftUpperLeg,  bones.leftLowerLeg,  bones.leftFoot);
  const rightLeg = buildChain(bones.rightUpperLeg, bones.rightLowerLeg, bones.rightFoot);

  function solveLeg(chain: LegChain, targetPos: THREE.Vector3) {
    const { upperLeg, lowerLeg, foot, l1, l2 } = chain;

    upperLeg.updateMatrixWorld(true);
    const rootPos = upperLeg.getWorldPosition(TMP_V1);

    // 거리 D = root → target (clamp 으로 over-extension 방지)
    const dVec = TMP_V2.subVectors(targetPos, rootPos);
    let D = dVec.length();
    if (D < 1e-4) return;
    // 최대 도달 거리 = l1 + l2 (약간 < 로 clamp 해서 무릎이 완전히 펴지는 걸 방지)
    const maxReach = (l1 + l2) * 0.999;
    if (D > maxReach) D = maxReach;

    // 코사인 법칙 — upperLeg 의 root 에서 본 무릎 각 (knee 가 굽힌 각도 아님)
    // cos α = (l1² + D² - l2²) / (2 l1 D)
    const cosA = Math.max(-1, Math.min(1, (l1 * l1 + D * D - l2 * l2) / (2 * l1 * D)));
    const alpha = Math.acos(cosA);

    // upperLeg 가 target 을 향하도록 회전 (world space)
    // rest pose 에서 upperLeg → lowerLeg 의 local 방향과 target 방향의 차이만큼 회전.
    const dirToTarget = TMP_V3.copy(dVec).normalize();

    // 현재 upperLeg → lowerLeg 의 world 방향
    const lowerPos = lowerLeg.getWorldPosition(new THREE.Vector3());
    const currentDir = lowerPos.sub(rootPos).normalize();

    // 회전: currentDir → dirToTarget
    const rotToTarget = TMP_Q1.setFromUnitVectors(currentDir, dirToTarget);
    upperLeg.quaternion.premultiply(
      upperLeg.parent ? upperLeg.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotToTarget).multiply(upperLeg.parent.getWorldQuaternion(new THREE.Quaternion())) : rotToTarget,
    );
    upperLeg.updateMatrixWorld(true);

    // 무릎 굽힘 — upperLeg 를 alpha 만큼 추가 회전 (앞쪽 = +x 축 기준).
    // upperLeg 의 local x 축이 무릎 굽힘 축 (대부분 휴머노이드 표준).
    // 단순화 — knee bend axis 가 모델별로 다를 수 있어 부정확. 일단 minimal.
    const kneeBendAxis = new THREE.Vector3(1, 0, 0);
    const kneeBendUpper = new THREE.Quaternion().setFromAxisAngle(kneeBendAxis, -alpha);
    upperLeg.quaternion.multiply(kneeBendUpper);
    upperLeg.updateMatrixWorld(true);

    // lowerLeg 를 펴주는 회전 — (π - 무릎 내각) 만큼 반대로
    // cos β = (l1² + l2² - D²) / (2 l1 l2)
    const cosB = Math.max(-1, Math.min(1, (l1 * l1 + l2 * l2 - D * D) / (2 * l1 * l2)));
    const beta = Math.acos(cosB);
    const kneeBendLower = new THREE.Quaternion().setFromAxisAngle(kneeBendAxis, Math.PI - beta);
    lowerLeg.quaternion.copy(kneeBendLower);
    lowerLeg.updateMatrixWorld(true);
    foot.updateMatrixWorld(true);
  }

  function processLeg(chain: LegChain | null, scene: THREE.Object3D, groundOffset: number, rayRange: number) {
    if (!chain) return;
    chain.foot.updateMatrixWorld(true);
    const footPos = chain.foot.getWorldPosition(new THREE.Vector3());

    // 발 위치에서 위 (rayRange) 부터 아래로 raycast → ground 표면 탐색
    const rayOrigin = TMP_V1.set(footPos.x, footPos.y + rayRange, footPos.z);
    TMP_RAY.set(rayOrigin, new THREE.Vector3(0, -1, 0));
    TMP_RAY.far = rayRange * 2;
    // ground 후보 — scene 의 모든 mesh. 캐릭터 본인은 자동 제외 (raycaster 가 mesh 면만 hit).
    const hits = TMP_RAY.intersectObject(scene, true);
    if (hits.length === 0) return;
    // 자기 캐릭터의 mesh 는 건너뜀 — foot 의 ancestor 인지 검사
    let hit: THREE.Intersection | null = null;
    for (const h of hits) {
      let obj: THREE.Object3D | null = h.object;
      let isSelf = false;
      while (obj) {
        if (obj === chain.foot || obj === chain.upperLeg) { isSelf = true; break; }
        obj = obj.parent;
      }
      if (!isSelf) { hit = h; break; }
    }
    if (!hit) return;

    const groundY = hit.point.y + groundOffset;
    // 발이 ground 보다 아래면 (캐릭터가 박힘) 또는 ground 가 발보다 약간 위면 (이상치) IK 적용.
    // 차이 작으면 건너뜀 — 성능 + 떨림 방지.
    if (Math.abs(groundY - footPos.y) < 0.01) return;

    const target = new THREE.Vector3(footPos.x, groundY, footPos.z);
    solveLeg(chain, target);
  }

  return {
    enabled: true,
    groundOffset: 0.05,
    rayRange: 0.4,
    update(scene) {
      if (!this.enabled) return;
      processLeg(leftLeg,  scene, this.groundOffset, this.rayRange);
      processLeg(rightLeg, scene, this.groundOffset, this.rayRange);
    },
  };
}
