import * as THREE from 'three';
/**
 * 전역 공유 바람 상태 — 한 씬에 바람은 하나(글로벌).
 *  - WindSway(폴리지 버텍스 셰이더)가 매 프레임 이 값들을 갱신 + 셰이더 유니폼으로 공유.
 *  - 캐릭터 스프링본(머리카락/옷자락)도 같은 값을 읽어 흔들림(humanoidCharacter).
 *
 * G.uWind* 는 셰이더에 그대로 주입되는 THREE 유니폼 객체이므로 **객체 참조를 유지**해야 한다(재할당 금지, .value 만 변경).
 */
export const G = {
  uWindTime:  { value: 0 },
  uWindDir:   { value: new THREE.Vector2(1, 0) },  // (cos, sin) = XZ 평면 방향
  uWindStr:   { value: 0 },
  uWindSpeed: { value: 1 },
  uWindTurb:  { value: 0.4 },
  /** 활성 '바람' 컴포넌트 수 — WindSway 가 마운트마다 ±1. 0 이면 바람 컴포넌트 없음
   *  → 터레인 식생(FoliageInstances)은 기본 미풍으로 폴백, >0 이면 위 strength/speed 따름. */
  active: 0,
};

export interface GlobalWind {
  dirX: number; dirZ: number;   // XZ 방향(단위)
  strength: number;
  speed: number;
  turbulence: number;
  time: number;                 // 공유 클럭(초)
}

/** 현재 전역 바람 값 스냅샷. strength<=0 이면 바람 없음. */
export function getGlobalWind(): GlobalWind {
  return {
    dirX: G.uWindDir.value.x,
    dirZ: G.uWindDir.value.y,
    strength: G.uWindStr.value,
    speed: G.uWindSpeed.value,
    turbulence: G.uWindTurb.value,
    time: G.uWindTime.value,
  };
}
