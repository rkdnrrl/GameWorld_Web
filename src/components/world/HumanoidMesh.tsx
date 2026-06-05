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

  const { camera, scene } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const [char, setChar] = useState<HumanoidCharacter | null>(null);
  const footIKRef = useRef<HumanoidFootIK | null>(null);
  /** 발 본 ↔ parent 의 bind pose offset (모델별 sole 두께 자동). 첫 frame 에 캡처. */
  const footBaselineRef = useRef<number | null>(null);

  // 모델 로드 + 클립 로드 + 슬롯 등록 (한 번)
  useEffect(() => {
    let cancelled = false;
    let local: HumanoidCharacter | null = null;
    (async () => {
      try {
        const c = await getCharacter(url, manualBoneMap);
        if (cancelled) return;
        local = c;
        // ── 클립 로드 ── source root + raw clip → SkeletonUtils.retargetClip 으로 캐릭터별
        // rest-pose 보정 retarget (본 좌표축 차이 자동 보정).
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
          await Promise.all(Object.entries(effectiveClipUrls).map(async ([slot, clipUrl]) => {
            if (!clipUrl) return;
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
        // 모델 크기 정규화 — 캐릭터당 1회만 (캐시 char 가 여러 마운트에서 공유될 때 누적 변경 방지).
        // 발 본 위치 기준 — mesh box.min.y 가 머리카락/옷 등 떨어진 vertex 일 수 있어 부정확.
        if (!c.scene.userData.__normalized) {
          c.scene.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(c.scene);
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          if (maxDim > 0) {
            const baseScale = targetHeight / maxDim;
            c.scene.scale.setScalar(baseScale);
            c.scene.updateMatrixWorld(true);
            // mesh 의 vertex 를 world 좌표로 직접 traverse — 가장 정확.
            // setFromObject 는 cached boundingBox + skinning 영향으로 부정확할 수 있음.
            const meshBox = new THREE.Box3();
            let hasMesh = false;
            const v = new THREE.Vector3();
            c.scene.traverse((o) => {
              const m = o as THREE.Mesh;
              if (!(m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh)) return;
              const geo = m.geometry;
              const pos = geo?.attributes?.position;
              if (!pos) return;
              m.updateMatrixWorld(true);
              for (let i = 0; i < pos.count; i++) {
                v.fromBufferAttribute(pos as THREE.BufferAttribute, i);
                v.applyMatrix4(m.matrixWorld);
                meshBox.expandByPoint(v);
              }
              hasMesh = true;
            });
            const box2 = hasMesh ? meshBox : new THREE.Box3().setFromObject(c.scene);
            console.log('[normalize]', { isVrm: !!c.vrm, hasMesh, boxMinY: box2.min.y.toFixed(3), boxMaxY: box2.max.y.toFixed(3) });
            // VRM/FBX 통일 — 실제 mesh 최저점(boots/feet 의 sole) 기준. 발 본 추정은
            // 부츠가 길거나 platform shoes 인 경우 부정확 (캐릭터 위로 뜸).
            const baseY: number = box2.min.y;
            c.scene.position.y -= baseY;
            c.scene.userData.__baseScale = baseScale;
            console.log('[norm]', {
              isVrm: !!c.vrm,
              boxMinY: box2.min.y.toFixed(3),
              boxMaxY: box2.max.y.toFixed(3),
              baseY: baseY.toFixed(3),
              scenePosY: c.scene.position.y.toFixed(3),
              baseScale: baseScale.toFixed(3),
            });
          }
          c.scene.userData.__normalized = true;
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
    // castShadow 토글
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
      // unmount 시 scene 떼기 — 다른 인스턴스가 같은 캐시 char 받으면 재부착
      if (char.scene.parent) char.scene.parent.remove(char.scene);
    };
  }, [char, castShadow]);

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
    // 3) mixer + vrm.update + lookAt
    char.update(dt);
    // 4) Foot grounding — 발 본 ↔ parent offset 을 bind pose baseline 으로 잡고 그 값에서 drift 만 보정.
    //    Baseline = 모델별 sole 두께 (foot bone 는 ankle, sole 은 그보다 아래) 자동 처리.
    //    smoothing 10% — 달리기 airborne 의 짧은 lift 도 살짝 보정되지만 진동은 미세 (0.5cm 이하).
    if (char.scene.parent) {
      const feet: THREE.Object3D[] = [];
      if (char.bones.leftFoot) feet.push(char.bones.leftFoot);
      if (char.bones.rightFoot) feet.push(char.bones.rightFoot);
      if (char.bones.leftToes) feet.push(char.bones.leftToes);
      if (char.bones.rightToes) feet.push(char.bones.rightToes);
      if (feet.length) {
        const wp = new THREE.Vector3();
        const ws = new THREE.Vector3();
        let lowestY = Infinity;
        for (const b of feet) {
          b.getWorldPosition(wp);
          if (wp.y < lowestY) lowestY = wp.y;
        }
        const parent = char.scene.parent;
        parent.getWorldPosition(wp);
        parent.getWorldScale(ws);
        const offsetFromParent = lowestY - wp.y;
        // 첫 frame — 모델 고유 offset 캡처 (sole 두께 반영)
        if (footBaselineRef.current === null) {
          footBaselineRef.current = offsetFromParent;
        }
        const drift = offsetFromParent - footBaselineRef.current;
        const parentScaleY = ws.y || 1;
        if (Math.abs(drift) > 0.005) {
          char.scene.position.y -= (drift * 0.1) / parentScaleY;
        }
      }
    }
    // 5) Foot IK (옵션) — Two-Bone IK 솔버. enableFootIK=true 일 때만.
    if (footIKRef.current?.enabled) {
      try { footIKRef.current.update(scene); } catch { /* noop — IK 실패해도 캐릭터는 계속 */ }
    }
  });

  // group 에 user 의 scale + offsetY 적용 (char.scene 은 base 정규화만, 누적 변경 X)
  return <group ref={groupRef} position={[0, offsetY, 0]} scale={userScale} />;
}
