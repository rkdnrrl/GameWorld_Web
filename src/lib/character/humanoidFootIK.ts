/**
 * Foot IK — 다리 본 안 건드리는 "Hips Pelvis Offset" 방식.
 *
 * 정통 Two-Bone IK 가 무릎 굽힘 축을 모델별로 알아야 해서 fragile (다리 꺾임 위험).
 * 그 대신: 양 발의 ground raycast 후 — 한 발이 떠 있으면 hips 를 그 만큼 내려서 발이 닿게.
 * 다리 본 회전은 mixer 의 모션 그대로 두니까 catastrophic 실패 없음.
 *
 * 한계:
 *  - 한 발 평지 + 한 발 계단 등 큰 차이 → hips 만 내려가서 다른 발 박힘 (VRChat 도 같음)
 *  - 평지 80% 가림 목표
 */

import * as THREE from 'three';
import type { HumanoidBoneName } from './humanoid';

export interface HumanoidFootIK {
  enabled: boolean;
  /** ground 위에 발이 떠야 할 offset (m). */
  groundOffset: number;
  /** raycast 검색 범위 (위, m). */
  rayRange: number;
  /** hips position 보정 강도 (0~1) — 큰 값 = 즉시 반응, 작은 값 = 부드러움. */
  hipsLerp: number;
  /** 큰 차이 보호 — 이보다 떨어지면 적용 안 함 (점프·낙하 시 보호). */
  maxDelta: number;
  /** 매 frame 호출 — animation mixer.update 이후. scene = ground 충돌 대상 root. */
  update: (scene: THREE.Object3D) => void;
}

const TMP_V = new THREE.Vector3();
const TMP_RAY = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);

function raycastGround(
  foot: THREE.Object3D,
  scene: THREE.Object3D,
  characterRoot: THREE.Object3D | null,
  rayRange: number,
): { y: number } | null {
  foot.updateMatrixWorld(true);
  const footPos = foot.getWorldPosition(TMP_V);
  TMP_RAY.set(new THREE.Vector3(footPos.x, footPos.y + rayRange, footPos.z), DOWN);
  TMP_RAY.far = rayRange * 2;
  const hits = TMP_RAY.intersectObject(scene, true);
  // hit object 의 ancestor 중 characterRoot 가 있으면 self → skip
  for (const h of hits) {
    let isSelf = false;
    if (characterRoot) {
      let o: THREE.Object3D | null = h.object;
      while (o) {
        if (o === characterRoot) { isSelf = true; break; }
        o = o.parent;
      }
    }
    if (!isSelf) return { y: h.point.y };
  }
  return null;
}

export function createHumanoidFootIK(
  bones: Partial<Record<HumanoidBoneName, THREE.Object3D>>,
  characterRoot: THREE.Object3D | null = null,
): HumanoidFootIK {
  const leftFoot = bones.leftFoot;
  const rightFoot = bones.rightFoot;
  const hips = bones.hips;

  const valid = !!(leftFoot && rightFoot && hips);

  // 부드러운 transition 용 누적 offset (mixer 가 매 frame hips.position reset 하지만
  // 우리 IK 가 매 frame 같은 currentOffset 을 그 위에 적용 → 시각적 일관성)
  let currentOffset = 0;

  return {
    enabled: valid,
    groundOffset: 0.0,
    rayRange: 0.4,
    hipsLerp: 0.2,
    maxDelta: 0.2,
    update(scene) {
      if (!this.enabled || !valid) return;

      const lh = raycastGround(leftFoot!, scene, characterRoot, this.rayRange);
      const rh = raycastGround(rightFoot!, scene, characterRoot, this.rayRange);

      // target offset = 더 많이 떠 있는 발의 lift 만큼
      let targetOffset = 0;
      if (lh && rh) {
        const leftFootY = leftFoot!.getWorldPosition(TMP_V).y;
        const rightFootY = rightFoot!.getWorldPosition(TMP_V).y;
        const leftLift  = leftFootY  - (lh.y + this.groundOffset);
        const rightLift = rightFootY - (rh.y + this.groundOffset);
        const lower = Math.min(leftLift, rightLift);
        // 큰 차이 = 점프·낙하 → 보정 안 함
        if (Math.abs(lower) <= this.maxDelta) targetOffset = lower;
      }

      // smooth toward target
      currentOffset += (targetOffset - currentOffset) * this.hipsLerp;
      // 매 frame mixer 가 set 한 hips.position 위에 동일 offset 적용 → 일관된 시각적 보정
      hips!.position.y -= currentOffset;
    },
  };
}
