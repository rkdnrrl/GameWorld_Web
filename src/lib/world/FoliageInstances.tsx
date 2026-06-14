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
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, CapsuleCollider, CuboidCollider, ConvexHullCollider } from '@react-three/rapier';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — three 예제(번들 타입 없음). 모델당 1회 볼록껍질 선계산용.
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — three 예제(번들 타입 없음). 원거리 LOD 감폴리용(position/uv/normal/color 보존).
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js';
import { normalizeTerrain, sampleTerrainHeight, foliageVariantsOf, resolveVariantIndex, type TerrainData, type FoliageInstance, type FoliageVariant } from './terrain';
import { loadStaticModelCached } from './modelLoader';
import { resolveMeshMaterial, type MaterialOverrides, type LoadTexFn } from './materialOverride';
import { envFx } from './envFx';
import { G } from './globalWind';

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
function buildBushGeo(): THREE.BufferGeometry {
  // 둥근 잎 덩어리(덤불) — 넓고 낮게. 바닥에 앉힘.
  const g = new THREE.IcosahedronGeometry(0.45, 1);
  g.scale(1.15, 0.78, 1.15);
  g.translate(0, 0.34, 0);
  return g;
}

// ── 바람 흔들림 + 플레이어 인터랙션 (풀/꽃 공용 셰이더 주입). 공유 유니폼을 매 프레임 갱신. ──
// windUniform 은 '위상 누적'(시간×속도) — 속도를 바꿔도 점프 없이 부드럽게. 진폭은 windStrUniform(전역 바람 세기).
const windUniform = { value: 0 };
const windStrUniform = { value: 1 };   // 머티리얼별 기본 진폭(uWindAmt)에 곱하는 전역 세기 배수. 바람 컴포넌트 없으면 1(기본 미풍).
// 플레이어 인터랙션 공유 유니폼 — 모든 풀/꽃 머티리얼이 같은 객체 참조(useFrame 1회 갱신).
const playerPosUniform = { value: new THREE.Vector3() };
const playerRUniform = { value: 0 };           // 반경(0=비활성)
const bendStrUniform = { value: 0.6 };          // 수평 밀어내기 세기
const bendDownUniform = { value: 0.35 };        // 눌림(아래로)
const partStrUniform = { value: 0.55 };         // 덤불 '갈라짐' 세기(수평, 안 눕힘)
/** 플레이어 인터랙션 모드:
 *  'bend'  = 풀/꽃 — 밑동 기준 한 방향으로 눕기(+살짝 눌림).
 *  'part'  = 덤불 — 정점별 수평으로 플레이어 반대 방향으로 벌어짐(밑동 고정, 안 눕음). 지나가면 닫힘.
 *  false   = 인터랙션 없음(바람만). */
type InteractMode = 'bend' | 'part' | false;
/** 바람 흔들림 + 플레이어 인터랙션 셰이더를 임의 머티리얼에 주입. 기존 onBeforeCompile 은 보존(체인).
 *  Standard/Phong/Lambert 등 begin_vertex·project_vertex 청크를 쓰는 lit 머티리얼이면 동작(에셋 식생 포함). */
function injectWindBend<T extends THREE.Material>(mat: T, amt: number, interact: InteractMode = 'bend'): T {
  const amtU = { value: amt };
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) { try { prev.call(mat, shader, renderer); } catch { /* noop */ } }
    shader.uniforms.uWindTime = windUniform;
    shader.uniforms.uWindAmt = amtU;
    shader.uniforms.uWindStr = windStrUniform;
    let header = 'uniform float uWindTime;\nuniform float uWindAmt;\nuniform float uWindStr;\n';
    if (interact) {
      shader.uniforms.uPlayer = playerPosUniform;
      shader.uniforms.uPlayerR = playerRUniform;
      header += 'uniform vec3 uPlayer;\nuniform float uPlayerR;\n';
      if (interact === 'part') {
        shader.uniforms.uPartStr = partStrUniform;
        header += 'uniform float uPartStr;\n';
      } else {
        shader.uniforms.uBendStr = bendStrUniform;
        shader.uniforms.uBendDown = bendDownUniform;
        header += 'uniform float uBendStr;\nuniform float uBendDown;\n';
      }
    }
    shader.vertexShader = header + shader.vertexShader
      .replace('#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float wph = instanceMatrix[3].x * 0.6 + instanceMatrix[3].z * 0.45;
      #else
        float wph = 0.0;
      #endif
      float wsw = position.y * uWindAmt * uWindStr;
      transformed.x += sin(uWindTime * 1.6 + wph) * wsw;
      transformed.z += cos(uWindTime * 1.25 + wph) * wsw * 0.6;`);
    if (!interact) return;
    // project_vertex 확장 — instanceMatrix 적용 후 "월드공간"에서 플레이어 발 주변 변형.
    const partBlock = `
        vec2 _toP = _wp.xz - uPlayer.xz;              // 정점(개별)→플레이어 반대 — 정점마다 달라 "갈라짐"
        float _pd = length(_toP);
        float _infl = 1.0 - smoothstep(0.0, uPlayerR, _pd);
        if (_infl > 0.0) {
          float _ph = max(0.0, _wp.y - _wb.y);        // 밑동 고정(0), 위로 갈수록 더 벌어짐
          vec2 _pdir = _toP / max(_pd, 1e-3);
          _wp.x += _pdir.x * _infl * uPartStr * (0.25 + _ph);  // 수평으로만 벌림(안 눕힘)
          _wp.z += _pdir.y * _infl * uPartStr * (0.25 + _ph);
        }`;
    // 밴드(눕기): 휨 방향은 정점이 아니라 "인스턴스 밑동"(_wb) 기준 — 전 정점이 같은 방향으로 기울어 밑동 축으로 눕는다.
    const bendBlock = `
        vec2 _toP = _wb.xz - uPlayer.xz;              // 밑동→플레이어 반대 방향(인스턴스 공통)
        float _pd = length(_toP);
        float _infl = 1.0 - smoothstep(0.0, uPlayerR, _pd);
        if (_infl > 0.0) {
          float _ph = max(0.0, _wp.y - _wb.y);        // 밑동 기준 높이(위일수록 더 눕음)
          vec2 _pdir = _toP / max(_pd, 1e-3);
          _wp.x += _pdir.x * _infl * uBendStr * _ph;  // 식생 전체가 한 방향으로 눕음(풍선 X)
          _wp.z += _pdir.y * _infl * uBendStr * _ph;
          _wp.y -= _infl * uBendDown * _ph;           // 살짝 눌림
        }`;
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
        ${interact === 'part' ? partBlock : bendBlock}
      }
      mvPosition = viewMatrix * _wp;
      gl_Position = projectionMatrix * mvPosition;`);
  };
  mat.needsUpdate = true;
  return mat;
}
function makeWindMaterial(amt: number, props: THREE.MeshStandardMaterialParameters, interact: InteractMode = 'bend'): THREE.MeshStandardMaterial {
  return injectWindBend(new THREE.MeshStandardMaterial(props), amt, interact);
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
// 식생 InstancedMesh 는 클릭 레이캐스트 비대상(장식) — no-op raycast 로 교체해 수만 인스턴스 ray 테스트 스킵.
// 나무·돌의 물리 차단은 Rapier 콜라이더(별도)가 담당하므로 클릭 레이에서 빠져도 무방.
const NO_RAYCAST: THREE.Object3D['raycast'] = () => {};

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
  if (k === 'bush') { const n2 = hashNoise(it.z * 1.9, it.x * 1.1); return _c.setRGB(0.78 + n * 0.28, 0.9 + n2 * 0.18, 0.72 + n * 0.24); }   // 초록 밝기 변주
  return null;
}

