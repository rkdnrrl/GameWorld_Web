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
import { loadVRMA, vrmaToClip } from '@/lib/character/vrmAnimation';

/** url 의 확장자가 .vrma 인지. query/hash 무시. */
function isVrmaUrl(url: string): boolean {
  const ext = (url.split('?')[0].split('#')[0].split('.').pop() || '').toLowerCase();
  return ext === 'vrma';
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
  /** Foot IK 활성 (default true) — 발이 ground 에 닿게 보정. */
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
    hideHead = false, castShadow = true, enableLookAt = true, enableFootIK = true,
    targetHeight = 1.8, offsetY = 0, userScale = 1, onLoaded,
  } = props;

  const { camera, scene } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const [char, setChar] = useState<HumanoidCharacter | null>(null);
  const footIKRef = useRef<HumanoidFootIK | null>(null);

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
              if (isVrmaUrl(clipUrl) && c.vrm) {
                try {
                  const vrma = await loadVRMA(clipUrl);
                  retargeted = vrmaToClip(vrma, c.vrm, slot);
                  // 디버그 — 어깨/팔/다리 track 존재 여부 + 본 이름
                  if (retargeted && retargeted.tracks.length > 0 && slot === 'idle') {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const v = c.vrm as any;
                    const check = (h: string) => {
                      const norm = v?.humanoid?.getNormalizedBoneNode?.(h);
                      const raw = v?.humanoid?.getRawBoneNode?.(h);
                      const trackName = norm?.name + '.quaternion';
                      const hasTrack = retargeted!.tracks.some((t) => t.name === trackName);
                      return `${h}: norm=${norm?.name || '✗'} raw=${raw?.name || '✗'} track=${hasTrack ? '✓' : '✗'}`;
                    };
                    console.log('[humanoid] idle 본 진단:\n  ' + [
                      check('hips'), check('spine'),
                      check('leftShoulder'), check('leftUpperArm'),
                      check('leftLowerArm'), check('leftHand'),
                      check('rightShoulder'), check('rightUpperArm'),
                    ].join('\n  '));
                    console.log(`[humanoid] idle tracks 전체 (${retargeted.tracks.length}):`, retargeted.tracks.map(t => t.name));
                  }
                } catch (eVrma) {
                  console.warn(`[humanoid] ${slot} VRMA fast-path 실패 — generic retarget 시도`, eVrma);
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
        // 모델 크기 정규화 — 캐릭터당 1회만 (캐시 char 가 여러 마운트에서 공유될 때 누적 변경 방지)
        if (!c.scene.userData.__normalized) {
          c.scene.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(c.scene);
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          if (maxDim > 0) {
            const baseScale = targetHeight / maxDim;
            c.scene.scale.setScalar(baseScale);
            c.scene.updateMatrixWorld(true);
            const box2 = new THREE.Box3().setFromObject(c.scene);
            c.scene.position.y -= box2.min.y;
            c.scene.userData.__baseScale = baseScale;
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

  // Foot IK — 캐릭터 본 로드 후 IK 솔버 생성. enableFootIK 로 토글.
  useEffect(() => {
    if (!char) { footIKRef.current = null; return; }
    footIKRef.current = createHumanoidFootIK(char.bones);
    return () => { footIKRef.current = null; };
  }, [char]);
  useEffect(() => {
    if (footIKRef.current) footIKRef.current.enabled = enableFootIK;
  }, [enableFootIK]);

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
    // 4) Foot IK — animation 적용 후 발이 ground 에 닿게 보정 (떠/박힘 방지).
    if (footIKRef.current?.enabled) {
      try { footIKRef.current.update(scene); } catch { /* noop — IK 실패해도 캐릭터는 계속 */ }
    }
  });

  // group 에 user 의 scale + offsetY 적용 (char.scene 은 base 정규화만, 누적 변경 X)
  return <group ref={groupRef} position={[0, offsetY, 0]} scale={userScale} />;
}
