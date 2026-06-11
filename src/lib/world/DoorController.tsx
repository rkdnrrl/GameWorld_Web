'use client';
/**
 * 문 (door) — E 키로 토글 회전. grab(E) 과 키 충돌 회피를 위해 capture phase 에서 받음.
 *  - 가까운 문이 있으면 capture-phase 핸들러가 stopImmediatePropagation 으로 grab 차단
 *  - 가까운 문이 없으면 그대로 통과 → grab 정상 동작
 *  - 매 frame hinge group 회전을 target 으로 lerp (부드러운 swing)
 *  - 시각만 (콜라이더 없음) — V1. 사용자가 별도 collider 컴포넌트로 막아야 함
 *  - 멀티: 본인 화면만 회전 (V2 sync 예정)
 *
 * 렌더 구조 (오브젝트 위치 = hinge):
 *   group(world TRS) → group(swing, rotation.y lerp) → mesh(width 만큼 +X 로 이동)
 *   즉 문짝의 hinge 가 오브젝트 position 에 위치.
 */
import { useEffect, useRef, useState } from 'react';
import HudPortal from './HudPortal';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { DoorSpot } from './components';
import { setInteractPrompt } from './interactPrompt';

const SHARED_GEO_CACHE = new Map<string, THREE.BoxGeometry>();
function getBoxGeo(w: number, h: number, t: number) {
  const k = `${w}|${h}|${t}`;
  let g = SHARED_GEO_CACHE.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, t); SHARED_GEO_CACHE.set(k, g); }
  return g;
}

export default function DoorController({
  doors,
  localPoseRef,
}: {
  doors: DoorSpot[];
  localPoseRef: React.MutableRefObject<{ x: number; y: number; z: number; rotY: number }> | null | undefined;
}) {
  const swingRefs = useRef<Map<string, THREE.Group>>(new Map());
  const openRef = useRef<Map<string, boolean>>(new Map());
  const nearRef = useRef<DoorSpot | null>(null);
  const [hudText, setHudText] = useState('');
  const lastHud = useRef('');

  // startOpen 초기화 (id 별)
  useEffect(() => {
    for (const d of doors) {
      if (!openRef.current.has(d.id)) openRef.current.set(d.id, d.startOpen);
    }
    // 사라진 문은 정리
    for (const id of [...openRef.current.keys()]) {
      if (!doors.find(d => d.id === id)) openRef.current.delete(id);
    }
  }, [doors]);

  // E 키 capture — 가까운 문 있으면 토글 + grab 가로채기. 없으면 통과.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyE') return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
      if (e.repeat) return;
      const near = nearRef.current;
      if (!near) return; // 문 없으면 통과 → grab 등 정상 동작
      e.stopImmediatePropagation();
      e.preventDefault();
      const cur = !!openRef.current.get(near.id);
      openRef.current.set(near.id, !cur);
      lastHud.current = ''; // HUD 갱신 강제
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true });
      setInteractPrompt(null);
    };
  }, []);

  useFrame((_state, dt) => {
    const pose = localPoseRef?.current;
    // 가까운 문 찾기 — 카메라/플레이어 위치 기준
    let nearest: DoorSpot | null = null;
    let bestD = Infinity;
    if (pose) {
      for (const d of doors) {
        const dx = d.hx - pose.x, dy = d.hy - pose.y, dz = d.hz - pose.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist <= d.range && dist < bestD) { bestD = dist; nearest = d; }
      }
    }
    nearRef.current = nearest;

    // HUD prompt — 가까운 문이 바뀌거나 open 상태가 바뀐 경우만 setState
    let newHud = '';
    if (nearest) {
      const open = !!openRef.current.get(nearest.id);
      newHud = open ? '🚪 E: 문 닫기' : '🚪 E: 문 열기';
    }
    if (newHud !== lastHud.current) {
      lastHud.current = newHud;
      setHudText(newHud);
      setInteractPrompt(nearest ? 'door' : null);
    }

    // 회전 lerp — 각 문의 swing group rotation.y 를 target 으로 부드럽게.
    for (const d of doors) {
      const g = swingRefs.current.get(d.id);
      if (!g) continue;
      const open = !!openRef.current.get(d.id);
      const target = open ? d.swingAngleRad : 0;
      // 시간 기반 보간 — duration 동안 1.0 도달
      const a = Math.min(1, dt / d.swingDuration);
      g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, target, a);
    }
  });

  return (
    <>
      {doors.map(d => (
        <group key={d.id} position={[d.hx, d.hy, d.hz]} rotation={[0, d.rotY, 0]}>
          {/* hinge 회전 group — DoorController 가 매 frame rotation.y 갱신 */}
          <group ref={el => {
            if (el) swingRefs.current.set(d.id, el);
            else swingRefs.current.delete(d.id);
          }}>
            {/* 문짝 — hinge 에서 +X 방향으로 width/2 만큼 평행이동해 폭이 +X 쪽으로 펼쳐지게 */}
            <mesh position={[d.width / 2, d.height / 2, 0]} geometry={getBoxGeo(d.width, d.height, d.thickness)} castShadow receiveShadow>
              <meshStandardMaterial color={d.color} />
            </mesh>
          </group>
        </group>
      ))}
      {hudText && (
        <HudPortal>
          <div style={{
            position: 'fixed', bottom: 120, left: '50%', transform: 'translateX(-50%)',
            zIndex: 2147480000, pointerEvents: 'none',
            padding: '8px 16px', borderRadius: 999,
            background: 'rgba(0,0,0,0.65)', color: '#fff',
            fontSize: 14, fontWeight: 700, fontFamily: 'system-ui, sans-serif',
            backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.18)',
          }}>{hudText}</div>
        </HudPortal>
      )}
    </>
  );
}