// ── 화면 밖 컬링(frustum): 카메라 시야 밖 풀·꽃은 안 그림. 시야 안은 그대로 다 렌더 → "눈앞에서
//   사라지는" pop 없음(거리 컬링과 다름). 그림자 던지는 나무·돌엔 미적용(시야 밖 나무 그림자가 화면에 들어올 수 있어서). ──
const _frustum = new THREE.Frustum();
const _projScreen = new THREE.Matrix4();
const _camInv = new THREE.Matrix4();
const _fv = new THREE.Vector3();
const _fsphere = new THREE.Sphere(new THREE.Vector3(), 0);
const FOLIAGE_CULL_MARGIN = 4;   // m — 시야 가장자리 여백(빠른 회전 시 edge pop 완화).
// ── 거리 컬링 — 시야(frustum) 안이어도 이 거리(m) 너머 인스턴스는 안 그림. ──
//   frustum 컬링만으론 풀밭/나무 라인을 마주 보면 시야 안 수십만 블레이드+수백 그루가 전부 풀폴리로 그려져
//   삼각형이 폭증(예: 1.1M→13.9M) → GPU 버텍스 바운드 프레임 드랍. 거리 너머는 개별 식별이 안 되므로 잘라낸다.
//   풀·꽃은 짧게(멀리선 안 보임), 나무·돌은 실루엣 풍경이라 길게. 0 = 거리컬링 끔.
// ── 거리별 LOD 단계 [원본까지, 가볍게감폴까지, 강하게감폴까지, (절차적 최대거리)] (m) ──
//   가까움 = 원본 풀디테일 → 멀수록 단계적으로 폴리 뭉갬 → 3번째 값 너머는 "빌보드(2삼각형)" 로 카메라 끝까지.
//   ⚠ 에셋 식생은 거리 컬링 없음 — 멀어도 안 사라지고 빌보드로 보임(사용자 요청). 4번째 값은 안 씀.
//   절차적 풀/꽃(저폴리, 빌보드 없음)만 Instanced 경로에서 4번째 값을 최대 거리컬링에 사용(무한 렌더 방지).
// [원본까지, ─, ─, (절차적 최대거리)] — 1번째 값 너머는 전부 빌보드(평면, 안 사라짐).
//   감폴 메시가 잎-카드형 식생에서 안 보여서 제거 → 근접 원본 / 원거리 빌보드 2단계.
//   2~3번째 값은 1번째와 같게 둬 중간 감폴 밴드를 없앰(빌보드가 1번째 값부터 시작).
const FOLIAGE_LOD: Record<FoliageInstance['k'], [number, number, number, number]> = {
  grass:  [22, 22, 22, 90],
  flower: [22, 22, 22, 120],
  // 덤불: 단색(텍스처 X) 모델이라 빌보드 베이크가 잘 안 잡혀 멀면 사라짐 → 원본 메시를 끝까지(빌보드 안 씀).
  //   d0 를 매우 크게 둬 모든 덤불이 원본 메시(L0)로 그려짐. 덤불은 보통 듬성해 부담 적음.
  bush:   [100000, 100000, 100000, 100000],
  tree:   [130, 130, 130, 600],
  rock:   [70, 70, 70, 250],
};
const _fcam = new THREE.Vector3();   // fillVisible 거리 비교용 카메라 위치(재사용)

/** 시야(frustum) 안 items 만 mesh(들)에 채움. heights=미리 계산된 표면 높이, meshWorld=인스턴스→월드 행렬. margin=시야밖 여백(큰 나무는 크게 줘 그림자 pop 완화). 반환=채운 수. */
function fillVisible(meshes: THREE.InstancedMesh[], items: FoliageInstance[], heights: Float32Array, scaleBase: number, vary: FoliageInstance['k'] | undefined, meshWorld: THREE.Matrix4, margin: number = FOLIAGE_CULL_MARGIN, maxDist2: number = 0): number {
  let n = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const hy = heights[i];
    _fv.set(it.x, hy, it.z).applyMatrix4(meshWorld);
    // 거리 컬링 — 카메라(_fcam)에서 maxDist 너머면 스킵(frustum 안이어도). maxDist2=0 이면 끔.
    if (maxDist2 > 0 && _fv.distanceToSquared(_fcam) > maxDist2) continue;
    _fsphere.center.copy(_fv); _fsphere.radius = margin;
    if (!_frustum.intersectsSphere(_fsphere)) continue;
    _p.set(it.x, hy, it.z);
    _q.setFromAxisAngle(_up, it.r);
    _s.setScalar(it.s * scaleBase);
    _m.compose(_p, _q, _s);
    for (const mesh of meshes) mesh.setMatrixAt(n, _m);
    if (vary) { const col = colorFor(vary, it); if (col) for (const mesh of meshes) mesh.setColorAt(n, col); }
    n++;
  }
  for (const mesh of meshes) {
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  return n;
}

