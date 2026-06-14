'use client';
/**
 * Performance Manager — 매 N프레임 scene 을 traverse 해 다양한 최적화 적용.
 *
 * 1) Distance culling — cullDistance 너머 Mesh/SkinnedMesh 를 visible=false.
 *    - userData.alpNoCull=true 면 옵트아웃 (UI gizmo, debug helper 등).
 *    - 자체 토글한 mesh 만 자기가 풀어줌 (alpCulled flag) — 다른 코드 visible 토글과 충돌 X.
 *    - 히스테리시스 5% 마진 → 임계 근처 깜빡임 방지.
 *
 * 2) Frustum culling — three 내장 mesh.frustumCulled 플래그를 켬(시야 밖 안 그림).
 *    ⚠ visible=false 가 아니라 frustumCulled 인 이유: three 는 메인 카메라 프러스텀과
 *      그림자 라이트 프러스텀을 **각각** 판정 → 화면 밖이라도 그림자는 정상 캐스트.
 *      (visible=false 면 그림자 패스에서도 빠져 해 뒤 그림자가 사라지는 버그.)
 *    - 스킨드 메시(캐릭터)는 제외 — bind-pose 바운딩이라 애니메이션 시 팝아웃.
 *    - 바운딩 스피어 한 번 보정 + 15% 부풀림 → 바람 변위/원점 오차로 인한 팝아웃 방지.
 *
 * 3) Occlusion culling (실험적·기본 OFF) — 벽 등 큰 불투명 메시 뒤에 가려진 메시를
 *    레이캐스트로 판정해 visible=false. 다중 샘플(중심+좌우) + 디바운스로 보수적
 *    (조금이라도 보이면 그림). GPU occlusion query 대신 레이캐스트인 이유: EffectComposer
 *    렌더 경로를 가로채지 않아 안전(쿼리는 1프레임 지연·팝핑·렌더 깨짐 위험).
 *
 * 4) Shadow camera follow — directionalLight 의 shadow frustum 이 카메라 주변만 커버하도록
 *    light position/target 을 카메라 따라 이동. 방향(=light → target 벡터) 은 유지.
 *
 * 5) Light shadow distance cull — 그림자 캐스팅 라이트가 카메라에서 멀면 castShadow=false.
 */
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

