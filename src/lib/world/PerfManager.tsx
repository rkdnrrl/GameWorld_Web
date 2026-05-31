'use client';
/**
 * Performance Manager — 매 N프레임 scene 을 traverse 해 다양한 최적화 적용.
 *
 * 1) Distance culling — cullDistance 너머 Mesh/SkinnedMesh 를 visible=false.
 *    - userData.alpNoCull=true 면 옵트아웃 (UI gizmo, debug helper 등).
 *    - 자체 토글한 mesh 만 자기가 풀어줌 (alpCulled flag) — 다른 코드 visible 토글과 충돌 X.
 *    - 히스테리시스 5% 마진 → 임계 근처 깜빡임 방지.
 *
 * 2) Shadow camera follow — directionalLight 의 shadow frustum 이 카메라 주변만 커버하도록
 *    light position/target 을 카메라 따라 이동. 방향(=light → target 벡터) 은 유지.
 *    같은 shadow map 해상도로 그림자 픽셀 밀도 ↑ → 더 선명. 또는 같은 품질에 더 작은 맵 사용 가능.
 *
 * 3) Light shadow distance cull — 그림자 캐스팅 라이트가 카메라에서 멀면 castShadow=false.
 *    수많은 점광/스폿 그림자가 한 번에 그려지지 않게.
 */
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

export function PerfManager({ cullDistance, followShadows = false, lightShadowCullDistance = 80 }: {
  cullDistance: number;
  /** directionalLight 의 shadow frustum 을 카메라 따라 이동. 기본 꺼짐 — 텍셀 정렬 어려워 대각 이동 시
   *  그림자 가장자리가 떨림 (shadow shimmering). 큰 맵엔 ALP 의 기본 shadow bounds (-60..60) 로 충분. */
  followShadows?: boolean;
  /** point/spot 라이트가 카메라에서 이 거리 너머면 castShadow=false (그림자 비용 ↓). */
  lightShadowCullDistance?: number;
}) {
  const frameRef = useRef(0);
  const tmp = useRef(new THREE.Vector3());
  // shadow follow 의 light view 벡터 재사용 (allocation 회피)
  const _tmpFwd   = useRef(new THREE.Vector3()).current;
  const _tmpAxis  = useRef(new THREE.Vector3()).current;
  const _tmpRight = useRef(new THREE.Vector3()).current;
  const _tmpUp    = useRef(new THREE.Vector3()).current;

  useFrame((state) => {
    // 탭이 백그라운드면 무거운 작업 skip — R3F 렌더는 브라우저가 자동 throttle 함.
    if (typeof document !== 'undefined' && document.hidden) return;
    const cam = state.camera.position;
    const v = tmp.current;

    // ── (2) Shadow camera follow ── 기본 꺼짐. 켤 경우 light view 의 local 축 으로 texel snap.
    if (followShadows) {
      state.scene.traverse((obj) => {
        const l = obj as THREE.DirectionalLight;
        if (!l.isDirectionalLight || !l.castShadow) return;
        if (!l.userData.alpFollowInit) {
          l.userData.alpFollowInit = true;
          l.userData.alpFollowOffset = l.position.clone();
          if (l.target && !l.target.parent) state.scene.add(l.target);
        }
        const offset = l.userData.alpFollowOffset as THREE.Vector3;
        // ── light view local 축 기준 texel snap ──
        // world X/Z 가 아니라 light view 의 x/y 축으로 round (light 방향이 비스듬해도 정확).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sc: any = l.shadow?.camera;
        const mapSize = l.shadow?.mapSize?.x || 1024;
        // 1) 원래 follow 위치 (snap 전)
        const tx = cam.x, ty = cam.y, tz = cam.z;
        // 2) light 의 view rotation (lookAt 기반)
        const fwd = _tmpFwd; fwd.set(-offset.x, -offset.y, -offset.z).normalize();   // light → target 방향
        if (fwd.lengthSq() < 1e-6) fwd.set(0, -1, 0);
        // light up (대략 Y, fwd 와 평행 시 다른 축 선택)
        const upGuess = Math.abs(fwd.y) > 0.99 ? _tmpAxis.set(0, 0, 1) : _tmpAxis.set(0, 1, 0);
        const right = _tmpRight.copy(upGuess).cross(fwd).normalize();
        const up    = _tmpUp.copy(fwd).cross(right).normalize();
        if (sc && typeof sc.right === 'number' && typeof sc.left === 'number') {
          const worldPerTexel = (sc.right - sc.left) / mapSize;
          if (worldPerTexel > 0) {
            // target 위치를 light view 의 right/up 축으로 투영해 round
            const px = right.x * tx + right.y * ty + right.z * tz;
            const py = up.x    * tx + up.y    * ty + up.z    * tz;
            const fz = fwd.x   * tx + fwd.y   * ty + fwd.z   * tz;
            const sx = Math.round(px / worldPerTexel) * worldPerTexel;
            const sy = Math.round(py / worldPerTexel) * worldPerTexel;
            // 다시 world 로
            const wx = right.x * sx + up.x * sy + fwd.x * fz;
            const wy = right.y * sx + up.y * sy + fwd.y * fz;
            const wz = right.z * sx + up.z * sy + fwd.z * fz;
            l.position.set(wx + offset.x, wy + offset.y, wz + offset.z);
            if (l.target) {
              l.target.position.set(wx, wy, wz);
              l.target.updateMatrixWorld();
            }
            return;
          }
        }
        // shadow camera 없으면 그냥 따라감 (fallback)
        l.position.set(tx + offset.x, ty + offset.y, tz + offset.z);
        if (l.target) { l.target.position.set(tx, ty, tz); l.target.updateMatrixWorld(); }
      });
    }

    // ── (1) (3) 거리 culling 은 매 8프레임 — 비용 절감 ──
    frameRef.current = (frameRef.current + 1) & 7;
    if (frameRef.current !== 0) return;

    // distance culling
    if (cullDistance > 0) {
      const onCutoff  = cullDistance * cullDistance;
      const offCutoff = (cullDistance * 1.05) ** 2;
      state.scene.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (!m.isMesh && !(m as unknown as THREE.SkinnedMesh).isSkinnedMesh) return;
        if (obj.userData.alpNoCull) return;
        obj.getWorldPosition(v);
        const d2 = v.distanceToSquared(cam);
        const culled = obj.userData.alpCulled === true;
        if (!culled && d2 > offCutoff) {
          obj.userData.alpCulled = true;
          obj.userData.alpVisBackup = obj.visible;
          obj.visible = false;
        } else if (culled && d2 <= onCutoff) {
          obj.userData.alpCulled = false;
          obj.visible = obj.userData.alpVisBackup !== false;
        }
      });
    }

    // light shadow cull — pointLight / spotLight 만 (directionalLight 는 항상 그림자)
    if (lightShadowCullDistance > 0) {
      const cap2 = lightShadowCullDistance * lightShadowCullDistance;
      state.scene.traverse((obj) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const l = obj as any;
        if (!(l.isPointLight || l.isSpotLight)) return;
        // 원래 castShadow 값 백업 후 거리에 따라 토글
        if (l.userData.alpOrigCastShadow === undefined) {
          l.userData.alpOrigCastShadow = l.castShadow === true;
        }
        if (!l.userData.alpOrigCastShadow) return;  // 원래 그림자 안 캐스트면 건드림 X
        l.getWorldPosition(v);
        const d2 = v.distanceToSquared(cam);
        const shouldCast = d2 <= cap2;
        if (l.castShadow !== shouldCast) l.castShadow = shouldCast;
      });
    }
  });

  return null;
}
