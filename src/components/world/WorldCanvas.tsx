'use client';
import { Suspense, useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sky, Text } from '@react-three/drei';
import { Physics, RigidBody, CapsuleCollider, useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import type { RemotePlayer } from '@/lib/world/useGameSocket';

/** 두 각도 간 짧은 방향으로 보간 (-π~π 경계 넘어가도 한바퀴 안 돔) */
function lerpAngle(current: number, target: number, t: number): number {
  const TAU = Math.PI * 2;
  let diff = ((target - current) % TAU + TAU) % TAU;
  if (diff > Math.PI) diff -= TAU;
  return current + diff * t;
}

/* ── 커스텀 3D 모델 (Suspense 없이 명령형 로드 — RigidBody 리셋 방지) ── */
/** 모델을 목표 높이(m)에 맞춰 자동 정규화 */
function autoNormalize(obj: THREE.Object3D, targetHeight = 1.8) {
  obj.updateMatrixWorld(true);
  const box  = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const h    = Math.max(size.x, size.y, size.z);
  if (h > 0) {
    const factor = targetHeight / h;
    obj.scale.multiplyScalar(factor);
    obj.updateMatrixWorld(true);
  }
  // 발 위치를 y=0 기준으로 맞춤
  const box2 = new THREE.Box3().setFromObject(obj);
  obj.position.y -= box2.min.y;
}

function CustomModel({ url, userScale, rotX, movingRef, idleName, walkName }: {
  url: string;
  userScale: number;
  rotX: number;
  movingRef?: React.RefObject<boolean>;
  idleName?: string;
  walkName?: string;
}) {
  const [obj, setObj]     = useState<THREE.Object3D | null>(null);
  const mixer             = useRef<THREE.AnimationMixer | null>(null);
  const idleAction        = useRef<THREE.AnimationAction | null>(null);
  const walkAction        = useRef<THREE.AnimationAction | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;

    const setupMixer = (loaded: THREE.Object3D, anims: THREE.AnimationClip[]) => {
      if (!anims.length) return;
      const m = new THREE.AnimationMixer(loaded);
      mixer.current = m;

      // 사용자가 명시적으로 지정한 이름 우선, 없으면 키워드 휴리스틱
      const findByExact = (name?: string) =>
        name ? anims.find(a => a.name === name) : undefined;
      const findByKeyword = (...needles: string[]) =>
        anims.find(a => {
          const name = a.name.toLowerCase();
          return needles.some(n => name.includes(n.toLowerCase()));
        });

      const idleClip = findByExact(idleName) ?? findByKeyword(
        'idle', 'stand', 'tpose', 't-pose',
        '유휴', '대기', '서있',
      );
      const walkClip = findByExact(walkName) ?? findByKeyword(
        'walk', 'run', 'move', 'jog', 'sprint',
        '걷기', '걷다', '걸음', '달리', '뛰', '이동',
      );

      // ── 두 종류 다 있음 → 크로스페이드 ──
      if (idleClip && walkClip) {
        idleAction.current = m.clipAction(idleClip);
        walkAction.current = m.clipAction(walkClip);
        idleAction.current.play();
        walkAction.current.weight = 0;
        walkAction.current.play();
      }
      // ── 하나만 있음 → 그것만 재생 (이름 패턴으로 idle/walk 결정) ──
      else if (anims.length === 1) {
        const onlyClip = anims[0];
        const isMovement = /walk|run|move|jog|sprint|걷|달리|뛰|이동/i.test(onlyClip.name);
        if (isMovement) {
          // 움직임 애니메이션 → walk 슬롯에. 정지 시엔 weight=0
          walkAction.current = m.clipAction(onlyClip);
          walkAction.current.weight = 0;
          walkAction.current.play();
        } else {
          // idle/기타 → 항상 재생
          idleAction.current = m.clipAction(onlyClip);
          idleAction.current.play();
        }
      }
      // ── 여러 개지만 idle/walk 키워드 미매칭 → 첫 2개 사용 ──
      else {
        idleAction.current = m.clipAction(anims[0]);
        idleAction.current.play();
        if (anims.length > 1) {
          walkAction.current = m.clipAction(anims[1]);
          walkAction.current.weight = 0;
          walkAction.current.play();
        }
      }
    };

    const onLoaded = (loaded: THREE.Object3D, anims: THREE.AnimationClip[] = []) => {
      if (cancelled) return;
      loaded.traverse(c => { if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).castShadow = true; });
      autoNormalize(loaded, 1.8);
      setupMixer(loaded, anims);
      setObj(loaded);
    };

    // FBX만 지원
    import('three/examples/jsm/loaders/FBXLoader.js').then(({ FBXLoader }) => {
      new FBXLoader().load(url, (fbx) => {
        onLoaded(fbx, (fbx as unknown as { animations: THREE.AnimationClip[] }).animations ?? []);
      });
    });
    return () => {
      cancelled = true;
      mixer.current?.stopAllAction();
      mixer.current = null;
    };
  }, [url]);

  // AnimationMixer 업데이트 + 움직임에 따른 idle↔walk 크로스페이드
  useFrame((_, dt) => {
    mixer.current?.update(dt);
    if (walkAction.current) {
      const target = movingRef?.current ? 1 : 0;
      const w = THREE.MathUtils.lerp(walkAction.current.weight, target, Math.min(1, 8 * dt));
      walkAction.current.weight = w;
      if (idleAction.current) idleAction.current.weight = 1 - w;
    }
  });

  if (!obj) return null;
  // position y=-0.28: 캡슐 콜라이더 바닥에 발 맞추기 (body 중심 -0.63 = 캡슐 바닥, mesh 그룹은 -0.35 → 추가 -0.28 필요)
  return (
    <group scale={userScale} rotation={[rotX, 0, 0]} position={[0, -0.28, 0]}>
      <primitive object={obj} />
    </group>
  );
}

