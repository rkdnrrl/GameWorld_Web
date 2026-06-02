'use client';
import React, { Suspense, useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Sky, Text, Environment, useProgress, PerformanceMonitor } from '@react-three/drei';
import { Physics, RigidBody, CapsuleCollider, CuboidCollider, useRapier } from '@react-three/rapier';

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
import { PerfManager } from '@/lib/world/PerfManager';
import { UIRenderer } from '@/lib/world/UIRenderer';
import { UIWorldRenderer } from '@/lib/world/UIWorldRenderer';
import { TerrainMesh } from '@/lib/world/TerrainMesh';
import { FlashlightLight } from '@/lib/world/FlashlightLight';
import { SoundEmitter } from '@/lib/world/SoundEmitter';
import { UI_SYNC_EVENT, DATA_SYNC_EVENT, type UiData } from '@/lib/world/uiObjects';
import { api as backendApi } from '@/lib/api';
import { retargetClipsToModel } from '@/lib/character/mixamoRig';
import { loadPlatformAnimationStateClips } from '@/lib/character/platformAnimations';
import PostFX, { derivePostFX } from '@/lib/world/PostFX';
import Particles, { deriveParticleSettings } from '@/lib/world/Particles';
import { VideoScreenMaterial, YouTubeMeshMaterial, YouTubeMaybeOverlay, parseYouTubeId, parseUrlKind, normalizeMediaUrl, ImageMaterial, GenericIframeOverlay, VideoScreenCtx, VIDEO_SYNC_EVENT, VIDEO_CTL_EVENT, applyVideoSync, VideoRemotePanel, type VideoRegistry, type VideoHandle, type VideoControlCmd } from './VideoScreen';
import { createGameRuntime, GAME_SYNC_EVENT, GAME_SOUND_EVENT, type GameSnapshot } from '@/lib/world/gameRuntime';
import { execUiButtonScript } from '@/lib/world/uiButtonScript';
import GameHud from './GameHud';

const PLAYER_CAPSULE_HALF_HEIGHT = 0.35;
const PLAYER_CAPSULE_RADIUS = 0.28;
const PLAYER_MESH_Y = -(PLAYER_CAPSULE_HALF_HEIGHT + PLAYER_CAPSULE_RADIUS);

// 동적 오브젝트가 스폰 높이 기준 이만큼 아래로 떨어지면 원위치로 복귀 (월드 밖 추락 방지)
const OBJ_FALL_RESET = 50;

// 멀티플레이 동기화 디버그 로그 — 기본 OFF. 매 프레임/충돌마다 console.log 하면
// (특히 DevTools 열린 상태) 심각한 렉을 유발하므로 평소엔 끈다. 디버깅 시 true.
const SYNC_DEBUG = false;
const slog = (...args: unknown[]) => { if (SYNC_DEBUG) console.log(...args); };

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

/** Water mesh — sin/cos 웨이브 애니메이션. 스튜디오 WaterMesh 와 동일 공식. */
function WorldWaterMesh({ color }: { color: string }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const baseRef = useRef<Float32Array | null>(null);
  useFrame(({ clock }) => {
    const m = meshRef.current;
    if (!m) return;
    const geom = m.geometry as THREE.PlaneGeometry;
    const pos = geom.attributes.position as THREE.BufferAttribute;
    if (!baseRef.current) baseRef.current = (pos.array as Float32Array).slice() as Float32Array;
    const base = baseRef.current;
    const arr = pos.array as Float32Array;
    const t = clock.elapsedTime;
    for (let i = 0; i < arr.length; i += 3) {
      const x = base[i], y = base[i + 1];
      arr[i + 2] = base[i + 2] + Math.sin(x * 5 + t * 2) * 0.04 + Math.cos(y * 5 + t * 1.5) * 0.04;
    }
    pos.needsUpdate = true;
    geom.computeVertexNormals();
  });
  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[1, 1, 16, 16]} />
      <meshStandardMaterial color={color} transparent opacity={0.75}
        roughness={0.15} metalness={0.1} side={THREE.DoubleSide} />
    </mesh>
  );
}

function autoNormalize(obj: THREE.Object3D, rotX = 0, targetHeight = 1.8) {
  // 재호출 시 누적 방지 — 매번 fresh 한 상태에서 시작
  obj.position.set(0, 0, 0);
  obj.rotation.set(0, 0, 0);
  obj.scale.set(1, 1, 1);
  obj.updateMatrixWorld(true);

  // 자동 감지 — stored rotX 가 default (-π/2) 면 4 후보 중 가장 키 큰 회전 사용.
  // FBX 가 이미 Y-up 직립이라 -π/2 가 잘못된 경우 자동 보정 (캐릭터 페이지 미수정 옛 데이터 fallback).
  let effectiveRotX = rotX;
  if (Math.abs(rotX - (-Math.PI / 2)) < 0.001) {
    const cands = [0, -Math.PI / 2, Math.PI / 2, Math.PI];
    let bestY = -Infinity;
    for (const r of cands) {
      obj.rotation.set(r, 0, 0);
      obj.updateMatrixWorld(true);
      const b = getRenderableBounds(obj);
      const s = b.getSize(new THREE.Vector3());
      if (s.y > bestY) { bestY = s.y; effectiveRotX = r; }
    }
  }

  // 회전 적용 + 크기 측정 (회전 안 한 상태에서) — 누워있을 때 size.y 로 over-scale 되는 옛 버그 방지
  obj.rotation.set(0, 0, 0);
  obj.updateMatrixWorld(true);
  const box0 = getRenderableBounds(obj);
  const size0 = box0.getSize(new THREE.Vector3());
  const h = Math.max(size0.x, size0.y, size0.z);
  if (h > 0) {
    obj.scale.setScalar(targetHeight / h);
    obj.updateMatrixWorld(true);
  }

  // 회전 적용
  obj.rotation.set(effectiveRotX, 0, 0);
  obj.updateMatrixWorld(true);

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

// 캐릭터 mixer.update 를 skip 할 거리(제곱). 80m 너머면 본 애니메이션 멈춤 (visible 은 유지).
// 정적 본 포즈로 보여 멀리서 차이 거의 없음. 많은 캐릭터 있을 때 CPU 절감 효과 큼.
const SKIN_UPDATE_DIST = 80;
const SKIN_UPDATE_DIST2 = SKIN_UPDATE_DIST * SKIN_UPDATE_DIST;
const _cullVec = new THREE.Vector3();

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
  // 발 위치 자동 보정 — foot bone 실측 기반 (bind-pose bbox 는 본 변형 모르므로 안 됨).
  const feetCalibFrames = useRef(0);
  const feetCalibDone   = useRef(false);
  const footBones       = useRef<THREE.Object3D[]>([]);

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
      // 새 모델 로드 — 발 보정 리셋 + foot bone 찾기
      // 본 이름 끝이 LeftFoot/RightFoot/LeftToeBase/RightToeBase 면 매칭 (Mixamo 변형 모두 포함)
      feetCalibFrames.current = 0;
      feetCalibDone.current = false;
      const feet: THREE.Object3D[] = [];
      cloned.traverse((o) => {
        if (/(?:left|right)(?:foot|toebase)$/i.test(o.name)) feet.push(o);
      });
      footBones.current = feet;
      if (!feet.length) console.warn('[world char] foot bones not found in', cloned);
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
  // distance throttle — root 가 멀거나(80m+) 화면 밖이면 mixer.update skip.
  // 본 위치는 마지막 포즈에 멈춰있어 캐릭터가 정적으로 보이지만 멀어서 차이 거의 X.
  // 가까이 들어오면 자동으로 update 재개 + state 전환 따라잡음.
  useFrame((state, dt) => {
    if (!mixer.current) return;
    let skipMixer = false;
    // 탭 백그라운드면 mixer skip — 보이지도 않는데 본 계산 불필요
    if (typeof document !== 'undefined' && document.hidden) skipMixer = true;
    if (!skipMixer && obj) {
      const cam = state.camera.position;
      const root = obj as THREE.Object3D;
      // root.position 은 부모(group) 기준 로컬일 수 있어 world position 사용
      _cullVec.setFromMatrixPosition(root.matrixWorld);
      if (_cullVec.distanceToSquared(cam) > SKIN_UPDATE_DIST2) skipMixer = true;
    }
    if (!skipMixer) mixer.current.update(dt);
    // 머리 가리기 — mixer 가 매 프레임 본 transform 을 덮어쓰므로 update 후에 강제 적용
    if (headBone.current) {
      headBone.current.scale.setScalar(hideHead ? 0.0001 : 1);
    }
    // 발 위치 자동 보정 — smooth (30%) 추적 + parent scale 보정 (drift world units → local units).
    if (footBones.current.length && obj && !skipMixer) {
      const root = obj as THREE.Object3D;
      const parent = root.parent;
      if (parent) {
        const _wp = new THREE.Vector3();
        const _ws = new THREE.Vector3();
        let lowestY = Infinity;
        for (const b of footBones.current) {
          b.getWorldPosition(_wp);
          if (_wp.y < lowestY) lowestY = _wp.y;
        }
        parent.getWorldPosition(_wp);
        parent.getWorldScale(_ws);
        const drift = lowestY - _wp.y;
        const parentScaleY = _ws.y || 1;
        if (Math.abs(drift) > 0.02) {
          root.position.y -= (drift * 0.3) / parentScaleY;
        }
      }
    }
    if (skipMixer) return;

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
    // 스크립트 onUpdate 는 호스트만 실행 (권위). 비호스트는 호스트가 broadcast 한
    // 오브젝트 상태를 sync 로 받아 반영 → 모두에게 동일한 결과. (호스트 바뀌면 새 호스트가 이어받음)
    if (isHost) {
      for (const vm of luaScripts.current.values()) vm.callUpdate(dt);
      // 유저 정의 컴포넌트 VM 들도 매 프레임 onUpdate
      for (const arr of componentScripts.current.values()) {
        for (const { vm } of arr) vm.callUpdate(dt);
      }
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
          if (obj.kind === 'spawn' || obj.kind === 'empty') continue;
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

/* drei <Html occlude="blending"> 는 캔버스 전체 pointerEvents 를 none 으로 만들어(라이브러리 동작)
   YouTube 화면이 있으면 클릭-포인터락이 깨진다. 매 프레임 auto 로 되돌려 클릭/회전을 보장. */
function CanvasPointerEventsKeeper() {
  const { gl } = useThree();
  useFrame(() => {
    const s = gl.domElement.style;
    if (s.pointerEvents === 'none') s.pointerEvents = 'auto';
    if (s.zIndex !== '16777271') s.zIndex = '16777271';
  });
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

/* ── 그림자맵 업데이트 throttle ──
   매 프레임 큰(예: 4096) 그림자맵을 다시 렌더하는 게 작은 뷰포트에선 화면 렌더보다 큰 부하.
   autoUpdate 를 끄고 ~30Hz 로만 갱신 → 그림자 비용 절반, 체감 품질 차이 거의 없음. */
function ShadowUpdateThrottle({ hz = 30 }: { hz?: number }) {
  const { gl } = useThree();
  const acc = useRef(0);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => { gl.shadowMap.autoUpdate = true; };
  }, [gl]);
  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current >= 1 / hz) { acc.current = 0; gl.shadowMap.needsUpdate = true; }
  });
  return null;
}

/* ── 맵 로딩 오버레이 ──
   텍스처/모델이 다 로드될 때까지 진행률 바를 보여주고, 완료되면 사라진다.
   drei useProgress 가 Three.js DefaultLoadingManager 를 추적 (Canvas 밖 DOM 에서도 동작). */
