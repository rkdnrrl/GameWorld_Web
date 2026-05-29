'use client';
import React, { Suspense, useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Sky, Text, Environment } from '@react-three/drei';
import { Physics, RigidBody, CapsuleCollider, useRapier } from '@react-three/rapier';

/** Rapier 강체 — 우리가 호출하는 메서드만 추린 미니 인터페이스 (버전 무관) */
interface RapierBodyApi {
  translation(): { x: number; y: number; z: number };
  rotation(): { x: number; y: number; z: number; w: number };
  setTranslation(v: { x: number; y: number; z: number }, wakeUp: boolean): void;
  setRotation(q: { x: number; y: number; z: number; w: number }, wakeUp: boolean): void;
  applyImpulse(v: { x: number; y: number; z: number }, wakeUp: boolean): void;
  linvel(): { x: number; y: number; z: number };
  setLinvel(v: { x: number; y: number; z: number }, wakeUp: boolean): void;
  setAngvel(v: { x: number; y: number; z: number }, wakeUp: boolean): void;
}
import * as THREE from 'three';
import type { ChatBubble, RemotePlayer, PlayerPose } from '@/lib/world/useGameSocket';
import type { GraphicsSettings } from '@/lib/world/graphicsSettings';
import { DEFAULT_SETTINGS } from '@/lib/world/graphicsSettings';
import { retargetClipsToModel } from '@/lib/character/mixamoRig';
import { loadPlatformAnimationStateClips } from '@/lib/character/platformAnimations';

const PLAYER_CAPSULE_HALF_HEIGHT = 0.35;
const PLAYER_CAPSULE_RADIUS = 0.28;
const PLAYER_MESH_Y = -(PLAYER_CAPSULE_HALF_HEIGHT + PLAYER_CAPSULE_RADIUS);

/** 두 각도 간 짧은 방향으로 보간 (-π~π 경계 넘어가도 한바퀴 안 돔) */
function lerpAngle(current: number, target: number, t: number): number {
  const TAU = Math.PI * 2;
  let diff = ((target - current) % TAU + TAU) % TAU;
  if (diff > Math.PI) diff -= TAU;
  return current + diff * t;
}

/* ── 커스텀 3D 모델 (Suspense 없이 명령형 로드 — RigidBody 리셋 방지) ── */
/** 모델을 목표 높이(m)에 맞춰 자동 정규화 + 회전 적용 + 발 정렬
 *  rotX 를 미리 적용한 뒤 측정/align 해야 Z-up FBX (Meshy 등) 도 발이 y=0 에 옴
 */
/** 크기·회전·발 정렬(bind pose box.min.y → y=0) — 자동 클리어런스 X. 사용자가 offsetY 슬라이더로 수동 조정 */
function getRenderableBounds(obj: THREE.Object3D) {
  const worldBox = new THREE.Box3();
  const tmp = new THREE.Box3();
  let hasMesh = false;

  obj.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    if (!mesh.geometry) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    if (!mesh.geometry.boundingBox) return;
    tmp.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
    if (!hasMesh) {
      worldBox.copy(tmp);
      hasMesh = true;
    } else {
      worldBox.union(tmp);
    }
  });

  if (!hasMesh) worldBox.setFromObject(obj);
  return worldBox;
}

function autoNormalize(obj: THREE.Object3D, rotX = 0, targetHeight = 1.8) {
  // 재호출 시 누적 방지 — 매번 fresh 한 상태에서 시작
  obj.position.set(0, 0, 0);
  obj.rotation.set(rotX, 0, 0);
  obj.scale.set(1, 1, 1);
  obj.updateMatrixWorld(true);

  const box  = getRenderableBounds(obj);
  const size = box.getSize(new THREE.Vector3());
  const h    = size.y > 0 ? size.y : Math.max(size.x, size.y, size.z);
  if (h > 0) {
    obj.scale.setScalar(targetHeight / h);
    obj.updateMatrixWorld(true);
  }

  const box2 = getRenderableBounds(obj);
  obj.position.y -= box2.min.y;            // 발 -> y=0
}

/* ── 애니메이션 상태 타입 ─────────────── */
// 코어 슬롯은 물리엔진이 자동 트리거. 커스텀 슬롯(swim, skydive 등)은 게임 코드가 직접 setState.
export type AnimState = string;
export const CORE_ANIM_STATES = ['idle', 'walk', 'run', 'jump', 'fall', 'crouch', 'crouch_walk', 'prone', 'prone_move'] as const;

export interface AnimTrim { start?: number; end?: number; }

/* ── FBX 캐시 — 같은 URL 한 번만 로드 ───── */
type FBXLoaded = { obj: THREE.Object3D; anims: THREE.AnimationClip[] };
const fbxCache    = new Map<string, FBXLoaded>();
const fbxLoading  = new Map<string, Promise<FBXLoaded>>();

// 스킨 가중치 4개 초과 경고는 정상 동작이므로 묶어서 1회만 표시
let _warnPatched = false;
function patchWarnings() {
  if (_warnPatched || typeof window === 'undefined') return;
  _warnPatched = true;
  const origWarn = console.warn;
  const seen = new Set<string>();
  console.warn = (...args: unknown[]) => {
    const first = String(args[0] ?? '');
    if (first.includes('FBXLoader: Vertex has more than 4 skinning') ||
        first.includes('PCFSoftShadowMap has been deprecated')) {
      if (seen.has(first)) return;
      seen.add(first);
    }
    origWarn.apply(console, args);
  };
}

async function loadFBXCached(url: string): Promise<FBXLoaded> {
  patchWarnings();
  if (fbxCache.has(url))    return fbxCache.get(url)!;
  if (fbxLoading.has(url))  return fbxLoading.get(url)!;

  const p = new Promise<FBXLoaded>((resolve, reject) => {
    import('three/examples/jsm/loaders/FBXLoader.js').then(({ FBXLoader }) => {
      new FBXLoader().load(url, (fbx) => {
        const result: FBXLoaded = {
          obj:   fbx,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          anims: ((fbx as any).animations as THREE.AnimationClip[]) ?? [],
        };
        fbxCache.set(url, result);
        fbxLoading.delete(url);
        resolve(result);
      }, undefined, reject);
    });
  });
  fbxLoading.set(url, p);
  return p;
}

/** 스킨드 메쉬 + 본 구조 보존 복제 (THREE.clone()은 skeleton bind 깨짐) */
async function cloneFBX(source: THREE.Object3D): Promise<THREE.Object3D> {
  const mod = await import('three/examples/jsm/utils/SkeletonUtils.js');
  return mod.clone(source);
}


/** start~end 초 구간만 잘라낸 새 AnimationClip 반환 (트림 없으면 원본) */
function trimClip(source: THREE.AnimationClip, trim?: AnimTrim): THREE.AnimationClip {
  if (!trim) return source;
  const start = Math.max(0, trim.start ?? 0);
  const end   = Math.min(source.duration, trim.end ?? source.duration);
  if (start <= 0 && end >= source.duration) return source;
  if (end <= start) return source;
  const fps = 30;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const utils = (THREE as any).AnimationUtils;
  return utils.subclip(source, source.name + '_trim', Math.floor(start * fps), Math.ceil(end * fps), fps);
}

const KEYWORD_FALLBACK: Record<AnimState, string[]> = {
  idle:        ['idle', 'stand', 'tpose', 't-pose', '유휴', '대기'],
  walk:        ['walk', 'walking', '걷기', '걷다'],
  run:         ['run', 'running', 'sprint', 'jog', '달리', '뛰'],
  jump:        ['jump', 'jumping', '점프'],
  fall:        ['fall', 'falling', 'drop', '낙하'],
  crouch:      ['crouch', 'crouching', 'duck', '앉', 'squat'],
  crouch_walk: ['crouch_walk', 'crouchwalk', 'sneak', 'sneaking', '포복'],
  prone:       ['prone', 'lying', 'lie', '엎드', '눕'],
  prone_move:  ['prone_move', 'pronemove', 'crawl', 'crawling', '기어'],
};

function CustomModel({ url, userScale, rotX, offsetY = 0, animStateRef, animNames, animTrims, blockedAnimStates, animOneShot, animSlotUrls, castShadow = true, hideHead = false }: {
  url: string;
  userScale: number;
  rotX: number;
  offsetY?: number;
  animStateRef?: React.RefObject<AnimState>;
  /** 슬롯명 → FBX 클립명 (코어 슬롯 + 커스텀 슬롯 모두 포함) */
  animNames?: Record<string, string>;
  animTrims?: Record<string, AnimTrim>;
  blockedAnimStates?: Record<string, boolean>;
  /** 한번만 재생할 슬롯 목록 — 재생 완료 후 idle로 복귀 */
  animOneShot?: string[];
  /** 슬롯별 외부 FBX URL (EXT_ 접두사 클립으로 로드) */
  animSlotUrls?: Record<string, string>;
  castShadow?: boolean;
  hideHead?: boolean;
}) {
  const [obj, setObj]   = useState<THREE.Object3D | null>(null);
  const mixer           = useRef<THREE.AnimationMixer | null>(null);
  const clipByState     = useRef<Map<string, THREE.AnimationClip>>(new Map());
  const currentAction   = useRef<THREE.AnimationAction | null>(null);
  const currentState    = useRef<string | null>(null);
  // 머리 본 — hideHead 시 0 으로 스케일링해서 머리/머리카락 가림
  const headBone        = useRef<THREE.Object3D | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;

    const setupMixer = (
      loaded: THREE.Object3D,
      anims: THREE.AnimationClip[],
      platformClips: Map<string, THREE.AnimationClip>,
    ) => {
      if (!anims.length && platformClips.size === 0) return;
      mixer.current = new THREE.AnimationMixer(loaded);
      clipByState.current.clear();

      // 1. 플랫폼 공통 애니메이션을 폴백으로 먼저 세팅
      platformClips.forEach((clip, state) => {
        clipByState.current.set(state, trimClip(clip, animTrims?.[state]));
      });

      // 2. 캐릭터 개별 슬롯 (코어 + 커스텀 모두) — 공통보다 우선, blocked 슬롯은 건너뜀
      const findByExact = (name?: string) => name ? anims.find(a => a.name === name) : undefined;
      const findByKeyword = (needles: string[]) =>
        anims.find(a => {
          const lname = a.name.toLowerCase();
          return needles.some(n => lname.includes(n.toLowerCase()));
        });

      // animNames에 정의된 모든 슬롯 처리 (idle, walk, run, ... swim, skydive, sleep 등)
      Object.entries(animNames ?? {}).forEach(([state, clipName]) => {
        if (blockedAnimStates?.[state]) return;
        const src = findByExact(clipName) ?? findByKeyword(KEYWORD_FALLBACK[state] ?? []);
        if (src) clipByState.current.set(state, trimClip(src, animTrims?.[state]));
      });

      // 3. 아무 클립도 없으면 첫 번째를 idle 폴백으로 사용
      if (clipByState.current.size === 0 && anims.length > 0 && !blockedAnimStates?.idle) {
        clipByState.current.set('idle', trimClip(anims[0], animTrims?.idle));
      }
    };

    (async () => {
      const { obj: source, anims } = await loadFBXCached(url);
      if (cancelled) return;
      const cloned = await cloneFBX(source);
      if (cancelled) return;
      cloned.traverse(c => { if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).castShadow = castShadow; });
      autoNormalize(cloned, rotX, 1.8);
      const platformClips = await loadPlatformAnimationStateClips(cloned) as Map<AnimState, THREE.AnimationClip>;
      if (cancelled) return;
      setupMixer(cloned, retargetClipsToModel(anims, cloned), platformClips);

      // 슬롯별 외부 FBX 클립 비동기 로드 (EXT_{slot} 이름으로 clipByState에 추가)
      if (animSlotUrls && Object.keys(animSlotUrls).length > 0) {
        const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
        for (const [slot, extUrl] of Object.entries(animSlotUrls)) {
          if (cancelled || !extUrl) continue;
          try {
            const extFbx = await new Promise<THREE.Object3D>((resolve, reject) =>
              new FBXLoader().load(extUrl, resolve, undefined, reject)
            );
            const extAnims = (extFbx as unknown as { animations?: THREE.AnimationClip[] }).animations || [];
            if (!extAnims.length) continue;
            const retargeted = retargetClipsToModel([extAnims[0]], cloned);
            if (!retargeted.length) continue;
            const clip = retargeted[0].clone();
            clip.name = `EXT_${slot}`;
            clipByState.current.set(slot, clip); // slot 이름으로 직접 등록
          } catch (e) {
            console.warn(`[world-ext-anim] ${slot}:`, e);
          }
        }
      }

      // 머리 본 탐색 — Mixamo / 표준 네이밍 패턴
      headBone.current = null;
      const headPattern = /^(mixamorig:?head|head|.+[:_]head)$/i;
      cloned.traverse((child) => {
        if (headBone.current) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const isBone = child.type === 'Bone' || (child as any).isBone;
        if (isBone && headPattern.test(child.name)) {
          headBone.current = child;
        }
      });

      setObj(cloned);
    })();
    return () => {
      cancelled = true;
      mixer.current?.stopAllAction();
      mixer.current = null;
      currentAction.current = null;
      currentState.current = null;
      headBone.current = null;
    };
  }, [url, animNames, animTrims, blockedAnimStates, animSlotUrls]);

  // castShadow prop 변경 시 모든 mesh에 즉시 반영
  useEffect(() => {
    if (!obj) return;
    obj.traverse(c => {
      if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).castShadow = castShadow;
    });
  }, [castShadow, obj]);

  // oneShot 완료 감지 — mixer 'finished' 이벤트로 idle 복귀
  useEffect(() => {
    if (!mixer.current || !animStateRef) return;
    const onFinished = (e: THREE.Event) => {
      const action = (e as unknown as { action: THREE.AnimationAction }).action;
      if (action !== currentAction.current) return;
      // 한번만 재생 슬롯이 완료되면 '__done__' 마커 설정 (Player가 emote 해제)
      if (animOneShot?.includes(currentState.current ?? '')) {
        if (animStateRef.current === currentState.current) {
          animStateRef.current = '__done__';
        }
        currentState.current = null; // 강제 재평가
      }
    };
    mixer.current.addEventListener('finished', onFinished);
    return () => { mixer.current?.removeEventListener('finished', onFinished); };
  }, [obj, animOneShot, animStateRef]);

  // 단일 액션 크로스페이드 (state 바뀔 때만 전환)
  useFrame((_, dt) => {
    mixer.current?.update(dt);
    // 머리 가리기 — mixer 가 매 프레임 본 transform 을 덮어쓰므로 update 후에 강제 적용
    if (headBone.current) {
      headBone.current.scale.setScalar(hideHead ? 0.0001 : 1);
    }
    if (!mixer.current) return;

    const desired = animStateRef?.current || 'idle';

    if (desired === '__done__') return; // Player가 처리할 sentinel — skip
    if (desired === currentState.current) return;

    // 클립 폴백 체인: 슬롯 전용 클립 없으면 유사 슬롯 → idle 순으로 대체
    const STATE_FALLBACKS: Record<string, string[]> = {
      fall:        ['jump'],
      crouch_walk: ['crouch', 'walk'],
      prone_move:  ['prone'],
    };
    const fallbacks = STATE_FALLBACKS[desired] ?? [];
    let targetClip = clipByState.current.get(desired);
    if (!targetClip) {
      for (const fb of fallbacks) {
        targetClip = clipByState.current.get(fb);
        if (targetClip) break;
      }
    }
    if (!targetClip) targetClip = clipByState.current.get('idle');
    if (!targetClip) return;

    const nextAction = mixer.current.clipAction(targetClip);
    if (nextAction === currentAction.current) {
      currentState.current = desired;
      return;
    }

    // oneShot 슬롯이면 LoopOnce, 아니면 LoopRepeat
    const isOneShot = animOneShot?.includes(desired) ?? false;
    nextAction.setLoop(isOneShot ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    nextAction.clampWhenFinished = isOneShot;
    nextAction.reset().fadeIn(0.2).play();
    if (currentAction.current) currentAction.current.fadeOut(0.2);
    currentAction.current = nextAction;
    currentState.current = desired;
  });

  if (!obj) return null;
  // rotX 와 발 정렬(발이 y=0) 은 autoNormalize 가 obj 안에서 처리.
  // 외곽 mesh 래퍼가 이미 y=-0.35 에 있고 (CharacterController 참조),
  // 여기 추가 보정은 월드 지면 관통 방지용 미세값.
  // offsetY: 사용자 수동 조정 (캐릭터마다 미세 조정).
  return (
    <group scale={userScale} position={[0, offsetY, 0]}>
      <primitive object={obj} />
    </group>
  );
}

