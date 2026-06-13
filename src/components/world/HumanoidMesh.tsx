'use client';
/**
 * 포맷 무관 humanoid 캐릭터 mesh — VRChat 식.
 *
 * 입력: 모델 url + 마스터 클립 url map (13슬롯 — idle/walk_4/run_2/jump_3/fall/crouch_2) + animStateRef + lipSync analyser
 * 동작: createHumanoidCharacter 로 1줄 로드 → mixer + lipSync + lookAt 자동
 *
 * 슬롯이 일부만 등록되어 있어도 fallback chain 으로 재생 (humanoid.ts ANIM_SLOT_FALLBACK).
 * 운영자가 humanoid-normalized 클립 (VRMA 또는 정규화된 FBX) 등록 → 모든 캐릭터 호환.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createHumanoidCharacter, type HumanoidCharacter } from '@/lib/character/humanoidCharacter';
import { loadAnimationSource, retargetWithSkeletonUtils, normalizeClipToHumanoidNames, retargetClipToHumanoid, type AnimationSource } from '@/lib/character/humanoidAnimation';
import { ANIM_SLOTS, ANIM_SLOT_LEGACY_ALIAS, type AnimSlot } from '@/lib/character/humanoid';
import { createHumanoidFootIK, type HumanoidFootIK } from '@/lib/character/humanoidFootIK';
import { createHumanoidHandIK, type HumanoidHandIK } from '@/lib/character/humanoidHandIK';
import { envFx } from '@/lib/world/envFx';
import { FootstepDust } from '@/components/world/FootstepDust';
import { BreathFog } from '@/components/world/BreathFog';

/** 손 IK 타깃 ref 형태 — 스크립트(world.setHandTarget)가 채움. null=미적용. */
export type HandTargets = {
  left: [number, number, number] | null;
  right: [number, number, number] | null;
  /** 잡은 벽면 노멀 (월드). 있으면 손을 벽에 맞춰 회전 (벽 뚫림 방지). */
  leftN?: [number, number, number] | null;
  rightN?: [number, number, number] | null;
};
import { loadVRMA, vrmaToClip, vrmaToUniversalClip, fbxToVrmClip } from '@/lib/character/vrmAnimation';

function getExt(url: string): string {
  return (url.split('?')[0].split('#')[0].split('.').pop() || '').toLowerCase();
}
function isVrmaUrl(url: string): boolean { return getExt(url) === 'vrma'; }
function isFbxUrl(url: string): boolean { return getExt(url) === 'fbx'; }

/**
 * 메인 스레드 yield — 무거운 동기 작업(retarget / 정점 순회) 사이에 끼워서
 * 다른 캐릭터의 useFrame 이 멈추지 않게 한다. setTimeout(0) 은 매크로태스크라
 * frame rAF 와 같은 큐에서 처리되어 다른 작업이 끼어들 수 있음.
 */
function yieldToMain(): Promise<void> {
  return new Promise<void>(resolve => setTimeout(resolve, 0));
}

/**
 * 캐릭터 로딩 중 시각화 — 시안색 펄스 링 + 회전 wireframe 실린더.
 * char 부착 + compileAsync 끝나면 부모가 unmount → 즉시 사라짐.
 * 보라색은 PlacementOverlay 와 겹쳐서 시안색으로 구분.
 */
function LoadingEffect({ targetHeight }: { targetHeight: number }) {
  const cylRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (cylRef.current) cylRef.current.rotation.y = t * 1.5;
    if (ringRef.current) {
      const s = 1 + Math.sin(t * 3) * 0.15;
      ringRef.current.scale.set(s, 1, s);
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.45 + Math.sin(t * 3) * 0.25;
    }
  });
  return (
    <group>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.35, 0.48, 32]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.6} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={cylRef} position={[0, targetHeight / 2, 0]}>
        <cylinderGeometry args={[0.3, 0.3, targetHeight, 8, 1, true]} />
        <meshBasicMaterial color="#06b6d4" wireframe transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </group>
  );
}


/** 슬롯별 raw 애니메이션 source 모듈 캐시 — 캐릭터별 retarget 위해 한 번만 로드. */
const animSourceCache = new Map<string, Promise<AnimationSource>>();
function getAnimationSource(url: string, slot: string): Promise<AnimationSource> {
  const key = `${slot}::${url}`;
  if (!animSourceCache.has(key)) {
    animSourceCache.set(key, loadAnimationSource(url, slot));
  }
  return animSourceCache.get(key)!;
}

/** animState 값이 슬롯명이 아니라 애니메이션 에셋 URL 인지 — on-demand emote 판별. */
function isEmoteUrl(s: string): boolean {
  return /^https?:\/\//.test(s) && /\.(fbx|vrma|glb|gltf)(\?|#|$)/i.test(s);
}

