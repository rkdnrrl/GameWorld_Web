/**
 * 포맷 무관 LipSync — VRM expression / morph target 양쪽 자동 매핑.
 *
 * 우선순위:
 *   1. VRM expression (가장 정확) — vrm.expressionManager.setValue('aa', amp)
 *   2. SkinnedMesh morph target — mesh.morphTargetInfluences[idx] = amp
 *      (mouthOpen / jawOpen / A 등 alias 검색)
 *   3. 둘 다 없으면 noop — 입 안 움직임 (모델 한계)
 */

import * as THREE from 'three';
import { EXPRESSION_ALIASES, type HumanoidExpressionName } from './humanoid';

interface MorphTarget {
  mesh: THREE.Mesh;
  index: number;
}

export interface HumanoidLipSync {
  /** 음성 진폭 (0~1) → 입 모양 적용. setLipSyncAmplitude 의 main API. */
  set: (amp: number) => void;
  /** 표정 적용 — happy/sad/angry/surprised/relaxed/neutral 등 14종 표준. */
  setExpression: (name: HumanoidExpressionName, value: number) => void;
  /** 모든 표정 리셋 (neutral 1, 나머지 0). */
  clear: () => void;
}

/**
 * root 모델 안에서 표정/lipSync 가능한 자원 자동 검색.
 *
 * @param root — 캐릭터 root Object3D
 * @param vrm — VRM 인스턴스 (있으면 expressionManager 우선 사용)
 */
export function createHumanoidLipSync(
  root: THREE.Object3D,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vrm?: any,
): HumanoidLipSync {
  // 1) VRM expressionManager — 가장 정확
  const em = vrm?.expressionManager as { setValue?: (n: string, v: number) => void } | undefined;

  // 2) Morph target 매핑 — VRM 없거나 expression 누락 보강
  const morphMap = new Map<HumanoidExpressionName, MorphTarget[]>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.morphTargetDictionary) return;
    for (const [morphName, idx] of Object.entries(mesh.morphTargetDictionary)) {
      const cleaned = morphName.toLowerCase().replace(/[_\-\s.]/g, '');
      for (const [expName, aliases] of Object.entries(EXPRESSION_ALIASES)) {
        if (!aliases) continue;
        if (aliases.some((a) => a.toLowerCase().replace(/[_\-\s.]/g, '') === cleaned)) {
          const list = morphMap.get(expName as HumanoidExpressionName) ?? [];
          list.push({ mesh, index: idx as number });
          morphMap.set(expName as HumanoidExpressionName, list);
        }
      }
    }
  });

  const applyMorph = (expName: HumanoidExpressionName, value: number) => {
    const targets = morphMap.get(expName);
    if (!targets) return false;
    const v = Math.min(1, Math.max(0, value));
    for (const { mesh, index } of targets) {
      if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = v;
    }
    return true;
  };

  const applyExpression = (expName: HumanoidExpressionName, value: number) => {
    const v = Math.min(1, Math.max(0, value));
    // VRM 우선 — 못 적용하면 morph fallback
    if (em?.setValue) {
      try { em.setValue(expName, v); return; } catch { /* noop */ }
    }
    applyMorph(expName, v);
  };

  return {
    set: (amp: number) => {
      // 입 벌림 — 진폭 증폭 1.5 (작은 음성도 잘 보이게)
      const v = Math.min(1, Math.max(0, amp * 1.5));
      applyExpression('aa', v);
    },
    setExpression: applyExpression,
    clear: () => {
      const allExp: HumanoidExpressionName[] = ['happy','sad','angry','surprised','relaxed','aa','ih','ou','ee','oh','blink','blinkLeft','blinkRight'];
      for (const n of allExp) applyExpression(n, 0);
      applyExpression('neutral', 1);
    },
  };
}