/* ── 캐릭터 메쉬 (커스텀 or 블록형) ───── */
function CharacterMesh({ appearance, animStateRef, castShadow = true, emoteOneShotOverride, hideHead = false }: {
  appearance: Record<string, unknown>;
  animStateRef?: React.RefObject<AnimState>;
  castShadow?: boolean;
  emoteOneShotOverride?: string[];
  /** 1인칭일 때 머리 숨김 — 애니메이션으로 머리가 시야에 들어오는 것 방지 */
  hideHead?: boolean;
}) {
  const modelUrl   = appearance.modelUrl as string | undefined;
  const userScale  = Number(appearance.modelScale) || 1.0;
  const rotX       = Number(appearance.fbxRotX ?? -Math.PI / 2);
  const offsetY    = Number(appearance.fbxOffsetY ?? 0);

  // appearance 내용 기반 안정화 — 버튼 클릭 등 리렌더 시 새 객체 생성 방지
  // (새 객체가 생기면 CustomModel useEffect가 재실행 → 모델 리로드 → 순간 T-포즈)
  const appearanceKey = JSON.stringify(appearance);
  const trims = useMemo(
    () => (appearance.animTrims ?? {}) as Record<string, AnimTrim>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [appearanceKey],
  );
  const blockedAnimStates = useMemo(
    () => Array.isArray(appearance.animAutoMapBlocked)
      ? Object.fromEntries((appearance.animAutoMapBlocked as unknown[]).map((slot) => [String(slot), true])) as Record<string, boolean>
      : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [appearanceKey],
  );
  const animNames = useMemo<Record<string, string>>(
    () => appearance.animSlots
      ? { ...(appearance.animSlots as Record<string, string>) }
      : {
          idle:   String(appearance.idleAnim   ?? ''),
          walk:   String(appearance.walkAnim   ?? ''),
          run:    String(appearance.runAnim    ?? ''),
          jump:   String(appearance.jumpAnim   ?? ''),
          crouch: String(appearance.crouchAnim ?? ''),
          prone:  String(appearance.proneAnim  ?? ''),
        },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [appearanceKey],
  );
  const animOneShot = useMemo(
    () => {
      const fromAppearance = Array.isArray(appearance.animOneShot)
        ? (appearance.animOneShot as unknown[]).map(String)
        : [];
      // 패널에서 '한번만' 설정한 슬롯을 병합 (루프 설정 슬롯은 appearance에서 제거)
      const overrideOnce = emoteOneShotOverride ?? [];
      const merged = new Set([...fromAppearance, ...overrideOnce]);
      return merged.size > 0 ? [...merged] : undefined;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [appearanceKey, emoteOneShotOverride],
  );
  const animSlotUrls = useMemo(
    () => (appearance.animSlotUrls as Record<string, string> | undefined) || undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [appearanceKey],
  );

  if (modelUrl) {
    return (
      <CustomModel
        url={modelUrl}
        userScale={userScale}
        rotX={rotX}
        offsetY={offsetY}
        castShadow={castShadow}
        animStateRef={animStateRef}
        animNames={animNames}
        animTrims={trims}
        blockedAnimStates={blockedAnimStates}
        animOneShot={animOneShot}
        animSlotUrls={animSlotUrls}
        hideHead={hideHead}
      />
    );
  }
  // BlockMesh 의 다리 바닥(block-local y=-0.58)이 mesh wrapper local y=-0.28 (= body local -0.63 = 캡슐 바닥)
  // 에 오도록 +0.30 만큼 올린다.
  return (
    <group position={[0, 0.58, 0]}>
      <BlockMesh appearance={appearance as Record<string, string>} hideHead={hideHead} />
    </group>
  );
}

/* ── 블록형 기본 캐릭터 ─────────────────── */
function BlockMesh({ appearance, hideHead = false }: { appearance: Record<string, string>; hideHead?: boolean }) {
  const body   = appearance.bodyColor   || '#4f46e5';
  const skin   = appearance.skinColor   || '#fcd9b0';
  const hair   = appearance.hairColor   || '#1e293b';
  const pants  = appearance.pantsColor  || '#1e293b';

  return (
    <group>
      {/* 몸통 */}
      <mesh position={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[0.55, 0.65, 0.28]} />
        <meshStandardMaterial color={body} />
      </mesh>
      {!hideHead && <>
      {/* 머리 */}
      <mesh position={[0, 0.95, 0]} castShadow>
        <boxGeometry args={[0.48, 0.48, 0.48]} />
        <meshStandardMaterial color={skin} />
      </mesh>
      {/* 머리카락 */}
      <mesh position={[0, 1.22, 0]}>
        <boxGeometry args={[0.50, 0.14, 0.50]} />
        <meshStandardMaterial color={hair} />
      </mesh>
      {/* 눈 왼 */}
      <mesh position={[0.12, 0.97, 0.25]}>
        <boxGeometry args={[0.09, 0.09, 0.02]} />
        <meshStandardMaterial color="#111" />
      </mesh>
      {/* 눈 우 */}
      <mesh position={[-0.12, 0.97, 0.25]}>
        <boxGeometry args={[0.09, 0.09, 0.02]} />
        <meshStandardMaterial color="#111" />
      </mesh>
      </>}
      {/* 팔 왼 */}
      <mesh position={[-0.40, 0.32, 0]} castShadow>
        <boxGeometry args={[0.22, 0.60, 0.22]} />
        <meshStandardMaterial color={body} />
      </mesh>
      {/* 팔 우 */}
      <mesh position={[0.40, 0.32, 0]} castShadow>
        <boxGeometry args={[0.22, 0.60, 0.22]} />
        <meshStandardMaterial color={body} />
      </mesh>
      {/* 다리 왼 */}
      <mesh position={[-0.15, -0.28, 0]} castShadow>
        <boxGeometry args={[0.23, 0.60, 0.23]} />
        <meshStandardMaterial color={pants} />
      </mesh>
      {/* 다리 우 */}
      <mesh position={[0.15, -0.28, 0]} castShadow>
        <boxGeometry args={[0.23, 0.60, 0.23]} />
        <meshStandardMaterial color={pants} />
      </mesh>
    </group>
  );
}

/* ── JS onUpdate 호출 루프 + 네트워크 상태 보간 (Canvas 내부 컴포넌트) ── */
function LuaUpdateLoop({
  luaScripts,
  componentScripts,
  worldElapsed,
  scriptBodyRefs,
  syncTargets,
  isHost,
  ownersRef,
  playerId,
  remoteGrabbedByRef,
  allObjectsRef,
  lightRefs,
}: {
  luaScripts: React.MutableRefObject<Map<string, import('@/lib/world/jsRuntime').JsScript>>;
  componentScripts: React.MutableRefObject<Map<string, Array<{ vm: import('@/lib/world/jsRuntime').JsScript; key: string }>>>;
  worldElapsed: React.MutableRefObject<number>;
  scriptBodyRefs: React.MutableRefObject<Map<string, {
    body: React.MutableRefObject<RapierBodyApi | null>;
    group: React.MutableRefObject<THREE.Group | null>;
  }>>;
  syncTargets: React.MutableRefObject<Map<string, { pos: [number, number, number]; rot: [number, number, number]; scl: [number, number, number]; vis: boolean; vel: [number, number, number]; recvTime: number }>>;
  isHost: boolean;
  ownersRef: React.MutableRefObject<Map<string, string>>;
  playerId: string;
  /** 다른 클라가 1인칭 grab 중인 오브젝트 — 호스트 fallback skip 룰 완화에 사용 */
  remoteGrabbedByRef: React.MutableRefObject<Map<string, string>>;
  /** 전체 오브젝트 (customObjects + runtime) — parent transform propagation 용 */
  allObjectsRef: React.MutableRefObject<UserMapObject[]>;
  /** 조명 ref — 부모 따라 움직일 때 light.position 직접 갱신 */
  lightRefs: React.MutableRefObject<Map<string, THREE.Light>>;
}) {
  useFrame((_, dt) => {
    worldElapsed.current += dt;
    for (const vm of luaScripts.current.values()) vm.callUpdate(dt);
    // 유저 정의 컴포넌트 VM 들도 매 프레임 onUpdate
    for (const arr of componentScripts.current.values()) {
      for (const { vm } of arr) vm.callUpdate(dt);
    }

    // ── 부모 → 자식 transform propagation ──
    // 각 부모의 현재 world transform 을 자식의 local transform 과 곱해서 자식의 body/group/light 갱신.
    // spawn 은 flat 렌더라 제외. dynamic body 자식도 물리 소유라 제외.
    {
      const allObjects = allObjectsRef.current;
      if (allObjects && allObjects.length > 0) {
        const childrenOf = new Map<string, UserMapObject[]>();
        for (const obj of allObjects) {
          if (!obj.parentId) continue;
          if (obj.kind === 'spawn') continue;
          if (!childrenOf.has(obj.parentId)) childrenOf.set(obj.parentId, []);
          childrenOf.get(obj.parentId)!.push(obj);
        }
        if (childrenOf.size > 0) {
          const _tmpPos = new THREE.Vector3();
          const _tmpQuat = new THREE.Quaternion();
          const _tmpScl = new THREE.Vector3();
          const propagate = (parentId: string, parentWorld: THREE.Matrix4) => {
            const kids = childrenOf.get(parentId);
            if (!kids) return;
            for (const child of kids) {
              const childLocal = new THREE.Matrix4().compose(
                new THREE.Vector3(child.position[0], child.position[1], child.position[2]),
                new THREE.Quaternion().setFromEuler(new THREE.Euler(child.rotation[0], child.rotation[1], child.rotation[2], 'XYZ')),
                new THREE.Vector3(child.scale[0], child.scale[1], child.scale[2]),
              );
              const childWorld = parentWorld.clone().multiply(childLocal);
              childWorld.decompose(_tmpPos, _tmpQuat, _tmpScl);

              // 조명이면 lightRefs 사용 (별도 ref 맵)
              const isLight = child.kind === 'pointlight' || child.kind === 'spotlight' || child.kind === 'dirlight';
              if (isLight) {
                const lr = lightRefs.current.get(child.id);
                if (lr) {
                  lr.position.set(_tmpPos.x, _tmpPos.y, _tmpPos.z);
                  lr.quaternion.set(_tmpQuat.x, _tmpQuat.y, _tmpQuat.z, _tmpQuat.w);
                }
              } else {
                const ref = scriptBodyRefs.current.get(child.id);
                if (ref?.body.current) {
                  // dynamic 은 물리 소유라 건들지 않음
                  const bodyType = (ref.body.current as RapierBodyApi & { bodyType?: () => number }).bodyType?.();
                  if (bodyType !== 0) { // 0 = Dynamic in Rapier
                    ref.body.current.setTranslation({ x: _tmpPos.x, y: _tmpPos.y, z: _tmpPos.z }, true);
                    ref.body.current.setRotation({ x: _tmpQuat.x, y: _tmpQuat.y, z: _tmpQuat.z, w: _tmpQuat.w }, true);
                  }
                } else if (ref?.group.current) {
                  ref.group.current.position.set(_tmpPos.x, _tmpPos.y, _tmpPos.z);
                  ref.group.current.quaternion.set(_tmpQuat.x, _tmpQuat.y, _tmpQuat.z, _tmpQuat.w);
                  ref.group.current.scale.set(_tmpScl.x, _tmpScl.y, _tmpScl.z);
                }
              }
              // 손자도 재귀
              propagate(child.id, childWorld);
            }
          };
          // 루트 부모들 — childrenOf 의 key 중 자기 자신이 child 가 아닌 (= 트리 root) 만
          // 단순화: 모든 부모에 대해 그 부모의 현재 world transform 으로 시작
          for (const parentId of childrenOf.keys()) {
            const ref = scriptBodyRefs.current.get(parentId);
            const parentWorld = new THREE.Matrix4();
            if (ref?.body.current) {
              const t = ref.body.current.translation();
              const r = ref.body.current.rotation();
              // body 는 scale 정보 없음 → data 에서 가져옴
              const parentObj = allObjects.find(o => o.id === parentId);
              const sc = parentObj?.scale ?? [1, 1, 1];
              parentWorld.compose(
                new THREE.Vector3(t.x, t.y, t.z),
                new THREE.Quaternion(r.x, r.y, r.z, r.w),
                new THREE.Vector3(sc[0], sc[1], sc[2]),
              );
            } else if (ref?.group.current) {
              ref.group.current.updateMatrix();
              parentWorld.copy(ref.group.current.matrix);
            } else {
              continue;
            }
            // 부모 자신이 다른 부모의 자식이면 propagate 가 이미 그쪽에서 처리됨 — 중복 OK (부드럽게 덮어씀)
            propagate(parentId, parentWorld);
          }
        }
      }
    }

    // ── Client-side Prediction with Reconciliation ──
    // 본인이 소유한 오브젝트 = 본인 로컬 물리가 권위자 → 수신 적용 안 함
    // 다른 사람이 소유 OR 소유자 없는데 호스트가 broadcast 중 → 수신 적용
    {
      const now = performance.now();
      const SNAP_THRESHOLD_SQ        = 25;      // 5m 이상에서만 hard snap (권한 이전 시 teleport 방지)
      const SOFT_CORRECTION          = Math.min(1, 6 * dt);  // 약간 빠르게 (4 → 6)
      const REST_CORRECTION          = Math.min(1, 10 * dt);
      const VEL_CORRECTION           = Math.min(1, 8 * dt);

      for (const [id, target] of syncTargets.current) {
        // 본인이 소유 → 적용 안 함 (본인이 권위자)
        if (ownersRef.current.get(id) === playerId) continue;
        // 소유자 없음 + 본인이 호스트 → 적용 안 함 (본인이 fallback authority)
        // EXCEPT: 다른 클라가 1인칭 grab 중이면 owner_change 메시지 도착 전이라도 grabber 가 권위자 — 적용.
        if (!ownersRef.current.get(id) && isHost && !remoteGrabbedByRef.current.has(id)) continue;

        const ref = scriptBodyRefs.current.get(id);
        if (!ref) continue;
        // 네트워크 지연 보상 — 받은 위치를 velocity로 현재 시각까지 예측
        const dtSinceRecv = Math.min(0.2, (now - target.recvTime) / 1000);
        const ex = target.pos[0] + target.vel[0] * dtSinceRecv;
        const ey = target.pos[1] + target.vel[1] * dtSinceRecv;
        const ez = target.pos[2] + target.vel[2] * dtSinceRecv;

        if (ref.body.current) {
          const cur = ref.body.current.translation();
          const dx = ex - cur.x, dy = ey - cur.y, dz = ez - cur.z;
          const distSq = dx*dx + dy*dy + dz*dz;

          // 현재 / 목표 속도 측정
          const curV = ref.body.current.linvel();
          const curSpeedSq = curV.x*curV.x + curV.y*curV.y + curV.z*curV.z;
          const targetSpeedSq = target.vel[0]*target.vel[0] + target.vel[1]*target.vel[1] + target.vel[2]*target.vel[2];
          const localMoving  = curSpeedSq > 0.25;     // > 0.5 m/s
          const serverMoving = targetSpeedSq > 1.0;   // > 1 m/s
          const isAtRest = !localMoving && !serverMoving; // 둘 다 정지

          if (distSq > SNAP_THRESHOLD_SQ) {
            // 텔레포트/끊김 → 즉시 동기화
            ref.body.current.setTranslation({ x: ex, y: ey, z: ez }, true);
            ref.body.current.setLinvel({ x: target.vel[0], y: target.vel[1], z: target.vel[2] }, true);
          } else if (isAtRest) {
            // 둘 다 정지 상태 → 정확한 위치로 빠르게 수렴 (클라이언트 간 위치 일치)
            // tolerance 없음. 1mm라도 차이 있으면 보정 (부드럽게)
            if (distSq > 0.000001) {
              ref.body.current.setTranslation({
                x: cur.x + dx * REST_CORRECTION,
                y: cur.y + dy * REST_CORRECTION,
                z: cur.z + dz * REST_CORRECTION,
              }, true);
            }
            // velocity는 0으로 고정 (정지 유지)
            if (curSpeedSq > 0.01) {
              ref.body.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
            }
          } else if (distSq > 0.04) {
            // 움직이는 중 + 위치 차이 큼 → 부드러운 보정
            ref.body.current.setTranslation({
              x: cur.x + dx * SOFT_CORRECTION,
              y: cur.y + dy * SOFT_CORRECTION,
              z: cur.z + dz * SOFT_CORRECTION,
            }, true);
            // velocity 차이 큰 경우만 보정
            const dvx = target.vel[0] - curV.x;
            const dvy = target.vel[1] - curV.y;
            const dvz = target.vel[2] - curV.z;
            const velDiffSq = dvx*dvx + dvy*dvy + dvz*dvz;
            if (velDiffSq > 0.25) {
              ref.body.current.setLinvel({
                x: curV.x + dvx * VEL_CORRECTION,
                y: curV.y + dvy * VEL_CORRECTION,
                z: curV.z + dvz * VEL_CORRECTION,
              }, true);
            }
          }
          // 회전: 부드러운 slerp. threshold 두면 천천히 도는 오브젝트(AutoRotate 등)가
          // 매 broadcast 사이 임계값 미달로 안 움직이고 점프 → 항상 slerp.
          const targetQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(target.rot[0], target.rot[1], target.rot[2]));
          const r = ref.body.current.rotation();
          const curQ = new THREE.Quaternion(r.x, r.y, r.z, r.w);
          curQ.slerp(targetQ, SOFT_CORRECTION);
          ref.body.current.setRotation({ x: curQ.x, y: curQ.y, z: curQ.z, w: curQ.w }, true);
        } else if (ref.group.current) {
          // 물리 없는 오브젝트 — 그냥 부드럽게 lerp
          ref.group.current.position.lerp(new THREE.Vector3(ex, ey, ez), SOFT_CORRECTION);
          const targetEu = new THREE.Euler(target.rot[0], target.rot[1], target.rot[2]);
          ref.group.current.rotation.x += (targetEu.x - ref.group.current.rotation.x) * SOFT_CORRECTION;
          ref.group.current.rotation.y = lerpAngle(ref.group.current.rotation.y, targetEu.y, SOFT_CORRECTION);
          ref.group.current.rotation.z += (targetEu.z - ref.group.current.rotation.z) * SOFT_CORRECTION;
          ref.group.current.scale.lerp(new THREE.Vector3(target.scl[0], target.scl[1], target.scl[2]), SOFT_CORRECTION);
          ref.group.current.visible = target.vis;
        }
      }
    }
  });
  return null;
}

