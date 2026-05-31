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

export function PerfManager({ cullDistance, followShadows = true, lightShadowCullDistance = 80 }: {
  cullDistance: number;
  /** directionalLight 의 shadow frustum 을 카메라 따라 이동. 기본 켬. */
  followShadows?: boolean;
  /** point/spot 라이트가 카메라에서 이 거리 너머면 castShadow=false (그림자 비용 ↓). */
  lightShadowCullDistance?: number;
}) {
  const frameRef = useRef(0);
  const tmp = useRef(new THREE.Vector3());

  useFrame((state) => {
    // 탭이 백그라운드면 무거운 작업 skip — R3F 렌더는 브라우저가 자동 throttle 함.
    if (typeof document !== 'undefined' && document.hidden) return;
    const cam = state.camera.position;
    const v = tmp.current;

    // ── (2) Shadow camera follow — 매 프레임 (light 위치는 카메라 빠르게 따라가야 함) ──
    // 카메라 위치를 그대로 따라가면 텍셀이 매 프레임 다른 픽셀에 샘플링되어 그림자 가장자리가 "기어다님"
    // (shadow shimmering / crawling). → 월드 좌표를 텍셀 크기 단위로 round 해 텍셀 정렬 보장.
    if (followShadows) {
      state.scene.traverse((obj) => {
        const l = obj as THREE.DirectionalLight;
        if (!l.isDirectionalLight || !l.castShadow) return;
        // 첫 호출 시 원본 offset 기록 + target scene 에 등록
        if (!l.userData.alpFollowInit) {
          l.userData.alpFollowInit = true;
          l.userData.alpFollowOffset = l.position.clone();
          if (l.target && !l.target.parent) state.scene.add(l.target);
        }
        const offset = l.userData.alpFollowOffset as THREE.Vector3;

        // ── Texel snap ──
        // shadow.camera 는 OrthographicCamera. (right-left)/mapSize = 텍셀당 월드 단위.
        // light/target 좌표를 그 단위로 round → 카메라가 미세 이동해도 그림자 텍셀이 같은 픽셀에 머무름.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sc: any = l.shadow?.camera;
        const mapSize = l.shadow?.mapSize?.x || 1024;
        let snapX = cam.x, snapZ = cam.z;
        if (sc && typeof sc.right === 'number' && typeof sc.left === 'number') {
          const worldPerTexel = (sc.right - sc.left) / mapSize;
          if (worldPerTexel > 0) {
            snapX = Math.round(cam.x / worldPerTexel) * worldPerTexel;
            snapZ = Math.round(cam.z / worldPerTexel) * worldPerTexel;
          }
        }
        // Y 는 texel snap 안 해도 무방 (수평 이동이 주). round 하면 더 안정.
        const snapY = cam.y;
        l.position.set(snapX + offset.x, snapY + offset.y, snapZ + offset.z);
        if (l.target) {
          l.target.position.set(snapX, snapY, snapZ);
          l.target.updateMatrixWorld();
        }
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
