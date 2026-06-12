'use client';
/**
 * 지형 식생(풀/나무/꽃/돌) 인스턴스 렌더 — terrain.foliage 를 InstancedMesh 로 그림.
 *
 * 절차적 모양(에셋 불필요):
 *  - 풀: 3겹 교차 quad 잔디 다발 + 아래(어두운)→위(밝은) 버텍스 컬러 그라데이션.
 *  - 나무: 기둥(실린더) + 잎(콘) 2개 인스턴스드 메시(같은 변환 공유).
 *  - 꽃: 교차 quad 작은 꽃잎 + 인스턴스별 팔레트 색.
 *  - 돌: 저폴리 정이십면체(평면 셰이딩) + 회색 변주.
 * 높이는 sampleTerrainHeight 로 지형 표면에 앉힘. terrain-local 좌표라 부모 group 의
 * position/rotation/scale 이 그대로 적용된다(지형과 함께 움직임).
 *
 * 자연스러움: 인스턴스별 색 변주(setColorAt) + 풀/꽃 바람 흔들림(onBeforeCompile 셰이더, 공유 uTime).
 *
 * ⚠️ 물리 콜라이더 안에 두지 말 것 — trimesh 콜라이더가 잔디까지 먹으면 폭발한다.
 *    호출 측에서 RigidBody 바깥 형제로 렌더한다.
 */