/* ── 그래픽 설정 변경 시 셰도우맵 강제 갱신 ── */
/* 노출(toneMapping) + HDRI IBL 강도 라이브 업데이트
   gl prop / Environment prop 은 초기 마운트만 적용되므로 매 렌더마다 직접 세팅. */
function ExposureUpdater({ exposure, hdriIntensity }: { exposure: number; hdriIntensity: number }) {
  const { gl, scene } = useThree();
  gl.toneMappingExposure = exposure;
  (scene as THREE.Scene & { environmentIntensity?: number }).environmentIntensity = hdriIntensity;
  return null;
}

function GraphicsApplier({ shadowSize, shadowFilter, shadowRadius }: {
  shadowSize: number;
  shadowFilter: 'basic' | 'pcf' | 'pcfsoft';
  shadowRadius: number;
}) {
  const { gl, scene } = useThree();

  // 셰도우 필터 타입 변경
  useEffect(() => {
    gl.shadowMap.type =
      shadowFilter === 'basic'   ? THREE.BasicShadowMap   :
      shadowFilter === 'pcfsoft' ? THREE.PCFSoftShadowMap :
                                   THREE.PCFShadowMap;
    gl.shadowMap.needsUpdate = true;
    // 모든 머티리얼 셰이더 재컴파일 필요 (필터 타입 바뀌면 셰이더가 달라짐)
    scene.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach(m => { m.needsUpdate = true; });
      }
    });
  }, [shadowFilter, gl, scene]);

  // 셰도우맵 사이즈 + radius 변경
  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
    scene.traverse(obj => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const light = obj as any;
      if (light.isDirectionalLight && light.shadow) {
        light.shadow.mapSize.set(shadowSize || 1024, shadowSize || 1024);
        light.shadow.radius = shadowRadius;
        // 그림자 아티팩트 (peter-panning, acne) 감소
        light.shadow.bias       = -0.0005;
        light.shadow.normalBias = 0.02;
        // 카메라 범위 좁혀서 텍셀 밀도 ↑ → 선명도 ↑
        light.shadow.camera.near = 0.5;
        light.shadow.camera.far  = 120;
        if (light.shadow.map) {
          light.shadow.map.dispose();
          light.shadow.map = null;
        }
        light.shadow.camera.updateProjectionMatrix();
      }
    });
  }, [shadowSize, shadowRadius, gl, scene]);
  return null;
}

/* ── 모바일 터치 상태 싱글톤 ─────────────────────────────────────
   Player(Canvas 내부)와 MobileControls(Canvas 외부)가 ref 없이 공유.
   Canvas 외부 DOM에서 렌더링해야 drei Html의 transform 스케일 문제를 피할 수 있음. */
const _mob = {
  moveTouch:  { active: false, x: 0, y: 0, pointerId: -1 },
  lookTouch:  { active: false, pointerId: -1, lastX: 0, lastY: 0 },
  jumpQueued: false,
  pinch:      { active: false, id2: -1, lastDist: 0, x1: 0, y1: 0, x2: 0, y2: 0 },
  camH:       0,
  camV:       0.45,
  camDist:    7,
  sprint:     false,
};

export type CameraMode = 'first' | 'third';

/* ── 로컬 플레이어 컨트롤러 ─────────────── */
export function Player({
  character,
  bubble,
  onMove,
  inputLocked = false,
  emoteSlot,
  emoteOneShotOverride,
  onObjCollide,
  cameraMode,
  onToggleCameraMode,
  scriptBodyRefs,
  luaScripts,
  componentScripts,
  ownersRef,
  playerId,
  grabbedStateRef,
  grabbableIdsRef,
  onGrabUiChange,
  onGrabClaim,
  onGrabRelease,
  remoteGrabbedByRef,
  cameraControlEnabled = true,
  hideHeadOverride,
  jumpPower = 7,
  spawnPos = [0, 4, 0],
  spawnRotY = 0,
}: {
  character: Record<string, unknown>;
  bubble?: ChatBubble;
  onMove: (p: { x: number; y: number; z: number; rotY: number; animState?: AnimState; vx?: number; vy?: number; vz?: number }) => void;
  inputLocked?: boolean;
  emoteSlot?: string | null;
  emoteOneShotOverride?: string[];
  onObjCollide?: (objectId: string, type: 'enter' | 'exit') => void;
  cameraMode: CameraMode;
  onToggleCameraMode: () => void;
  // ── 1인칭 grab(Unreal physics handle 흉내) 용 ──
  scriptBodyRefs?: React.MutableRefObject<Map<string, {
    body: React.MutableRefObject<RapierBodyApi | null>;
    group: React.MutableRefObject<THREE.Group | null>;
  }>>;
  luaScripts?: React.MutableRefObject<Map<string, import('@/lib/world/jsRuntime').JsScript>>;
  componentScripts?: React.MutableRefObject<Map<string, Array<{ vm: import('@/lib/world/jsRuntime').JsScript; key: string }>>>;
  ownersRef?: React.MutableRefObject<Map<string, string>>;
  playerId?: string;
  grabbedStateRef?: React.MutableRefObject<Map<string, string>>;
  grabbableIdsRef?: React.MutableRefObject<Set<string>>;
  onGrabUiChange?: (state: 'idle' | 'aim' | 'grab') => void;
  /** 1인칭 grab 성공 시 호출 — 서버에 ownership claim 보내고 syncTargets 비움 */
  onGrabClaim?: (objectId: string) => void;
  /** 1인칭 grab 해제(어떤 경로든) 시 호출 — 1.5s 후 자동 release timer 등록 */
  onGrabRelease?: (objectId: string) => void;
  /** 다른 클라가 1인칭 grab 중인 오브젝트 — E 키 grab 시 충돌 방지 + steal 감지용 */
  remoteGrabbedByRef?: React.MutableRefObject<Map<string, string>>;
  /** false 면 카메라를 건드리지 않음 (스튜디오 자유시점 모드에서 외부 카메라가 제어) */
  cameraControlEnabled?: boolean;
  /** 머리 숨김 강제. undefined 면 기본(1인칭일 때 숨김). false 면 항상 표시(near 클리핑 의존). */
  hideHeadOverride?: boolean;
  /** 점프 시 위로 주는 속도 (m/s). 맵 설정으로 조절. 기본 7 (≈1.1m). */
  jumpPower?: number;
  /** 스폰 위치 — 월드의 spawn 오브젝트 중 하나. 없으면 기본 [0,4,0] */
  spawnPos?: [number, number, number];
  /** 스폰 시 카메라 초기 Y 회전 (라디안). spawn 의 rotation.y */
  spawnRotY?: number;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body      = useRef<any>(null);
  const mesh      = useRef<THREE.Group>(null);
  const { rapier, world: rWorld } = useRapier();
  const { camera, gl } = useThree();

  /* 직접 DOM 키 추적 — KeyboardControls 컨텍스트 문제 우회 */
  const keys = useRef(new Set<string>());

  const isLocked = useRef(false);
  const lastSend = useRef(0);
  const jumpPrev = useRef(false);
  const lastPos  = useRef(new THREE.Vector3(spawnPos[0], spawnPos[1], spawnPos[2]));
  // 마운트 시 1회 — 카메라 H 회전을 스폰 포인트의 Y 회전으로 (마운트 후엔 마우스로 자유)
  useEffect(() => { _mob.camH = spawnRotY; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  // 현재 애니메이션 상태 (CustomModel이 참조)
  const animStateRef = useRef<AnimState>('idle');
  // 이모트(커스텀 애니메이션) 오버라이드 — idle 상태일 때만 적용
  const emoteSlotRef = useRef<string | null>(null);
  useEffect(() => { emoteSlotRef.current = emoteSlot ?? null; }, [emoteSlot]);
  // 토글 키: C(앉기), Z(엎드리기)
  const crouchRef = useRef(false);
  const proneRef  = useRef(false);
  // 점프 상태 최소 유지 시간 (애니메이션 재생 보장)
  const jumpHoldUntil = useRef(0);
  // ── 1인칭 grab (Unreal physics handle) ──
  const grabbedIdRef = useRef<string | null>(null);
  const grabDistRef  = useRef(2.5); // 카메라 앞 m
  // 도난 reclaim 의 rate limit — objectId → 마지막 reclaim 시각(ms)
  const grabReclaimAtRef = useRef<Map<string, number>>(new Map());
  // 크로스헤어 UI state 추적 — 매 프레임 setState 호출 안 하려고 ref 로 last 값 보관
  const lastUiStateRef = useRef<'idle' | 'aim' | 'grab'>('idle');
  // onKeyDown 내부에서 cameraMode prop을 stale 없이 읽기 위한 ref
  const cameraModeRef = useRef(cameraMode);
  useEffect(() => { cameraModeRef.current = cameraMode; }, [cameraMode]);
  // 3인칭 전환 시 grab 자동 해제
  useEffect(() => {
    if (cameraMode !== 'first' && grabbedIdRef.current) {
      const released = grabbedIdRef.current;
      grabbedIdRef.current = null;
      grabbedStateRef?.current.delete(released);
      onGrabRelease?.(released);
      if (playerId) {
        luaScripts?.current.get(released)?.callRelease(playerId);
        componentScripts?.current.get(released)?.forEach(({ vm }) => vm.callRelease(playerId));
      }
    }
  }, [cameraMode, luaScripts, componentScripts, playerId, grabbedStateRef, onGrabRelease]);
  /* 키보드 + 포인터 락 */
  useEffect(() => {
    const el = gl.domElement;

    // 키보드
    const onKeyDown = (e: KeyboardEvent) => {
      if (inputLocked) return;
      if (e.repeat) return;
      keys.current.add(e.code);
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
      // 토글 키
      if (e.code === 'KeyC') { crouchRef.current = !crouchRef.current; if (crouchRef.current) proneRef.current = false; }
      if (e.code === 'KeyZ') { proneRef.current  = !proneRef.current;  if (proneRef.current)  crouchRef.current = false; }
      if (e.code === 'KeyV') { onToggleCameraMode(); }
      // ── E: 1인칭 grab/release 토글 ──
      if (e.code === 'KeyE' && cameraModeRef.current === 'first') {
        if (grabbedIdRef.current) {
          // release
          const released = grabbedIdRef.current;
          grabbedIdRef.current = null;
          grabbedStateRef?.current.delete(released);
          onGrabRelease?.(released);
          if (playerId) {
            luaScripts?.current.get(released)?.callRelease(playerId);
            // user 컴포넌트들에도 dispatch
            componentScripts?.current.get(released)?.forEach(({ vm }) => vm.callRelease(playerId));
          }
        } else {
          // raycast → grab 시도
          try {
            const camPos = camera.position;
            const fx = -Math.sin(_mob.camH) * Math.cos(_mob.camV);
            const fy = -Math.sin(_mob.camV);
            const fz = -Math.cos(_mob.camH) * Math.cos(_mob.camV);
            const ray = new rapier.Ray({ x: camPos.x, y: camPos.y, z: camPos.z }, { x: fx, y: fy, z: fz });
            const hit = rWorld.castRay(ray, 4.0, true, undefined, undefined, undefined, body.current ?? undefined);
            if (hit) {
              const hitBody = hit.collider?.parent();
              if (hitBody && scriptBodyRefs) {
                // hitBody 와 일치하는 objectId 찾기
                let foundId: string | null = null;
                for (const [id, ref] of scriptBodyRefs.current) {
                  if (ref.body.current === hitBody) { foundId = id; break; }
                }
                // grabbable 플래그 체크 — false 면 그냥 무시
                if (foundId && !grabbableIdsRef?.current.has(foundId)) {
                  foundId = null;
                }
                if (foundId) {
                  grabbedIdRef.current = foundId;
                  if (playerId) grabbedStateRef?.current.set(foundId, playerId);
                  // 본인 소유로 — 멀티에서 reconciliation 이 자기 setLinvel 을 안 덮어쓰게
                  if (playerId && ownersRef) ownersRef.current.set(foundId, playerId);
                  // 서버에 ownership claim 송신 (다른 클라가 옛 host 데이터로 덮어쓰는 것 방지)
                  onGrabClaim?.(foundId);
                  // 잡힌 거리 = 현재 카메라~오브젝트 거리 (초기에 잡은 순간 그대로 유지)
                  const t = hitBody.translation();
                  const dx = t.x - camPos.x, dy = t.y - camPos.y, dz = t.z - camPos.z;
                  grabDistRef.current = Math.max(1.5, Math.min(6.0, Math.sqrt(dx*dx + dy*dy + dz*dz)));
                  // 스크립트 콜백 — 메인 스크립트 + user 컴포넌트 둘 다
                  if (playerId) {
                    luaScripts?.current.get(foundId)?.callGrab(playerId);
                    componentScripts?.current.get(foundId)?.forEach(({ vm }) => vm.callGrab(playerId));
                  }
                }
              }
            }
          } catch { /* Rapier 초기화 중 무시 */ }
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code);

    // 마우스
    const onMouseMove = (e: MouseEvent) => {
      if (inputLocked) return;
      if (!isLocked.current) return;
      _mob.camH -= e.movementX * 0.003;
      _mob.camV  = Math.max(-1.1, Math.min(1.3, _mob.camV + e.movementY * 0.003));
    };
    const onLockChange = () => { isLocked.current = !!document.pointerLockElement; };
    const tryLockPointer = () => {
      if (inputLocked) return;
      if (document.pointerLockElement === el) return;
      el.requestPointerLock();
    };
    const onClick = () => {
      // 1인칭 + 잡은 상태 + 포인터 락 중 → 던지기 (forward 임펄스 + release)
      if (grabbedIdRef.current && cameraModeRef.current === 'first' && isLocked.current) {
        const grabId = grabbedIdRef.current;
        const ref = scriptBodyRefs?.current.get(grabId);
        const gb = ref?.body.current;
        if (gb) {
          const fx = -Math.sin(_mob.camH) * Math.cos(_mob.camV);
          const fy = -Math.sin(_mob.camV);
          const fz = -Math.cos(_mob.camH) * Math.cos(_mob.camV);
          const STRENGTH = 8;
          gb.applyImpulse({ x: fx * STRENGTH, y: fy * STRENGTH + 1.5, z: fz * STRENGTH }, true);
        }
        grabbedIdRef.current = null;
        grabbedStateRef?.current.delete(grabId);
        onGrabRelease?.(grabId);
        if (playerId) luaScripts?.current.get(grabId)?.callRelease(playerId);
        return;
      }
      tryLockPointer();
    };
    const onPointerDown = () => tryLockPointer();
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // 1인칭 + 잡고 있는 중 → 잡은 거리 조절 (1.2~6m)
      // 휠 ↑ (deltaY<0) = 멀어지고, 휠 ↓ (deltaY>0) = 가까워짐
      if (grabbedIdRef.current && cameraModeRef.current === 'first') {
        grabDistRef.current = Math.max(1.2, Math.min(6.0, grabDistRef.current - e.deltaY * 0.004));
        return;
      }
      _mob.camDist = Math.max(1.1, Math.min(14, _mob.camDist + e.deltaY * 0.01));
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onLockChange);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('click', onClick);
    el.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onLockChange);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('click', onClick);
      el.removeEventListener('pointerdown', onPointerDown);
    };
  }, [gl, inputLocked, onToggleCameraMode]);

  useEffect(() => {
    if (!inputLocked) return;
    keys.current.clear();
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    _mob.moveTouch.active = false; _mob.moveTouch.x = 0; _mob.moveTouch.y = 0; _mob.moveTouch.pointerId = -1;
    _mob.lookTouch.active = false; _mob.lookTouch.pointerId = -1;
    _mob.jumpQueued = false;
    _mob.pinch.active = false; _mob.pinch.id2 = -1;
  }, [inputLocked]);

  useFrame((_, dt) => {
    /* ── oneShot 완료 sentinel 처리 — emote 해제 ── */
    if (animStateRef.current === '__done__') {
      emoteSlotRef.current = null;
      animStateRef.current = 'idle';
    }

    /* ── 물리 바디가 준비된 경우에만 이동 처리 ── */
    if (body.current) {
      try {
      const k = inputLocked ? new Set<string>() : keys.current;
      const forward  = k.has('KeyW') || k.has('ArrowUp');
      const backward = k.has('KeyS') || k.has('ArrowDown');
      const left     = k.has('KeyA') || k.has('ArrowLeft');
      const right    = k.has('KeyD') || k.has('ArrowRight');
      const jump     = k.has('Space');
      const sprint   = k.has('ShiftLeft') || _mob.sprint;
      const vel  = body.current.linvel();
      const posT = body.current.translation();

      if (inputLocked) {
        body.current.setLinvel({ x: 0, y: vel.y, z: 0 }, true);
        animStateRef.current = 'idle';
        const now = Date.now();
        if (now - lastSend.current > 50) {
          lastSend.current = now;
          onMove({ x: posT.x, y: posT.y, z: posT.z, rotY: mesh.current?.rotation.y ?? 0, animState: 'idle' });
        }
        return;
      }

      // 상태 기반 속도
      const isCrouch = crouchRef.current;
      const isProne  = proneRef.current;
      const SPEED    = isProne ? 1.0 : isCrouch ? 2.5 : sprint ? 9 : 5;

      // 추락 방지: y가 너무 낮으면 스폰 위치로 복귀
      if (posT.y < -50) {
        body.current.setTranslation({ x: spawnPos[0], y: spawnPos[1] + 1, z: spawnPos[2] }, true);
        body.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
        return;
      }

      lastPos.current.set(posT.x, posT.y, posT.z);

      const sinH = Math.sin(_mob.camH);
      const cosH = Math.cos(_mob.camH);
      let mx = 0, mz = 0;
      if (forward)  { mx -= sinH; mz -= cosH; }
      if (backward) { mx += sinH; mz += cosH; }
      if (left)     { mx -= cosH; mz += sinH; }
      if (right)    { mx += cosH; mz -= sinH; }

      if (!inputLocked && _mob.moveTouch.active) {
        const jx = _mob.moveTouch.x;
        const jy = -_mob.moveTouch.y;
        mx += (-sinH * jy) + (cosH * jx);
        mz += (-cosH * jy) + (-sinH * jx);
      }

      const len = Math.sqrt(mx * mx + mz * mz);
      if (len > 0) { mx /= len; mz /= len; }
      body.current.setLinvel({ x: mx * SPEED, y: vel.y, z: mz * SPEED }, true);

      // 지면 체크 — 자기 RigidBody 제외 (제외 없으면 캡슐 내부 → TOI=0 → 항상 onGround=true)
      const ray = new rapier.Ray({ x: posT.x, y: posT.y, z: posT.z }, { x: 0, y: -1, z: 0 });
      const hit = rWorld.castRay(ray, 1.3, true, undefined, undefined, undefined, body.current ?? undefined);
      const onGround = !!(hit && hit.timeOfImpact < 0.7);

      // 점프: Space가 새로 눌렸을 때만 1번 (앉기/엎드리기 중엔 점프 금지)
      const jumpJustPressed = (jump && !jumpPrev.current) || _mob.jumpQueued;
      jumpPrev.current = jump;
      _mob.jumpQueued = false;
      if (jumpJustPressed && onGround && !isCrouch && !isProne) {
        // 점프력 = 맵 설정 (기본 7 m/s → 약 1.1m @ 중력 -22)
        body.current.setLinvel({ x: vel.x, y: jumpPower, z: vel.z }, true);
        // 애니메이션이 끊기지 않도록 최소 500ms 점프 상태 유지
        jumpHoldUntil.current = Date.now() + 500;
      }

      // 캐릭터 회전 — 1인칭은 항상 카메라 방향, 3인칭은 이동 방향
      if (mesh.current && !isProne) {
        if (cameraMode === 'first') {
          // FP: 캐릭터 몸이 항상 카메라 보는 방향과 일치 (즉시 동기)
          mesh.current.rotation.y = _mob.camH + Math.PI;
        } else if (len > 0) {
          const target = Math.atan2(mx, mz);
          mesh.current.rotation.y = lerpAngle(mesh.current.rotation.y, target, Math.min(1, 12 * dt));
        }
      }

      // 현재 애니메이션 상태 결정
      const moving      = len > 0;
      const inJumpHold  = Date.now() < jumpHoldUntil.current;
      let state: AnimState = 'idle';
      if (!onGround || inJumpHold) {
        // jumpHold 중에도 vel.y로 jump/fall 구분 (hold가 끝날 때까지 기다리면 fall 시간이 너무 짧음)
        state = vel.y < -0.5 ? 'fall' : 'jump';
      } else if (isProne) {
        state = moving ? 'prone_move' : 'prone';
      } else if (isCrouch) {
        state = moving ? 'crouch_walk' : 'crouch';
      } else if (moving) {
        state = sprint ? 'run' : 'walk';
      }
      // 이모트 오버라이드: 활성화 중이면 다른 애니메이션 차단
      if (emoteSlotRef.current) {
        state = emoteSlotRef.current;
      }
      animStateRef.current = state;

      const now = Date.now();
      if (now - lastSend.current > 50) {
        lastSend.current = now;
        onMove({
          x: posT.x, y: posT.y, z: posT.z,
          rotY: mesh.current?.rotation.y ?? 0,
          animState: state,
          vx: vel.x, vy: vel.y, vz: vel.z,  // 속도 — 원격 클라이언트 kinematic body가 사용
        });
      }
      } catch { /* Rapier 초기화 중 에러 무시 */ }
    }

    /* ── 카메라는 항상 lastPos를 따라감 (물리 초기화 여부 무관) ── */
    const p = lastPos.current;
    // 자세에 따른 카메라 높이 배수 — 서있음 1.0, 앉기 0.55, 엎드리기 0.18
    const postureScale = proneRef.current ? 0.18 : crouchRef.current ? 0.55 : 1.0;
    // 자유시점 모드 — 외부 카메라(WasdFly/Orbit)가 카메라 소유. Player 는 캐릭터 물리만 처리.
    if (!cameraControlEnabled) { /* skip camera positioning */ }
    else if (cameraMode === 'first') {
      // 1인칭: 캐릭터 눈 위치에 카메라.
      // 캐릭터는 autoNormalize 로 1.8m × modelScale 로 정규화됨, 발은 캡슐 바닥(p.y - 0.63)에 위치.
      // 눈높이 = 발 + 모델키 × 0.94 × postureScale (자세별 낮춤)
      const modelScale = Number((character?.appearance as Record<string, unknown> | undefined)?.modelScale) || 1.0;
      const eyeY = (p.y - 0.63) + 1.8 * modelScale * 0.94 * postureScale;
      camera.position.set(p.x, eyeY, p.z);
      const fx = -Math.sin(_mob.camH) * Math.cos(_mob.camV);
      // FPS 관례: 마우스 아래 = 시점 아래로. camV 는 3인칭 기준 (마우스 아래 = camV ↑ = 카메라 위)
      // 이라서 1인칭에선 부호 반전.
      const fy = -Math.sin(_mob.camV);
      const fz = -Math.cos(_mob.camH) * Math.cos(_mob.camV);
      camera.lookAt(p.x + fx * 10, eyeY + fy * 10, p.z + fz * 10);
    } else {
      // 3인칭: 캐릭터 뒤에서 거리 + 각도. 자세별로 카메라 높이 + 시선 높이도 낮춤.
      const dist = _mob.camDist;
      const tx = p.x + dist * Math.sin(_mob.camH) * Math.cos(_mob.camV);
      const yOffset = (dist <= 2.2 ? 0.25 : 0.5) * postureScale;
      const ty = p.y + dist * Math.sin(_mob.camV) + yOffset - (1 - postureScale) * 0.6;
      const tz = p.z + dist * Math.cos(_mob.camH) * Math.cos(_mob.camV);
      camera.position.set(tx, ty, tz);
      const lookY = (dist <= 2.2 ? p.y + 0.45 : p.y + 0.7) - (1 - postureScale) * 0.6;
      camera.lookAt(p.x, lookY, p.z);
    }

    /* ── 1인칭 grab — Unreal physics handle 흉내 ── */
    if (grabbedIdRef.current && cameraMode === 'first' && scriptBodyRefs) {
      const grabId = grabbedIdRef.current;
      const ref = scriptBodyRefs.current.get(grabId);
      let gb = ref?.body.current;
      // owner 가 본인이 아니게 됐으면:
      //   - 다른 플레이어 id 로 owner 가 바뀐 거면 → 누가 뺏어간 거 → 내 grab 자동 해제
      //   - owner 가 비어 있으면 (서버 release 등) → reclaim (내가 아직 들고 있으니 내 게)
      if (playerId && ownersRef && ownersRef.current.get(grabId) !== playerId) {
        const newOwner = ownersRef.current.get(grabId);
        if (newOwner) {
          // 다른 사람이 뺏어감 — 깔끔하게 해제 (spring force 안 보냄, 핑퐁 안 함)
          console.log('[ALP-SYNC] grab released — taken by', newOwner);
          grabbedIdRef.current = null;
          grabbedStateRef?.current.delete(grabId);
          onGrabRelease?.(grabId);
          if (playerId) {
            luaScripts?.current.get(grabId)?.callRelease(playerId);
            componentScripts?.current.get(grabId)?.forEach(({ vm }) => vm.callRelease(playerId));
          }
          gb = null;
        } else {
          // owner 비어있음 — 다시 가져옴 (200ms 쓰로틀)
          const now = performance.now();
          const last = grabReclaimAtRef.current.get(grabId) ?? 0;
          if (now - last > 200) {
            ownersRef.current.set(grabId, playerId);
            onGrabClaim?.(grabId);
            grabReclaimAtRef.current.set(grabId, now);
            console.log('[ALP-SYNC] grab reclaim', grabId);
          }
        }
      }
      if (gb) {
        // 카메라 forward
        const fx = -Math.sin(_mob.camH) * Math.cos(_mob.camV);
        const fy = -Math.sin(_mob.camV);
        const fz = -Math.cos(_mob.camH) * Math.cos(_mob.camV);
        const d  = grabDistRef.current;
        const cam = camera.position;
        const targetX = cam.x + fx * d;
        const targetY = cam.y + fy * d;
        const targetZ = cam.z + fz * d;
        const cur = gb.translation();
        // 속도 = displacement × K (스프링). 너무 강하면 진동 → K=12 정도가 부드러움
        const K = 12;
        gb.setLinvel({
          x: (targetX - cur.x) * K,
          y: (targetY - cur.y) * K,
          z: (targetZ - cur.z) * K,
        }, true);
        // 회전은 멈춤 (잡고 있는 동안 휘청 X)
        gb.setAngvel({ x: 0, y: 0, z: 0 }, true);
      } else {
        // 바디 사라짐 (destroy 등) → grab 해제
        grabbedIdRef.current = null;
        grabbedStateRef?.current.delete(grabId);
        onGrabRelease?.(grabId);
      }
    }

    /* ── 크로스헤어 색 변경: aim 감지 (1인칭 only) ── */
    if (onGrabUiChange && cameraMode === 'first') {
      let nextState: 'idle' | 'aim' | 'grab' = 'idle';
      if (grabbedIdRef.current) {
        nextState = 'grab';
      } else if (scriptBodyRefs) {
        // raycast 로 잡을 수 있는 오브젝트 조준 중인지 확인
        try {
          const cam = camera.position;
          const fx = -Math.sin(_mob.camH) * Math.cos(_mob.camV);
          const fy = -Math.sin(_mob.camV);
          const fz = -Math.cos(_mob.camH) * Math.cos(_mob.camV);
          const ray = new rapier.Ray({ x: cam.x, y: cam.y, z: cam.z }, { x: fx, y: fy, z: fz });
          const hit = rWorld.castRay(ray, 4.0, true, undefined, undefined, undefined, body.current ?? undefined);
          if (hit) {
            const hb = hit.collider?.parent();
            if (hb) {
              for (const [id, r] of scriptBodyRefs.current) {
                if (r.body.current === hb) {
                  // grabbable 인 것만 'aim' 상태로 표시
                  if (grabbableIdsRef?.current.has(id)) nextState = 'aim';
                  break;
                }
              }
            }
          }
        } catch { /* ignore */ }
      }
      if (nextState !== lastUiStateRef.current) {
        lastUiStateRef.current = nextState;
        onGrabUiChange(nextState);
      }
    } else if (onGrabUiChange && lastUiStateRef.current !== 'idle') {
      // 3인칭으로 돌아왔으면 강제 idle
      lastUiStateRef.current = 'idle';
      onGrabUiChange('idle');
    }
  });

  const appearance = (character.appearance ?? {}) as Record<string, string>;

  return (
    <RigidBody
      ref={body}
      colliders={false}
      mass={1}
      lockRotations
      position={spawnPos}
      linearDamping={0.6}
      onCollisionEnter={(p) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const objId = (p.other.rigidBodyObject as any)?.userData?.objectId;
        if (objId) onObjCollide?.(String(objId), 'enter');
      }}
      onCollisionExit={(p) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const objId = (p.other.rigidBodyObject as any)?.userData?.objectId;
        if (objId) onObjCollide?.(String(objId), 'exit');
      }}
    >
      <CapsuleCollider args={[PLAYER_CAPSULE_HALF_HEIGHT, PLAYER_CAPSULE_RADIUS]} />
      {/* 1인칭에서도 본인 메쉬 표시 — 아래 보면 다리/몸 보임.
          머리는 hideHead 로 본 스케일 0 / 블록 머리 미렌더 처리 */}
      <group ref={mesh} position={[0, PLAYER_MESH_Y, 0]}>
        <CharacterMesh appearance={appearance} animStateRef={animStateRef} emoteOneShotOverride={emoteOneShotOverride} hideHead={hideHeadOverride ?? (cameraMode === 'first')} />
      </group>
      {bubble && (
        <Html position={[0, 1.95, 0]} center>
          <div
            style={{
              minWidth: 96,
              maxWidth: 260,
              background: 'rgba(255,255,255,0.92)',
              color: '#111827',
              fontSize: 12,
              fontWeight: 700,
              padding: '7px 10px',
              borderRadius: 12,
              boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
              whiteSpace: 'normal',
              wordBreak: 'keep-all',
              overflowWrap: 'anywhere',
              lineHeight: 1.35,
              textAlign: 'center',
              pointerEvents: 'none',
            }}
          >
            {bubble.message}
          </div>
        </Html>
      )}
    </RigidBody>
  );
}