function MapLoadingOverlay() {
  const { active, progress, loaded, total, item } = useProgress();
  const [visible, setVisible] = useState(true);
  const hadActivity = useRef(false);

  useEffect(() => { if (active) hadActivity.current = true; }, [active]);

  // 로딩 활동이 있었고 끝났으면 잠깐 뒤 숨김
  useEffect(() => {
    if (hadActivity.current && !active) {
      const t = setTimeout(() => setVisible(false), 400);
      return () => clearTimeout(t);
    }
  }, [active]);

  // 안전장치: 로드할 게 없으면(캐시/빈 맵) 1.5초 뒤 숨김, 그래도 안 끝나면 최대 12초 하드컷
  useEffect(() => {
    const t1 = setTimeout(() => { if (!hadActivity.current) setVisible(false); }, 1500);
    const t2 = setTimeout(() => setVisible(false), 12000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (!visible) return null;
  const pct = Math.min(100, Math.round(progress));
  const fileName = item ? (item.split('/').pop() || '').split('?')[0] : '';
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 16777274,
      background: 'radial-gradient(circle at 50% 38%, #16213e, #0a0f1e)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
      color: '#fff', fontFamily: "-apple-system,'Apple SD Gothic Neo',sans-serif",
    }}>
      <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 0.5 }}>맵 불러오는 중…</div>
      <div style={{ width: 'min(320px, 72vw)', height: 10, background: 'rgba(255,255,255,0.12)', borderRadius: 6, overflow: 'hidden', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#6366f1,#22d3ee)', borderRadius: 6, transition: 'width 0.2s ease' }} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#a5b4fc' }}>{pct}%</div>
      <div style={{ fontSize: 11, opacity: 0.55, maxWidth: '80vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {total > 0 ? `${loaded} / ${total}` : ''}{fileName ? ` · ${fileName}` : ''}
      </div>
    </div>
  );
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
  /** 동작 토글 신호 (모바일) — 버튼 누를 때마다 nonce++ 증가. Player 가 변화 감지해 토글. */
  crouchNonce: 0,
  proneNonce:  0,
  cameraNonce: 0,
};

export type CameraMode = 'first' | 'third';

/** 스크립트 플레이어 제어 핸들 — Player 가 등록, worldAPI(world.teleport/respawn/setSpeed/setJump) 가 호출. */
export interface PlayerControl {
  teleport: (x: number, y: number, z: number) => void;
  setSpeed: (mult: number) => void;
  setJump: (power: number) => void;
}

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
  localPoseRef,
  portalRef,
  onPortalEnter,
  firstPersonFov = 75,
  onObjectClick,
  playerCtlRef,
  spawnRef,
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
  /** 매 프레임 로컬 플레이어 위치/방향 보고 (포탈 생성 위치 계산용) */
  localPoseRef?: React.MutableRefObject<{ x: number; y: number; z: number; rotY: number }>;
  /** 현재 열린 포탈 (없으면 null). 플레이어가 닿으면 onPortalEnter 호출 */
  portalRef?: React.MutableRefObject<PortalState | null>;
  onPortalEnter?: (worldId: string) => void;
  /** 1인칭 시야각(FOV, degrees). 3인칭은 기본 60 사용. */
  firstPersonFov?: number;
  /** 1인칭에서 정조준한 오브젝트를 좌클릭 시 호출 — 클릭 파티클 버스트 트리거 등 */
  onObjectClick?: (objectId: string) => void;
  /** 스크립트 world.teleport/respawn/setSpeed/setJump 용 — Player 가 제어 함수를 등록. */
  playerCtlRef?: React.MutableRefObject<PlayerControl | null>;
  /** 현재 리스폰 지점 — world.setSpawn 으로 갱신. 낙사/respawn 시 여기로. */
  spawnRef?: React.MutableRefObject<[number, number, number]>;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body      = useRef<any>(null);
  const speedMulRef     = useRef(1);            // world.setSpeed — 이동 속도 배수
  const jumpOverrideRef = useRef<number | null>(null);  // world.setJump — 점프력 덮어쓰기 (null=맵 기본)
  const mesh      = useRef<THREE.Group>(null);
  const portalTriggered = useRef(false);   // 같은 포탈 중복 발동 방지
  const lastPortalId    = useRef<string | null>(null);
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
  // 스크립트 world.teleport/respawn/setSpeed/setJump 용 — 자기 제어 함수를 등록.
  useEffect(() => {
    if (!playerCtlRef) return;
    playerCtlRef.current = {
      teleport: (x: number, y: number, z: number) => {
        try { body.current?.setTranslation({ x, y, z }, true); } catch { /* noop */ }
      },
      setSpeed: (mult: number) => { speedMulRef.current = Number.isFinite(mult) ? Math.max(0, mult) : 1; },
      setJump:  (power: number) => { jumpOverrideRef.current = Number.isFinite(power) ? power : null; },
    };
    return () => { if (playerCtlRef) playerCtlRef.current = null; };
  }, [playerCtlRef]);
  // 현재 애니메이션 상태 (CustomModel이 참조)
  const animStateRef = useRef<AnimState>('idle');
  // 이모트(커스텀 애니메이션) 오버라이드 — idle 상태일 때만 적용
  const emoteSlotRef = useRef<string | null>(null);
  useEffect(() => { emoteSlotRef.current = emoteSlot ?? null; }, [emoteSlot]);
  // 토글 키: C(앉기), Z(엎드리기)
  const crouchRef = useRef(false);
  const proneRef  = useRef(false);
  /** 모바일 nonce 마지막 값 — 변화 감지하면 키 입력과 동일하게 토글 */
  const mobCrouchPrev = useRef(_mob.crouchNonce);
  const mobPronePrev  = useRef(_mob.proneNonce);
  const mobCameraPrev = useRef(_mob.cameraNonce);
  // 점프 상태 최소 유지 시간 (애니메이션 재생 보장)
  const jumpHoldUntil = useRef(0);
  // 3인칭 카메라 충돌(스프링암) — 벽에 막히면 당겨졌다가, 트이면 부드럽게 복귀하는 실효 비율(0~1)
  const camCollideRef = useRef(1);
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
      // Tab: 마우스 커서 토글(포인터락 on/off). 키 입력이라 브라우저가 lock 제스처로 허용 → 클릭/영상과 충돌 없음.
      if (e.code === 'Tab') {
        e.preventDefault();
        if (document.pointerLockElement) {
          document.exitPointerLock();
        } else {
          // 최신 브라우저는 Promise 반환 — 연속 토글 시 쿨다운으로 reject 될 수 있어 조용히 무시.
          const r = gl.domElement.requestPointerLock() as unknown;
          if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => {});
        }
      }
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
      // 1인칭 + 포인터 락 + (잡고 있지 않음) → 정조준한 오브젝트 클릭 (onClick 스크립트 + 파티클 버스트)
      if (cameraModeRef.current === 'first' && isLocked.current && !grabbedIdRef.current) {
        try {
          const camPos = camera.position;
          const fx = -Math.sin(_mob.camH) * Math.cos(_mob.camV);
          const fy = -Math.sin(_mob.camV);
          const fz = -Math.cos(_mob.camH) * Math.cos(_mob.camV);
          const ray = new rapier.Ray({ x: camPos.x, y: camPos.y, z: camPos.z }, { x: fx, y: fy, z: fz });
          const hit = rWorld.castRay(ray, 6.0, true, undefined, undefined, undefined, body.current ?? undefined);
          const hitBody = hit?.collider?.parent();
          if (hitBody && scriptBodyRefs) {
            let clickedId: string | null = null;
            for (const [id, ref] of scriptBodyRefs.current) {
              if (ref.body.current === hitBody) { clickedId = id; break; }
            }
            if (clickedId) {
              // 스크립트 실행/전달은 부모(onObjectClick)가 호스트 권위에 맞춰 처리. 여기선 알리기만.
              onObjectClick?.(clickedId);
              return;  // 클릭 소비 — 포인터락 유지
            }
          }
        } catch { /* Rapier 초기화 중 무시 */ }
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
      // 모바일 버튼 nonce 변화 감지 → 키보드와 동일 토글
      if (_mob.crouchNonce !== mobCrouchPrev.current) {
        mobCrouchPrev.current = _mob.crouchNonce;
        crouchRef.current = !crouchRef.current;
        if (crouchRef.current) proneRef.current = false;
      }
      if (_mob.proneNonce !== mobPronePrev.current) {
        mobPronePrev.current = _mob.proneNonce;
        proneRef.current = !proneRef.current;
        if (proneRef.current) crouchRef.current = false;
      }
      if (_mob.cameraNonce !== mobCameraPrev.current) {
        mobCameraPrev.current = _mob.cameraNonce;
        onToggleCameraMode();
      }

      const isCrouch = crouchRef.current;
      const isProne  = proneRef.current;
      const SPEED    = (isProne ? 1.0 : isCrouch ? 2.5 : sprint ? 9 : 5) * speedMulRef.current;

      // 추락 방지: y가 너무 낮으면 스폰 위치로 복귀
      if (posT.y < -50) {
        const sp = spawnRef?.current ?? spawnPos;   // world.setSpawn 으로 바뀐 체크포인트 우선
        body.current.setTranslation({ x: sp[0], y: sp[1] + 1, z: sp[2] }, true);
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
        body.current.setLinvel({ x: vel.x, y: jumpOverrideRef.current ?? jumpPower, z: vel.z }, true);
        // 애니메이션이 끊기지 않도록 최소 500ms 점프 상태 유지
        jumpHoldUntil.current = Date.now() + 500;
      }

      // 캐릭터 회전 — 1인칭은 항상 카메라 방향(엎드림 포함), 3인칭은 이동 방향(엎드림 제외)
      if (mesh.current) {
        if (cameraMode === 'first') {
          // FP: 캐릭터 몸이 항상 카메라 보는 방향과 일치 (즉시 동기). 엎드린 상태에서도 같이 돎.
          mesh.current.rotation.y = _mob.camH + Math.PI;
        } else if (!isProne && len > 0) {
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

      // 로컬 포즈 보고 (포탈 생성 위치 계산용)
      if (localPoseRef) localPoseRef.current = { x: posT.x, y: posT.y, z: posT.z, rotY: mesh.current?.rotation.y ?? 0 };

      // 포탈 근접 판정 — 닿으면 한 번만 발동
      const pr = portalRef?.current ?? null;
      if (pr) {
        if (pr.id !== lastPortalId.current) { lastPortalId.current = pr.id; portalTriggered.current = false; }
        if (!portalTriggered.current && onPortalEnter) {
          const dx = posT.x - pr.position[0];
          const dz = posT.z - pr.position[2];
          const dy = posT.y - pr.position[1];
          if (dx * dx + dz * dz < 1.1 * 1.1 && Math.abs(dy) < 2.4) {
            portalTriggered.current = true;
            onPortalEnter(pr.worldId);
          }
        }
      } else {
        lastPortalId.current = null;
      }
      } catch { /* Rapier 초기화 중 에러 무시 */ }
    }

    /* ── 카메라는 항상 lastPos를 따라감 (물리 초기화 여부 무관) ── */
    const p = lastPos.current;
    // 자세에 따른 카메라 높이 배수 — 서있음 1.0, 앉기 0.55, 엎드리기 0.18
    const postureScale = proneRef.current ? 0.18 : crouchRef.current ? 0.55 : 1.0;
    // 시야각(FOV): 1인칭은 설정값, 3인칭은 기본 60. 값이 바뀔 때만 투영행렬 갱신.
    if (cameraControlEnabled) {
      const cam = camera as THREE.PerspectiveCamera;
      const targetFov = cameraMode === 'first' ? firstPersonFov : 60;
      if (cam.isPerspectiveCamera && cam.fov !== targetFov) { cam.fov = targetFov; cam.updateProjectionMatrix(); }
    }
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
      const lookY = (dist <= 2.2 ? p.y + 0.45 : p.y + 0.7) - (1 - postureScale) * 0.6;

      // ── 카메라 충돌(스프링암): 시선점 → 원하는 카메라 위치로 레이캐스트.
      //    벽에 막히면 그 앞까지 당기고(즉시), 트이면 부드럽게 복귀. ──
      const ox = tx - p.x, oy = ty - lookY, oz = tz - p.z;       // 시선점 기준 카메라 오프셋 벡터
      const fullLen = Math.hypot(ox, oy, oz);
      let ratio = 1;
      if (fullLen > 0.01) {
        const ir = 1 / fullLen;
        const ray = new rapier.Ray(
          { x: p.x, y: lookY, z: p.z },
          { x: ox * ir, y: oy * ir, z: oz * ir },
        );
        // 자기 캡슐 제외. solid=true. 벽까지 거리(timeOfImpact) 안에서 막힘.
        const hit = rWorld.castRay(ray, fullLen, true, undefined, undefined, undefined, body.current ?? undefined);
        if (hit) {
          const margin = 0.35;                                   // 벽에서 살짝 떨어뜨려 클리핑 방지
          const allowed = Math.max(0.35, hit.timeOfImpact - margin);
          ratio = Math.min(1, allowed / fullLen);
        }
      }
      // 당길 땐 즉시(벽 뚫기 방지), 복귀는 부드럽게(dt 기반 보간)
      const prev = camCollideRef.current;
      camCollideRef.current = ratio < prev ? ratio : prev + (ratio - prev) * Math.min(1, dt * 6);
      const r = camCollideRef.current;

      camera.position.set(p.x + ox * r, lookY + oy * r, p.z + oz * r);
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
          slog('[ALP-SYNC] grab released — taken by', newOwner);
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
            slog('[ALP-SYNC] grab reclaim', grabId);
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
      userData={{ playerId: 'player' }}
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
      userData={{ playerId: player.id }}
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
  kind: import('@/lib/world/objectKinds').ObjectKind;
  /** Sound 데이터 (kind === 'sound' 일 때만) */
  soundUrl?: string;
  soundVolume?: number;
  soundLoop?: boolean;
  soundAutoplay?: boolean;
  soundRadius?: number;
  /** UI 오브젝트 (kind === 'ui' 일 때만) */
  ui?: import('@/lib/world/uiObjects').UiData;
  /** Terrain heightmap (kind === 'terrain' 일 때만) */
  terrain?: import('@/lib/world/terrain').TerrainData;
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
  videoUrl?:         string;   // 표면에 재생할 영상(TV 화면)
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
  // 스크립트 인스펙터 변수 오버라이드 (유니티 직렬화 필드처럼)
  scriptVars?: Record<string, number | string | boolean>;
  // 표시 라벨 — UI 멀티 동기화 (label 키로 ui.set/show/hide 적용) 등에 사용
  label?: string;
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

/* 텍스처 로딩 — URL+컬러스페이스+타일링 단위로 캐시·공유.
   같은 텍스처를 쓰는 바닥/벽 여러 개가 GPU에 한 번만 올라가 VRAM·로드 비용 급감.
   (공유하므로 disposeMaterial 에서 텍스처는 dispose 하지 않음 — 캐시가 세션 동안 보유.) */
const _texCache = new Map<string, THREE.Texture>();
function loadFreshTexture(url: string, colorSpace: THREE.ColorSpace, tx: number, ty: number, onLoad: () => void): THREE.Texture {
  const key = `${url}|${colorSpace}|${tx}|${ty}`;
  const cached = _texCache.get(key);
  if (cached) { onLoad(); return cached; }
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
  _texCache.set(key, tex);
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

/** 머티리얼만 dispose. 텍스처는 _texCache 가 공유·보유하므로 여기서 dispose 안 함
   (dispose 하면 같은 텍스처를 쓰는 다른 벽/바닥이 깨짐). */
function disposeMaterial(mat: THREE.MeshStandardMaterial) {
  mat.dispose();
}

/** 외부 모델(GLB/FBX) 머티리얼 보정 — 스튜디오와 동일.
 *  정점색 켜기 + 알파 컷아웃(잎/풀이 투명하게 사라지는 것 방지) + 양면. */
function fixModelMaterials(mesh: THREE.Mesh) {
  const hasVColor = !!mesh.geometry?.getAttribute?.('color');
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  mats.forEach(m => {
    const mat = m as THREE.MeshStandardMaterial;
    if (!mat) return;
    if (hasVColor && !mat.vertexColors) mat.vertexColors = true;
    // colormap 텍스처가 linear 로 잡혀 어둡게 나오는 것 보정 → sRGB
    if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
    if (mat.emissiveMap) mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
    if (mat.map && mat.color && mat.color.getHex() < 0x202020) mat.color.set('#ffffff');
    if (mat.transparent && (mat.opacity ?? 1) >= 0.99) {
      mat.transparent = false;
      mat.alphaTest = 0.5;
      mat.side = THREE.DoubleSide;
      mat.depthWrite = true;
    }
    mat.needsUpdate = true;
  });
}

/* 계층(부모) 변환을 합성해 오브젝트의 월드 TRS 계산.
   플레이 모드는 물리 바디라 부모 중첩이 안 되므로, 정적 자식의 월드 스케일/위치/회전을
   여기서 미리 구워(bake) 렌더한다. (부모가 스케일된 경우 자식이 얇게 나오던 버그 수정) */
function composeLocalTRS(o: { position: [number,number,number]; rotation: [number,number,number]; scale: [number,number,number] }): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(o.position[0], o.position[1], o.position[2]),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rotation[0], o.rotation[1], o.rotation[2], 'XYZ')),
    new THREE.Vector3(o.scale[0], o.scale[1], o.scale[2]),
  );
}
function computeWorldTRS(obj: UserMapObject, byId: Map<string, UserMapObject>): { position: [number,number,number]; rotation: [number,number,number]; scale: [number,number,number] } {
  let mat = composeLocalTRS(obj);
  let pid = obj.parentId;
  const guard = new Set<string>();
  while (pid && !guard.has(pid)) {
    guard.add(pid);
    const parent = byId.get(pid);
    if (!parent) break;
    mat = composeLocalTRS(parent).multiply(mat);
    pid = parent.parentId;
  }
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  mat.decompose(p, q, s);
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return { position: [p.x, p.y, p.z], rotation: [e.x, e.y, e.z], scale: [s.x, s.y, s.z] };
}