/* ── 캐릭터 메쉬 (커스텀 or 블록형) ───── */
function CharacterMesh({ appearance, movingRef }: {
  appearance: Record<string, string>;
  movingRef?: React.RefObject<boolean>;
}) {
  const modelUrl   = appearance.modelUrl;
  const userScale  = Number(appearance.modelScale) || 1.0;
  const rotX       = Number(appearance.fbxRotX ?? -Math.PI / 2); // FBX Z-up 기본 보정

  if (modelUrl) {
    return (
      <CustomModel
        url={modelUrl}
        userScale={userScale}
        rotX={rotX}
        movingRef={movingRef}
        idleName={appearance.idleAnim}
        walkName={appearance.walkAnim}
      />
    );
  }
  return <BlockMesh appearance={appearance} />;
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

/* ── 로컬 플레이어 컨트롤러 ─────────────── */
function Player({
  character,
  onMove,
}: {
  character: Record<string, unknown>;
  onMove: (p: { x: number; y: number; z: number; rotY: number }) => void;
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
  // 이동 중 여부 (CustomModel의 idle↔walk 크로스페이드용)
  const movingRef = useRef(false);

  /* 키보드 + 포인터 락 */
  useEffect(() => {
    const el = gl.domElement;

    // 키보드
    const onKeyDown = (e: KeyboardEvent) => {
      keys.current.add(e.code);
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
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
      const SPEED = (sprint as boolean) ? 9 : 5;

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

      // 이동 중 여부 → 애니메이션 크로스페이드용
      movingRef.current = len > 0;

      // 점프: Space가 새로 눌렸을 때만 1번
      const jumpJustPressed = jump && !jumpPrev.current;
      jumpPrev.current = jump;
      if (jumpJustPressed) {
        const ray = new rapier.Ray({ x: posT.x, y: posT.y, z: posT.z }, { x: 0, y: -1, z: 0 });
        const hit = rWorld.castRay(ray, 1.3, true);
        if (hit && hit.timeOfImpact < 0.7) {
          // 임펄스 대신 setLinvel로 정확히 4.5 m/s 수직 속도 → ~0.46m 점프
          body.current.setLinvel({ x: vel.x, y: 4.5, z: vel.z }, true);
        }
      }

      if (mesh.current && len > 0) {
        const target = Math.atan2(mx, mz);
        mesh.current.rotation.y = THREE.MathUtils.lerp(mesh.current.rotation.y, target, 12 * dt);
      }

      const now = Date.now();
      if (now - lastSend.current > 50) {
        lastSend.current = now;
        onMove({ x: posT.x, y: posT.y, z: posT.z, rotY: mesh.current?.rotation.y ?? 0 });
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
        <CharacterMesh appearance={appearance} movingRef={movingRef} />
      </group>
    </RigidBody>
  );
}

/* ── 원격 플레이어 ──────────────────────── */
function RemotePlayerMesh({ player }: { player: RemotePlayer }) {
  const g    = useRef<THREE.Group>(null);
  const tPos = useRef(new THREE.Vector3(player.x, player.y, player.z));
  const tRot = useRef(player.rotY);
  const lastUpdate = useRef(Date.now());
  const movingRef  = useRef(false);
  const prevTargetXZ = useRef({ x: player.x, z: player.z });

  // 새 위치 수신 시: 직전 타겟과 비교해 이동 중인지 판단
  useEffect(() => {
    const dx = player.x - prevTargetXZ.current.x;
    const dz = player.z - prevTargetXZ.current.z;
    const moved = Math.hypot(dx, dz) > 0.02; // 2cm 이상 이동
    if (moved) {
      movingRef.current = true;
      lastUpdate.current = Date.now();
    }
    prevTargetXZ.current = { x: player.x, z: player.z };
    tPos.current.set(player.x, player.y, player.z);
    tRot.current = player.rotY;
  }, [player.x, player.y, player.z, player.rotY]);

  useFrame((_, dt) => {
    if (!g.current) return;
    g.current.position.lerp(tPos.current, 10 * dt);
    g.current.rotation.y = THREE.MathUtils.lerp(g.current.rotation.y, tRot.current, 10 * dt);
    // 200ms 이상 위치 업데이트 없으면 idle 상태로
    if (Date.now() - lastUpdate.current > 200) movingRef.current = false;
  });

  const appearance = (player.character?.appearance ?? {}) as Record<string, string>;

  return (
    <group ref={g} position={[player.x, player.y, player.z]}>
      <group position={[0, -0.35, 0]}>
        <CharacterMesh appearance={appearance} movingRef={movingRef} />
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

/* ── 메인 캔버스 ────────────────────────── */
interface WorldCanvasProps {
  character: Record<string, unknown>;
  players: Record<string, RemotePlayer>;
  onMove: (pos: { x: number; y: number; z: number; rotY: number }) => void;
}

export default function WorldCanvas({ character, players, onMove }: WorldCanvasProps) {
  return (
      <Canvas
        shadows
        camera={{ fov: 60, near: 0.1, far: 600, position: [0, 8, 12] }}
        dpr={[1, 2]}
        gl={{
          antialias: true,
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
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-60}
          shadow-camera-right={60}
          shadow-camera-top={60}
          shadow-camera-bottom={-60}
          color="#fff4d0"
        />
        <hemisphereLight args={['#87ceeb', '#4ade80', 0.3]} />

        <Sky sunPosition={[25, 10, 15]} turbidity={0.4} rayleigh={0.25} />

        <Suspense fallback={null}>
          <Physics gravity={[0, -22, 0]} interpolate={false}>
            <Island />
            <Player character={character} onMove={onMove} />
            {Object.values(players).map((p) => (
              <RemotePlayerMesh key={p.id} player={p} />
            ))}
          </Physics>
        </Suspense>
      </Canvas>
  );
}