/* ── 원격 플레이어 ──────────────────────── */
function RemotePlayerMesh({ player, posesRef, bubble, castShadow }: {
  player: RemotePlayer;
  posesRef: React.RefObject<Map<string, PlayerPose>>;
  bubble?: ChatBubble;
  castShadow?: boolean;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bodyRef = useRef<any>(null);
  const meshRef = useRef<THREE.Group>(null);
  const animStateRef = useRef<AnimState>('idle');

  // 매 프레임: kinematic body를 네트워크 위치 + 속도 기반으로 이동
  // - kinematic은 다른 body에 의해 밀려나지 않음 → "공중에 뜨는" 현상 없음
  // - 위치 예측 (extrapolation) → 네트워크 지연 100ms 시각적으로 사라짐 → 박스 push 즉각적
  useFrame((_, dt) => {
    const pose = posesRef.current?.get(player.id);
    if (!pose) return;
    animStateRef.current = pose.animState ?? 'idle';
    const body = bodyRef.current;
    if (!body) return;

    const vx = pose.vx ?? 0;
    const vy = pose.vy ?? 0;
    const vz = pose.vz ?? 0;

    // ── Extrapolation: pose 받은 시각 이후 경과 시간만큼 vel로 위치 예측 ──
    // → 원격 캐릭터가 네트워크 지연 없이 "지금 있어야 할" 위치에 표시 → 박스 push 즉각
    const elapsed = Math.min(0.15, (Date.now() - pose.lastUpdate) / 1000);
    const targetX = pose.x + vx * elapsed;
    const targetY = pose.y + vy * elapsed;
    const targetZ = pose.z + vz * elapsed;

    const cur = body.translation();
    const dx = targetX - cur.x;
    const dy = targetY - cur.y;
    const dz = targetZ - cur.z;
    const distSq = dx*dx + dy*dy + dz*dz;

    if (distSq > 9) {
      // 끊김/텔레포트 → 즉시 snap
      body.setTranslation({ x: targetX, y: targetY, z: targetZ }, true);
    } else {
      // 속도로 이동 + 위치 보정 (한 프레임에 빠르게 수렴)
      // 보정 강도 0.25 → 한 프레임에 위치 차이의 25% 따라잡음
      // 정지 시 (vx=0)에도 위치만 보정 → 박스 push 없이 따라가기
      const correctF = 0.25;
      body.setNextKinematicTranslation({
        x: cur.x + vx * dt + dx * correctF,
        y: cur.y + vy * dt + dy * correctF,
        z: cur.z + vz * dt + dz * correctF,
      });
    }

    if (meshRef.current) {
      meshRef.current.rotation.y = lerpAngle(meshRef.current.rotation.y, pose.rotY, Math.min(1, 15 * dt));
    }
  });

  const appearance = ((player.character as Record<string, unknown>)?.appearance ?? {}) as Record<string, unknown>;
  const initialPose = posesRef.current?.get(player.id);
  const initPos: [number, number, number] = initialPose
    ? [initialPose.x, initialPose.y, initialPose.z]
    : [0, 1, 0];

  return (
    <RigidBody
      ref={bodyRef}
      type="kinematicPosition"
      colliders={false}
      position={initPos}
    >
      <CapsuleCollider args={[PLAYER_CAPSULE_HALF_HEIGHT, PLAYER_CAPSULE_RADIUS]} />
      <group ref={meshRef} position={[0, PLAYER_MESH_Y, 0]}>
        <CharacterMesh appearance={appearance} animStateRef={animStateRef} castShadow={castShadow ?? false} />
      </group>
      <Text
        position={[0, 1.8, 0]}
        fontSize={0.22}
        color="white"
        anchorX="center"
        outlineWidth={0.03}
        outlineColor="#000"
      >
        {player.username}
      </Text>
      {bubble && (
        <Html position={[0, 2.12, 0]} center>
          <div
            style={{
              minWidth: 96,
              maxWidth: 260,
              background: 'rgba(255,255,255,0.92)',
              color: '#111827',
              fontSize: 12,
              fontWeight: 700,
              padding: '7px 10px',
              borderRadius: 12,
              boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
              whiteSpace: 'normal',
              wordBreak: 'keep-all',
              overflowWrap: 'anywhere',
              lineHeight: 1.35,
              textAlign: 'center',
              pointerEvents: 'none',
            }}
          >
            {bubble.message}
          </div>
        </Html>
      )}
    </RigidBody>
  );
}

/* ── 기본 섬 월드 ──────────────────────── */
const ZONE_PADS = [
  { pos: [-22, 0, -18] as [number,number,number], color: '#60a5fa', label: '🎣 낚시터', size: [18, 0.5, 18] as [number,number,number] },
  { pos: [ 22, 0, -18] as [number,number,number], color: '#86efac', label: '🌾 농장',   size: [18, 0.5, 18] as [number,number,number] },
  { pos: [ 22, 0,  22] as [number,number,number], color: '#fca5a5', label: '⚔️ 던전',   size: [18, 0.5, 18] as [number,number,number] },
  { pos: [-22, 0,  22] as [number,number,number], color: '#fde68a', label: '🍳 요리',   size: [18, 0.5, 18] as [number,number,number] },
];

function Island() {
  return (
    <group>
      {/* 메인 잔디 */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[0, -0.5, 0]} receiveShadow>
          <boxGeometry args={[80, 1, 80]} />
          <meshStandardMaterial color="#4ade80" />
        </mesh>
      </RigidBody>

      {/* 바다 */}
      <mesh position={[0, -1.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[300, 300]} />
        <meshStandardMaterial color="#0ea5e9" transparent opacity={0.85} />
      </mesh>

      {/* 중앙 광장 */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[0, 0.05, 0]} receiveShadow>
          <cylinderGeometry args={[8, 8, 0.3, 12]} />
          <meshStandardMaterial color="#fef3c7" />
        </mesh>
      </RigidBody>

      {/* 구역 패드 */}
      {ZONE_PADS.map(({ pos, color, label, size }) => (
        <group key={label} position={pos}>
          <RigidBody type="fixed" colliders="cuboid">
            <mesh receiveShadow>
              <boxGeometry args={size} />
              <meshStandardMaterial color={color} />
            </mesh>
          </RigidBody>
          <Text
            position={[0, 2.5, 0]}
            fontSize={0.9}
            color="white"
            anchorX="center"
            outlineWidth={0.06}
            outlineColor="#000000"
          >
            {label}
          </Text>
        </group>
      ))}

      {/* 로우폴리 나무 (섬 외곽) */}
      {Array.from({ length: 30 }, (_, i) => {
        const a = (i / 30) * Math.PI * 2;
        const r = 30 + (i % 5) * 2;
        const x = Math.sin(a) * r;
        const z = Math.cos(a) * r;
        const h = 1.8 + (i % 4) * 0.5;
        return (
          <group key={i} position={[x, 0, z]}>
            <mesh position={[0, h * 0.5, 0]} castShadow>
              <cylinderGeometry args={[0.18, 0.25, h, 6]} />
              <meshStandardMaterial color="#92400e" />
            </mesh>
            <mesh position={[0, h + 1.1, 0]} castShadow>
              <coneGeometry args={[1.3 + (i % 3) * 0.3, 2.2, 6]} />
              <meshStandardMaterial color={`hsl(${118 + (i % 8) * 6},55%,${32 + (i % 4) * 6}%)`} />
            </mesh>
          </group>
        );
      })}

      {/* 구역 연결 길 */}
      {[0, 90, 180, 270].map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        return (
          <RigidBody key={i} type="fixed" colliders="cuboid">
            <mesh
              position={[Math.sin(rad) * 12, 0.08, Math.cos(rad) * 12]}
              rotation={[0, rad, 0]}
              receiveShadow
            >
              <boxGeometry args={[3, 0.2, 16]} />
              <meshStandardMaterial color="#fef3c7" />
            </mesh>
          </RigidBody>
        );
      })}
    </group>
  );
}