/** 단일 종류 InstancedMesh — count 가 바뀌면 key 로 재생성(args 는 생성시 1회만 반영).
 *  cull=true(풀·꽃) 면 카메라 시야 안만 렌더(대량 식재 성능). cull=false(나무·돌) 면 전부 렌더. */
function Instanced({ items, geo, mat, t, base, cast, receive, vary, cull = false, margin = FOLIAGE_CULL_MARGIN, maxDist = 0 }: {
  items: FoliageInstance[];
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  t: TerrainData;
  base: number;        // 기본 크기 배율
  cast: boolean;
  receive: boolean;
  vary?: FoliageInstance['k'];  // 지정 시 해당 종류 색 변주 적용
  cull?: boolean;      // true=화면 밖 frustum 컬링
  margin?: number;     // 컬링 여백(m) — 큰 나무는 크게
  maxDist?: number;    // 거리 컬링 임계(m). 0=끔.
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const capacity = Math.max(256, Math.ceil((items.length + 1) / 256) * 256);
  // 표면 높이 미리 계산 — 컬링 매 업데이트마다 sampleTerrainHeight 반복 방지.
  const heights = useMemo(() => {
    const a = new Float32Array(items.length);
    for (let i = 0; i < items.length; i++) a[i] = sampleTerrainHeight(t, items[i].x, items[i].z);
    return a;
  }, [items, t]);
  // 컬링 OFF — 1회 전부 세팅(나무·돌).
  useEffect(() => {
    if (cull) return;
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      _p.set(it.x, heights[i], it.z);
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
  }, [items, base, vary, cull, heights]);
  // 컬링 ON — 카메라 시야 안만, 이동/회전 시 갱신(스로틀). 멈추면 0.5s 마다만.
  const itemsRef = useRef(items); itemsRef.current = items;
  const heightsRef = useRef(heights); heightsRef.current = heights;
  const acc = useRef(1);   // 1 로 시작 → 첫 프레임 즉시 채움(원점 뭉침 방지).
  const lastPos = useRef(new THREE.Vector3(1e9, 1e9, 1e9));
  const lastQuat = useRef(new THREE.Quaternion(0, 0, 0, 0));
  useFrame((state, dt) => {
    if (!cull) return;
    const mesh = ref.current;
    if (!mesh) return;
    acc.current += dt;
    const cam = state.camera;
    const moved = cam.position.distanceToSquared(lastPos.current);
    const rotated = 1 - Math.abs(cam.quaternion.dot(lastQuat.current));
    if (acc.current < 0.5 && moved < 0.09 && rotated < 0.00002) return;  // 멈춤: 0.5s 하트비트
    if (acc.current < 0.033) return;                                     // 이동: 최대 ~30fps 갱신
    acc.current = 0;
    lastPos.current.copy(cam.position);
    lastQuat.current.copy(cam.quaternion);
    mesh.updateWorldMatrix(true, false);
    cam.updateMatrixWorld();
    _camInv.copy(cam.matrixWorld).invert();
    _projScreen.multiplyMatrices(cam.projectionMatrix, _camInv);
    _frustum.setFromProjectionMatrix(_projScreen);
    _fcam.copy(cam.position);
    fillVisible([mesh], itemsRef.current, heightsRef.current, base, vary, mesh.matrixWorld, margin, maxDist > 0 ? maxDist * maxDist : 0);
  });
  // 첫 채움 전 원점 뭉침 방지 — 마운트 시 1회만 count=0. (ref 콜백에서 하면 매 렌더마다 0으로 비워져 깜빡임)
  useEffect(() => { if (cull && ref.current) ref.current.count = 0; }, [cull]);
  if (items.length === 0) return null;
  return (
    <instancedMesh
      key={cull ? 'cull' : capacity}
      ref={ref}
      args={[geo, mat, capacity]}
      castShadow={cast}
      receiveShadow={receive}
      frustumCulled={false}
      raycast={NO_RAYCAST}   // 클릭 레이캐스트에서 제외 — 인스턴스 수만 개를 ray 테스트하면 클릭마다 프레임 드랍
      userData={{ alpNoCull: true }}   // World PerfManager 의 frustum/거리 컬링 제외 — 인스턴스 전체 바운딩이 원점 1개라 통째로 컬돼 "그림자만 남는" 버그. 자체 컬링만 사용.
    />
  );
}

// ── 사용자 에셋(GLB 등) 식생 — 모델을 instanced 로 흩뿌림 ──
// lod1=가볍게 감폴, lod2=강하게 감폴(원거리 메시 단계). 감폴 무의미하면 상위와 동일 참조.
interface FoliageParts { parts: { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[]; lod1: THREE.BufferGeometry; lod2: THREE.BufferGeometry }[]; }
const _foliagePartsCache = new Map<string, Promise<FoliageParts>>();

// 감폴 — 로드 시 1회(캐시). removeFrac = 제거할 정점 비율(0~1).
//  - 정점 너무 적으면(<300) 효과 없어 원본 그대로. 너무 많으면(>60k) 로드 프리즈 방지로 스킵.
//  - SimplifyModifier 는 position/uv/normal/color 보존(잎 텍스처·버텍스컬러 안전). 실패 시 원본 폴백.
const _simplifier = new SimplifyModifier();
function makeLodGeo(geo: THREE.BufferGeometry, removeFrac: number): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const vcount = pos ? pos.count : 0;
  if (vcount < 300 || vcount > 60000) return geo;        // 의미 없음/프리즈 위험 → 원본 사용
  try {
    const remove = Math.floor(vcount * removeFrac);
    const lod = _simplifier.modify(geo, remove) as THREE.BufferGeometry;
    lod.computeVertexNormals();                           // 콜랩스 후 노멀 매끄럽게
    lod.computeBoundingSphere();
    return lod;
  } catch { return geo; }                                 // 퇴화 등 실패 → 원본
}

// ── 원거리 임포스터(빌보드) ──────────────────────────────────────────────
//  먼 에셋 식생을 "평면 1장(2삼각형/인스턴스)" 으로 대체 — 모델당 폴리와 무관하게 비용 고정.
//  로드 시 모델 정면을 렌더타깃에 1회 베이크(캐시)해 텍스처로 만들고, 빌보드(항상 카메라 향함)로 그린다.
//  근접은 원본 메시, lodDist 너머는 이 임포스터 → "멀리도 보이되 완전 최적화".
const FOLIAGE_IMPOSTOR = true;   // 원거리 = 빌보드(평면 1장, 구운 텍스처). 감폴은 얇은 잎을 무너뜨려 소멸시키므로 먼 건 빌보드로.
interface Impostor { geo: THREE.BufferGeometry; mat: THREE.Material; }
const _impostorCache = new Map<string, Impostor | null>();   // url → 임포스터(베이크 실패 시 null)

