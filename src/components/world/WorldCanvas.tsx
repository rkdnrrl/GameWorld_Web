'use client';
import React, { Suspense, useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sky, Text } from '@react-three/drei';
import { Physics, RigidBody, CapsuleCollider, useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import type { RemotePlayer, PlayerPose } from '@/lib/world/useGameSocket';
import type { GraphicsSettings } from '@/lib/world/graphicsSettings';
import { DEFAULT_SETTINGS } from '@/lib/world/graphicsSettings';

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
function autoNormalize(obj: THREE.Object3D, rotX = 0, targetHeight = 1.8) {
  // 1) 회전 먼저 (Z-up → Y-up 변환 포함)
  obj.position.set(0, 0, 0);
  obj.rotation.set(rotX, 0, 0);
  obj.updateMatrixWorld(true);

  // 2) 회전 적용 상태에서 높이 측정 → 스케일
  const box  = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const h    = Math.max(size.x, size.y, size.z);
  if (h > 0) {
    obj.scale.multiplyScalar(targetHeight / h);
    obj.updateMatrixWorld(true);
  }

  // 3) 회전·스케일 적용 후 실제 발 위치(box.min.y)를 y=0 으로
  const box2 = new THREE.Box3().setFromObject(obj);
  obj.position.y -= box2.min.y;
}

/* ── 애니메이션 상태 타입 ─────────────── */
export type AnimState = 'idle' | 'walk' | 'run' | 'jump' | 'crouch' | 'prone';

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
  idle:   ['idle', 'stand', 'tpose', 't-pose', '유휴', '대기'],
  walk:   ['walk', 'walking', '걷기', '걷다'],
  run:    ['run', 'running', 'sprint', 'jog', '달리', '뛰'],
  jump:   ['jump', 'jumping', '점프'],
  crouch: ['crouch', 'crouching', 'duck', '앉', 'squat'],
  prone:  ['prone', 'lying', 'lie', '엎드', '눕'],
};

function CustomModel({ url, userScale, rotX, animStateRef, animNames, animTrims, castShadow = true }: {
  url: string;
  userScale: number;
  rotX: number;
  animStateRef?: React.RefObject<AnimState>;
  animNames?: Partial<Record<AnimState, string>>;
  animTrims?: Partial<Record<AnimState, AnimTrim>>;
  castShadow?: boolean;
}) {
  const [obj, setObj]   = useState<THREE.Object3D | null>(null);
  const mixer           = useRef<THREE.AnimationMixer | null>(null);
  const clipByState     = useRef<Map<AnimState, THREE.AnimationClip>>(new Map());
  const currentAction   = useRef<THREE.AnimationAction | null>(null);
  const currentState    = useRef<AnimState | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;

    const setupMixer = (loaded: THREE.Object3D, anims: THREE.AnimationClip[]) => {
      if (!anims.length) return;
      mixer.current = new THREE.AnimationMixer(loaded);
      clipByState.current.clear();

      // 각 state별로 명시 이름 우선, 없으면 키워드 휴리스틱으로 매칭
      const findByExact = (name?: string) => name ? anims.find(a => a.name === name) : undefined;
      const findByKeyword = (needles: string[]) =>
        anims.find(a => {
          const lname = a.name.toLowerCase();
          return needles.some(n => lname.includes(n.toLowerCase()));
        });

      (['idle', 'walk', 'run', 'jump', 'crouch', 'prone'] as AnimState[]).forEach(state => {
        const src = findByExact(animNames?.[state]) ?? findByKeyword(KEYWORD_FALLBACK[state]);
        if (src) clipByState.current.set(state, trimClip(src, animTrims?.[state]));
      });

      // 클립이 하나도 매칭 안 됐고 애니메이션은 있으면 첫 번째를 idle로 사용
      if (clipByState.current.size === 0 && anims.length > 0) {
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
      setupMixer(cloned, anims);
      setObj(cloned);
    })();
    return () => {
      cancelled = true;
      mixer.current?.stopAllAction();
      mixer.current = null;
      currentAction.current = null;
      currentState.current = null;
    };
  }, [url, animNames, animTrims]);

  // castShadow prop 변경 시 모든 mesh에 즉시 반영
  useEffect(() => {
    if (!obj) return;
    obj.traverse(c => {
      if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).castShadow = castShadow;
    });
  }, [castShadow, obj]);

  // 단일 액션 크로스페이드 (state 바뀔 때만 전환)
  useFrame((_, dt) => {
    mixer.current?.update(dt);
    if (!mixer.current) return;

    const desired = animStateRef?.current || 'idle';
    if (desired === currentState.current) return;

    // 매칭되는 클립 없으면 idle로 폴백
    const targetClip = clipByState.current.get(desired) || clipByState.current.get('idle');
    if (!targetClip) return;

    const nextAction = mixer.current.clipAction(targetClip);
    if (nextAction === currentAction.current) {
      currentState.current = desired;
      return;
    }

    nextAction.reset().fadeIn(0.2).play();
    if (currentAction.current) currentAction.current.fadeOut(0.2);
    currentAction.current = nextAction;
    currentState.current = desired;
  });

  if (!obj) return null;
  // rotX 와 발 정렬은 autoNormalize 가 obj 안에서 처리.
  // 캡슐 콜라이더 바닥에 발 맞추기 (캡슐 바닥은 body 중심 -0.63m)
  return (
    <group scale={userScale} position={[0, -0.63, 0]}>
      <primitive object={obj} />
    </group>
  );
}

