'use client';
/**
 * 포맷 무관 humanoid 캐릭터 mesh — VRChat 식.
 *
 * 입력: 모델 url + 마스터 클립 url map (idle/walk/run/jump/fall) + animStateRef + lipSync analyser
 * 동작: createHumanoidCharacter 로 1줄 로드 → mixer + lipSync + lookAt 자동
 *
 * 기존 CharacterMesh 의 거대한 mapping/oneshot/trim 로직 폐기 — 5슬롯 단순화.
 * 운영자가 humanoid-normalized 클립 (VRMA 또는 정규화된 FBX) 1번 등록 → 모든 캐릭터 호환.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createHumanoidCharacter, type HumanoidCharacter } from '@/lib/character/humanoidCharacter';
import { loadHumanoidClip } from '@/lib/character/humanoidAnimation';
import type { AnimSlot } from '@/lib/character/humanoid';

const API = (typeof window !== 'undefined' && (window as { __ALP_API__?: string }).__ALP_API__) || 'https://airliveplay.com';

/** 운영자 등록 슬롯 클립 url — 모든 캐릭터 공용. 모듈 캐시 (첫 호출에 fetch, 이후 캐시). */
let clipUrlsPromise: Promise<Partial<Record<AnimSlot, string>>> | null = null;
function getOperatorClipUrls(): Promise<Partial<Record<AnimSlot, string>>> {
  if (!clipUrlsPromise) {
    clipUrlsPromise = fetch(`${API}/api/character-animations`)
      .then((r) => r.ok ? r.json() : { slots: {} })
      .then((d: { slots?: Record<string, { modelUrl?: string; enabled?: boolean }> }) => {
        const slots = d.slots || {};
        const out: Partial<Record<AnimSlot, string>> = {};
        for (const slot of ['idle','walk','run','jump','fall'] as AnimSlot[]) {
          const s = slots[slot];
          if (s?.modelUrl && s.enabled !== false) out[slot] = s.modelUrl;
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
    hideHead = false, castShadow = true, enableLookAt = true,
    targetHeight = 1.8, offsetY = 0, userScale = 1, onLoaded,
  } = props;

  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const [char, setChar] = useState<HumanoidCharacter | null>(null);

  // 모델 로드 + 클립 로드 + 슬롯 등록 (한 번)
  useEffect(() => {
    let cancelled = false;
    let local: HumanoidCharacter | null = null;
    (async () => {
      try {
        const c = await getCharacter(url, manualBoneMap);
        if (cancelled) return;
        local = c;
        // ── 클립 로드 ── prop clipUrls 우선, 없으면 운영자 등록 글로벌. 포맷 무관 (.fbx/.glb/.vrma).
        // loadHumanoidClip 이 humanoid 표준 본 이름으로 정규화 → c.setClips 가 캐릭터별 retarget.
        const effectiveClipUrls = clipUrls && Object.keys(clipUrls).length
          ? clipUrls
          : await getOperatorClipUrls();
        if (cancelled) return;
        if (effectiveClipUrls) {
          const clipMap = new Map<AnimSlot, THREE.AnimationClip>();
          await Promise.all(Object.entries(effectiveClipUrls).map(async ([slot, clipUrl]) => {
            if (!clipUrl) return;
            try {
              const clip = await loadHumanoidClip(clipUrl, slot);
              clipMap.set(slot as AnimSlot, clip);
            } catch (e) {
              console.warn(`[humanoid] ${slot} 클립 로드 실패`, e);
            }
          }));
          if (cancelled) return;
          if (clipMap.size > 0) {
            c.setClips(clipMap);
            c.setSlot('idle');
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

  // analyser 매 frame buffer (성능)
  const lipSyncBuf = useMemo(() => new Uint8Array(32), []);

  useFrame((_, dt) => {
    if (!char) return;
    // 1) 슬롯 전환 — animStateRef 폴링
    const state = (animStateRef.current ?? 'idle') as AnimSlot;
    if (state && state !== char.currentSlot) {
      // 슬롯이 등록되어 있을 때만 (clipUrls 안 준 슬롯은 skip → idle 유지)
      if (char.actions.has(state as AnimSlot)) char.setSlot(state as AnimSlot);
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
  });

  // group 에 user 의 scale + offsetY 적용 (char.scene 은 base 정규화만, 누적 변경 X)
  return <group ref={groupRef} position={[0, offsetY, 0]} scale={userScale} />;
}
