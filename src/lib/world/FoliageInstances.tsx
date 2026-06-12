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
import React, { useMemo, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CapsuleCollider, CuboidCollider, ConvexHullCollider } from '@react-three/rapier';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — three 예제(번들 타입 없음). 모델당 1회 볼록껍질 선계산용.
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
import { normalizeTerrain, sampleTerrainHeight, type TerrainData, type FoliageInstance } from './terrain';
import { loadStaticModelCached } from './modelLoader';
import { resolveMeshMaterial, type MaterialOverrides, type LoadTexFn } from './materialOverride';
import { envFx } from './envFx';

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

// ── 바람 흔들림 + 플레이어 인터랙션 (풀/꽃 공용 셰이더 주입). 공유 유니폼을 매 프레임 갱신. ──
const windUniform = { value: 0 };
// 플레이어 인터랙션 공유 유니폼 — 모든 풀/꽃 머티리얼이 같은 객체 참조(useFrame 1회 갱신).
const playerPosUniform = { value: new THREE.Vector3() };
const playerRUniform = { value: 0 };           // 반경(0=비활성)
const bendStrUniform = { value: 0.6 };          // 수평 밀어내기 세기
const bendDownUniform = { value: 0.35 };        // 눌림(아래로)
/** 바람 흔들림 + 플레이어 밴드 셰이더를 임의 머티리얼에 주입. 기존 onBeforeCompile 은 보존(체인).
 *  Standard/Phong/Lambert 등 begin_vertex·project_vertex 청크를 쓰는 lit 머티리얼이면 동작(에셋 식생 포함). */