/** 콜라이더 충돌/트리거 이벤트 종류 */
type ColliderEventKind = 'triggerEnter' | 'triggerExit' | 'collisionEnter' | 'collisionExit';
/** rapier 충돌 페이로드에서 상대 오브젝트 id 추출 (오브젝트는 userData.objectId, 그 외=플레이어로 간주) */
function colliderOtherId(p: { other: { rigidBodyObject?: THREE.Object3D | null } }): string {
  // 오브젝트는 objectId, 플레이어는 playerId(per-player 제어용), 둘 다 없으면 'player' 폴백.
  const ud = p.other.rigidBodyObject?.userData as { objectId?: string; playerId?: string } | undefined;
  return ud?.objectId ?? ud?.playerId ?? 'player';
}

const UserMapObjectMesh = React.memo(function UserMapObjectMeshImpl({ obj, scriptBodyRefs, world, onColliderEvent }: {
  obj: UserMapObject;
  scriptBodyRefs?: React.MutableRefObject<Map<string, {
    body: React.MutableRefObject<RapierBodyApi | null>;
    group: React.MutableRefObject<THREE.Group | null>;
  }>>;
  // 부모 변환이 합성된 월드 TRS. 자식이면 전달됨. 루트면 undefined → local 사용.
  world?: { position: [number,number,number]; rotation: [number,number,number]; scale: [number,number,number] };
  onColliderEvent?: (objId: string, otherId: string, kind: ColliderEventKind) => void;
}) {
  const rPos = world?.position ?? obj.position;
  const rRot = world?.rotation ?? obj.rotation;
  const rScale = world?.scale ?? obj.scale;
  // Terrain — heightmap 기반 지면. rotation 은 TerrainMesh 내부 처리 (데이터 rotation 무시 — 옛/새 .alp 모두 호환).
  // 물리: trimesh auto-collider (TerrainMesh 의 실제 geometry).
  if (obj.kind === 'terrain' && obj.terrain) {
    return (
      <RigidBody type="fixed" colliders="trimesh" userData={{ objectId: obj.id }}
        position={rPos} rotation={[0, 0, 0]} scale={rScale}>
        <TerrainMesh terrain={obj.terrain} castShadow={false} receiveShadow />
      </RigidBody>
    );
  }
  // 물리 모드 결정 — Physics 컴포넌트 우선, 없으면 레거시 obj.physics 필드.
  // 둘 다 없으면 'none' (물리/콜라이더 X)
  const physicsComp = obj.components?.find(c => c.type === 'physics');
  const physics: 'none' | 'fixed' | 'dynamic' = physicsComp
    ? (String(physicsComp.props?.mode ?? 'fixed') === 'dynamic' ? 'dynamic' : 'fixed')
    : (obj.physics ?? 'none');
  // Collider 컴포넌트 — 있으면 명시적 박스 콜라이더 (자동 콜라이더 대신).
  // physics 가 'none' 이어도 콜라이더가 있으면 고정(fixed) 바디로 충돌시킴.
  const colliderComp = obj.components?.find(c => c.type === 'collider');
  const bodyType: 'fixed' | 'dynamic' = physics === 'dynamic' ? 'dynamic' : 'fixed';
  const colliderArgs: [number, number, number] | null = colliderComp
    ? [
        Math.max(0.01, Number(colliderComp.props?.sizeX ?? 1)) / 2,
        Math.max(0.01, Number(colliderComp.props?.sizeY ?? 1)) / 2,
        Math.max(0.01, Number(colliderComp.props?.sizeZ ?? 1)) / 2,
      ]
    : null;
  const colliderOffset: [number, number, number] = colliderComp
    ? [Number(colliderComp.props?.offsetX ?? 0), Number(colliderComp.props?.offsetY ?? 0), Number(colliderComp.props?.offsetZ ?? 0)]
    : [0, 0, 0];
  // 트리거(센서) 여부 + 충돌/트리거 이벤트 → 이 오브젝트 스크립트로 디스패치 (유니티 OnTriggerEnter/OnCollisionEnter)
  const trig = !!colliderComp?.props?.trigger;
  type Hit = { other: { rigidBodyObject?: THREE.Object3D | null } };
  const colliderEvents: {
    onIntersectionEnter?: (p: Hit) => void; onIntersectionExit?: (p: Hit) => void;
    onCollisionEnter?: (p: Hit) => void; onCollisionExit?: (p: Hit) => void;
  } = (colliderComp && onColliderEvent)
    ? (trig
        ? { onIntersectionEnter: (p) => onColliderEvent(obj.id, colliderOtherId(p), 'triggerEnter'),
            onIntersectionExit:  (p) => onColliderEvent(obj.id, colliderOtherId(p), 'triggerExit') }
        : { onCollisionEnter: (p) => onColliderEvent(obj.id, colliderOtherId(p), 'collisionEnter'),
            onCollisionExit:  (p) => onColliderEvent(obj.id, colliderOtherId(p), 'collisionExit') })
    : {};
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
  const px = rPos[0], py = rPos[1], pz = rPos[2];
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.setTranslation({ x: px, y: py, z: pz }, true);
      bodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
    } else if (groupRef.current) {
      groupRef.current.position.set(px, py, pz);
    }
  }, [px, py, pz]);

  // 월드 밖으로 일정 이상 떨어진 동적 오브젝트 → 원위치로 복귀 (플레이어 추락 복구와 동일).
  // 스폰 높이 기준 OBJ_FALL_RESET 만큼 아래로 떨어지면 위치·속도·회전 리셋.
  useFrame(() => {
    if (physics !== 'dynamic') return;
    const b = bodyRef.current;
    if (!b) return;
    const t = b.translation();
    if (t.y < py - OBJ_FALL_RESET) {
      b.setTranslation({ x: px, y: py, z: pz }, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      b.setAngvel?.({ x: 0, y: 0, z: 0 }, true);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rRot[0], rRot[1], rRot[2]));
      b.setRotation?.({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    }
  });

  // 빈 오브젝트 — 메시 없이 콜라이더 바디만 렌더 (트리거 존 등). 콜라이더 없는 empty 는 위 필터에서 제외됨.
  if (obj.kind === 'empty') {
    if (!colliderArgs) return null;
    return (
      <RigidBody ref={bodyRef} type={bodyType} colliders={false}
        position={rPos} rotation={rRot} scale={rScale} userData={{ objectId: obj.id }} {...colliderEvents}>
        <CuboidCollider args={colliderArgs} position={colliderOffset} sensor={trig} />
      </RigidBody>
    );
  }

  // Water — 반투명 파란 plane + sin/cos 웨이브 (스튜디오와 동일 디자인).
  if (obj.kind === 'water') {
    return (
      <group position={rPos} rotation={rRot} scale={rScale}>
        <WorldWaterMesh color={obj.color || '#1e88e5'} />
      </group>
    );
  }

  // Portal — 토러스 ring + 안쪽 반투명 disc.
  if (obj.kind === 'portal') {
    const col = obj.color || '#3b82f6';
    return (
      <group position={rPos} rotation={rRot} scale={rScale}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.9, 0.12, 12, 32]} />
          <meshStandardMaterial color={col} emissive={col} emissiveIntensity={0.5} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <circleGeometry args={[0.85, 32]} />
          <meshBasicMaterial color={col} transparent opacity={0.35} side={THREE.DoubleSide} />
        </mesh>
      </group>
    );
  }

  // Particle — 작은 sphere 클러스터 (fire/smoke/spark 색조). 정적.
  if (obj.kind === 'particle') {
    const ptype = (obj as UserMapObject & { particleType?: string }).particleType || 'fire';
    const palette: Record<string, string[]> = {
      fire:  ['#ff8800', '#ff4400', '#fbbf24'],
      smoke: ['#666666', '#888888', '#444444'],
      spark: ['#ffffff', '#fbbf24', '#ffcc00'],
    };
    const cols = palette[ptype] || palette.fire;
    const seeds = [0.12, 0.47, 0.83, 0.21, 0.65, 0.39, 0.92, 0.05, 0.71, 0.34, 0.58, 0.88];
    return (
      <group position={rPos} rotation={rRot} scale={rScale}>
        {seeds.map((s, i) => (
          <mesh key={i} position={[
            (s - 0.5) * 0.6,
            ((s * 7) % 1) * 0.8,
            ((s * 13) % 1 - 0.5) * 0.6,
          ]}>
            <sphereGeometry args={[0.08, 8, 6]} />
            <meshBasicMaterial color={cols[i % cols.length]} transparent opacity={0.75} />
          </mesh>
        ))}
      </group>
    );
  }

  const shape =
    obj.kind === 'sphere'   ? <sphereGeometry args={[0.5, 24, 16]} /> :
    obj.kind === 'cylinder' ? <cylinderGeometry args={[0.5, 0.5, 1, 16]} /> :
    obj.kind === 'plane'    ? <planeGeometry args={[1, 1]} /> :
                              <boxGeometry args={[1, 1, 1]} />;

  if (obj.kind === 'asset' && obj.assetUrl) {
    if (physics === 'none' && !colliderArgs) {
      return (
        <group ref={groupRef} position={rPos} rotation={rRot} scale={rScale}>
          <UserAsset url={obj.assetUrl} matObj={obj} />
        </group>
      );
    }
    return (
      <RigidBody ref={bodyRef} type={bodyType} colliders={colliderArgs ? false : (physics === 'dynamic' ? 'hull' : 'trimesh')} position={rPos} rotation={rRot} scale={rScale} userData={{ objectId: obj.id }} {...colliderEvents}>
        {colliderArgs && <CuboidCollider args={colliderArgs} position={colliderOffset} sensor={trig} />}
        <UserAsset url={obj.assetUrl} matObj={obj} />
      </RigidBody>
    );
  }

  if (physics === 'none' && !colliderArgs) {
    return (
      <group ref={groupRef} position={rPos} rotation={rRot} scale={rScale}>
        <PrimitiveMesh obj={obj} shape={shape} />
      </group>
    );
  }
  const colliders = obj.kind === 'sphere' ? 'ball' : 'cuboid';
  return (
    <RigidBody ref={bodyRef} type={bodyType} colliders={colliderArgs ? false : colliders} position={rPos} rotation={rRot} scale={rScale} userData={{ objectId: obj.id }} {...colliderEvents}>
      {colliderArgs && <CuboidCollider args={colliderArgs} sensor={trig} />}
      <PrimitiveMesh obj={obj} shape={shape} />
    </RigidBody>
  );
});

