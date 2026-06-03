/**
 * lipSync — 음성 amplitude 기반 캐릭터 입모양 (VRChat/Zoom 식 lip flap).
 *
 * 사용:
 *   const target = findLipSyncTarget(scene)        // 한번만 (모델 로드 후)
 *   const level = readAnalyserLevel(analyser, buf) // useFrame 매번
 *   applyLipSync(target, level)
 *
 * morphTarget 후보 매칭 — 실패 시 jaw bone fallback — 그것도 실패 시 hasMouth:false
 * (UI 가 🎤 fallback 아이콘 표시).
 */
import * as THREE from 'three';

/** 캐릭터에서 발견된 입 제어 핸들 */
export interface LipSyncTarget {
  /** 무엇이 입을 제어하는지 — UI fallback 판단용 */
  kind: 'expression' | 'morph' | 'bone' | 'none';
  /** kind='morph' 시 morphTarget 이 있는 메시들 + 해당 influence 인덱스 */
  morphs: Array<{ mesh: THREE.Mesh; index: number }>;
  /** kind='bone' 시 회전할 jaw bone */
  jawBone?: THREE.Object3D;
  /** jawBone 의 기본 회전 (복원용) */
  jawRest?: THREE.Euler;
  /** kind='expression' — VRM expressionManager (vrm.update() 가 매 frame 호출되어야 적용됨) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expressionManager?: any;
  /** kind='expression' — viseme 이름 ('aa' / 'A' / 'mouthOpen') */
  expressionName?: string;
}

/** mouth-open morph target 이름 후보 (대소문자 무시, 공백/언더바/하이픈 제거 후 비교) */
const MORPH_CANDIDATES = [
  // Ready Player Me / 일반
  'mouthopen', 'jawopen',
  'mouth_open', 'jaw_open',
  'viseme_aa', 'viseme_a', 'viseme_o', 'viseme_e',
  'aa', 'a',
  'mouth open', 'jaw open',
  // VRoid / VRM 0.x — A/I/U/E/O 단일 문자
  // (정확 매칭은 'a' 가 단일 문자라 위에서 이미 잡힘)
  // VRM 1.0 / Oculus viseme
  'viseme_pp', 'viseme_ff', 'aa_open', 'ahopen',
  // 한국어 / 한자
  '입벌림', '입열기', '口開け', '張嘴',
];

/** 끝부분 매칭 패턴 — VRoid 의 긴 prefix (Face.M_F00_...Fcl_MTH_A) 잡기 */
const MORPH_SUFFIX_PATTERNS = [
  /fcl_?mth_?a$/i,    // Fcl_MTH_A, FclMthA
  /fcl_?mth_?aa$/i,
  /fcl_?mth_?o$/i,
  /mouth_?open$/i,
  /jaw_?open$/i,
  /viseme_?aa$/i,
];

/** jaw bone 이름 후보 (substring 매칭, 대소문자 무시) */
const JAW_BONE_CANDIDATES = ['jaw', '턱'];