/* ── 캐릭터 메쉬 (커스텀 or 블록형) ───── */
function CharacterMesh({ appearance, animStateRef, castShadow = true }: {
  appearance: Record<string, unknown>;
  animStateRef?: React.RefObject<AnimState>;
  castShadow?: boolean;
}) {
  const modelUrl   = appearance.modelUrl as string | undefined;
  const userScale  = Number(appearance.modelScale) || 1.0;
  const rotX       = Number(appearance.fbxRotX ?? -Math.PI / 2);
  const trims      = (appearance.animTrims ?? {}) as Partial<Record<AnimState, AnimTrim>>;

  if (modelUrl) {
    return (
      <CustomModel
        url={modelUrl}
        userScale={userScale}
        rotX={rotX}
        castShadow={castShadow}
        animStateRef={animStateRef}
        animNames={{
          idle:   appearance.idleAnim   as string | undefined,
          walk:   appearance.walkAnim   as string | undefined,
          run:    appearance.runAnim    as string | undefined,
          jump:   appearance.jumpAnim   as string | undefined,
          crouch: appearance.crouchAnim as string | undefined,
          prone:  appearance.proneAnim  as string | undefined,
        }}
        animTrims={trims}
      />
    );
  }
  return <BlockMesh appearance={appearance as Record<string, string>} />;
}