const PrimitiveMesh = React.memo(function PrimitiveMeshImpl({ obj, shape }: { obj: UserMapObject; shape: React.ReactElement }) {
  const material = React.useMemo(() => {
    const mat = buildMaterial(obj, obj.color);
    if (obj.kind === 'plane') mat.side = THREE.DoubleSide;
    return mat;
  }, [obj.material, obj.materialColor, obj.color, obj.textureAlbedo, obj.textureNormal, obj.textureRoughness, obj.textureTilingX, obj.textureTilingY, obj.kind]);

  React.useEffect(() => () => disposeMaterial(material), [material]);

  // 비디오 스크린 — URL 종류에 따라 분기. YouTube/영상파일/이미지(GIF)/generic iframe.
  // embed 코드(<iframe src=...>)도 normalizeMediaUrl 로 src 추출 후 분기.
  if (obj.videoUrl) {
    const vidSide = obj.kind === 'plane' ? THREE.DoubleSide : THREE.FrontSide;
    const normUrl = normalizeMediaUrl(obj.videoUrl);
    const kind = parseUrlKind(obj.videoUrl);
    if (kind === 'youtube') {
      const ytId = parseYouTubeId(normUrl)!;
      return (
        <>
          <mesh castShadow receiveShadow>
            {shape}
            <YouTubeMeshMaterial videoId={ytId} side={vidSide} />
          </mesh>
          <YouTubeMaybeOverlay videoId={ytId} objId={obj.id} planeW={obj.scale[0]} planeH={obj.scale[1]} />
        </>
      );
    }
    if (kind === 'videoFile') {
      return (
        <mesh castShadow receiveShadow>
          {shape}
          <VideoScreenMaterial url={normUrl} objId={obj.id} side={vidSide} />
        </mesh>
      );
    }
    if (kind === 'image') {
      return (
        <mesh castShadow receiveShadow>
          {shape}
          <ImageMaterial url={normUrl} side={vidSide} />
        </mesh>
      );
    }
    if (kind === 'iframe') {
      return (
        <>
          <mesh castShadow receiveShadow>
            {shape}
            <meshBasicMaterial color="#000" side={vidSide} />
          </mesh>
          <GenericIframeOverlay url={normUrl} planeW={obj.scale[0]} planeH={obj.scale[1]} />
        </>
      );
    }
  }

  return (
    <mesh castShadow receiveShadow material={material}>
      {shape}
    </mesh>
  );
});

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
        // 데스크탑 에디터 finalizeFbx 와 동일 — 최대 치수 2m 기준 정규화 (옛 1m 면 크기 절반).
        if (h > 0) model.scale.multiplyScalar(2 / h);
        // 원본 머티리얼 저장
        originalMats.current.clear();
        model.traverse(c => {
          const m = c as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = true;
            // 스킨드(캐릭터) 메시는 바운딩 구가 본 변형을 반영 못해 화면 안인데도 컬링되어
            // 사라지는 문제가 있음 → 컬링 끔. (정적 에셋도 무해)
            m.frustumCulled = false;
            fixModelMaterials(m);
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
  // VRChat 식 포탈 — 페이지가 portalApiRef.open(worldId, name) 호출 → 플레이어 앞에 포탈 생성.
  // 플레이어가 포탈에 닿으면 onPortalEnter(worldId) 호출 → 페이지가 그 월드로 이동.
  portalApiRef?: React.MutableRefObject<{ open: (worldId: string, name: string) => void; close: () => void } | null>;
  onPortalEnter?: (worldId: string) => void;
  /** 현재 월드 id — data.save/load 시 mapId 키로 사용. 없으면 데이터 저장 비활성. */
  worldId?: string;
  // 카메라 시점 — 페이지(월드 설정)가 제어. 없으면 내부 상태(기본 3인칭) 사용.
  cameraMode?: CameraMode;
  onCameraModeChange?: (m: CameraMode) => void;
  // 1인칭 시야각(FOV, degrees). 월드 설정에서 조절.
  firstPersonFov?: number;
}

/** 런타임 포탈 상태 — 플레이어 앞에 떠 있는 워프 게이트 */
interface PortalState {
  id: string;
  worldId: string;
  name: string;
  position: [number, number, number]; // 발판 기준 (캐릭터 발 높이)
  rotationY: number;
}

/* ── VRChat 식 포탈 비주얼 — 빛나는 링 + 회전하는 안쪽 디스크 + 이름표 ── */
function WorldPortal({ portal }: { portal: PortalState }) {
  const inner = useRef<THREE.Mesh>(null);
  const swirl = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (inner.current) inner.current.rotation.z += dt * 0.8;
    if (swirl.current) swirl.current.rotation.z -= dt * 1.6;
  });
  return (
    <group position={portal.position} rotation={[0, portal.rotationY, 0]}>
      {/* 중심 높이 1.1m */}
      <group position={[0, 1.1, 0]}>
        {/* 바깥 링 */}
        <mesh>
          <torusGeometry args={[0.95, 0.1, 16, 56]} />
          <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={2.2} toneMapped={false} />
        </mesh>
        {/* 안쪽 워프 디스크 (회전) */}
        <mesh ref={inner}>
          <circleGeometry args={[0.9, 56]} />
          <meshBasicMaterial color="#0ea5e9" transparent opacity={0.45} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
        {/* 소용돌이 레이어 */}
        <mesh ref={swirl} position={[0, 0, 0.02]}>
          <ringGeometry args={[0.2, 0.85, 24, 1]} />
          <meshBasicMaterial color="#a5f3fc" transparent opacity={0.25} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
        <pointLight color="#22d3ee" intensity={3} distance={7} />
        {/* 이름표 — 항상 화면을 향함 */}
        <Html center position={[0, 1.45, 0]} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
            background: 'rgba(8,15,30,0.82)', border: '1px solid rgba(34,211,238,0.6)',
            color: '#a5f3fc', fontWeight: 800, fontSize: 13, padding: '5px 12px', borderRadius: 999,
            boxShadow: '0 0 16px rgba(34,211,238,0.5)', backdropFilter: 'blur(4px)',
          }}>
            🌀 {portal.name}
          </div>
        </Html>
      </group>
    </group>
  );
}

/* ── 모바일 컨트롤 컴포넌트 (Canvas 완전 바깥 — drei Html 스케일 영향 없음) ── */
function MobileControls({ inputLocked }: { inputLocked: boolean }) {
  const [joystickKnob, setJoystickKnob] = useState({ x: 0, y: 0, active: false });
  const [mobileSprinting, setMobileSprinting] = useState(false);
  // 모바일 자세 토글 상태 (시각 표시용)
  const [crouchOn, setCrouchOn] = useState(false);
  const [proneOn, setProneOn] = useState(false);

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', userSelect: 'none', zIndex: 16777273 }}>

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

      {/* 자세·카메라 액션 버튼 (점프 위쪽 세로 배치) */}
      {/* 앉기 (KeyC) */}
      <button type="button"
        onPointerDown={e => {
          e.stopPropagation();
          if (inputLocked) return;
          _mob.crouchNonce++;
          setCrouchOn(v => { const next = !v; if (next) setProneOn(false); return next; });
        }}
        style={{
          position: 'absolute', right: 120, bottom: 24, width: 56, height: 56, borderRadius: '50%',
          border: `2px solid ${crouchOn ? 'rgba(34,197,94,0.9)' : 'rgba(255,255,255,0.25)'}`,
          background: crouchOn ? 'rgba(34,197,94,0.4)' : 'rgba(10,15,30,0.55)',
          color: '#fff', fontSize: 22, fontWeight: 700, pointerEvents: 'auto', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
        }}
        aria-label="crouch"
      >🧎</button>
      {/* 엎드리기 (KeyZ) */}
      <button type="button"
        onPointerDown={e => {
          e.stopPropagation();
          if (inputLocked) return;
          _mob.proneNonce++;
          setProneOn(v => { const next = !v; if (next) setCrouchOn(false); return next; });
        }}
        style={{
          position: 'absolute', right: 120, bottom: 88, width: 56, height: 56, borderRadius: '50%',
          border: `2px solid ${proneOn ? 'rgba(34,197,94,0.9)' : 'rgba(255,255,255,0.25)'}`,
          background: proneOn ? 'rgba(34,197,94,0.4)' : 'rgba(10,15,30,0.55)',
          color: '#fff', fontSize: 22, fontWeight: 700, pointerEvents: 'auto', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
        }}
        aria-label="prone"
      >🛌</button>
      {/* 카메라 시점 (KeyV) */}
      <button type="button"
        onPointerDown={e => { e.stopPropagation(); if (!inputLocked) _mob.cameraNonce++; }}
        style={{
          position: 'absolute', right: 120, bottom: 152, width: 56, height: 56, borderRadius: '50%',
          border: '2px solid rgba(255,255,255,0.25)', background: 'rgba(10,15,30,0.55)',
          color: '#fff', fontSize: 20, fontWeight: 700, pointerEvents: 'auto', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
        }}
        aria-label="camera"
      >📷</button>

    </div>
  );
}