/** URL 애니메이션 에셋 → 이 캐릭터에 맞게 retarget. 슬롯 로딩 블록과 동일 chain (FBX→VRM / VRMA / generic). */
async function retargetEmoteClipForChar(url: string, char: HumanoidCharacter): Promise<THREE.AnimationClip | null> {
  let retargeted: THREE.AnimationClip | null = null;
  try {
    if (isFbxUrl(url) && char.vrm) {
      try { retargeted = await fbxToVrmClip(url, char.vrm, url); } catch { /* fallthrough */ }
    }
    if (!retargeted && isVrmaUrl(url)) {
      const vrma = await loadVRMA(url);
      retargeted = char.vrm ? vrmaToClip(vrma, char.vrm, url) : vrmaToUniversalClip(vrma, char.bones, url);
    }
    if (!retargeted) {
      const src = await getAnimationSource(url, '__emote__');
      try { retargeted = await retargetWithSkeletonUtils(src.root, src.clip, char.bones); }
      catch { retargeted = retargetClipToHumanoid(normalizeClipToHumanoidNames(src.clip), char.bones); }
    }
  } catch (e) {
    console.warn('[humanoid] emote URL retarget 실패', url, e);
  }
  return (retargeted && retargeted.tracks.length > 0) ? retargeted : null;
}

const API = (typeof window !== 'undefined' && (window as { __ALP_API__?: string }).__ALP_API__) || 'https://airliveplay.com';

/**
 * 운영자 등록 슬롯 클립 url — 모든 캐릭터 공용. 모듈 캐시 (첫 호출에 fetch, 이후 캐시).
 * 13슬롯 + legacy 5슬롯 (walk/run/jump) 호환.
 */
let clipUrlsPromise: Promise<Partial<Record<AnimSlot, string>>> | null = null;
function getOperatorClipUrls(): Promise<Partial<Record<AnimSlot, string>>> {
  if (!clipUrlsPromise) {
    clipUrlsPromise = fetch(`${API}/api/character-animations`)
      .then((r) => r.ok ? r.json() : { slots: {} })
      .then((d: { slots?: Record<string, { modelUrl?: string; enabled?: boolean }> }) => {
        const slots = d.slots || {};
        const out: Partial<Record<AnimSlot, string>> = {};
        // 13 표준 슬롯
        for (const slot of ANIM_SLOTS) {
          const s = slots[slot];
          if (s?.modelUrl && s.enabled !== false) out[slot] = s.modelUrl;
        }
        // legacy 5슬롯 호환 — `walk`/`run`/`jump` 등록되어 있고 새 슬롯 없으면 매핑
        for (const [legacy, mapped] of Object.entries(ANIM_SLOT_LEGACY_ALIAS)) {
          const s = slots[legacy];
          if (s?.modelUrl && s.enabled !== false && !out[mapped]) {
            out[mapped] = s.modelUrl;
          }
        }
        return out;
      })
      .catch(() => ({}));
  }
  return clipUrlsPromise;
}

export interface HumanoidMeshProps {
  /** 모델 URL — .vrm / .glb / .gltf / .fbx 등 */
  url: string;
  /** 사용자 수동 본 매핑 — 자동 매칭 위에 덮어씀 */
  manualBoneMap?: Partial<Record<string, string>>;
  /** 운영자가 등록한 슬롯별 마스터 클립 URL. */
  clipUrls?: Partial<Record<AnimSlot, string>>;
  /** 현재 애니메이션 상태 — 매 frame 폴링 → setSlot */
  animStateRef: React.RefObject<string>;
  /** lipSync analyser — 음성 진폭으로 입 모양 */
  getAnalyser?: () => AnalyserNode | undefined;
  /** 1인칭 시 머리 숨김 */
  hideHead?: boolean;
  /** 그림자 캐스트 */
  castShadow?: boolean;
  /** 카메라 시선 추적 (default true) */
  enableLookAt?: boolean;
  /**
   * Foot IK 활성 (default false) — Two-Bone IK 솔버가 모델별 본 좌표축 차이로 안정성 부족.
   * 발 정렬은 humanoidLoader 의 발 본 기준 normalization 으로 처리. IK 는 추후 작업.
   */
  enableFootIK?: boolean;
  /** 모델 높이 정규화 (1.8m 기준) */
  targetHeight?: number;
  /** Y 오프셋 (발 미세조정) */
  offsetY?: number;
  /** 크기 배율 */
  userScale?: number;
  /** 로드 완료 시 콜백 — character page 가 진단/매칭 결과 받음 */
  onLoaded?: (char: HumanoidCharacter) => void;
  /** 손 IK 타깃 ref — 제공되면 매 프레임 손을 그 월드 좌표로 (등반 grip). null=미적용. */
  handTargetRef?: React.MutableRefObject<HandTargets>;
}

/** 단일 캐시 — 같은 url 요청 중복 로드 방지. dispose 는 페이지 unmount 시 안 함 (캐시) */
// ⚠️ 인스턴스 캐시 안 함 — 같은 url 캐릭터를 여러 플레이어(HumanoidMesh)가 **동시에** 쓰면
// 같은 root Object3D 를 공유하게 되는데, three.js 에선 객체가 부모를 하나만 가지므로
// 두 번째 instance 의 add() 가 첫 번째에서 scene 을 빼앗아 → 한쪽만 렌더되는 버그.
// (mixer/bones/vrm/lipSync 가 모두 root 에 묶여 있어 scene 만 클론할 수도 없음.)
// → 인스턴스마다 자기 캐릭터를 로드하고, 언마운트 시 disposeCharacter() 로 정리한다.
async function getCharacter(url: string, manualBoneMap?: Partial<Record<string, string>>): Promise<HumanoidCharacter> {
  return createHumanoidCharacter(url, { manualBoneMap: manualBoneMap as Partial<Record<never, string>> });
}