function injectWindBend<T extends THREE.Material>(mat: T, amt: number, bend = true): T {
  const amtU = { value: amt };
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) { try { prev.call(mat, shader, renderer); } catch { /* noop */ } }
    shader.uniforms.uWindTime = windUniform;
    shader.uniforms.uWindAmt = amtU;
    let header = 'uniform float uWindTime;\nuniform float uWindAmt;\n';
    if (bend) {
      shader.uniforms.uPlayer = playerPosUniform;
      shader.uniforms.uPlayerR = playerRUniform;
      shader.uniforms.uBendStr = bendStrUniform;
      shader.uniforms.uBendDown = bendDownUniform;
      header += 'uniform vec3 uPlayer;\nuniform float uPlayerR;\nuniform float uBendStr;\nuniform float uBendDown;\n';
    }
    shader.vertexShader = header + shader.vertexShader
      .replace('#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float wph = instanceMatrix[3].x * 0.6 + instanceMatrix[3].z * 0.45;
      #else
        float wph = 0.0;
      #endif
      float wsw = position.y * uWindAmt;
      transformed.x += sin(uWindTime * 1.6 + wph) * wsw;
      transformed.z += cos(uWindTime * 1.25 + wph) * wsw * 0.6;`);
    if (!bend) return;
    // project_vertex 를 확장 — instanceMatrix 적용 후 "월드공간"에서 플레이어 발 주변을 밀어냄/눌림.
    // 휨 방향·세기는 정점이 아니라 "인스턴스 밑동"(_wb) 기준 — 전 정점이 같은 방향으로 기울어 밑동을 축으로 눕는다.
    // (정점 기준으로 하면 플레이어가 식생 중앙에 서면 꽃잎이 사방으로 퍼져 풍선처럼 커짐.)
    shader.vertexShader = shader.vertexShader
      .replace('#include <project_vertex>',
      `vec4 mvPosition = vec4( transformed, 1.0 );
      #ifdef USE_BATCHING
        mvPosition = batchingMatrix * mvPosition;
      #endif
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
      #endif
      vec4 _wp = modelMatrix * mvPosition;
      if (uPlayerR > 0.001) {
        #ifdef USE_INSTANCING
          vec4 _wb = modelMatrix * (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0));
        #else
          vec4 _wb = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #endif
        vec2 _toP = _wb.xz - uPlayer.xz;              // 밑동→플레이어 반대 방향(인스턴스 공통)
        float _pd = length(_toP);
        float _infl = 1.0 - smoothstep(0.0, uPlayerR, _pd);
        if (_infl > 0.0) {
          float _ph = max(0.0, _wp.y - _wb.y);        // 밑동 기준 높이(위일수록 더 눕음)
          vec2 _pdir = _toP / max(_pd, 1e-3);
          _wp.x += _pdir.x * _infl * uBendStr * _ph;  // 식생 전체가 한 방향으로 눕음(풍선 X)
          _wp.z += _pdir.y * _infl * uBendStr * _ph;
          _wp.y -= _infl * uBendDown * _ph;           // 살짝 눌림
        }
      }
      mvPosition = viewMatrix * _wp;
      gl_Position = projectionMatrix * mvPosition;`);
  };
  mat.needsUpdate = true;
  return mat;
}
function makeWindMaterial(amt: number, props: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return injectWindBend(new THREE.MeshStandardMaterial(props), amt);
}

/** 로컬 플레이어 위치를 풀 셰이더로 — 매 프레임 envFx.playerPos 갱신(반경 활성). */
export function GrassPlayerProbe({ poseRef, radius = 1.3 }: {
  poseRef: React.RefObject<{ x: number; y: number; z: number } | null>;
  radius?: number;
}) {
  useFrame(() => {
    const p = poseRef.current;
    if (p) { envFx.playerPos.set(p.x, p.y, p.z); envFx.playerBend = radius; }
  });
  useEffect(() => () => { envFx.playerBend = 0; }, []);
  return null;
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

// ── 사용자 에셋(GLB 등) 식생 — 모델을 instanced 로 흩뿌림 ──
interface FoliageParts { parts: { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[] }[]; }
const _foliagePartsCache = new Map<string, Promise<FoliageParts>>();
/** 잎/식생 머티리얼 보정.
 *  - 양면(DoubleSide): 단면 잎 카드가 backface 컬링돼 컬러에서 안 보이는 문제 해결(절대 가려지지 않음).
 *  - 원래 "투명(블렌딩)"이던 잎만 alphaTest 컷아웃으로 전환 — 인스턴싱은 블렌딩 정렬이 안 되므로.
 *    ⚠ 불투명(OPAQUE) 머티리얼엔 alphaTest 를 절대 걸지 않는다(알파 채널이 0/무의미해 통째로 사라짐). */
type SwayMode = 'bend' | 'wind' | false;
function prepFoliageMaterial(mat: THREE.Material | THREE.Material[], sway: SwayMode = false): THREE.Material | THREE.Material[] {
  const fix = (m: THREE.Material): THREE.Material => {
    m.side = THREE.DoubleSide;
    const sm = m as THREE.MeshStandardMaterial;
    if (sm.transparent && (sm.map || sm.alphaMap)) {
      sm.alphaTest = Math.max(sm.alphaTest || 0, 0.3);   // 블렌딩 잎 → 컷아웃(정렬 무관 렌더 + 잎모양 그림자)
      sm.transparent = false;
      sm.depthWrite = true;
    }
    // 'bend' 풀/꽃 → 바람 흔들림 + 플레이어 밴드(밑동 고정, 위로 갈수록 눕음)
    // 'wind' 나무 → 약한 바람 흔들림만(밴드 X — 큰 나무가 플레이어 쪽으로 눕는 건 부자연스러움)
    if (sway === 'bend') injectWindBend(m, 0.06, true);
    else if (sway === 'wind') injectWindBend(m, 0.025, false);
    m.needsUpdate = true;
    return m;
  };
  return Array.isArray(mat) ? mat.map(fix) : fix(mat);
}
/** 식생용 단순 텍스처 로더 — materialOverride 헬퍼에 주입. */
const _foliageLoadTex: LoadTexFn = (url, colorSpace, tx, ty, onLoad) => {
  const tex = new THREE.TextureLoader().load(url, onLoad);
  tex.colorSpace = colorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(tx, ty);
  return tex;
};

/** url 모델 1회 로드 → 메시별 (변환 베이크된)지오/머티리얼 추출. 베이스를 y=0·xz중심으로 재배치. 세션 캐시.
 *  overrides(부위별 텍스처)가 있으면 잎 등 머티리얼에 입힘 — 캐시 키에 overrides 유무 포함. */
function loadFoliageParts(url: string, overrides?: MaterialOverrides, sway: SwayMode = false): Promise<FoliageParts> {
  const ovKeys = overrides ? Object.keys(overrides).sort().join(',') : '';
  const key = url + '|' + ovKeys + (sway ? '|' + sway : '');
  let entry = _foliagePartsCache.get(key);
  if (!entry) {
    entry = loadStaticModelCached(url).then((model) => {
      model.updateMatrixWorld(true);
      const parts: FoliageParts['parts'] = [];
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.geometry) {
          const g = m.geometry.clone();
          g.applyMatrix4(m.matrixWorld);   // 모델 내부 변환(+2m 정규화 스케일) 베이크
          // 부위별 텍스처(잎 알파 etc.) 적용 후, 양면/컷아웃 보정.
          let mat: THREE.Material | THREE.Material[] = m.material;
          if (overrides) {
            const made: THREE.MeshStandardMaterial[] = [];
            const resolved = resolveMeshMaterial(m.material, overrides, null, _foliageLoadTex, undefined, made);
            if (resolved) mat = resolved;
          }
          parts.push({ geo: g, mat: prepFoliageMaterial(mat, sway) });
        }
      });
      const box = new THREE.Box3();
      for (const p of parts) { p.geo.computeBoundingBox(); if (p.geo.boundingBox) box.union(p.geo.boundingBox); }
      const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, minY = box.min.y;
      for (const p of parts) { p.geo.translate(-cx, -minY, -cz); p.geo.computeBoundingSphere(); }  // 밑동 y=0, xz 중심
      return { parts };
    });
    _foliagePartsCache.set(key, entry);
  }
  return entry;
}

function AssetFoliageInstances({ url, scale, items, t, cast, overrides, sway = false }: {
  url: string; scale: number; items: FoliageInstance[]; t: TerrainData; cast: boolean; overrides?: MaterialOverrides; sway?: SwayMode;
}) {
  const [parts, setParts] = useState<FoliageParts | null>(null);
  const ovKey = overrides ? Object.keys(overrides).sort().join(',') : '';
  useEffect(() => {
    let alive = true;
    // 로드 완료 시에만 교체 — 전환 중 이전 모델 유지(빈 깜빡임 방지). 스테일은 alive 로 차단.
    loadFoliageParts(url, overrides, sway).then(p => { if (alive) setParts(p); }).catch(() => { if (alive) setParts(null); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ovKey, sway]);
  const refs = useRef<THREE.InstancedMesh[]>([]);
  const capacity = Math.max(256, Math.ceil((items.length + 1) / 256) * 256);
  useEffect(() => {
    if (!parts) return;
    const meshes = refs.current.slice(0, parts.parts.length);
    if (!meshes.length) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      _p.set(it.x, sampleTerrainHeight(t, it.x, it.z), it.z);
      _q.setFromAxisAngle(_up, it.r);
      _s.setScalar(it.s * scale);
      _m.compose(_p, _q, _s);
      for (const mesh of meshes) mesh.setMatrixAt(i, _m);
    }
    for (const mesh of meshes) { mesh.count = items.length; mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); }
  }, [items, t, scale, parts, capacity]);
  if (!parts || items.length === 0) return null;
  return (
    <>
      {parts.parts.map((p, i) => (
        <instancedMesh
          key={i + '-' + capacity}
          ref={(m) => { if (m) refs.current[i] = m as THREE.InstancedMesh; }}
          args={[p.geo, p.mat, capacity]}
          castShadow={cast}
          receiveShadow={false}
          frustumCulled={false}
        />
      ))}
    </>
  );
}

/** 잎 머티리얼 판정 — 알파 컷아웃/투명(잎 카드). 콜라이더에서 제외한다(걸어서 지나감). */
function isLeafMat(mat: THREE.Material | THREE.Material[]): boolean {
  const arr = Array.isArray(mat) ? mat : [mat];
  if (!arr.length) return false;
  return arr.every((m) => {
    const sm = m as THREE.MeshStandardMaterial;
    return (sm.transparent && !!(sm.map || sm.alphaMap)) || (sm.alphaTest ?? 0) > 0;
  });
}
/** 모델 정점 → 볼록 껍질(convex hull) 점 집합. loadFoliageParts 와 동일하게 리베이스(밑동 y=0, xz중심).
 *  trunkOnly=true 면 잎(알파) 메시 제외 → 줄기만 감싸 수관 아래로 걸어다님. 메시당 ~150점으로 다운샘플. */
function _collectHullPoints(model: THREE.Object3D, trunkOnly: boolean): Float32Array {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3();
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) { m.geometry.computeBoundingBox(); if (m.geometry.boundingBox) box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld)); }
  });
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, minY = box.min.y;
  const pts: number[] = []; const v = new THREE.Vector3();
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!(m.isMesh && m.geometry)) return;
    if (trunkOnly && isLeafMat(m.material)) return;
    const p = m.geometry.attributes.position as THREE.BufferAttribute | undefined;
    if (!p) return;
    const stride = Math.max(1, Math.floor(p.count / 150));
    for (let i = 0; i < p.count; i += stride) {
      v.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(m.matrixWorld);
      pts.push(v.x - cx, v.y - minY, v.z - cz);
    }
  });
  return new Float32Array(pts);
}
/** 점 구름 → 볼록껍질 정점만 추출(모델당 1회). 인스턴스마다 다시 hull 뜨는 비용 제거 — 수백 점 → ~수십 점.
 *  퇴화(동일평면 등)로 실패하면 원본 그대로(Rapier 가 hull). */
function _reduceToHull(raw: Float32Array): Float32Array {
  if (raw.length < 12) return raw;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < raw.length; i += 3) pts.push(new THREE.Vector3(raw[i], raw[i + 1], raw[i + 2]));
  let faces: { edge: unknown }[];
  try { faces = (new ConvexHull().setFromPoints(pts) as { faces: { edge: unknown }[] }).faces; } catch { return raw; }
  const seen = new Set<string>(); const out: number[] = [];
  for (const face of faces) {
    let edge = face.edge as { vertex: { point: THREE.Vector3 }; next: unknown } | null;
    const start = edge;
    do {
      if (!edge) break;
      const p = edge.vertex.point;
      const k = p.x.toFixed(3) + ',' + p.y.toFixed(3) + ',' + p.z.toFixed(3);
      if (!seen.has(k)) { seen.add(k); out.push(p.x, p.y, p.z); }
      edge = edge.next as typeof edge;
    } while (edge && edge !== start);
  }
  return out.length >= 12 ? new Float32Array(out) : raw;
}
const _hullCache = new Map<string, Promise<Float32Array>>();
function loadFoliageHull(url: string, trunkOnly: boolean): Promise<Float32Array> {
  const key = url + (trunkOnly ? '|t' : '|a');
  let e = _hullCache.get(key);
  if (!e) {
    e = loadStaticModelCached(url).then((model) => {
      let pts = _collectHullPoints(model, trunkOnly);
      if (trunkOnly && pts.length < 12) pts = _collectHullPoints(model, false);  // 줄기 메시 없음(잎만) → 전체로 폴백
      return _reduceToHull(pts);  // 모델당 1회 선계산 → 인스턴스는 ~수십 점만 hull
    });
    _hullCache.set(key, e);
  }
  return e;
}

/** 나무·돌 자동 콜라이더 — 모델 메시에 맞춘 볼록 껍질(Unity 의 Convex Mesh Collider 격).
 *  나무는 잎(알파) 제외한 "줄기 껍질" → 수관 아래로 걸어다님. 돌은 전체 껍질. 절차적은 캡슐/박스.
 *  하나의 fixed RigidBody 에 콜라이더만 여러 개(메시 X) — 가볍고 정적.
 *  ⚠ 반드시 <Physics> 안 + 지형 trimesh RigidBody 의 형제(같은 group 변환)로 렌더할 것.
 *  풀·꽃은 충돌 없음(걸어서 지나감). */
export function TreeRockColliders({ terrain }: { terrain: TerrainData }) {
  const t = normalizeTerrain(terrain);
  const treeUrl = t.foliageAssets?.tree?.url;
  const rockUrl = t.foliageAssets?.rock?.url;
  const treeScale = treeUrl ? (t.foliageAssets!.tree!.scale ?? 1) : 0;  // 0 = 절차적
  const rockScale = rockUrl ? (t.foliageAssets!.rock!.scale ?? 1) : 0;
  const [treePts, setTreePts] = useState<Float32Array | null>(null);
  const [rockPts, setRockPts] = useState<Float32Array | null>(null);
  useEffect(() => { let a = true; if (treeUrl) loadFoliageHull(treeUrl, true).then(p => { if (a) setTreePts(p); }).catch(() => {}); else setTreePts(null); return () => { a = false; }; }, [treeUrl]);
  useEffect(() => { let a = true; if (rockUrl) loadFoliageHull(rockUrl, false).then(p => { if (a) setRockPts(p); }).catch(() => {}); else setRockPts(null); return () => { a = false; }; }, [rockUrl]);

  const items = useMemo(() => {
    const trees: { x: number; y: number; z: number; r: number; s: number }[] = [];
    const rocks: { x: number; y: number; z: number; r: number; s: number }[] = [];
    for (const f of t.foliage || []) {
      const base = sampleTerrainHeight(t, f.x, f.z);
      if (f.k === 'tree') trees.push({ x: f.x, y: base, z: f.z, r: f.r, s: f.s });
      else if (f.k === 'rock') rocks.push({ x: f.x, y: base, z: f.z, r: f.r, s: f.s });
    }
    return { trees, rocks };
  }, [t]);
  if (!items.trees.length && !items.rocks.length) return null;
  return (
    <RigidBody type="fixed" colliders={false}>
      {items.trees.map((f, i) => {
        if (treeScale > 0) {                    // 에셋 나무 — 줄기 볼록 껍질
          if (!treePts) return null;
          const es = f.s * treeScale;
          return <ConvexHullCollider key={'t' + i} args={[treePts]} position={[f.x, f.y, f.z]} rotation={[0, f.r, 0]} scale={[es, es, es]} />;
        }                                       // 절차적 기둥(반경 0.13·높이 1.2)
        const r = 0.13 * f.s, hh = 0.45 * f.s;
        return <CapsuleCollider key={'t' + i} args={[hh, r]} position={[f.x, f.y + hh + r, f.z]} />;
      })}
      {items.rocks.map((f, i) => {
        if (rockScale > 0) {                    // 에셋 돌 — 전체 볼록 껍질
          if (!rockPts) return null;
          const es = f.s * rockScale;
          return <ConvexHullCollider key={'r' + i} args={[rockPts]} position={[f.x, f.y, f.z]} rotation={[0, f.r, 0]} scale={[es, es, es]} />;
        }                                       // 절차적 바위(0.4 × 0.28 × 0.4, 중심 y 0.22)
        return <CuboidCollider key={'r' + i} args={[0.4 * f.s, 0.28 * f.s, 0.4 * f.s]} position={[f.x, f.y + 0.22 * f.s, f.z]} />;
      })}
    </RigidBody>
  );
}

export function FoliageInstances({ terrain }: { terrain: TerrainData }) {
  const t = normalizeTerrain(terrain);
  const foliage = useMemo(() => t.foliage || [], [t.foliage]);
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
  const canopyMat = useMemo(() => injectWindBend(new THREE.MeshStandardMaterial({ color: '#2f6b25', roughness: 1, metalness: 0 }), 0.012, false), []);  // 잎만 약한 바람(밴드 X)
  const rockMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#9a9a96', roughness: 1, metalness: 0, flatShading: true }), []);
  useEffect(() => () => {
    grassGeo.dispose(); flowerGeo.dispose(); trunkGeo.dispose(); canopyGeo.dispose(); rockGeo.dispose();
    grassMat.dispose(); flowerMat.dispose(); trunkMat.dispose(); canopyMat.dispose(); rockMat.dispose();
  }, [grassGeo, flowerGeo, trunkGeo, canopyGeo, rockGeo, grassMat, flowerMat, trunkMat, canopyMat, rockMat]);

  // 공유 바람 시계 + 플레이어 인터랙션 위치/반경 갱신 (공유 유니폼이라 1회 갱신으로 전 풀에 반영).
  useFrame((st) => {
    windUniform.value = st.clock.elapsedTime;
    playerPosUniform.value.copy(envFx.playerPos);
    playerRUniform.value = envFx.playerBend;
  });

  // 종류별: 사용자 에셋 지정 시 그 모델 인스턴싱, 아니면 절차적 기본 모양.
  const fa = t.foliageAssets || {};
  return (
    <>
      {fa.grass?.url
        ? <AssetFoliageInstances url={fa.grass.url} scale={fa.grass.scale ?? 1} overrides={fa.grass.overrides} items={grass} t={t} cast={false} sway="bend" />
        : <Instanced items={grass} geo={grassGeo} mat={grassMat} t={t} base={1} cast={false} receive={false} vary="grass" />}
      {fa.flower?.url
        ? <AssetFoliageInstances url={fa.flower.url} scale={fa.flower.scale ?? 1} overrides={fa.flower.overrides} items={flowers} t={t} cast={false} sway="bend" />
        : <Instanced items={flowers} geo={flowerGeo} mat={flowerMat} t={t} base={1} cast={false} receive={false} vary="flower" />}
      {fa.tree?.url
        ? <AssetFoliageInstances url={fa.tree.url} scale={fa.tree.scale ?? 1} overrides={fa.tree.overrides} items={trees} t={t} cast sway="wind" />
        : (<>
            {/* 나무: 기둥 + 잎 — 같은 인스턴스 변환(지오메트리가 미리 y 오프셋됨) */}
            <Instanced items={trees} geo={trunkGeo} mat={trunkMat} t={t} base={1} cast receive={false} />
            <Instanced items={trees} geo={canopyGeo} mat={canopyMat} t={t} base={1} cast receive={false} />
          </>)}
      {fa.rock?.url
        ? <AssetFoliageInstances url={fa.rock.url} scale={fa.rock.scale ?? 1} overrides={fa.rock.overrides} items={rocks} t={t} cast />
        : <Instanced items={rocks} geo={rockGeo} mat={rockMat} t={t} base={1} cast receive={false} vary="rock" />}
    </>
  );
}