/* ── 블록형 기본 캐릭터 ─────────────────── */
function BlockMesh({ appearance }: { appearance: Record<string, string> }) {
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

/* ── 그래픽 설정 변경 시 셰도우맵 강제 갱신 ── */
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

/* ── 로컬 플레이어 컨트롤러 ─────────────── */
function Player({
  character,
  onMove,
}: {
  character: Record<string, unknown>;
  onMove: (p: { x: number; y: number; z: number; rotY: number; animState?: AnimState }) => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body      = useRef<any>(null);
  const mesh      = useRef<THREE.Group>(null);
  const { rapier, world: rWorld } = useRapier();
  const { camera, gl } = useThree();

  /* 직접 DOM 키 추적 — KeyboardControls 컨텍스트 문제 우회 */
  const keys = useRef(new Set<string>());

  const camH     = useRef(0);
  const camV     = useRef(0.45);
  const isLocked = useRef(false);
  const lastSend = useRef(0);
  const jumpPrev = useRef(false);
  const lastPos  = useRef(new THREE.Vector3(0, 1, 0));
  // 현재 애니메이션 상태 (CustomModel이 참조)
  const animStateRef = useRef<AnimState>('idle');
  // 토글 키: C(앉기), Z(엎드리기)
  const crouchRef = useRef(false);
  const proneRef  = useRef(false);
  // 점프 상태 최소 유지 시간 (애니메이션 재생 보장)
  const jumpHoldUntil = useRef(0);

  /* 키보드 + 포인터 락 */
  useEffect(() => {
    const el = gl.domElement;

    // 키보드
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      keys.current.add(e.code);
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
      // 토글 키
      if (e.code === 'KeyC') { crouchRef.current = !crouchRef.current; if (crouchRef.current) proneRef.current = false; }
      if (e.code === 'KeyZ') { proneRef.current  = !proneRef.current;  if (proneRef.current)  crouchRef.current = false; }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code);

    // 마우스
    const onMouseMove = (e: MouseEvent) => {
      if (!isLocked.current) return;
      camH.current -= e.movementX * 0.003;
      camV.current  = Math.max(0.05, Math.min(1.3, camV.current + e.movementY * 0.003));
    };
    const onLockChange = () => { isLocked.current = !!document.pointerLockElement; };
    const onClick = () => el.requestPointerLock();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onLockChange);
    el.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onLockChange);
      el.removeEventListener('click', onClick);
    };
  }, [gl]);

  useFrame((_, dt) => {
    /* ── 물리 바디가 준비된 경우에만 이동 처리 ── */
    if (body.current) {
      try {
      const k = keys.current;
      const forward  = k.has('KeyW') || k.has('ArrowUp');
      const backward = k.has('KeyS') || k.has('ArrowDown');
      const left     = k.has('KeyA') || k.has('ArrowLeft');
      const right    = k.has('KeyD') || k.has('ArrowRight');
      const jump     = k.has('Space');
      const sprint   = k.has('ShiftLeft');
      const vel  = body.current.linvel();
      const posT = body.current.translation();

      // 상태 기반 속도
      const isCrouch = crouchRef.current;
      const isProne  = proneRef.current;
      const SPEED    = isProne ? 1.0 : isCrouch ? 2.5 : sprint ? 9 : 5;

      // 추락 방지: y가 너무 낮으면 스폰 위치로 복귀
      if (posT.y < -50) {
        body.current.setTranslation({ x: 0, y: 5, z: 0 }, true);
        body.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
        return;
      }

      lastPos.current.set(posT.x, posT.y, posT.z);

      const sinH = Math.sin(camH.current);
      const cosH = Math.cos(camH.current);
      let mx = 0, mz = 0;
      if (forward)  { mx -= sinH; mz -= cosH; }
      if (backward) { mx += sinH; mz += cosH; }
      if (left)     { mx -= cosH; mz += sinH; }
      if (right)    { mx += cosH; mz -= sinH; }

      const len = Math.sqrt(mx * mx + mz * mz);
      if (len > 0) { mx /= len; mz /= len; }
      body.current.setLinvel({ x: mx * SPEED, y: vel.y, z: mz * SPEED }, true);

      // 지면 체크
      const ray = new rapier.Ray({ x: posT.x, y: posT.y, z: posT.z }, { x: 0, y: -1, z: 0 });
      const hit = rWorld.castRay(ray, 1.3, true);
      const onGround = !!(hit && hit.timeOfImpact < 0.7);

      // 점프: Space가 새로 눌렸을 때만 1번 (앉기/엎드리기 중엔 점프 금지)
      const jumpJustPressed = jump && !jumpPrev.current;
      jumpPrev.current = jump;
      if (jumpJustPressed && onGround && !isCrouch && !isProne) {
        // 7 m/s → 약 1.1m 점프, 공중 체공 시간 ~0.64초
        body.current.setLinvel({ x: vel.x, y: 7, z: vel.z }, true);
        // 애니메이션이 끊기지 않도록 최소 500ms 점프 상태 유지
        jumpHoldUntil.current = Date.now() + 500;
      }

      // 캐릭터 회전 (엎드리기 중엔 회전 안 함)
      if (mesh.current && len > 0 && !isProne) {
        const target = Math.atan2(mx, mz);
        mesh.current.rotation.y = lerpAngle(mesh.current.rotation.y, target, Math.min(1, 12 * dt));
      }

      // 현재 애니메이션 상태 결정
      const moving      = len > 0;
      const inJumpHold  = Date.now() < jumpHoldUntil.current;
      let state: AnimState = 'idle';
      if (!onGround || inJumpHold) state = 'jump';
      else if (isProne)            state = 'prone';
      else if (isCrouch)           state = 'crouch';
      else if (moving)             state = sprint ? 'run' : 'walk';
      animStateRef.current = state;

      const now = Date.now();
      if (now - lastSend.current > 100) {
        lastSend.current = now;
        onMove({ x: posT.x, y: posT.y, z: posT.z, rotY: mesh.current?.rotation.y ?? 0, animState: state });
      }
      } catch { /* Rapier 초기화 중 에러 무시 */ }
    }

    /* ── 카메라는 항상 lastPos를 따라감 (물리 초기화 여부 무관) ── */
    const p    = lastPos.current;
    const dist = 7;
    const tx   = p.x + dist * Math.sin(camH.current) * Math.cos(camV.current);
    const ty   = p.y + dist * Math.sin(camV.current) + 0.5;
    const tz   = p.z + dist * Math.cos(camH.current) * Math.cos(camV.current);
    // 카메라 즉시 추적 — lerp 지연이 빠른 이동 시 blur를 유발하므로 직접 set
    camera.position.set(tx, ty, tz);
    camera.lookAt(p.x, p.y + 0.7, p.z);
  });

  const appearance = (character.appearance ?? {}) as Record<string, string>;

  return (
    <RigidBody
      ref={body}
      colliders={false}
      mass={1}
      lockRotations
      position={[0, 4, 0]}
      linearDamping={0.6}
    >
      <CapsuleCollider args={[0.35, 0.28]} />
      <group ref={mesh} position={[0, -0.35, 0]}>
        <CharacterMesh appearance={appearance} animStateRef={animStateRef} />
      </group>
    </RigidBody>
  );
}