/** 캐릭터 1개의 GPU 자원(지오메트리·머티리얼·텍스처) + mixer 정리. 인스턴스 전용이라 안전. */
function disposeCharacter(c: HumanoidCharacter) {
  try { c.dispose(); } catch { /* noop */ }
  try { if (c.scene.parent) c.scene.parent.remove(c.scene); } catch { /* noop */ }
  try {
    c.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : (m.material ? [m.material] : []);
      for (const mat of mats) {
        if (!mat) continue;
        for (const k of Object.keys(mat)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const v = (mat as any)[k];
          if (v && v.isTexture) v.dispose();
        }
        mat.dispose();
      }
    });
  } catch { /* noop */ }
}

/** 비 젖음을 머티리얼에 적용 — 모든 타입 안전(원본값 1회 캡처 후 보간).
 *  공통: 색 어둡게(젖은 톤). 표준/물리 머티리얼만: 거칠기↓(광택) + 환경 반사↑.
 *  VRM MToon 등 roughness/envMapIntensity 없는 머티리얼은 색만 — 가드로 NaN 방지. */
function applyCharWet(mat: THREE.Material, w: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = mat as any;
  const ud = mat.userData;
  if (m.color && ud.__dryColor === undefined) ud.__dryColor = m.color.clone();
  if (typeof m.roughness === 'number' && ud.__dryRough === undefined) ud.__dryRough = m.roughness;
  if (typeof m.envMapIntensity === 'number' && ud.__dryEnv === undefined) ud.__dryEnv = m.envMapIntensity;
  if (m.color && ud.__dryColor) m.color.copy(ud.__dryColor).multiplyScalar(1 - 0.22 * w);
  if (typeof m.roughness === 'number' && ud.__dryRough !== undefined) m.roughness = ud.__dryRough * (1 - 0.55 * w);
  if (typeof m.envMapIntensity === 'number' && ud.__dryEnv !== undefined) m.envMapIntensity = ud.__dryEnv * (1 + 1.2 * w);
}