/* ── 유저 제작 월드 오브젝트 렌더링 ────── */
export type MaterialPreset = 'default' | 'wood' | 'metal' | 'stone' | 'glass' | 'plastic' | 'emissive';

interface UserMapObject {
  id: string;
  kind: 'cube' | 'sphere' | 'cylinder' | 'plane' | 'asset' | 'pointlight' | 'spotlight' | 'dirlight' | 'spawn';
  assetUrl?: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale:    [number, number, number];
  color:    string;
  hidden?:  boolean;   // Studio에서 숨김 처리된 오브젝트
  // 부모 오브젝트 id — 부모 transform 따라 자식이 움직임 (매 프레임 propagate).
  // lights/spawn 은 position 이 world 좌표 (flat 렌더). 일반 오브젝트는 local 좌표.
  parentId?: string;
  // 머티리얼/텍스처 (선택)
  material?:        MaterialPreset;
  materialColor?:   string;
  textureAlbedo?:    string;  // URL
  textureNormal?:    string;
  textureRoughness?: string;
  textureTilingX?:   number;
  textureTilingY?:   number;
  // 조명 전용
  lightColor?:     string;
  lightIntensity?: number;
  lightDistance?:  number;
  lightAngle?:     number;
  lightPenumbra?:  number;
  castShadow?:     boolean;
  // 물리
  physics?: 'none' | 'fixed' | 'dynamic';
  // 1인칭 grab 가능 여부 (레거시 — components 의 grab 으로 대체됨. 둘 다 인식)
  grabbable?: boolean;
  // Unity 스타일 컴포넌트 — Grab / AutoRotate 등 부착 가능
  components?: import('@/lib/world/components').ComponentInstance[];
  // JavaScript 스크립트
  script?: string;
}

/* 머티리얼 프리셋 정의 (PBR 파라미터) */
export const MATERIAL_PRESETS: Record<Exclude<MaterialPreset, 'default'>, {
  metalness: number; roughness: number; opacity?: number; transparent?: boolean;
  defaultColor: string; emissive?: string; emissiveIntensity?: number;
}> = {
  wood:     { defaultColor: '#8b6f47', metalness: 0,   roughness: 0.85 },
  metal:    { defaultColor: '#b0b0b0', metalness: 1.0, roughness: 0.3  },
  stone:    { defaultColor: '#7a7a7a', metalness: 0,   roughness: 0.95 },
  glass:    { defaultColor: '#a0c8e0', metalness: 0,   roughness: 0.05, opacity: 0.3, transparent: true },
  plastic:  { defaultColor: '#ffffff', metalness: 0,   roughness: 0.5  },
  emissive: { defaultColor: '#ffffff', metalness: 0,   roughness: 0.6, emissive: '#ffaa44', emissiveIntensity: 1.5 },
};

/* 텍스처 로딩 — 캐시/clone 없이 인스턴스별로 새로 로드 (needsUpdate 전파 보장) */
function loadFreshTexture(url: string, colorSpace: THREE.ColorSpace, tx: number, ty: number, onLoad: () => void): THREE.Texture {
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  const tex = loader.load(
    url,
    () => {
      tex.needsUpdate = true;
      onLoad();
    },
    undefined,
    (err) => console.error('[texture] 로드 실패:', url, err),
  );
  tex.colorSpace = colorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(tx, ty);
  return tex;
}

/* 오브젝트로부터 머티리얼 생성 */
function buildMaterial(obj: UserMapObject, fallbackColor?: string, onTextureLoad?: () => void): THREE.MeshStandardMaterial {
  const presetKey = obj.material && obj.material !== 'default' ? obj.material : null;
  const preset = presetKey ? MATERIAL_PRESETS[presetKey] : null;

  const baseColor = obj.materialColor || (preset ? preset.defaultColor : fallbackColor) || '#ffffff';
  const hasAnyTexture = obj.textureAlbedo || obj.textureNormal || obj.textureRoughness;

  const mat = new THREE.MeshStandardMaterial({
    // 텍스처 있으면 색상을 흰색으로 (텍스처 색 살리기)
    color:       hasAnyTexture && !obj.materialColor ? '#ffffff' : baseColor,
    metalness:   preset?.metalness ?? 0,
    roughness:   preset?.roughness ?? 0.5,
    opacity:     preset?.opacity ?? 1,
    transparent: preset?.transparent ?? false,
    emissive:    preset?.emissive ?? '#000000',
    emissiveIntensity: preset?.emissiveIntensity ?? 0,
  });

  const tilingX = obj.textureTilingX || 1;
  const tilingY = obj.textureTilingY || 1;
  const trigger = () => { mat.needsUpdate = true; onTextureLoad?.(); };

  if (obj.textureAlbedo) {
    mat.map = loadFreshTexture(obj.textureAlbedo, THREE.SRGBColorSpace, tilingX, tilingY, trigger);
  }
  if (obj.textureNormal) {
    mat.normalMap = loadFreshTexture(obj.textureNormal, THREE.NoColorSpace, tilingX, tilingY, trigger);
  }
  if (obj.textureRoughness) {
    mat.roughnessMap = loadFreshTexture(obj.textureRoughness, THREE.NoColorSpace, tilingX, tilingY, trigger);
  }
  return mat;
}

/** 머티리얼이 사용 중인 텍스처까지 모두 dispose */
function disposeMaterial(mat: THREE.MeshStandardMaterial) {
  mat.map?.dispose();
  mat.normalMap?.dispose();
  mat.roughnessMap?.dispose();
  mat.dispose();
}

function UserMapObjectMesh({ obj, scriptBodyRefs }: {
  obj: UserMapObject;
  scriptBodyRefs?: React.MutableRefObject<Map<string, {
    body: React.MutableRefObject<RapierBodyApi | null>;
    group: React.MutableRefObject<THREE.Group | null>;
  }>>;
}) {
  // 물리 모드 결정 — Physics 컴포넌트 우선, 없으면 레거시 obj.physics 필드.
  // 둘 다 없으면 'none' (물리/콜라이더 X)
  const physicsComp = obj.components?.find(c => c.type === 'physics');
  const physics: 'none' | 'fixed' | 'dynamic' = physicsComp
    ? (String(physicsComp.props?.mode ?? 'fixed') === 'dynamic' ? 'dynamic' : 'fixed')
    : (obj.physics ?? 'none');
  // 스크립트 있는 오브젝트는 ref를 registry에 등록
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bodyRef = useRef<any>(null);
  const groupRef = useRef<THREE.Group>(null);

  // 모든 visible 오브젝트 ref 등록 (멀티 동기화 + 스크립트 접근용)
  useEffect(() => {
    if (!scriptBodyRefs) return;
    scriptBodyRefs.current.set(obj.id, { body: bodyRef, group: groupRef });
    return () => { scriptBodyRefs.current.delete(obj.id); };
  }, [obj.id, scriptBodyRefs]);

  // position prop 변경 시 body 워프 — 호스트 스냅샷이 API customObjects 보다 늦게 도착해
  // customObjects 가 교체된 케이스를 처리. RigidBody position prop 은 초기값만 쓰이고
  // 이후 변경은 안 먹히기 때문에 명시적으로 setTranslation 호출.
  // (마운트 직후엔 RigidBody 가 이미 같은 위치에 만들어져 있어 사실상 no-op)
  const px = obj.position[0], py = obj.position[1], pz = obj.position[2];
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.setTranslation({ x: px, y: py, z: pz }, true);
      bodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
    } else if (groupRef.current) {
      groupRef.current.position.set(px, py, pz);
    }
  }, [px, py, pz]);

  const shape =
    obj.kind === 'sphere'   ? <sphereGeometry args={[0.5, 24, 16]} /> :
    obj.kind === 'cylinder' ? <cylinderGeometry args={[0.5, 0.5, 1, 16]} /> :
    obj.kind === 'plane'    ? <planeGeometry args={[1, 1]} /> :
                              <boxGeometry args={[1, 1, 1]} />;

  if (obj.kind === 'asset' && obj.assetUrl) {
    if (physics === 'none') {
      return (
        <group ref={groupRef} position={obj.position} rotation={obj.rotation} scale={obj.scale}>
          <UserAsset url={obj.assetUrl} matObj={obj} />
        </group>
      );
    }
    return (
      <RigidBody ref={bodyRef} type={physics} colliders={physics === 'dynamic' ? 'hull' : 'trimesh'} position={obj.position} rotation={obj.rotation} scale={obj.scale} userData={{ objectId: obj.id }}>
        <UserAsset url={obj.assetUrl} matObj={obj} />
      </RigidBody>
    );
  }

  if (physics === 'none') {
    return (
      <group ref={groupRef} position={obj.position} rotation={obj.rotation} scale={obj.scale}>
        <PrimitiveMesh obj={obj} shape={shape} />
      </group>
    );
  }
  const colliders = obj.kind === 'sphere' ? 'ball' : 'cuboid';
  return (
    <RigidBody ref={bodyRef} type={physics} colliders={colliders} position={obj.position} rotation={obj.rotation} scale={obj.scale} userData={{ objectId: obj.id }}>
      <PrimitiveMesh obj={obj} shape={shape} />
    </RigidBody>
  );
}

function PrimitiveMesh({ obj, shape }: { obj: UserMapObject; shape: React.ReactElement }) {
  const material = React.useMemo(() => {
    const mat = buildMaterial(obj, obj.color);
    if (obj.kind === 'plane') mat.side = THREE.DoubleSide;
    return mat;
  }, [obj.material, obj.materialColor, obj.color, obj.textureAlbedo, obj.textureNormal, obj.textureRoughness, obj.textureTilingX, obj.textureTilingY, obj.kind]);

  React.useEffect(() => () => disposeMaterial(material), [material]);

  return (
    <mesh castShadow receiveShadow material={material}>
      {shape}
    </mesh>
  );
}

function UserAsset({ url, matObj }: { url: string; matObj: UserMapObject }) {
  const [obj, setObj] = useState<THREE.Object3D | null>(null);
  // 원본 머티리얼 백업 (Map<mesh, originalMaterial>)
  const originalMats = useRef<Map<THREE.Mesh, THREE.Material | THREE.Material[]>>(new Map());

  useEffect(() => {
    let cancelled = false;
    // 범용 로더 — fbx / glb / gltf / dae / obj 지원
    import('@/lib/world/modelLoader').then(({ loadStaticModel }) =>
      loadStaticModel(url).then(model => {
        if (cancelled) return;
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const h = Math.max(size.x, size.y, size.z);
        if (h > 0) model.scale.multiplyScalar(1 / h);
        // 원본 머티리얼 저장
        originalMats.current.clear();
        model.traverse(c => {
          const m = c as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            originalMats.current.set(m, m.material);
          }
        });
        setObj(model);
      }).catch(err => console.error('[world] 모델 로드 실패:', err))
    );
    return () => { cancelled = true; };
  }, [url]);

  // 머티리얼/텍스처 변경 적용
  useEffect(() => {
    if (!obj) return;
    const hasOverride = matObj.material && matObj.material !== 'default'
      || matObj.materialColor || matObj.textureAlbedo
      || matObj.textureNormal || matObj.textureRoughness;

    if (!hasOverride) {
      // 원본 복원
      obj.traverse(c => {
        const m = c as THREE.Mesh;
        if (m.isMesh) {
          const orig = originalMats.current.get(m);
          if (orig) m.material = orig;
        }
      });
      return;
    }

    // 새 머티리얼로 교체
    const newMat = buildMaterial(matObj);
    obj.traverse(c => {
      const m = c as THREE.Mesh;
      if (m.isMesh) m.material = newMat;
    });
    return () => {
      // 정리 전에 원본으로 복원 (disposed 머티리얼이 mesh에 남지 않도록)
      obj.traverse(c => {
        const m = c as THREE.Mesh;
        if (m.isMesh) {
          const orig = originalMats.current.get(m);
          if (orig) m.material = orig;
        }
      });
      disposeMaterial(newMat);
    };
  }, [obj, matObj.material, matObj.materialColor, matObj.textureAlbedo, matObj.textureNormal, matObj.textureRoughness, matObj.textureTilingX, matObj.textureTilingY]);

  if (!obj) return null;
  return <primitive object={obj} />;
}

/* ── 메인 캔버스 ────────────────────────── */
interface WorldCanvasProps {
  character: Record<string, unknown>;
  playerId: string;
  players: Record<string, RemotePlayer>;
  posesRef: React.RefObject<Map<string, PlayerPose>>;
  chatBubbles: Record<string, ChatBubble>;
  onMove: (pos: { x: number; y: number; z: number; rotY: number; animState?: AnimState; vx?: number; vy?: number; vz?: number }) => void;
  customObjects?: UserMapObject[];
  sceneSettings?: Record<string, unknown>;
  graphics?: GraphicsSettings;
  chatInputActive?: boolean;
  emoteSlot?: string | null;
  emoteOneShotOverride?: string[];
  // Lua 스크립팅
  sendScriptEvent?: (objectId: string, event: string, data: Record<string, unknown>, toId?: string) => void;
  scriptEventRef?: React.RefObject<((objectId: string, event: string, data: Record<string, unknown>, fromId: string) => void) | null>;
  // 오브젝트 상태 동기화
  sendObjectStates?: (states: Array<{ id: string; pos: [number, number, number]; rot: [number, number, number]; scl: [number, number, number]; vis: boolean; vel?: [number, number, number]; grabbedBy?: string | null }>) => void;
  objectStatesRef?: React.RefObject<((states: Array<{ id: string; pos: [number, number, number]; rot: [number, number, number]; scl: [number, number, number]; vis: boolean; vel?: [number, number, number]; grabbedBy?: string | null }>, fromId: string) => void) | null>;
  // 방장 (가장 일찍 들어온 사람) — 본인이 호스트일 때만 broadcast
  hostId?: string | null;
  // 오브젝트 소유권 (Unity NetworkObject 스타일)
  sendObjClaim?: (objectId: string) => void;
  sendObjRelease?: (objectId: string) => void;
  objectOwnerRef?: React.RefObject<((objectId: string, ownerId: string | null) => void) | null>;
  // 런타임 spawn/destroy 동기화
  sendObjSpawn?: (spec: import('@/lib/world/useGameSocket').RuntimeObjectSpec) => void;
  sendObjDestroy?: (objectId: string) => void;
  objSpawnRef?: React.RefObject<((spec: import('@/lib/world/useGameSocket').RuntimeObjectSpec) => void) | null>;
  objDestroyRef?: React.RefObject<((objectId: string) => void) | null>;
  // 호스트가 자기 시점 씬 스냅샷 (라이브 body 위치 포함) 을 DO 에 등록 → 신규 입장자가 그대로 받아 구성
  sendSceneRegister?: (objects: unknown[]) => void;
}