import React, { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { normalizeTerrain, sampleTerrainHeight, type TerrainData, type FoliageInstance } from './terrain';

// ── 절차적 지오메트리 (모듈 1회 생성, 공유) ──
function crossQuads(angles: number[], w: number, h: number, bottom: number[], top: number[]): THREE.BufferGeometry {
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
function buildGrassGeo(): THREE.BufferGeometry {
  // 3겹 교차 → 풍성한 다발. 아래 어두움→위 밝음 그라데이션.
  return crossQuads([0, Math.PI / 3, (2 * Math.PI) / 3], 0.16, 0.5, [0.05, 0.16, 0.03], [0.34, 0.62, 0.17]);
}
function buildFlowerGeo(): THREE.BufferGeometry {
  // 흰 꽃잎(인스턴스 색으로 팔레트 틴트). 살짝 띄워 줄기 없이 — 단순.
  const g = crossQuads([0, Math.PI / 2], 0.22, 0.26, [1, 1, 1], [1, 1, 1]);
  g.translate(0, 0.14, 0);
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
function buildRockGeo(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.4, 0); // 저폴리 → 평면 셰이딩으로 각진 바위
  g.scale(1, 0.7, 1);   // 납작하게
  g.translate(0, 0.22, 0);
  g.computeVertexNormals();
  return g;
}

// ── 바람 흔들림 (풀/꽃 공용 셰이더 주입). 공유 uTime 을 매 프레임 갱신. ──
const windUniform = { value: 0 };
function makeWindMaterial(amt: number, props: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial(props);
  const amtU = { value: amt };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windUniform;
    shader.uniforms.uWindAmt = amtU;
    shader.vertexShader = 'uniform float uWindTime;\nuniform float uWindAmt;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float wph = instanceMatrix[3].x * 0.6 + instanceMatrix[3].z * 0.45;
      #else
        float wph = 0.0;
      #endif
      float wsw = position.y * uWindAmt;
      transformed.x += sin(uWindTime * 1.6 + wph) * wsw;
      transformed.z += cos(uWindTime * 1.25 + wph) * wsw * 0.6;`,
    );
  };
  return mat;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** 위치 기반 결정적 해시(0~1) — 인스턴스별 안정적 색 변주(리렌더 깜빡임 없음). */
function hashNoise(x: number, z: number): number {
  const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return h - Math.floor(h);
}
const FLOWER_PALETTE = ['#e8556b', '#f2c24b', '#ffffff', '#ef8fb8', '#9b6ef0', '#ff8c42'];
/** 종류별 인스턴스 색 → instanceColor (재질 색/그라데이션에 곱해짐). null=변주 없음. */
function colorFor(k: FoliageInstance['k'], it: FoliageInstance): THREE.Color | null {
  const n = hashNoise(it.x * 1.7, it.z * 1.3);
  if (k === 'grass') { const n2 = hashNoise(it.z * 2.1, it.x * 0.9); return _c.setRGB(0.78 + n * 0.34, 0.86 + n2 * 0.26, 0.72 + n * 0.3); }
  if (k === 'flower') return _c.set(FLOWER_PALETTE[Math.floor(n * FLOWER_PALETTE.length) % FLOWER_PALETTE.length]);
  if (k === 'rock') { const v = 0.45 + n * 0.32; return _c.setRGB(v, v * 0.98, v * 0.92); }
  return null;
}

/** 단일 종류 InstancedMesh — count 가 바뀌면 key 로 재생성(args 는 생성시 1회만 반영). */
function Instanced({ items, geo, mat, t, base, cast, receive, vary }: {
  items: FoliageInstance[];
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  t: TerrainData;
  base: number;        // 기본 크기 배율
  cast: boolean;
  receive: boolean;
  vary?: FoliageInstance['k'];  // 지정 시 해당 종류 색 변주 적용
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
      if (vary) { const col = colorFor(vary, it); if (col) mesh.setColorAt(i, col); }
    }
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, t, base, vary]);
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
  const flowers = useMemo(() => foliage.filter(f => f.k === 'flower'), [foliage]);
  const rocks = useMemo(() => foliage.filter(f => f.k === 'rock'), [foliage]);

  const grassGeo = useMemo(() => buildGrassGeo(), []);
  const flowerGeo = useMemo(() => buildFlowerGeo(), []);
  const trunkGeo = useMemo(() => buildTrunkGeo(), []);
  const canopyGeo = useMemo(() => buildCanopyGeo(), []);
  const rockGeo = useMemo(() => buildRockGeo(), []);
  // 풀/꽃: 바람 흔들림 셰이더. 나무/돌: 정적.
  const grassMat = useMemo(() => makeWindMaterial(0.16, { vertexColors: true, side: THREE.DoubleSide, roughness: 1, metalness: 0 }), []);
  const flowerMat = useMemo(() => makeWindMaterial(0.12, { vertexColors: true, side: THREE.DoubleSide, roughness: 1, metalness: 0 }), []);
  const trunkMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#6b4a2b', roughness: 0.95, metalness: 0 }), []);
  const canopyMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2f6b25', roughness: 1, metalness: 0 }), []);
  const rockMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#9a9a96', roughness: 1, metalness: 0, flatShading: true }), []);
  useEffect(() => () => {
    grassGeo.dispose(); flowerGeo.dispose(); trunkGeo.dispose(); canopyGeo.dispose(); rockGeo.dispose();
    grassMat.dispose(); flowerMat.dispose(); trunkMat.dispose(); canopyMat.dispose(); rockMat.dispose();
  }, [grassGeo, flowerGeo, trunkGeo, canopyGeo, rockGeo, grassMat, flowerMat, trunkMat, canopyMat, rockMat]);

  // 공유 바람 시계 — 풀/꽃이 하나라도 있으면만 의미 있음(없어도 비용 미미).
  useFrame((st) => { windUniform.value = st.clock.elapsedTime; });

  return (
    <>
      <Instanced items={grass} geo={grassGeo} mat={grassMat} t={t} base={1} cast={false} receive={false} vary="grass" />
      <Instanced items={flowers} geo={flowerGeo} mat={flowerMat} t={t} base={1} cast={false} receive={false} vary="flower" />
      {/* 나무: 기둥 + 잎 — 같은 인스턴스 변환(지오메트리가 미리 y 오프셋됨) */}
      <Instanced items={trees} geo={trunkGeo} mat={trunkMat} t={t} base={1} cast receive={false} />
      <Instanced items={trees} geo={canopyGeo} mat={canopyMat} t={t} base={1} cast receive={false} />
      <Instanced items={rocks} geo={rockGeo} mat={rockMat} t={t} base={1} cast receive={false} vary="rock" />
    </>
  );
}
