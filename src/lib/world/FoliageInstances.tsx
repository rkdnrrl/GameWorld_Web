'use client';
/**
 * 지형 식생(풀/나무) 인스턴스 렌더 — terrain.foliage 를 InstancedMesh 로 그림.
 *
 * 절차적 모양(에셋 불필요):
 *  - 풀: 3겹 교차 quad 잔디 다발 + 아래(어두운)→위(밝은) 버텍스 컬러 그라데이션.
 *  - 나무: 기둥(실린더) + 잎(콘) 2개 인스턴스드 메시(같은 변환 공유).
 * 높이는 sampleTerrainHeight 로 지형 표면에 앉힘. terrain-local 좌표라 부모 group 의
 * position/rotation/scale 이 그대로 적용된다(지형과 함께 움직임).
 *
 * ⚠️ 물리 콜라이더 안에 두지 말 것 — trimesh 콜라이더가 잔디까지 먹으면 폭발한다.
 *    호출 측에서 RigidBody 바깥 형제로 렌더한다.
 */
import React, { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { normalizeTerrain, sampleTerrainHeight, type TerrainData, type FoliageInstance } from './terrain';

// ── 절차적 지오메트리 (모듈 1회 생성, 공유) ──
function buildGrassGeo(): THREE.BufferGeometry {
  const w = 0.16, h = 0.5;
  const angles = [0, Math.PI / 3, (2 * Math.PI) / 3]; // 3겹 교차 → 풍성한 다발
  const bottom = [0.05, 0.16, 0.03], top = [0.34, 0.62, 0.17];
  const positions: number[] = [], colors: number[] = [], normals: number[] = [], indices: number[] = [];
  let vi = 0;
  for (const a of angles) {
    const ca = Math.cos(a), sa = Math.sin(a);
    const corners = [
      [-w / 2 * ca, 0, -w / 2 * sa, ...bottom],
      [w / 2 * ca, 0, w / 2 * sa, ...bottom],
      [w / 2 * ca, h, w / 2 * sa, ...top],
      [-w / 2 * ca, h, -w / 2 * sa, ...top],
    ];
    for (const c of corners) { positions.push(c[0], c[1], c[2]); colors.push(c[3], c[4], c[5]); normals.push(-sa, 0, ca); }
    indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    vi += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setIndex(indices);
  return g;
}
function buildTrunkGeo(): THREE.BufferGeometry {
  const h = 1.2;
  const g = new THREE.CylinderGeometry(0.09, 0.14, h, 6);
  g.translate(0, h / 2, 0); // 밑동을 y=0 에
  return g;
}
function buildCanopyGeo(): THREE.BufferGeometry {
  const h = 1.9;
  const g = new THREE.ConeGeometry(0.85, h, 7);
  g.translate(0, 1.2 + h / 2, 0); // 기둥 위(1.2)에 콘 밑면
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** 단일 종류 InstancedMesh — count 가 바뀌면 key 로 재생성(args 는 생성시 1회만 반영). */
function Instanced({ items, geo, mat, t, base, cast, receive }: {
  items: FoliageInstance[];
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  t: TerrainData;
  base: number;        // 기본 크기 배율
  cast: boolean;
  receive: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  // 용량을 256 버킷으로 — 페인트로 1개씩 늘어도 경계 넘을 때만 메시 재생성(깜빡임/GC 방지).
  const capacity = Math.max(256, Math.ceil((items.length + 1) / 256) * 256);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      _p.set(it.x, sampleTerrainHeight(t, it.x, it.z), it.z);
      _q.setFromAxisAngle(_up, it.r);
      _s.setScalar(it.s * base);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
    }
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, t, base]);
  if (items.length === 0) return null;
  return (
    <instancedMesh
      key={capacity}
      ref={ref}
      args={[geo, mat, capacity]}
      castShadow={cast}
      receiveShadow={receive}
      frustumCulled={false}
    />
  );
}

export function FoliageInstances({ terrain }: { terrain: TerrainData }) {
  const t = normalizeTerrain(terrain);
  const foliage = t.foliage || [];
  const grass = useMemo(() => foliage.filter(f => f.k === 'grass'), [foliage]);
  const trees = useMemo(() => foliage.filter(f => f.k === 'tree'), [foliage]);

  const grassGeo = useMemo(() => buildGrassGeo(), []);
  const trunkGeo = useMemo(() => buildTrunkGeo(), []);
  const canopyGeo = useMemo(() => buildCanopyGeo(), []);
  const grassMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1, metalness: 0 }), []);
  const trunkMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#6b4a2b', roughness: 0.95, metalness: 0 }), []);
  const canopyMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2f6b25', roughness: 1, metalness: 0 }), []);
  useEffect(() => () => {
    grassGeo.dispose(); trunkGeo.dispose(); canopyGeo.dispose();
    grassMat.dispose(); trunkMat.dispose(); canopyMat.dispose();
  }, [grassGeo, trunkGeo, canopyGeo, grassMat, trunkMat, canopyMat]);

  return (
    <>
      <Instanced items={grass} geo={grassGeo} mat={grassMat} t={t} base={1} cast={false} receive={false} />
      {/* 나무: 기둥 + 잎 — 같은 인스턴스 변환(지오메트리가 미리 y 오프셋됨) */}
      <Instanced items={trees} geo={trunkGeo} mat={trunkMat} t={t} base={1} cast receive={false} />
      <Instanced items={trees} geo={canopyGeo} mat={canopyMat} t={t} base={1} cast receive={false} />
    </>
  );
}