/** 빌보드 쿼드 — x:-w/2..w/2, y:0..h(밑동 기준), uv 0..1. */
function makeImpostorQuad(w: number, h: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const hw = w / 2;
  g.setAttribute('position', new THREE.Float32BufferAttribute([-hw, 0, 0, hw, 0, 0, hw, h, 0, -hw, h, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}
/** 베이크 텍스처를 입힌 빌보드 머티리얼 — 인스턴스 위치/스케일만 쓰고 항상 카메라 쪽으로 펴짐(실린더 빌보드).
 *  MeshBasicMaterial 기반(색공간/alphaTest 파이프라인 재사용) + project_vertex 치환. */
function makeImpostorMaterial(tex: THREE.Texture): THREE.Material {
  // toneMapped:false — 베이크 시 이미 렌더러 톤매핑이 적용된 텍스처라 재적용 금지(이중 톤매핑→탈색 방지).
  const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide, toneMapped: false });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>',
      `mat4 _mi = modelMatrix * instanceMatrix;
       vec3 _ipos = _mi[3].xyz;                                  // 인스턴스 월드 위치(밑동)
       float _sx = length(_mi[0].xyz);                           // 월드 스케일 x
       float _sy = length(_mi[1].xyz);                           // 월드 스케일 y
       vec3 _camR = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));  // 카메라 right(월드)
       vec3 _wp = _ipos + _camR * (transformed.x * _sx) + vec3(0.0, 1.0, 0.0) * (transformed.y * _sy);
       vec4 mvPosition = viewMatrix * vec4(_wp, 1.0);
       gl_Position = projectionMatrix * mvPosition;`);
  };
  return mat;
}
const _bakeBox = new THREE.Box3();
/** 모델(parts) 정면을 렌더타깃에 베이크 → 임포스터(쿼드+머티리얼). url 캐시. 실패 시 null. */
function bakeImpostor(gl: THREE.WebGLRenderer, parts: FoliageParts['parts'], url: string): Impostor | null {
  if (_impostorCache.has(url)) return _impostorCache.get(url) ?? null;
  try {
    _bakeBox.makeEmpty();
    const meshes: THREE.Mesh[] = [];
    for (const p of parts) {
      p.geo.computeBoundingBox();
      if (p.geo.boundingBox) _bakeBox.union(p.geo.boundingBox);
      meshes.push(new THREE.Mesh(p.geo, p.mat));
    }
    if (_bakeBox.isEmpty()) { _impostorCache.set(url, null); return null; }
    const wx = _bakeBox.max.x - _bakeBox.min.x, wz = _bakeBox.max.z - _bakeBox.min.z;
    const W = Math.max(wx, wz, 0.01), H = Math.max(_bakeBox.max.y - _bakeBox.min.y, 0.01);
    const texH = 256, texW = Math.max(16, Math.min(256, Math.round(256 * W / H)));
    const rt = new THREE.WebGLRenderTarget(texW, texH, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const dir = new THREE.DirectionalLight(0xffffff, 1.1); dir.position.set(0.4, 1, 0.8); scene.add(dir);
    for (const m of meshes) scene.add(m);
    const depth = Math.max(wx, wz) + 4;
    const cam = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 0.001, depth + 2);
    cam.position.set(0, H / 2, depth / 2 + 1);   // 정면(-z), 밑동~정수리(y 0..H) 프레이밍
    cam.updateMatrixWorld();
    const prevRT = gl.getRenderTarget();
    const prevClear = new THREE.Color(); gl.getClearColor(prevClear); const prevAlpha = gl.getClearAlpha();
    gl.setRenderTarget(rt);
    gl.setClearColor(0x000000, 0); gl.clear(true, true, true);
    gl.render(scene, cam);
    gl.setRenderTarget(prevRT);
    gl.setClearColor(prevClear, prevAlpha);
    const imp: Impostor = { geo: makeImpostorQuad(W, H), mat: makeImpostorMaterial(rt.texture) };
    _impostorCache.set(url, imp);
    return imp;
  } catch { _impostorCache.set(url, null); return null; }
}

/** 잎/식생 머티리얼 보정.
 *  - 양면(DoubleSide): 단면 잎 카드가 backface 컬링돼 컬러에서 안 보이는 문제 해결(절대 가려지지 않음).
 *  - 원래 "투명(블렌딩)"이던 잎만 alphaTest 컷아웃으로 전환 — 인스턴싱은 블렌딩 정렬이 안 되므로.
 *    ⚠ 불투명(OPAQUE) 머티리얼엔 alphaTest 를 절대 걸지 않는다(알파 채널이 0/무의미해 통째로 사라짐). */
