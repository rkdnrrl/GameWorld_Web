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
  rayRange: number,
): { y: number } | null {
  foot.updateMatrixWorld(true);
  const footPos = foot.getWorldPosition(TMP_V);
  // 발 위 rayRange 부터 아래로 raycast (foot 자신 ancestor 는 자동 제외 — raycaster 가 mesh 만 hit)
  TMP_RAY.set(new THREE.Vector3(footPos.x, footPos.y + rayRange, footPos.z), DOWN);
  TMP_RAY.far = rayRange * 2;
  const hits = TMP_RAY.intersectObject(scene, true);
  // 자기 캐릭터의 mesh 제외 — foot 의 ancestor 인지
  for (const h of hits) {
    let o: THREE.Object3D | null = h.object;
    let self = false;
    while (o) {
      if (o === foot) { self = true; break; }
      o = o.parent;
    }
    if (!self) return { y: h.point.y };
  }
  return null;
}

export function createHumanoidFootIK(
  bones: Partial<Record<HumanoidBoneName, THREE.Object3D>>,
): HumanoidFootIK {
  const leftFoot = bones.leftFoot;
  const rightFoot = bones.rightFoot;
  const hips = bones.hips;

  // 발/hips 중 하나라도 없으면 — 작동 안 함 (안전 no-op)
  const valid = !!(leftFoot && rightFoot && hips);

  // hips 원래 y 위치 기준 — 보정 시 일정 이상 벗어나지 않게 (점프 시 hips 못 내려가게 보호)
  // 매 frame 의 hips.position.y 가 mixer 가 set 한 값. 그 위에 offset 추가.

  return {
    enabled: valid,
    groundOffset: 0.0,
    rayRange: 0.35,
    hipsLerp: 0.25,
    maxDelta: 0.15,
    update(scene) {
      if (!this.enabled || !valid) return;
      const lh = raycastGround(leftFoot!, scene, this.rayRange);
      const rh = raycastGround(rightFoot!, scene, this.rayRange);
      if (!lh || !rh) return;

      // 양 발의 현재 y 위치
      const leftFootY = leftFoot!.getWorldPosition(TMP_V).y;
      const rightFootY = rightFoot!.getWorldPosition(TMP_V).y;

      // 각 발이 ground 까지 떨어진 거리 (양수 = 떠 있음)
      const leftLift  = leftFootY  - (lh.y + this.groundOffset);
      const rightLift = rightFootY - (rh.y + this.groundOffset);

      // 더 많이 떠 있는 발 = 그 거리만큼 hips 내림. 두 발 다 박혀있으면 hips 올림.
      const lower = Math.min(leftLift, rightLift);
      if (Math.abs(lower) < 0.005) return;            // 떨림 방지
      if (Math.abs(lower) > this.maxDelta) return;     // 점프·낙하 시 보호

      // hips 의 parent (보통 캐릭터 root 또는 그 위) 의 local 좌표계로 변환 필요.
      // 단순화: hips 의 local y 만 lerp. parent transform 영향 적다 가정 (대부분 캐릭터에 OK).
      hips!.position.y -= lower * this.hipsLerp;
    },
  };
}