export default function WorldCanvas({ character, playerId, players, posesRef, chatBubbles, onMove, customObjects, sceneSettings, graphics = DEFAULT_SETTINGS, chatInputActive = false, emoteSlot, emoteOneShotOverride, sendScriptEvent, scriptEventRef, sendObjectStates, objectStatesRef, hostId, sendObjClaim, sendObjRelease, objectOwnerRef, sendObjSpawn, sendObjDestroy, objSpawnRef, objDestroyRef, sendSceneRegister, portalApiRef, onPortalEnter, cameraMode: cameraModeProp, onCameraModeChange, firstPersonFov = 75, worldId }: WorldCanvasProps) {
  // data.save 콜백 closure 안에서 stale 값 안 잡히게 ref 로 미러
  const worldIdRef = useRef<string | undefined>(worldId);
  useEffect(() => { worldIdRef.current = worldId; }, [worldId]);
  // Health 컴포넌트 — 오브젝트별 현재 HP 캐시 (lazy init) + 피격 무적 마지막 시각
  const healthStoreRef = useRef<Map<string, number>>(new Map());
  const healthInvulnRef = useRef<Map<string, number>>(new Map());
  // ── VRChat 식 포탈 ──
  const [portal, setPortal] = useState<PortalState | null>(null);
  const portalRef = useRef<PortalState | null>(null);
  portalRef.current = portal;
  // 로컬 플레이어 현재 위치/방향 (Player 가 매 프레임 갱신) — 포탈 생성 위치 계산용
  const localPoseRef = useRef<{ x: number; y: number; z: number; rotY: number }>({ x: 0, y: 0, z: 0, rotY: 0 });
  // 페이지가 호출할 포탈 API 등록
  useEffect(() => {
    if (!portalApiRef) return;
    portalApiRef.current = {
      open: (worldId: string, name: string) => {
        const p = localPoseRef.current;
        const dist = 3;
        // forward = (sin(rotY), cos(rotY)) — 캐릭터가 바라보는 방향 (이동 코드 규약과 일치)
        const fx = Math.sin(p.rotY), fz = Math.cos(p.rotY);
        setPortal({
          id: `portal_${Date.now()}`,
          worldId, name,
          position: [p.x + fx * dist, p.y - 0.6, p.z + fz * dist], // 발 높이 기준
          rotationY: p.rotY,
        });
      },
      close: () => setPortal(null),
    };
    return () => { if (portalApiRef) portalApiRef.current = null; };
  }, [portalApiRef]);
  const shadowsEnabled = graphics.shadowSize > 0;
  const shadowMapSize: [number, number] = [graphics.shadowSize || 1024, graphics.shadowSize || 1024];
  // 같은 dpr 설정이라도 큰 창(PC)은 픽셀 수가 폭증해 fill-rate 렉 → 총 백버퍼 픽셀 예산으로 dpr 상한.
  // 모바일(작은 화면)은 예산 안이라 설정 dpr 그대로, PC 큰 창에서만 자동으로 낮아짐.
  const effectiveDpr = useMemo(() => {
    if (typeof window === 'undefined') return graphics.dpr;
    const w = window.innerWidth || 1280, h = window.innerHeight || 720;
    const MAX_PX = 2_600_000;               // 약 1080p+ 수준 백버퍼 예산
    const budget = Math.sqrt(MAX_PX / (w * h));
    return Math.max(1, Math.min(graphics.dpr, budget));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphics.dpr]);
  // PerformanceMonitor 기반 동적 dpr factor — fps 떨어지면 자동으로 dpr 낮춤 (0.5~1.0).
  // effectiveDpr 위에 곱셈으로 적용 → 최대값은 effectiveDpr 유지, 약한 GPU 에서만 자동 낮아짐.
  const [dprFactor, setDprFactor] = useState(1);
  const adaptiveDpr = Math.max(1, effectiveDpr * dprFactor);
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
  // 조명도 부모(예: Manager) 변환을 반영해야 함 — 스튜디오는 월드 TRS 로 배치하는데
  // 월드가 로컬 위치만 쓰면 방향광 방향이 틀어져 어두워짐. 부모 합성용 byId.
  const objectsById = useMemo(() => new Map((customObjects ?? []).map(o => [o.id, o])), [customObjects]);
  // 후처리 볼륨 — postProcess 컴포넌트 설정
  const postFX = useMemo(() => derivePostFX(customObjects ?? []), [customObjects]);
  // 스폰 포인트 — 여러 개 있으면 랜덤 선택. 없으면 기본 [0, 4, 0].
  const spawnObjects = (customObjects ?? []).filter((o: UserMapObject) => o.kind === 'spawn' && !o.hidden);
  // 컴포넌트 마운트 시 1회만 픽 (재렌더 시 점프 방지) — useMemo with stable dep
  const spawnPick = useMemo(() => {
    if (spawnObjects.length === 0) return { pos: [0, 4, 0] as [number, number, number], rotY: 0 };
    const pick = spawnObjects[Math.floor(Math.random() * spawnObjects.length)];
    return { pos: pick.position, rotY: pick.rotation[1] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spawnObjects.map(s => s.id).join(',')]);

  // 플레이어 제어 — Player 가 텔레포트 함수를 등록(playerCtlRef), 리스폰 지점은 spawnRef(world.setSpawn 으로 갱신).
  const playerCtlRef = useRef<PlayerControl | null>(null);
  const spawnRef = useRef<[number, number, number]>(spawnPick.pos);
  useEffect(() => { spawnRef.current = spawnPick.pos; }, [spawnPick]);
  // per-player 제어 명령을 "내 로컬 플레이어"에 적용 (직접 호출 또는 __pctl__ 수신 시).
  const applyPlayerCmd = useCallback((cmd: { t?: string; x?: number; y?: number; z?: number }) => {
    if (cmd.t === 'tp') playerCtlRef.current?.teleport(Number(cmd.x), Number(cmd.y), Number(cmd.z));
    else if (cmd.t === 'respawn') { const [x, y, z] = spawnRef.current; playerCtlRef.current?.teleport(x, y + 1, z); }
    else if (cmd.t === 'setspawn') spawnRef.current = [Number(cmd.x), Number(cmd.y), Number(cmd.z)];
  }, []);

  // ── JS 스크립트 관리 ──────────────────────────────────────
  // objectId → JsScript 인스턴스 (자체 구현 인터프리터). selected.script (메인 스크립트) 용.
  const luaScripts = useRef<Map<string, import('@/lib/world/jsRuntime').JsScript>>(new Map());
  // 유저 정의 컴포넌트 — objectId → 부착된 VM 들 (오브젝트당 여러 부착 가능)
  const componentScripts = useRef<Map<string, Array<{ vm: import('@/lib/world/jsRuntime').JsScript; key: string }>>>(new Map());
  // 클릭 파티클 버스트 — objectId → nonce. Player 클릭 시 +1, Particles(click 모드)가 폴링해 재생.
  const clickBurstRef = useRef<Map<string, number>>(new Map());
  // 비디오 스크린 레지스트리 — objId→<video>. 소리 켜기(제스처)+멀티 동기화에 사용.
  const videoRegistry: VideoRegistry = useRef<Map<string, VideoHandle>>(new Map());
  // 월드는 실제 재생(live) + 소리 ON(첫 클릭에 unmute) + 동기화 ON. (value 고정 → 재렌더 방지)
  const videoCtxValue = useMemo(() => ({ live: true, withSound: true, registry: videoRegistry }), []);
  // 게임 로직 레이어 — 스크립트의 game/ui/world.playSound 가 이 스토어로 들어옴. <GameHud> 가 그림.
  // onSound: 호스트가 사운드를 전원에게 broadcast (비호스트는 스크립트가 안 돌아 호출 안 됨).
  // sendScriptEvent 는 stable(useCallback) 이라 스토어는 1회만 생성.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // UI 멀티 동기화 — 호스트가 ui.set/show/hide 호출 시 적용된 patch + hidden 을 label 키로 저장 + broadcast.
  // 비호스트는 __uisync__ 메시지 받아 같은 state 갱신. UIRenderer 가 customObjects + 이 override merge.
  const [uiOverrides, setUiOverrides] = useState<Record<string, { patch?: Partial<UiData>; hidden?: boolean }>>({});
  const gameRuntime = useMemo(() => createGameRuntime({
    onSound: (url, o) => sendScriptEvent?.('__game__', GAME_SOUND_EVENT, { url, volume: o?.volume ?? 1, loop: !!o?.loop }),
    onUiSet: (label, patch) => {
      setUiOverrides(prev => ({ ...prev, [label]: { ...prev[label], patch: { ...prev[label]?.patch, ...(patch as Partial<UiData>) } } }));
      sendScriptEvent?.('__ui__', UI_SYNC_EVENT, { label, patch });
    },
    onUiVisible: (label, visible) => {
      setUiOverrides(prev => ({ ...prev, [label]: { ...prev[label], hidden: !visible } }));
      sendScriptEvent?.('__ui__', UI_SYNC_EVENT, { label, hidden: !visible });
    },
    // 맵 데이터 변경 — 호스트만 호출. 서버 save + (shared 면) 전원 broadcast.
    onDataSet: (key, value, shared) => {
      const { session } = require('@/lib/api') as typeof import('@/lib/api');
      const tok = session.getToken();
      const wid = worldIdRef.current;
      if (tok && wid) {
        backendApi.worldDataSave(tok, wid, key, value, shared).catch(e => console.warn('[data] save fail', key, e));
      }
      if (shared) {
        sendScriptEvent?.('__data__', DATA_SYNC_EVENT, { key, value });
      }
    },
  }), []);
  // 비디오 URL 런타임 오버라이드 — 컨트롤 바에서 URL 변경 시(멀티 동기). objId→새 URL.
  const [videoUrlOverrides, setVideoUrlOverrides] = useState<Record<string, string>>({});
  // 컨트롤 바/리모컨 동작 — 등록된 비디오 스크린에 적용 + 다른 플레이어에게 broadcast(__videoctl__).
  // targetId 지정 시 그 화면만(비디오 리모컨), 미지정 시 등록된 모두(2D 바).
  const runVideoControl = useCallback((cmd: { seekBy?: number; seekTo?: number; playing?: boolean; url?: string }, targetId?: string) => {
    const ids = targetId ? [targetId] : [...videoRegistry.current.keys()];
    for (const objId of ids) {
      const v = videoRegistry.current.get(objId);
      if (v && typeof cmd.seekBy === 'number') {
        const target = Math.max(0, (v.getTime() || 0) + cmd.seekBy);
        v.seek(target);
        sendScriptEvent?.(objId, VIDEO_CTL_EVENT, { seekTo: target });
      }
      if (v && typeof cmd.seekTo === 'number') {
        v.seek(cmd.seekTo);
        sendScriptEvent?.(objId, VIDEO_CTL_EVENT, { seekTo: cmd.seekTo });
      }
      if (v && typeof cmd.playing === 'boolean') {
        v.setPlaying(cmd.playing);
        sendScriptEvent?.(objId, VIDEO_CTL_EVENT, { playing: cmd.playing });
      }
      if (cmd.url) {
        const url = cmd.url;
        setVideoUrlOverrides(m => ({ ...m, [objId]: url }));
        sendScriptEvent?.(objId, VIDEO_CTL_EVENT, { url });
      }
    }
  }, [sendScriptEvent]);
  const triggerClickBurst = useCallback((objectId: string) => {
    clickBurstRef.current.set(objectId, (clickBurstRef.current.get(objectId) ?? 0) + 1);
  }, []);
  // 콜라이더 충돌/트리거 이벤트 → 해당 오브젝트의 메인 스크립트 + user 컴포넌트 스크립트로 디스패치
  const dispatchColliderEvent = useCallback((objId: string, otherId: string, kind: ColliderEventKind) => {
    // 트리거/충돌 스크립트 이벤트는 호스트만 실행 (권위). 호스트는 원격 플레이어 아바타(kinematic
    // 바디)의 진입도 감지하므로, 누가 트리거에 들어와도 호스트가 한 번 실행 → broadcast.
    if (!isHostRef.current) return;
    const fire = (vm: import('@/lib/world/jsRuntime').JsScript) => {
      if (kind === 'triggerEnter') vm.callTriggerEnter(otherId);
      else if (kind === 'triggerExit') vm.callTriggerExit(otherId);
      else if (kind === 'collisionEnter') vm.callCollisionEnter(otherId);
      else vm.callCollisionExit(otherId);
    };
    const main = luaScripts.current.get(objId); if (main) fire(main);
    componentScripts.current.get(objId)?.forEach(({ vm }) => fire(vm));

    // Pickup 자동 hookup — pickup 컴포넌트 가진 오브젝트의 trigger 영역에 다른 오브젝트(플레이어 등) 진입 시
    // (mode='touch' 만 자동 — interact 는 1인칭 클릭 onClick 으로 사용자가 처리).
    // 호스트가 ui.text 등 broadcast 효과 + oneShot 이면 destroy. 인벤토리 데이터는 사용자가 data.add 로.
    if (kind === 'triggerEnter') {
      const cur = customObjects?.find(o => o.id === objId) ?? runtimeObjectsRef.current.find(o => o.id === objId);
      const pickupComp = cur?.components?.find(c => c.type === 'pickup');
      if (pickupComp && pickupComp.props?.mode === 'touch') {
        const itemKey = String(pickupComp.props?.itemKey ?? 'item');
        const displayName = String(pickupComp.props?.displayName ?? itemKey);
        const value = Number(pickupComp.props?.value ?? 0);
        // 줍힘 broadcast — 모든 클라가 onNetEvent('__pickup__') 으로 받아 인벤토리 갱신
        sendScriptEvent?.('__pickup__', '__pickup__', {
          itemKey, displayName, value, pickerId: otherId, objId,
        });
        const oneShot = pickupComp.props?.oneShot !== false;
        if (oneShot) {
          if (objId.startsWith('rt_')) destroyObject(objId);
          // 저장된 오브젝트는 hidden 처리 — 사용자가 다음 라운드 시 다시 show 가능
          // (현재 hidden 동기화 멀티 sync 없음 — 다음 phase)
        }
      }
    }

    // Damage 컴포넌트 자동 hookup — objId 가 damage 컴포넌트 부착됐고 otherId 가 health 있으면 자동 피해.
    // contact 모드 = collisionEnter / trigger 모드 = triggerEnter 만 발동. team 같으면 skip.
    if (kind === 'collisionEnter' || kind === 'triggerEnter') {
      const cur = customObjects?.find(o => o.id === objId) ?? runtimeObjectsRef.current.find(o => o.id === objId);
      const damageComp = cur?.components?.find(c => c.type === 'damage');
      if (damageComp) {
        const mode = String(damageComp.props?.mode ?? 'contact');
        const matchMode = (mode === 'contact' && kind === 'collisionEnter')
                       || (mode === 'trigger' && kind === 'triggerEnter');
        if (matchMode) {
          const target = customObjects?.find(o => o.id === otherId) ?? runtimeObjectsRef.current.find(o => o.id === otherId);
          const targetHealth = target?.components?.find(c => c.type === 'health');
          if (targetHealth) {
            const myTeam = String(damageComp.props?.team ?? '');
            const otherTeam = String(targetHealth.props?.team ?? '');
            if (!myTeam || !otherTeam || myTeam !== otherTeam) {
              const amount = Number(damageComp.props?.amount ?? 10);
              makeObjectAPIRef.current?.(otherId).damage?.(amount, { attackerId: objId });
              if (damageComp.props?.destroyOnHit && objId.startsWith('rt_')) destroyObject(objId);
            }
          }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // dispatchColliderEvent 안에서 makeObjectAPI 호출 — closure 순환 의존 피하려고 ref 로 미러.
  const makeObjectAPIRef = useRef<((id: string, fallback?: UserMapObject) => import('@/lib/world/jsRuntime').JsObjectAPI) | null>(null);
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

  // 맵에 실제로 쓰인 유저 컴포넌트 코드를 by-ids 로 보충 로드 — 공식/내 것이 아니어도(맵 제작자의 것
  // 포함) 받아와야 "다른 계정"에서도 제작자의 커스텀 스크립트가 실행됨. (없으면 '코드 없음' 으로 스킵)
  useEffect(() => {
    const ids = new Set<string>();
    for (const o of customObjects ?? []) {
      for (const c of o.components ?? []) {
        if (c.type.startsWith('user:')) {
          const id = c.type.slice(5);
          if (id && !scriptComponentDefsRef.current.has(id)) ids.add(id);
        }
      }
    }
    if (ids.size === 0) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { api, session } = require('@/lib/api') as typeof import('@/lib/api');
    api.getScriptComponentsByIds(session.getToken() || undefined, [...ids])
      .then(r => {
        let added = 0;
        for (const c of r.components) {
          if (!scriptComponentDefsRef.current.has(c.id)) { scriptComponentDefsRef.current.set(c.id, c); added++; }
        }
        if (added > 0) setScriptComponentsLoaded(n => n + 1);
      })
      .catch(e => console.warn('[ScriptComponents] by-ids world fetch fail', e));
  }, [customObjects]);
  // objectId → THREE.Light 인스턴스 (조명 color/intensity 제어용)
  const lightRefs = useRef<Map<string, THREE.Light>>(new Map());
  // 런타임 동적 생성된 오브젝트 (world.spawn 으로 만들어진 것 — 저장 안 됨, 로컬 전용)
  const [runtimeObjects, setRuntimeObjects] = useState<UserMapObject[]>([]);
  // 스크립트 콜백에서 stale state 피하려는 최신 ref
  const runtimeObjectsRef = useRef<UserMapObject[]>([]);
  const customObjectsRef = useRef(customObjects);
  useEffect(() => { customObjectsRef.current = customObjects; }, [customObjects]);
  // NPC 마지막 공격 시각 (cooldown 체크)
  const npcAttackRef = useRef<Map<string, number>>(new Map());
  // NPC patrol target 위치 + 다음 target 갱신 시각
  const npcPatrolRef = useRef<Map<string, { tx: number; tz: number; nextAt: number; homeX: number; homeZ: number }>>(new Map());
  // Damage AOE 마지막 발동 시각 (interval 체크)
  const damageAoeRef = useRef<Map<string, number>>(new Map());
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
      // 비호스트의 1인칭 클릭 전달 — 호스트만 권위적으로 onClick 실행 (클릭은 물리 이벤트가
      // 아니라 호스트가 원격 클릭을 감지 못 하므로, 클릭한 클라가 호스트로 보내준 것)
      if (event === '__click__') {
        if (!isHostRef.current) return;
        luaScripts.current.get(objectId)?.callClick(fromId);
        componentScripts.current.get(objectId)?.forEach(({ vm }) => vm.callClick(fromId));
        return;
      }
      // 맵 데이터 변경 동기화 — 호스트가 data.shared.set 한 결과를 비호스트 캐시에 반영.
      if (event === DATA_SYNC_EVENT) {
        if (isHostRef.current) return;
        if (!fromId || (hostIdRef.current && fromId !== hostIdRef.current)) return;
        const d = data as { key?: string; value?: unknown };
        if (typeof d?.key !== 'string') return;
        gameRuntime.applyDataPatch(d.key, d.value, true);
        return;
      }
      // UI 동기화 — 호스트가 ui.set/show/hide 한 결과를 비호스트가 자기 UI 에 반영.
      if (event === UI_SYNC_EVENT) {
        if (isHostRef.current) return;             // 호스트는 권위자
        if (!fromId || (hostIdRef.current && fromId !== hostIdRef.current)) return;
        const d = data as { label?: string; patch?: Partial<UiData>; hidden?: boolean };
        if (!d?.label) return;
        const lbl = d.label;
        setUiOverrides(prev => {
          const cur = prev[lbl] || {};
          const next: { patch?: Partial<UiData>; hidden?: boolean } = {
            patch: d.patch ? { ...cur.patch, ...d.patch } : cur.patch,
            hidden: d.hidden !== undefined ? d.hidden : cur.hidden,
          };
          return { ...prev, [lbl]: next };
        });
        return;
      }
      // 비디오 스크린 동기화 — 호스트가 보낸 재생시각을 비호스트가 자기 영상에 반영 (watch party)
      if (event === VIDEO_SYNC_EVENT) {
        console.log('[VID] recv SYNC', objectId, 'from', fromId, 'data', data, 'isHost', isHostRef.current, 'hostIdRef', hostIdRef.current);
        if (isHostRef.current) return;            // 호스트는 권위자 — 수신 무시
        // 진짜 호스트가 보낸 것만 적용 — 들어온 사람이 hostId 초기값으로 자기를 호스트로 잘못 판정하고
        // broadcast 하는 케이스 차단 (그 sync 가 비호스트한테 seek 호출해 영상 reset 시킴)
        if (!fromId || (hostIdRef.current && fromId !== hostIdRef.current)) {
          console.log('[VID] SYNC rejected — sender not real host', { fromId, realHost: hostIdRef.current });
          return;
        }
        const d = data as { t?: number; playing?: boolean; url?: string };
        // url 동기화 — 호스트가 리모컨으로 바꾼 영상 url 을 늦게 들어온 사람도 같은 영상 보게.
        // 같은 url 이면 setState 새 객체 안 만들어 re-render 폭주 방지.
        if (d.url) {
          const newUrl = d.url;
          setVideoUrlOverrides(prev => prev[objectId] === newUrl ? prev : ({ ...prev, [objectId]: newUrl }));
        }
        const v = videoRegistry.current.get(objectId);
        if (v) applyVideoSync(v, d);
        return;
      }
      // 비디오 컨트롤 명령(앞/뒤 5초·URL 변경) — 호스트 포함 모든 클라가 반영 (누가 눌러도 동기화)
      if (event === VIDEO_CTL_EVENT) {
        console.log('[VID] recv CTL', objectId, 'from', fromId, 'data', data);
        const d = data as VideoControlCmd;
        if (typeof d.seekTo === 'number') videoRegistry.current.get(objectId)?.seek(d.seekTo);
        if (typeof d.playing === 'boolean') videoRegistry.current.get(objectId)?.setPlaying(d.playing);
        if (d.url) { const url = d.url; setVideoUrlOverrides(m => ({ ...m, [objectId]: url })); }
        return;
      }
      // 게임 상태+HUD 스냅샷 — 호스트가 보낸 걸 비호스트가 반영 (HUD 표시)
      if (event === GAME_SYNC_EVENT) {
        if (isHostRef.current) return;            // 호스트는 권위자 — 자기 상태 유지
        const snap = (data as { snap?: GameSnapshot }).snap;
        if (snap) gameRuntime.applySnapshot(snap);
        return;
      }
      // 게임 사운드 — 호스트가 친 사운드를 비호스트가 재생 (호스트는 이미 로컬 재생함)
      if (event === GAME_SOUND_EVENT) {
        if (isHostRef.current) return;
        const d = data as { url?: string; volume?: number; loop?: boolean };
        if (d.url) gameRuntime.playRemoteSound(d.url, { volume: d.volume, loop: d.loop });
        return;
      }
      // 플레이어 제어 명령 — 호스트가 나를 타깃해 보낸 것. 내 로컬 플레이어에 적용.
      if (event === '__pctl__') {
        applyPlayerCmd(data as { t?: string; x?: number; y?: number; z?: number });
        return;
      }
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
      if (SYNC_DEBUG && Math.random() < 0.05) console.log('[ALP-SYNC] recv states', states.length, states.map(s => s.id));
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
      slog('[ALP-SYNC] owner changed', objectId, '→', ownerId, '(me:', playerId, ')');
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
    slog('[ALP-SYNC] grab attempt', objectId, 'currentOwner:', ownersRef.current.get(objectId), 'me:', playerId);
    // grab 은 충돌과 달리 항상 ownership 강제 — 이미 본인 owner 여도 sendObjClaim 으로 서버에 재확인 보냄.
    // 이전엔 "이미 내거면 skip" 했지만, 그 경우 다른 클라가 옛 ownership 정보를 가지고 있으면 sync 안 됨.
    ownersRef.current.set(objectId, playerId);
    syncTargets.current.delete(objectId);
    sendObjClaim?.(objectId);
    slog('[ALP-SYNC] grab claimed', objectId);
    // grab 중에는 1.5s 자동 해제 타이머가 끼어들지 못하게 touching 으로 표시
    touchingRef.current.add(objectId);
    releaseTimerRef.current.delete(objectId);
  }, [playerId, sendObjClaim]);

  const onGrabRelease = useCallback((objectId: string) => {
    slog('[ALP-SYNC] grab release', objectId);
    // grab 종료 — 1.5s 후 자동 release (충돌 grace period 와 동일 흐름)
    touchingRef.current.delete(objectId);
    releaseTimerRef.current.set(objectId, Date.now() + 1500);
  }, []);

  // Player 충돌 콜백 — Optimistic Ownership: 서버 확인 안 기다리고 즉시 본인 owner
  const onObjCollide = useCallback((objectId: string, type: 'enter' | 'exit') => {
    if (type === 'enter') {
      touchingRef.current.add(objectId);
      releaseTimerRef.current.delete(objectId);
      slog('[ALP-SYNC] collide enter', objectId, 'prev owner:', ownersRef.current.get(objectId), 'me:', playerId);
      // 누가 1인칭 grab 중이면 ownership 빼앗지 않음 (grabber 가 권위자 유지)
      const remoteGrabber = remoteGrabbedByRef.current.get(objectId);
      const selfGrabbing  = grabbedStateRef.current.has(objectId);
      if (remoteGrabber && remoteGrabber !== playerId) {
        slog('[ALP-SYNC] skip claim — grabbed by', remoteGrabber);
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
        slog('[ALP-SYNC] claimed', objectId);
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
  // SYNC 수신 필터용 — 진짜 호스트 id (가짜 호스트 broadcast 차단)
  const hostIdRef = useRef(hostId);
  useEffect(() => { hostIdRef.current = hostId; }, [hostId]);

  // 호스트: 비디오 스크린 재생시각을 2초마다 broadcast → 비호스트가 같은 시점으로 맞춤 (watch party)
  // 가드: hostId 가 명시적으로 본인이고 다른 player 가 있을 때만. (들어온 사람이 처음 hostId 초기값으로
  // 자기를 호스트로 오판정해 broadcast 하는 케이스 방지)
  // url 도 함께 — 호스트가 리모컨으로 변경한 url 을 늦게 들어온 사람도 받아 같은 영상 보게.
  const videoUrlOverridesRef = useRef(videoUrlOverrides);
  useEffect(() => { videoUrlOverridesRef.current = videoUrlOverrides; }, [videoUrlOverrides]);

  // 미디어 리모컨 컴포넌트의 url prop → 그 리모컨의 target 화면들에 자동 적용 (호스트만 broadcast, 비호스트는
  // 호스트의 VIDEO_SYNC url 받아 동기화). prop 변경 시 영상이 자동으로 바뀜 — 매번 prompt 안 띄워도 됨.
  useEffect(() => {
    if (!customObjects) return;
    const list = customObjects;
    for (const obj of list) {
      const inst = obj.components?.find(c => c.type === 'videoRemote');
      if (!inst) continue;
      const cmdUrl = String(inst.props?.url ?? '').trim();
      if (!cmdUrl) continue;
      const tokensRaw = String(inst.props?.target ?? '').trim();
      const tokens = tokensRaw ? tokensRaw.split(/[,\s]+/).filter(Boolean) : [];
      const targets = tokens.length === 0
        ? list.filter(x => x.videoUrl && !x.components?.some(c => c.type === 'videoRemote'))
        : list.filter(x => {
            if (tokens.includes(x.id)) return true;
            const nm = (x as { label?: string; name?: string }).label || (x as { name?: string }).name || '';
            return !!nm && tokens.includes(nm);
          });
      for (const t of targets) {
        if (videoUrlOverridesRef.current[t.id] === cmdUrl) continue;
        runVideoControl({ url: cmdUrl }, t.id);
      }
    }
  }, [customObjects, runVideoControl]);
  useEffect(() => {
    if (!isHost || !sendScriptEvent || !hostId || hostId !== playerId) return;
    const iv = setInterval(() => {
      for (const [objId, v] of videoRegistry.current) {
        const t = v.getTime();
        if (!Number.isFinite(t) || t <= 0) continue;
        const url = videoUrlOverridesRef.current[objId];
        sendScriptEvent(objId, VIDEO_SYNC_EVENT, url ? { t, playing: !v.paused(), url } : { t, playing: !v.paused() });
      }
    }, 2000);
    return () => clearInterval(iv);
  }, [isHost, sendScriptEvent, hostId, playerId]);

  // 호스트: 게임 상태+HUD 가 바뀌면 200ms 주기로 전원에게 스냅샷 broadcast → 비호스트도 HUD 표시.
  useEffect(() => {
    if (!isHost || !sendScriptEvent) return;
    const iv = setInterval(() => {
      if (gameRuntime.isDirty()) sendScriptEvent('__game__', GAME_SYNC_EVENT, { snap: gameRuntime.takeSnapshot() });
    }, 200);
    return () => clearInterval(iv);
  }, [isHost, sendScriptEvent, gameRuntime]);

  // 새 플레이어 입장(또는 본인이 호스트가 됨) 시 다음 틱에 스냅샷 재전송 → 늦게 들어온 사람도 현재 HUD 받음.
  const playerCount = Object.keys(players).length;
  useEffect(() => { if (isHost) gameRuntime.markDirty(); }, [isHost, playerCount, gameRuntime]);

  // ── NPC AI — 호스트만 실행 (권위). 10Hz 로 가장 가까운 플레이어 추적/공격. ──
  useEffect(() => {
    if (!isHost) return;
    const tick = () => {
      const all = [...(customObjectsRef.current ?? []), ...runtimeObjectsRef.current];
      // ── Damage AOE 모드 — 주변에 주기적 데미지 ──
      const aoes = all.filter(o => o.components?.some(c => c.type === 'damage' && c.props?.mode === 'aoe'));
      if (aoes.length > 0) {
        const nowAoe = worldElapsed.current;
        for (const src of aoes) {
          const dmg = src.components!.find(c => c.type === 'damage' && c.props?.mode === 'aoe')!;
          const interval = Number(dmg.props?.aoeInterval ?? 1);
          const last = damageAoeRef.current.get(src.id) ?? -interval;
          if (nowAoe - last < interval) continue;
          damageAoeRef.current.set(src.id, nowAoe);
          const srcBody = scriptBodyRefs.current.get(src.id)?.group?.current;
          if (!srcBody) continue;
          const sp = srcBody.position;
          const radius = Number(dmg.props?.aoeRadius ?? 3);
          const r2 = radius * radius;
          const amount = Number(dmg.props?.amount ?? 10);
          const srcTeam = String(dmg.props?.team ?? '');
          for (const tgt of all) {
            if (tgt.id === src.id) continue;
            const tgtHealth = tgt.components?.find(c => c.type === 'health');
            if (!tgtHealth) continue;
            const tgtTeam = String(tgtHealth.props?.team ?? '');
            if (srcTeam && tgtTeam && srcTeam === tgtTeam) continue;
            const tg = scriptBodyRefs.current.get(tgt.id)?.group?.current;
            if (!tg) continue;
            const dx = tg.position.x - sp.x, dy = tg.position.y - sp.y, dz = tg.position.z - sp.z;
            if (dx*dx + dy*dy + dz*dz <= r2) {
              makeObjectAPIRef.current?.(tgt.id).damage?.(amount, { attackerId: src.id, ignoreInvuln: false });
            }
          }
        }
      }

      const npcs = all.filter(o => o.components?.some(c => c.type === 'npc'));
      if (npcs.length === 0) return;
      const players = Object.values(playersRef.current);
      if (players.length === 0) return;
      const now = worldElapsed.current;
      for (const obj of npcs) {
        const npcComp = obj.components!.find(c => c.type === 'npc')!;
        const mode = String(npcComp.props?.mode ?? 'both');
        if (mode === 'idle') continue;
        const aggro = Number(npcComp.props?.aggroRange ?? 15);
        const attackRange = Number(npcComp.props?.attackRange ?? 1.5);
        const cd = Number(npcComp.props?.attackCooldown ?? 1.5);
        const moveSpeed = Number(npcComp.props?.moveSpeed ?? 3);
        // 현재 위치
        const bodyRef = scriptBodyRefs.current.get(obj.id);
        const group = bodyRef?.group.current;
        const body = bodyRef?.body.current;
        if (!group) continue;
        const pos = group.position;
        // 가장 가까운 플레이어
        let nearest: { id: string; x: number; y: number; z: number } | null = null;
        let nearestD = Infinity;
        for (const p of players) {
          const pose = posesRef?.current?.get(p.id);
          if (!pose) continue;
          const dx = pose.x - pos.x, dz = pose.z - pos.z;
          const d = Math.hypot(dx, dz);
          if (d < nearestD) { nearestD = d; nearest = { id: p.id, x: pose.x, y: pose.y, z: pose.z }; }
        }
        if (!nearest || nearestD > aggro) {
          // 감지 X — patrol / both 면 시작 위치 반경 안 랜덤 배회
          if (mode === 'patrol' || mode === 'both') {
            const patrolRadius = Number(npcComp.props?.patrolRadius ?? 8);
            let p = npcPatrolRef.current.get(obj.id);
            if (!p) {
              p = { tx: pos.x, tz: pos.z, nextAt: 0, homeX: pos.x, homeZ: pos.z };
              npcPatrolRef.current.set(obj.id, p);
            }
            if (now >= p.nextAt || Math.hypot(p.tx - pos.x, p.tz - pos.z) < 0.5) {
              // 새 target — 시작 위치 반경 안 랜덤
              const r = Math.sqrt(Math.random()) * patrolRadius;
              const a = Math.random() * Math.PI * 2;
              p.tx = p.homeX + Math.cos(a) * r;
              p.tz = p.homeZ + Math.sin(a) * r;
              p.nextAt = now + 3 + Math.random() * 4;   // 3~7s 후 갱신
            }
            // target 방향으로 이동 (절반 속도)
            const dx = p.tx - pos.x, dz = p.tz - pos.z;
            const dist = Math.hypot(dx, dz);
            if (dist > 0.05) {
              const stepX = (dx / dist) * (moveSpeed * 0.5) * 0.1;
              const stepZ = (dz / dist) * (moveSpeed * 0.5) * 0.1;
              if (body) {
                const cur = body.translation();
                body.setTranslation({ x: cur.x + stepX, y: cur.y, z: cur.z + stepZ }, true);
                const angle = Math.atan2(dx, dz);
                const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0));
                body.setRotation?.({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
              } else {
                group.position.x += stepX;
                group.position.z += stepZ;
                group.rotation.y = Math.atan2(dx, dz);
              }
            }
          }
          continue;
        }
        // 추적
        if (nearestD > attackRange) {
          const dx = nearest.x - pos.x, dz = nearest.z - pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 0.01) {
            const stepX = (dx / dist) * moveSpeed * 0.1;   // 100ms tick
            const stepZ = (dz / dist) * moveSpeed * 0.1;
            if (body) {
              const cur = body.translation();
              body.setTranslation({ x: cur.x + stepX, y: cur.y, z: cur.z + stepZ }, true);
              const angle = Math.atan2(dx, dz);
              const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0));
              body.setRotation?.({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
            } else {
              group.position.x += stepX;
              group.position.z += stepZ;
              group.rotation.y = Math.atan2(dx, dz);
            }
          }
        } else {
          // 공격 사거리 도달 — cooldown
          const last = npcAttackRef.current.get(obj.id) ?? 0;
          if (now - last < cd) continue;
          npcAttackRef.current.set(obj.id, now);
          // damage 컴포넌트 amount + 'npcAttack' 이벤트 broadcast (게임 스크립트가 받음)
          const dmgComp = obj.components!.find(c => c.type === 'damage');
          const amount = dmgComp ? Number(dmgComp.props?.amount ?? 10) : 10;
          sendScriptEvent?.('__npc__', '__npcattack__', {
            npcId: obj.id, targetId: nearest.id, amount, team: String(npcComp.props?.team ?? 'enemy'),
          });
        }
      }
    };
    const iv = setInterval(tick, 100);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost]);

  // 새 플레이어 입장 시 호스트는 자기 uiOverrides 전체를 dump broadcast → 늦은 입장자도 같은 UI 상태.
  useEffect(() => {
    if (!isHost) return;
    if (Object.keys(uiOverrides).length === 0) return;
    for (const [label, ov] of Object.entries(uiOverrides)) {
      sendScriptEvent?.('__ui__', UI_SYNC_EVENT, { label, patch: ov.patch, hidden: ov.hidden });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, playerCount]);

  // 맵 진입 시 worldData (개인 + 전역) 로드 → gameRuntime 캐시 채움.
  useEffect(() => {
    if (!worldId) return;
    const { session } = require('@/lib/api') as typeof import('@/lib/api');
    const tok = session.getToken();
    if (!tok) return;
    backendApi.worldDataList(tok, worldId, 'all')
      .then(({ items }) => {
        gameRuntime.loadDataSnapshot(items.map(e => ({ key: e.key, value: e.value, shared: e.shared })));
      })
      .catch(e => console.warn('[data] initial load fail', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId]);
  // 호스트는 새 플레이어 입장 시 자기 shared 데이터 전체를 dump broadcast → 늦은 입장자도 같은 전역 상태.
  useEffect(() => {
    if (!isHost) return;
    const all = gameRuntime.api.dataAll?.(true) || {};
    const entries = Object.entries(all);
    if (entries.length === 0) return;
    for (const [key, value] of entries) {
      sendScriptEvent?.('__data__', DATA_SYNC_EVENT, { key, value });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, playerCount]);

  // 1인칭 클릭 핸들러 — 버스트는 본인 화면에서 즉시(로컬 피드백). onClick 스크립트는 호스트만
  // 권위적으로 실행하고, 비호스트면 호스트로 전달(__click__)해 호스트가 실행 → broadcast.
  const handleObjectClick = useCallback((objId: string) => {
    triggerClickBurst(objId);
    if (isHostRef.current) {
      luaScripts.current.get(objId)?.callClick(playerId);
      componentScripts.current.get(objId)?.forEach(({ vm }) => vm.callClick(playerId));
    } else if (hostId) {
      sendScriptEvent?.(objId, '__click__', {}, hostId);
    }
  }, [triggerClickBurst, playerId, hostId, sendScriptEvent]);

  // 입장자가 정확한 위치 받게 하려고 — 호스트는 1초에 한 번씩 모든 소유 오브젝트를
  // 강제 broadcast (move threshold 무시). DO 가 캐시해서 신규 입장자에게 init 으로 전달.
  // 비용: 정적 씬도 초당 1회 broadcast. 오브젝트 ~수십 개면 무시 가능.
  const forceBroadcastTickRef = useRef(0);

  // onStart 는 호스트만 실행 (스크립트 권위 = 호스트). 비호스트는 VM 을 pending 에 둔 채 실행 안 함.
  // 호스트가 되는 순간(최초 또는 호스트 이전) pending 을 flush → 새 호스트가 스크립트를 이어받음.
  // pendingStartRef: VM 만들어졌지만 아직 onStart 안 부른 것들
  const pendingStartRef = useRef<Set<import('@/lib/world/jsRuntime').JsScript>>(new Set());
  useEffect(() => {
    if (!isHost) return; // 호스트만 onStart 실행
    for (const vm of pendingStartRef.current) vm.callStart();
    pendingStartRef.current.clear();
  }, [isHost]);
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
        if (SYNC_DEBUG && Math.random() < 0.05) console.log('[ALP-SYNC] sent states', states.length, states.map(s => s.id));
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
        // 부모가 있는 자식은 position 이 "부모 기준 로컬" 좌표다. body 의 월드 위치로 덮어쓰면
        // 수신측 computeWorldTRS 가 부모를 또 합성해 이중 변환(자식이 멀어짐)되므로 원본(로컬) 유지.
        // 정적 자식(벽 등)은 안 움직이니 로컬이 정확하고, 부모가 움직여도 자식은 부모를 따라 합성됨.
        if (obj.parentId) return obj;
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
    const makeObjectAPI = (targetId: string, fallbackObj?: UserMapObject): import('@/lib/world/jsRuntime').JsObjectAPI => {
      makeObjectAPIRef.current = makeObjectAPI;   // collider 이벤트에서 호출되게 ref 등록
      return makeObjectAPIImpl(targetId, fallbackObj);
    };
    const makeObjectAPIImpl = (targetId: string, fallbackObj?: UserMapObject): import('@/lib/world/jsRuntime').JsObjectAPI => ({
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
        // Health — components.health 가 있어야 동작. 없으면 null/0.
        getHp: () => {
          const target = customObjects?.find(o => o.id === targetId) ?? runtimeObjectsRef.current.find(o => o.id === targetId);
          const h = target?.components?.find(c => c.type === 'health');
          if (!h) return null;
          if (!healthStoreRef.current.has(targetId)) {
            const start = Number(h.props?.startHp ?? -1);
            const mx = Number(h.props?.maxHp ?? 100);
            healthStoreRef.current.set(targetId, start < 0 ? mx : start);
          }
          return healthStoreRef.current.get(targetId) ?? 0;
        },
        damage: (amount, opts) => {
          const target = customObjects?.find(o => o.id === targetId) ?? runtimeObjectsRef.current.find(o => o.id === targetId);
          const h = target?.components?.find(c => c.type === 'health');
          if (!h) return 0;
          const mx = Number(h.props?.maxHp ?? 100);
          if (!healthStoreRef.current.has(targetId)) {
            const start = Number(h.props?.startHp ?? -1);
            healthStoreRef.current.set(targetId, start < 0 ? mx : start);
          }
          // invuln 처리
          const invuln = Number(h.props?.invulnTime ?? 0.3);
          if (!opts?.ignoreInvuln && invuln > 0) {
            const last = healthInvulnRef.current.get(targetId) ?? -Infinity;
            const now = worldElapsed.current;
            if (now - last < invuln) return healthStoreRef.current.get(targetId) ?? 0;
            healthInvulnRef.current.set(targetId, now);
          }
          const cur = healthStoreRef.current.get(targetId) ?? 0;
          const next = Math.max(0, cur - Math.max(0, amount));
          healthStoreRef.current.set(targetId, next);
          if (next <= 0) {
            // 사망 처리 — onDeathScript 호출 + destroyOnDeath 면 자동 제거
            try {
              const deathScript = String(h.props?.onDeathScript || '').trim();
              if (deathScript) {
                // eslint-disable-next-line @typescript-eslint/no-implied-eval
                new Function('attackerId', deathScript)(opts?.attackerId || null);
              }
            } catch (e) { console.warn('[health] onDeath script error', e); }
            const destroyOn = h.props?.destroyOnDeath !== false;
            if (destroyOn && targetId.startsWith('rt_')) destroyObject(targetId);
            healthStoreRef.current.delete(targetId);
            healthInvulnRef.current.delete(targetId);
          }
          return next;
        },
        heal: (amount) => {
          const target = customObjects?.find(o => o.id === targetId) ?? runtimeObjectsRef.current.find(o => o.id === targetId);
          const h = target?.components?.find(c => c.type === 'health');
          if (!h) return 0;
          const mx = Number(h.props?.maxHp ?? 100);
          const cur = healthStoreRef.current.get(targetId) ?? mx;
          const next = Math.min(mx, cur + Math.max(0, amount));
          healthStoreRef.current.set(targetId, next);
          return next;
        },
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
      // ── 플레이어 제어 (로컬 플레이어 = 호스트/솔로/시뮬) ──
      teleportLocal: (x, y, z) => playerCtlRef.current?.teleport(x, y, z),
      setSpawn: (x, y, z) => { spawnRef.current = [x, y, z]; },
      respawnLocal: () => { const [x, y, z] = spawnRef.current; playerCtlRef.current?.teleport(x, y + 1, z); },
      setPlayerSpeed: (m) => playerCtlRef.current?.setSpeed(m),
      setPlayerJump: (p) => playerCtlRef.current?.setJump(p),
      isPlayerId: (id) => id === playerId || id === 'player' || !!playersRef.current[id],
      // 특정 플레이어 제어 — 본인이면 직접, 아니면 그 클라로 명령 라우팅(__pctl__ 타깃 전송).
      controlPlayer: (id, cmd) => {
        if (id === playerId || id === 'player' || id === '__sim_player__') applyPlayerCmd(cmd);
        else sendScriptEvent?.('__pctl__', '__pctl__', cmd, id);
      },
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
      vm.init(obj.script!, objectAPI, worldAPI, netAPI, undefined, obj.scriptVars, gameRuntime.api);
      if (isHostRef.current) vm.callStart();   // 호스트만 onStart 실행 (비호스트는 pending → 호스트 되면 실행)
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
        // props 를 props 글로벌 + 변수 오버라이드 둘 다로 전달 → 코드에서 props.speed 또는 let speed 둘 다 동작
        vm2.init(def.code, objAPI, worldAPI, userNetAPI, inst.props ?? {}, inst.props ?? {}, gameRuntime.api);
        if (isHostRef.current) vm2.callStart();   // 호스트만 onStart (비호스트는 pending → 호스트 되면 실행)
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

  // 카메라 모드 (1인칭 / 3인칭) — V 키 토글 + 월드 설정에서 제어.
  // 페이지가 cameraMode prop 을 주면 controlled, 없으면 내부 상태(기본 3인칭).
  const [internalCameraMode, setInternalCameraMode] = useState<CameraMode>(cameraModeProp ?? 'third');
  const cameraMode = cameraModeProp ?? internalCameraMode;
  const toggleCameraMode = useCallback(() => {
    const next: CameraMode = cameraMode === 'first' ? 'third' : 'first';
    if (onCameraModeChange) onCameraModeChange(next);
    else setInternalCameraMode(next);
  }, [cameraMode, onCameraModeChange]);
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

      {/* 게임 HUD — 스크립트 ui.text/ui.bar 가 그림. 전체화면 위 오버레이(클릭 통과). */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 16777272, pointerEvents: 'none' }}>
        <GameHud runtime={gameRuntime} />
      </div>

      {/* Tab 안내: 마우스 커서 켜기(영상·UI 클릭) ↔ 끄기(화면 회전). 데스크톱만. */}
      {!isMobile && !chatInputActive && (
        <div style={{
          position: 'fixed', bottom: 14, left: '50%', transform: 'translateX(-50%)',
          pointerEvents: 'none', zIndex: 16777274,
          fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 600,
          background: 'rgba(0,0,0,0.4)', padding: '4px 10px', borderRadius: 999,
          textShadow: '0 1px 2px rgba(0,0,0,0.7)', whiteSpace: 'nowrap',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <kbd style={{
            background: 'rgba(255,255,255,0.18)', borderRadius: 4, padding: '1px 6px',
            fontFamily: 'inherit', fontSize: 10.5, fontWeight: 700,
          }}>Tab</kbd>
          마우스 커서 켜기/끄기 (버튼·UI 클릭 ↔ 화면 회전)
        </div>
      )}

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
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', zIndex: 16777274, mixBlendMode: useBlend ? 'difference' : 'normal' }}>
              <div style={{ position: 'absolute', width: 14, height: 2, background: ch, left: -7, top: -1 }} />
              <div style={{ position: 'absolute', width: 2, height: 14, background: ch, left: -1, top: -7 }} />
              <div style={{ position: 'absolute', width: 3, height: 3, borderRadius: '50%', background: ch, left: -1.5, top: -1.5 }} />
            </div>
            {hint && (
              <div style={{
                position: 'fixed', top: 'calc(50% + 28px)', left: '50%', transform: 'translateX(-50%)',
                pointerEvents: 'none', zIndex: 16777274,
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
          position: 'fixed', top: 16, right: 16, zIndex: 16777274,
          background: 'rgba(0,0,0,0.45)', color: '#fff',
          border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10,
          padding: '7px 11px', fontSize: 12, fontWeight: 700,
          cursor: 'pointer', backdropFilter: 'blur(6px)',
        }}
      >
        {cameraMode === 'first' ? '👁 1인칭' : '🎥 3인칭'} (V)
      </button>

      {/* blending occlude 용 배경 — 캔버스가 투명이라 이 div 가 대신 배경색 제공. */}
      <div style={{ position: 'fixed', inset: 0, background: showSky ? '#87ceeb' : '#0a0a0f', zIndex: -1 }} />
      <Canvas
        shadows={{ enabled: true, type: THREE.PCFShadowMap, autoUpdate: true }}
        camera={{ fov: 60, near: 0.3, far: graphics.farClip, position: [0, 8, 12] }}
        dpr={adaptiveDpr}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: 'high-performance',
          stencil: false,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.7,
        }}
        style={{ width: '100vw', height: '100vh', display: 'block', transform: 'translateZ(0)', willChange: 'transform', zIndex: 16777271, position: 'fixed', inset: 0 }}
      >
        {/* 조명 — sceneSettings 기반 */}
        <ambientLight intensity={ambientIntensity} />
        {dirIntensity > 0 && (
          <directionalLight
            position={[20, 30, 10]}
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
          // 부모(Manager 등) 변환 반영한 월드 위치 — 방향광은 위치→원점 방향으로 비추므로
          // 부모 변환이 빠지면 빛 방향이 틀어진다(스튜디오와 불일치 → 어두움). 메시와 동일 규약.
          const lpos = o.parentId ? computeWorldTRS(o, objectsById).position : o.position;
          // ref 콜백: 스크립트에서 light.color / light.intensity 직접 제어 가능하게 등록
          const refCb = (light: THREE.Light | null) => {
            if (light) lightRefs.current.set(o.id, light);
            else lightRefs.current.delete(o.id);
          };
          return o.kind === 'pointlight' ? (
            <pointLight key={o.id} ref={refCb}
              position={lpos} color={o.lightColor || '#ffffff'}
              intensity={o.lightIntensity ?? 1} distance={dist}
              decay={1} castShadow={o.castShadow ?? false}
              shadow-camera-near={0.1} shadow-camera-far={shadowFar} />
          ) : o.kind === 'dirlight' ? (
            <directionalLight key={o.id} ref={refCb}
              position={lpos} color={o.lightColor || '#ffffff'}
              intensity={o.lightIntensity ?? 1}
              castShadow={o.castShadow ?? false}
              shadow-mapSize={shadowMapSize}
              shadow-camera-left={-80} shadow-camera-right={80}
              shadow-camera-top={80} shadow-camera-bottom={-80}
              shadow-camera-near={0.1} shadow-camera-far={200}
              shadow-bias={-0.0005} />
          ) : (
            <spotLight key={o.id} ref={refCb}
              position={lpos} color={o.lightColor || '#ffffff'}
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
        {/* 그림자맵을 매 프레임이 아니라 ~30Hz 로만 갱신 → 큰 그림자맵 렌더 부하 절감 */}
        {shadowsEnabled && <ShadowUpdateThrottle hz={30} />}
        {/* 거리 기반 culling — 카메라에서 cullDistance 너머 mesh 안 그림 */}
        <PerfManager cullDistance={graphics.cullDistance} />
        {/* fps 자동 측정 — 60fps 못 유지하면 dpr 0.75 단계로 낮춤. 회복되면 다시 올림.
            min/max bound 로 0.5~1.0 사이만 조정 — 너무 흐려지지 않게. */}
        <PerformanceMonitor bounds={() => [50, 60]} flipflops={3}
          onIncline={() => setDprFactor(1)}
          onDecline={() => setDprFactor((f) => Math.max(0.5, f - 0.25))}
          onFallback={() => setDprFactor(0.5)}
        />
        <ExposureUpdater exposure={exposure} hdriIntensity={hdriIntensity} />
        <CanvasPointerEventsKeeper />

        {/* 스튜디오 시뮬레이션과 동일한 Sky 파라미터(기본 turbidity/rayleigh) — WYSIWYG 일치 */}
        {showSky && !hdriBackground && <Sky sunPosition={[20, 10, 10]} />}
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
          <VideoScreenCtx.Provider value={videoCtxValue}>
          <Physics gravity={[0, gravityY, 0]} interpolate={false}>
            {customObjects !== undefined ? (
              // 유저 제작 월드 — 기본 그라운드 없음. 필요하면 평면 직접 배치
              // runtimeObjects: 스크립트 world.spawn() 으로 동적 생성된 것 (로컬 전용, 저장 안 됨)
              <>{(() => {
                const base = [...customObjects, ...runtimeObjects];
                // 런타임 URL 오버라이드(컨트롤 바에서 변경) 적용 — 오버라이드 없으면 원본 ref 유지(재렌더 방지)
                const list = Object.keys(videoUrlOverrides).length === 0 ? base
                  : base.map(o => videoUrlOverrides[o.id] !== undefined ? { ...o, videoUrl: videoUrlOverrides[o.id] } : o);
                const byId = new Map(list.map(o => [o.id, o]));
                const meshes = list
                  .filter(o => !o.hidden && o.kind !== 'pointlight' && o.kind !== 'spotlight' && o.kind !== 'dirlight' && o.kind !== 'spawn'
                    && o.kind !== 'ui'   // UI 오브젝트는 3D 씬 X, UIRenderer 가 HTML overlay 로 처리
                    && o.kind !== 'sound'   // Sound 는 시각 X, SoundEmitter 가 처리
                    && (o.kind !== 'empty' || o.components?.some(c => c.type === 'collider')))   // 콜라이더 있는 빈 오브젝트(트리거 존)는 렌더
                  .map(obj => (
                    <UserMapObjectMesh key={obj.id} obj={obj}
                      world={obj.parentId ? computeWorldTRS(obj, byId) : undefined}
                      scriptBodyRefs={scriptBodyRefs} onColliderEvent={dispatchColliderEvent} />
                  ));
                // 파티클 레이어 — 빈 오브젝트 포함 모든 kind (물리 바디 밖, 메시 렌더와 별개)
                const particles = list
                  .filter(o => !o.hidden && o.components?.some(c => c.type === 'particle'))
                  .map(obj => {
                    const inst = obj.components!.find(c => c.type === 'particle')!;
                    const w = obj.parentId ? computeWorldTRS(obj, byId) : { position: obj.position, rotation: obj.rotation, scale: obj.scale };
                    return (
                      <group key={'pfx-' + obj.id} position={w.position} rotation={w.rotation} scale={w.scale}>
                        <Particles s={deriveParticleSettings(inst)} objId={obj.id} burstRef={clickBurstRef} />
                      </group>
                    );
                  });
                // 비디오 리모컨 레이어 — videoRemote 컴포넌트가 붙은 오브젝트 위치에 3D 조작 패널.
                const remotes = list
                  .filter(o => !o.hidden && o.components?.some(c => c.type === 'videoRemote'))
                  .map(obj => {
                    const inst = obj.components!.find(c => c.type === 'videoRemote')!;
                    const tokensRaw = String(inst.props?.target ?? '').trim();
                    const tokens = tokensRaw ? tokensRaw.split(/[,\s]+/).filter(Boolean) : [];
                    const targets = tokens.length === 0
                      ? list.filter(x => x.videoUrl && !x.components?.some(c => c.type === 'videoRemote'))
                      : list.filter(x => {
                          if (tokens.includes(x.id)) return true;
                          const nm = (x as { label?: string; name?: string }).label || (x as { name?: string }).name || '';
                          return !!nm && tokens.includes(nm);
                        });
                    if (targets.length === 0) return null;
                    const w = obj.parentId ? computeWorldTRS(obj, byId) : { position: obj.position };
                    const firstId = targets[0].id;
                    const targetIds = targets.map(t => t.id);
                    const curUrl = (videoUrlOverrides[firstId] ?? targets[0].videoUrl) || '';
                    const rW  = Number(inst.props?.width  ?? 1.6);
                    const rH  = Number(inst.props?.height ?? 0.8);
                    const rOy = Number(inst.props?.offsetY ?? 1);
                    return (
                      <group key={'vr-' + obj.id} position={w.position}>
                        <VideoRemotePanel
                          registry={videoRegistry} targetId={firstId} videoUrl={curUrl}
                          width={rW} height={rH} offsetY={rOy}
                          onSeekBy={(d) => targetIds.forEach(tid => runVideoControl({ seekBy: d }, tid))}
                          onSeekTo={(t) => targetIds.forEach(tid => runVideoControl({ seekTo: t }, tid))}
                          onTogglePlay={(p) => targetIds.forEach(tid => runVideoControl({ playing: p }, tid))}
                          onChangeUrl={() => {
                            const u = window.prompt('새 URL (YouTube / mp4 / gif / 호스팅 게임 등)', targets[0].videoUrl || '');
                            if (u && u.trim()) targetIds.forEach(tid => runVideoControl({ url: u.trim() }, tid));
                          }}
                        />
                      </group>
                    );
                  });
                // Flashlight 컴포넌트 — 부착된 오브젝트들의 spotlight 따로 마운트
                const flashlights = list
                  .filter(o => !o.hidden && o.components?.some(c => c.type === 'flashlight'))
                  .map(o => {
                    const comp = o.components!.find(c => c.type === 'flashlight')!;
                    const bodyRef = scriptBodyRefs.current.get(o.id);
                    const gRef = (bodyRef?.group ?? { current: null }) as React.MutableRefObject<THREE.Group | null>;
                    return <FlashlightLight key={'fl-' + o.id} comp={comp} groupRef={gRef}
                      objId={o.id} playerId={playerId} grabbedStateRef={grabbedStateRef} />;
                  });
                // Sound 오브젝트 — 위치 기반 3D 사운드
                const sounds = list
                  .filter(o => !o.hidden && o.kind === 'sound' && o.soundUrl)
                  .map(o => {
                    const w = o.parentId ? computeWorldTRS(o, byId) : { position: o.position };
                    return <SoundEmitter key={'snd-' + o.id}
                      url={o.soundUrl!}
                      position={w.position}
                      volume={o.soundVolume ?? 0.8}
                      loop={o.soundLoop !== false}
                      autoplay={o.soundAutoplay !== false}
                      radius={o.soundRadius ?? 10} />;
                  });
                return <>{meshes}{particles}{remotes}{flashlights}{sounds}</>;
              })()}</>
            ) : (
              // worldId 없음 (기본 월드) → 데모 섬
              <Island />
            )}
            <Player character={character} bubble={chatBubbles[playerId]} onMove={onMove} inputLocked={chatInputActive} emoteSlot={emoteSlot} emoteOneShotOverride={emoteOneShotOverride} onObjCollide={onObjCollide} cameraMode={cameraMode} onToggleCameraMode={toggleCameraMode} scriptBodyRefs={scriptBodyRefs} luaScripts={luaScripts} componentScripts={componentScripts} ownersRef={ownersRef} playerId={playerId} grabbedStateRef={grabbedStateRef} grabbableIdsRef={grabbableIdsRef} onGrabUiChange={setCrosshairState} onGrabClaim={onGrabClaim} onGrabRelease={onGrabRelease} remoteGrabbedByRef={remoteGrabbedByRef} jumpPower={jumpPower} spawnPos={spawnPick.pos} spawnRotY={spawnPick.rotY} localPoseRef={localPoseRef} portalRef={portalRef} onPortalEnter={onPortalEnter} firstPersonFov={firstPersonFov} onObjectClick={handleObjectClick} playerCtlRef={playerCtlRef} spawnRef={spawnRef} />
            {Object.values(players).map((p) => (
              <RemotePlayerMesh key={p.id} player={p} posesRef={posesRef} bubble={chatBubbles[p.id]} castShadow={graphics.remoteShadows} />
            ))}
            {portal && <WorldPortal portal={portal} />}
          </Physics>
          </VideoScreenCtx.Provider>
        </Suspense>
        {/* World Space UI — canvas.space === 'world' 인 UI 오브젝트를 3D 공간에 렌더 */}
        <UIWorldRenderer
          objects={(customObjects ?? []).filter(o => o.kind === 'ui' && o.ui).map(o => {
            const ov = o.label ? uiOverrides[o.label] : undefined;
            return {
              id: o.id, parentId: o.parentId,
              hidden: ov?.hidden !== undefined ? ov.hidden : o.hidden,
              ui: ov?.patch ? ({ ...(o.ui as UiData), ...ov.patch }) : o.ui!,
              position: o.position, rotation: o.rotation, scale: o.scale,
            };
          })}
          editMode={false}
          onButtonClick={(_id, script) => execUiButtonScript(script, gameRuntime.api)}
          onValueChange={(_id, script, value) => execUiButtonScript(script, gameRuntime.api, value)}
        />
        <PostFX s={postFX} />
      </Canvas>
      {/* UI Renderer — Screen Space HTML overlay (Phase 1).
          customObjects + uiOverrides merge: 호스트가 ui.set/show/hide 한 결과를 비호스트도 같이 봄. */}
      <UIRenderer
        objects={(customObjects ?? []).filter(o => o.kind === 'ui' && o.ui).map(o => {
          const ov = o.label ? uiOverrides[o.label] : undefined;
          return {
            id: o.id, parentId: o.parentId,
            hidden: ov?.hidden !== undefined ? ov.hidden : o.hidden,
            ui: ov?.patch ? ({ ...(o.ui as UiData), ...ov.patch }) : o.ui!,
          };
        })}
        editMode={false}
        onButtonClick={(_id, script) => execUiButtonScript(script, gameRuntime.api)}
        onValueChange={(_id, script, value) => execUiButtonScript(script, gameRuntime.api, value)}
      />
      <MapLoadingOverlay />
    </>
  );
}
