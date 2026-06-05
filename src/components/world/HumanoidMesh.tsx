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
}

/** 단일 캐시 — 같은 url 요청 중복 로드 방지. dispose 는 페이지 unmount 시 안 함 (캐시) */
const characterCache = new Map<string, Promise<HumanoidCharacter>>();
async function getCharacter(url: string, manualBoneMap?: Partial<Record<string, string>>): Promise<HumanoidCharacter> {
  const key = `${url}::${JSON.stringify(manualBoneMap ?? {})}`;
  const cached = characterCache.get(key);
  if (cached) return cached;
  const p = createHumanoidCharacter(url, { manualBoneMap: manualBoneMap as Partial<Record<never, string>> });
  characterCache.set(key, p);
  return p;
}

export function HumanoidMesh(props: HumanoidMeshProps) {
  const {
    url, manualBoneMap, clipUrls, animStateRef, getAnalyser,
    hideHead = false, castShadow = true, enableLookAt = true, enableFootIK = false,
    targetHeight = 1.8, offsetY = 0, userScale = 1, onLoaded,
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
  /** 캐릭터 인스턴스 추적 — 바뀌면 reset. */
  const lastCharForCrouchRef = useRef<HumanoidCharacter | null>(null);
  /** LOD frame counter — 거리별 mixer.update skip 용. */
  const lodFrameCounterRef = useRef(0);
  /** LOD 거리 측정 재사용 Vector3. */
  const _tmpVec = useMemo(() => new THREE.Vector3(), []);
  /** 현재 적용된 그림자 캐스트 상태 — 거리 구간 변경 시만 traverse 호출 (매 frame traverse 방지). */
  const shadowOnRef = useRef<boolean>(true);

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
        const effectiveClipUrls = clipUrls && Object.keys(clipUrls).length
          ? clipUrls
          : await getOperatorClipUrls();
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
      // dispose 는 안 함 — 캐시 유지 (같은 url 재진입 빠름)
      void local;
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
    char.scene.visible = false;
    let compileCancelled = false;
    (async () => {
      try {
        // R3F 의 gl 은 THREE.WebGLRenderer — r152+ 에 compileAsync 존재
        const glAny = gl as unknown as { compileAsync?: (obj: THREE.Object3D, cam: THREE.Camera) => Promise<unknown> };
        if (typeof glAny.compileAsync === 'function') {
          await glAny.compileAsync(char.scene, camera);
        } else {
          gl.compile(char.scene, camera);
        }
      } catch { /* 실패해도 첫 frame 에 동기 컴파일됨 — 그대로 진행 */ }
      if (compileCancelled) return;
      char.scene.visible = true;
      setCompileReady(true);
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
      // unmount 시 scene 떼기 — 다른 인스턴스가 같은 캐시 char 받으면 재부착
      if (char.scene.parent) char.scene.parent.remove(char.scene);
    };
  }, [char, castShadow, gl, camera]);

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

  // analyser 매 frame buffer (성능)
  const lipSyncBuf = useMemo(() => new Uint8Array(32), []);

  useFrame((_, dt) => {
    if (!char) return;
    // 1) 슬롯 전환 — animStateRef 폴링.
    //    legacy 5슬롯 (walk/run/jump) 들어오면 새 슬롯명으로 변환.
    //    누락 슬롯은 setSlot 내부 fallback chain 으로 처리.
    const rawState = animStateRef.current ?? 'idle';
    const state = (ANIM_SLOT_LEGACY_ALIAS[rawState] ?? rawState) as AnimSlot;
    if (state && state !== char.currentSlot) {
      char.setSlot(state);
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
      // 본인 1인칭(hideHead=true) — 캐릭터 안 보이는데 char.update (vrm spring/expression/mixer) 매 frame
      // 도는 게 화려한 VRM 일수록 큰 비용. 본인은 자기 안 보니 skip → 큰 fps 절감.
      // (다른 사람이 보는 본인 캐릭터는 별도 RemotePlayer 인스턴스라 영향 없음.)
      if (hideHead) {
        // shadow 도 본인 1인칭에선 자기 그림자 안 보이니 off
        if (shadowOnRef.current) {
          shadowOnRef.current = false;
          char.scene.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) m.castShadow = false; });
        }
      } else if (visible) {
        // 거리 기반 castShadow 토글 — 15m 이내만 그림자. 그 이상은 무시 안전.
        const wantShadow = castShadow && distSq < 15 * 15;
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
          char.update(dt * skipFrames);  // 누락 frame 만큼 dt 보정
        }
      }
    } else if (!hideHead) {
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
  });

  // group 에 user 의 scale + offsetY 적용 (char.scene 은 base 정규화만, 누적 변경 X)
  // char 가 로드되기 전에는 LoadingEffect 표시 → char 도착 즉시 React 가 unmount.
  // char.scene 은 별도 useEffect 에서 group.add() 로 직접 부착되므로 JSX children 과 공존 OK.
  return (
    <group ref={groupRef} position={[0, offsetY, 0]} scale={userScale}>
      {!compileReady && <LoadingEffect targetHeight={targetHeight} />}
    </group>
  );
}
