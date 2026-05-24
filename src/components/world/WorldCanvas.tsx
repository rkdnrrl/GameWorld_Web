'use client';
import { Suspense, useRef, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber';
import {
  KeyboardControls, useKeyboardControls,
  Sky, Text,
} from '@react-three/drei';
import { Physics, RigidBody, CapsuleCollider, useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import type { RemotePlayer } from '@/lib/world/useGameSocket';

/* ── 키 매핑 ─────────────────────────────── */
const KEY_MAP = [
  { name: 'forward',  keys: ['KeyW', 'ArrowUp'] },
  { name: 'backward', keys: ['KeyS', 'ArrowDown'] },
  { name: 'left',     keys: ['KeyA', 'ArrowLeft'] },
  { name: 'right',    keys: ['KeyD', 'ArrowRight'] },
  { name: 'jump',     keys: ['Space'] },
  { name: 'sprint',   keys: ['ShiftLeft'] },
];

/* ── FBX 모델 로더 ─────────────────────── */
function FBXModel({ url, scale, rotX }: { url: string; scale: number; rotX: number }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { FBXLoader } = require('three/examples/jsm/loaders/FBXLoader.js');
  const fbx = useLoader(FBXLoader, url);
  const cloned = fbx.clone(true) as THREE.Group;
  cloned.traverse(c => { if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).castShadow = true; });
  return <primitive object={cloned} scale={scale} rotation={[rotX, 0, 0]} />;
}

/* ── GLB 모델 로더 ─────────────────────── */
function GLBModel({ url, scale }: { url: string; scale: number }) {
  const { GLTFLoader } = require('three/examples/jsm/loaders/GLTFLoader.js');
  const gltf = useLoader(GLTFLoader, url);
  const cloned = gltf.scene.clone(true) as THREE.Group;
  cloned.traverse(c => { if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).castShadow = true; });
  return <primitive object={cloned} scale={scale} />;
}

/* ── 캐릭터 메쉬 (커스텀 or 블록형) ───── */
function CharacterMesh({ appearance }: { appearance: Record<string, string> }) {
  const modelUrl   = appearance.modelUrl;
  const modelScale = Number(appearance.modelScale) || 0.01;

  if (modelUrl) {
    const ext      = modelUrl.split('.').pop()?.toLowerCase();
    // FBX 기본 Z-up 축 보정: -90°. appearance.fbxRotX 로 직접 지정 가능
    const rotX     = Number(appearance.fbxRotX ?? (ext === 'fbx' ? -Math.PI / 2 : 0));
    return (
      <Suspense fallback={<BlockMesh appearance={appearance} />}>
        {(ext === 'glb' || ext === 'gltf')
          ? <GLBModel url={modelUrl} scale={modelScale} />
          : <FBXModel url={modelUrl} scale={modelScale} rotX={rotX} />
        }
      </Suspense>
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
  const [, get]   = useKeyboardControls();
  const { camera, gl } = useThree();

  const camH     = useRef(0);
  const camV     = useRef(0.45);
  const isLocked = useRef(false);
  const lastSend = useRef(0);
  // 물리 초기화 전에도 카메라가 따라올 수 있도록 마지막 위치 기억
  const lastPos  = useRef(new THREE.Vector3(0, 1, 0));

  /* 포인터 락 */
  useEffect(() => {
    const el = gl.domElement;
    const onMouseMove = (e: MouseEvent) => {
      if (!isLocked.current) return;
      camH.current -= e.movementX * 0.003;
      camV.current  = Math.max(0.05, Math.min(1.3, camV.current - e.movementY * 0.003));
    };
    const onLockChange = () => { isLocked.current = !!document.pointerLockElement; };
    const onClick = () => el.requestPointerLock();
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onLockChange);
    el.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onLockChange);
      el.removeEventListener('click', onClick);
    };
  }, [gl]);

  useFrame((_, dt) => {
    /* ── 물리 바디가 준비된 경우에만 이동 처리 ── */
    if (body.current) {
      try {
      const { forward, backward, left, right, jump, sprint } = get();
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

      if (jump) {
        const ray = new rapier.Ray({ x: posT.x, y: posT.y, z: posT.z }, { x: 0, y: -1, z: 0 });
        const hit = rWorld.castRay(ray, 1.3, true);
        if (hit && hit.timeOfImpact < 0.7) {
          body.current.applyImpulse({ x: 0, y: 7, z: 0 }, true);
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
    camera.position.lerp(new THREE.Vector3(tx, ty, tz), 1 - Math.pow(0.001, dt));
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
        <CharacterMesh appearance={appearance} />
      </group>
    </RigidBody>
  );
}

/* ── 원격 플레이어 ──────────────────────── */
function RemotePlayerMesh({ player }: { player: RemotePlayer }) {
  const g    = useRef<THREE.Group>(null);
  const tPos = useRef(new THREE.Vector3(player.x, player.y, player.z));
  const tRot = useRef(player.rotY);

  useEffect(() => {
    tPos.current.set(player.x, player.y, player.z);
    tRot.current = player.rotY;
  }, [player.x, player.y, player.z, player.rotY]);

  useFrame((_, dt) => {
    if (!g.current) return;
    g.current.position.lerp(tPos.current, 10 * dt);
    g.current.rotation.y = THREE.MathUtils.lerp(g.current.rotation.y, tRot.current, 10 * dt);
  });

  const appearance = (player.character?.appearance ?? {}) as Record<string, string>;

  return (
    <group ref={g} position={[player.x, player.y, player.z]}>
      <group position={[0, -0.35, 0]}>
        <CharacterMesh appearance={appearance} />
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
    <KeyboardControls map={KEY_MAP}>
      <Canvas
        shadows
        camera={{ fov: 60, near: 0.1, far: 600, position: [0, 8, 12] }}
        style={{ width: '100vw', height: '100vh', display: 'block', background: '#87ceeb' }}
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
          <Physics gravity={[0, -22, 0]}>
            <Island />
            <Player character={character} onMove={onMove} />
            {Object.values(players).map((p) => (
              <RemotePlayerMesh key={p.id} player={p} />
            ))}
          </Physics>
        </Suspense>
      </Canvas>
    </KeyboardControls>
  );
}