type SwayMode = 'bend' | 'wind' | 'part' | false;
/** 사용자 지정 앨베도 텍스처를 머티리얼 map 으로 — 모델에 텍스처 없어 흰색일 때 직접 색 입히기. */
function applyFoliageAlbedo(mat: THREE.Material | THREE.Material[], tex: THREE.Texture): THREE.Material | THREE.Material[] {
  const apply = (m: THREE.Material): THREE.Material => {
    const sm = m as THREE.MeshStandardMaterial;
    sm.map = tex;
    if (sm.color) sm.color.set('#ffffff');     // map 이 곱해지므로 베이스는 흰색
    sm.vertexColors = false;                    // 텍스처 우선(버텍스컬러와 곱해 칙칙해지지 않게)
    // 알파 컷아웃 — 잎/덤불 텍스처(투명 PNG)가 안 잘려 흰 카드로 폭발하는 것 방지(유니티 Alpha Clip).
    // resolveMeshMaterial(부위별 경로)과 동일. 불투명 텍스처(알파=1)엔 무영향. instancing 은 블렌딩 정렬 안 돼 컷아웃 필수.
    sm.alphaTest = Math.max(sm.alphaTest || 0, 0.5);
    sm.transparent = false;
    sm.depthWrite = true;
    sm.side = THREE.DoubleSide;
    sm.needsUpdate = true;
    return m;
  };
  return Array.isArray(mat) ? mat.map(apply) : apply(mat);
}
function prepFoliageMaterial(mat: THREE.Material | THREE.Material[], sway: SwayMode = false, hasVColor = false): THREE.Material | THREE.Material[] {
  const fix = (m: THREE.Material): THREE.Material => {
    m.side = THREE.DoubleSide;
    const sm = m as THREE.MeshStandardMaterial;
    // 일반 에셋(fixModelMaterials)과 동일 보정 — 식생 경로도 적용해야 색/텍스처가 맞다.
    if (hasVColor && !sm.vertexColors) sm.vertexColors = true;          // 버텍스 컬러 모델(예: Quaternius 풀) — 안 켜면 흰색
    if (sm.map) sm.map.colorSpace = THREE.SRGBColorSpace;               // 텍스처 linear→sRGB (어둡게/탈색 방지)
    if (sm.emissiveMap) sm.emissiveMap.colorSpace = THREE.SRGBColorSpace;
    if (sm.map && sm.color && sm.color.getHex() < 0x202020) sm.color.set('#ffffff');   // 텍스처×검정 → 안 보임 방지
    if (sm.transparent && (sm.map || sm.alphaMap)) {
      sm.alphaTest = Math.max(sm.alphaTest || 0, 0.3);   // 블렌딩 잎 → 컷아웃(정렬 무관 렌더 + 잎모양 그림자)
      sm.transparent = false;
      sm.depthWrite = true;
    }
    // 'bend' 풀/꽃 → 바람 흔들림 + 플레이어 밴드(밑동 고정, 위로 갈수록 눕음)
    // 'wind' 나무 → 약한 바람 흔들림만(밴드 X — 큰 나무가 플레이어 쪽으로 눕는 건 부자연스러움)
    if (sway === 'bend') injectWindBend(m, 0.06, 'bend');
    else if (sway === 'part') injectWindBend(m, 0.04, 'part');   // 덤불 — 갈라짐(안 눕음)
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
function loadFoliageParts(url: string, overrides?: MaterialOverrides, sway: SwayMode = false, textureUrl?: string): Promise<FoliageParts> {
  const ovKeys = overrides ? Object.keys(overrides).sort().join(',') : '';
  const key = url + '|' + ovKeys + (sway ? '|' + sway : '') + (textureUrl ? '|tex:' + textureUrl : '');
  let entry = _foliagePartsCache.get(key);
  if (!entry) {
    entry = loadStaticModelCached(url).then((model) => {
      model.updateMatrixWorld(true);
      // 사용자 지정 앨베도 텍스처 — 모델에 텍스처 없을 때 직접 입힘. 모든 머티리얼 공유(1회 로드).
      const albedo = textureUrl ? (() => {
        const tx = new THREE.TextureLoader().load(textureUrl);
        tx.colorSpace = THREE.SRGBColorSpace; tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
        return tx;
      })() : null;
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
          if (albedo) mat = applyFoliageAlbedo(mat, albedo);   // 사용자 텍스처 우선
          // albedo(사용자 텍스처) 적용 시엔 hasVColor 를 false 로 — 안 그러면 prepFoliageMaterial 이
          // 버텍스컬러를 다시 켜서 (흰색) 버텍스컬러가 텍스처를 덮어 흰색으로 보인다.
          parts.push({ geo: g, mat: prepFoliageMaterial(mat, sway, !albedo && !!g.getAttribute('color')), lod1: g, lod2: g });
        }
      });
      const box = new THREE.Box3();
      for (const p of parts) { p.geo.computeBoundingBox(); if (p.geo.boundingBox) box.union(p.geo.boundingBox); }
      const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, minY = box.min.y;
      for (const p of parts) {
        p.geo.translate(-cx, -minY, -cz); p.geo.computeBoundingSphere();   // 밑동 y=0, xz 중심
        // 중간 거리 메시 LOD 2단계 — lod1(가볍게) → lod2(lod1 에서 한 번 더 = 원본의 ~25%).
        //  단계적으로 폴리를 뭉개 가까움→멈 품질 그라데이션. 감폴 무의미(저폴리)하면 원본과 동일 참조.
        // 감폴 제거 — SimplifyModifier 가 잎-카드형 식생을 (약하게 줄여도) 무너뜨려 중간거리 메시가 안 보임.
        // 근접=원본 / 원거리=빌보드 2단계만 사용(둘 다 확실히 보임). lod1/lod2 는 원본 참조(쓰이지 않음).
        p.lod1 = p.geo;
        p.lod2 = p.geo;
      }
      return { parts };
    });
    _foliagePartsCache.set(key, entry);
  }
  return entry;
}

/** 시야 안 items 를 거리 단계(tier)별로 분배 — 각 tier = { maxD2, meshes }. 오름차순 정렬 가정.
 *  인스턴스는 d2 <= maxD2 인 첫 tier 에 들어감(가까운=낮은 tier=고품질).
 *  ⚠ 거리 컬링 없음 — 마지막 tier(빌보드)가 카메라 far plane 까지 전부 받음(멀어도 안 사라지고 완전 뭉갠 빌보드로 보임).
 *  색 변주 없음(asset 은 instanceColor 미사용). */
interface LodTier { maxD2: number; meshes: THREE.InstancedMesh[] }
function fillVisibleTiered(tiers: LodTier[], items: FoliageInstance[], heights: Float32Array, scaleBase: number, meshWorld: THREE.Matrix4, margin: number): void {
  const counts = new Array(tiers.length).fill(0);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const hy = heights[i];
    _fv.set(it.x, hy, it.z).applyMatrix4(meshWorld);
    const d2 = _fv.distanceToSquared(_fcam);
    _fsphere.center.copy(_fv); _fsphere.radius = margin;
    if (!_frustum.intersectsSphere(_fsphere)) continue;          // 시야 밖만 제외(거리 컬링 X)
    let ti = 0; while (ti < tiers.length - 1 && d2 > tiers[ti].maxD2) ti++;   // d2 가 드는 첫 tier(없으면 마지막=빌보드)
    _p.set(it.x, hy, it.z);
    _q.setFromAxisAngle(_up, it.r);
    _s.setScalar(it.s * scaleBase);
    _m.compose(_p, _q, _s);
    const c = counts[ti];
    for (const m of tiers[ti].meshes) m.setMatrixAt(c, _m);
    counts[ti] = c + 1;
  }
  for (let k = 0; k < tiers.length; k++) for (const m of tiers[k].meshes) { m.count = counts[k]; m.instanceMatrix.needsUpdate = true; }
}

