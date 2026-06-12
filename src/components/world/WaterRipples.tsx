'use client';
/**
 * 물 파문 — 로컬 플레이어가 수면에 들어가거나 수면 근처에서 움직일 때 퍼지는 동심원 링.
 *
 * 자족형: envFx.playerPos(로컬 플레이어 월드 위치) + buoyancyRef(물 부피 레지스트리)만으로
 * 수면 교차를 자체 감지 → World/Studio 플레이어 루프를 건드리지 않고 양쪽에서 동작.
 * createPortal 로 scene 에 직접 링을 띄운다(파문은 그 자리에 남아 퍼짐).
 *
 *  - 진입(물 밖→안): 큰 스플래시 링 1개.
 *  - 물 안에서 이동: 일정 간격으로 작은 wake 링(첨벙거리는 자국).
 * 링당 머티리얼 1개(총 N개, 저렴) — 개별 opacity 페이드.
 */
import { useMemo, useRef } from 'react';
import { useFrame, useThree, createPortal } from '@react-three/fiber';
import * as THREE from 'three';
import { envFx } from '@/lib/world/envFx';
import { sfxSplash } from '@/lib/world/sfx';
import type { BuoyancyVolume } from '@/lib/world/components';

const N = 10;          // 링 풀 크기
const GEOM_OUTER = 0.5; // 기준 geometry 바깥 반경 (스케일 기준)

export function WaterRipples({ buoyancyRef }: {
  buoyancyRef?: React.RefObject<BuoyancyVolume[]> | React.MutableRefObject<BuoyancyVolume[]>;
}) {
  const scene = useThree(s => s.scene);
  const camera = useThree(s => s.camera);
  const geom = useMemo(() => {
    const g = new THREE.RingGeometry(GEOM_OUTER * 0.84, GEOM_OUTER, 36);
    g.rotateX(-Math.PI / 2);   // 수평 (수면에 누움)
    return g;
  }, []);
  const mats = useMemo(
    () => Array.from({ length: N }, () => new THREE.MeshBasicMaterial({
      color: '#d4ecff', transparent: true, opacity: 0,
      depthWrite: false, side: THREE.DoubleSide,
    })),
    [],
  );
  const meshes = useRef<(THREE.Mesh | null)[]>([]);

  // 풀 메타 — emit 위치·수명·최대반경·시작알파
  const B = useMemo(() => ({
    emit: new Float32Array(N * 3),
    age: new Float32Array(N).fill(1e9),
    life: new Float32Array(N).fill(1),
    maxR: new Float32Array(N),
    amp: new Float32Array(N),
  }), []);
  const cursor = useRef(0);
  const wasIn = useRef(false);
  const lastX = useRef(0);
  const lastZ = useRef(0);
  const moveTimer = useRef(0);

  const fire = (x: number, y: number, z: number, big: boolean) => {
    const i = cursor.current; cursor.current = (cursor.current + 1) % N;
    const k = i * 3;
    B.emit[k] = x; B.emit[k + 1] = y; B.emit[k + 2] = z;
    B.age[i] = 0;
    B.life[i] = big ? 1.5 : 1.0;
    B.maxR[i] = big ? 2.4 : 1.2;
    B.amp[i] = big ? 0.5 : 0.32;
    // 첨벙 소리 — 카메라 거리로 볼륨 감쇠
    const dist = Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z);
    const vol = Math.max(0, 1 - dist / 18);
    if (vol > 0.02) sfxSplash({ volume: vol, big });
  };

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05);
    const pp = envFx.playerPos;

    // ── 수면 교차 감지 (부력 루프의 판정식 축약) ──
    const vols = buoyancyRef?.current;
    let inWater = false; let surfY = 0;
    if (vols) {
      for (let i = 0; i < vols.length; i++) {
        const bv = vols[i];
        if (Math.abs(pp.x - bv.cx) > bv.hx || Math.abs(pp.z - bv.cz) > bv.hz) continue;
        const surf = bv.cy + bv.offset;
        if (pp.y < bv.cy - bv.scaleY - 0.3) continue;   // 물 바닥 아래(맵 밑) 제외
        if (pp.y > surf + 0.6) continue;                 // 수면 위 공중 제외
        inWater = true; surfY = surf; break;
      }
    }

    // 진입 스플래시
    if (inWater && !wasIn.current) fire(pp.x, surfY, pp.z, true);
    wasIn.current = inWater;

    // 물 안 이동 wake
    if (inWater) {
      const sp = Math.hypot(pp.x - lastX.current, pp.z - lastZ.current) / Math.max(d, 1e-3);
      moveTimer.current += d;
      if (sp > 0.4 && moveTimer.current >= 0.34) {
        moveTimer.current = 0;
        fire(pp.x, surfY, pp.z, false);
      }
    }
    lastX.current = pp.x; lastZ.current = pp.z;

    // ── 갱신: 반경 확장 + 알파 페이드 ──
    for (let i = 0; i < N; i++) {
      const m = meshes.current[i];
      if (!m) continue;
      if (B.age[i] >= B.life[i]) { if (m.visible) m.visible = false; continue; }
      B.age[i] += d;
      const t = Math.min(1, B.age[i] / B.life[i]);
      const k = i * 3;
      m.position.set(B.emit[k], B.emit[k + 1] + 0.012, B.emit[k + 2]);
      const r = 0.12 + t * B.maxR[i];
      const s = r / GEOM_OUTER;
      m.scale.set(s, 1, s);
      mats[i].opacity = (1 - t) * B.amp[i];
      if (!m.visible) m.visible = true;
    }
  });

  return createPortal(
    <group>
      {Array.from({ length: N }, (_, i) => (
        <mesh key={i} ref={el => { meshes.current[i] = el; }}
          geometry={geom} material={mats[i]}
          frustumCulled={false} raycast={() => null} visible={false} />
      ))}
    </group>,
    scene,
  );
}