/* ── 모바일 컨트롤 컴포넌트 (Canvas 완전 바깥 — drei Html 스케일 영향 없음) ── */
function MobileControls({ inputLocked }: { inputLocked: boolean }) {
  const [joystickKnob, setJoystickKnob] = useState({ x: 0, y: 0, active: false });
  const [mobileSprinting, setMobileSprinting] = useState(false);

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', userSelect: 'none', zIndex: 999 }}>

      {/* 카메라 룩 + 핀치 줌: 전체화면 배경 */}
      <div
        style={{ position: 'absolute', inset: 0, pointerEvents: 'auto', touchAction: 'none' }}
        onPointerDown={(e) => {
          if (inputLocked) return;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          if (_mob.lookTouch.active && !_mob.pinch.active) {
            _mob.pinch.active = true; _mob.pinch.id2 = e.pointerId;
            _mob.pinch.x1 = _mob.lookTouch.lastX; _mob.pinch.y1 = _mob.lookTouch.lastY;
            _mob.pinch.x2 = e.clientX; _mob.pinch.y2 = e.clientY;
            _mob.pinch.lastDist = Math.hypot(e.clientX - _mob.lookTouch.lastX, e.clientY - _mob.lookTouch.lastY);
            return;
          }
          if (!_mob.lookTouch.active) {
            _mob.lookTouch.active = true; _mob.lookTouch.pointerId = e.pointerId;
            _mob.lookTouch.lastX = e.clientX; _mob.lookTouch.lastY = e.clientY;
          }
        }}
        onPointerMove={(e) => {
          if (inputLocked) return;
          if (_mob.pinch.active) {
            if (e.pointerId === _mob.lookTouch.pointerId) { _mob.pinch.x1 = e.clientX; _mob.pinch.y1 = e.clientY; }
            else if (e.pointerId === _mob.pinch.id2)      { _mob.pinch.x2 = e.clientX; _mob.pinch.y2 = e.clientY; }
            const dist = Math.hypot(_mob.pinch.x2 - _mob.pinch.x1, _mob.pinch.y2 - _mob.pinch.y1);
            _mob.camDist = Math.max(1.1, Math.min(14, _mob.camDist - (dist - _mob.pinch.lastDist) * 0.018));
            _mob.pinch.lastDist = dist;
            return;
          }
          if (!_mob.lookTouch.active || _mob.lookTouch.pointerId !== e.pointerId) return;
          const dx = e.clientX - _mob.lookTouch.lastX;
          const dy = e.clientY - _mob.lookTouch.lastY;
          _mob.lookTouch.lastX = e.clientX; _mob.lookTouch.lastY = e.clientY;
          _mob.camH -= dx * 0.005;
          _mob.camV = Math.max(-1.1, Math.min(1.3, _mob.camV + dy * 0.005));
        }}
        onPointerUp={(e) => {
          if (_mob.pinch.active) {
            if (e.pointerId === _mob.pinch.id2) {
              _mob.pinch.active = false; _mob.pinch.id2 = -1;
              _mob.lookTouch.lastX = _mob.pinch.x1; _mob.lookTouch.lastY = _mob.pinch.y1;
            } else if (e.pointerId === _mob.lookTouch.pointerId) {
              _mob.lookTouch.pointerId = _mob.pinch.id2;
              _mob.lookTouch.lastX = _mob.pinch.x2; _mob.lookTouch.lastY = _mob.pinch.y2;
              _mob.pinch.active = false; _mob.pinch.id2 = -1;
            }
            return;
          }
          if (_mob.lookTouch.pointerId !== e.pointerId) return;
          _mob.lookTouch.active = false; _mob.lookTouch.pointerId = -1;
        }}
        onPointerCancel={(e) => {
          if (_mob.pinch.active) { _mob.pinch.active = false; _mob.pinch.id2 = -1; }
          if (_mob.lookTouch.pointerId === e.pointerId) { _mob.lookTouch.active = false; _mob.lookTouch.pointerId = -1; }
        }}
      />

      {/* 조이스틱 (왼쪽 하단) */}
      <div
        style={{
          position: 'absolute', left: 20, bottom: 20,
          width: 148, height: 148, borderRadius: '50%',
          background: 'rgba(10,15,30,0.40)', border: '2px solid rgba(255,255,255,0.22)',
          pointerEvents: 'auto', touchAction: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (inputLocked) return;
          _mob.moveTouch.active = true; _mob.moveTouch.pointerId = e.pointerId;
          _mob.moveTouch.x = 0; _mob.moveTouch.y = 0;
          setJoystickKnob({ x: 0, y: 0, active: true });
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          e.stopPropagation();
          if (inputLocked || !_mob.moveTouch.active || _mob.moveTouch.pointerId !== e.pointerId) return;
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const dx = e.clientX - (rect.left + rect.width / 2);
          const dy = e.clientY - (rect.top + rect.height / 2);
          const r = rect.width * 0.42;
          const len = Math.hypot(dx, dy);
          const c = len > r ? r / len : 1;
          const nx = (dx * c) / r; const ny = (dy * c) / r;
          _mob.moveTouch.x = nx; _mob.moveTouch.y = ny;
          setJoystickKnob({ x: nx, y: ny, active: true });
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          if (_mob.moveTouch.pointerId !== e.pointerId) return;
          _mob.moveTouch.active = false; _mob.moveTouch.x = 0; _mob.moveTouch.y = 0; _mob.moveTouch.pointerId = -1;
          setJoystickKnob({ x: 0, y: 0, active: false });
        }}
        onPointerCancel={(e) => {
          e.stopPropagation();
          if (_mob.moveTouch.pointerId !== e.pointerId) return;
          _mob.moveTouch.active = false; _mob.moveTouch.x = 0; _mob.moveTouch.y = 0; _mob.moveTouch.pointerId = -1;
          setJoystickKnob({ x: 0, y: 0, active: false });
        }}
      >
        <div style={{ position: 'absolute', width: '70%', height: 1, background: 'rgba(255,255,255,0.12)' }} />
        <div style={{ position: 'absolute', height: '70%', width: 1, background: 'rgba(255,255,255,0.12)' }} />
        <div style={{
          position: 'absolute', width: 56, height: 56, borderRadius: '50%',
          background: joystickKnob.active ? 'rgba(99,102,241,0.75)' : 'rgba(255,255,255,0.30)',
          border: `2px solid ${joystickKnob.active ? 'rgba(165,180,252,0.9)' : 'rgba(255,255,255,0.55)'}`,
          boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
          transform: `translate(${joystickKnob.x * 46}px, ${joystickKnob.y * 46}px)`,
          transition: joystickKnob.active ? 'none' : 'transform 0.12s ease, background 0.1s',
          pointerEvents: 'none',
        }} />
      </div>

      {/* 스프린트 토글 */}
      <button type="button"
        onPointerDown={e => e.stopPropagation()}
        onClick={() => { _mob.sprint = !_mob.sprint; setMobileSprinting(_mob.sprint); }}
        style={{
          position: 'absolute', left: 20, bottom: 180, width: 64, height: 36, borderRadius: 18,
          border: `2px solid ${mobileSprinting ? 'rgba(251,191,36,0.9)' : 'rgba(255,255,255,0.25)'}`,
          background: mobileSprinting ? 'rgba(251,191,36,0.35)' : 'rgba(10,15,30,0.45)',
          color: mobileSprinting ? '#fbbf24' : 'rgba(255,255,255,0.7)',
          fontSize: 11, fontWeight: 700, pointerEvents: 'auto', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >{mobileSprinting ? '⚡ ON' : '⚡ OFF'}</button>

      {/* 점프 버튼 */}
      <button type="button"
        onPointerDown={e => { e.stopPropagation(); if (!inputLocked) _mob.jumpQueued = true; }}
        style={{
          position: 'absolute', right: 24, bottom: 24, width: 80, height: 80, borderRadius: '50%',
          border: '2px solid rgba(99,102,241,0.85)', background: 'rgba(79,70,229,0.50)',
          color: '#fff', fontSize: 32, fontWeight: 700, pointerEvents: 'auto', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(79,70,229,0.4)',
        }}
      >↑</button>

    </div>
  );
}

export default function WorldCanvas({ character, playerId, players, posesRef, chatBubbles, onMove, customObjects, sceneSettings, graphics = DEFAULT_SETTINGS, chatInputActive = false, emoteSlot, emoteOneShotOverride, sendScriptEvent, scriptEventRef, sendObjectStates, objectStatesRef, hostId, sendObjClaim, sendObjRelease, objectOwnerRef, sendObjSpawn, sendObjDestroy, objSpawnRef, objDestroyRef, sendSceneRegister }: WorldCanvasProps) {
  const shadowsEnabled = graphics.shadowSize > 0;
  const shadowMapSize: [number, number] = [graphics.shadowSize || 1024, graphics.shadowSize || 1024];
  const ss = sceneSettings ?? {};
  const ambientIntensity = typeof ss.lightAmbient === 'number' ? ss.lightAmbient : 0.04;
  const dirIntensity     = typeof ss.lightDir     === 'number' ? ss.lightDir     : 0.0;
  const showSky          = typeof ss.skyEnabled   === 'boolean' ? ss.skyEnabled  : false;
  // HDRI 환경맵 — Studio 의 sceneSettings 에서 받음. 셋 다 옵션.
  const hdriPreset       = typeof ss.hdriPreset === 'string' ? ss.hdriPreset as string : 'none';
  const hdriUrl          = typeof ss.hdriUrl === 'string' ? ss.hdriUrl as string : '';
  const hdriBackground   = typeof ss.hdriBackground === 'boolean' ? ss.hdriBackground : false;
  const exposure         = typeof ss.exposure === 'number' ? ss.exposure : 0.7;
  const hdriIntensity    = typeof ss.hdriIntensity === 'number' ? ss.hdriIntensity : 1.0;
  // 맵 물리 설정 — 중력 Y (기본 -22), 점프력 (기본 7). 무중력은 gravityY=0.
  const gravityY         = typeof ss.gravityY === 'number' ? ss.gravityY : -22;
  const jumpPower        = typeof ss.jumpPower === 'number' ? ss.jumpPower : 7;
  const lightObjects = (customObjects ?? []).filter(
    (o: UserMapObject) => o.kind === 'pointlight' || o.kind === 'spotlight' || o.kind === 'dirlight'
  );
  // 스폰 포인트 — 여러 개 있으면 랜덤 선택. 없으면 기본 [0, 4, 0].
  const spawnObjects = (customObjects ?? []).filter((o: UserMapObject) => o.kind === 'spawn' && !o.hidden);
  // 컴포넌트 마운트 시 1회만 픽 (재렌더 시 점프 방지) — useMemo with stable dep
  const spawnPick = useMemo(() => {
    if (spawnObjects.length === 0) return { pos: [0, 4, 0] as [number, number, number], rotY: 0 };
    const pick = spawnObjects[Math.floor(Math.random() * spawnObjects.length)];
    return { pos: pick.position, rotY: pick.rotation[1] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spawnObjects.map(s => s.id).join(',')]);

  // ── JS 스크립트 관리 ──────────────────────────────────────
  // objectId → JsScript 인스턴스 (자체 구현 인터프리터). selected.script (메인 스크립트) 용.
  const luaScripts = useRef<Map<string, import('@/lib/world/jsRuntime').JsScript>>(new Map());
  // 유저 정의 컴포넌트 — objectId → 부착된 VM 들 (오브젝트당 여러 부착 가능)
  const componentScripts = useRef<Map<string, Array<{ vm: import('@/lib/world/jsRuntime').JsScript; key: string }>>>(new Map());
  // 유저 정의 컴포넌트 코드 캐시 — id → ScriptComponent (코드/이름)
  const scriptComponentDefsRef = useRef<Map<string, import('@/lib/api').ScriptComponent>>(new Map());
  // 컴포넌트 코드 변경 감지용 (state — 변경되면 VM 재생성 트리거)
  const [scriptComponentsLoaded, setScriptComponentsLoaded] = useState(0);
  // 스크립트 컴포넌트 코드 fetch (월드 마운트 시 1회).
  // - 공식 컴포넌트 (모든 유저, 비로그인도 OK)
  // - 본인 컴포넌트 (로그인 시)
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { api, session } = require('@/lib/api') as typeof import('@/lib/api');
    const tok = session.getToken();
    const tasks: Array<Promise<unknown>> = [];
    // 공식 컴포넌트는 비로그인도 fetch
    tasks.push(
      api.listOfficialScriptComponents(tok || undefined)
        .then(r => { for (const c of r.components) scriptComponentDefsRef.current.set(c.id, c); })
        .catch(e => console.warn('[ScriptComponents] official world fetch fail', e))
    );
    if (tok) {
      tasks.push(
        api.listMyScriptComponents(tok)
          .then(r => { for (const c of r.components) scriptComponentDefsRef.current.set(c.id, c); })
          .catch(e => console.warn('[ScriptComponents] my world fetch fail', e))
      );
    }
    Promise.all(tasks).then(() => setScriptComponentsLoaded(n => n + 1));
  }, []);
  // objectId → THREE.Light 인스턴스 (조명 color/intensity 제어용)
  const lightRefs = useRef<Map<string, THREE.Light>>(new Map());
  // 런타임 동적 생성된 오브젝트 (world.spawn 으로 만들어진 것 — 저장 안 됨, 로컬 전용)
  const [runtimeObjects, setRuntimeObjects] = useState<UserMapObject[]>([]);
  // 스크립트 콜백에서 stale state 피하려는 최신 ref
  const runtimeObjectsRef = useRef<UserMapObject[]>([]);
  useEffect(() => { runtimeObjectsRef.current = runtimeObjects; }, [runtimeObjects]);
  // parent transform propagation 용 — customObjects + runtime 합쳐서 매 렌더 ref 갱신
  const allObjectsRef = useRef<UserMapObject[]>([]);
  useEffect(() => {
    allObjectsRef.current = [...(customObjects ?? []), ...runtimeObjects];
  }, [customObjects, runtimeObjects]);
  // 1인칭에서 잡을 수 있는 오브젝트 id 셋 — components 에 'grab' 있거나 grabbable 플래그(레거시) true
  const grabbableIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const grab = new Set<string>();
    const check = (o: UserMapObject) => {
      const hasGrab = o.components?.some(c => c.type === 'grab') || o.grabbable;
      if (hasGrab) grab.add(o.id);
    };
    customObjects?.forEach(check);
    runtimeObjects.forEach(check);
    grabbableIdsRef.current = grab;
  }, [customObjects, runtimeObjects]);
  // objectId → { body: Rapier rigid body ref, group: Three.js group ref }
  const scriptBodyRefs = useRef<Map<string, {
    body: React.MutableRefObject<RapierBodyApi | null>;
    group: React.MutableRefObject<THREE.Group | null>;
  }>>(new Map());
  const worldElapsed = useRef(0); // 월드 시작 후 경과 시간 (초)
  const playersRef = useRef(players);
  useEffect(() => { playersRef.current = players; }, [players]);

  // 스크립트 이벤트 수신 → 해당 오브젝트 VM에 전달
  useEffect(() => {
    if (!scriptEventRef) return;
    scriptEventRef.current = (objectId, event, data, fromId) => {
      luaScripts.current.get(objectId)?.callNetEvent(event, data, fromId);
      // user 컴포넌트 VM 들에도 dispatch
      componentScripts.current.get(objectId)?.forEach(({ vm }) => vm.callNetEvent(event, data, fromId));
    };
    return () => { if (scriptEventRef.current) scriptEventRef.current = null; };
  }, [scriptEventRef]);

  // ── 수신: velocity + timestamp 저장 → lerp 시 extrapolation으로 네트워크 지연 보상 ──
  const syncTargets = useRef<Map<string, { pos: [number, number, number]; rot: [number, number, number]; scl: [number, number, number]; vis: boolean; vel: [number, number, number]; recvTime: number }>>(new Map());
  // 다른 플레이어가 1인칭 grab 으로 들고 있는 오브젝트 — objectId → grabberPlayerId.
  // collision 충돌-기반 ownership 탈취를 막는 용도 (grab 중인 오브젝트가 캐릭터에 닿아도 owner 빼앗지 않음)
  const remoteGrabbedByRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    if (!objectStatesRef) return;
    objectStatesRef.current = (states) => {
      const now = performance.now();
      if (Math.random() < 0.05) console.log('[ALP-SYNC] recv states', states.length, states.map(s => s.id));
      for (const s of states) {
        // grabbedBy 추적 — broadcast 마다 갱신 (null/없음 = 안 들고 있음)
        if (s.grabbedBy) remoteGrabbedByRef.current.set(s.id, s.grabbedBy);
        else remoteGrabbedByRef.current.delete(s.id);
        // 본인이 owner인 오브젝트의 stale broadcast는 무시 (옛 host의 마지막 broadcast 등)
        if (ownersRef.current.get(s.id) === playerId) continue;
        syncTargets.current.set(s.id, {
          pos: s.pos, rot: s.rot, scl: s.scl, vis: s.vis,
          vel: s.vel ?? [0, 0, 0],
          recvTime: now,
        });
      }
    };
    return () => { if (objectStatesRef.current) objectStatesRef.current = null; };
  }, [objectStatesRef, playerId]);

  // ── 오브젝트 소유권 (Unity NetworkObject 스타일) ──────────────
  const ownersRef = useRef<Map<string, string>>(new Map()); // objectId → ownerPlayerId
  // 1인칭 grab 상태 — objectId → grabberPlayerId (로컬 클라 기준)
  // Player 가 grab/release 시 업데이트, JsObjectAPI 의 isGrabbed/grabber 가 읽음
  const grabbedStateRef = useRef<Map<string, string>>(new Map());
  const touchingRef = useRef<Set<string>>(new Set());        // 현재 닿아있는 오브젝트
  const releaseTimerRef = useRef<Map<string, number>>(new Map()); // 충돌 종료 후 해제 예정 시각

  useEffect(() => {
    if (!objectOwnerRef) return;
    objectOwnerRef.current = (objectId, ownerId) => {
      console.log('[ALP-SYNC] owner changed', objectId, '→', ownerId, '(me:', playerId, ')');
      if (ownerId) ownersRef.current.set(objectId, ownerId);
      else ownersRef.current.delete(objectId);
    };
    return () => { if (objectOwnerRef.current) objectOwnerRef.current = null; };
  }, [objectOwnerRef, playerId]);

  // 다른 클라가 spawn 한 오브젝트 수신 → 본인 runtimeObjects 에 추가 (중복 방지)
  useEffect(() => {
    if (!objSpawnRef) return;
    objSpawnRef.current = (spec) => {
      setRuntimeObjects(prev => {
        if (prev.find(o => o.id === spec.id)) return prev; // 이미 있음
        // RuntimeObjectSpec → UserMapObject (kind 좁히기)
        const obj: UserMapObject = {
          id: spec.id,
          kind: (spec.kind as UserMapObject['kind']) || 'cube',
          assetUrl: spec.assetUrl,
          position: spec.position,
          rotation: spec.rotation,
          scale: spec.scale,
          color: spec.color,
          physics: spec.physics,
          material: spec.material as UserMapObject['material'],
          materialColor: spec.materialColor,
        };
        return [...prev, obj];
      });
    };
    return () => { if (objSpawnRef.current) objSpawnRef.current = null; };
  }, [objSpawnRef]);

  // 다른 클라가 destroy 한 오브젝트 수신 → 본인 화면에서도 제거
  useEffect(() => {
    if (!objDestroyRef) return;
    objDestroyRef.current = (objectId) => {
      setRuntimeObjects(prev => prev.filter(o => o.id !== objectId));
      scriptBodyRefs.current.delete(objectId);
      syncTargets.current.delete(objectId);
      ownersRef.current.delete(objectId);
    };
    return () => { if (objDestroyRef.current) objDestroyRef.current = null; };
  }, [objDestroyRef]);

  // ── world.spawn / obj.destroy 헬퍼 (멀티 동기화) ──
  /** 스크립트에서 world.spawn(opts) 호출 시 새 오브젝트 추가. id 반환.
   *  본인 클라에 즉시 추가하고 서버에 broadcast → 다른 클라가 수신해서 자기 화면에도 생성.
   *  본인이 spawner = 자동 owner (물리 권한). */
  const spawnObject = useCallback((opts: Partial<UserMapObject>): string => {
    const id = `rt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const obj: UserMapObject = {
      id,
      kind:     opts.kind     ?? 'cube',
      assetUrl: opts.assetUrl,
      position: opts.position ?? [0, 5, 0],
      rotation: opts.rotation ?? [0, 0, 0],
      scale:    opts.scale    ?? [1, 1, 1],
      color:    opts.color    ?? '#ffffff',
      physics:  opts.physics  ?? 'dynamic',
      material: opts.material,
      materialColor: opts.materialColor,
    };
    setRuntimeObjects(prev => [...prev, obj]);
    // optimistic ownership — spawner 가 본인이라고 미리 마킹 (서버 응답 안 기다리고 broadcast loop 가 즉시 권한자로 동작)
    ownersRef.current.set(id, playerId);
    // 서버에 알림 (다른 클라 수신해서 본인 화면에도 생성)
    sendObjSpawn?.({
      id, kind: obj.kind,
      assetUrl: obj.assetUrl,
      position: obj.position, rotation: obj.rotation, scale: obj.scale,
      color: obj.color, physics: obj.physics,
      material: obj.material, materialColor: obj.materialColor,
    });
    return id;
  }, [playerId, sendObjSpawn]);

  /** id로 런타임 오브젝트 제거. customObjects(저장된 것)는 안전 상 보호. */
  const destroyObject = useCallback((id: string): void => {
    setRuntimeObjects(prev => prev.filter(o => o.id !== id));
    scriptBodyRefs.current.delete(id);
    syncTargets.current.delete(id);
    ownersRef.current.delete(id);
    sendObjDestroy?.(id);
  }, [sendObjDestroy]);

  // Player 의 1인칭 grab(E) 콜백 — 즉시 owner 잡고 syncTargets 비우고 서버에 claim.
  // (충돌 ownership 과 같은 흐름. grab 은 가만히 있는 오브젝트도 잡으므로 충돌 경로만으론 부족함.)
  const onGrabClaim = useCallback((objectId: string) => {
    if (!playerId) return;
    console.log('[ALP-SYNC] grab attempt', objectId, 'currentOwner:', ownersRef.current.get(objectId), 'me:', playerId);
    // grab 은 충돌과 달리 항상 ownership 강제 — 이미 본인 owner 여도 sendObjClaim 으로 서버에 재확인 보냄.
    // 이전엔 "이미 내거면 skip" 했지만, 그 경우 다른 클라가 옛 ownership 정보를 가지고 있으면 sync 안 됨.
    ownersRef.current.set(objectId, playerId);
    syncTargets.current.delete(objectId);
    sendObjClaim?.(objectId);
    console.log('[ALP-SYNC] grab claimed', objectId);
    // grab 중에는 1.5s 자동 해제 타이머가 끼어들지 못하게 touching 으로 표시
    touchingRef.current.add(objectId);
    releaseTimerRef.current.delete(objectId);
  }, [playerId, sendObjClaim]);

  const onGrabRelease = useCallback((objectId: string) => {
    console.log('[ALP-SYNC] grab release', objectId);
    // grab 종료 — 1.5s 후 자동 release (충돌 grace period 와 동일 흐름)
    touchingRef.current.delete(objectId);
    releaseTimerRef.current.set(objectId, Date.now() + 1500);
  }, []);

  // Player 충돌 콜백 — Optimistic Ownership: 서버 확인 안 기다리고 즉시 본인 owner
  const onObjCollide = useCallback((objectId: string, type: 'enter' | 'exit') => {
    if (type === 'enter') {
      touchingRef.current.add(objectId);
      releaseTimerRef.current.delete(objectId);
      console.log('[ALP-SYNC] collide enter', objectId, 'prev owner:', ownersRef.current.get(objectId), 'me:', playerId);
      // 누가 1인칭 grab 중이면 ownership 빼앗지 않음 (grabber 가 권위자 유지)
      const remoteGrabber = remoteGrabbedByRef.current.get(objectId);
      const selfGrabbing  = grabbedStateRef.current.has(objectId);
      if (remoteGrabber && remoteGrabber !== playerId) {
        console.log('[ALP-SYNC] skip claim — grabbed by', remoteGrabber);
        return;
      }
      if (selfGrabbing) return; // 본인이 들고 있음 — 이미 owner
      if (ownersRef.current.get(objectId) !== playerId) {
        // 1) 로컬에서 즉시 본인을 owner로 간주
        ownersRef.current.set(objectId, playerId);
        // 2) syncTargets에서 이 오브젝트 제거 — useFrame이 옛 broadcast 데이터를 적용하는 것 방지
        //    (rubber-banding의 진짜 원인: 충돌 발생 시 syncTargets에 이미 옛 데이터 있음)
        syncTargets.current.delete(objectId);
        // 3) 서버에 claim 전송
        sendObjClaim?.(objectId);
        console.log('[ALP-SYNC] claimed', objectId);
      }
    } else {
      touchingRef.current.delete(objectId);
      releaseTimerRef.current.set(objectId, Date.now() + 1500);
    }
  }, [playerId, sendObjClaim]);

  // 만료된 소유권 해제 (충돌 종료 후 1.5초 grace period)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      for (const [objectId, time] of releaseTimerRef.current) {
        if (now > time) {
          releaseTimerRef.current.delete(objectId);
          if (ownersRef.current.get(objectId) === playerId && !touchingRef.current.has(objectId)) {
            sendObjRelease?.(objectId);
          }
        }
      }
    }, 500);
    return () => clearInterval(interval);
  }, [playerId, sendObjRelease]);

  // ── 송신: 호스트 + 본인이 소유한 오브젝트만 broadcast ──
  const isHost = !!hostId && hostId === playerId;
  // 스크립트 closure 에서 항상 최신 isHost 값 읽으려고 ref 로 유지
  const isHostRef = useRef(isHost);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);

  // 입장자가 정확한 위치 받게 하려고 — 호스트는 1초에 한 번씩 모든 소유 오브젝트를
  // 강제 broadcast (move threshold 무시). DO 가 캐시해서 신규 입장자에게 init 으로 전달.
  // 비용: 정적 씬도 초당 1회 broadcast. 오브젝트 ~수십 개면 무시 가능.
  const forceBroadcastTickRef = useRef(0);

  // 호스트 정보 도착 후 onStart 호출 (도착 전엔 world.isHost() 가 잘못된 값 반환)
  // pendingStartRef: VM 만들어졌지만 아직 onStart 안 부른 것들
  const pendingStartRef = useRef<Set<import('@/lib/world/jsRuntime').JsScript>>(new Set());
  useEffect(() => {
    if (hostId === null) return; // 아직 호스트 정보 없음
    for (const vm of pendingStartRef.current) vm.callStart();
    pendingStartRef.current.clear();
  }, [hostId]);
  const lastBroadcastPos = useRef<Map<string, [number, number, number]>>(new Map());
  const lastVelocityNonZeroRef = useRef<Map<string, boolean>>(new Map());
  // 마지막으로 broadcast 한 grabbedBy 값 — state 변화 감지용 (잡기 시작/놓기 순간 강제 broadcast)
  const lastBroadcastGrabbedByRef = useRef<Map<string, string | null>>(new Map());
  // 마지막으로 broadcast 한 회전 — 회전만 바뀌는 경우 (AutoRotate 등) 감지용
  const lastBroadcastRotRef = useRef<Map<string, [number, number, number]>>(new Map());
  useEffect(() => {
    if (!sendObjectStates || !customObjects) return;
    const MOVE_THRESHOLD = 0.005;
    const interval = setInterval(() => {
      const states: Array<{ id: string; pos: [number, number, number]; rot: [number, number, number]; scl: [number, number, number]; vis: boolean; vel?: [number, number, number]; grabbedBy?: string | null }> = [];
      // 40 tick (25ms × 40 = 1초) 마다 강제 broadcast — DO 캐시 갱신용
      forceBroadcastTickRef.current = (forceBroadcastTickRef.current + 1) % 40;
      const forceAll = forceBroadcastTickRef.current === 0;
      // 원본 customObjects + 런타임 spawn된 것 모두 broadcast 대상 (runtimeObjects는 ref로 읽어 stale 회피)
      for (const obj of [...customObjects, ...runtimeObjectsRef.current]) {
        if (obj.hidden) continue;
        if (obj.kind === 'pointlight' || obj.kind === 'spotlight' || obj.kind === 'dirlight') continue;

        // ── 소유권 체크 ──
        // 내가 소유자: broadcast (본인 push 시 즉각 반영)
        // 소유자 없음 + 내가 호스트: broadcast (정적/물리만 오브젝트 fallback)
        // 그 외: skip
        const owner = ownersRef.current.get(obj.id);
        const iOwn = owner === playerId;
        const iHostFallback = !owner && isHost;
        if (!iOwn && !iHostFallback) continue;

        const ref = scriptBodyRefs.current.get(obj.id);
        if (!ref) continue;
        const body  = ref.body.current;
        const group = ref.group.current;
        let pos: [number, number, number];
        let rot: [number, number, number];
        let scl: [number, number, number] = obj.scale;
        let vis = true;
        let vel: [number, number, number] | undefined;
        if (body) {
          const t = body.translation();
          const r = body.rotation();
          const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w));
          pos = [t.x, t.y, t.z]; rot = [e.x, e.y, e.z];
          const v = body.linvel();
          // 속도가 매우 작으면 0으로 clamp → 수신측 extrapolation drift 방지
          const SMALL = 0.1;
          vel = [
            Math.abs(v.x) < SMALL ? 0 : v.x,
            Math.abs(v.y) < SMALL ? 0 : v.y,
            Math.abs(v.z) < SMALL ? 0 : v.z,
          ];
        } else if (group) {
          pos = [group.position.x, group.position.y, group.position.z];
          rot = [group.rotation.x, group.rotation.y, group.rotation.z];
          scl = [group.scale.x, group.scale.y, group.scale.z];
          vis = group.visible;
        } else continue;

        const last = lastBroadcastPos.current.get(obj.id);
        const wasMoving = lastVelocityNonZeroRef.current.get(obj.id) ?? false;
        const isMoving = vel && (vel[0] !== 0 || vel[1] !== 0 || vel[2] !== 0);
        // "방금 멈춤" 감지 — vel 0 으로 떨어진 직후 한 번은 강제 broadcast (stop 신호)
        const justStopped = wasMoving && !isMoving;
        lastVelocityNonZeroRef.current.set(obj.id, !!isMoving);

        // 내가 1인칭으로 들고 있으면 grabbedBy 에 본인 id. 다른 클라가 충돌-탈취하는 것 방지.
        const grabbedBy = grabbedStateRef.current.get(obj.id) ?? null;
        // grab 상태 변화 감지 — 잡기 시작/놓기 직후엔 무조건 broadcast (state 전파 보장)
        const prevGrabbedBy = lastBroadcastGrabbedByRef.current.get(obj.id) ?? null;
        const grabStateChanged = prevGrabbedBy !== grabbedBy;
        // 잡고 있는 동안엔 throttle 무시 (정지 상태에서도 위치 sync 보장)
        const isGrabbing = grabbedBy !== null;

        if (!forceAll && !isMoving && !justStopped && !grabStateChanged && !isGrabbing && last) {
          const moved = Math.abs(pos[0] - last[0]) > MOVE_THRESHOLD
                     || Math.abs(pos[1] - last[1]) > MOVE_THRESHOLD
                     || Math.abs(pos[2] - last[2]) > MOVE_THRESHOLD;
          // 회전도 체크 — AutoRotate 처럼 위치 안 변하고 회전만 하는 케이스 sync 보장
          const ROT_THRESHOLD = 0.01; // 약 0.57도
          const lastRot = lastBroadcastRotRef.current.get(obj.id);
          const rotated = !lastRot
                       || Math.abs(rot[0] - lastRot[0]) > ROT_THRESHOLD
                       || Math.abs(rot[1] - lastRot[1]) > ROT_THRESHOLD
                       || Math.abs(rot[2] - lastRot[2]) > ROT_THRESHOLD;
          if (!moved && !rotated) continue;
        }
        lastBroadcastPos.current.set(obj.id, pos);
        lastBroadcastRotRef.current.set(obj.id, rot);
        lastBroadcastGrabbedByRef.current.set(obj.id, grabbedBy);
        states.push({ id: obj.id, pos, rot, scl, vis, vel, grabbedBy });
      }
      if (states.length > 0) {
        sendObjectStates(states);
        if (Math.random() < 0.05) console.log('[ALP-SYNC] sent states', states.length, states.map(s => s.id));
      }
    }, 25); // 40Hz — 권한 이전 시 빠른 수렴
    return () => clearInterval(interval);
  }, [isHost, sendObjectStates, customObjects, playerId]);

  // 호스트 바뀌면 lastBroadcastPos 초기화
  useEffect(() => {
    lastBroadcastPos.current.clear();
  }, [isHost]);

  // 호스트일 때 — customObjects 전체를 라이브 body 위치 포함해서 DO 에 등록.
  // 입장자가 받아서 그대로 씬 구성 → 저장된 위치/현재 위치 불일치 X
  // - 첫 등록: 1초 후 (body 들 settle 되도록)
  // - 이후: 5초마다 갱신 (호스트가 큐브 움직였을 경우 반영)
  useEffect(() => {
    if (!isHost || !customObjects || !sendSceneRegister) return;
    const build = () => {
      const snapshot = customObjects.map(obj => {
        const ref = scriptBodyRefs.current.get(obj.id);
        if (ref?.body.current) {
          const t = ref.body.current.translation();
          const r = ref.body.current.rotation();
          const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w));
          return {
            ...obj,
            position: [t.x, t.y, t.z] as [number, number, number],
            rotation: [e.x, e.y, e.z] as [number, number, number],
          };
        }
        if (ref?.group.current) {
          const g = ref.group.current;
          return {
            ...obj,
            position: [g.position.x, g.position.y, g.position.z] as [number, number, number],
            rotation: [g.rotation.x, g.rotation.y, g.rotation.z] as [number, number, number],
            scale:    [g.scale.x,    g.scale.y,    g.scale.z]    as [number, number, number],
          };
        }
        return obj; // ref 없으면 원본 그대로
      });
      sendSceneRegister(snapshot);
    };
    const t0 = setTimeout(build, 1000);          // 첫 등록 (body settle 후)
    const interval = setInterval(build, 5000);   // 주기 갱신
    return () => { clearTimeout(t0); clearInterval(interval); };
  }, [isHost, customObjects, sendSceneRegister]);

  // customObjects 변경 시 VM 재생성
  useEffect(() => {
    if (!customObjects) return;
    const scripted = customObjects.filter(o => o.script && !o.hidden);

    // 제거된 오브젝트 정리
    for (const [id, vm] of luaScripts.current) {
      if (!scripted.find(o => o.id === id)) {
        vm.destroy();
        luaScripts.current.delete(id);
      }
    }

    // 동적 import — 빌드 시점 의존성 분리. 메인 스크립트 + user 컴포넌트 양쪽에서 사용.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { JsScript } = require('@/lib/world/jsRuntime') as typeof import('@/lib/world/jsRuntime');

    // 어떤 오브젝트 id에 대해서든 JsObjectAPI 만드는 헬퍼 — world.find() / user 컴포넌트에서 재사용
    const makeObjectAPI = (targetId: string, fallbackObj?: UserMapObject): import('@/lib/world/jsRuntime').JsObjectAPI => ({
        id: targetId,
        getPosition: () => {
          // 라이트 우선 (라이트는 RigidBody 없이 position만 가짐)
          const light = lightRefs.current.get(targetId);
          if (light) return [light.position.x, light.position.y, light.position.z];
          const ref = scriptBodyRefs.current.get(targetId);
          if (ref?.body.current) {
            const t = ref.body.current.translation();
            return [t.x, t.y, t.z];
          }
          if (ref?.group.current) {
            const p = ref.group.current.position;
            return [p.x, p.y, p.z];
          }
          return fallbackObj?.position ?? [0, 0, 0];
        },
        setPosition: (x, y, z) => {
          const light = lightRefs.current.get(targetId);
          if (light) { light.position.set(x, y, z); return; }
          const ref = scriptBodyRefs.current.get(targetId);
          if (ref?.body.current) ref.body.current.setTranslation({ x, y, z }, true);
          else if (ref?.group.current) ref.group.current.position.set(x, y, z);
        },
        getRotation: () => {
          const light = lightRefs.current.get(targetId);
          if (light) return [light.rotation.x, light.rotation.y, light.rotation.z];
          const ref = scriptBodyRefs.current.get(targetId);
          if (ref?.body.current) {
            const q = ref.body.current.rotation();
            const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
            return [e.x, e.y, e.z];
          }
          if (ref?.group.current) {
            const r = ref.group.current.rotation;
            return [r.x, r.y, r.z];
          }
          return fallbackObj?.rotation ?? [0, 0, 0];
        },
        setRotation: (rx, ry, rz) => {
          const light = lightRefs.current.get(targetId);
          if (light) { light.rotation.set(rx, ry, rz); return; }
          const ref = scriptBodyRefs.current.get(targetId);
          if (ref?.body.current) {
            const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
            ref.body.current.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
          } else if (ref?.group.current) {
            ref.group.current.rotation.set(rx, ry, rz);
          }
        },
        applyImpulse: (x, y, z) => {
          const ref = scriptBodyRefs.current.get(targetId);
          ref?.body.current?.applyImpulse({ x, y, z }, true);
        },
        setVisible: (b) => {
          const light = lightRefs.current.get(targetId);
          if (light) { light.visible = b; return; }
          const ref = scriptBodyRefs.current.get(targetId);
          if (ref?.group.current) ref.group.current.visible = b;
        },
        setColor: (hex) => {
          const light = lightRefs.current.get(targetId);
          if (light) {
            try { light.color.set(hex); } catch { /* invalid hex 무시 */ }
            return;
          }
          // 메시 색상 변경 — material에 접근 (PrimitiveMesh material)
          const ref = scriptBodyRefs.current.get(targetId);
          if (ref?.group.current) {
            ref.group.current.traverse((child) => {
              const m = child as THREE.Mesh;
              if (m.isMesh && m.material) {
                const mat = m.material as THREE.MeshStandardMaterial;
                if (mat.color) { try { mat.color.set(hex); } catch {} }
              }
            });
          }
        },
        setIntensity: (v) => {
          const light = lightRefs.current.get(targetId);
          if (light) light.intensity = Number(v);
        },
        destroy: () => {
          // 런타임 생성 오브젝트 (rt_ prefix) 만 제거 — 저장된 customObjects 보호
          if (targetId.startsWith('rt_')) destroyObject(targetId);
        },
        // 1인칭 grab 상태 조회 — 로컬 클라 기준 (네트워크 동기 X)
        isGrabbed: () => grabbedStateRef.current.has(targetId),
        grabber: () => grabbedStateRef.current.get(targetId) ?? null,
      });

    // worldAPI 도 obj 의존성 없음 — hoist
    const worldAPI: import('@/lib/world/jsRuntime').JsWorldAPI = {
      getTime: () => worldElapsed.current,
      getPlayers: () => {
        return Object.values(playersRef.current).map(p => {
          const pose = posesRef.current?.get(p.id);
          return { id: p.id, username: p.username, x: pose?.x ?? 0, y: pose?.y ?? 0, z: pose?.z ?? 0 };
        });
      },
      findObject: (nameOrId) => {
        const target = customObjects?.find(o => o.id === nameOrId || (o as { label?: string }).label === nameOrId)
                     ?? runtimeObjectsRef.current.find(o => o.id === nameOrId);
        if (!target) return null;
        return makeObjectAPI(target.id, target);
      },
      spawn: (opts) => {
        const id = spawnObject(opts);
        const fallback: UserMapObject = {
          id,
          kind:     opts.kind     ?? 'cube',
          position: opts.position ?? [0, 5, 0],
          rotation: opts.rotation ?? [0, 0, 0],
          scale:    opts.scale    ?? [1, 1, 1],
          color:    opts.color    ?? '#ffffff',
          physics:  opts.physics  ?? 'dynamic',
        };
        return makeObjectAPI(id, fallback);
      },
      isHost: () => isHostRef.current,
      runtimeCount: () => runtimeObjectsRef.current.length,
    };

    // 메인 스크립트 (obj.script) VM 생성
    for (const obj of scripted) {
      if (luaScripts.current.has(obj.id)) continue;
      const vm = new JsScript();
      const objectAPI = makeObjectAPI(obj.id, obj);
      const netAPI: import('@/lib/world/jsRuntime').JsNetAPI = {
        sendAll: (event, data) => sendScriptEvent?.(obj.id, event, data),
        sendTo: (pid, event, data) => sendScriptEvent?.(obj.id, event, data, pid),
      };
      luaScripts.current.set(obj.id, vm);
      vm.init(obj.script!, objectAPI, worldAPI, netAPI);
      if (hostId !== null) vm.callStart();
      else pendingStartRef.current.add(vm);
    }

    /* ── 유저 정의 컴포넌트 (user:<id>) VM 생성/정리 ── */
    // 모든 user 컴포넌트 인스턴스 정리 후 재생성 (인스턴스가 idx 기반이라 안전하게 갈아엎음)
    for (const arr of componentScripts.current.values()) {
      for (const { vm } of arr) vm.destroy();
    }
    componentScripts.current.clear();

    const allObjs = [...(customObjects ?? []), ...runtimeObjectsRef.current];
    for (const obj of allObjs) {
      if (obj.hidden) continue;
      const userComps = (obj.components ?? []).filter(c => c.type.startsWith('user:'));
      if (userComps.length === 0) continue;

      // 이 오브젝트의 objectAPI / netAPI 만들기 (worldAPI 는 위에서 hoist 됨)
      const objAPI = makeObjectAPI(obj.id, obj);
      const userNetAPI: import('@/lib/world/jsRuntime').JsNetAPI = {
        sendAll: (event, data) => sendScriptEvent?.(obj.id, event, data),
        sendTo: (pid, event, data) => sendScriptEvent?.(obj.id, event, data, pid),
      };
      const vms: Array<{ vm: import('@/lib/world/jsRuntime').JsScript; key: string }> = [];

      for (let idx = 0; idx < userComps.length; idx++) {
        const inst = userComps[idx];
        const compId = inst.type.slice(5); // 'user:abc' → 'abc'
        const def = scriptComponentDefsRef.current.get(compId);
        if (!def) {
          console.warn(`[user-component] 코드 없음: ${compId} (오브젝트 ${obj.id})`);
          continue;
        }
        const vm2 = new JsScript();
        vm2.init(def.code, objAPI, worldAPI, userNetAPI, inst.props ?? {});
        if (hostId !== null) vm2.callStart();
        else pendingStartRef.current.add(vm2);
        vms.push({ vm: vm2, key: `${obj.id}::${idx}::${compId}` });
      }
      if (vms.length > 0) componentScripts.current.set(obj.id, vms);
    }

    return () => {
      for (const vm of luaScripts.current.values()) vm.destroy();
      luaScripts.current.clear();
      for (const arr of componentScripts.current.values()) {
        for (const { vm } of arr) vm.destroy();
      }
      componentScripts.current.clear();
      pendingStartRef.current.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    customObjects?.map(o => o.id + (o.script ?? '') + JSON.stringify(o.components ?? [])).join(','),
    scriptComponentsLoaded,
  ]);

  // 카메라 모드 (1인칭 / 3인칭) — V 키로 토글
  const [cameraMode, setCameraMode] = useState<CameraMode>('third');
  const toggleCameraMode = useCallback(() => {
    setCameraMode(m => m === 'first' ? 'third' : 'first');
  }, []);
  // 1인칭 크로스헤어 UI state — Player 가 grab/aim 상태에 따라 호출
  const [crosshairState, setCrosshairState] = useState<'idle' | 'aim' | 'grab'>('idle');

  // 모바일 감지 (Canvas 외부)
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const detect = () => {
      const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      setIsMobile(touch && (window.matchMedia?.('(max-width: 1024px)')?.matches ?? false));
    };
    detect();
    window.addEventListener('resize', detect);
    return () => window.removeEventListener('resize', detect);
  }, []);

  return (
    <>
      {/* ── 모바일 컨트롤: Canvas 완전 바깥의 position:fixed DOM ── */}
      {isMobile && <MobileControls inputLocked={chatInputActive} />}

      {/* 1인칭 크로스헤어 */}
      {cameraMode === 'first' && (() => {
        // 크로스헤어 색: idle=흰, aim=초록, grab=노랑. mixBlendMode 는 grab/aim 일 때 끔 (색이 살게)
        const ch = crosshairState === 'grab' ? '#fbbf24'
                 : crosshairState === 'aim'  ? '#34d399'
                 : '#fff';
        // 힌트는 잡고 있거나 잡을 수 있는 거 조준 중일 때만 띄움
        const hint = crosshairState === 'grab' ? 'E — 놓기 · 좌클릭 — 던지기 · 휠 — 거리'
                   : crosshairState === 'aim'  ? 'E — 잡기'
                   : null;
        const useBlend = crosshairState === 'idle';
        return (
          <>
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', zIndex: 1000, mixBlendMode: useBlend ? 'difference' : 'normal' }}>
              <div style={{ position: 'absolute', width: 14, height: 2, background: ch, left: -7, top: -1 }} />
              <div style={{ position: 'absolute', width: 2, height: 14, background: ch, left: -1, top: -7 }} />
              <div style={{ position: 'absolute', width: 3, height: 3, borderRadius: '50%', background: ch, left: -1.5, top: -1.5 }} />
            </div>
            {hint && (
              <div style={{
                position: 'fixed', top: 'calc(50% + 28px)', left: '50%', transform: 'translateX(-50%)',
                pointerEvents: 'none', zIndex: 1000,
                fontSize: 11, color: 'rgba(255,255,255,0.78)', fontWeight: 600,
                textShadow: '0 1px 2px rgba(0,0,0,0.7)',
                whiteSpace: 'nowrap',
              }}>
                {hint}
              </div>
            )}
          </>
        );
      })()}

      {/* 카메라 모드 토글 버튼 (V) */}
      <button
        type="button"
        onClick={toggleCameraMode}
        title="카메라 전환 (V)"
        style={{
          position: 'fixed', top: 16, right: 16, zIndex: 1000,
          background: 'rgba(0,0,0,0.45)', color: '#fff',
          border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10,
          padding: '7px 11px', fontSize: 12, fontWeight: 700,
          cursor: 'pointer', backdropFilter: 'blur(6px)',
        }}
      >
        {cameraMode === 'first' ? '👁 1인칭' : '🎥 3인칭'} (V)
      </button>

      <Canvas
        shadows={{ enabled: true, type: THREE.PCFShadowMap, autoUpdate: true }}
        camera={{ fov: 60, near: 0.3, far: graphics.farClip, position: [0, 8, 12] }}
        dpr={graphics.dpr}
        gl={{
          antialias: true, // 항상 켬 (런타임 변경 시 WebGL 컨텍스트 손실)
          powerPreference: 'high-performance',
          stencil: false,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.7,
        }}
        style={{ width: '100vw', height: '100vh', display: 'block', background: showSky ? '#87ceeb' : '#0a0a0f', transform: 'translateZ(0)', willChange: 'transform' }}
      >
        {/* 조명 — sceneSettings 기반 */}
        <ambientLight intensity={ambientIntensity} />
        {dirIntensity > 0 && (
          <directionalLight
            position={[25, 40, 15]}
            intensity={dirIntensity}
            castShadow={shadowsEnabled}
            shadow-mapSize={shadowMapSize}
            shadow-camera-left={-60}
            shadow-camera-right={60}
            shadow-camera-top={60}
            shadow-camera-bottom={-60}
          />
        )}
        {/* 사용자 추가 조명 */}
        {lightObjects.map(o => {
          const dist = o.lightDistance ?? 0;
          const shadowFar = dist > 0 ? dist : 100;
          // ref 콜백: 스크립트에서 light.color / light.intensity 직접 제어 가능하게 등록
          const refCb = (light: THREE.Light | null) => {
            if (light) lightRefs.current.set(o.id, light);
            else lightRefs.current.delete(o.id);
          };
          return o.kind === 'pointlight' ? (
            <pointLight key={o.id} ref={refCb}
              position={o.position} color={o.lightColor || '#ffffff'}
              intensity={o.lightIntensity ?? 1} distance={dist}
              decay={1} castShadow={o.castShadow ?? false}
              shadow-camera-near={0.1} shadow-camera-far={shadowFar} />
          ) : o.kind === 'dirlight' ? (
            <directionalLight key={o.id} ref={refCb}
              position={o.position} color={o.lightColor || '#ffffff'}
              intensity={o.lightIntensity ?? 1}
              castShadow={o.castShadow ?? false}
              shadow-mapSize={shadowMapSize}
              shadow-camera-left={-80} shadow-camera-right={80}
              shadow-camera-top={80} shadow-camera-bottom={-80}
              shadow-camera-near={0.1} shadow-camera-far={200}
              shadow-bias={-0.0005} />
          ) : (
            <spotLight key={o.id} ref={refCb}
              position={o.position} color={o.lightColor || '#ffffff'}
              intensity={o.lightIntensity ?? 1} distance={dist}
              angle={(o.lightAngle ?? 45) * Math.PI / 180}
              penumbra={o.lightPenumbra ?? 0.2}
              decay={1} castShadow={o.castShadow ?? false}
              shadow-camera-near={0.1} shadow-camera-far={shadowFar} />
          );
        })}

        <GraphicsApplier
          shadowSize={graphics.shadowSize}
          shadowFilter={graphics.shadowFilter}
          shadowRadius={graphics.shadowRadius}
        />
        <ExposureUpdater exposure={exposure} hdriIntensity={hdriIntensity} />

        {showSky && !hdriBackground && <Sky sunPosition={[25, 10, 15]} turbidity={0.4} rayleigh={0.25} />}
        {/* HDRI 환경맵 — 커스텀 URL 우선, 없으면 프리셋, none 이면 미사용 */}
        {hdriUrl.trim() ? (
          <Environment files={hdriUrl.trim()} background={hdriBackground} />
        ) : hdriPreset !== 'none' ? (
          // drei Environment preset 타입 — 런타임 검증은 drei 가 함
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          <Environment preset={hdriPreset as any} background={hdriBackground} />
        ) : null}

        {/* ── JS onUpdate + 네트워크 보간 루프 ── */}
        <LuaUpdateLoop
          luaScripts={luaScripts}
          componentScripts={componentScripts}
          worldElapsed={worldElapsed}
          scriptBodyRefs={scriptBodyRefs}
          syncTargets={syncTargets}
          isHost={isHost}
          ownersRef={ownersRef}
          playerId={playerId}
          remoteGrabbedByRef={remoteGrabbedByRef}
          allObjectsRef={allObjectsRef}
          lightRefs={lightRefs}
        />

        <Suspense fallback={null}>
          <Physics gravity={[0, gravityY, 0]} interpolate={false}>
            {customObjects !== undefined ? (
              // 유저 제작 월드 — 기본 그라운드 없음. 필요하면 평면 직접 배치
              // runtimeObjects: 스크립트 world.spawn() 으로 동적 생성된 것 (로컬 전용, 저장 안 됨)
              <>{[...customObjects, ...runtimeObjects].filter(o => !o.hidden && o.kind !== 'pointlight' && o.kind !== 'spotlight' && o.kind !== 'dirlight' && o.kind !== 'spawn').map(obj => <UserMapObjectMesh key={obj.id} obj={obj} scriptBodyRefs={scriptBodyRefs} />)}</>
            ) : (
              // worldId 없음 (기본 월드) → 데모 섬
              <Island />
            )}
            <Player character={character} bubble={chatBubbles[playerId]} onMove={onMove} inputLocked={chatInputActive} emoteSlot={emoteSlot} emoteOneShotOverride={emoteOneShotOverride} onObjCollide={onObjCollide} cameraMode={cameraMode} onToggleCameraMode={toggleCameraMode} scriptBodyRefs={scriptBodyRefs} luaScripts={luaScripts} componentScripts={componentScripts} ownersRef={ownersRef} playerId={playerId} grabbedStateRef={grabbedStateRef} grabbableIdsRef={grabbableIdsRef} onGrabUiChange={setCrosshairState} onGrabClaim={onGrabClaim} onGrabRelease={onGrabRelease} remoteGrabbedByRef={remoteGrabbedByRef} jumpPower={jumpPower} spawnPos={spawnPick.pos} spawnRotY={spawnPick.rotY} />
            {Object.values(players).map((p) => (
              <RemotePlayerMesh key={p.id} player={p} posesRef={posesRef} bubble={chatBubbles[p.id]} castShadow={graphics.remoteShadows} />
            ))}
          </Physics>
        </Suspense>
      </Canvas>
    </>
  );
}
