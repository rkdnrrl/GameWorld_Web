'use client';
/**
 * 전역 물(부력 부피) 레지스트리 — globalWind G 와 같은 모듈 싱글톤 패턴.
 *
 * 부력 부피는 World/Studio 가 각자 ref 로 들고 있어(프롭 스레딩) 캐릭터마다 마운트되는
 * FootstepDust 같은 곳에선 접근이 어렵다. WaterRipples(캔버스당 1개, 매 프레임 부력 ref 를
 * 이미 읽음)가 여기에 publish → 누구나 footstepWet() 으로 발밑이 물인지 질의.
 *
 * 멀티 동기화 불필요(각 클라 로컬 판정).
 */
import type { BuoyancyVolume } from './components';

let _vols: BuoyancyVolume[] = [];

/** WaterRipples 가 매 프레임 현재 부력 부피 배열을 publish. */
export function setWaterVolumes(v: BuoyancyVolume[] | undefined | null): void {
  _vols = v || [];
}

/** (x,y,z) 발 위치가 수면에 닿아 있는가(=젖은 걸음). 수면 약간 위~물바닥 사이. */
export function footstepWet(x: number, y: number, z: number): boolean {
  for (let i = 0; i < _vols.length; i++) {
    const bv = _vols[i];
    if (Math.abs(x - bv.cx) > bv.hx || Math.abs(z - bv.cz) > bv.hz) continue;
    const surf = bv.cy + bv.offset;
    if (y < bv.cy - bv.scaleY - 0.3) continue;   // 물바닥 아래(맵 밑) 제외
    if (y > surf + 0.15) continue;               // 수면보다 충분히 위(공중) 제외 → 닿지 않음
    return true;
  }
  return false;
}