/** GLB/FBX scene 에서 lip-sync 타겟을 찾음 (한번만 호출, 결과 캐시).
 *  VRM 의 expressionManager 가 있으면 그게 우선 (가장 정확한 viseme 제어).
 *  디버그: localStorage 에 `alp_lipsync_debug=1` 세팅하면 매칭 안 된 morph 이름들을 console 에 출력.
 *
 *  @param vrm 선택. VRM 인스턴스 있으면 expressionManager 로 viseme 매칭 시도.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function findLipSyncTarget(root: THREE.Object3D, vrm?: any): LipSyncTarget {
  const morphs: Array<{ mesh: THREE.Mesh; index: number }> = [];
  let jawBone: THREE.Object3D | undefined;
  const debug = typeof window !== 'undefined' && window.localStorage?.getItem('alp_lipsync_debug') === '1';
  const allMorphNames: string[] = [];

  // VRM expressionManager 우선 매칭 (가장 정확)
  const em = vrm?.expressionManager;
  if (em) {
    // VRM 표준 viseme: aa / ih / ou / ee / oh — 'aa' 가 입 가장 크게 벌림
    const candidates = ['aa', 'A', 'mouthOpen', 'oh', 'OH'];
    for (const name of candidates) {
      // expression 이 존재하면 (있으면 expressions 배열에 있음)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exp = em.getExpression?.(name) ?? (em.expressionMap && em.expressionMap[name]);
      if (exp) {
        if (debug) console.log('[lipSync] VRM expression matched:', name);
        return { kind: 'expression', morphs: [], expressionManager: em, expressionName: name };
      }
    }
    if (debug) console.log('[lipSync] VRM has expressionManager but no aa/mouthOpen — fallback to morph search');
  }

  root.traverse((obj) => {
    // morph target 검색
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
      const dict = mesh.morphTargetDictionary;
      for (const key of Object.keys(dict)) {
        if (debug) allMorphNames.push(key);
        const lower = key.toLowerCase().replace(/[\s_-]/g, '');
        const exactMatch = MORPH_CANDIDATES.some((c) => c.replace(/[\s_-]/g, '') === lower);
        const suffixMatch = !exactMatch && MORPH_SUFFIX_PATTERNS.some((re) => re.test(key));
        if (exactMatch || suffixMatch) {
          morphs.push({ mesh, index: dict[key] });
          break; // 한 메시당 첫 매칭만
        }
      }
    }
    // jaw bone 검색 (Bone 또는 일반 Object3D 둘 다 OK)
    if (!jawBone) {
      const name = (obj.name || '').toLowerCase();
      if (JAW_BONE_CANDIDATES.some((c) => name.includes(c))) {
        // "jawline" 같은 잘못된 매칭 방지 — 정확히 "jaw" 단어 포함
        if (/\bjaw\b|^jaw|jaw$|_jaw|jaw_/i.test(obj.name) || obj.name.includes('턱')) {
          jawBone = obj;
        }
      }
    }
  });

  if (debug) {
    console.log('[lipSync] morphs found in model:', allMorphNames);
    console.log('[lipSync] matched morphs:', morphs.length, '/ jaw bone:', jawBone?.name);
  }

  if (morphs.length > 0) {
    return { kind: 'morph', morphs };
  }
  if (jawBone) {
    return { kind: 'bone', morphs: [], jawBone, jawRest: jawBone.rotation.clone() };
  }
  return { kind: 'none', morphs: [] };
}

/** AnalyserNode 에서 0~1 정규화된 amplitude 읽기. buf 는 재사용 (alloc 회피). */
export function readAnalyserLevel(analyser: AnalyserNode, buf: Uint8Array): number {
  // lib.dom 의 새 generic (Uint8Array<ArrayBuffer>) 회피 — runtime 상 같음.
  analyser.getByteFrequencyData(buf as Uint8Array<ArrayBuffer>);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i];
  const avg = sum / buf.length / 255; // 0~1
  // 살짝 sharpening: 작은 값 잘라내고 큰 값 강조 → 자연스러운 입모양
  return Math.min(1, Math.max(0, (avg - 0.05) * 2.5));
}

/** smoothed 값 (이전 level 과 lerp) — fast attack, slow release. */
export function smoothLevel(prev: number, target: number): number {
  const attack = 0.6;  // 빠르게 열림
  const release = 0.15; // 천천히 닫힘
  const k = target > prev ? attack : release;
  return prev + (target - prev) * k;
}

/** 매 프레임 호출 — level 0~1 을 캐릭터 입에 적용. */
export function applyLipSync(target: LipSyncTarget, level: number): void {
  if (target.kind === 'expression' && target.expressionManager && target.expressionName) {
    // VRM expressionManager — setValue 후 vrm.update(dt) 가 actual blend shape 적용함
    try { target.expressionManager.setValue(target.expressionName, level); } catch { /* noop */ }
  } else if (target.kind === 'morph') {
    for (const { mesh, index } of target.morphs) {
      if (mesh.morphTargetInfluences) {
        mesh.morphTargetInfluences[index] = level;
      }
    }
  } else if (target.kind === 'bone' && target.jawBone && target.jawRest) {
    // 턱을 살짝 아래로 (X축 회전, 모델마다 축 다를 수 있어 부정확할 수 있음)
    target.jawBone.rotation.x = target.jawRest.x + level * 0.3;
  }
  // kind='none' 은 컴포넌트 측에서 🎤 아이콘 fallback 표시
}

/** AnalyserNode buffer 크기 (fftSize 256 → frequencyBinCount 128) */
export const ANALYSER_BUFFER_SIZE = 128;