function AssetFoliageInstances({ url, scale, items, t, cast, overrides, sway = false, textureUrl, cull = false, margin = FOLIAGE_CULL_MARGIN, bands }: {
  url: string; scale: number; items: FoliageInstance[]; t: TerrainData; cast: boolean; overrides?: MaterialOverrides; sway?: SwayMode; textureUrl?: string; cull?: boolean; margin?: number;
  /** [원본까지, lod1까지, lod2까지, 빌보드까지(=최대거리)] m. */
  bands: [number, number, number, number];
}) {
  const [parts, setParts] = useState<FoliageParts | null>(null);
  const ovKey = overrides ? Object.keys(overrides).sort().join(',') : '';
  useEffect(() => {
    let alive = true;
    // 로드 완료 시에만 교체 — 전환 중 이전 모델 유지(빈 깜빡임 방지). 스테일은 alive 로 차단.
    loadFoliageParts(url, overrides, sway, textureUrl).then(p => { if (alive) setParts(p); }).catch(() => { if (alive) setParts(null); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ovKey, sway, textureUrl]);
  const gl = useThree(s => s.gl);
  const [d0, d1, d2, d3] = bands;
  const tiered = cull && d3 > 0;
  // refMesh[level][part] — level 0=원본, 1=lod1, 2=lod2. refBill=원거리 빌보드.
  const refMesh = useRef<THREE.InstancedMesh[][]>([[], [], []]);
  const refBill = useRef<THREE.InstancedMesh | null>(null);
  // 원거리 임포스터 베이크 — parts 로드 후 1회(url 캐시). gl 로 렌더타깃에 모델 정면 굽기.
  const [impostor, setImpostor] = useState<Impostor | null>(null);
  useEffect(() => {
    if (!FOLIAGE_IMPOSTOR || !tiered || !parts) { setImpostor(null); return; }
    setImpostor(bakeImpostor(gl, parts.parts, url));
  }, [parts, tiered, gl, url]);
  const capacity = Math.max(256, Math.ceil((items.length + 1) / 256) * 256);
  // 표면 높이 미리 계산 — 컬링 업데이트마다 반복 방지.
  const heights = useMemo(() => {
    const a = new Float32Array(items.length);
    for (let i = 0; i < items.length; i++) a[i] = sampleTerrainHeight(t, items[i].x, items[i].z);
    return a;
  }, [items, t]);
  // 컬링 OFF — 1회 전부 세팅(원본 메시만).
  useEffect(() => {
    if (tiered || !parts) return;
    const meshes = refMesh.current[0].slice(0, parts.parts.length).filter(Boolean);
    if (!meshes.length) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      _p.set(it.x, heights[i], it.z);
      _q.setFromAxisAngle(_up, it.r);
      _s.setScalar(it.s * scale);
      _m.compose(_p, _q, _s);
      for (const mesh of meshes) mesh.setMatrixAt(i, _m);
    }
    for (const mesh of meshes) { mesh.count = items.length; mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); }
  }, [items, scale, parts, capacity, tiered, heights]);
  // 컬링 ON — 카메라 시야 안만, 이동/회전 시 갱신(스로틀). 거리 단계별 분배.
  const itemsRef = useRef(items); itemsRef.current = items;
  const heightsRef = useRef(heights); heightsRef.current = heights;
  const acc = useRef(1);
  const lastPos = useRef(new THREE.Vector3(1e9, 1e9, 1e9));
  const lastQuat = useRef(new THREE.Quaternion(0, 0, 0, 0));
  useFrame((state, dt) => {
    if (!tiered || !parts) return;
    const np = parts.parts.length;
    const L0 = refMesh.current[0].slice(0, np).filter(Boolean);
    const L1 = refMesh.current[1].slice(0, np).filter(Boolean);
    const L2 = refMesh.current[2].slice(0, np).filter(Boolean);
    if (L0.length < np || L1.length < np || L2.length < np) return;
    acc.current += dt;
    const cam = state.camera;
    const moved = cam.position.distanceToSquared(lastPos.current);
    const rotated = 1 - Math.abs(cam.quaternion.dot(lastQuat.current));
    if (acc.current < 0.5 && moved < 0.09 && rotated < 0.00002) return;
    if (acc.current < 0.033) return;
    acc.current = 0;
    lastPos.current.copy(cam.position);
    lastQuat.current.copy(cam.quaternion);
    L0[0].updateWorldMatrix(true, false);
    cam.updateMatrixWorld();
    _camInv.copy(cam.matrixWorld).invert();
    _projScreen.multiplyMatrices(cam.projectionMatrix, _camInv);
    _frustum.setFromProjectionMatrix(_projScreen);
    _fcam.copy(cam.position);
    // 단계: 원본(d0) → lod1(d1) → lod2 → [빌보드(d3) | 빌보드없으면 lod2 가 d3 까지].
    const tiers: LodTier[] = impostor && refBill.current
      ? [{ maxD2: d0 * d0, meshes: L0 }, { maxD2: d1 * d1, meshes: L1 }, { maxD2: d2 * d2, meshes: L2 }, { maxD2: d3 * d3, meshes: [refBill.current] }]
      : [{ maxD2: d0 * d0, meshes: L0 }, { maxD2: d1 * d1, meshes: L1 }, { maxD2: d3 * d3, meshes: L2 }];
    fillVisibleTiered(tiers, itemsRef.current, heightsRef.current, scale, L0[0].matrixWorld, margin);
  });
  // 첫 채움 전 원점 뭉침 방지 — 마운트/로드 시 1회만 count=0. (ref 콜백에서 하면 매 렌더마다 0으로 비워져 깜빡임)
  useEffect(() => {
    if (!tiered || !parts) return;
    for (const lvl of refMesh.current) for (const m of lvl.slice(0, parts.parts.length)) if (m) m.count = 0;
    if (refBill.current) refBill.current.count = 0;
  }, [tiered, parts, impostor]);
  if (!parts || items.length === 0) return null;
  const LOD_GEO = (p: FoliageParts['parts'][number], level: number) => level === 0 ? p.geo : level === 1 ? p.lod1 : p.lod2;
  return (
    <>
      {/* LOD 메시 3단계(0=원본·1=lod1·2=lod2). 비-tiered 면 level0 만 의미(나머지는 count 0). */}
      {[0, 1, 2].map(level => (tiered || level === 0) && parts.parts.map((p, i) => (
        <instancedMesh
          key={'L' + level + '-' + i + '-' + (tiered ? 'cull' : capacity)}
          ref={(m) => { if (m) refMesh.current[level][i] = m as THREE.InstancedMesh; }}
          args={[LOD_GEO(p, level), p.mat, capacity]}
          castShadow={cast && level < 2}    // 원거리(lod2)는 그림자 생략(비용↓, 멀어 티 안남)
          receiveShadow={false}
          frustumCulled={false}
          raycast={NO_RAYCAST}   // 클릭 레이캐스트에서 제외 (인스턴스 수만 개 ray 테스트 방지)
          userData={{ alpNoCull: true }}   // World PerfManager 컬링 제외 — 인스턴스 바운딩이 원점 1개라 통째로 컬돼 "그림자만 남는" 버그. 자체 컬링만 사용.
        />
      )))}
      {/* 최원거리 임포스터(빌보드 1개) — 베이크됐을 때만 마운트. */}
      {tiered && impostor && (
        <instancedMesh
          key={'bill-' + capacity}
          ref={(m) => { refBill.current = (m as THREE.InstancedMesh) || null; }}
          args={[impostor.geo, impostor.mat, capacity]}
          castShadow={false}
          receiveShadow={false}
          frustumCulled={false}
          raycast={NO_RAYCAST}
          userData={{ alpNoCull: true }}
        />
      )}
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
/** 여러 url 의 볼록껍질을 한꺼번에 로드해 Map<url, Float32Array> 로. variant 별 콜라이더용. */
function useHullMap(urls: string[], trunkOnly: boolean): Map<string, Float32Array> {
  const [map, setMap] = useState<Map<string, Float32Array>>(new Map());
  const key = urls.join('|');
  useEffect(() => {
    let alive = true;
    const m = new Map<string, Float32Array>();
    Promise.all(urls.map(u => loadFoliageHull(u, trunkOnly).then(pts => { m.set(u, pts); }).catch(() => {})))
      .then(() => { if (alive) setMap(m); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, trunkOnly]);
  return map;
}

export function TreeRockColliders({ terrain }: { terrain: TerrainData }) {
  const t = normalizeTerrain(terrain);
  const treeVariants = useMemo(() => foliageVariantsOf(t.foliageAssets, 'tree'), [t.foliageAssets]);
  const rockVariants = useMemo(() => foliageVariantsOf(t.foliageAssets, 'rock'), [t.foliageAssets]);
  const treeUrls = useMemo(() => treeVariants.map(v => v.url), [treeVariants]);
  const rockUrls = useMemo(() => rockVariants.map(v => v.url), [rockVariants]);
  const treeHulls = useHullMap(treeUrls, true);   // 줄기만 → 수관 아래 걸어다님
  const rockHulls = useHullMap(rockUrls, false);

  const items = useMemo(() => {
    const trees: { x: number; y: number; z: number; r: number; s: number; v?: number }[] = [];
    const rocks: { x: number; y: number; z: number; r: number; s: number; v?: number }[] = [];
    for (const f of t.foliage || []) {
      const base = sampleTerrainHeight(t, f.x, f.z);
      if (f.k === 'tree') trees.push({ x: f.x, y: base, z: f.z, r: f.r, s: f.s, v: f.v });
      else if (f.k === 'rock') rocks.push({ x: f.x, y: base, z: f.z, r: f.r, s: f.s, v: f.v });
    }
    return { trees, rocks };
  }, [t]);
  if (!items.trees.length && !items.rocks.length) return null;
  return (
    <RigidBody type="fixed" colliders={false}>
      {items.trees.map((f, i) => {
        if (treeVariants.length) {              // 에셋 나무 — variant 별 줄기 볼록 껍질
          const v = treeVariants[resolveVariantIndex({ k: 'tree', x: f.x, z: f.z, s: f.s, r: f.r, v: f.v }, treeVariants.length)];
          const pts = treeHulls.get(v.url);
          if (!pts) return null;
          const es = f.s * (v.scale ?? 1);
          return <ConvexHullCollider key={'t' + i} args={[pts]} position={[f.x, f.y, f.z]} rotation={[0, f.r, 0]} scale={[es, es, es]} />;
        }                                       // 절차적 기둥(반경 0.13·높이 1.2)
        const r = 0.13 * f.s, hh = 0.45 * f.s;
        return <CapsuleCollider key={'t' + i} args={[hh, r]} position={[f.x, f.y + hh + r, f.z]} />;
      })}
      {items.rocks.map((f, i) => {
        if (rockVariants.length) {              // 에셋 돌 — variant 별 전체 볼록 껍질
          const v = rockVariants[resolveVariantIndex({ k: 'rock', x: f.x, z: f.z, s: f.s, r: f.r, v: f.v }, rockVariants.length)];
          const pts = rockHulls.get(v.url);
          if (!pts) return null;
          const es = f.s * (v.scale ?? 1);
          return <ConvexHullCollider key={'r' + i} args={[pts]} position={[f.x, f.y, f.z]} rotation={[0, f.r, 0]} scale={[es, es, es]} />;
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
  const bushes = useMemo(() => foliage.filter(f => f.k === 'bush'), [foliage]);

  const grassGeo = useMemo(() => buildGrassGeo(), []);
  const flowerGeo = useMemo(() => buildFlowerGeo(), []);
  const trunkGeo = useMemo(() => buildTrunkGeo(), []);
  const canopyGeo = useMemo(() => buildCanopyGeo(), []);
  const rockGeo = useMemo(() => buildRockGeo(), []);
  const bushGeo = useMemo(() => buildBushGeo(), []);
  // 풀/꽃: 바람+눕기. 덤불: 바람+갈라짐(안 눕음). 나무/돌: 정적.
  const grassMat = useMemo(() => makeWindMaterial(0.16, { vertexColors: true, side: THREE.DoubleSide, roughness: 1, metalness: 0 }), []);
  const flowerMat = useMemo(() => makeWindMaterial(0.12, { vertexColors: true, side: THREE.DoubleSide, roughness: 1, metalness: 0 }), []);
  const trunkMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#6b4a2b', roughness: 0.95, metalness: 0 }), []);
  const canopyMat = useMemo(() => injectWindBend(new THREE.MeshStandardMaterial({ color: '#2f6b25', roughness: 1, metalness: 0 }), 0.012, false), []);  // 잎만 약한 바람(밴드 X)
  const rockMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#9a9a96', roughness: 1, metalness: 0, flatShading: true }), []);
  const bushMat = useMemo(() => makeWindMaterial(0.04, { color: '#3e7a30', roughness: 1, metalness: 0 }, 'part'), []);   // 덤불 — 갈라짐 인터랙션
  useEffect(() => () => {
    grassGeo.dispose(); flowerGeo.dispose(); trunkGeo.dispose(); canopyGeo.dispose(); rockGeo.dispose(); bushGeo.dispose();
    grassMat.dispose(); flowerMat.dispose(); trunkMat.dispose(); canopyMat.dispose(); rockMat.dispose(); bushMat.dispose();
  }, [grassGeo, flowerGeo, trunkGeo, canopyGeo, rockGeo, bushGeo, grassMat, flowerMat, trunkMat, canopyMat, rockMat, bushMat]);

  // 공유 바람 시계 + 플레이어 인터랙션 위치/반경 갱신 (공유 유니폼이라 1회 갱신으로 전 풀에 반영).
  // 바람 컴포넌트(G.active>0)가 있으면 그 세기/속도를 따르고, 없으면 기본 미풍(세기 1·속도 1)으로 폴백.
  useFrame((_, dt) => {
    const on = G.active > 0;
    const spd = on ? Math.max(0.05, G.uWindSpeed.value) : 1;
    windUniform.value += Math.min(dt, 0.05) * spd;          // 위상 누적 — 속도 바꿔도 점프 없음
    windStrUniform.value = on ? Math.max(0, G.uWindStr.value) : 1;
    playerPosUniform.value.copy(envFx.playerPos);
    playerRUniform.value = envFx.playerBend;
  });

  // 종류별 variant 배열(에셋). 비어 있으면 절차적 기본 모양.
  const fa = t.foliageAssets;
  const grassV = useMemo(() => foliageVariantsOf(fa, 'grass'), [fa]);
  const flowerV = useMemo(() => foliageVariantsOf(fa, 'flower'), [fa]);
  const treeV = useMemo(() => foliageVariantsOf(fa, 'tree'), [fa]);
  const rockV = useMemo(() => foliageVariantsOf(fa, 'rock'), [fa]);
  const bushV = useMemo(() => foliageVariantsOf(fa, 'bush'), [fa]);
  // 개체를 variant 별로 나눠 각 모델로 인스턴싱. variant 는 위치 해시로 결정(안정적·렌더/콜라이더 일치).
  const assetCat = (variants: FoliageVariant[], items: FoliageInstance[], cast: boolean, sway: SwayMode, cull = false, margin = FOLIAGE_CULL_MARGIN, bands: [number, number, number, number] = [0, 0, 0, 0]) =>
    variants.map((v, vi) => {
      const bucket = variants.length === 1 ? items : items.filter(it => resolveVariantIndex(it, variants.length) === vi);
      if (!bucket.length) return null;
      return <AssetFoliageInstances key={vi + '|' + v.url} url={v.url} scale={v.scale ?? 1} overrides={v.overrides} textureUrl={v.textureUrl} items={bucket} t={t} cast={cast} sway={sway} cull={cull} margin={margin} bands={bands} />;
    });
  return (
    <>
      {/* 전부 화면 밖 frustum 컬링 — 시야 안만 렌더(수천 그루 나무도 메인+그림자 패스에서 빠짐).
          나무·돌은 그림자 던지므로 마진을 크게(12/8m) 줘 시야 살짝 밖 나무 그림자가 사라지는 걸 완화. */}
      {/* 절차적(procedural) 식생도 거리 컬링 제거(maxDist=0) — 멀어도 안 사라짐(저폴리라 풀메시 유지).
          frustum(시야 밖)·farClip(카메라 시야 거리)만 한계. */}
      {grassV.length ? assetCat(grassV, grass, false, 'bend', true, FOLIAGE_CULL_MARGIN, FOLIAGE_LOD.grass)
        : <Instanced items={grass} geo={grassGeo} mat={grassMat} t={t} base={1} cast={false} receive={false} vary="grass" cull maxDist={0} />}
      {flowerV.length ? assetCat(flowerV, flowers, false, 'bend', true, FOLIAGE_CULL_MARGIN, FOLIAGE_LOD.flower)
        : <Instanced items={flowers} geo={flowerGeo} mat={flowerMat} t={t} base={1} cast={false} receive={false} vary="flower" cull maxDist={0} />}
      {treeV.length ? assetCat(treeV, trees, true, false, true, 12, FOLIAGE_LOD.tree)
        : (<>
            {/* 나무: 기둥 + 잎 — 같은 인스턴스 변환(지오메트리가 미리 y 오프셋됨) */}
            <Instanced items={trees} geo={trunkGeo} mat={trunkMat} t={t} base={1} cast receive={false} cull margin={12} maxDist={0} />
            <Instanced items={trees} geo={canopyGeo} mat={canopyMat} t={t} base={1} cast receive={false} cull margin={12} maxDist={0} />
          </>)}
      {rockV.length ? assetCat(rockV, rocks, true, false, true, 8, FOLIAGE_LOD.rock)
        : <Instanced items={rocks} geo={rockGeo} mat={rockMat} t={t} base={1} cast receive={false} vary="rock" cull margin={8} maxDist={0} />}
      {/* 덤불: 그림자 던짐 + 콜라이더 없음(통과) + 'part'(지나가면 갈라짐, 안 눕음) + 컬링 margin 10 */}
      {bushV.length ? assetCat(bushV, bushes, true, 'part', true, 10, FOLIAGE_LOD.bush)
        : <Instanced items={bushes} geo={bushGeo} mat={bushMat} t={t} base={1} cast receive={false} vary="bush" cull margin={10} maxDist={0} />}
    </>
  );
}