export function PerfManager({ cullDistance, frustumCull = false, occlusionCull = false, followShadows = false, lightShadowCullDistance = 80 }: {
  cullDistance: number;
  /** three 내장 frustumCulled 재활성 (시야 밖 mesh 안 그림). 스킨드 메시 제외. 기본 꺼짐. */
  frustumCull?: boolean;
  /** 벽 뒤 가려진 mesh 를 레이캐스트로 판정해 안 그림 (실험적). 기본 꺼짐. */
  occlusionCull?: boolean;
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
  // frustum/occlusion 용 재사용 객체 (allocation 회피)
  const _frustum    = useRef(new THREE.Frustum()).current;
  const _projScreen = useRef(new THREE.Matrix4()).current;
  const _ray        = useRef(new THREE.Raycaster()).current;
  const _camPos     = useRef(new THREE.Vector3()).current;
  const _ctr        = useRef(new THREE.Vector3()).current;
  const _toC        = useRef(new THREE.Vector3()).current;
  const _perp       = useRef(new THREE.Vector3()).current;
  const _smp        = useRef(new THREE.Vector3()).current;
  const _occluders  = useRef<THREE.Mesh[]>([]).current;
  const _candidates = useRef<THREE.Mesh[]>([]).current;
  const occTick     = useRef(0);   // 오클루전은 cull-tick 3번에 1번만 (레이캐스트 비용 ↓)

  useFrame((state) => {
    // 탭이 백그라운드면 무거운 작업 skip — R3F 렌더는 브라우저가 자동 throttle 함.
    if (typeof document !== 'undefined' && document.hidden) return;
    const cam = state.camera.position;
    const v = tmp.current;

    // ── (4) Shadow camera follow ── 기본 꺼짐. 켤 경우 light view 의 local 축 으로 texel snap.
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

    // ── (1)(2)(3)(5) 거리/프러스텀/오클루전/그림자 culling 은 매 8프레임 — 비용 절감 ──
    frameRef.current = (frameRef.current + 1) & 7;
    if (frameRef.current !== 0) return;

    // 프러스텀 평면 갱신 (카메라 기준)
    if (frustumCull) {
      _projScreen.multiplyMatrices(state.camera.projectionMatrix, state.camera.matrixWorldInverse);
      _frustum.setFromProjectionMatrix(_projScreen);
    }

    const distOn = cullDistance > 0;
    const onCutoff  = distOn ? cullDistance * cullDistance : 0;
    const offCutoff = distOn ? (cullDistance * 1.05) ** 2 : 0;

    // 오클루전은 비싸므로 cull-tick 3번에 1번만 실제 레이캐스트 (≈매 24프레임)
    occTick.current++;
    const doOcc = occlusionCull && occTick.current % 3 === 0;

    // (5) light shadow cull 파라미터 — 같은 traverse 안에서 처리 (별도 순회 제거)
    const lightCullOn = lightShadowCullDistance > 0;
    const lightCap2 = lightCullOn ? lightShadowCullDistance * lightShadowCullDistance : 0;

    _occluders.length = 0;
    _candidates.length = 0;

    state.scene.traverse((obj) => {
      // ── (5) Light shadow cull — point/spot 라이트 (mesh 분기 전에 처리하고 빠짐) ──
      if (lightCullOn) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const l = obj as any;
        if (l.isPointLight || l.isSpotLight) {
          if (l.userData.alpOrigCastShadow === undefined) l.userData.alpOrigCastShadow = l.castShadow === true;
          if (l.userData.alpOrigCastShadow) {
            obj.getWorldPosition(v);
            const shouldCast = v.distanceToSquared(cam) <= lightCap2;
            if (l.castShadow !== shouldCast) l.castShadow = shouldCast;
          }
          return;
        }
      }

      const m = obj as THREE.Mesh;
      const skinned = (m as unknown as THREE.SkinnedMesh).isSkinnedMesh === true;
      if (!m.isMesh && !skinned) return;
      if (obj.userData.alpNoCull) return;

      // ── (2) Frustum culling: three 내장 플래그 (스킨드 제외) ──
      if (!skinned) {
        if (frustumCull && !obj.userData.alpBoundsFixed && m.geometry) {
          const g = m.geometry as THREE.BufferGeometry;
          if (!g.boundingSphere) g.computeBoundingSphere();
          if (g.boundingSphere) g.boundingSphere.radius *= 1.15;   // 바람 변위/원점 오차 마진
          obj.userData.alpBoundsFixed = true;
        }
        if (m.frustumCulled !== frustumCull) m.frustumCulled = frustumCull;
      }

      // ── (1) Distance culling ──
      obj.getWorldPosition(v);
      let d2 = v.distanceToSquared(cam);
      if (distOn) {
        // 큰 메시(터레인 등)는 중심이 cullDistance 너머라도 가까운 가장자리가 시야 안일 수 있음.
        // 중심거리에서 월드 바운딩 반경을 빼 '표면까지 거리'로 판정 → 큰 지형이 통째로 사라지는 것 방지.
        const g = m.geometry as THREE.BufferGeometry;
        if (g) {
          if (!g.boundingSphere) g.computeBoundingSphere();
          const bs = g.boundingSphere;
          if (bs && bs.radius > 0) {
            const sX = _toC.setFromMatrixColumn(m.matrixWorld, 0).length();
            const sY = _toC.setFromMatrixColumn(m.matrixWorld, 1).length();
            const sZ = _toC.setFromMatrixColumn(m.matrixWorld, 2).length();
            const near = Math.max(0, Math.sqrt(d2) - bs.radius * Math.max(sX, sY, sZ));
            d2 = near * near;
          }
        }
        const culled = obj.userData.alpCulled === true;
        if (!culled && d2 > offCutoff) {
          obj.userData.alpCulled = true;
          obj.userData.alpVisBackup = obj.visible;
          obj.visible = false;
        } else if (culled && d2 <= onCutoff) {
          obj.userData.alpCulled = false;
          obj.visible = obj.userData.alpVisBackup !== false;
        }
      }

      // ── (3) Occlusion: 수집 (off 면 이전에 가린 것 복구) ──
      if (!occlusionCull) {
        if (obj.userData.alpOccluded) {
          obj.userData.alpOccluded = false;
          obj.userData.alpOccFrames = 0;
          if (!obj.userData.alpCulled) obj.visible = obj.userData.alpOccVisBackup !== false;
        }
        return;
      }
      if (!doOcc) return;                              // 이 틱은 오클루전 스킵(이전 상태 유지)
      if (skinned || obj.userData.alpCulled) return;   // 캐릭터·거리컬된 건 오클루전 제외
      const g = m.geometry as THREE.BufferGeometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      if (!g.boundingSphere) return;
      // occluder 후보: 불투명한 메시(투명 잎 등은 가림막 아님)
      const mat = m.material;
      const single = Array.isArray(mat) ? mat[0] : mat;
      if (single && (single as THREE.Material).transparent !== true) _occluders.push(m);
      _candidates.push(m);
    });

    // ── (3) Occlusion pass: 후보를 occluder 들에 레이캐스트 ──
    if (doOcc && _candidates.length) {
      _camPos.copy(state.camera.position);
      for (const m of _candidates) {
        const bs = (m.geometry as THREE.BufferGeometry).boundingSphere;
        if (!bs) continue;
        // 월드 중심 + 월드 반경(최대 스케일 보정)
        _ctr.copy(bs.center).applyMatrix4(m.matrixWorld);
        const sx = _toC.setFromMatrixColumn(m.matrixWorld, 0).length();
        const sy = _toC.setFromMatrixColumn(m.matrixWorld, 1).length();
        const sz = _toC.setFromMatrixColumn(m.matrixWorld, 2).length();
        const wr = bs.radius * Math.max(sx, sy, sz);
        _toC.subVectors(_ctr, _camPos);
        const dist = _toC.length();
        // far 컷오프 = 물체 중심보다 한 반경(×1.2) 이상 앞에 있는 가림막만 인정 →
        //   자기 표면·같은 에셋 옆 메시(나무 줄기↔잎)는 자동 제외, 명확히 분리된 벽만 가림.
        const farCut = dist - wr * 1.2;
        // 너무 가깝거나·카메라가 안에 있거나·가림막 들어갈 공간 없으면 → 보이는 것으로 간주
        let visible = dist < 1.5 || wr >= dist || farCut <= 0.3;
        if (!visible) {
          _toC.multiplyScalar(1 / dist);                                  // 정규화 방향
          // 방향에 수직인 좌우 축 (중심 외 2점 샘플 → 부분 가림 시 오판 방지)
          _perp.set(0, 1, 0).cross(_toC);
          if (_perp.lengthSq() < 1e-4) _perp.set(1, 0, 0);
          _perp.normalize().multiplyScalar(wr * 0.6);
          for (let s = 0; s < 3 && !visible; s++) {
            _smp.copy(_ctr);
            if (s === 1) _smp.add(_perp);
            else if (s === 2) _smp.sub(_perp);
            const segLen = _camPos.distanceTo(_smp);
            _ray.set(_camPos, _toC.copy(_smp).sub(_camPos).multiplyScalar(1 / segLen));
            _ray.near = 0.1;
            _ray.far  = farCut;          // 물체보다 충분히 앞 — 자기/같은에셋 제외
            const hits = _ray.intersectObjects(_occluders, false);
            if (hits.length === 0) visible = true;   // 한 샘플이라도 안 가리면 그림
          }
        }
        // 디바운스: 2틱 연속 가려야 끔, 보이면 즉시 켬
        if (!visible) {
          const f = ((m.userData.alpOccFrames as number) | 0) + 1;
          m.userData.alpOccFrames = f;
          if (f >= 2 && !m.userData.alpOccluded) {
            m.userData.alpOccluded = true;
            m.userData.alpOccVisBackup = m.visible;
            m.visible = false;
          }
        } else {
          m.userData.alpOccFrames = 0;
          if (m.userData.alpOccluded) {
            m.userData.alpOccluded = false;
            if (!m.userData.alpCulled) m.visible = m.userData.alpOccVisBackup !== false;
          }
        }
      }
    }

    // (5) Light shadow cull 은 위 메인 traverse 안에서 함께 처리됨 (별도 순회 제거).
  });

  return null;
}
