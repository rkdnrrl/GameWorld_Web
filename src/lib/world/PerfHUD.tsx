'use client';
/**
 * 성능/컬링 디버그 HUD — 컬링은 "잘 될수록 화면 변화가 없어서" 눈으로 작동 확인이 불가.
 * 대신 드로우콜·삼각형·컬링된 mesh 수를 띄워 숫자로 확인한다.
 *   - 카메라를 빈 쪽으로 돌리면 draw calls ↓  → 프러스텀 컬링 작동.
 *   - 거리 멀어지면 distance-culled ↑.
 *   - 오클루전 켜고 벽 뒤를 보면 occlusion-culled ↑.
 *
 * 켜는 법: 그래픽 설정(⚙) 패널의 "성능 통계" 토글 → show prop.
 * 꺼지면 DOM 요소 자체를 제거 → 프로덕션 무해. textContent 직접 갱신(~3Hz)이라 React 리렌더 0.
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

  useEffect(() => {
    if (!show || typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;top:8px;left:8px;z-index:2147483647;font:12px/1.5 ui-monospace,monospace;' +
      'color:#7CFC00;background:rgba(0,0,0,0.62);padding:6px 9px;border-radius:6px;' +
      'white-space:pre;pointer-events:none;text-shadow:0 1px 2px #000';
    document.body.appendChild(el);
    elRef.current = el;
    return () => { el.remove(); elRef.current = null; };
  }, [show]);

  useFrame((_, dt) => {
    const el = elRef.current;
    if (!el) return;
    acc.current += dt;
    frames.current++;
    if (acc.current < 0.3) return;   // ~3Hz 갱신
    const fps = frames.current / acc.current;
    acc.current = 0;
    frames.current = 0;

    let meshes = 0, vis = 0, distC = 0, occC = 0, frusOn = 0;
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh && !(m as unknown as THREE.SkinnedMesh).isSkinnedMesh) return;
      meshes++;
      if (o.visible) vis++;
      if (o.userData.alpCulled) distC++;
      if (o.userData.alpOccluded) occC++;
      if (m.frustumCulled) frusOn++;
    });
    const info = gl.info.render;
    el.textContent =
      `FPS ~${fps.toFixed(0)}\n` +
      `draw calls ${info.calls}\n` +
      `triangles  ${(info.triangles / 1000).toFixed(0)}k\n` +
      `meshes ${meshes} · visible ${vis}\n` +
      `distance-culled ${distC}\n` +
      `occlusion-culled ${occC}\n` +
      `frustum-enabled ${frusOn}`;
  });

  return null;
}
