'use client';
/**
 * 성능/컬링 디버그 HUD — 컬링은 "잘 될수록 화면 변화가 없어서" 눈으로 작동 확인이 불가.
 * 대신 드로우콜·삼각형·컬링 수를 숫자로 띄운다.
 *   - 카메라를 빈 쪽(하늘/땅)으로 돌리면 **frustum-culled now ↑** → 프러스텀 컬링 작동 증거.
 *   - 거리 멀어지면 distance-culled ↑.
 *   - 오클루전 켜고 벽 뒤를 보면 occlusion-culled ↑.
 *
 * ⚠ draw calls 측정: PostFX(EffectComposer) 가 켜지면 three 의 gl.info.autoReset(매 렌더 리셋)
 *   때문에 마지막 풀스크린 패스(=1 draw call)만 읽혀 "1" 로 고정됨. → show 동안 autoReset 끄고
 *   매 프레임 직접 스냅샷+리셋해 전체 패스(그림자+메인+포스트) 합계를 잡는다.
 *
 * 켜는 법: 그래픽 설정(⚙) 패널의 "성능 통계" 토글 → show prop.
 * 꺼지면 DOM 요소 제거 + autoReset 복구 → 프로덕션 무해. textContent 직접 갱신이라 React 리렌더 0.
 */
import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export default function PerfHUD({ show }: { show: boolean }) {
  const gl = useThree(s => s.gl);
  const scene = useThree(s => s.scene);
  const elRef = useRef<HTMLDivElement | null>(null);
  const acc = useRef(0);
  const frames = useRef(0);
  const lastCalls = useRef(0);
  const lastTris = useRef(0);
  // 프러스텀 판정용 재사용 객체
  const _frustum = useRef(new THREE.Frustum()).current;
  const _proj = useRef(new THREE.Matrix4()).current;
  const _sph = useRef(new THREE.Sphere()).current;

  useEffect(() => {
    if (!show || typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;top:8px;left:8px;z-index:2147483647;font:12px/1.5 ui-monospace,monospace;' +
      'color:#7CFC00;background:rgba(0,0,0,0.62);padding:6px 9px;border-radius:6px;' +
      'white-space:pre;pointer-events:none;text-shadow:0 1px 2px #000';
    document.body.appendChild(el);
    elRef.current = el;
    // gl.info 를 직접 관리 (PostFX 다중 패스 합산 위해)
    const prevAuto = gl.info.autoReset;
    gl.info.autoReset = false;
    return () => {
      el.remove();
      elRef.current = null;
      gl.info.autoReset = prevAuto;
    };
  }, [show, gl]);

  useFrame((state, dt) => {
    const el = elRef.current;
    if (!el) return;

    // ── 매 프레임: 직전 프레임의 전체 패스 합계 스냅샷 후 리셋 ──
    //   (내 useFrame 은 R3F 렌더 전에 돌므로 info = 직전 프레임 1회분)
    lastCalls.current = gl.info.render.calls;
    lastTris.current = gl.info.render.triangles;
    gl.info.reset();

    acc.current += dt;
    frames.current++;
    if (acc.current < 0.3) return;   // 텍스트/traverse 는 ~3Hz
    const fps = frames.current / acc.current;
    acc.current = 0;
    frames.current = 0;

    // 카메라 프러스텀 (지금 화면 밖 메시 수 직접 계산 → 카메라 돌리면 변함)
    _proj.multiplyMatrices(state.camera.projectionMatrix, state.camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_proj);

    let meshes = 0, vis = 0, distC = 0, occC = 0, frusNow = 0;
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh && !(m as unknown as THREE.SkinnedMesh).isSkinnedMesh) return;
      meshes++;
      if (o.visible) vis++;
      if (o.userData.alpCulled) distC++;
      if (o.userData.alpOccluded) occC++;
      // 프러스텀 켜진 메시 중, 지금 카메라 시야 밖인 것 = three 가 안 그리는 것
      if (m.frustumCulled) {
        const g = m.geometry as THREE.BufferGeometry | undefined;
        if (g?.boundingSphere) {
          _sph.copy(g.boundingSphere).applyMatrix4(m.matrixWorld);
          if (!_frustum.intersectsSphere(_sph)) frusNow++;
        }
      }
    });
    el.textContent =
      `FPS ~${fps.toFixed(0)}\n` +
      `draw calls ${lastCalls.current}\n` +
      `triangles  ${(lastTris.current / 1000).toFixed(0)}k\n` +
      `meshes ${meshes} · visible ${vis}\n` +
      `frustum-culled now ${frusNow}  <-- 카메라 돌리면 변함\n` +
      `distance-culled ${distC}\n` +
      `occlusion-culled ${occC}`;
  });

  return null;
}