/* ── 원격 플레이어 ──────────────────────── */
function RemotePlayerMesh({ player, posesRef, castShadow }: {
  player: RemotePlayer;
  posesRef: React.RefObject<Map<string, PlayerPose>>;
  castShadow?: boolean;
}) {
  const g    = useRef<THREE.Group>(null);
  const tPos = useRef(new THREE.Vector3());
  const animStateRef = useRef<AnimState>('idle');

  // 매 프레임: ref에서 직접 읽음 → React 재렌더 안 함
  useFrame((_, dt) => {
    if (!g.current) return;
    const pose = posesRef.current?.get(player.id);
    if (!pose) return;
    tPos.current.set(pose.x, pose.y, pose.z);
    g.current.position.lerp(tPos.current, Math.min(1, 10 * dt));
    g.current.rotation.y = lerpAngle(g.current.rotation.y, pose.rotY, Math.min(1, 10 * dt));
    animStateRef.current = pose.animState ?? 'idle';
  });

  const appearance = ((player.character as Record<string, unknown>)?.appearance ?? {}) as Record<string, unknown>;

  return (
    <group ref={g}>
      <group position={[0, -0.35, 0]}>
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
    </group>
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
  kind: 'cube' | 'sphere' | 'cylinder' | 'plane' | 'asset';
  assetUrl?: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale:    [number, number, number];
  color:    string;
  // 머티리얼/텍스처 (선택)
  material?:        MaterialPreset;
  materialColor?:   string;
  textureAlbedo?:    string;  // URL
  textureNormal?:    string;
  textureRoughness?: string;
  textureTilingX?:   number;
  textureTilingY?:   number;
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

function UserMapObjectMesh({ obj }: { obj: UserMapObject }) {
  if (obj.kind === 'asset' && obj.assetUrl) {
    return (
      <RigidBody type="fixed" colliders="trimesh" position={obj.position} rotation={obj.rotation} scale={obj.scale}>
        <UserAsset url={obj.assetUrl} matObj={obj} />
      </RigidBody>
    );
  }
  const shape =
    obj.kind === 'sphere'   ? <sphereGeometry args={[0.5, 24, 16]} /> :
    obj.kind === 'cylinder' ? <cylinderGeometry args={[0.5, 0.5, 1, 16]} /> :
    obj.kind === 'plane'    ? <planeGeometry args={[1, 1]} /> :
                              <boxGeometry args={[1, 1, 1]} />;
  return (
    <RigidBody type="fixed" colliders="cuboid" position={obj.position} rotation={obj.rotation} scale={obj.scale}>
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
    import('three/examples/jsm/loaders/FBXLoader.js').then(({ FBXLoader }) => {
      new FBXLoader().load(url, (fbx) => {
        if (cancelled) return;
        fbx.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(fbx);
        const size = box.getSize(new THREE.Vector3());
        const h = Math.max(size.x, size.y, size.z);
        if (h > 0) fbx.scale.multiplyScalar(1 / h);
        // 원본 머티리얼 저장
        originalMats.current.clear();
        fbx.traverse(c => {
          const m = c as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            originalMats.current.set(m, m.material);
          }
        });
        setObj(fbx);
      });
    });
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
  players: Record<string, RemotePlayer>;
  posesRef: React.RefObject<Map<string, PlayerPose>>;
  onMove: (pos: { x: number; y: number; z: number; rotY: number; animState?: AnimState }) => void;
  customObjects?: UserMapObject[];
  graphics?: GraphicsSettings;
}

export default function WorldCanvas({ character, players, posesRef, onMove, customObjects, graphics = DEFAULT_SETTINGS }: WorldCanvasProps) {
  const shadowsEnabled = graphics.shadowSize > 0;
  const shadowMapSize: [number, number] = [graphics.shadowSize || 1024, graphics.shadowSize || 1024];
  return (
      <Canvas
        shadows={{ enabled: true, type: THREE.PCFShadowMap, autoUpdate: true }}
        camera={{ fov: 60, near: 0.1, far: graphics.farClip, position: [0, 8, 12] }}
        dpr={graphics.dpr}
        gl={{
          antialias: true, // 항상 켬 (런타임 변경 시 WebGL 컨텍스트 손실)
          powerPreference: 'high-performance',
          stencil: false,
        }}
        style={{ width: '100vw', height: '100vh', display: 'block', background: '#87ceeb', transform: 'translateZ(0)', willChange: 'transform' }}
      >
        {/* 조명 — Bruno Simon 스타일 */}
        <ambientLight intensity={0.45} color="#c4e4ff" />
        <directionalLight
          position={[25, 40, 15]}
          intensity={1.8}
          castShadow={shadowsEnabled}
          shadow-mapSize={shadowMapSize}
          shadow-camera-left={-60}
          shadow-camera-right={60}
          shadow-camera-top={60}
          shadow-camera-bottom={-60}
          color="#fff4d0"
        />
        <hemisphereLight args={['#87ceeb', '#4ade80', 0.3]} />

        <GraphicsApplier
          shadowSize={graphics.shadowSize}
          shadowFilter={graphics.shadowFilter}
          shadowRadius={graphics.shadowRadius}
        />

        <Sky sunPosition={[25, 10, 15]} turbidity={0.4} rayleigh={0.25} />

        <Suspense fallback={null}>
          <Physics gravity={[0, -22, 0]} interpolate={false}>
            {customObjects !== undefined ? (
              // 유저 제작 월드 — 기본 그라운드 없음. 필요하면 평면 직접 배치
              <>{customObjects.map(obj => <UserMapObjectMesh key={obj.id} obj={obj} />)}</>
            ) : (
              // worldId 없음 (기본 월드) → 데모 섬
              <Island />
            )}
            <Player character={character} onMove={onMove} />
            {Object.values(players).map((p) => (
              <RemotePlayerMesh key={p.id} player={p} posesRef={posesRef} castShadow={graphics.remoteShadows} />
            ))}
          </Physics>
        </Suspense>
      </Canvas>
  );
}
