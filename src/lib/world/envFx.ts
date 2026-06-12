'use client';
/**
 * 씬 전역 환경 효과 상태 (모듈 싱글톤).
 *
 * 비 파티클이 켜지면 지면이 자동으로 젖고, 젖은 땅이 하늘·달을 반사한다.
 * scene.environment 를 건드리지 않으려고 React context 대신 모듈 전역으로 공유한다.
 *  - EnvFxUpdater(SkyEnv.tsx) 가 매 렌더 값을 채운다(태양 위치·밤 정도·비 여부).
 *  - TerrainMesh 가 매 프레임 읽어 머티리얼/셰이더 유니폼에 반영(전역 조명 영향 0).
 *
 * 한 시점에 캔버스는 하나만 마운트되므로 전역 공유로 충분(World/Studio 동시 X).
 */
import * as THREE from 'three';

export const envFx = {
  /** 비 파티클이 활성일 때 지면이 도달할 젖음 목표치(0~1). 비 없으면 0. */
  rainWet: 0,
  /** 밤 정도 0(낮)~1(밤). */
  night: 0,
  /** 젖은 땅에 비치는 하늘 반사색 — 천정/지평선. */
  skyTop: new THREE.Color('#3f7fd6'),
  skyHoriz: new THREE.Color('#dfeaf2'),
  /** 태양(낮)/달(밤) 방향 — 젖은 땅 위 하이라이트(글린트) 위치(단위벡터). */
  glintDir: new THREE.Vector3(0, 1, 0),
  glintColor: new THREE.Color('#fff4e0'),
  /** 글린트 날카로움(클수록 좁고 또렷). */
  glintSharp: 250,
  /** 로컬 플레이어 월드 위치 — 인터랙티브 풀(발 주변 휘어짐)용. */
  playerPos: new THREE.Vector3(),
  /** 풀 인터랙션 반경(m). 0 = 비활성. GrassPlayerProbe 가 설정. */
  playerBend: 0,
};

/** 태양 위치 + 밤 정도 + 비 여부 → envFx 갱신. SkyEnv.applyEnvFx 가 호출. */
export function setRain(raining: boolean) {
  envFx.rainWet = raining ? 0.9 : 0;
}