export function HumanoidMesh(props: HumanoidMeshProps) {
  const {
    url, manualBoneMap, clipUrls, animStateRef, getAnalyser,
    hideHead = false, castShadow = true, enableLookAt = true, enableFootIK = false,
    targetHeight = 1.8, offsetY = 0, userScale = 1, onLoaded, handTargetRef,
  } = props;

  const { gl, camera, scene } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const [char, setChar] = useState<HumanoidCharacter | null>(null);
  /** 셰이더 비동기 컴파일 완료 여부. char 도착 후 compileAsync 끝나면 true → LoadingEffect 사라짐.
   *  첫 frame 동기 컴파일로 인한 50-200ms 멈춤 방지 (KHR_parallel_shader_compile 지원 시 백그라운드). */
  const [compileReady, setCompileReady] = useState(false);
  // char 가 바뀌면 (url 변경 등) compileReady reset → LoadingEffect 다시 표시
  useEffect(() => { if (!char) setCompileReady(false); }, [char]);
  const footIKRef = useRef<HumanoidFootIK | null>(null);
  const handIKRef = useRef<HumanoidHandIK | null>(null);
  const handTmpL = useRef(new THREE.Vector3());
  const handTmpR = useRef(new THREE.Vector3());
  const handNmpL = useRef(new THREE.Vector3());
  const handNmpR = useRef(new THREE.Vector3());
  /** 캐릭터 인스턴스 추적 — 바뀌면 reset. */
  const lastCharForCrouchRef = useRef<HumanoidCharacter | null>(null);
  /** LOD frame counter — 거리별 mixer.update skip 용. */
  const lodFrameCounterRef = useRef(0);
  /** LOD 거리 측정 재사용 Vector3. */
  const _tmpVec = useMemo(() => new THREE.Vector3(), []);
  /** 현재 적용된 그림자 캐스트 상태 — 거리 구간 변경 시만 traverse 호출 (매 frame traverse 방지). */
  const shadowOnRef = useRef<boolean>(true);
  /** lookAt 거리 cutoff 상태 — 멀리는 vrm.lookAt 비활성화 (head bone matrix 재계산 비용 절감). */
  const lookAtOnRef = useRef<boolean>(true);
  /** 비 젖음 — 현재 보간값 + 마지막으로 머티리얼에 반영한 값(변화 클 때만 traverse). */
  const wetRef = useRef(0);
  const appliedWetRef = useRef(0);

  // 모델 로드 + 클립 로드 + 슬롯 등록 (한 번)
  useEffect(() => {
    let cancelled = false;
    let local: HumanoidCharacter | null = null;
    (async () => {
      try {
        const c = await getCharacter(url, manualBoneMap);
        if (cancelled) return;
        local = c;
        // ── 1) 모델 크기 정규화 먼저 ── crouch grounding 시 bind 발 = scene local Y 0 이어야
        // 정확한 lift 측정 가능.
        const normalizeNeeded = !c.scene.userData.__normalized;
        if (normalizeNeeded) {
          c.scene.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(c.scene);
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          if (maxDim > 0) {
            const baseScale = targetHeight / maxDim;
            c.scene.scale.setScalar(baseScale);
            c.scene.updateMatrixWorld(true);
            // 정점 순회로 정확한 발 위치 측정 — mesh 마다 별도 task 로 yield 끼움.
            // VRM 캐릭터는 보통 1-2개 SkinnedMesh (정점 1만-3만개) → mesh 하나당 5-20ms.
            // 각 mesh 사이 yield → 다른 캐릭터 useFrame 이 frame 사이 끼어들 수 있음.
            const meshes: THREE.Mesh[] = [];
            c.scene.traverse((o) => {
              const m = o as THREE.Mesh;
              if (!(m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh)) return;
              const geo = m.geometry;
              const pos = geo?.attributes?.position;
              if (!pos) return;
              meshes.push(m);
            });
            const meshBox = new THREE.Box3();
            let hasMesh = false;
            const v = new THREE.Vector3();
            for (const m of meshes) {
              await yieldToMain();
              if (cancelled) return;
              m.updateMatrixWorld(true);
              const pos = m.geometry.attributes.position as THREE.BufferAttribute;
              for (let i = 0; i < pos.count; i++) {
                v.fromBufferAttribute(pos, i);
                v.applyMatrix4(m.matrixWorld);
                meshBox.expandByPoint(v);
              }
              hasMesh = true;
            }
            const box2 = hasMesh ? meshBox : new THREE.Box3().setFromObject(c.scene);
            const baseY: number = box2.min.y;
            c.scene.position.y -= baseY;
            c.scene.userData.__baseScale = baseScale;
            console.log('[norm]', { isVrm: !!c.vrm, boxMinY: box2.min.y.toFixed(3), boxMaxY: box2.max.y.toFixed(3), baseY: baseY.toFixed(3), scenePosY: c.scene.position.y.toFixed(3) });
          }
          c.scene.userData.__normalized = true;
        }
        // ── bind 발 위치 캡처 (crouch per-frame grounding 용) ──
        // bone 회전 무관하게 다리 길이만 반영된 reference 값. scene.position.y 영향 받지 않음
        // (foot.world - scene.world = scene local 좌표).
        if (c.scene.userData.__bindFootInSceneLocalY === undefined) {
          c.scene.updateMatrixWorld(true);
          const tmp = new THREE.Vector3();
          const sceneW = c.scene.getWorldPosition(tmp).y;
          const lY = c.bones.leftFoot?.getWorldPosition(new THREE.Vector3()).y ?? sceneW;
          const rY = c.bones.rightFoot?.getWorldPosition(new THREE.Vector3()).y ?? sceneW;
          c.scene.userData.__bindFootInSceneLocalY = Math.min(lY, rY) - sceneW;
          c.scene.userData.__sceneBindY = c.scene.position.y;
        }
        // ── 2) 클립 로드 ──
        // 운영자 등록 슬롯 + 캐릭터별 오버라이드(clipUrls) 병합 — 캐릭터가 일부 슬롯(걷기/달리기 등)만
        // 바꿔도 나머지는 운영자 기본 유지. 캐릭터 슬롯이 같은 키면 그게 우선.
        const operatorClips = await getOperatorClipUrls();
        if (cancelled) return;
        const effectiveClipUrls: Partial<Record<AnimSlot, string>> =
          clipUrls && Object.keys(clipUrls).length
            ? { ...operatorClips, ...clipUrls }
            : operatorClips;
        if (cancelled) return;
        if (effectiveClipUrls) {
          const urlCount = Object.values(effectiveClipUrls).filter(Boolean).length;
          if (urlCount === 0) {
            console.warn(
              '[humanoid] 운영자 등록 슬롯이 0개 — 캐릭터가 T-pose 로 표시됩니다.\n' +
              '운영자 데스크탑 > "캐릭터 애니메이션" 에서 최소 idle 슬롯에 .vrma URL 을 등록하세요.'
            );
          }
          const clipMap = new Map<AnimSlot, THREE.AnimationClip>();
          // Promise.all 의 모든 슬롯이 동시에 마이크로태스크 큐 점령 → 다른 캐릭터 useFrame 굶주림.
          // 슬롯 인덱스에 비례한 setTimeout 으로 시작 시점 분산 (10ms 간격) → 메인 스레드에 frame
          // 처리 시간 양보. 13개 슬롯이면 ~130ms 분산되어 첫 frame 부터 다른 캐릭터 움직임 유지됨.
          const entries = Object.entries(effectiveClipUrls);
          await Promise.all(entries.map(async ([slot, clipUrl], idx) => {
            if (!clipUrl) return;
            // 시작 시점을 슬롯 인덱스만큼 늦춤 — 동시 retarget 폭주 방지
            await new Promise<void>(r => setTimeout(r, idx * 10));
            if (cancelled) return;
            try {
              let retargeted: THREE.AnimationClip | null = null;

              // Fast path — VRMA + VRM 캐릭터: createVRMAnimationClip 가 normalized bone 이름으로
              // track 만듦. mixer 가 normalized bone 회전 set → vrm.update 가 raw bone 으로 mirror
              // (T-pose↔A-pose rest pose 보정 포함). 정통 three-vrm 패턴.
              // FBX 모션 (Mixamo) + VRM 캐릭터 → 직접 Mixamo bone 매핑 (OWNverse vrm-viewer 방식).
              // 운영자가 fbx 그대로 등록 — 클라가 VRM 으로 변환.
              if (isFbxUrl(clipUrl) && c.vrm) {
                try {
                  retargeted = await fbxToVrmClip(clipUrl, c.vrm, slot);
                  if (slot === 'idle') console.log(`[humanoid] idle ${retargeted.tracks.length} tracks (FBX→VRM)`);
                } catch (eFbx) {
                  console.warn(`[humanoid] ${slot} FBX→VRM 실패`, eFbx);
                }
              }
              // VRMA path 분기:
              //   VRM 캐릭터 → vrmaToClip (createVRMAnimationClip) — vrm.humanoid 의 rest pose 자동 보정
              //   FBX/GLB 캐릭터 → vrmaToUniversalClip — bones map 통해 humanoid 이름 → 실제 본 이름 변환
              if (!retargeted && isVrmaUrl(clipUrl)) {
                try {
                  const vrma = await loadVRMA(clipUrl);
                  if (c.vrm) {
                    retargeted = vrmaToClip(vrma, c.vrm, slot);
                    if (slot === 'idle') console.log(`[humanoid] idle ${retargeted.tracks.length} tracks (VRM path)`);
                  } else {
                    retargeted = vrmaToUniversalClip(vrma, c.bones, slot);
                    if (slot === 'idle') {
                      const sample = retargeted.tracks.slice(0, 3).map((t) => {
                        const bn = t.name.split('.')[0];
                        const found = c.scene.getObjectByName(bn);
                        return `${t.name}${found ? '✓' : '✗'}`;
                      });
                      console.log(`[humanoid] idle ${retargeted.tracks.length} tracks (FBX universal), sample:`, sample);
                    }
                  }
                } catch (eVrma) {
                  console.warn(`[humanoid] ${slot} VRMA 실패 — generic retarget 시도`, eVrma);
                }
              }

              if (!retargeted) {
                const src = await getAnimationSource(clipUrl, slot);
                await yieldToMain();  // retarget 동기 작업 전 다른 frame 양보
                if (cancelled) return;
                // Pass 1 — SkeletonUtils.retargetClip (rest pose 보정, 정확)
                try {
                  retargeted = await retargetWithSkeletonUtils(src.root, src.clip, c.bones);
                } catch (e1) {
                  console.warn(`[humanoid] ${slot} SkeletonUtils 실패 — 단순 본 이름 매핑 fallback`, e1);
                  // Pass 2 — 단순 본 이름 매핑 (rest pose 보정 X, 자세 어긋날 수 있지만 T-pose 보단 나음)
                  const normalized = normalizeClipToHumanoidNames(src.clip);
                  retargeted = retargetClipToHumanoid(normalized, c.bones);
                }
              }
              if (retargeted && retargeted.tracks.length > 0) {
                retargeted.name = slot;
                // Crouch/prone grounding 은 useFrame 에서 per-frame 처리 (static depth 측정 불필요).
                clipMap.set(slot as AnimSlot, retargeted);
              } else {
                console.warn(`[humanoid] ${slot} retarget 결과 비어있음 — skip`);
              }
            } catch (e) {
              console.warn(`[humanoid] ${slot} 클립 로드 실패`, e);
            }
          }));
          if (cancelled) return;
          if (clipMap.size > 0) {
            // setClips 의 내부 retarget 우회 — 이미 retargeted 클립 전달.
            // mixer 에 직접 등록.
            c.mixer.stopAllAction();
            c.actions.clear();
            for (const [slot, clip] of clipMap) {
              const action = c.mixer.clipAction(clip);
              action.loop = THREE.LoopRepeat;
              action.enabled = true;
              c.actions.set(slot, action);
            }
            // idle 등록되어 있으면 idle 재생, 아니면 첫 등록된 슬롯이라도 재생 (T-pose 방지)
            const firstSlot = clipMap.has('idle') ? 'idle' : clipMap.keys().next().value;
            if (firstSlot) c.setSlot(firstSlot);
            console.log(`[humanoid] 슬롯 ${clipMap.size}개 등록: ${[...clipMap.keys()].join(', ')} → 시작: ${firstSlot}`);
          }
        }
        // userScale 은 group 에 적용 (scene 누적 변경 X)
        setChar(c);
        try { onLoaded?.(c); } catch { /* noop */ }
      } catch (e) {
        console.warn('[humanoid] 캐릭터 로드 실패', e);
      }
    })();
    return () => {
      cancelled = true;
      // 인스턴스 전용 캐릭터 → 언마운트/교체 시 GPU 자원 정리 (캐시 제거로 누수 방지)
      if (local) disposeCharacter(local);
    };
  }, [url, manualBoneMap, clipUrls, targetHeight, userScale]);

  // group 에 scene 부착
  useEffect(() => {
    if (!char || !groupRef.current) return;
    // 이미 부착되어 있으면 skip
    if (char.scene.parent === groupRef.current) return;
    groupRef.current.add(char.scene);
    // 셰이더 비동기 컴파일 — 끝나기 전엔 mesh 숨김 (LoadingEffect 가 그 자리 차지).
    // KHR_parallel_shader_compile 지원되면 백그라운드 컴파일 → frame 안 멈춤.
    // 미지원이어도 동기 컴파일 한 번 끝내고 visible → "갑자기 멈춤" 대신 LoadingEffect 가 자연스럽게 교체됨.
    // Progressive mesh reveal — char.scene 은 visible, 안의 mesh 들은 invisible 로 시작.
    // 각 mesh 의 첫 frame GPU 비용 (shader instance, texture upload, skinning init) 을
    // 시차 표시로 분산. 한 mesh = 한 frame 의 작은 hitch (인지 어려움).
    const progressiveMeshes: THREE.Object3D[] = [];
    char.scene.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) {
        m.visible = false;
        progressiveMeshes.push(m);
      }
    });
    char.scene.visible = true;
    let compileCancelled = false;
    (async () => {
      try {
        // ⚠️ 3번째 인자(targetScene=실제 씬)를 넘겨야 조명/그림자/안개 컨텍스트 포함해 컴파일됨.
        // 안 넘기면 char.scene(조명 없음) 기준으로 굽고 → 진짜 씬 렌더 시 재컴파일(입장 초반 큰 hitch).
        const glAny = gl as unknown as { compileAsync?: (obj: THREE.Object3D, cam: THREE.Camera, target?: THREE.Object3D) => Promise<unknown> };
        if (typeof glAny.compileAsync === 'function') {
          await glAny.compileAsync(char.scene, camera, scene);
        } else {
          gl.compile(char.scene, camera, scene);
        }
      } catch { /* noop */ }
      if (compileCancelled) return;
      setCompileReady(true);
      // Progressive reveal — 매 frame 2 mesh. 20 mesh 캐릭터 약 160ms 완료.
      let idx = 0;
      const PER_FRAME = 2;
      const revealNext = () => {
        if (compileCancelled) return;
        for (let n = 0; n < PER_FRAME && idx < progressiveMeshes.length; n++) {
          progressiveMeshes[idx].visible = true;
          idx++;
        }
        if (idx < progressiveMeshes.length) requestAnimationFrame(revealNext);
      };
      requestAnimationFrame(revealNext);
    })();
    // castShadow 초기 설정 — 거리 기반 토글이 매 frame 동기화하므로 여기는 base 값만
    shadowOnRef.current = castShadow;
    char.scene.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) m.castShadow = castShadow;
    });
    // 진단 — 마운트 직후 발 vertex 의 world y 출력
    setTimeout(() => {
      try {
        groupRef.current?.updateMatrixWorld(true);
        const v = new THREE.Vector3();
        let minY = Infinity;
        char.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!(m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh)) return;
          const pos = m.geometry?.attributes?.position;
          if (!pos) return;
          m.updateMatrixWorld(true);
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos as THREE.BufferAttribute, i);
            v.applyMatrix4(m.matrixWorld);
            if (v.y < minY) minY = v.y;
          }
        });
        const groupW = groupRef.current!.getWorldPosition(new THREE.Vector3());
        const sceneW = char.scene.getWorldPosition(new THREE.Vector3());
        console.log('[mount]', {
          groupWorldY: groupW.y.toFixed(3),
          sceneWorldY: sceneW.y.toFixed(3),
          actualFootWorldY: isFinite(minY) ? minY.toFixed(3) : 'none',
        });
      } catch { /* noop */ }
    }, 100);
    return () => {
      // 셰이더 컴파일 in-flight 중에 unmount 되면 setState 무시
      compileCancelled = true;
      // scene 을 group 에서 분리 (실제 GPU dispose 는 로드 effect cleanup 의 disposeCharacter 가 담당)
      if (char.scene.parent) char.scene.parent.remove(char.scene);
    };
  }, [char, castShadow, gl, camera, scene]);

  // 머리 숨김 (1인칭)
  useEffect(() => {
    if (!char) return;
    char.setHeadVisible(!hideHead);
  }, [char, hideHead]);

  // 카메라 시선 추적
  useEffect(() => {
    if (!char) return;
    char.setLookAtTarget(enableLookAt ? camera : null);
  }, [char, enableLookAt, camera]);

  // Foot IK — enableFootIK=true 일 때만 솔버 생성. char.scene 전달 → raycast self exclusion.
  useEffect(() => {
    if (!char || !enableFootIK) { footIKRef.current = null; return; }
    footIKRef.current = createHumanoidFootIK(char.bones, char.scene);
    return () => { footIKRef.current = null; };
  }, [char, enableFootIK]);

  // Hand IK — handTargetRef 제공 시 솔버 생성 (등반 grip 등 스크립트 제어).
  useEffect(() => {
    if (!char || !handTargetRef) { handIKRef.current = null; return; }
    handIKRef.current = createHumanoidHandIK(char.bones);
    return () => { handIKRef.current = null; };
  }, [char, handTargetRef]);

  // analyser 매 frame buffer (성능)
  const lipSyncBuf = useMemo(() => new Uint8Array(32), []);
  // on-demand URL emote 로딩 추적 — 같은 URL 중복 로드 방지. (캐릭터당 1 set)
  const emoteLoadingRef = useRef<Set<string>>(new Set());

  useFrame((_, dt) => {
    if (!char) return;
    // 1) 슬롯 전환 — animStateRef 폴링.
    //    legacy 5슬롯 (walk/run/jump) 들어오면 새 슬롯명으로 변환.
    //    누락 슬롯은 setSlot 내부 fallback chain 으로 처리.
    const rawState = animStateRef.current ?? 'idle';
    if (isEmoteUrl(rawState)) {
      // 커스텀 애니메이션 에셋 URL — 이 캐릭터에 아직 등록 안 됐으면 on-demand 로드+retarget+캐싱.
      // 로드 완료 전엔 현재 슬롯 유지. 로드되면 char.actions 에 URL 키로 등록 → setSlot(url) 재생.
      // '#once' 접미사 = 1회 재생 후 자동 idle (world.playEmote(url,{loop:false}) 인코딩).
      // 없으면 무한 루프. fetch 는 접미사 뗀 순수 URL 로.
      const once = rawState.endsWith('#once');
      const fetchUrl = once ? rawState.slice(0, -'#once'.length) : rawState;
      if (char.actions.has(rawState as AnimSlot)) {
        if (char.currentSlot !== rawState) char.setSlot(rawState as AnimSlot);
      } else if (!emoteLoadingRef.current.has(rawState)) {
        emoteLoadingRef.current.add(rawState);
        retargetEmoteClipForChar(fetchUrl, char).then((clip) => {
          if (!clip) return;
          clip.name = rawState;
          const action = char.mixer.clipAction(clip);
          action.loop = once ? THREE.LoopOnce : THREE.LoopRepeat;
          action.clampWhenFinished = once;
          action.enabled = true;
          char.actions.set(rawState as AnimSlot, action);
          if (once) {
            // 1회 재생 끝 → '__done__' 신호 (Player 가 emote 해제 → idle). 본인/원격 공통.
            const onFinished = (e: { action: THREE.AnimationAction }) => {
              if (e.action !== action) return;
              char.mixer.removeEventListener('finished', onFinished as never);
              if (animStateRef.current === rawState) animStateRef.current = '__done__';
            };
            char.mixer.addEventListener('finished', onFinished as never);
          }
        }).catch(() => {});
      }
    } else {
      // legacy 5슬롯 (walk/run/jump) 들어오면 새 슬롯명으로 변환. 누락 슬롯은 setSlot 내부 fallback.
      const state = (ANIM_SLOT_LEGACY_ALIAS[rawState] ?? rawState) as AnimSlot;
      if (state && state !== char.currentSlot) {
        char.setSlot(state);
      }
    }
    // 2) lipSync — 진폭 평균 → 입 모양
    if (getAnalyser) {
      const a = getAnalyser();
      if (a) {
        a.getByteFrequencyData(lipSyncBuf);
        let sum = 0;
        for (let i = 0; i < lipSyncBuf.length; i++) sum += lipSyncBuf[i];
        const avg = sum / lipSyncBuf.length / 255;  // 0~1
        char.lipSync.set(avg);
      }
    }
    // 2.5) 비 젖음 — 씬에 비 내리면(envFx.rainWet) 캐릭터 머티리얼을 젖은 느낌으로.
    //      젖는 건 빠르게(~2.5s)·마르는 건 천천히(~9s). 변화가 클 때만 traverse(정착 시 비용 0).
    {
      const cur = wetRef.current;
      const target = envFx.rainWet;
      const tau = target > cur ? 2.5 : 9;
      wetRef.current = cur + (target - cur) * (1 - Math.exp(-Math.min(dt, 0.1) / tau));
      if (Math.abs(wetRef.current - appliedWetRef.current) > 0.01) {
        appliedWetRef.current = wetRef.current;
        const w = wetRef.current;
        char.scene.traverse((o) => {
          const mm = o as THREE.Mesh;
          if (!mm.isMesh) return;
          const mats = Array.isArray(mm.material) ? mm.material : (mm.material ? [mm.material] : []);
          for (const mat of mats) if (mat) applyCharWet(mat, w);
        });
      }
    }
    // 3) mixer + vrm.update + lookAt + 그림자 — 카메라 거리별 LOD (공격적)
    //    < 15m: 매 frame 풀 update + 그림자 on (가까이서 볼 때만 그림자 비용 지불)
    //    < 35m: 2 frame skip (30Hz) + 그림자 off
    //    < 70m: 4 frame skip (15Hz)
    //    <120m: 8 frame skip (~7Hz) — 멀리서 어색하지 않을 정도
    //    >120m: mesh visible=false (shadow pass 도 skip)
    //    그림자 토글: shadow map pass 가 main render 의 50-80% → 가까울 때만 켜면 매우 큰 절감.
    if (groupRef.current) {
      const cam = camera.position;
      const meshPos = groupRef.current.getWorldPosition(_tmpVec);
      const distSq = cam.distanceToSquared(meshPos);
      const visible = distSq < 120 * 120;
      if (groupRef.current.visible !== visible) groupRef.current.visible = visible;
      if (visible) {
        // 거리 기반 lookAt 토글 — 10m 안만 head bone 카메라 향하기.
        // 카메라 회전 시 head matrix 매 frame 재계산. 멀리는 시선 추적 안 보여도 무방.
        const wantLookAt = enableLookAt && distSq < 10 * 10;
        if (wantLookAt !== lookAtOnRef.current) {
          lookAtOnRef.current = wantLookAt;
          char.setLookAtTarget(wantLookAt ? camera : null);
        }
        // 거리 기반 castShadow 토글 — 40m 이내 그림자. 멀리도 어느 정도 보임.
        const wantShadow = castShadow && distSq < 40 * 40;
        if (wantShadow !== shadowOnRef.current) {
          shadowOnRef.current = wantShadow;
          char.scene.traverse((c) => {
            const m = c as THREE.Mesh;
            if (m.isMesh) m.castShadow = wantShadow;
          });
        }
        const skipFrames = distSq < 10 * 10 ? 1 : distSq < 30 * 30 ? 2 : distSq < 60 * 60 ? 4 : 8;
        lodFrameCounterRef.current = (lodFrameCounterRef.current + 1) % skipFrames;
        if (lodFrameCounterRef.current === 0) {
          char.update(dt * skipFrames);
        }
      }
    } else {
      char.update(dt);
    }
    // 3.5) 1인칭에서 머리만 안 보이게 — VRM 의 firstPerson layer 시스템이 자동 처리.
    //      camera.layers 토글은 WorldCanvas 가 cameraMode 따라 수행 (몸/손은 보임, 머리만 cull).
    //      여기선 추가 처리 없음 — Repo/Dying Light/Cyberpunk 식 1인칭 몸 표시.
    // 4) Crouch grounding — per-frame 발 lift 측정해서 scene.y 즉시 보정.
    //    Static offset 은 평균 lift 만 잡아서 frame 별 변화로 발이 위아래 흔들림.
    //    매 frame "발 본의 scene-local Y - bind 시 발 본의 scene-local Y" = lift 측정,
    //    scene.position.y = sceneBindY - lift 로 set → 발 world Y 가 bind 값으로 고정.
    //    crouch 의 미세 breathing 도 발은 정지, 몸만 호흡.
    if (char !== lastCharForCrouchRef.current) {
      lastCharForCrouchRef.current = char;
    }
    const slotName = char.currentSlot || '';
    const isGroundingSlot = slotName.startsWith('crouch') || slotName.startsWith('prone') || slotName.startsWith('sit') || slotName.startsWith('lay') || slotName.startsWith('sleep');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ud = char.scene.userData as any;
    const sceneBindY = ud.__sceneBindY as number | undefined;
    const bindFootLocal = ud.__bindFootInSceneLocalY as number | undefined;
    if (isGroundingSlot && sceneBindY !== undefined && bindFootLocal !== undefined && char.bones.leftFoot && char.bones.rightFoot) {
      const tmp = new THREE.Vector3();
      const sceneW = char.scene.getWorldPosition(tmp).y;
      const lY = char.bones.leftFoot.getWorldPosition(new THREE.Vector3()).y;
      const rY = char.bones.rightFoot.getWorldPosition(new THREE.Vector3()).y;
      const currentFootLocal = Math.min(lY, rY) - sceneW;
      const lift = currentFootLocal - bindFootLocal;
      char.scene.position.y = sceneBindY - lift;
    } else if (sceneBindY !== undefined && char.scene.position.y !== sceneBindY) {
      // 비-grounding 슬롯: scene.y 를 bind 로 복원
      char.scene.position.y = sceneBindY;
    }
    // 5) Foot IK (옵션) — Two-Bone IK 솔버. enableFootIK=true 일 때만.
    //    Auto grounding 보정 (1회/매-frame 둘 다) 시도했으나 캐릭터/애니마다 발 lift 패턴이
    //    너무 달라 over-correct sink 발생. bind pose normalization (mount 시 box2.min.y) +
    //    hips position strip 만 신뢰. 떠/박힘은 운영자 페이지의 offsetY 슬라이더로 캐릭터별 조정.
    if (footIKRef.current?.enabled) {
      try { footIKRef.current.update(scene); } catch { /* noop — IK 실패해도 캐릭터는 계속 */ }
    }
    // 6) Hand IK — 스크립트가 setHandTarget 으로 넣은 손 타깃으로 팔 굽힘 (등반 grip). 애니 포즈 위에 덮어씀.
    const hik = handIKRef.current;
    if (hik?.enabled && handTargetRef) {
      const t = handTargetRef.current;
      hik.leftTarget  = t.left  ? handTmpL.current.set(t.left[0],  t.left[1],  t.left[2])  : null;
      hik.rightTarget = t.right ? handTmpR.current.set(t.right[0], t.right[1], t.right[2]) : null;
      hik.leftNormal  = t.leftN  ? handNmpL.current.set(t.leftN[0],  t.leftN[1],  t.leftN[2])  : null;
      hik.rightNormal = t.rightN ? handNmpR.current.set(t.rightN[0], t.rightN[1], t.rightN[2]) : null;
      if (hik.leftTarget || hik.rightTarget) { try { hik.update(); } catch { /* noop */ } }
    }
  });

  // group 에 user 의 scale + offsetY 적용 (char.scene 은 base 정규화만, 누적 변경 X)
  // char 가 로드되기 전에는 LoadingEffect 표시 → char 도착 즉시 React 가 unmount.
  // char.scene 은 별도 useEffect 에서 group.add() 로 직접 부착되므로 JSX children 과 공존 OK.
  return (
    <group ref={groupRef} position={[0, offsetY, 0]} scale={userScale}>
      {!compileReady && <LoadingEffect targetHeight={targetHeight} />}
      {char && <FootstepDust groupRef={groupRef} animStateRef={animStateRef} userScale={userScale} />}
      {char && <BreathFog groupRef={groupRef} userScale={userScale} />}
    </group>
  );
}
